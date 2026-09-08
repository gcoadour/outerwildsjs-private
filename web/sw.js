// Sert les fichiers produits par le pipeline depuis le stockage local.
//
// Le moteur charge ses donnees par des chemins relatifs ("data/gltf/x.gltf"),
// et un glTF renvoie lui-meme vers son .bin et ses textures par des chemins
// relatifs. Des URL blob casseraient cette resolution. Intercepter les requetes
// laisse tout le code du moteur inchange : il croit lire des fichiers servis.

const ROOT = "outerwilds";

const TYPES = {
  json: "application/json", gltf: "model/gltf+json", bin: "application/octet-stream",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg",
  ttf: "font/ttf", otf: "font/otf", shader: "text/plain", txt: "text/plain",
};

// Duree de cache annoncee pour `data/`. Ces fichiers sont IMMUABLES : ils
// viennent d'etre reconstruits depuis la copie du jeu de la personne qui
// visite, et rien ne les modifie ensuite. Le pipeline efface tout et recommence
// quand on rejoue l'extraction, ce qui vide aussi ce cache (voir `purge`).
const MAX_AGE = 86400;
// Petits fichiers gardes en memoire dans le worker. 27 URL etaient demandees
// jusqu'a cinq fois — des textures partagees par plusieurs materiaux — et
// chaque demande relisait l'OPFS. Voir docs/27-poids.md.
const MEMORY_LIMIT = 8 << 20;
const MEMORY_MAX_FILE = 512 << 10;

const memory = new Map();   // chemin -> ArrayBuffer
let memoryBytes = 0;

function remember(path, buf) {
  if (buf.byteLength > MEMORY_MAX_FILE) return;
  // file d'attente simple : la plus ancienne entree part la premiere
  while (memoryBytes + buf.byteLength > MEMORY_LIMIT && memory.size) {
    const [k, v] = memory.entries().next().value;
    memory.delete(k);
    memoryBytes -= v.byteLength;
  }
  memory.set(path, buf);
  memoryBytes += buf.byteLength;
}

function purge() {
  memory.clear();
  memoryBytes = 0;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// Le pipeline previent quand il repart de zero : le cache memoire porterait
// sinon les fichiers de l'extraction precedente.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "purge") purge();
});

async function fromStorage(path) {
  const base = await navigator.storage.getDirectory();
  const root = await base.getDirectoryHandle(ROOT);
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop();
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p);
  const handle = await dir.getFileHandle(name);
  return handle.getFile();
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(`${scope}data/`)) return;
  const path = decodeURIComponent(url.pathname.slice(scope.length));

  event.respondWith((async () => {
    const ext = path.split(".").pop().toLowerCase();
    const headers = (length) => ({
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Length": String(length),
      // Immuable : le navigateur peut la garder sans jamais revenir demander.
      "Cache-Control": `public, max-age=${MAX_AGE}, immutable`,
    });
    const cached = memory.get(path);
    if (cached) return new Response(cached, { headers: headers(cached.byteLength) });
    try {
      const file = await fromStorage(path);
      if (file.size <= MEMORY_MAX_FILE) {
        const buf = await file.arrayBuffer();
        remember(path, buf);
        return new Response(buf, { headers: headers(buf.byteLength) });
      }
      return new Response(file, { headers: headers(file.size) });
    } catch {
      // Absent du stockage : le moteur sait retomber sur ses valeurs de repli.
      return new Response(`${path} absent du stockage local`, { status: 404 });
    }
  })());
});
