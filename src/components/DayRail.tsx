"use client";

// 1日を横一本の帯にしたもの。朝と夕の聞きどきの山、今の時刻、
// そして今日届いた報告を時刻の位置に点で打つ。
// 「夕方の山に3件かたまっている＝今まさに鳴いている」が読めることが狙い。
import type { CSSProperties } from "react";
import type { Report } from "@/lib/types";
import { hm } from "@/lib/score";
import { dayPos, type ListeningState } from "@/lib/sun";
import { C } from "@/lib/design";

type Props = {
  now: Date;
  win: ListeningState;
  todayReports: Report[];
  variant: "pc" | "sp";
};

// 帯の寸法だけ画面幅で変える。色と意味は同じ
const M = {
  pc: {
    pad: "13px 20px 11px",
    railH: 44,
    trackTop: 21,
    bandTop: 18,
    markUp: 6,
    markDown: 30,
    markSize: 7,
    nowTop: 8,
    nowH: 29,
    labelTop: 33,
    stateSize: 15,
  },
  sp: {
    pad: "10px 14px 8px",
    railH: 48,
    trackTop: 15,
    bandTop: 12,
    markUp: 2,
    markDown: 23,
    markSize: 6,
    nowTop: 4,
    nowH: 25,
    labelTop: 26,
    stateSize: 14,
  },
} as const;

export default function DayRail({ now, win, todayReports, variant }: Props) {
  const m = M[variant];
  const pc = variant === "pc";

  const band = (from: Date, to: Date, color: string): CSSProperties => ({
    position: "absolute",
    left: `${dayPos(from) * 100}%`,
    width: `${(dayPos(to) - dayPos(from)) * 100}%`,
    top: m.bandTop,
    height: 9,
    borderRadius: 5,
    background: color,
  });

  const timeLabel = (d: Date, color: string): CSSProperties => ({
    position: "absolute",
    left: `${dayPos(d) * 100}%`,
    top: m.labelTop,
    transform: "translateX(-50%)",
    fontSize: 11,
    fontWeight: 700,
    color,
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ flex: "none", background: C.railBg, padding: m.pad }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: pc ? 12 : 9 }}>
        <span
          style={{
            fontSize: m.stateSize,
            fontWeight: 700,
            letterSpacing: ".02em",
            color: win.tone === "now" ? C.nowTone : "#d1fae5",
          }}
        >
          {win.state}
        </span>
        <span
          style={{
            fontSize: pc ? 12 : 11,
            color: C.onDarkSub,
            marginLeft: pc ? undefined : "auto",
            flex: pc ? undefined : "none",
          }}
        >
          {win.remain}
        </span>
        {pc && (
          <span
            style={{ marginLeft: "auto", fontSize: 11, color: C.onDarkSub }}
          >
            {win.note}
          </span>
        )}
      </div>

      <div
        style={{
          position: "relative",
          height: m.railH,
          marginTop: pc ? 9 : 8,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: m.trackTop,
            height: 3,
            borderRadius: 2,
            background: C.railTrack,
          }}
        />
        <div style={band(win.wins[0].from, win.wins[0].to, C.dawnBand)} />
        <div style={band(win.wins[1].from, win.wins[1].to, C.duskBand)} />

        {/* 今日届いた報告。同時刻の重なりを避けるため上下に振り分ける */}
        {todayReports.map((r, i) => (
          <span
            key={r.id}
            style={{
              position: "absolute",
              left: `${dayPos(new Date(r.created_at)) * 100}%`,
              top: i % 2 === 0 ? m.markUp : m.markDown,
              width: m.markSize,
              height: m.markSize,
              marginLeft: -m.markSize / 2,
              borderRadius: 9999,
              background: r.heard ? C.heardDot : C.quietDot,
              boxShadow: "0 0 0 2px rgba(11,59,46,.9)",
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            left: `${dayPos(now) * 100}%`,
            top: m.nowTop,
            width: 3,
            height: m.nowH,
            marginLeft: -1.5,
            borderRadius: 2,
            background: C.onDark,
            boxShadow: "0 0 0 3px rgba(11,59,46,.85)",
          }}
        />

        <div style={timeLabel(win.dawn, C.dawnBand)}>
          {pc ? `夜明け ${hm(win.dawn)}` : hm(win.dawn)}
        </div>
        <div style={timeLabel(win.dusk, C.duskBand)}>
          {pc ? `日の入り ${hm(win.dusk)}` : hm(win.dusk)}
        </div>
      </div>

      {pc ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: C.railTick,
            letterSpacing: ".06em",
          }}
        >
          <span>0時</span>
          <span>6時</span>
          <span>12時</span>
          <span>18時</span>
          <span>24時</span>
        </div>
      ) : (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 11,
            color: C.onDarkSub,
            lineHeight: 1.5,
          }}
        >
          {win.note}
        </p>
      )}
    </div>
  );
}
