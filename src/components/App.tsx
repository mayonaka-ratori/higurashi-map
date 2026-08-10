"use client";

// 画面はひとつの問いにだけ答える —「今日、どこへ行けば聞けるか」。
// 断定できる根拠がある日は地点名を一つ出し、無い日は別の画面に切り替える。
// 設計の根拠は docs/design-handoff-v2/README.md にある。数値はそこから持ってくること。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  distanceKm,
  hm,
  notesLabel,
  notesText,
  placeStats,
  rankScore,
  reasonText,
  type PlaceStats,
} from "@/lib/score";
import { listeningWindows, type ListeningState } from "@/lib/sun";
import { C, dotStyle, notesStyle } from "@/lib/design";
import { placeLineText, type AnswerVM, type PostState, type Ranked } from "@/lib/view";
import DayRail from "./DayRail";
import AnswerBlock from "./AnswerBlock";
import PlaceDetail from "./PlaceDetail";
import QuickPostSheet, { type LaterAt } from "./QuickPostSheet";
import type { MapHandle } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const places = placesJson as Place[];

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

// X（旧Twitter）の投稿画面を開くURLを作る
function xShareUrl(place: Place, heard: boolean): string {
  const link = `${window.location.origin}/?place=${place.id}`;
  const text = heard
    ? `${place.name}でヒグラシの声を確認しました🌲\n#ひぐらしのなくところに`
    : `今日、カナカナが聞こえる場所。${place.name}の最新状況はこちら\n#ひぐらしのなくところに`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
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
  const [now, setNow] = useState(() => new Date());
  const [loadError, setLoadError] = useState(false);
  // 静的に作られたHTMLにはビルド時の時刻が焼き付いている。時刻入りのUIを
  // そのまま出すとハイドレーションが毎回失敗して全体を描き直すことになるため、
  // マウント完了までは時刻を含まない外枠だけを出す
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
  const [quick, setQuick] = useState<"now" | "later" | null>(null);
  const [laterAt, setLaterAt] = useState<LaterAt>("さっき");

  const mapRef = useRef<MapHandle | null>(null);
  const lastPost = useRef<{ heard: boolean; placeId: string; at?: Date } | null>(
    null
  );

  const pc = variant === "pc";

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

  const statsById = useMemo(() => {
    const byPlace = new Map<string, Report[]>();
    for (const r of reports) {
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
    () =>
      listeningWindows(
        now,
        userPos?.lat ?? FALLBACK_ORIGIN.lat,
        userPos?.lng ?? FALLBACK_ORIGIN.lng
      ),
    [now, userPos]
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

  // 現在地が無いあいだは「近い順」を名乗れないので、おすすめ順のまま出す
  const effSort = userPos ? sort : "reco";

  const ranked = useMemo<Ranked[]>(() => {
    const out = places.map((p) => ({
      p,
      s: statsById[p.id],
      d: userPos ? distanceKm(userPos.lat, userPos.lng, p.lat, p.lng) : null,
    }));
    if (effSort === "near") {
      out.sort(
        (a, b) => (a.d ?? 0) - (b.d ?? 0) || b.s.score - a.s.score
      );
    } else {
      out.sort(
        (a, b) =>
          rankScore(b.s, b.d) - rankScore(a.s, a.d) || (a.d ?? 0) - (b.d ?? 0)
      );
    }
    return out;
  }, [statsById, userPos, effSort]);

  // 答え・候補・見出しはここで一緒に決める。画面が嘘をつかないように、
  // 実績のない行を「実績のある場所」の下に置かない
  const todayOnes = ranked.filter((r) => r.s.freshness === "today");
  const answer =
    todayOnes.length > 0 && todayOnes[0].s.stars >= 3 ? todayOnes[0] : null;
  const others = ranked.filter((r) => !answer || r.p.id !== answer.p.id);
  const othersWithRecord = others.filter((r) => r.s.freshness !== "none");
  const restHasRecords = othersWithRecord.length > 0;
  const restPool = (restHasRecords ? othersWithRecord : others).slice(
    0,
    pc ? 5 : 6
  );

  const vm = useMemo<AnswerVM>(() => {
    // 「近い順」を名乗るのは、並びが実際に近い順のときだけ（おすすめ順のままでは嘘になる）
    const nearWord = effSort === "near" ? "を近い順に" : "を";
    if (answer) {
      const c = answer.s.todayReports.find((r) => r.heard && r.comment)?.comment;
      return {
        isEmpty: false,
        kicker: win?.active?.kind === "dawn" ? "今朝はここ" : "今夜はここ",
        headline: answer.p.name,
        placeLine: placeLineText(answer, "ここから "),
        notes: notesText(answer.s.stars),
        notesLabel: `期待度・${notesLabel(answer.s.stars)}`,
        reason: reasonText(answer.s, now),
        comment: c ? `「${c}」` : null,
        emptyLead: null,
        openLabel: "この場所を見る",
        restTitle: restHasRecords ? "ほかの候補" : "近くの場所",
        footnote:
          "近さも考えに入れて並べています。♪ は「どれだけ鳴いていそうか」の目安です。",
      };
    }
    const heardToday = todayReports.filter((r) => r.heard).length;
    const emptyLead = todayOnes.length
      ? `今日届いているのは ${heardToday} 件だけです。下は実績のある場所${nearWord}出しています。`
      : !restHasRecords
        ? effSort === "near"
          ? "下は現在地から近い場所です。行って聞こえたら、その場で教えてください。"
          : "下はいま期待できる場所です。行って聞こえたら、その場で教えてください。"
        : win?.daytime
          ? "曇りの日や暗い林なら日中でも鳴きます。下は今シーズン鳴いた実績のある場所です。"
          : `夜明けと日の入りの前後30分が聞きどきです。下は実績のある場所${nearWord}出しています。`;
    return {
      isEmpty: true,
      kicker: "きょうの状況",
      headline: todayOnes.length
        ? "確かなことは、まだ言えません"
        : "今日はまだ誰も聞いていません",
      placeLine: null,
      notes: "",
      notesLabel: "",
      reason: "",
      comment: null,
      emptyLead,
      openLabel: "近い順にならべる",
      restTitle: restHasRecords ? "実績のある場所" : "近くの場所",
      footnote:
        "今日の一件目になれます。聞こえなかったときも「静かだった」を押すと、次の人の役に立ちます。",
    };
  }, [answer, todayOnes.length, restHasRecords, todayReports, win, now, effSort]);

  const normalize = (s: string) => s.normalize("NFKC").toLowerCase();
  const searchResults = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;
    return ranked
      .filter((r) => normalize(`${r.p.name} ${r.p.city} ${r.p.pref}`).includes(q))
      .slice(0, 8);
  }, [query, ranked]);

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
    ? (ranked.find((r) => r.p.id === selected.id) ?? null)
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
      try {
        await insertReport({
          place_id: placeId,
          heard,
          latitude: pos?.coords.latitude ?? null,
          longitude: pos?.coords.longitude ?? null,
          accuracy: pos?.coords.accuracy ?? null,
          comment: text,
          created_at: at ? at.toISOString() : undefined,
        });
        markPosted(placeId);
        setComment("");
        setShowComment(false);
        // 昨日以前の後追い投稿はピンが🟢（今日）にならないので、完了カードに伝える
        const today0 = new Date();
        today0.setHours(0, 0, 0, 0);
        setPostState({ kind: "done", heard, backdated: !!at && at < today0 });
        await reload();
      } catch {
        setPostState({
          kind: "error",
          heard,
          message: "通信環境を確認して、もう一度お試しください。",
        });
      }
    },
    [comment, reload]
  );

  const openQuick = useCallback(
    async (mode: "now" | "later") => {
      setQuick(mode);
      if (!userPos) {
        const p = await getPosition();
        if (p) setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      }
    },
    [userPos]
  );

  // 押した時点で記録する。完了カードはその地点の詳細に出す
  const quickPost = useCallback(
    (placeId: string) => {
      const at = quick === "later" ? laterTime(laterAt, now, win) : undefined;
      setQuick(null);
      setQuery("");
      setSelectedId(placeId);
      doPost({ heard: true, placeId, at, withComment: false });
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

  const hoverPlace = hoverId ? places.find((p) => p.id === hoverId) : null;
  const hoverStats = hoverId ? statsById[hoverId] : null;

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
          {/* ビルド時の時刻が静的HTMLに残らないよう、マウント前は空にする */}
          {mounted ? hm(now) : ""}
        </span>
      )}
    </div>
  );

  // マウント前（静的HTMLとハイドレーション直後の1描画目）は、
  // 時刻で内容が変わる部品を出さない。出すとビルド時の時刻と食い違って
  // ハイドレーションが失敗し、毎回コンソールエラーと描き直しが起きる
  if (!mounted) {
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
      </div>
    );
  }

  const searchBox = (
    <div
      style={{
        position: "absolute",
        pointerEvents: "auto",
        ...(pc
          ? { left: 68, top: 14, width: 300 }
          : { left: 12, right: 12, top: 12 }),
      }}
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={pc ? "地点名で探す（例: 見沼、高尾）" : "地点名で探す"}
        aria-label="地点名で探す"
        style={{
          width: "100%",
          padding: pc ? "11px 14px" : "12px 14px",
          border: pc ? "1px solid rgba(15,23,42,.12)" : 0,
          borderRadius: 11,
          // スマホは16px未満だと iOS Safari が勝手にズームする
          fontSize: pc ? 14 : 16,
          color: C.ink,
          outline: "none",
          background: "rgba(255,255,255,.97)",
          boxShadow: `0 2px 12px rgba(15,23,42,${pc ? ".14" : ".2"})`,
          fontFamily: "inherit",
        }}
      />
      {searchResults && (
        <ul
          style={{
            margin: "8px 0 0",
            padding: 0,
            listStyle: "none",
            background: "rgba(255,255,255,.98)",
            borderRadius: 11,
            boxShadow: `0 4px 18px rgba(15,23,42,${pc ? ".18" : ".22"})`,
            overflow: "hidden",
            maxHeight: pc ? 320 : 300,
            overflowY: "auto",
          }}
        >
          {searchResults.map((r) => (
            <li key={r.p.id}>
              <button
                onClick={() => selectPlace(r.p.id)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 10,
                  padding: pc ? "11px 13px" : 13,
                  background: "none",
                  border: 0,
                  borderBottom: `1px solid ${C.hairline}`,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={dotStyle(r.s.freshness, 11)} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: pc ? 14 : 15,
                      fontWeight: 700,
                      color: C.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.p.name}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 2,
                      fontSize: 11,
                      color: C.muted,
                    }}
                  >
                    {placeLineText(r)}
                  </span>
                </span>
                <span style={notesStyle(pc ? 14 : 13)}>
                  {notesText(r.s.stars)}
                </span>
              </button>
            </li>
          ))}
          {searchResults.length === 0 && (
            <li
              style={{
                padding: "16px 14px",
                fontSize: 13,
                color: C.muted,
                lineHeight: 1.7,
              }}
            >
              見つかりませんでした。別の言い方で探すか、地図から選んでください。
            </li>
          )}
        </ul>
      )}
    </div>
  );

  const legend = (
    <div
      style={{
        position: "absolute",
        left: 16,
        // 地図の出典表示（左下）に重ねないぶんだけ上げる
        bottom: 44,
        pointerEvents: "auto",
        background: "rgba(255,255,255,.96)",
        border: `1px solid ${C.border2}`,
        borderRadius: 11,
        padding: "10px 14px",
        boxShadow: "0 3px 14px rgba(15,23,42,.12)",
        display: "flex",
        gap: 16,
      }}
    >
      {(
        [
          ["today", "今日", C.ink],
          ["recent3d", "3日内", C.slateBtnHover],
          ["season", "今季", C.slateBtn],
          ["none", "記録なし", C.muted],
        ] as const
      ).map(([f, label, color]) => (
        <span
          key={f}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color,
          }}
        >
          <span style={dotStyle(f, f === "today" ? 16 : f === "recent3d" ? 13 : 11)} />
          {label}
        </span>
      ))}
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
          selectedId={selectedId}
          hoverId={hoverId}
          variant={variant}
          onSelect={selectPlace}
          onHover={(id, pt) => {
            setHoverId(id);
            setHoverPt(pt);
          }}
          onUserLocate={(lat, lng) => setUserPos({ lat, lng })}
        />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1200,
        }}
      >
        {searchBox}
        {pc && legend}
        {!pc && (
          <>
            <button
              onClick={() => mapRef.current?.locate()}
              aria-label="現在地から近い場所を探す"
              style={{
                position: "absolute",
                right: 12,
                top: 76,
                pointerEvents: "auto",
                width: 46,
                height: 46,
                border: 0,
                borderRadius: 14,
                background: "rgba(255,255,255,.97)",
                color: C.slateBtnHover,
                fontSize: 19,
                lineHeight: 1,
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(15,23,42,.22)",
              }}
            >
              ◎
            </button>
            <button
              onClick={() => openQuick("now")}
              style={{
                position: "absolute",
                right: 12,
                bottom: 14,
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "15px 18px",
                border: 0,
                borderRadius: 16,
                background: C.green,
                color: C.white,
                fontFamily: "inherit",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 5px 18px rgba(5,150,105,.42)",
              }}
            >
              🌲 いま聞こえた
            </button>
          </>
        )}

        {pc && hoverPlace && hoverStats && hoverPt && (
          <div
            style={{
              position: "absolute",
              left: hoverPt.x,
              top: hoverPt.y - 16,
              transform: "translate(-50%,-100%)",
              background: C.white,
              border: `1px solid ${C.border2}`,
              borderRadius: 10,
              padding: "9px 13px",
              boxShadow: "0 6px 20px rgba(15,23,42,.2)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
              {hoverPlace.name}
            </div>
            <div
              style={{
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={dotStyle(hoverStats.freshness, 10)} />
              <span style={{ fontSize: 12, color: C.slateBtn }}>
                {reasonText(hoverStats, now)}
              </span>
              <span style={notesStyle(12)}>{notesText(hoverStats.stars)}</span>
            </div>
          </div>
        )}
      </div>

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
          {win && (
            <AnswerBlock
              variant="pc"
              vm={vm}
              rest={restPool}
              now={now}
              sort={effSort}
              onSort={onSort}
              onOpen={() =>
                answer ? selectPlace(answer.p.id) : onSort("near")
              }
              onOpenQuick={() => openQuick("now")}
              onSelect={selectPlace}
              onHover={(id) => {
                setHoverId(id);
                setHoverPt(null);
              }}
            />
          )}
          {selected && selectedRanked && win && (
            <PlaceDetail
              variant="pc"
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
                lastPost.current &&
                doPost({ ...lastPost.current, withComment: true })
              }
              onCloseDone={() => setPostState({ kind: "idle" })}
              onOpenLater={() => openQuick("later")}
              onClose={() => selectPlace(null)}
            />
          )}
          {quick && (
            <QuickPostSheet
              variant="pc"
              mode={quick}
              near={nearest3}
              hasLocation={!!userPos}
              laterAt={laterAt}
              onPickTime={setLaterAt}
              onPost={quickPost}
              onPickOnMap={() => {
                setQuick(null);
                setSelectedId(null);
              }}
              onClose={() => setQuick(null)}
            />
          )}
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
            background: "#fef2f2",
            color: "#991b1b",
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
          <AnswerBlock
            variant="sp"
            vm={vm}
            rest={restPool}
            now={now}
            sort={effSort}
            onSort={onSort}
            onOpen={() => (answer ? selectPlace(answer.p.id) : onSort("near"))}
            onOpenQuick={() => openQuick("now")}
            onSelect={selectPlace}
            onHover={() => {}}
          />
        </div>
      )}

      {!pc && selected && selectedRanked && win && (
        <PlaceDetail
          variant="sp"
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
      )}

      {!pc && quick && (
        <QuickPostSheet
          variant="sp"
          mode={quick}
          near={nearest3}
          hasLocation={!!userPos}
          laterAt={laterAt}
          onPickTime={setLaterAt}
          onPost={quickPost}
          onPickOnMap={() => {
            setQuick(null);
            setSelectedId(null);
          }}
          onClose={() => setQuick(null)}
        />
      )}
    </div>
  );
}
