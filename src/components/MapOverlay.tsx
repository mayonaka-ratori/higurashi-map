"use client";

import type { Place } from "@/lib/types";
import type { PlaceStats, Freshness } from "@/lib/score";
import { notesText, reasonText } from "@/lib/score";
import { C, dotStyle, notesStyle } from "@/lib/design";
import { placeLineText, type Ranked } from "@/lib/view";

type Props = {
  variant: "pc" | "sp";
  query: string;
  onQuery: (value: string) => void;
  searchResults: Ranked[] | null;
  onSelect: (id: string) => void;
  onLocate: () => void;
  onOpenQuick: () => void;
  now: Date;
  hoverPlace: Place | null;
  hoverStats: PlaceStats | null;
  hoverPt: { x: number; y: number } | null;
};

const legendItems: Array<[Freshness, string, string]> = [
  ["today", "今日", C.ink],
  ["recent3d", "3日内", C.slateBtnHover],
  ["season", "今季", C.slateBtn],
  ["none", "記録なし", C.muted],
];

export default function MapOverlay({
  variant,
  query,
  onQuery,
  searchResults,
  onSelect,
  onLocate,
  onOpenQuick,
  now,
  hoverPlace,
  hoverStats,
  hoverPt,
}: Props) {
  const pc = variant === "pc";
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
        onChange={(e) => onQuery(e.target.value)}
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
                onClick={() => onSelect(r.p.id)}
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
      {legendItems.map(([freshness, label, color]) => (
        <span
          key={freshness}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color,
          }}
        >
          <span
            style={dotStyle(
              freshness,
              freshness === "today" ? 16 : freshness === "recent3d" ? 13 : 11
            )}
          />
          {label}
        </span>
      ))}
    </div>
  );

  return (
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
            onClick={onLocate}
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
            onClick={onOpenQuick}
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
  );
}
