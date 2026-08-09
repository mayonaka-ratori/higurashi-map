// デザイン参照実装（docs/design-handoff-v2/design/）をローカルサーバーで開けるようにする。
// 使い方: npm run design
//
// HTMLを file:// で直接開くと、中の fetch("data/places.json") と
// import("./higurashi-core.js") がブラウザに止められて画面が真っ白になる。
// 依存を足したくないので node:http だけで static 配信している。
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, sep } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docRoot = join(root, "docs", "design-handoff-v2", "design");
const port = Number(process.env.PORT) || 4321;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const target = normalize(join(docRoot, pathname === "/" ? "/index.html" : pathname));

  // docRoot の外へ出る要求は断る
  if (target !== docRoot && !target.startsWith(docRoot + sep)) {
    res.writeHead(403).end("403");
    return;
  }

  let stat;
  try {
    stat = statSync(target);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("見つからない");
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("見つからない");
    return;
  }

  res.writeHead(200, {
    "content-type": TYPES[extname(target)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(target).pipe(res);
});

server.listen(port, () => {
  console.log("デザイン参照実装（案4「今夜の答え」）を配信中。ブラウザで開くこと:");
  console.log(`  PC      http://localhost:${port}/plan4-answer.dc.html`);
  console.log(`  スマホ   http://localhost:${port}/plan4-answer-sp.dc.html`);
  console.log("止めるときは Ctrl+C。");
});
