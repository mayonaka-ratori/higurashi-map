// 画面のあいだで受け渡す形。計算は App.tsx の1か所でやり、
// 表示する部品には出来上がった文字列だけ渡す（見出しと中身が食い違わないように）。
import type { Place } from "./types";
import type { PlaceStats } from "./score";

export type Ranked = {
  p: Place;
  s: PlaceStats;
  // 現在地がまだ分からないときは null。距離は出さず、順位付けにも使わない
  d: number | null;
};

export type PostState =
  | { kind: "idle" }
  | { kind: "sending"; heard: boolean }
  | { kind: "done"; heard: boolean }
  | { kind: "error"; heard: boolean; message: string };

// 答えのブロックに出すもの。答えが立たない日は isEmpty が true になり、
// 見出しも本文もボタンも別のものに入れ替わる
export type AnswerVM = {
  isEmpty: boolean;
  kicker: string;
  headline: string;
  placeLine: string | null;
  notes: string;
  notesLabel: string;
  reason: string;
  comment: string | null;
  emptyLead: string | null;
  openLabel: string;
  restTitle: string;
  footnote: string;
};

export function distText(d: number | null): string | null {
  return d == null ? null : `${d.toFixed(1)}km`;
}

// 「埼玉県 さいたま市緑区 ・ 6.7km」。距離が分からない日は市区町村だけ
export function placeLineText(r: Ranked, prefix = ""): string {
  const base = `${r.p.pref} ${r.p.city}`;
  const d = distText(r.d);
  return d ? `${base} ・ ${prefix}${d}` : base;
}
