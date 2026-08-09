"use client";

// 画面が答える一つの問い —「今日、どこへ行けば聞けるか」。
// 断定できる根拠がある日は地点名を出し、無い日は別の見出しに入れ替える。
// 見出しと候補の母集団は App.tsx で一緒に決めてから渡ってくる。
import type { CSSProperties } from "react";
import { notesText, reasonText, shortReason } from "@/lib/score";
import { C, dotStyle, notesStyle } from "@/lib/design";
import { placeLineText, type AnswerVM, type Ranked } from "@/lib/view";

type Props = {
  variant: "pc" | "sp";
  vm: AnswerVM;
  rest: Ranked[];
  now: Date;
  sort: "reco" | "near";
  onSort: (s: "reco" | "near") => void;
  onOpen: () => void;
  onOpenQuick: () => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
};

function sortStyle(on: boolean, pc: boolean): CSSProperties {
  return {
    background: "none",
    border: 0,
    // スマホは負マージンで見た目の位置を保ったままタップ域を44pxにする
    padding: pc ? 0 : "14px 10px",
    margin: pc ? 0 : "-14px -10px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: on ? 700 : 400,
    color: on ? C.railBg : C.muted,
    textDecoration: on ? "underline" : "none",
    textUnderlineOffset: 3,
  };
}

export default function AnswerBlock({
  variant,
  vm,
  rest,
  now,
  sort,
  onSort,
  onOpen,
  onOpenQuick,
  onSelect,
  onHover,
}: Props) {
  const pc = variant === "pc";

  const kickerDot: CSSProperties = {
    flex: "none",
    width: pc ? 10 : 9,
    height: pc ? 10 : 9,
    borderRadius: 9999,
    background: vm.isEmpty ? C.none : C.green,
    boxShadow: vm.isEmpty
      ? `0 0 0 ${pc ? 4 : 3}px rgba(148,163,184,${pc ? ".16" : ".18"})`
      : `0 0 0 ${pc ? 4 : 3}px rgba(5,150,105,${pc ? ".16" : ".18"})`,
  };

  const kickerText: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: vm.isEmpty ? C.slateBtn : C.greenHover,
    letterSpacing: pc ? ".11em" : ".1em",
  };

  const sortRow = (
    <span style={{ display: "flex", gap: 12 }}>
      <button style={sortStyle(sort === "reco", pc)} onClick={() => onSort("reco")}>
        おすすめ順
      </button>
      <button style={sortStyle(sort === "near", pc)} onClick={() => onSort("near")}>
        近い順
      </button>
    </span>
  );

  if (pc) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div
          style={{
            background: vm.isEmpty ? C.panelAlt : C.answerBg,
            borderBottom: `1px solid ${vm.isEmpty ? C.border : C.answerBorder}`,
            padding: "22px 22px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={kickerDot} />
            <span style={kickerText}>{vm.kicker}</span>
          </div>
          <div
            style={{
              marginTop: 11,
              fontSize: vm.isEmpty ? 23 : 29,
              fontWeight: 700,
              color: C.ink,
              lineHeight: vm.isEmpty ? 1.35 : 1.22,
              letterSpacing: ".01em",
            }}
          >
            {vm.headline}
          </div>
          {vm.placeLine && (
            <div style={{ marginTop: 7, fontSize: 13, color: C.slateBtn }}>
              {vm.placeLine}
            </div>
          )}
          {!vm.isEmpty && (
            <>
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                }}
              >
                <span style={notesStyle(21)}>{vm.notes}</span>
                <span style={{ fontSize: 12, color: C.slateBtn }}>
                  {vm.notesLabel}
                </span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.reason,
                }}
              >
                {vm.reason}
              </div>
            </>
          )}
          {vm.comment && (
            <p
              style={{
                margin: "11px 0 0",
                paddingLeft: 12,
                borderLeft: `2px solid #a7f3d0`,
                fontSize: 13,
                color: "#334155",
                lineHeight: 1.65,
              }}
            >
              {vm.comment}
            </p>
          )}
          {vm.emptyLead && (
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 13,
                color: C.slateBtn,
                lineHeight: 1.75,
              }}
            >
              {vm.emptyLead}
            </p>
          )}
          <div style={{ display: "flex", gap: 9, marginTop: 17 }}>
            <button
              onClick={onOpen}
              style={{
                flex: 1,
                padding: "14px 8px",
                // 枠の有無で高さが変わらないよう、枠は常に1px引く
                border: `1px solid ${vm.isEmpty ? C.border3 : "transparent"}`,
                borderRadius: 11,
                background: vm.isEmpty ? C.white : C.railBg,
                color: vm.isEmpty ? C.ink : C.white,
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {vm.openLabel}
            </button>
            <button
              onClick={onOpenQuick}
              style={{
                flex: 1,
                padding: "14px 8px",
                border: `1px solid ${C.border3}`,
                borderRadius: 11,
                background: C.white,
                color: C.ink,
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🌲 いま聞こえた
            </button>
          </div>
        </div>

        <div style={{ padding: "16px 22px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 3,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 700,
                color: C.slateBtn,
                letterSpacing: ".08em",
              }}
            >
              {vm.restTitle}
            </h2>
            {sortRow}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {rest.map((r) => {
              const isToday = r.s.freshness === "today";
              return (
                <li key={r.p.id}>
                  <button
                    onClick={() => onSelect(r.p.id)}
                    onMouseEnter={() => onHover(r.p.id)}
                    onMouseLeave={() => onHover(null)}
                    style={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 8px",
                      background: "none",
                      border: 0,
                      borderTop: `1px solid ${C.hairline}`,
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      borderRadius: 9,
                    }}
                  >
                    <span style={dotStyle(r.s.freshness)} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 15,
                          fontWeight: 500,
                          color: C.ink,
                          lineHeight: 1.35,
                        }}
                      >
                        {r.p.name}
                      </span>
                      <span
                        style={{
                          display: "block",
                          marginTop: 3,
                          fontSize: 12,
                          color: C.muted,
                        }}
                      >
                        {placeLineText(r)}
                      </span>
                      <span
                        style={{
                          display: "block",
                          marginTop: 4,
                          fontSize: 12,
                          fontWeight: isToday ? 700 : 400,
                          color: isToday ? C.greenHover : C.muted,
                        }}
                      >
                        {reasonText(r.s, now)}
                      </span>
                    </span>
                    <span style={notesStyle(14)}>{notesText(r.s.stars)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p
            style={{
              margin: "14px 8px 0",
              fontSize: 12,
              color: C.muted,
              lineHeight: 1.7,
            }}
          >
            {vm.footnote}
          </p>
        </div>
      </div>
    );
  }

  // ── スマホ。状態が変わっても高さが動かないよう、答えのブロックは196px固定
  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: 196,
          background: vm.isEmpty ? C.panelAlt : C.answerBg,
          borderTop: `1px solid ${vm.isEmpty ? C.border : C.answerBorder}`,
          borderBottom: `1px solid ${vm.isEmpty ? C.border : C.answerBorder}`,
          padding: "13px 14px 14px",
          marginTop: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={kickerDot} />
          <span style={kickerText}>{vm.kicker}</span>
          {!vm.isEmpty && (
            <span style={{ ...notesStyle(16), marginLeft: "auto" }}>
              {vm.notes}
            </span>
          )}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: vm.isEmpty ? 19 : 21,
            fontWeight: 700,
            color: C.ink,
            lineHeight: vm.isEmpty ? 1.35 : 1.25,
          }}
        >
          {vm.headline}
        </div>
        {vm.placeLine && (
          <>
            <div style={{ marginTop: 4, fontSize: 12, color: C.slateBtn }}>
              {vm.placeLine}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                fontWeight: 700,
                color: C.reason,
              }}
            >
              {vm.reason}
            </div>
          </>
        )}
        {vm.emptyLead && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              color: C.slateBtn,
              lineHeight: 1.7,
            }}
          >
            {vm.emptyLead}
          </p>
        )}
        <button
          onClick={onOpen}
          style={{
            marginTop: "auto",
            width: "100%",
            padding: 15,
            // 答えの日と空の日でボタンの高さを揃える（枠は常に1px引く）
            border: `1px solid ${vm.isEmpty ? C.border3 : "transparent"}`,
            borderRadius: 13,
            background: vm.isEmpty ? C.white : C.railBg,
            color: vm.isEmpty ? C.ink : C.white,
            fontFamily: "inherit",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {vm.openLabel}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "12px 14px 7px",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.slateBtn,
            letterSpacing: ".08em",
          }}
        >
          {vm.restTitle}
        </span>
        {sortRow}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          overflowY: "hidden",
          padding: "0 14px 12px",
          scrollSnapType: "x mandatory",
          scrollPaddingLeft: 14,
          scrollbarWidth: "none",
        }}
      >
        {rest.map((r) => {
          const isToday = r.s.freshness === "today";
          return (
            <button
              key={r.p.id}
              onClick={() => onSelect(r.p.id)}
              style={{
                flex: "none",
                width: 216,
                height: 104,
                scrollSnapAlign: "start",
                textAlign: "left",
                background: C.white,
                border: `1px solid ${C.border2}`,
                borderRadius: 13,
                padding: "12px 13px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={dotStyle(r.s.freshness, 11)} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11,
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? C.greenHover : C.muted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shortReason(r.s, now)}
                </span>
                <span style={{ ...notesStyle(13), marginLeft: "auto" }}>
                  {notesText(r.s.stars)}
                </span>
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.ink,
                  lineHeight: 1.3,
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
                  marginTop: 3,
                  fontSize: 12,
                  color: C.muted,
                }}
              >
                {placeLineText(r)}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
