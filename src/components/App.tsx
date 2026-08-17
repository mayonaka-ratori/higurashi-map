"use client";

// 画面はひとつの問いにだけ答える —「今日、どこへ行けば聞けるか」。
// 断定できる根拠がある日は地点名を一つ出し、無い日は別の画面に切り替える。
// 設計の根拠は docs/design-handoff-v2/README.md にある。数値はそこから持ってくること。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import placesJson from "@/data/places.json";
import type { NewReport, Place, Report } from "@/lib/types";
import {
  demoMode,
  enqueueReport,
  fetchReports,
  flushQueue,
  insertReport,
  isThrottled,
  markPosted,
} from "@/lib/store";
import {
  distanceKm,
  freshnessOf,
  hm,
  placeStats,
  rankScore,
  type PlaceStats,
} from "@/lib/score";
import { listeningWindows, type ListeningState } from "@/lib/sun";
import { C } from "@/lib/design";
import {
  buildAnswerVM,
  type FreePostState,
  type FreeReport,
  type PostState,
  type Ranked,
} from "@/lib/view";
import DayRail from "./DayRail";
import AnswerBlock from "./AnswerBlock";
import PlaceDetail from "./PlaceDetail";
import QuickPostSheet, { type LaterAt } from "./QuickPostSheet";
import type { FreeTapInfo, MapHandle } from "./MapView";
import MapOverlay from "./MapOverlay";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const places = placesJson as Place[];
const INITIAL_NOW = new Date(2000, 0, 1);

// 現在地が取れないときの日の入り計算の基準（埼玉南部）。
// 関東の中なら数分しか変わらないので、聞きどきの目安には足りる
const FALLBACK_ORIGIN = { lat: 35.83, lng: 139.55 };

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

// 自由報告の座標のまとめ方。送信時と同じ小数3桁（約100m）で1点にする
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// X（旧Twitter）の投稿画面を開くURLを作る
function xShareUrl(place: Place, heard: boolean): string {
  const link = `${window.location.origin}/?place=${place.id}`;
  const text = heard
    ? `${place.name}でヒグラシの声を確認しました🌲\n#ひぐらしのなくところに`
    : `今日、カナカナが聞こえる場所。${place.name}の最新状況はこちら\n#ひぐらしのなくところに`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
}

// 自由報告のシェア。場所の名前が無いので、地点名もリンク先の地点も入れない
function xShareFreeUrl(): string {
  const text = "ヒグラシの声を確認しました🌲\n#ひぐらしのなくところに";
  return `https://x.com/intent/post?text=${encodeURIComponent(
    text
  )}&url=${encodeURIComponent(window.location.origin)}`;
}

// 「さっき聞いた分」の時刻。朝と夕は実際の夜明け・日の入りに合わせる
function laterTime(t: LaterAt, now: Date, win: ListeningState | null): Date {
  if (t === "さっき") return new Date(now.getTime() - 15 * 60000);
  if (t === "1時間前") return new Date(now.getTime() - 60 * 60000);
  if (t === "今朝") {
    const dawn =
      win?.dawn ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0);
    return dawn > now ? now : dawn;
  }
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  y.setHours(win ? win.dusk.getHours() : 18, win ? win.dusk.getMinutes() : 30, 0, 0);
  return y;
}

export default function App() {
  const [reports, setReports] = useState<Report[]>([]);
  const [clock, setClock] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [variant, setVariant] = useState<"pc" | "sp">("sp");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPt, setHoverPt] = useState<{ x: number; y: number } | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"reco" | "near">("reco");
  const [postState, setPostState] = useState<PostState>({ kind: "idle" });
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  // 地図に名前が載っていない場所への記録。地点詳細とは別に持つ
  const [freePostState, setFreePostState] = useState<FreePostState>({
    kind: "idle",
  });
  const [freeTip, setFreeTip] = useState<{
    info: FreeTapInfo;
    pt: { x: number; y: number };
  } | null>(null);
  const [quick, setQuick] = useState<"now" | "later" | null>(null);
  const [laterAt, setLaterAt] = useState<LaterAt>("さっき");
  // 現在地の取得を待っているあいだ。待っているのに「近い順」の顔で
  // 遠い場所を出すと、急いでいる人が間違った場所へ投稿してしまう
  const [locating, setLocating] = useState(false);

  const mapRef = useRef<MapHandle | null>(null);
  const reloadSeq = useRef(0);
  const lastPost = useRef<{ heard: boolean; placeId: string; at?: Date } | null>(
    null
  );

  const pc = variant === "pc";
  // サーバーとブラウザで現在時刻がずれないよう、最初は固定値にする。
  // 実際の時計は画面が開いてから reload で入れる。
  const now = clock ?? INITIAL_NOW;

  // 画面幅で組み方を変える。PCは右パネル、それ以外は下端のカード。
  // 端末の回転やウィンドウの拡縮でも切り替わるよう resize も見る
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setVariant(mq.matches ? "pc" : "sp");
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  // 共有リンク（?place=地点ID）で開かれたら、その地点を選択状態にする
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("place");
    if (id && places.some((p) => p.id === id)) setSelectedId(id);
  }, []);

  const reload = useCallback(async () => {
    const requestId = ++reloadSeq.current;
    const n = new Date();
    setClock(n);
    try {
      const nextReports = await fetchReports(n);
      if (requestId !== reloadSeq.current) return;
      setReports(nextReports);
      setLoadError(false);
    } catch {
      if (requestId === reloadSeq.current) setLoadError(true);
    }
  }, []);

  // 溜まっている投稿を送ってから、最新の状況を取り直す。
  // 電波が戻った瞬間（online）にも同じことをする
  useEffect(() => {
    const tick = async () => {
      await flushQueue();
      reload();
    };
    tick();
    const t = setInterval(tick, 60 * 1000); // 1分ごとに更新
    window.addEventListener("online", tick);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", tick);
    };
  }, [reload]);

  const statsById = useMemo(() => {
    const byPlace = new Map<string, Report[]>();
    for (const r of reports) {
      // 自由報告はどのスポットの記録でもないので、期待度の計算に入れない
      if (!r.place_id) continue;
      const list = byPlace.get(r.place_id);
      if (list) list.push(r);
      else byPlace.set(r.place_id, [r]);
    }
    const m: Record<string, PlaceStats> = {};
    for (const p of places) {
      m[p.id] = placeStats(byPlace.get(p.id) ?? [], now, p.externalRecord);
    }
    return m;
  }, [reports, now]);

  const win = useMemo(
    () => {
      if (!clock) return null;
      return listeningWindows(
        now,
        userPos?.lat ?? FALLBACK_ORIGIN.lat,
        userPos?.lng ?? FALLBACK_ORIGIN.lng
      );
    },
    [clock, now, userPos]
  );

  // 今日届いた報告（全地点ぶん）。時間帯レールに点で打つ
  const todayReports = useMemo(() => {
    const today0 = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    return reports
      .filter((r) => Date.parse(r.created_at) >= today0)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [reports, now]);

  // 地図に名前が載っていない場所での「聞こえた」。約100mごとに1点へまとめる。
  // 鮮度はここで確定させる（地図には現在時刻を渡していない）
  const freeReports = useMemo<FreeReport[]>(() => {
    const bySpot = new Map<string, FreeReport>();
    for (const r of reports) {
      if (r.place_id || r.latitude == null || r.longitude == null || !r.heard) {
        continue;
      }
      const lat = round3(r.latitude);
      const lng = round3(r.longitude);
      const key = `${lat},${lng}`;
      const at = Date.parse(r.created_at);
      const cur = bySpot.get(key);
      if (cur) {
        cur.count += 1;
        if (at > cur.latestAtMs) cur.latestAtMs = at;
      } else {
        bySpot.set(key, { lat, lng, count: 1, latestAtMs: at, freshness: "season" });
      }
    }
    return [...bySpot.values()].map((f) => ({
      ...f,
      freshness: freshnessOf(new Date(f.latestAtMs), now),
    }));
  }, [reports, now]);

  // 現在地が無いあいだは「近い順」を名乗れないので、おすすめ順のまま出す
  const effSort = userPos ? sort : "reco";

  const ranked = useMemo<Ranked[]>(() => {
    const out = places.map((p) => ({
      p,
      s: statsById[p.id],
      d: userPos ? distanceKm(userPos.lat, userPos.lng, p.lat, p.lng) : null,
    }));
    out.sort(
      (a, b) =>
        rankScore(b.s, b.d) - rankScore(a.s, a.d) || (a.d ?? 0) - (b.d ?? 0)
    );
    return out;
  }, [statsById, userPos]);

  // 答えはおすすめ順で固定し、一覧だけを切り替える。
  const displayRanked = useMemo(() => {
    if (effSort !== "near") return ranked;
    return [...ranked].sort(
      (a, b) => (a.d ?? 0) - (b.d ?? 0) || b.s.score - a.s.score
    );
  }, [effSort, ranked]);

  // 答え・候補・見出しはここで一緒に決める。画面が嘘をつかないように、
  // 実績のない行を「実績のある場所」の下に置かない
  const todayOnes = ranked.filter((r) => r.s.freshness === "today");
  const answer =
    todayOnes.length > 0 && todayOnes[0].s.stars >= 3 ? todayOnes[0] : null;
  const others = displayRanked.filter((r) => !answer || r.p.id !== answer.p.id);
  const othersWithRecord = others.filter((r) => r.s.freshness !== "none");
  const restHasRecords = othersWithRecord.length > 0;
  const restPool = (restHasRecords ? othersWithRecord : others).slice(
    0,
    pc ? 5 : 6
  );

  const vm = useMemo(
    () =>
      buildAnswerVM({
        answer,
        hasTodayReports: todayReports.length > 0,
        todayReportCount: todayReports.length,
        restHasRecords,
        hasLocation: !!userPos,
        win,
        now,
      }),
    [answer, now, restHasRecords, todayReports.length, userPos, win]
  );

  // 近く（3km以内）で今日いくつ確認があったか。PCの脚注に一行足すためだけに使う
  const nearFreeTodayCount = useMemo(() => {
    if (!userPos) return 0;
    return freeReports
      .filter(
        (f) =>
          f.freshness === "today" &&
          distanceKm(userPos.lat, userPos.lng, f.lat, f.lng) <= 3
      )
      .reduce((n, f) => n + f.count, 0);
  }, [freeReports, userPos]);

  // 近くに今日の確認があるなら、答えが立たない日の脚注をそれに差し替える。
  // スマホの答えカードは高さが決まっていて行を足せないので、PCだけ
  const shownVm = useMemo(() => {
    if (!pc || !vm.isEmpty || nearFreeTodayCount === 0) return vm;
    return {
      ...vm,
      footnote: `あなたの近く（3km以内）でも、今日${nearFreeTodayCount}件の確認があります。聞こえなかったときも「静かだった」を押すと、次の人の役に立ちます。`,
    };
  }, [pc, vm, nearFreeTodayCount]);

  const normalize = (s: string) => s.normalize("NFKC").toLowerCase();
  const searchResults = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;
    return displayRanked
      .filter((r) => normalize(`${r.p.name} ${r.p.city} ${r.p.pref}`).includes(q))
      .slice(0, 8);
  }, [displayRanked, query]);

  const nearest3 = useMemo(
    () =>
      userPos
        ? [...ranked].sort((a, b) => (a.d ?? 0) - (b.d ?? 0)).slice(0, 3)
        : ranked.slice(0, 3),
    [ranked, userPos]
  );

  const selected = selectedId
    ? (places.find((p) => p.id === selectedId) ?? null)
    : null;
  const selectedRanked = selected
    ? (displayRanked.find((r) => r.p.id === selected.id) ?? null)
    : null;

  const selectPlace = useCallback((id: string | null) => {
    setSelectedId(id);
    setPostState({ kind: "idle" });
    setShowComment(false);
    setComment("");
    setQuick(null);
    setQuery("");
  }, []);

  const doPost = useCallback(
    async (opts: {
      heard: boolean;
      placeId: string;
      at?: Date;
      withComment: boolean;
    }) => {
      const { heard, placeId, at, withComment } = opts;
      lastPost.current = { heard, placeId, at };
      if (isThrottled(placeId)) {
        setPostState({
          kind: "error",
          heard,
          message: "同じ場所への投稿は2分あけてください。",
        });
        return;
      }
      setPostState({ kind: "sending", heard });
      const pos = await getPosition();
      const text = withComment && comment.trim() ? comment.trim().slice(0, 200) : null;
      const payload: NewReport = {
        place_id: placeId,
        heard,
        latitude: pos?.coords.latitude ?? null,
        longitude: pos?.coords.longitude ?? null,
        accuracy: pos?.coords.accuracy ?? null,
        comment: text,
        created_at: at ? at.toISOString() : undefined,
      };
      const fail = () =>
        setPostState({
          kind: "error",
          heard,
          message: "通信環境を確認して、もう一度お試しください。",
        });
      // 端末に置いておいて、電波が戻ってから送る
      const keepForLater = () => {
        if (!enqueueReport(payload)) return false;
        markPosted(placeId);
        setComment("");
        setShowComment(false);
        setPostState({ kind: "queued", heard });
        return true;
      };

      // お試しモードは通信を使わないので、ここでキューへ回してはいけない
      //（流す仕組みが動かず、投稿が永久に消える）
      if (!demoMode && navigator.onLine === false) {
        if (!keepForLater()) fail();
        return;
      }
      const res = await insertReport(payload);
      if (res.ok) {
        markPosted(placeId);
        setComment("");
        setShowComment(false);
        setPostState({ kind: "done", heard });
        await reload();
        return;
      }
      if (res.retryable && !demoMode && keepForLater()) return;
      fail();
    },
    [comment, reload]
  );

  // 現在地で記録する。名前のある場所を選ばない分、地点詳細には何も出さない
  const postFreeReport = useCallback(async () => {
    if (isThrottled("free")) {
      setFreePostState({
        kind: "error",
        message: "続けての記録は2分あけてください。",
      });
      return;
    }
    setFreePostState({ kind: "sending" });
    const pos = await getPosition();
    if (!pos) {
      // 座標が無いと地図に出しようがないので、送る前に止める
      setFreePostState({
        kind: "error",
        message:
          "現在地が取れないため、いまの場所では記録できません。近くの場所から選んでください。",
      });
      return;
    }
    // 座標の丸めは store.ts の insertReport がまとめて行う
    const payload: NewReport = {
      place_id: null,
      heard: true,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      comment: null,
    };
    const fail = () =>
      setFreePostState({
        kind: "error",
        message: "通信環境を確認して、もう一度お試しください。",
      });
    const keepForLater = () => {
      if (!enqueueReport(payload)) return false;
      markPosted("free");
      setFreePostState({ kind: "queued" });
      return true;
    };

    if (!demoMode && navigator.onLine === false) {
      if (!keepForLater()) fail();
      return;
    }
    const res = await insertReport(payload);
    if (res.ok) {
      markPosted("free");
      setFreePostState({ kind: "done" });
      await reload();
      return;
    }
    if (res.retryable && !demoMode && keepForLater()) return;
    fail();
  }, [reload]);

  const openQuick = useCallback(
    async (mode: "now" | "later") => {
      setFreePostState({ kind: "idle" });
      setQuick(mode);
      if (!userPos) {
        setLocating(true);
        const p = await getPosition();
        if (p) setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      }
    },
    [userPos]
  );

  // 押した時点で記録する。完了カードはその地点の詳細に出す
  const quickPost = useCallback(
    (placeId: string, heard: boolean) => {
      const at = quick === "later" ? laterTime(laterAt, now, win) : undefined;
      setQuick(null);
      setQuery("");
      setSelectedId(placeId);
      doPost({ heard, placeId, at, withComment: false });
    },
    [quick, laterAt, now, win, doPost]
  );

  const onSort = useCallback(
    (s: "reco" | "near") => {
      setSort(s);
      if (s === "near" && !userPos) mapRef.current?.locate();
    },
    [userPos]
  );

  const hoverPlace = hoverId
    ? (places.find((p) => p.id === hoverId) ?? null)
    : null;
  const hoverStats = hoverId ? statsById[hoverId] : null;

  const answerBlock = win ? (
    <AnswerBlock
      variant={variant}
      vm={shownVm}
      rest={restPool}
      now={now}
      sort={effSort}
      onSort={onSort}
      onOpen={() => (answer ? selectPlace(answer.p.id) : onSort("near"))}
      onOpenQuick={() => openQuick("now")}
      onSelect={selectPlace}
      onHover={(id) => {
        if (!pc) return;
        setHoverId(id);
        setHoverPt(null);
      }}
    />
  ) : null;

  const selectedDetail = selected && selectedRanked && win ? (
    <PlaceDetail
      variant={variant}
      place={selected}
      stats={selectedRanked.s}
      dist={selectedRanked.d}
      now={now}
      railState={win.state}
      postState={postState}
      comment={comment}
      showComment={showComment}
      shareUrl={xShareUrl(selected, false)}
      doneShareUrl={xShareUrl(selected, true)}
      onComment={setComment}
      onOpenComment={() => setShowComment(true)}
      onPost={(heard) =>
        doPost({ heard, placeId: selected.id, withComment: true })
      }
      onRetry={() =>
        lastPost.current && doPost({ ...lastPost.current, withComment: true })
      }
      onCloseDone={() => setPostState({ kind: "idle" })}
      onOpenLater={() => openQuick("later")}
      onClose={() => selectPlace(null)}
    />
  ) : null;

  const quickSheet = quick ? (
    <QuickPostSheet
      variant={variant}
      mode={quick}
      near={nearest3}
      hasLocation={!!userPos}
      locating={locating}
      laterAt={laterAt}
      onPickTime={setLaterAt}
      onPost={quickPost}
      freeState={freePostState}
      freeShareUrl={xShareFreeUrl()}
      onPostFree={postFreeReport}
      onBackFromFree={() => setFreePostState({ kind: "idle" })}
      onPickOnMap={() => {
        setQuick(null);
        setSelectedId(null);
      }}
      onClose={() => {
        setQuick(null);
        setFreePostState({ kind: "idle" });
      }}
    />
  ) : null;

  // ── ここから画面

  const header = (
    <div
      style={{
        flex: "none",
        display: "flex",
        alignItems: pc ? "center" : "baseline",
        gap: pc ? 14 : 8,
        background: C.headerBg,
        color: C.onDark,
        padding: pc ? "10px 20px" : "11px 14px 9px",
        paddingTop: pc
          ? "calc(10px + env(safe-area-inset-top))"
          : "calc(11px + env(safe-area-inset-top))",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: pc ? ".03em" : ".02em",
        }}
      >
        ひぐらしのなくところに
      </h1>
      {pc ? (
        <span style={{ fontSize: 11, color: C.onDarkSub }}>
          今日、カナカナが聞こえる場所。
        </span>
      ) : (
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: C.onDarkSub,
            flex: "none",
          }}
        >
          {clock ? hm(now) : ""}
        </span>
      )}
    </div>
  );

  const mapArea = (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        background: C.mapBg,
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <MapView
          ref={mapRef}
          places={places}
          statsById={statsById}
          freeReports={freeReports}
          selectedId={selectedId}
          hoverId={hoverId}
          variant={variant}
          onSelect={selectPlace}
          onFreeTap={(info, pt) => setFreeTip({ info, pt })}
          onFreeTapClear={() => setFreeTip(null)}
          onHover={(id, pt) => {
            setHoverId(id);
            setHoverPt(pt);
          }}
          onUserLocate={(lat, lng) => setUserPos({ lat, lng })}
          onLocateStart={() => setSort("near")}
        />
      </div>

      <MapOverlay
        variant={variant}
        query={query}
        onQuery={setQuery}
        searchResults={searchResults}
        onSelect={selectPlace}
        onLocate={() => mapRef.current?.locate()}
        onOpenQuick={() => openQuick("now")}
        now={now}
        hoverPlace={hoverPlace}
        hoverStats={hoverStats}
        hoverPt={hoverPt}
        freeTip={freeTip}
      />

      {/* PCの右パネル。地図は全幅のまま、上に重ねる */}
      {pc && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 404,
            background: C.white,
            boxShadow: "-2px 0 28px rgba(15,23,42,.18)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {answerBlock}
          {selectedDetail}
          {quickSheet}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: C.mapBg,
      }}
    >
      {header}

      {demoMode && (
        <div
          style={{
            flex: "none",
            background: "#fef3c7",
            color: "#78350f",
            padding: "6px 14px",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          お試しモードで動いています。表示中の投稿はサンプルで、あなたの投稿はこの端末にだけ保存されます。
        </div>
      )}
      {loadError && (
        <div
          style={{
            flex: "none",
            background: C.dangerBg,
            color: C.danger,
            padding: "6px 14px",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          データの取得に失敗しました。しばらくして再読み込みしてください。
        </div>
      )}

      {win && (
        <DayRail
          now={now}
          win={win}
          todayReports={todayReports}
          variant={variant}
        />
      )}

      {mapArea}

      {/* スマホ。下端のカードは高さを固定して、状態が変わっても地図が伸び縮みしないようにする */}
      {!pc && win && (
        <div
          style={{
            flex: "none",
            background: C.white,
            borderRadius: "20px 20px 0 0",
            boxShadow: "0 -6px 24px rgba(15,23,42,.2)",
            paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "8px 0 2px",
            }}
          >
            <span
              style={{
                width: 38,
                height: 4,
                borderRadius: 99,
                background: C.border3,
              }}
            />
          </div>
          {answerBlock}
        </div>
      )}

      {!pc && selectedDetail}

      {!pc && quickSheet}
    </div>
  );
}
