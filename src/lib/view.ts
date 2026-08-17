// 画面のあいだで受け渡す形。計算は App.tsx の1か所でやり、
// 表示する部品には出来上がった文字列だけ渡す（見出しと中身が食い違わないように）。
import type { Place } from "./types";
import { notesLabel, notesText, reasonText, type PlaceStats } from "./score";
import type { ListeningState } from "./sun";

export type Ranked = {
  p: Place;
  s: PlaceStats;
  // 現在地がまだ分からないときは null。距離は出さず、順位付けにも使わない
  d: number | null;
};

export type PostState =
  | { kind: "idle" }
  | { kind: "sending"; heard: boolean }
  | { kind: "done"; heard: boolean }
  // 電波が届かず、端末に置いてある状態。電波が戻りしだい自動で送る
  | { kind: "queued"; heard: boolean }
  | { kind: "error"; heard: boolean; message: string };

// 答えのブロックに出すもの。答えが立たない日は isEmpty が true になり、
// 見出しも本文もボタンも別のものに入れ替わる
export type AnswerVM = {
  isEmpty: boolean;
  kicker: string;
  headline: string;
  placeLine: string | null;
  notes: string;
  notesLabel: string;
  reason: string;
  comment: string | null;
  emptyLead: string | null;
  openLabel: string;
  restTitle: string;
  footnote: string;
};

export function buildAnswerVM({
  answer,
  hasTodayReports,
  todayReportCount,
  restHasRecords,
  hasLocation,
  win,
  now,
}: {
  answer: Ranked | null;
  hasTodayReports: boolean;
  todayReportCount: number;
  restHasRecords: boolean;
  hasLocation: boolean;
  win: ListeningState | null;
  now: Date;
}): AnswerVM {
  const nearWord = hasLocation ? "を近い順に" : "を";
  if (answer) {
    const comment = answer.s.todayReports.find((r) => r.heard && r.comment)?.comment;
    return {
      isEmpty: false,
      kicker: win?.active?.kind === "dawn" ? "今朝はここ" : "今夜はここ",
      headline: answer.p.name,
      placeLine: placeLineText(answer, "ここから "),
      notes: notesText(answer.s.stars),
      notesLabel: `期待度・${notesLabel(answer.s.stars)}`,
      reason: reasonText(answer.s, now),
      comment: comment ? `「${comment}」` : null,
      emptyLead: null,
      openLabel: "この場所を見る",
      restTitle: restHasRecords
        ? "ほかの候補"
        : hasLocation
          ? "近くの場所"
          : "候補の場所",
      footnote:
        "近さも考えに入れて並べています。♪ は「どれだけ鳴いていそうか」の目安です。",
    };
  }

  const emptyLead = hasTodayReports
    ? `今日届いているのは ${todayReportCount} 件だけです。下は実績のある場所${nearWord}出しています。`
    : !restHasRecords
      ? hasLocation
        ? "下は現在地から近い場所です。行って聞こえたら、その場で教えてください。"
        : "下はいま期待できる場所です。行って聞こえたら、その場で教えてください。"
      : win?.daytime
        ? "曇りの日や暗い林なら日中でも鳴きます。下は今シーズン鳴いた実績のある場所です。"
        : `夜明けと日の入りの前後30分が聞きどきです。下は実績のある場所${nearWord}出しています。`;

  return {
    isEmpty: true,
    kicker: "きょうの状況",
    headline: hasTodayReports
      ? "確かなことは、まだ言えません"
      : "今日はまだ誰も聞いていません",
    placeLine: null,
    notes: "",
    notesLabel: "",
    reason: "",
    comment: null,
    emptyLead,
    openLabel: "近い順にならべる",
    restTitle: restHasRecords
      ? "実績のある場所"
      : hasLocation
        ? "近くの場所"
        : "候補の場所",
    footnote:
      "今日の一件目になれます。聞こえなかったときも「静かだった」を押すと、次の人の役に立ちます。",
  };
}

export function distText(d: number | null): string | null {
  return d == null ? null : `${d.toFixed(1)}km`;
}

// 「埼玉県 さいたま市緑区 ・ 6.7km」。距離が分からない日は市区町村だけ
export function placeLineText(r: Ranked, prefix = ""): string {
  const base = `${r.p.pref} ${r.p.city}`;
  const d = distText(r.d);
  return d ? `${base} ・ ${prefix}${d}` : base;
}
