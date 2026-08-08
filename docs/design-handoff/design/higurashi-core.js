// ひぐらしのなくところに — 再設計用の共有ロジック。
// 期待度の計算式・鮮度判定・時刻表記は src/lib/score.ts / sun.ts をそのまま移植したもの。
// 鮮度4色だけは「視認性優先で調整」の方針に沿って値と形を再設計している。

export const FRESHNESS = {
  today: {
    key: "today",
    fill: "#059669",
    ring: "#ffffff",
    ringWidth: 2.5,
    dot: "#059669",
    dotRing: "#ffffff",
    label: "今日確認",
    short: "今日",
    zoomRadius: [8, 7.5, 11, 11, 14, 15],
  },
  recent3d: {
    key: "recent3d",
    fill: "#f59e0b",
    ring: "#ffffff",
    ringWidth: 2,
    dot: "#f59e0b",
    dotRing: "#ffffff",
    label: "3日以内に確認",
    short: "3日内",
    zoomRadius: [8, 5.5, 11, 8.5, 14, 11],
  },
  season: {
    key: "season",
    fill: "#ffffff",
    ring: "#64748b",
    ringWidth: 1.75,
    dot: "#ffffff",
    dotRing: "#64748b",
    label: "今シーズン確認あり",
    short: "今季",
    zoomRadius: [8, 4, 11, 6.5, 14, 9],
  },
  none: {
    key: "none",
    fill: "#94a3b8",
    ring: "#e2e8f0",
    ringWidth: 1,
    dot: "#94a3b8",
    dotRing: "#e2e8f0",
    label: "今シーズンの記録なし",
    short: "記録なし",
    zoomRadius: [8, 2.5, 11, 4.5, 14, 6],
  },
};
export const FRESHNESS_ORDER = ["none", "season", "recent3d", "today"];

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function placeStats(reports, now) {
  const sorted = [...reports].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const heard = sorted.filter((r) => r.heard);
  const today0 = startOfDay(now).getTime();
  const yesterday0 = today0 - DAY;
  const lastHeardAt = heard.length ? new Date(heard[0].created_at) : null;

  let score = 0;
  if (lastHeardAt) {
    const age = now - lastHeardAt;
    if (age <= 30 * MIN) score += 30;
    else if (age <= 3 * HOUR) score += 10;
    else if (age <= DAY) score += 5;
  }
  const heardIn3h = heard.filter((r) => now - Date.parse(r.created_at) <= 3 * HOUR);
  if (heardIn3h.length >= 2) score += 20;
  if (lastHeardAt && heard[0].accuracy != null && heard[0].accuracy <= 50 && now - lastHeardAt <= 3 * HOUR) score += 10;
  const quietIn3h = sorted.filter((r) => !r.heard && now - Date.parse(r.created_at) <= 3 * HOUR);
  const quietIn3hCount = quietIn3h.length;
  score -= Math.min(quietIn3h.length * 5, 15);
  score = Math.max(score, 0);

  const stars = score >= 55 ? 5 : score >= 35 ? 4 : score >= 20 ? 3 : score >= 10 ? 2 : score > 0 ? 1 : 0;
  let freshness = "none";
  if (lastHeardAt) {
    const t = lastHeardAt.getTime();
    freshness = t >= today0 ? "today" : t >= today0 - 3 * DAY ? "recent3d" : "season";
  }
  return {
    score, stars, freshness, lastHeardAt,
    heardIn3hCount: heardIn3h.length,
    quietIn3hCount,
    todayReports: sorted.filter((r) => Date.parse(r.created_at) >= today0),
    todayHeardCount: heard.filter((r) => Date.parse(r.created_at) >= today0).length,
    yesterdayHeardCount: heard.filter((r) => {
      const t = Date.parse(r.created_at);
      return t >= yesterday0 && t < today0;
    }).length,
    seasonHeardCount: heard.length,
  };
}

// ★は5段階の「期待度」。空の☆を並べるとレビュー点数に見えるので、点いた分だけ出す。
// 0件のときは何も出さない（すぐ下の根拠行が「今シーズンの記録なし」と言っている）。
export const starsText = (s) => (s > 0 ? "★".repeat(s) : "");

// ★が何を根拠に立っているかを一行で言う。加点の主役だけを出す。
export function reasonText(s, now) {
  if (!s.lastHeardAt) return "今シーズンの記録なし";
  const ago = agoText(s.lastHeardAt, now);
  let t = s.heardIn3hCount >= 2 ? ago + "に確認・3時間で" + s.heardIn3hCount + "件" : ago + "に確認";
  if (s.quietIn3hCount > 0) t += "・静かだった " + s.quietIn3hCount + "件";
  return t;
}

// おすすめ順。期待度そのままだと「★5だが80km先」が1位になるので、
// 1kmにつき0.5点（最大30点）引いて「行ける距離か」を効かせる。★の値は変えない。
export function rankScore(s, distKm, weight) {
  return s.score - Math.min(distKm, 60) * (weight == null ? 0.5 : weight);
}
export const hm = (d) => d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");

export function timeText(d, now) {
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / DAY);
  if (days <= 0) return "今日 " + hm(d);
  if (days === 1) return "昨日 " + hm(d);
  return days + "日前";
}

// 「8分前」「2時間前」— いつの話かを一目で。地図の横で読む用の短い表記。
export function agoText(d, now) {
  const m = Math.round((now - d) / MIN);
  if (m < 1) return "たった今";
  if (m < 60) return m + "分前";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "時間前";
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / DAY);
  return days === 1 ? "昨日" : days + "日前";
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sunsetDate(now, lat, lng) {
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const decl = ((-23.44 * Math.PI) / 180) * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const cosH = -Math.tan((lat * Math.PI) / 180) * Math.tan(decl);
  if (cosH < -1 || cosH > 1) return null;
  const hourAngle = ((Math.acos(cosH) * 180) / Math.PI) / 15;
  const sunset = 12 - (lng - 135) / 15 + hourAngle;
  const d = startOfDay(now);
  d.setMinutes(Math.round(sunset * 60));
  return d;
}

// 見せる場面: 8月7日 18:12。日の入り前の「聞きどき」に入った直後。
// 実データではなく、この時刻に画面がどう見えるかを確かめるためのサンプル投稿。
export function sampleNow() {
  const d = new Date();
  d.setHours(18, 12, 0, 0);
  return d;
}

const SEED = [
  ["sayamako", true, 3, "駐車場の先の尾根で大合唱"],
  ["minuma-shizen", true, 8, "園内の雑木林でカナカナ"],
  ["inokashira", true, 12, null],
  ["omiya-koen", false, 12, null],
  ["kitamoto-kansatsu", true, 14, null],
  ["minuma-shizen", true, 20, null],
  ["kitamoto-kansatsu", true, 27, null],
  ["minuma-shizen", true, 34, null],
  ["tokorozawa-koku", false, 42, null],
  ["jindai", true, 52, null],
  ["yakushiike", true, 67, null],
  ["hachikokuyama", true, 92, "水道みちの林で数匹"],
  ["akigase", true, 152, "夕方によく鳴いていた"],
  ["takao", true, 782, "明け方、沢沿いで"],
  ["takiyama", true, 1412, null],
  ["heirinji", true, 1432, null],
  ["chikozan", true, 1462, null],
  ["kinchakuda", true, 60 * 24 * 2 + 30, null],
  ["shinrin-koen", true, 60 * 24 * 4 + 20, null],
  ["ikuta-ryokuchi", true, 60 * 24 * 5 + 40, null],
  ["todoroki", true, 60 * 24 * 6 + 10, null],
];

export function sampleReports(now) {
  return SEED.map(([place_id, heard, agoMin, comment], i) => ({
    id: "s" + i,
    place_id, heard, comment,
    latitude: null, longitude: null, accuracy: 30,
    created_at: new Date(now.getTime() - agoMin * MIN).toISOString(),
  }));
}

// サンプルの現在地: さいたま市浦和区あたり
export const SAMPLE_POS = { lat: 35.8617, lng: 139.6455, label: "さいたま市浦和区" };
