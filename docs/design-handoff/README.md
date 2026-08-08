# ハンドオフ: ひぐらしのなくところに — 地図UI再設計（案B「探して選ぶ」）

## これは何か

ヒグラシの鳴き声の目撃情報を共有する匿名マップ `higurashi-map` の、
**地図画面まるごとの再設計**。3案を作って比較し、**案B「探して選ぶ」を採用**した。
このバンドルは、その案Bを実際のコードベースに実装するための資料一式。

判断基準は既存の `AGENTS.md` のまま:
**「この変更で、ユーザーがヒグラシを聞ける確率が上がるか？」**
再設計で足したものは、全部この問いに YES で答えられるものだけにしてある。

依頼側の資料は [docs/DESIGN.md](../DESIGN.md)（再設計ブリーフ）。
そこに挙げたPCでの問題6点への回答が、この文書と `design/` の参照実装にあたる。
**まだ実装していない。** ここにあるのは仕様と参照実装だけで、`src/` は現行UIのまま。

---

## デザインファイルの位置づけ（重要）

`design/` に入っている HTML は **デザインの参照実装であって、そのまま移植するコードではない**。
ブラウザで開けば実際に動く（地図・ピン・投稿フローまで通る）が、目的は
「どう見えて、どう振る舞うか」を確かめるためのプロトタイプ。

やることは **このHTMLの見た目と挙動を、既存の Next.js + TypeScript + Tailwind v4 +
MapLibre GL の環境で作り直すこと**。HTMLやCSSをコピーして貼らないこと。

特に地図まわりは要注意:

| | プロトタイプ | 実装先（既存） |
|---|---|---|
| 地図ライブラリ | **Leaflet 1.9.4**（CDN） | **MapLibre GL v6** |
| ピン | `L.circleMarker` を155個 | `circle` レイヤー + GeoJSON ソース1本 |
| ラベル | Leaflet tooltip + 自前の衝突判定 | `symbol` レイヤー（衝突回避はMapLibreが持っている） |
| タイル | 国土地理院 pale | 同じ（変更なし） |

**Leafletのコードを持ち込まないこと。** プロトタイプがLeafletなのは、
デザイン検討の場で手早く動かすためだけの都合。
MapLibreなら `circle-radius` の `interpolate` 式や `symbol` レイヤーの
`text-allow-overlap: false` で、プロトタイプが手で書いている処理の多くが標準機能で済む。

## 忠実度

**ハイファイ（hifi）。** 色・文字サイズ・余白・角丸・影・文言はすべて確定値。
下の「デザイントークン」と「画面ごとの仕様」の数値をそのまま使って、見た目を再現してほしい。
Tailwind のクラスに落とすとき、記載のhex値がTailwindの既定パレットに無い場合は
任意値（`bg-[#064e3b]` など）でよい。ほとんどは Tailwind の `emerald` / `amber` / `slate` に一致する。

例外は**サンプルデータと固定時刻**。プロトタイプは「8月7日 18:12」に固定した
21件のサンプル投稿で描いている（`design/higurashi-core.js` の `SEED` / `sampleReports`）。
実装では既存の Supabase / お試しモードの実データを使うこと。

---

## 何が変わるのか（現行UI → 案B）

`design/現行UI.dc.html` が2019年時点の現行UIの再現、`design/再設計案.dc.html` が新案。
並べて見ると差分が分かる。要点:

1. **ピンが「色だけ」から「色・大きさ・縁取りの3つ同時」になる。**
   現行は155個すべてが同じ半径で、色しか違わない。地図を開いた第一印象が
   「点がいっぱいある」で終わっていた。新案は 🟢今日 を最大・最も濃く、
   ⚫記録なし を最小・縁なしにして、視線が今日へ行くようにする。
2. **🟢今日のピンだけ、広がる輪（パルス）が出る。**
3. **ズームを寄せると 🟢今日のピンにだけ地点名が出る。** 155件すべてに出すと文字で埋まる。
4. **「今夜はここ」ヒーローカードは、根拠が立つ日だけ出す。**
   ★3以上かつ今日の確認があるときだけ。それ以外の日は
   「今日の報告はまだありません／日の入り前後30分が聞きどきです」に変わる。
   投稿ゼロの日に「今夜はここ」と断定しないこと。
5. **並び順に距離が効く。** 期待度そのままだと「★5だが80km先」が1位になる。
6. **一覧が「地図の表示範囲 × 検索語 × 鮮度チップ」で絞り込まれる。**
7. **スマホは既定が全面地図＋下端の横並びカード。** 一覧が要るときだけシートを引き上げる。
8. **投稿の2ボタンが、詳細シート下端に固定される。** スクロールしても消えない。
9. **★のみ表示（☆を並べない）。** 空の☆を並べるとレビュー点数に見える。
10. **★の下に必ず根拠の一行が付く。**「8分前に確認・3時間で3件」。

---

## 画面 / ビュー

対象は1画面（トップ）。PCとスマホでレイアウトが分かれる。
プロトタイプの検証サイズは **PC 1440×900 / スマホ 390×844**。

### 1. PC レイアウト

```
┌────────────────────────────────────────────────────────┐
│ 左パネル 392px 固定  │  地図（残り全部）                    │
│ ┌──────────────┐ │                          ┌──┐ │
│ │ ヘッダー #064e3b  │ │                          │+ │ │  ← ズーム
│ │ 検索input       │ │                          │− │ │
│ │ 鮮度チップ×4     │ │                          │◎ │ │  ← 現在地
│ │ タブ 一覧/今日の報告│ │                          └──┘ │
│ │ ヒーローカード（条件付）│                                │
│ │ 件数 + 並び替え    │ │                                │
│ │ ─────────── │ │                                │
│ │ 一覧（スクロール）   │ │                                │
│ │  ●  地点名        │ │        🟢 ← パルス付き            │
│ │     市区 ・ 12.4km │ │      ●  🟡    ⚪               │
│ │     8分前に確認     │ │                                │
│ │                ★★★★│ │                     ┌────────┐ │
│ │                  │ │                     │ 凡例     │ │
│ └──────────────┘ │                     └────────┘ │
└────────────────────────────────────────────────────────┘
```

- 外枠: `display:flex; flex-direction:column`、背景 `#fff`
- 地図エリア: `position:relative; flex:1; min-height:0; overflow:hidden`、
  読み込み前の背景 `#eef2f6`
- 左パネル: `position:absolute; left:0; top:0; bottom:0; width:392px;`
  `background:#fff; box-shadow:3px 0 22px rgba(15,23,42,.15); display:flex; flex-direction:column`
  （パネルは地図の**上に重ねる**。地図は全幅で描画し、パネルの下にも続く）
- 地図オーバーレイ全体は `pointer-events:none`、パネル等の要素だけ `pointer-events:auto`

#### 1-1. パネルヘッダー
- 背景 `#064e3b`、パディング `13px 20px 12px`
- `h1` 17px / 700 / `#ecfdf5` — 「ひぐらしのなくところに」
- サブ 12px / `#a7f3d0` / `margin-top:3px` — 「今日、カナカナが聞こえる場所。」（**定型文・変更禁止**）

#### 1-2. 検索
- コンテナ `padding:12px 16px 0`
- `input`: 幅100% / `padding:11px 14px` / `border:1px solid #cbd5e1` / `border-radius:10px` /
  `font-size:14px` / `color:#0f172a` / `background:#f8fafc`
- placeholder: 「地点名で探す（例: 見沼、高尾）」
- focus: `border-color:#059669; background:#fff`
- 挙動: 入力のたびに一覧を絞る（`place.name.includes(query)`、部分一致・大小区別なし）。
  確定不要、ボタンなし。

#### 1-3. 鮮度チップ（4つ）
`display:flex; gap:6px; flex-wrap:wrap; margin-top:10px`

共通: `border-radius:9999px; padding:7px 12px; font-size:12px; font-weight:700; white-space:nowrap; line-height:1.2`

| 状態 | 背景 | 文字 | 枠 |
|---|---|---|---|
| 選択中 | `#064e3b` | `#ecfdf5` | `1px solid #064e3b` |
| 未選択 | `#fff` | `#475569` | `1px solid #cbd5e1` |

ラベルは件数込み: `すべて 155` / `🟢 今日 8` / `🟡 3日内 4` / `今季 9`
（件数は今の鮮度分布から動的に出す）。チップを押すと一覧とピン表示が絞られ、選択地点は解除される。

> **スマホでは同じチップを濃い緑ヘッダーの上に置く。** その面では配色を反転させること
> （選択中 = 背景 `#ecfdf5` / 文字 `#064e3b`、未選択 = 背景 `rgba(255,255,255,.12)` /
> 文字 `#d1fae5` / 枠 `1px solid rgba(255,255,255,.45)`）。
> 濃い面の上で緑を塗ると、選択中だけが背景に沈んで、未選択のほうが選択に見える。

#### 1-4. タブ（一覧 / 今日の報告）
`display:flex; gap:20px; padding:12px 20px 0; border-bottom:1px solid #e2e8f0`

- 各タブ: `padding-bottom:10px; font-size:14px; font-weight:700`
- 選択中: `color:#064e3b; box-shadow: inset 0 -2px 0 #059669`
- 未選択: `color:#64748b`
- 右端に `margin-left:auto` で 12px `#64748b` の「いま聞きどき · 18:42まで あと30分」

#### 1-5. ヒーローカード「今夜はここ」（条件付き）

**出す条件: `top[0].freshness === "today" && top[0].stars >= 3`**

```
margin:12px 16px 0; border:1px solid #a7f3d0; background:#ecfdf5;
border-radius:12px; padding:14px 16px;
```
- 見出し行: 9px の緑丸（`#059669` + `box-shadow:0 0 0 3px rgba(5,150,105,.18)`）+
  11px/700/`#047857`/`letter-spacing:.09em` の「今夜はここ」+
  右端に `margin-left:auto` で ★（15px / `#f59e0b` / `letter-spacing:.05em`）
- 地点名: 19px / 700 / `#0f172a` / `line-height:1.3`
- 所在地・距離: 12px / `#475569` / `margin-top:3px` — 「さいたま市緑区 ・ ここから 8.2km」
- 根拠: 13px / 700 / `#065f46` / `margin-top:6px` — 「8分前に確認・3時間で3件」
- カード全体がボタン。押すとその地点を選択（= 詳細に入る）。

**条件を満たさない日**（★2以下、または今日の確認なし）はこちらに差し替える:
```
margin:12px 16px 0; border:1px solid #e2e8f0; background:#f8fafc;
border-radius:12px; padding:13px 16px;
```
- 13px / 700 / `#334155` — 「今日の報告はまだありません」
- 12px / `#475569` / `line-height:1.6` — 「行って聞こえたら、その場で教えてください。日の入り前後30分が聞きどきです。」

#### 1-6. 件数バー + 並び替え
`display:flex; align-items:baseline; justify-content:space-between;`
`padding:10px 20px 8px; background:#f8fafc; border-bottom:1px solid #f1f5f9`

- 左: 13px / 700 / `#334155`。検索語があれば「「見沼」で 3件」、無ければ「表示中の範囲に 42件」
- 右: 「おすすめ順」「近い順」を `gap:12px` で並べたテキストボタン
  - 選択中: 12px / `#064e3b` / 700 / `text-decoration:underline; text-underline-offset:3px`
  - 未選択: 12px / `#64748b` / 通常ウェイト

#### 1-7. 一覧行
```
display:flex; width:100%; align-items:center; gap:12px; padding:11px 8px;
border-bottom:1px solid #f1f5f9; text-align:left;
```
hover: `background:#f1f5f9`

- 左: 鮮度ドット（下記「鮮度ドット」参照）
- 中央（`flex:1; min-width:0`）:
  - 地点名 15px / 600 / `#0f172a` / `line-height:1.35`
  - 所在地・距離 12px / `#64748b` / `margin-top:2px` — 「さいたま市見沼区 ・ 8.2km」
  - 根拠 12px / `margin-top:3px`。**今日なら `#047857` の700、それ以外は `#64748b` の通常**
- 右: ★ 14px / `#f59e0b` / `letter-spacing:.04em`

hover で地図の該当ピンにリングが出る（後述）。クリックで選択。

一覧が0件のとき: `margin:26px 8px; font-size:13px; color:#64748b; line-height:1.7`
「条件に合う場所がありません。地図を動かすか、絞り込みを「すべて」にもどしてください。」

#### 1-8. 「今日の報告」タブ
全地点横断・時刻の新しい順。行:
```
display:flex; gap:12px; padding:10px 6px; border-bottom:1px solid #f1f5f9;
```
hover: `background:#f8fafc`
- 時刻 `width:42px` 固定 / 13px / `#64748b`（`18:04` 形式）
- 地点名 14px / `#0f172a` / `line-height:1.4`
- 状態 12px: 聞こえた = `🌲 聞こえた` / `#047857` / 700、静か = `🌙 静かだった` / `#64748b`
- コメントがあれば 12px / `#64748b` / `line-height:1.5`、鍵括弧付き「園内の雑木林でカナカナ」

0件のとき: 「まだ一件も届いていません。今日の一件目になれます。」

#### 1-9. 凡例（地図の左下、パネルの右隣）
`position:absolute; left:380px; bottom:18px;`
`background:rgba(255,255,255,.96); border:1px solid #e2e8f0; border-radius:12px;`
`padding:11px 14px; box-shadow:0 3px 14px rgba(15,23,42,.12); display:flex; gap:16px`

4項目を横並び（各 13px、ドット + ラベル、`gap:8px`）:
`今日` / `3日内` / `今季` / `記録なし`

### 2. PC 詳細ビュー

地点を選ぶと**左パネルの中身が全面差し替わる**（別画面には遷移しない。地図は動いたまま）。
`position:absolute; inset:0; background:#fff; display:flex; flex-direction:column`

- 上端バー: `#064e3b` / `padding:11px 20px` / 左に「← 一覧」（14px / `#a7f3d0`、hover `#fff`）、
  右端に `#6ee7b7` 12px で聞きどき状態
- 本文（スクロール域）`padding:18px 20px 22px`:
  - 鮮度ドット(12px) + 鮮度ラベル 12px/700/`#475569`/`letter-spacing:.06em`
  - 地点名 `h2` 23px / 700 / `#0f172a` / `line-height:1.28` / `margin-top:8px`
  - 所在地・距離 13px / `#475569`
  - ★ 20px / `#f59e0b` + 「期待度」12px / `#64748b`（`align-items:baseline; gap:9px`）
  - 根拠 14px / 700 / `#065f46`
  - 件数 12px / `#64748b` — 「今日 3 件確認 ・ 昨日 2 件 ・ 今シーズン計 11 件」
  - 「今日の報告」リスト（この地点のぶん、最大8件）
  - 「この場所を𝕏で共有」13px / `#64748b` / underline
- **下端に固定**（`flex:none; border-top:1px solid #e2e8f0; background:#f8fafc; padding:14px 20px`）
  投稿2ボタン。詳細をどれだけスクロールしても消えない。

### 3. スマホ レイアウト（390×844）

既定は **全面地図 + 下端の横並びカード**。

- 上部: `#064e3b` のヘッダー（`padding:11px 14px 10px`）
  - `h1` 15px / 700、右端に聞きどき状態 11px / `#6ee7b7`
  - 検索 `input`（**`font-size:16px` 必須** — iOS Safariが16px未満で自動ズームする）、
    `padding:11px 13px; border-radius:10px; border:0; background:#fff; margin-top:9px`
  - 鮮度チップを横スクロール（`overflow-x:auto; scrollbar-width:none; gap:6px`、暗い面用の配色）
- 下端シート: `border-radius:18px 18px 0 0; box-shadow:0 -6px 22px rgba(15,23,42,.18)`
  - つまみ: 38×4px / `#cbd5e1` / `border-radius:99px`
  - **カード表示（既定）**: 「今日カナカナが聞こえた 8か所」+ 右に「一覧を見る 42件」（12px/700/`#064e3b`/underline）
    - カード: `width:224px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px`
      横スクロール `gap:10px; padding:0 12px 14px`
    - カード中身: ドット + 「8分前に確認」(12px、今日なら`#047857`700 / それ以外`#64748b`) +
      右端★13px、その下に地点名 16px/700（1行省略 `text-overflow:ellipsis`）、
      所在地・距離 12px/`#64748b`
    - 今日の記録が0件なら、カードは「近い順」の候補に切り替え、見出しを
      「今日の報告はまだなし ・ 近い順」にする
  - **一覧表示**: 「一覧を見る」を押すとシートが `max-height:56%` まで上がり、
    タブ（一覧／今日の報告）と縦リストになる。右端に「地図を広く」でカード表示に戻る

### 4. スマホ 詳細シート

ピンまたはカードをタップすると、下から詳細シートがせり上がる。
```
背景オーバーレイ: rgba(15,23,42,.18)（タップで閉じる）
シート: background:#fff; border-radius:20px 20px 0 0;
        box-shadow:0 -8px 26px rgba(15,23,42,.24); max-height:64%;
        display:flex; flex-direction:column
```
- つまみ 38×4px、右上に ✕（`font-size:17px; color:#64748b; padding:10px 12px` = **44px相当のタップ域**）
- 本文 `padding:6px 18px 18px`: 鮮度ラベル / 地点名22px / 所在地・距離13px /
  ★19px + 期待度 / 根拠14px 700 `#065f46` / 件数12px / 今日の報告リスト
- **下端固定の投稿エリア**（`border-top:1px solid #e2e8f0; background:#f8fafc; padding:14px 18px 22px`）

PCとスマホで投稿の手順は同じ。段数を変えない。

---

## 投稿フロー

```
ピン / カード / 一覧行をタップ
      ↓
詳細（PC=パネル差し替え、スマホ=下からシート）
      ↓
下端固定の2ボタン
   [🌲 カナカナ聞こえた！]  [🌙 今日は静かだった]
      ↓  （押した瞬間）
   「送信中…」 13px / #475569
      ↓  （完了）
   完了カード + 𝕏シェア（聞こえたときだけ）/ 閉じる
```

### 2ボタン
`display:grid; grid-template-columns:1fr 1fr; gap:10px`

| | 聞こえた | 静かだった |
|---|---|---|
| 背景 | `#059669` | `#475569` |
| hover | `#047857` | `#334155` |
| 文字 | `#fff` 15px（スマホ14px）/ 700 | 同左 |
| 角丸 | 12px（スマホ14px） | 同左 |
| パディング | `15px 8px`（スマホ `17px 6px`） | 同左 |

スマホでの実高さは **約 52px**。44px 未満にしないこと。

その下に「ひとこと添える（任意）」13px / `#0369a1` / underline（送信前のみ表示）。

### 完了カード
```
border-radius:12px（スマホ14px）; background:#ecfdf5; border:1px solid #a7f3d0; padding:15px（スマホ16px）
```
- 15px / 700 / `#065f46` — **「カナカナ情報を受け取りました。」**（定型文・変更禁止）
- 13px / `#047857` / `line-height:1.6` — **「今日ヒグラシを探している誰かの助けになります。」**（定型文・変更禁止）
- ボタン2つ `display:flex; gap:10px; margin-top:12px`
  - `𝕏 でシェアする`（**「聞こえた」で投稿したときだけ**）: `background:#0f172a; color:#fff; border-radius:11px; padding:12px 8px; font-size:13px; font-weight:700`
  - `閉じる`: `background:#fff; border:1px solid #cbd5e1; color:#334155`、同サイズ

プロトタイプは送信を 800ms のタイマーで模している。実装では既存の
`src/lib/store.ts` の `insertReport` / `isThrottled` / `markPosted` をそのまま使い、
失敗時は `postState: {kind:"error"}` を出すこと（プロトタイプにはエラー表示が無い。既存実装のものを流用）。
GPS取得は既存の `getPosition()` のまま——取れなくても投稿は通す。

---

## 地図の仕様

### 鮮度4段階

| 鍵 | 意味 | 塗り | 縁 | 縁幅 |
|---|---|---|---|---|
| `today` | 今日確認 | `#059669` | `#ffffff` | 2.5 |
| `recent3d` | 3日以内に確認 | `#f59e0b` | `#ffffff` | 2 |
| `season` | 今シーズン確認あり | `#ffffff` | `#64748b` | 1.75 |
| `none` | 今シーズンの記録なし | `#94a3b8` | `#e2e8f0` | 1（`fill-opacity:.85`） |

> 現行の `src/lib/score.ts` の `FRESHNESS_COLOR`（`#16a34a` / `#eab308` / `#e2e8f0` / `#64748b`）
> から**値が変わっている**。⚪今シーズンは薄いグレー塗り→白塗り+グレー縁、
> ⚫記録なしは濃いグレー→薄いグレーへ。地図の第一印象を今日に寄せるための変更。
> `FRESHNESS_COLOR` を上の値に差し替えること。

### ピン半径（ズーム連動・MapLibre の interpolate stops としてそのまま使える）

```
today:    ["interpolate",["linear"],["zoom"],  8, 7.5,  11, 11,   14, 15  ]
recent3d: ["interpolate",["linear"],["zoom"],  8, 5.5,  11, 8.5,  14, 11  ]
season:   ["interpolate",["linear"],["zoom"],  8, 4,    11, 6.5,  14, 9   ]
none:     ["interpolate",["linear"],["zoom"],  8, 2.5,  11, 4.5,  14, 6   ]
```
同じ値が `design/higurashi-core.js` の `FRESHNESS[*].zoomRadius` に配列で入っている。
MapLibre では鮮度を feature property にして `["match", ["get","freshness"], ...]` で
半径・色・縁を1レイヤーで出し分けるのが素直（レイヤーを4本に割らない）。

**描画順**: `none → season → recent3d → today` の順で重ねる（今日が最前面）。
MapLibre なら `symbol-sort-key` 相当か、`circle-sort-key` に鮮度の序列を入れる。

### パルス（🟢今日だけ）
- 36×36px の円、`background:#059669`
- `@keyframes higPulse { 0% { transform:scale(.5); opacity:.5 } 100% { transform:scale(2.2); opacity:0 } }`
- `animation: higPulse 2.4s ease-out infinite`
- ピンの下のレイヤー（Leafletでは `z-index:350` の専用ペイン、`pointer-events:none`）
- MapLibre では DOM マーカーで出すのが早いが、**今日のピンは通常10件前後**なので
  マーカー数は問題にならない。`prefers-reduced-motion: reduce` では止めること。

### 地点名ラベル（🟢今日だけ・ズーム 9.8 以上）
- **出すのは `freshness === "today"` のピンだけ。** 155件すべてに出すと文字で埋まって逆に読めない
- 表示文言は `p.name.split(/[（(・]/)[0]` — 「狭山湖（トトロの森・狭山丘陵）」→「狭山湖」
- 期待度スコアの高い順に置き、既に置いたラベルと重なるものは出さない
- 画面右端に近いピンは左出しに反転させる（地図の外へはみ出させない）
- オフセット = 今日ピンの半径 + 6px
- 見た目: `background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:2px 7px;`
  `font:700 12px/1.4; color:#0f172a; box-shadow:0 1px 5px rgba(15,23,42,.2); white-space:nowrap`

> **MapLibre では自前の衝突判定を書かないこと。** `symbol` レイヤーに
> `text-allow-overlap:false` / `text-ignore-placement:false` を指定すれば、
> 重なり回避も端の反転（`text-variable-anchor: ["right","left"]`）も標準機能で入る。
> プロトタイプが手で書いているのは Leaflet にこの機能が無いため。
> `["step", ["zoom"], "", 9.8, ["get","label"]]` でズーム閾値を表現できる。

### リング（hover / 選択）
- hover: 半径17px / `color:#0f172a` / 太さ3 / `opacity:.5` / 塗りなし
- 選択: 半径20px / `color:#0f172a` / 太さ4 / `opacity:1` / 塗りなし
- **一覧行に hover → 地図のピンが光る。ピンに hover → 地点名の吹き出しが出る。**
  クリックしなくても対応が分かるようにする（PCのみ）

### ホバー吹き出し（PC）
ピンの真上（`transform:translate(-50%,-100%)`、`top = pinY - 16px`）に:
```
background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:9px 13px;
box-shadow:0 6px 20px rgba(15,23,42,.2)
```
- 地点名 14px / 700 / `#0f172a`
- 下段にドット + 12px / `#475569` — 「8分前に聞こえた ・ ★★★★」

### 地点を選んだときのカメラ
```
zoom = max(現在のzoom, 11.5)
中心を左パネルぶんずらす: PC は x を +196px（パネル幅392pxの半分）
                        スマホは y を −110px（詳細シートに隠れないよう）
flyTo duration 0.7s
```

### 現在地ボタン ◎
- 地図右上、ズームコントロールの下
- 押すと: 現在地へ `flyTo(zoom 11.4, duration .9)` + **並び順を「近い順」に自動で切り替える** +
  現在地マーカーを出す
- 現在地マーカー: 22px の `rgba(14,165,233,.22)` の円の中に、12px の `#0ea5e9` の点
  （`border:2px solid #fff; box-shadow:0 1px 3px rgba(15,23,42,.4)`）
- 「今どこにいて、そこから何が近いか」が1タップで揃うのが狙い。
  既存の `GeolocateControl` を使ってよいが、`geolocate` イベントで `sort` を `near` にすること

### 地図クリック
ピン以外をクリック/タップしたら選択解除。タップ判定は既存どおり **周囲10pxまでを拾う**。

---

## ロジック（計算式）

`design/higurashi-core.js` は `src/lib/score.ts` / `sun.ts` の移植 + 新規追加。
**新しく足したのは下の4つだけ**なので、これを `src/lib/score.ts` に足せばよい。

```ts
// ① ★は点いた分だけ。空の☆は並べない（レビュー点数に見えるため）
export const starsText = (s: number) => (s > 0 ? "★".repeat(s) : "");

// ② ★の根拠を一行で。加点の主役だけを出す
export function reasonText(s: PlaceStats, now: Date): string {
  if (!s.lastHeardAt) return "今シーズンの記録なし";
  const ago = agoText(s.lastHeardAt, now);
  let t = s.heardIn3hCount >= 2
    ? `${ago}に確認・3時間で${s.heardIn3hCount}件`
    : `${ago}に確認`;
  if (s.quietIn3hCount > 0) t += `・静かだった ${s.quietIn3hCount}件`;
  return t;
}

// ③ おすすめ順。1kmにつき0.5点（最大30点）引く。★の値そのものは変えない
export function rankScore(s: PlaceStats, distKm: number, weight = 0.5): number {
  return s.score - Math.min(distKm, 60) * weight;
}

// ④ 「8分前」「2時間前」— 地図の横で読む用の短い表記
export function agoText(d: Date, now: Date): string {
  const m = Math.round((+now - +d) / 60000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const days = Math.floor((+startOfDay(now) - +startOfDay(d)) / 86400000);
  return days === 1 ? "昨日" : `${days}日前`;
}
```

`placeStats` の戻り値に **`heardIn3hCount` / `quietIn3hCount` / `todayHeardCount` の3つを追加**する
（加点ルール自体は現行のまま変更なし）。

### 期待度（変更なし・現行の `placeStats` のまま）
30分以内 +30 / 3時間以内 +10 / 24時間以内 +5 / 3時間内に2件以上 +20 /
直近がGPS精度50m以内 +10 / 3時間内の「静かだった」1件につき −5（最大 −15）、下限0。
★ = 55↑:5 / 35↑:4 / 20↑:3 / 10↑:2 / 1↑:1 / 0:0

### 並び順
- **おすすめ順（既定）**: `rankScore` 降順 → 同点なら最終確認が新しい順
- **近い順**: 距離昇順 → 同距離なら期待度降順

### 「今夜はここ」の母集団
- 母集団は **`freshness !== "none"` の場所だけ**。記録なし139か所を混ぜて上位8件を出すと、
  下のほうが根拠のない並びになる
- ただし記録が1件も無い時期は母集団が空になるので、そのときは近い順の候補で埋める
- 上位8件を取り、ヒーローが出る日は残り7件、出ない日は8件すべてを一覧に出す
  （ヒーローを出さない日は1件目を削らない。案内文が指している「下の場所」の先頭がそれ）

### 聞きどき（日の入り ±30分）
- 既存の `src/lib/sun.ts` を使う（プロトタイプの `sunsetDate` は簡易版）
- 状態文言: 窓の中 = 「いま聞きどき」/ 前 = 「聞きどきはこれから」/ 後 = 「今日の聞きどきは過ぎた」
- 残り時間: 窓の中 = 「18:42まで あと30分」/ 前 = 「あと45分で始まる」/ 後 = 「明け方にもよく鳴く」
- PCの案Aにある帯グラフ（`#6ee7b7` の塗り + `#f59e0b` の日の入りマーク +
  `#047857` の現在位置マーカー）は**案Bでは使わない**。案Bはタブ右端の一行テキストだけ

---

## 状態

| 名前 | 型 | 説明 |
|---|---|---|
| `reports` | `Report[]` | 既存どおり。1分ごとに再取得 |
| `now` | `Date` | 既存どおり |
| `selectedId` | `string \| null` | 選択中の地点。`null` = 一覧 |
| `query` | `string` | 検索語（即時反映） |
| `filter` | `"all" \| "today" \| "recent3d" \| "season"` | 鮮度チップ |
| `tab` | `"list" \| "feed"` | 一覧 / 今日の報告 |
| `sort` | `"reco" \| "near"` | 並び順。◎ボタンで `near` に自動切替 |
| `sheet` | `"cards" \| "list"` | **スマホのみ。** 既定 `cards` |
| `bounds` | 地図の表示範囲 | `moveend` で更新し、一覧の絞り込みに使う |
| `userPos` | `{lat,lng} \| null` | 既存どおり。距離計算の起点 |
| `postState` | `idle \| sending \| done \| error` | 既存どおり |
| `comment` / `showComment` | | 既存どおり |

**遷移**
- 地点選択 → `postState` を `idle` にリセット、`comment` をクリア
- 投稿完了 → `done`。「閉じる」で `idle` に戻る（詳細は開いたまま）
- チップ / 検索 / 地図移動 → 一覧の母集団が変わる。選択は解除しない（地図移動では）
- チップ切替時は `selectedId` を `null` に戻す

`layout`（A/B/C）と `device`（pc/sp）はプロトタイプ用の比較スイッチ。**実装不要。**

---

## デザイントークン

### 色
```
── 濃い面（ヘッダー）
#064e3b  ヘッダー背景
#ecfdf5  ヘッダー上の文字 / ヒーローカード背景
#a7f3d0  ヘッダー上の副文 / ヒーローカードの枠
#6ee7b7  ヘッダー上の補助テキスト / 聞きどき帯の塗り
#d1fae5  暗い面の未選択チップ文字

── 緑（主アクション・今日）
#059669  主ボタン / 今日のピン / アクセント
#047857  主ボタンhover / 「今日」系テキスト
#065f46  根拠テキスト（濃い緑）
#bbf7d0  ヒーローカード内の区切り線

── 状態
#f59e0b  ★ / 3日内のピン
#475569  「静かだった」ボタン / 副次テキスト
#334155  「静かだった」hover / 小見出し
#0369a1  「ひとこと添える」リンク
#0ea5e9  現在地マーカー
#0f172a  本文 / 𝕏シェアボタン背景

── 面と罫
#ffffff  カード・パネル
#f8fafc  淡い面（件数バー・投稿エリア・入力欄）
#f1f5f9  区切り線 / hover背景
#e2e8f0  枠線
#cbd5e1  入力欄の枠 / つまみ
#64748b  薄いテキスト / 今季ピンの縁
#94a3b8  記録なしのピン
#eef2f6  地図の読み込み前背景
```

### タイポグラフィ
```
font-family: Arial, Helvetica, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif
```
> 既存コードベースが別のフォント指定を持っているならそちらを優先。
> 日本語のゴシック体であれば見た目は保たれる。

| 用途 | サイズ / ウェイト |
|---|---|
| 詳細の地点名 | 22–24px / 700 |
| ヒーローの地点名 | 19px / 700 |
| ★（詳細） | 19–20px |
| 一覧の地点名 / 主ボタン | 15px / 600–700 |
| カードの地点名 / 検索input(SP) | 16px / 700 |
| タブ / 本文 | 14px / 700 |
| 根拠 / 所在地 / 時刻 / チップ | 12–13px |
| 「今夜はここ」ラベル | 11px / 700 / `letter-spacing:.09em` |

行間: 見出し 1.28–1.35 / 本文 1.6–1.7

### 角丸
```
9999px  チップ・ドット・つまみ
20px    スマホ詳細シート上端
18px    スマホ一覧シート上端
14px    スマホの投稿ボタン / 完了カード
12px    PCの投稿ボタン / カード / ヒーロー / 凡例
11px    完了カード内のボタン
10px    入力欄 / ホバー吹き出し
6px     地図ラベル
```

### 影
```
3px 0 22px rgba(15,23,42,.15)   PC左パネル
0 -6px 22px rgba(15,23,42,.18)  スマホ一覧シート
0 -8px 26px rgba(15,23,42,.24)  スマホ詳細シート
0 6px 20px rgba(15,23,42,.2)    ホバー吹き出し
0 3px 14px rgba(15,23,42,.12)   凡例
0 1px 5px rgba(15,23,42,.2)     地図ラベル
```

### 余白
4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 26px（4の倍数を基本に、行内は2px刻みで詰めている）

### 鮮度ドット（一覧・カード・詳細で使う小さな丸）
```
今日:     14px, background:#059669,  border:2px solid #fff,     box-shadow:0 0 0 1px rgba(5,150,105,.4)
3日内:    12px, background:#f59e0b,  border:2px solid #fff,     box-shadow:0 0 0 1px rgba(245,158,11,.45)
今季:     10px, background:#fff,     border:1.75px solid #64748b
記録なし: 10px, background:#94a3b8,  border:0
```
詳細ヘッダーでは12px固定。

---

## 文言（そのまま使うもの）

**変更禁止の定型文**
- キャッチコピー: 「今日、カナカナが聞こえる場所。」
- 投稿完了: 「カナカナ情報を受け取りました。」/「今日ヒグラシを探している誰かの助けになります。」

**この再設計で足した文言**
| 場所 | 文言 |
|---|---|
| ヒーロー見出し | 今夜はここ |
| ヒーロー不在時 | 今日の報告はまだありません |
| 同・補足 | 行って聞こえたら、その場で教えてください。日の入り前後30分が聞きどきです。 |
| 件数（範囲） | 表示中の範囲に 42件 |
| 件数（検索） | 「見沼」で 3件 |
| 並び替え | おすすめ順 / 近い順 |
| チップ | すべて / 🟢 今日 / 🟡 3日内 / 今季 |
| 検索placeholder | 地点名で探す（例: 見沼、高尾）※スマホは「地点名で探す」 |
| 一覧0件 | 条件に合う場所がありません。地図を動かすか、絞り込みを「すべて」にもどしてください。 |
| 報告0件 | まだ一件も届いていません。今日の一件目になれます。 |
| 投稿ボタン | 🌲 カナカナ聞こえた！ / 🌙 今日は静かだった |
| 任意入力 | ひとこと添える（任意） |
| スマホ導線 | 一覧を見る 42件 / 地図を広く |
| 現在地ボタンtitle | 現在地から近い場所を探す |
| 件数（詳細） | 今日 3 件確認 ・ 昨日 2 件 ・ 今シーズン計 11 件 |

`AGENTS.md` のとおり、新しい文言は普通の文で書く。体言止めで気取らない。
専門用語（accuracy / RLS など）を画面に出さない。

---

## アセット

**新規アセットなし。** 使っているのは:
- 国土地理院 pale タイル（既存・キー不要）
- 絵文字 🌲 🌙 🟢 🟡（既存UIから引き継ぎ）と ★ ◎ ✕ 𝕏（文字）
- アイコン画像・SVGは一切使っていない

---

## 実装時に踏まないこと（既存 AGENTS.md より）

1. **MapLibreのワーカー**: `maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs")` を消さない。
   `predev`/`prebuild` の `copy-map-worker` も外さない。外すとピンが一切描画されない
2. **MapLibre は地図コンテナに `position:relative` を強制する**。
   `absolute inset-0` では高さ0になる。`h-full w-full` で大きさを与えること
3. 左パネルを**地図の上に重ねる**設計なので、地図コンテナは全幅のまま。
   パネルぶんを地図から削ると、選択時のカメラオフセット（+196px）が意味を失う

## 作らないもの（VISION の禁止リスト）

アカウント / ログイン / プロフィール / フォロー / いいね / コメント欄（スポットへの一言は除く）/
DM / ランキング / ポイント / バッジ / ゲーミフィケーション全般。

この再設計にも入れていない。**「おすすめ順」は順位付けであってランキング機能ではない**
（人ではなく場所を、その日の期待度で並べているだけ）。混同しないこと。

---

## 動作確認の基準

`AGENTS.md` のとおり、**「ブラウザで実際に見えるか」まで確認しないと完了にしない**。
部品の存在チェックだけでは、高さ0やワーカー死亡を見逃す。最低限これを目で見ること:

- [ ] 155個のピンが出て、🟢今日が大きく濃い / ⚫記録なしが小さく薄い
- [ ] 🟢今日のピンだけパルスが動いている
- [ ] ズームを 9.8 以上に寄せると 🟢今日のピンにだけ地点名が出て、**重ならない**
- [ ] 地図を動かすと一覧の件数が変わる
- [ ] 一覧の行に hover すると地図のピンにリングが出る
- [ ] スマホ幅で下端カードが横スクロールし、タップで詳細シートが上がる
- [ ] 詳細をスクロールしても投稿2ボタンが下端に残っている
- [ ] 投稿 → 「送信中…」 →「カナカナ情報を受け取りました。」まで通る
- [ ] 投稿が今日ゼロの状態で開くと、「今夜はここ」が出ずに案内文になる

---

## ファイル

### このバンドル
```
README.md              この文書
実装手順.md             着手順のタスク分解（repo のどのファイルを触るか）
design/
  再設計案.dc.html       ★案B の参照実装（PC/スマホ、案A・案Cも比較用に同梱）
  現行UI.dc.html        現行UIの再現（差分確認用）
  higurashi-core.js     期待度・鮮度・時刻表記・サンプルデータ
  support.js            上のHTMLをブラウザで開くための実行環境
  data/places.json      155スポット（repo の src/data/places.json のコピー）
```
`design/data/places.json` は参照実装を動かすためのコピー。スポットを増やしたり座標を直したら、
`src/data/places.json` からコピーし直すこと（正本は常に `src/data/places.json` のほう）。
開き方:

```
npm run design
```

`http://localhost:4321/再設計案.dc.html` と `http://localhost:4321/現行UI.dc.html` が開ける。

- **`file://` で直接開くと真っ白になる。** HTMLの中で `fetch("data/places.json")` と
  `import("./higurashi-core.js")` を使っていて、どちらもブラウザが `file://` では止めるため。
- **インターネット接続が要る。** React と Leaflet を CDN（unpkg / jsdelivr）から、
  地図タイルを国土地理院から読んでいる。社内ネットワークなどで塞がれていると
  画面が真っ白になる（本体アプリのほうは Leaflet も React も CDN に頼っていないので無関係）。

上部のタブで 案A / 案B / 案C、PC / スマホ、今夜のサンプル / 投稿ゼロの日 を切り替えられる。
**案Bだけが完成している。案A・案Cは判断の記録として残しているだけで、実装対象ではない。**

### 実装先（既存リポジトリ）
| ファイル | 変更内容 |
|---|---|
| `src/components/App.tsx` | 画面構成をまるごと組み直し。パネル / 一覧 / 詳細 / 投稿 |
| `src/components/MapView.tsx` | ピンの出し分け・パルス・ラベル・リング・カメラオフセット |
| `src/lib/score.ts` | `FRESHNESS_COLOR` の値変更、`starsText` 変更、`reasonText`/`rankScore`/`agoText` 追加、`PlaceStats` に3項目追加 |
| `src/lib/sun.ts` | 変更なし（そのまま使う） |
| `src/lib/store.ts` | 変更なし |
| `src/data/places.json` | 変更なし |
| `supabase/schema.sql` | 変更なし（**DBスキーマは触らない**） |
