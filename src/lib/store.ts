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

export async function insertReport(r: NewReport): Promise<void> {
  if (demoMode) {
    const list = readDemo();
    list.push({
      ...r,
      id: `local-${Date.now()}`,
      created_at: r.created_at ?? new Date().toISOString(),
    });
    localStorage.setItem(DEMO_KEY, JSON.stringify(list));
    return;
  }
  const { error } = await supabase!.from("reports").insert(r);
  if (error) throw error;
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
