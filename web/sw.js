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

// Cache memoire du Service Worker.
//
// 27 URL etaient demandees jusqu'a cinq fois — un glTF et ses freres partagent
// leurs textures, et chacun redemande les siennes (docs/27-poids.md). Deux
// mesures, l'une pour chaque etage :
//
//   - `Cache-Control` : une reponse fabriquee par un Service Worker n'entre
//     jamais dans le cache HTTP du navigateur, mais le cache MEMOIRE du moteur
//     de rendu, lui, honore l'en-tete. `no-store` lui interdisait justement de
//     dedupliquer ; une duree courte suffit a le laisser faire, et reste bien
//     en deca du temps d'une extraction, donc sans risque de servir du perime ;
//   - le cache ci-dessous evite de rouvrir le fichier dans l'OPFS a chaque
//     demande qui arrive quand meme jusqu'ici.
//
// La page previent d'une nouvelle extraction (message « vider-cache ») ; sans
// cela, un fichier reecrit resterait masque par sa version precedente.
const MAX_AGE = 300;
const MEM_ENTRY_MAX = 4 << 20;    // 4 Mo : au-dela, l'octroi de memoire coute
const MEM_TOTAL_MAX = 32 << 20;
const memory = new Map();         // chemin -> { file, etag }
let memoryBytes = 0;

function remember(path, file, etag) {
  if (file.size > MEM_ENTRY_MAX) return;
  while (memoryBytes + file.size > MEM_TOTAL_MAX && memory.size) {
    // le plus ancien insere part le premier : une Map garde l'ordre d'insertion
    const [oldest, entry] = memory.entries().next().value;
    memory.delete(oldest);
    memoryBytes -= entry.file.size;
  }
  memory.set(path, { file, etag });
  memoryBytes += file.size;
}

function forget() { memory.clear(); memoryBytes = 0; }

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "vider-cache") forget();
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
    try {
      const hit = memory.get(path);
      const file = hit ? hit.file : await fromStorage(path);
      // Taille et date de derniere ecriture : deux fichiers extraits differents
      // ne peuvent pas s'accorder sur les deux.
      const etag = hit ? hit.etag : `"${file.size}-${file.lastModified}"`;
      if (!hit) remember(path, file, etag);

      const ext = path.split(".").pop().toLowerCase();
      const headers = {
        "Content-Type": TYPES[ext] || "application/octet-stream",
        "Cache-Control": `public, max-age=${MAX_AGE}`,
        "ETag": etag,
      };
      if (event.request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(file, {
        headers: { ...headers, "Content-Length": String(file.size) },
      });
    } catch {
      // Absent du stockage : le moteur sait retomber sur ses valeurs de repli.
      return new Response(`${path} absent du stockage local`, { status: 404 });
    }
  })());
});
