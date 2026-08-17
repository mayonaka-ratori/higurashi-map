"use client";

// 地点を先に選ばせずに投稿を終わらせるための入口。
// 現在地から近い3件を出し、押した時点で記録する。
// 「さっき聞いた分」は時刻を選んでから場所を押す。
import { useState, type CSSProperties } from "react";
import { C, dotStyle } from "@/lib/design";
import { placeLineText, type FreePostState, type Ranked } from "@/lib/view";

export type LaterAt = "さっき" | "1時間前" | "今朝" | "昨日の夕方";
export const LATER_TIMES: LaterAt[] = ["さっき", "1時間前", "今朝", "昨日の夕方"];

type Props = {
  variant: "pc" | "sp";
  mode: "now" | "later";
  near: Ranked[];
  // 現在地が取れているか。取れていないのに「近い順」と言わないため
  hasLocation: boolean;
  // 現在地の取得を待っているあいだは true。
  // このあいだに遠い場所の一覧を出すと、急いでいる人が間違った場所へ投稿する
  locating: boolean;
  laterAt: LaterAt;
  onPickTime: (t: LaterAt) => void;
  onPost: (placeId: string, heard: boolean) => void;
  // 地図に名前が無い場所での記録。送信中と結果はこのシートの中だけに出す
  freeState: FreePostState;
  freeShareUrl: string;
  onPostFree: () => void;
  onBackFromFree: () => void;
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
    border: `1px solid ${on ? C.railBg : C.borderSoft}`,
    fontFamily: "inherit",
    fontSize: pc ? 12 : 13,
    fontWeight: 700,
  };
}

// 候補行の外枠。待ち枠と寸法を必ず揃えるため、1か所にまとめてある
function rowBox(pc: boolean): CSSProperties {
  return {
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: 12,
    padding: pc ? "13px 14px" : "15px 14px",
    border: `1px solid ${C.borderSoft}`,
    borderRadius: pc ? 12 : 13,
    background: C.white,
    textAlign: "left",
    fontFamily: "inherit",
  };
}

// 完了・保留・失敗の表示に置く控えめなボタン。地点詳細の完了カードと同じ寸法
function quietBtn(pc: boolean): CSSProperties {
  return {
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
  };
}

// 候補行の中の2行の行送り。既定の行送りは字体まかせで空枠と数値を合わせられないので、
// ここで決めて候補行と待ち枠の両方から使う
const NAME_LINE = 1.35;
const SUB_LINE = 1.5;

// 現在地を待つあいだに並べる空枠。中には文字を出さない。
// 高さは固定pxではなく、候補行と同じ文字サイズ×行送りから出している。
// 枠の数も3つで同じなので、現在地が取れて候補に入れ替わってもシートが跳ねない
function WaitingRow({ pc }: { pc: boolean }) {
  return (
    <div aria-hidden style={rowBox(pc)}>
      <span style={{ flex: "none", width: 16, height: 16 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{ display: "block", fontSize: 15, height: `${NAME_LINE}em` }}
        />
        <span
          style={{
            display: "block",
            marginTop: 2,
            fontSize: 12,
            height: `${SUB_LINE}em`,
          }}
        />
      </span>
    </div>
  );
}

export default function QuickPostSheet({
  variant,
  mode,
  near,
  hasLocation,
  locating,
  laterAt,
  onPickTime,
  onPost,
  freeState,
  freeShareUrl,
  onPostFree,
  onBackFromFree,
  onPickOnMap,
  onClose,
}: Props) {
  const pc = variant === "pc";
  const isLater = mode === "later";
  // 「聞こえた」か「静かだった」か。あとから記録するほうは「聞こえた」専用なので、
  // 切り替えチップは今この場で記録するときだけ出す
  const [heard, setHeard] = useState(true);

  const title = isLater
    ? "あとから記録する"
    : heard
      ? "どこで聞こえましたか"
      : "どの場所が静かでしたか";

  const lead = isLater
    ? "いつの分かを選んでから、場所を押してください。昼間に聞いた分も、あとから入れられます。"
    : locating
      ? "現在地を確認しています…"
      : heard
        ? hasLocation
          ? "現在地から近い順に出しています。押すとその場で記録されます。"
          : "現在地が取れないため、おすすめ順で出しています。押すとその場で記録されます。"
        : hasLocation
          ? "静かだったことも、次に探す人の役に立ちます。押すとその場で記録されます。"
          : "静かだったことも、次に探す人の役に立ちます。現在地が取れないため、おすすめ順で出しています。";

  const listStyle: CSSProperties = {
    margin: pc ? "13px 0 0" : "14px 0 0",
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: pc ? 8 : 9,
  };

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
            {title}
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

        {freeState.kind !== "idle" ? (
          <div style={{ marginTop: pc ? 13 : 14 }}>
            {freeState.kind === "sending" && (
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
                <span
                  style={{ fontSize: 14, fontWeight: 700, color: C.reason }}
                >
                  送信中…
                </span>
              </div>
            )}

            {freeState.kind === "done" && (
              <div
                style={{
                  borderRadius: pc ? 13 : 14,
                  background: C.answerBg,
                  border: `1px solid ${C.softAccent}`,
                  padding: 16,
                  animation: "higRise .28s ease-out",
                }}
              >
                <div
                  style={{
                    fontSize: pc ? 15 : 16,
                    fontWeight: 700,
                    color: C.reason,
                  }}
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
                <p
                  style={{
                    margin: pc ? "9px 0 0" : "8px 0 0",
                    fontSize: 12,
                    color: C.greenHover,
                  }}
                >
                  いまの場所に 🟢 が付きました。
                </p>
                <div style={{ marginTop: 13, display: "flex", gap: 10 }}>
                  <a
                    href={freeShareUrl}
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
                  <button onClick={onClose} style={quietBtn(pc)}>
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {freeState.kind === "queued" && (
              <div
                style={{
                  borderRadius: pc ? 13 : 14,
                  background: C.amberBg,
                  border: `1px solid ${C.amberBorder}`,
                  padding: 16,
                  animation: "higRise .28s ease-out",
                }}
              >
                <div
                  style={{
                    fontSize: pc ? 15 : 16,
                    fontWeight: 700,
                    color: C.amberText,
                  }}
                >
                  あとで送ります
                </div>
                <p
                  style={{
                    margin: "7px 0 0",
                    fontSize: 13,
                    color: C.amberText,
                    lineHeight: 1.65,
                  }}
                >
                  いまは電波が届かないようです。この端末に保存したので、電波が戻りしだい自動で送ります。
                </p>
                <div style={{ marginTop: 13, display: "flex", gap: 10 }}>
                  <button onClick={onClose} style={quietBtn(pc)}>
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {freeState.kind === "error" && (
              <div
                style={{
                  borderRadius: pc ? 12 : 13,
                  background: C.dangerBg,
                  border: `1px solid ${C.dangerBorder}`,
                  padding: pc ? 14 : 15,
                }}
              >
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: C.danger }}
                >
                  記録できませんでした
                </div>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 13,
                    color: C.dangerText,
                    lineHeight: 1.6,
                  }}
                >
                  {freeState.message}
                </p>
                <div style={{ marginTop: pc ? 11 : 12, display: "flex" }}>
                  <button onClick={onBackFromFree} style={quietBtn(pc)}>
                    もどる
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 12,
            color: C.muted,
            lineHeight: 1.65,
          }}
        >
          {lead}
        </p>

        {!isLater && (
          <div style={{ display: "flex", gap: 7, marginTop: 13 }}>
            <button onClick={() => setHeard(true)} style={chipStyle(heard, pc)}>
              🌲 聞こえた
            </button>
            <button onClick={() => setHeard(false)} style={chipStyle(!heard, pc)}>
              🌙 静かだった
            </button>
          </div>
        )}

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

        {locating ? (
          <ul style={listStyle}>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <WaitingRow pc={pc} />
              </li>
            ))}
          </ul>
        ) : (
          <ul style={listStyle}>
            {/* 名前のある場所を選ばずに、いまいる場所をそのまま記録する。
                「静かだった」では出さない（名前の無い場所の静けさは印を付けようがない） */}
            {!isLater && heard && (
              <li>
                <button
                  onClick={onPostFree}
                  disabled={!hasLocation}
                  style={{
                    ...rowBox(pc),
                    cursor: hasLocation ? "pointer" : "default",
                    background: hasLocation ? C.white : C.panelAlt,
                  }}
                >
                  <span
                    style={{
                      flex: "none",
                      width: 16,
                      fontSize: 14,
                      lineHeight: 1,
                      textAlign: "center",
                      opacity: hasLocation ? 1 : 0.45,
                    }}
                  >
                    📍
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 15,
                        lineHeight: NAME_LINE,
                        fontWeight: 700,
                        color: hasLocation ? C.ink : C.muted,
                      }}
                    >
                      いまの場所で記録する
                    </span>
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        fontSize: 12,
                        lineHeight: SUB_LINE,
                        color: C.muted,
                      }}
                    >
                      {hasLocation
                        ? "地図に名前が無い場所でも記録できます"
                        : "現在地が取れないため使えません"}
                    </span>
                  </span>
                </button>
              </li>
            )}
            {near.map((n) => (
              <li key={n.p.id}>
                <button
                  onClick={() => onPost(n.p.id, heard)}
                  style={{ ...rowBox(pc), cursor: "pointer" }}
                >
                  <span style={dotStyle(n.s.freshness, 12)} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 15,
                        lineHeight: NAME_LINE,
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
                        lineHeight: SUB_LINE,
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
        )}

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
          </>
        )}
      </div>
    </div>
  );
}
