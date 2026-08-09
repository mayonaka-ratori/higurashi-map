// 聞きどきの計算。ヒグラシは夜明けの前後と日の入りの前後によく鳴くので、
// 1日に2回ある「窓」をそれぞれ出す。日中も曇りや暗い林では鳴くため、
// 窓の外でも「今は無理」と言い切らない（handoff-v2 ②）。
import { hm } from "./score";

const MIN = 60 * 1000;
const WINDOW = 30 * MIN; // 窓は中心の前後30分

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 日の入り時刻のざっくり計算（誤差±15分程度）
export function sunsetDate(now: Date, lat: number, lng: number): Date | null {
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const decl =
    ((-23.44 * Math.PI) / 180) *
    Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const cosH = -Math.tan((lat * Math.PI) / 180) * Math.tan(decl);
  if (cosH < -1 || cosH > 1) return null;
  const hourAngle = (Math.acos(cosH) * 180) / Math.PI / 15;
  // 日本標準時の基準経線は東経135度
  const sunset = 12 - (lng - 135) / 15 + hourAngle;
  const d = startOfDay(now);
  d.setMinutes(Math.round(sunset * 60));
  return d;
}

// 夜明けは日の入りと同じ式の対称側（南中時刻をはさんだ反対側）から出す
export function sunriseDate(now: Date, lat: number, lng: number): Date | null {
  const sunset = sunsetDate(now, lat, lng);
  if (!sunset) return null;
  const solarNoon = startOfDay(now);
  solarNoon.setMinutes(Math.round((12 - (lng - 135) / 15) * 60));
  return new Date(solarNoon.getTime() - (sunset.getTime() - solarNoon.getTime()));
}

export type ListeningWindow = {
  kind: "dawn" | "dusk";
  label: string;
  center: Date;
  from: Date;
  to: Date;
};

export type ListeningState = {
  dawn: Date;
  dusk: Date;
  wins: [ListeningWindow, ListeningWindow];
  active: ListeningWindow | null;
  next: ListeningWindow | null;
  state: string;
  remain: string;
  tone: "now" | "soon" | "past";
  note: string;
  daytime: boolean;
};

export function listeningWindows(
  now: Date,
  lat: number,
  lng: number
): ListeningState | null {
  const dawn = sunriseDate(now, lat, lng);
  const dusk = sunsetDate(now, lat, lng);
  if (!dawn || !dusk) return null;

  const wins: [ListeningWindow, ListeningWindow] = [
    {
      kind: "dawn",
      label: "夜明け",
      center: dawn,
      from: new Date(dawn.getTime() - WINDOW),
      to: new Date(dawn.getTime() + WINDOW),
    },
    {
      kind: "dusk",
      label: "日の入り",
      center: dusk,
      from: new Date(dusk.getTime() - WINDOW),
      to: new Date(dusk.getTime() + WINDOW),
    },
  ];

  const active = wins.find((w) => now >= w.from && now <= w.to) ?? null;
  const next = wins.find((w) => now < w.from) ?? null;
  const mins = (a: Date, b: Date) =>
    Math.max(1, Math.round((b.getTime() - a.getTime()) / MIN));

  let state: string;
  let remain: string;
  let tone: "now" | "soon" | "past";
  if (active) {
    state = active.kind === "dawn" ? "いま聞きどき・朝" : "いま聞きどき・夕";
    remain = `${hm(active.to)}まで あと${mins(now, active.to)}分`;
    tone = "now";
  } else if (next) {
    state =
      next.kind === "dawn" ? "朝の聞きどきはこれから" : "夕の聞きどきはこれから";
    const m = mins(now, next.from);
    remain = m >= 90 ? `${hm(next.from)}から` : `あと${m}分ではじまる`;
    tone = "soon";
  } else {
    state = "今日の聞きどきは過ぎた";
    const tomorrow = sunriseDate(
      new Date(now.getTime() + 24 * 60 * MIN),
      lat,
      lng
    );
    remain = tomorrow
      ? `次は明日の夜明け ${hm(tomorrow)}ごろ`
      : "次は明日の夜明け";
    tone = "past";
  }

  // 朝の窓と夕の窓のあいだ。ここで「今は鳴かない」と言うと事実に反する
  const daytime = !active && now > wins[0].to && now < wins[1].from;
  const note = daytime
    ? "曇りの日や暗い林なら、日中でも鳴きます"
    : "鳴くのは夜明けと日の入りの前後30分が中心です";

  return { dawn, dusk, wins, active, next, state, remain, tone, note, daytime };
}

// 1日を0〜1で表した位置。時間帯レールの横位置に使う
export function dayPos(d: Date): number {
  return (d.getHours() * 60 + d.getMinutes()) / 1440;
}
