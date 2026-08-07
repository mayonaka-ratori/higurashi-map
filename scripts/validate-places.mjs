// places.json の検査。書式・座標範囲・重複をチェックする。
// 使い方: npm run validate:places
// 終了コード: 0=問題なし, 1=エラーあり
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const path = join(root, "src", "data", "places.json");

const errors = [];
const warnings = [];

let places;
try {
  places = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`places.json が読めない/JSONとして壊れている: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(places)) {
  console.error("places.json は配列である必要がある");
  process.exit(1);
}

// 関東近辺として妥当な範囲（大きく外れた打ち間違いを検出する）
const LAT_MIN = 34.5, LAT_MAX = 37.5, LNG_MIN = 138.0, LNG_MAX = 141.0;

const ids = new Map();
places.forEach((p, i) => {
  const label = p?.name ? `「${p.name}」` : `${i + 1}番目の項目`;
  for (const key of ["id", "name", "pref", "city", "lat", "lng"]) {
    if (p?.[key] === undefined || p?.[key] === null || p?.[key] === "") {
      errors.push(`${label}: ${key} がない`);
    }
  }
  if (typeof p?.id === "string" && !/^[a-z0-9-]+$/.test(p.id)) {
    errors.push(`${label}: id "${p.id}" は英小文字・数字・ハイフンのみにする`);
  }
  if (typeof p?.id === "string") {
    if (ids.has(p.id)) errors.push(`id "${p.id}" が重複している（${ids.get(p.id)}と${label}）`);
    else ids.set(p.id, label);
  }
  if (typeof p?.lat === "number" && (p.lat < LAT_MIN || p.lat > LAT_MAX)) {
    errors.push(`${label}: lat ${p.lat} が関東の範囲外（${LAT_MIN}〜${LAT_MAX}）。打ち間違いの疑い`);
  }
  if (typeof p?.lng === "number" && (p.lng < LNG_MIN || p.lng > LNG_MAX)) {
    errors.push(`${label}: lng ${p.lng} が関東の範囲外（${LNG_MIN}〜${LNG_MAX}）。打ち間違いの疑い`);
  }
});

// 200m以内の近接ペアは重複登録の疑い
const R = 6371000;
const distM = (a, b) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
for (let i = 0; i < places.length; i++) {
  for (let j = i + 1; j < places.length; j++) {
    const a = places[i], b = places[j];
    if (typeof a?.lat !== "number" || typeof b?.lat !== "number") continue;
    const d = distM(a, b);
    if (d < 200) {
      warnings.push(`「${a.name}」と「${b.name}」が${Math.round(d)}mしか離れていない。重複登録では？`);
    }
  }
}

if (errors.length === 0 && warnings.length === 0) {
  console.log(`places.json OK（${places.length}箇所）`);
  process.exit(0);
}
for (const w of warnings) console.log(`[注意] ${w}`);
for (const e of errors) console.error(`[エラー] ${e}`);
console.log(`${places.length}箇所中、エラー${errors.length}件・注意${warnings.length}件`);
process.exit(errors.length > 0 ? 1 : 0);
