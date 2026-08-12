import type { Place, Report } from "./types";
import { seasonStart } from "./season";

type ExternalRecord = NonNullable<Place["externalRecord"]>;

export type Freshness = "today" | "recent3d" | "season" | "none";

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
  heardIn3hCount: number;
  quietIn3hCount: number;
  todayReports: Report[]; // 今日の全投稿（新しい順）
  todayHeardCount: number;
  yesterdayHeardCount: number;
  seasonHeardCount: number;
  // 外部サイトの記録を一行で言ったもの（例:「外部の記録 8/1」）。無ければ null
  externalLabel: string | null;
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 外部記録の日付を解釈する。今シーズン外・未来・形式不正は null
function parseExternal(
  rec: ExternalRecord,
  now: Date
): { kind: "exact"; daysAgo: number } | { kind: "monthOnly" } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}|XX)$/.exec(rec.date);
  if (!m) return null;
  const season0 = seasonStart(now);
  if (m[3] === "XX") {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    const monthStart = new Date(year, month - 1, 1);
    if (monthStart.getFullYear() !== year || monthStart.getMonth() !== month - 1) {
      return null;
    }
    if (monthStart < season0 || monthStart > now) return null;
    return { kind: "monthOnly" };
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) {
    return null;
  }
  const d = new Date(year, month - 1, day);
  if (d < season0 || startOfDay(d) > startOfDay(now)) return null;
  const daysAgo = Math.round(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY
  );
  return { kind: "exact", daysAgo };
}

const FRESHNESS_RANK: Record<Freshness, number> = {
  none: 0,
  season: 1,
  recent3d: 2,
  today: 3,
};

// 仕様書のルールベース期待度をそのまま実装したもの。
// 30分以内+30 / 3時間以内+10 / 24時間以内+5 / 複数人確認+20 /
// GPS高精度+10 / 聞こえなかった-5
// 外部記録は底上げのみ: 3日以内+10 / シーズン内+5（外部記録だけでは♪2まで）
export function placeStats(
  reports: Report[],
  now: Date,
  external?: ExternalRecord
): PlaceStats {
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
  // 外部サイトの記録による底上げ（アプリ投稿ゼロでも指針を出すため）
  let extFreshness: Freshness = "none";
  const ext = external ? parseExternal(external, now) : null;
  if (ext) {
    if (ext.kind === "exact" && ext.daysAgo <= 0) {
      score += 10;
      extFreshness = "today";
    } else if (ext.kind === "exact" && ext.daysAgo <= 3) {
      score += 10;
      extFreshness = "recent3d";
    } else {
      score += 5;
      extFreshness = "season";
    }
  }

  const quietIn3h = sorted.filter(
    (r) => !r.heard && now.getTime() - Date.parse(r.created_at) <= 3 * HOUR
  );
  score -= Math.min(quietIn3h.length * 5, 15);
  score = Math.max(score, 0);

  // 外部記録しかない場所で「今シーズンの記録なし」と言ってしまわないための一行
  const externalLabel =
    ext && external
      ? `外部の記録 ${external.date.replace(
          /^\d{4}-(\d{2})-(\d{2}|XX)$/,
          (_, m2, d2) =>
            d2 === "XX" ? `${Number(m2)}月` : `${Number(m2)}/${Number(d2)}`
        )}`
      : null;

  const stars =
    score >= 55 ? 5 : score >= 35 ? 4 : score >= 20 ? 3 : score >= 10 ? 2 : score > 0 ? 1 : 0;

  let freshness: Freshness = "none";
  if (lastHeardAt) {
    const t = lastHeardAt.getTime();
    if (t >= today0) freshness = "today";
    else if (t >= today0 - 3 * DAY) freshness = "recent3d";
    else freshness = "season";
  }
  if (FRESHNESS_RANK[extFreshness] > FRESHNESS_RANK[freshness]) {
    freshness = extFreshness;
  }

  return {
    score,
    stars,
    freshness,
    lastHeardAt,
    heardIn3hCount: heardIn3h.length,
    quietIn3hCount: quietIn3h.length,
    todayReports: sorted.filter((r) => Date.parse(r.created_at) >= today0),
    todayHeardCount: heard.filter((r) => Date.parse(r.created_at) >= today0)
      .length,
    yesterdayHeardCount: heard.filter((r) => {
      const t = Date.parse(r.created_at);
      return t >= yesterday0 && t < today0;
    }).length,
    seasonHeardCount: heard.length,
    externalLabel,
  };
}

// 期待度の単位。点いた分だけ出し、0件のときは何も出さない。
// 空の記号を並べるとレビュー点数に見えるため（handoff-v2 ①）
export function notesText(n: number): string {
  return n > 0 ? "♪".repeat(n) : "";
}

export function notesLabel(n: number): string {
  if (n >= 5) return "よく鳴いている";
  if (n >= 4) return "鳴いている";
  if (n >= 3) return "たぶん鳴く";
  if (n >= 2) return "望みはある";
  if (n >= 1) return "わずか";
  return "記録なし";
}

// 期待度が何を根拠に立っているかを一行で言う。加点の主役だけを出す。
export function reasonText(s: PlaceStats, now: Date): string {
  if (!s.lastHeardAt) return s.externalLabel ?? "今シーズンの記録なし";
  const head = heardHead(s.lastHeardAt, now);
  let t =
    s.heardIn3hCount >= 2
      ? `${head}・3時間で${s.heardIn3hCount}件`
      : head;
  if (s.quietIn3hCount > 0) t += `・静かだった ${s.quietIn3hCount}件`;
  return t;
}

// 「8分前に確認」。直後だけは「たった今に確認」にならないよう分ける
function heardHead(at: Date, now: Date): string {
  const ago = agoText(at, now);
  return ago === "たった今" ? "たった今確認" : `${ago}に確認`;
}

// 狭いカードに入れる短い根拠。いつ聞こえたかだけを言う
export function shortReason(s: PlaceStats, now: Date): string {
  if (!s.lastHeardAt) return s.externalLabel ?? "記録なし";
  return heardHead(s.lastHeardAt, now);
}

// おすすめ順。期待度そのままだと「♪5だが80km先」が1位になるので、
// 1kmにつき0.5点（最大30点）引いて「行ける距離か」を効かせる。期待度の値は変えない。
export function rankScore(
  s: PlaceStats,
  distKm: number | null,
  weight = 0.5
): number {
  if (distKm == null) return s.score;
  return s.score - Math.min(distKm, 60) * weight;
}

export function hm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 「8分前」「2時間前」。いつの話かを一目で分かるようにする短い表記
export function agoText(d: Date, now: Date): string {
  const m = Math.round((now.getTime() - d.getTime()) / MIN);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const days = Math.floor(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY
  );
  return days === 1 ? "昨日" : `${days}日前`;
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
