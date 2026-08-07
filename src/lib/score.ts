import type { Report } from "./types";

export type Freshness = "today" | "recent3d" | "season" | "none";

export const FRESHNESS_COLOR: Record<Freshness, string> = {
  today: "#16a34a", // 🟢 今日確認
  recent3d: "#eab308", // 🟡 3日以内
  season: "#e2e8f0", // ⚪ 今シーズン
  none: "#64748b", // ⚫ 記録なし
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  today: "今日確認",
  recent3d: "3日以内に確認",
  season: "今シーズン確認あり",
  none: "今シーズンの記録なし",
};

export type PlaceStats = {
  score: number;
  stars: number; // 0〜5
  freshness: Freshness;
  lastHeardAt: Date | null;
  todayReports: Report[]; // 今日の全投稿（新しい順）
  yesterdayHeardCount: number;
  seasonHeardCount: number;
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 仕様書のルールベース期待度をそのまま実装したもの。
// 30分以内+30 / 3時間以内+10 / 24時間以内+5 / 複数人確認+20 /
// GPS高精度+10 / 聞こえなかった-5
export function placeStats(reports: Report[], now: Date): PlaceStats {
  const sorted = [...reports].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  const heard = sorted.filter((r) => r.heard);
  const today0 = startOfDay(now).getTime();
  const yesterday0 = today0 - DAY;

  const lastHeardAt = heard.length > 0 ? new Date(heard[0].created_at) : null;

  let score = 0;
  if (lastHeardAt) {
    const age = now.getTime() - lastHeardAt.getTime();
    if (age <= 30 * MIN) score += 30;
    else if (age <= 3 * HOUR) score += 10;
    else if (age <= DAY) score += 5;
  }
  const heardIn3h = heard.filter(
    (r) => now.getTime() - Date.parse(r.created_at) <= 3 * HOUR
  );
  if (heardIn3h.length >= 2) score += 20;
  if (
    lastHeardAt &&
    heard[0].accuracy != null &&
    heard[0].accuracy <= 50 &&
    now.getTime() - lastHeardAt.getTime() <= 3 * HOUR
  ) {
    score += 10;
  }
  const quietIn3h = sorted.filter(
    (r) => !r.heard && now.getTime() - Date.parse(r.created_at) <= 3 * HOUR
  );
  score -= Math.min(quietIn3h.length * 5, 15);
  score = Math.max(score, 0);

  const stars =
    score >= 55 ? 5 : score >= 35 ? 4 : score >= 20 ? 3 : score >= 10 ? 2 : score > 0 ? 1 : 0;

  let freshness: Freshness = "none";
  if (lastHeardAt) {
    const t = lastHeardAt.getTime();
    if (t >= today0) freshness = "today";
    else if (t >= today0 - 3 * DAY) freshness = "recent3d";
    else freshness = "season";
  }

  return {
    score,
    stars,
    freshness,
    lastHeardAt,
    todayReports: sorted.filter((r) => Date.parse(r.created_at) >= today0),
    yesterdayHeardCount: heard.filter((r) => {
      const t = Date.parse(r.created_at);
      return t >= yesterday0 && t < today0;
    }).length,
    seasonHeardCount: heard.length,
  };
}

export function starsText(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}

export function timeText(d: Date, now: Date): string {
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const days = Math.floor(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY
  );
  if (days <= 0) return `今日 ${hm}`;
  if (days === 1) return `昨日 ${hm}`;
  return `${days}日前`;
}

export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
