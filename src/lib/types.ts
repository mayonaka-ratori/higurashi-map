export type Place = {
  id: string;
  name: string;
  pref: string;
  city: string;
  lat: number;
  lng: number;
  // 公式サイトやブログなど、アプリの外で見つかったヒグラシの記録（任意）。
  // reportsテーブルの投稿とは別物（匿名リアルタイム投稿ではなく、こちらで調べた記録）。
  externalRecord?: {
    date: string; // "2026-08-01" または "2026-08-XX"
    time: string; // "夕方" など。不明なら "不明"
    source: string;
    url: string;
  };
};

export type Report = {
  id: string;
  place_id: string;
  heard: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  comment: string | null;
  created_at: string; // ISO文字列
};

export type NewReport = {
  place_id: string;
  heard: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  comment: string | null;
  // 「さっき聞いた分」を後から記録するときだけ入れる。
  // 省略するとDB側の now() が入る（その場で聞いた分の通常投稿）
  created_at?: string;
};
