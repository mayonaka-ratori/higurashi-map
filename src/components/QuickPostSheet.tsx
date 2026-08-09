"use client";

// 地点を先に選ばせずに投稿を終わらせるための入口。
// 現在地から近い3件を出し、押した時点で記録する。
// 「さっき聞いた分」は時刻を選んでから場所を押す。
import type { CSSProperties } from "react";
import { C, dotStyle } from "@/lib/design";
import { placeLineText, type Ranked } from "@/lib/view";

export type LaterAt = "さっき" | "1時間前" | "今朝" | "昨日の夕方";
export const LATER_TIMES: LaterAt[] = ["さっき", "1時間前", "今朝", "昨日の夕方"];

type Props = {
  variant: "pc" | "sp";
  mode: "now" | "later";
  near: Ranked[];
  // 現在地が取れているか。取れていないのに「近い順」と言わないため
  hasLocation: boolean;
  laterAt: LaterAt;
  onPickTime: (t: LaterAt) => void;
  onPost: (placeId: string) => void;
  onPickOnMap: () => void;
  onClose: () => void;
};

function chipStyle(on: boolean, pc: boolean): CSSProperties {
  return {
    flex: "none",
    borderRadius: 9999,
    padding: pc ? "7px 13px" : "9px 15px",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    cursor: "pointer",
    background: on ? C.railBg : C.white,
    color: on ? C.onDark : C.slateBtn,
    border: `1px solid ${on ? C.railBg : "#d8e0dd"}`,
    fontFamily: "inherit",
    fontSize: pc ? 12 : 13,
    fontWeight: 700,
  };
}

export default function QuickPostSheet({
  variant,
  mode,
  near,
  hasLocation,
  laterAt,
  onPickTime,
  onPost,
  onPickOnMap,
  onClose,
}: Props) {
  const pc = variant === "pc";
  const isLater = mode === "later";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: pc ? undefined : 1500,
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
          background: "rgba(15,23,42,.24)",
          border: 0,
          cursor: "pointer",
        }}
      />
      <div
        style={{
          flex: "none",
          background: C.white,
          borderRadius: pc ? "18px 18px 0 0" : "20px 20px 0 0",
          boxShadow: `0 -8px 26px rgba(15,23,42,${pc ? ".24" : ".26"})`,
          padding: pc
            ? "18px 20px 20px"
            : "18px 18px calc(22px + env(safe-area-inset-bottom))",
          animation: "higRise .24s ease-out",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{ fontSize: pc ? 15 : 16, fontWeight: 700, color: C.ink }}
          >
            {isLater ? "あとから記録する" : "どこで聞こえましたか"}
          </span>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              marginLeft: "auto",
              background: "none",
              border: 0,
              fontSize: pc ? 16 : 17,
              lineHeight: 1,
              color: C.muted,
              cursor: "pointer",
              padding: pc ? "6px 8px" : "10px 12px",
              marginRight: pc ? -8 : -10,
            }}
          >
            ✕
          </button>
        </div>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 12,
            color: C.muted,
            lineHeight: 1.65,
          }}
        >
          {isLater
            ? "いつの分かを選んでから、場所を押してください。昼間に聞いた分も、あとから入れられます。"
            : hasLocation
              ? "現在地から近い順に出しています。押すとその場で記録されます。"
              : "押すとその場で記録されます。"}
        </p>

        {isLater && (
          <div
            style={{
              display: "flex",
              gap: 7,
              marginTop: 13,
              flexWrap: pc ? "wrap" : "nowrap",
              overflowX: pc ? undefined : "auto",
              overflowY: pc ? undefined : "hidden",
            }}
          >
            {LATER_TIMES.map((t) => (
              <button
                key={t}
                onClick={() => onPickTime(t)}
                style={chipStyle(laterAt === t, pc)}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <ul
          style={{
            margin: pc ? "13px 0 0" : "14px 0 0",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: pc ? 8 : 9,
          }}
        >
          {near.map((n) => (
            <li key={n.p.id}>
              <button
                onClick={() => onPost(n.p.id)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 12,
                  padding: pc ? "13px 14px" : "15px 14px",
                  border: "1px solid #d8e0dd",
                  borderRadius: pc ? 12 : 13,
                  background: C.white,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={dotStyle(n.s.freshness, 12)} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 15,
                      fontWeight: 700,
                      color: C.ink,
                    }}
                  >
                    {n.p.name}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 2,
                      fontSize: 12,
                      color: C.muted,
                    }}
                  >
                    {placeLineText(n)}
                  </span>
                </span>
                <span
                  style={{
                    flex: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.greenHover,
                  }}
                >
                  {pc ? "記録する →" : "記録 →"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={onPickOnMap}
          style={{
            marginTop: 12,
            width: "100%",
            padding: pc ? 12 : 14,
            border: `1px dashed ${C.border3}`,
            borderRadius: pc ? 12 : 13,
            background: "none",
            color: C.slateBtn,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          この中にない — 地図から選ぶ
        </button>
      </div>
    </div>
  );
}
