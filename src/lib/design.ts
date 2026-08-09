// 画面の色と寸法。値は docs/design-handoff-v2/README.md「デザイントークン」の確定値。
// 自分で決め直さないこと。色を足したくなったら先にハンドオフを見る。
import type { CSSProperties } from "react";
import type { Freshness } from "./score";

export const C = {
  // 濃い面
  headerBg: "#073024",
  railBg: "#0b3b2e",
  railTrack: "#164b3b",
  onDark: "#ecfdf5", // 濃い面の主文字・現在時刻マーカー
  onDarkSub: "#8fd3ba", // 濃い面の副文字。これより薄い色を濃緑の上に置かない
  railTick: "#a7f3d0",
  nowTone: "#6ee7b7", // 聞きどき中の状態文字

  // 時間帯
  dawnBand: "#99f6e4",
  duskBand: "#fcd34d",
  heardDot: "#5eead4",
  quietDot: "#94a3b8",

  // 緑（主アクション・今日）
  green: "#059669",
  greenHover: "#047857",
  reason: "#065f46",
  answerBg: "#f0fbf5",
  answerBorder: "#d6ece2",

  // 期待度の♪。琥珀はレビュー点数に見えるので使わない
  notes: "#0e7490",

  // 状態
  amber: "#f59e0b",
  slateBtn: "#475569",
  slateBtnHover: "#334155",
  ink: "#0f172a",
  locate: "#0ea5e9",
  danger: "#991b1b",

  // 面と罫
  white: "#ffffff",
  panelAlt: "#f8fafc",
  postBg: "#f7fbf9",
  hairline: "#f1f5f9",
  border: "#e6ebe9",
  border2: "#e2e8f0",
  border3: "#cbd5e1",
  muted: "#64748b", // 白の上の文字はこれが下限
  none: "#94a3b8", // 記録なしのピン。テキストには使わない
  mapBg: "#eef2f6",
} as const;

export const FONT_STACK =
  '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';

// 鮮度ドット。一覧・カード・検索結果で共通に使う
const DOT: Record<
  Freshness,
  { bg: string; border: string; shadow: string; size: number }
> = {
  today: {
    bg: C.green,
    border: `2px solid ${C.white}`,
    shadow: "0 0 0 1px rgba(5,150,105,.4)",
    size: 14,
  },
  recent3d: {
    bg: C.amber,
    border: `2px solid ${C.white}`,
    shadow: "0 0 0 1px rgba(245,158,11,.45)",
    size: 12,
  },
  season: {
    bg: C.white,
    border: `1.75px solid ${C.muted}`,
    shadow: "none",
    size: 10,
  },
  none: { bg: C.none, border: "0", shadow: "none", size: 10 },
};

export function dotStyle(fresh: Freshness, size?: number): CSSProperties {
  const d = DOT[fresh] ?? DOT.none;
  const s = size ?? d.size;
  return {
    flex: "none",
    display: "block",
    width: s,
    height: s,
    borderRadius: 9999,
    background: d.bg,
    border: d.border,
    boxShadow: d.shadow,
  };
}

// ♪の見た目。サイズだけ場所ごとに変える
export function notesStyle(size: number): CSSProperties {
  return {
    flex: "none",
    fontSize: size,
    letterSpacing: ".13em",
    color: C.notes,
  };
}

// 「狭山湖（トトロの森・狭山丘陵）」→「狭山湖」。地図に出す短い呼び名
export function shortName(name: string): string {
  return name.split(/[（(・]/)[0] || name;
}
