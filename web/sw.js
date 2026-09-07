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

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
      const file = await fromStorage(path);
      const ext = path.split(".").pop().toLowerCase();
      return new Response(file, {
        headers: {
          "Content-Type": TYPES[ext] || "application/octet-stream",
          "Content-Length": String(file.size),
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // Absent du stockage : le moteur sait retomber sur ses valeurs de repli.
      return new Response(`${path} absent du stockage local`, { status: 404 });
    }
  })());
});
