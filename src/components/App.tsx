"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import placesJson from "@/data/places.json";
import type { Place, Report } from "@/lib/types";
import {
  demoMode,
  fetchReports,
  insertReport,
  isThrottled,
  markPosted,
} from "@/lib/store";
import {
  FRESHNESS_COLOR,
  FRESHNESS_LABEL,
  placeStats,
  starsText,
  timeText,
  distanceKm,
  type Freshness,
} from "@/lib/score";
import { sunsetText } from "@/lib/sun";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const places = placesJson as Place[];

type PostState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; heard: boolean }
  | { kind: "error"; message: string };

// 端末のGPSを取る。取れなくても投稿は続ける（精度情報なし扱い）
function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  });
}

// X（旧Twitter）の投稿画面を開くURLを作る
function xShareUrl(place: Place, heard: boolean): string {
  const link = `${window.location.origin}/?place=${place.id}`;
  const text = heard
    ? `${place.name}でヒグラシの声を確認しました🌲\n#ひぐらしのなくところに`
    : `今日、カナカナが聞こえる場所。${place.name}の最新状況はこちら\n#ひぐらしのなくところに`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
}

export default function App() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 共有リンク（?place=地点ID）で開かれたら、その地点を選択状態にする。
  // サーバー側の描画と食い違わないよう、表示後に読み取る。
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("place");
    if (id && places.some((p) => p.id === id)) setSelectedId(id);
  }, []);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [postState, setPostState] = useState<PostState>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(async () => {
    try {
      const n = new Date();
      setNow(n);
      setReports(await fetchReports(n));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 60 * 1000); // 1分ごとに更新
    return () => clearInterval(t);
  }, [reload]);

  const reportsByPlace = useMemo(() => {
    const m = new Map<string, Report[]>();
    for (const r of reports) {
      const list = m.get(r.place_id);
      if (list) list.push(r);
      else m.set(r.place_id, [r]);
    }
    return m;
  }, [reports]);

  const statsById = useMemo(() => {
    const m: Record<string, ReturnType<typeof placeStats>> = {};
    for (const p of places) {
      m[p.id] = placeStats(reportsByPlace.get(p.id) ?? [], now);
    }
    return m;
  }, [reportsByPlace, now]);

  const freshnessById = useMemo(() => {
    const m: Record<string, Freshness> = {};
    for (const p of places) m[p.id] = statsById[p.id].freshness;
    return m;
  }, [statsById]);

  // おすすめ: 現在地があれば「近くて期待度の高い順」、なければ「期待度の高い順」
  const recommended = useMemo(() => {
    const scored = places.map((p) => {
      const s = statsById[p.id];
      const dist = userPos
        ? distanceKm(userPos.lat, userPos.lng, p.lat, p.lng)
        : null;
      return { place: p, stats: s, dist };
    });
    scored.sort((a, b) => {
      if (a.dist != null && b.dist != null) {
        // 期待度を優先しつつ、同点なら近い順
        if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
        return a.dist - b.dist;
      }
      if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
      return (
        (b.stats.lastHeardAt?.getTime() ?? 0) -
        (a.stats.lastHeardAt?.getTime() ?? 0)
      );
    });
    return scored.slice(0, 5);
  }, [statsById, userPos]);

  const selected = selectedId
    ? places.find((p) => p.id === selectedId) ?? null
    : null;

  // 地点名検索（登録済みスポットからの絞り込み。全角半角・大小文字の違いを吸収）
  const normalize = (s: string) => s.normalize("NFKC").toLowerCase();
  const searchResults = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;
    return places
      .filter((p) => normalize(`${p.name} ${p.city} ${p.pref}`).includes(q))
      .slice(0, 20);
  }, [query]);

  const post = useCallback(
    async (heard: boolean) => {
      if (!selected) return;
      if (isThrottled(selected.id)) {
        setPostState({
          kind: "error",
          message: "同じ場所への投稿は2分あけてください。",
        });
        return;
      }
      setPostState({ kind: "sending" });
      const pos = await getPosition();
      try {
        await insertReport({
          place_id: selected.id,
          heard,
          latitude: pos?.coords.latitude ?? null,
          longitude: pos?.coords.longitude ?? null,
          accuracy: pos?.coords.accuracy ?? null,
          comment: comment.trim() ? comment.trim().slice(0, 200) : null,
        });
        markPosted(selected.id);
        setComment("");
        setShowComment(false);
        setPostState({ kind: "done", heard });
        await reload();
      } catch {
        setPostState({
          kind: "error",
          message: "送信に失敗しました。通信環境を確認してもう一度お試しください。",
        });
      }
    },
    [selected, comment, reload]
  );

  const selectPlace = useCallback((id: string | null) => {
    setSelectedId(id);
    setPostState({ kind: "idle" });
  }, []);

  const sunset = sunsetText(now, userPos?.lat ?? 35.86, userPos?.lng ?? 139.55);
  const selectedStats = selected ? statsById[selected.id] : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-100">
      {/* ヘッダー */}
      <header
        className="z-20 bg-emerald-900 px-3 py-1.5 text-emerald-50 shadow"
        style={{ paddingTop: "calc(0.375rem + env(safe-area-inset-top))" }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h1 className="text-sm font-bold leading-tight">
            ひぐらしのなくところに
          </h1>
          <p className="text-[11px] leading-tight text-emerald-200">
            今日、カナカナが聞こえる場所。
          </p>
        </div>
        {sunset && (
          <p className="text-[11px] leading-tight text-emerald-300">
            日の入り {sunset}ごろ・前後30分が聞きどき
          </p>
        )}
      </header>

      {demoMode && (
        <div className="z-20 bg-amber-100 px-4 py-1 text-xs text-amber-900">
          お試しモードで動いています。表示中の投稿はサンプルで、あなたの投稿はこの端末にだけ保存されます。
        </div>
      )}
      {loadError && (
        <div className="z-20 bg-red-100 px-4 py-1 text-xs text-red-900">
          データの取得に失敗しました。しばらくして再読み込みしてください。
        </div>
      )}

      {/* 地図 */}
      <div className="relative flex-1">
        <MapView
          places={places}
          freshnessById={freshnessById}
          selectedId={selectedId}
          onSelect={selectPlace}
          onUserLocate={(lat, lng) => setUserPos({ lat, lng })}
        />
        {/* 凡例（スマホで地図を隠さないよう1行の帯にする） */}
        <div className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] text-slate-700 shadow">
          {(
            [
              ["today", "今日"],
              ["recent3d", "3日内"],
              ["season", "今季"],
              ["none", "記録なし"],
            ] as [Freshness, string][]
          ).map(([f, label]) => (
            <span key={f} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-slate-500"
                style={{ backgroundColor: FRESHNESS_COLOR[f] }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* 下のパネル。検索中は高さを固定して、結果の増減で地図がカタカタ動くのを防ぐ */}
      <div
        className={`z-20 overflow-y-auto border-t border-slate-300 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] ${
          !selected && (searchFocused || query.trim() !== "")
            ? "h-[48%]"
            : "max-h-[48%]"
        }`}
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {!selected && (
          <>
            {/* 地点名検索（つなぎ実装。UI再設計後は案Bの検索に置き換わる） */}
            <div className="relative mb-2">
              <input
                type="search"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-3 pr-10 text-base"
                placeholder="地点名で探す（例: 見沼、高尾）"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                aria-label="地点名で探す"
              />
              {query && (
                <button
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-base leading-none text-slate-400"
                  onClick={() => setQuery("")}
                  aria-label="検索をクリア"
                >
                  ✕
                </button>
              )}
            </div>
            <h2 className="mb-2 text-sm font-bold text-slate-800">
              {searchResults ? (
                <>
                  「{query.trim()}」で {searchResults.length} 件
                </>
              ) : (
                <>
                  {userPos ? "近くのおすすめ" : "いま期待できる場所"}
                  {!userPos && (
                    <span className="ml-2 font-normal text-slate-500">
                      （地図右上の◎ボタンで現在地を使えます）
                    </span>
                  )}
                </>
              )}
            </h2>
            {searchResults && searchResults.length === 0 && (
              <p className="py-4 text-sm text-slate-500">
                見つかりませんでした。別の言い方で探すか、地図から選んでください。
                （登録のない場所には今は投稿できません）
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {(searchResults
                ? searchResults.map((place) => ({
                    place,
                    stats: statsById[place.id],
                    dist: userPos
                      ? distanceKm(userPos.lat, userPos.lng, place.lat, place.lng)
                      : null,
                  }))
                : recommended
              ).map(({ place, stats, dist }) => (
                <li key={place.id}>
                  <button
                    className="flex w-full items-center justify-between py-2 text-left"
                    onClick={() => selectPlace(place.id)}
                  >
                    <span>
                      <span className="block text-sm font-medium text-slate-800">
                        {place.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {place.pref} {place.city}
                        {dist != null && ` ・ 約${dist.toFixed(1)}km`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm text-amber-500">
                        {starsText(stats.stars)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {stats.lastHeardAt
                          ? `最終確認 ${timeText(stats.lastHeardAt, now)}`
                          : "今シーズン記録なし"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {selected && selectedStats && (
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {selected.name}
                </h2>
                <p className="text-xs text-slate-500">
                  {selected.pref} {selected.city} ・{" "}
                  {FRESHNESS_LABEL[selectedStats.freshness]}
                </p>
              </div>
              <button
                className="-mr-2 -mt-1 rounded p-3 text-base leading-none text-slate-400"
                onClick={() => selectPlace(null)}
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-lg text-amber-500">
                {starsText(selectedStats.stars)}
              </span>
              <span className="text-xs text-slate-600">
                {selectedStats.lastHeardAt
                  ? `最終確認 ${timeText(selectedStats.lastHeardAt, now)}`
                  : "今シーズンの確認はまだありません"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              今日 {selectedStats.todayReports.filter((r) => r.heard).length} 件確認
              ・ 昨日 {selectedStats.yesterdayHeardCount} 件 ・ 今シーズン計{" "}
              {selectedStats.seasonHeardCount} 件
            </p>

            {selected.externalRecord && (
              <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                {selected.externalRecord.date.replace(
                  /^(\d{4})-(\d{2})-(\d{2}|XX)$/,
                  (_, y, m, d) => `${y}年${Number(m)}月${d === "XX" ? "" : `${Number(d)}日`}`
                )}
                {selected.externalRecord.time !== "不明" &&
                  ` ${selected.externalRecord.time}`}
                、ヒグラシが確認されたという記録があります。
                <a
                  className="ml-1 text-sky-600 underline"
                  href={selected.externalRecord.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  記録を見る（外部サイト）
                </a>
              </div>
            )}

            {postState.kind === "done" ? (
              <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-bold">カナカナ情報を受け取りました。</p>
                <p className="mt-1 text-xs">
                  今日ヒグラシを探している誰かの助けになります。
                </p>
                {postState.heard && (
                  <a
                    className="mt-2 inline-block rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white"
                    href={xShareUrl(selected, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    𝕏 でシェアする
                  </a>
                )}
              </div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="touch-manipulation select-none rounded-xl bg-emerald-600 px-2 py-3.5 text-sm font-bold text-white shadow active:bg-emerald-700 disabled:opacity-50"
                    disabled={postState.kind === "sending"}
                    onClick={() => post(true)}
                  >
                    🌲 カナカナ聞こえた！
                  </button>
                  <button
                    className="touch-manipulation select-none rounded-xl bg-slate-600 px-2 py-3.5 text-sm font-bold text-white shadow active:bg-slate-700 disabled:opacity-50"
                    disabled={postState.kind === "sending"}
                    onClick={() => post(false)}
                  >
                    🌙 今日は静かだった
                  </button>
                </div>
                {postState.kind === "sending" && (
                  <p className="mt-2 text-xs text-slate-500">送信中…</p>
                )}
                {postState.kind === "error" && (
                  <p className="mt-2 text-xs text-red-600">{postState.message}</p>
                )}
                <div className="mt-2 flex items-center gap-4">
                  <a
                    className="text-xs text-slate-500 underline"
                    href={xShareUrl(selected, false)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    この場所を𝕏で共有
                  </a>
                </div>
                {!showComment ? (
                  <button
                    className="mt-2 text-xs text-sky-600 underline"
                    onClick={() => setShowComment(true)}
                  >
                    ひとこと添える（任意）
                  </button>
                ) : (
                  <input
                    className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-base"
                    placeholder="例: 駐車場の奥の林でよく鳴いています"
                    maxLength={200}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                )}
              </>
            )}

            {selectedStats.todayReports.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-bold text-slate-600">今日の報告</h3>
                <ul className="mt-1 space-y-1">
                  {selectedStats.todayReports.slice(0, 8).map((r) => (
                    <li key={r.id} className="text-xs text-slate-600">
                      {timeText(new Date(r.created_at), now)}{" "}
                      {r.heard ? "🌲 聞こえた" : "🌙 静かだった"}
                      {r.comment && (
                        <span className="text-slate-500"> — {r.comment}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
