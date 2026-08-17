import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NewReport, Report } from "./types";
import { seasonStart } from "./season";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Supabaseの接続情報が無いときは「お試しモード」。
// 投稿はこの端末のlocalStorageにだけ保存され、他の人には見えない。
export const demoMode = !url || !anonKey;

let supabase: SupabaseClient | null = null;
if (!demoMode) {
  supabase = createClient(url!, anonKey!);
}

const DEMO_KEY = "higurashi-demo-reports";
const DEMO_SEEDED_KEY = "higurashi-demo-seeded";

function demoSeed(now: Date): Report[] {
  const min = 60 * 1000;
  const mk = (
    id: string,
    place_id: string,
    heard: boolean,
    agoMin: number,
    comment: string | null = null
  ): Report => ({
    id,
    place_id,
    heard,
    latitude: null,
    longitude: null,
    accuracy: 30,
    comment,
    created_at: new Date(now.getTime() - agoMin * min).toISOString(),
  });
  return [
    mk("demo-1", "minuma-shizen", true, 20, "【サンプル】園内の雑木林でカナカナ"),
    mk("demo-2", "minuma-shizen", true, 45, null),
    mk("demo-3", "akigase", true, 150, "【サンプル】夕方によく鳴いていた"),
    mk("demo-4", "chikozan", true, 60 * 26, null),
    mk("demo-5", "takao", true, 60 * 24 * 5, null),
    mk("demo-6", "tokorozawa-koku", false, 90, null),
  ];
}

function readDemo(): Report[] {
  try {
    const now = new Date();
    if (!localStorage.getItem(DEMO_SEEDED_KEY)) {
      localStorage.setItem(DEMO_KEY, JSON.stringify(demoSeed(now)));
      localStorage.setItem(DEMO_SEEDED_KEY, "1");
    }
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]") as Report[];
  } catch {
    return [];
  }
}

export async function fetchReports(now: Date): Promise<Report[]> {
  const since = seasonStart(now).toISOString();
  if (demoMode) {
    return readDemo().filter((r) => r.created_at >= since);
  }
  const { data, error } = await supabase!
    .from("reports")
    .select("id, place_id, heard, latitude, longitude, accuracy, comment, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as Report[];
}

// 送信の結果。retryable は「電波が戻ればそのまま通る見込みがあるか」。
// 呼び出し側はこれを見てキューに積むかどうかを決める
export type InsertResult = { ok: true } | { ok: false; retryable: boolean };

// 緯度経度を小数3桁（約100m）に丸める。
// reports テーブルは誰でも読めて誰にも消せないので、生のGPS座標を恒久保存しない。
// 本番・お試しモード・キュー経由の送信がすべてここを通るので、丸めはこの1か所だけでよい。
// 精度（accuracy）は期待度の計算に使うので丸めない
function roundCoords(r: NewReport): NewReport {
  const round = (v: number | null) =>
    v == null ? null : Math.round(v * 1000) / 1000;
  return { ...r, latitude: round(r.latitude), longitude: round(r.longitude) };
}

// 投稿を1件送る。**この関数は例外を投げない**。
// 投げると、呼び出し側の画面が「送信中…」のまま固まる事故になる
export async function insertReport(r: NewReport): Promise<InsertResult> {
  const rec = roundCoords(r);
  if (demoMode) {
    try {
      const list = readDemo();
      list.push({
        ...rec,
        id: `local-${Date.now()}`,
        created_at: rec.created_at ?? new Date().toISOString(),
      });
      localStorage.setItem(DEMO_KEY, JSON.stringify(list));
      return { ok: true };
    } catch {
      return { ok: false, retryable: false };
    }
  }
  try {
    const { error, status } = await supabase!.from("reports").insert(rec);
    if (!error) return { ok: true };
    // 通信の失敗とサーバーの拒否を、応答の番号で分ける。
    // エラー文の文字列で判定しない（ライブラリや言語設定で変わるため）
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    const retryable =
      status === 0 ||
      status === 408 ||
      status === 429 ||
      (typeof status === "number" && status >= 500) ||
      offline;
    return { ok: false, retryable };
  } catch {
    // ここに来るのは通信そのものが失敗したとき
    return { ok: false, retryable: true };
  }
}

// ── 送信キュー（圏外・通信失敗のときの置き場）

const QUEUE_KEY = "higurashi-post-queue";
const QUEUE_MAX = 20;
// insertポリシーが2日より前の投稿を受け付けないので、その手前で捨てる
const QUEUE_MAX_AGE_MS = 47 * 60 * 60 * 1000;

function readQueue(): NewReport[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as NewReport[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(list: NewReport[]): boolean {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// 端末に積む。積めたときだけ true。
// 満杯や保存失敗で false を返したら、呼び出し側は従来のエラー表示に戻すこと
//（「保存しました」と出して実際は保存していない嘘を作らないため）
export function enqueueReport(r: NewReport): boolean {
  const list = readQueue();
  if (list.length >= QUEUE_MAX) return false;
  // 積んだ時点の時刻を入れておく。あとで送っても「聞いた時刻」が保たれる
  list.push({ ...r, created_at: r.created_at ?? new Date().toISOString() });
  return writeQueue(list);
}

// online イベントと1分ごとのタイマーが重なっても、同じ投稿を2回送らないための鍵。
// reports には一意制約が無く誰にも消せないので、重複は入れたら取り返しがつかない
let flushing = false;

// 溜まっている投稿を古い順に送る。1件でも送れたら true
export async function flushQueue(): Promise<boolean> {
  if (demoMode || flushing) return false;
  flushing = true;
  try {
    let list = readQueue();
    let sent = false;
    while (list.length > 0) {
      const head = list[0];
      const at = head.created_at ? Date.parse(head.created_at) : NaN;
      if (!Number.isNaN(at) && Date.now() - at > QUEUE_MAX_AGE_MS) {
        // 古すぎてサーバーに必ず断られる分。送らずに捨てる
        list = list.slice(1);
        writeQueue(list);
        continue;
      }
      const res = await insertReport(head);
      if (!res.ok && res.retryable) break; // まだ電波が戻っていない。残りは次回へ
      // 送れた分と、何度送っても通らない分。どちらも先頭から外す。
      // 送れた直後にタブが閉じると次回もう一度送られて重複しうるが、そこは許容する
      list = list.slice(1);
      writeQueue(list);
      if (res.ok) sent = true;
    }
    return sent;
  } finally {
    // 途中で失敗しても必ず鍵を戻す。戻し忘れるとキューが二度と流れなくなる
    flushing = false;
  }
}

// 連投防止: 同じ地点への投稿は2分あける（端末内チェックのみ）
const THROTTLE_MS = 2 * 60 * 1000;

export function isThrottled(placeId: string): boolean {
  try {
    const t = localStorage.getItem(`higurashi-last-post-${placeId}`);
    return !!t && Date.now() - Number(t) < THROTTLE_MS;
  } catch {
    return false;
  }
}

export function markPosted(placeId: string): void {
  try {
    localStorage.setItem(`higurashi-last-post-${placeId}`, String(Date.now()));
  } catch {
    // localStorageが使えない環境では何もしない
  }
}
