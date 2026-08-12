// places.json の座標を OpenStreetMap の実データと突き合わせて、ずれを一覧にする。
//
//   node scripts/check-coords.mjs              全件チェック
//   node scripts/check-coords.mjs takao mitake  指定したidだけチェック
//
// 書き換えはしない。出た差分を見て、納得できるものだけ手で直すこと。
// OSM側が正しいとは限らない（バス停・看板・同名の別施設を拾うことがある）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/data/places.json"
);
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const UA = "higurashi-map/0.1 (spot coordinate check)";
const DLAT = 0.035; // 探す範囲（南北 約4km）
const DLNG = 0.043; // 　　　　（東西 約4km）
const BATCH = 5; // 1リクエストにまとめる件数。増やすとタイムアウトしやすい

const all = JSON.parse(fs.readFileSync(FILE, "utf8"));
const only = process.argv.slice(2);
const places = only.length ? all.filter((p) => only.includes(p.id)) : all;
if (!places.length) {
  console.error("該当するidがありません。");
  process.exit(1);
}

// 表示名から検索語を作る。括弧の中と「周辺」などの補足は落とす
function keys(name) {
  const inner = [...name.matchAll(/（([^）]+)）/g)].map((m) => m[1]);
  const base = name.replace(/（[^）]*）/g, "").trim();
  return [
    ...new Set(
      [...base.split("・"), ...inner.flatMap((s) => s.split("・"))]
        .map((s) => s.replace(/(周辺|ふもと|の平地林|緑道|起点|畔)$/g, "").trim())
        .filter((s) => s.length >= 2)
    ),
  ];
}

const esc = (s) => s.replace(/["\\]/g, "\\$&");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function distM(a, b) {
  const R = 6371000;
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let ep = 0;
async function post(ql) {
  let last = "";
  for (let i = 0; i < 5; i++) {
    const url = ENDPOINTS[ep++ % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          // この2つが無いと 406 で弾かれる
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
        },
        body: "data=" + encodeURIComponent(ql),
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) return res.json();
      last = "HTTP " + res.status;
      // 400はこちらの検索条件の問題なので、別のサーバーに再試行しても直らない
      if (res.status === 400) {
        last = "HTTP 400（検索条件を受け付けませんでした）";
        break;
      }
    } catch (e) {
      last = e.name === "TimeoutError" ? "timeout" : e.message;
    }
    await sleep(3000 * (i + 1));
  }
  throw new Error(last);
}

// 行き先として妥当な地物ほど高く、看板やバス停ほど低く
const NG_NAME =
  /(駐車場|入口|入り口|バス停|停留所|駅$|交差点|縦走路|コース|案内|トイレ|売店|ゲート|バーベキュー|キャンプ場|レンタ|ゴルフ|ホテル|旅館)/;

function rank(el, key, d) {
  const t = el.tags;
  let s = 0;
  if (el.name === key) s += 120;
  else if (el.name.startsWith(key)) s += 70;
  else s += 40;
  // 面を持つ地物は、点で置かれた看板より信用できる
  if (el.type === "way" || el.type === "relation") s += 50;
  if (["park", "garden", "nature_reserve"].includes(t.leisure)) s += 45;
  if (["national_park", "protected_area"].includes(t.boundary)) s += 40;
  if (["wood", "water", "peak", "valley", "cave_entrance", "shingle"].includes(t.natural)) s += 40;
  if (t.waterway === "waterfall") s += 40;
  if (["forest", "cemetery", "recreation_ground"].includes(t.landuse)) s += 35;
  if (t.mountain_pass === "yes") s += 35;
  if (["zoo", "attraction", "viewpoint"].includes(t.tourism)) s += 30;
  if (t.amenity === "place_of_worship" || t.historic) s += 30;
  if (t.place === "locality") s += 15;
  if (NG_NAME.test(el.name)) s -= 150;
  if (t.tourism === "information") s -= 120;
  if (t.highway || t.railway || t.public_transport || t.aeroway) s -= 150;
  if (t.shop || t.office) s -= 120;
  if (t.amenity && t.amenity !== "place_of_worship") s -= 100;
  if (t.waterway && t.waterway !== "waterfall") s -= 100;
  if (t.route || t.type === "route") s -= 120;
  return s - d / 400;
}

const rows = [];
for (let i = 0; i < places.length; i += BATCH) {
  const batch = places.slice(i, i + BATCH);
  const parts = [];
  for (const p of batch) {
    const bbox = `${(p.lat - DLAT).toFixed(4)},${(p.lng - DLNG).toFixed(4)},${(
      p.lat + DLAT
    ).toFixed(4)},${(p.lng + DLNG).toFixed(4)}`;
    for (const k of keys(p.name)) parts.push(`nwr["name"~"${esc(k)}"](${bbox});`);
  }
  let els = [];
  let err = "";
  try {
    const j = await post(`[out:json][timeout:90];(${parts.join("")});out center tags;`);
    els = (j?.elements ?? [])
      .map((e) => {
        const c = e.center ?? { lat: e.lat, lon: e.lon };
        if (c.lat == null || c.lon == null || !e.tags?.name) return null;
        return { type: e.type, name: e.tags.name, lat: c.lat, lng: c.lon, tags: e.tags };
      })
      .filter(Boolean);
  } catch (e) {
    err = e.message;
  }
  process.stderr.write(
    `[${Math.floor(i / BATCH) + 1}/${Math.ceil(places.length / BATCH)}] ${err || els.length + "件"}\n`
  );
  for (const p of batch) {
    if (err) {
      rows.push({ p, best: null, note: err });
      continue;
    }
    const ks = keys(p.name);
    const cands = [];
    for (const el of els) {
      const d = distM(p, el);
      if (d > 4500) continue;
      for (const k of ks) {
        if (!el.name.includes(k)) continue;
        cands.push({ el, d, score: rank(el, k, d) });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const best = cands.find((c) => c.score > 0) ?? null;
    rows.push({ p, best, note: best ? "" : "候補なし" });
  }
  if (i + BATCH < places.length) await sleep(2000);
}

const hit = rows.filter((r) => r.best);
console.log(`\n${rows.length} 件中 ${hit.length} 件で候補が見つかりました。`);
console.log("ずれの大きい順（100m未満は省略）:\n");
for (const r of hit.sort((a, b) => b.best.d - a.best.d)) {
  if (r.best.d < 100) continue;
  const t = r.best.el.tags;
  const kind =
    t.leisure || t.natural || t.landuse || t.waterway || t.tourism ||
    t.historic || t.amenity || t.place || t.boundary || "?";
  console.log(
    `${String(Math.round(r.best.d)).padStart(4)}m ${r.p.name}（${r.p.city}）`
  );
  console.log(
    `      OSM: ${r.best.el.type}「${r.best.el.name}」${kind}  → "lat": ${r.best.el.lat.toFixed(5)}, "lng": ${r.best.el.lng.toFixed(5)}`
  );
}
const miss = rows.filter((r) => !r.best);
if (miss.length) {
  console.log("\n見つからなかったもの（手入力のまま）:");
  for (const r of miss) console.log(`  ${r.p.name}（${r.p.city}） ${r.note}`);
}
console.log(
  "\n※ OSM側が正しいとは限りません。同名の別施設・看板・バス停を拾うことがあります。"
);
console.log("　 地図で確かめてから places.json を手で直してください。");
