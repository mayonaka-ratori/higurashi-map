"use client";

// スポットの詳細と投稿。PCは右パネルの中身を差し替え、スマホは下から出るシート。
// どちらも投稿の2ボタンは下端に貼り付けて、スクロールしても消えないようにする。
import type { CSSProperties } from "react";
import type { Place } from "@/lib/types";
import {
  FRESHNESS_LABEL,
  hm,
  notesLabel,
  notesText,
  reasonText,
  type PlaceStats,
} from "@/lib/score";
import { C, dotStyle, notesStyle } from "@/lib/design";
import { distText, type PostState } from "@/lib/view";

type Props = {
  variant: "pc" | "sp";
  place: Place;
  stats: PlaceStats;
  dist: number | null;
  now: Date;
  railState: string;
  postState: PostState;
  comment: string;
  showComment: boolean;
  shareUrl: string;
  doneShareUrl: string;
  onComment: (v: string) => void;
  onOpenComment: () => void;
  onPost: (heard: boolean) => void;
  onRetry: () => void;
  onCloseDone: () => void;
  onOpenLater: () => void;
  onClose: () => void;
};

const primaryBtn = (bg: string, pc: boolean): CSSProperties => ({
  borderRadius: pc ? 12 : 14,
  background: bg,
  padding: pc ? "15px 8px" : "17px 6px",
  fontFamily: "inherit",
  fontSize: pc ? 15 : 14,
  fontWeight: 700,
  color: C.white,
  border: 0,
  cursor: "pointer",
  lineHeight: 1.35,
});

export default function PlaceDetail(props: Props) {
  const {
    variant,
    place,
    stats,
    dist,
    now,
    railState,
    postState,
    comment,
    showComment,
    shareUrl,
    doneShareUrl,
    onComment,
    onOpenComment,
    onPost,
    onRetry,
    onCloseDone,
    onOpenLater,
    onClose,
  } = props;
  const pc = variant === "pc";
  const d = distText(dist);

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: pc ? 10 : 9 }}>
        <span style={dotStyle(stats.freshness, 12)} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.slateBtn,
            letterSpacing: pc ? ".07em" : ".06em",
          }}
        >
          {FRESHNESS_LABEL[stats.freshness]}
        </span>
        {!pc && (
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              marginLeft: "auto",
              marginRight: -10,
              background: "none",
              border: 0,
              fontSize: 17,
              lineHeight: 1,
              color: C.muted,
              cursor: "pointer",
              padding: "11px 13px",
            }}
          >
            ✕
          </button>
        )}
      </div>
      <h2
        style={{
          margin: pc ? "9px 0 0" : "6px 0 0",
          fontSize: pc ? 24 : 22,
          fontWeight: 700,
          color: C.ink,
          lineHeight: pc ? 1.28 : 1.3,
        }}
      >
        {place.name}
      </h2>
      <p
        style={{
          margin: pc ? "6px 0 0" : "5px 0 0",
          fontSize: 13,
          color: C.slateBtn,
        }}
      >
        {place.pref} {place.city}
        {d && ` ・ ここから ${d}`}
      </p>
      <div
        style={{
          marginTop: pc ? 16 : 13,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span style={notesStyle(pc ? 21 : 19)}>{notesText(stats.stars)}</span>
        <span style={{ fontSize: 12, color: pc ? C.muted : C.slateBtn }}>
          期待度・{notesLabel(stats.stars)}
        </span>
      </div>
      <p
        style={{
          margin: pc ? "7px 0 0" : "6px 0 0",
          fontSize: 14,
          fontWeight: 700,
          color: C.reason,
        }}
      >
        {reasonText(stats, now)}
      </p>
      <p
        style={{
          margin: pc ? "7px 0 0" : "6px 0 0",
          fontSize: 12,
          color: C.muted,
        }}
      >
        今日 {stats.todayHeardCount} 件確認 ・ 昨日 {stats.yesterdayHeardCount}{" "}
        件 ・ 今シーズン計 {stats.seasonHeardCount} 件
      </p>

      {place.externalRecord && (
        <p
          style={{
            margin: "12px 0 0",
            padding: 10,
            borderRadius: 10,
            background: C.panelAlt,
            fontSize: 12,
            color: C.slateBtn,
            lineHeight: 1.7,
          }}
        >
          {place.externalRecord.date.replace(
            /^(\d{4})-(\d{2})-(\d{2}|XX)$/,
            (_, y, m, dd) =>
              `${y}年${Number(m)}月${dd === "XX" ? "" : `${Number(dd)}日`}`
          )}
          {place.externalRecord.time !== "不明" && ` ${place.externalRecord.time}`}
          、ヒグラシが確認されたという記録があります。
          <a
            style={{
              marginLeft: 4,
              color: C.greenHover,
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
            href={place.externalRecord.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            記録を見る（外部サイト）
          </a>
        </p>
      )}

      {stats.todayReports.length > 0 && (
        <div style={{ marginTop: pc ? 22 : 18 }}>
          <h3
            style={{
              margin: pc ? "0 0 5px" : "0 0 4px",
              fontSize: pc ? 12 : 11,
              fontWeight: 700,
              color: C.slateBtn,
              letterSpacing: ".07em",
            }}
          >
            今日の報告
          </h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {stats.todayReports.slice(0, 8).map((r) => (
              <li
                key={r.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 0",
                  borderTop: "1px solid #f2f5f4",
                }}
              >
                <span
                  style={{
                    flex: "none",
                    width: pc ? 44 : 42,
                    fontSize: 12,
                    color: C.muted,
                    paddingTop: 1,
                  }}
                >
                  {hm(new Date(r.created_at))}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: r.heard ? 700 : 400,
                      color: r.heard ? C.greenHover : C.muted,
                    }}
                  >
                    {r.heard ? "🌲 聞こえた" : "🌙 静かだった"}
                  </span>
                  {r.comment && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 3,
                        fontSize: 12,
                        color: C.muted,
                        lineHeight: 1.55,
                      }}
                    >
                      「{r.comment}」
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          marginTop: pc ? 22 : 18,
          fontSize: 13,
          color: C.muted,
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        この場所を𝕏で共有
      </a>
    </>
  );

  const footer = (
    <div
      style={{
        flex: "none",
        borderTop: `1px solid ${C.border}`,
        background: C.postBg,
        padding: pc
          ? "15px 20px 17px"
          : "14px 18px calc(20px + env(safe-area-inset-bottom))",
      }}
    >
      {postState.kind === "idle" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <button
              onClick={() => onPost(true)}
              style={primaryBtn(C.green, pc)}
            >
              🌲 カナカナ聞こえた！
            </button>
            <button
              onClick={() => onPost(false)}
              style={primaryBtn(C.slateBtn, pc)}
            >
              🌙 今日は静かだった
            </button>
          </div>
          {showComment ? (
            <input
              value={comment}
              onChange={(e) => onComment(e.target.value)}
              maxLength={200}
              placeholder="例: 駐車場の奥の林でよく鳴いています"
              style={{
                marginTop: pc ? 10 : 11,
                width: "100%",
                padding: pc ? "11px 13px" : "12px 13px",
                border: `1px solid ${C.border3}`,
                borderRadius: pc ? 10 : 11,
                // スマホは16px未満だと iOS Safari が勝手にズームする
                fontSize: pc ? 14 : 16,
                color: C.ink,
                outline: "none",
                background: C.white,
                fontFamily: "inherit",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                marginTop: 6,
              }}
            >
              <button
                onClick={onOpenComment}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                  fontSize: 13,
                  color: C.slateBtn,
                  background: "none",
                  border: 0,
                  padding: pc ? "10px 2px" : "11px 2px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1, color: C.muted }}>
                  ＋
                </span>
                ひとこと添える（任意）
              </button>
              <button
                onClick={onOpenLater}
                style={{
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.ink,
                  background: C.white,
                  border: `1px solid ${C.border3}`,
                  borderRadius: 9999,
                  padding: pc ? "9px 14px" : "11px 15px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                さっき聞いた分を記録
              </button>
            </div>
          )}
        </>
      )}

      {postState.kind === "sending" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: pc ? "16px 4px" : "18px 4px",
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 9999,
              background: C.green,
              animation: "higPulse 1.2s ease-out infinite",
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color: C.reason }}>
            送信中…
          </span>
        </div>
      )}

      {postState.kind === "done" && (
        <div
          style={{
            borderRadius: pc ? 13 : 14,
            background: C.answerBg,
            border: "1px solid #a7f3d0",
            padding: 16,
            animation: "higRise .28s ease-out",
          }}
        >
          <div
            style={{ fontSize: pc ? 15 : 16, fontWeight: 700, color: C.reason }}
          >
            カナカナ情報を受け取りました。
          </div>
          <p
            style={{
              margin: "7px 0 0",
              fontSize: 13,
              color: C.greenHover,
              lineHeight: 1.65,
            }}
          >
            今日ヒグラシを探している誰かの助けになります。
          </p>
          {postState.heard && !postState.backdated && (
            <p
              style={{
                margin: pc ? "9px 0 0" : "8px 0 0",
                fontSize: 12,
                color: C.greenHover,
              }}
            >
              この場所のピンが今 🟢 になりました。
            </p>
          )}
          <div style={{ marginTop: 13, display: "flex", gap: 10 }}>
            {postState.heard && (
              <a
                href={doneShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  textAlign: "center",
                  borderRadius: pc ? 11 : 12,
                  background: C.ink,
                  color: C.white,
                  padding: pc ? "12px 8px" : "14px 8px",
                  fontSize: pc ? 13 : 14,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                𝕏 でシェアする
              </a>
            )}
            <button
              onClick={onCloseDone}
              style={{
                flex: 1,
                borderRadius: pc ? 11 : 12,
                background: C.white,
                border: `1px solid ${C.border3}`,
                color: C.slateBtnHover,
                padding: pc ? "12px 8px" : "14px 8px",
                fontSize: pc ? 13 : 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {postState.kind === "error" && (
        <div
          style={{
            borderRadius: pc ? 12 : 13,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            padding: pc ? 14 : 15,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: C.danger }}>
            送信できませんでした
          </div>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#b91c1c",
              lineHeight: 1.6,
            }}
          >
            {postState.message}
          </p>
          <button
            onClick={onRetry}
            style={{
              marginTop: pc ? 11 : 12,
              width: "100%",
              borderRadius: pc ? 10 : 12,
              background: C.danger,
              color: C.white,
              border: 0,
              padding: pc ? 12 : 14,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            もう一度送る
          </button>
        </div>
      )}
    </div>
  );

  if (pc) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: C.white,
          display: "flex",
          flexDirection: "column",
          animation: "higFade .2s ease-out",
        }}
      >
        <div
          style={{
            flex: "none",
            background: C.railBg,
            color: C.onDark,
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: 0,
              color: C.onDarkSub,
              fontSize: 14,
              cursor: "pointer",
              padding: "2px 0",
              fontFamily: "inherit",
            }}
          >
            ← もどる
          </button>
          <span
            style={{ marginLeft: "auto", fontSize: 12, color: C.nowTone }}
          >
            {railState}
          </span>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "20px 22px 24px",
          }}
        >
          {body}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1400,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <button
        onClick={onClose}
        aria-label="閉じる"
        style={{
          flex: 1,
          background: "rgba(15,23,42,.2)",
          border: 0,
          cursor: "pointer",
        }}
      />
      <div
        style={{
          flex: "none",
          background: C.white,
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 26px rgba(15,23,42,.26)",
          maxHeight: "76vh",
          display: "flex",
          flexDirection: "column",
          animation: "higRise .26s ease-out",
        }}
      >
        <div
          style={{
            flex: "none",
            display: "flex",
            justifyContent: "center",
            padding: "9px 0 3px",
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
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "6px 18px 18px",
          }}
        >
          {body}
        </div>
        {footer}
      </div>
    </div>
  );
}
