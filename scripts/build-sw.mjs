import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat();
}
const files = (await walk(".next/static"))
  .filter((p) => /\.(js|css|woff2)$/.test(p))
  .map((p) => p.replace(".next", "/_next"))
  .sort();
const version = createHash("sha256")
  .update(files.join("\n"))
  .update(await readFile("public/pcm-capture.js"))
  .digest("hex")
  .slice(0, 12);
const shell = [
  "/",
  "/icon.svg",
  "/pcm-capture.js",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  ...files,
];
await writeFile(
  "public/sw.js",
  `/* Generated app shell only. Never cache API responses or records. */
const CACHE='dara-shell-${version}';
const ASSETS=${JSON.stringify(shell)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('dara-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(req.mode==='navigate'&&url.pathname==='/'){
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),3000);
   event.respondWith(fetch(req,{signal:controller.signal}).then(response=>{if(response.ok&&response.headers.get('content-type')?.includes('text/html')){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('/',copy)));}return response;}).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match('/')||Response.error();}).finally(()=>clearTimeout(timeout)));return;
 }
 // Root non-navigation requests may be Next RSC payloads: never substitute HTML.
 if(url.pathname!=='/'&&ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(req)));
});
`,
);
console.log(`Offline shell: ${files.length} assets, version ${version}`);
