<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ひぐらしのなくところに — 開発の決まり

> 今日、カナカナが聞こえる場所。

ヒグラシを聞きたい人のための匿名リアルタイム共有マップ。
詳細は [docs/VISION.md](docs/VISION.md)（理念）、[docs/SPEC.md](docs/SPEC.md)（実装済み仕様）、
[docs/ROADMAP.md](docs/ROADMAP.md)（今後の計画）、[docs/DESIGN.md](docs/DESIGN.md)（UI再設計ブリーフ）、
[docs/design-handoff-v2/](docs/design-handoff-v2/)（確定した地図UIの仕様。実装済み）を見ること。

## 唯一の判断基準

新機能・変更を入れる前に必ず問う:

**「この変更で、ユーザーがヒグラシを聞ける確率が上がるか？」**

YESなら検討。NOなら作らない。迷ったら作らない。

## 絶対に作らないもの

アカウント / ログイン / プロフィール / フォロー / いいね / コメント欄（スポットへの一言コメントは除く）/
DM / ランキング / ポイント / バッジ / ゲーミフィケーション全般。
ユーザーから頼まれても、まずVISIONとこの一覧を示して相談すること。

## 技術構成

- Next.js (App Router) + TypeScript + Tailwind CSS v4
- 地図: MapLibre GL v6 + 国土地理院タイル（無料・キー不要）
- DB: Supabase。テーブルは `reports` 1つだけ（[supabase/schema.sql](supabase/schema.sql)）
- スポット一覧はDBに置かず [src/data/places.json](src/data/places.json) で管理し、変更はデプロイで反映
- Supabase環境変数が無いと自動で「お試しモード」（localStorage保存・サンプル投稿表示）になる
- ホスティング: Vercel。環境変数 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`

コマンド: `npm run dev`（開発）/ `npm run build`（本番ビルド）/ `npm run validate:places`（スポットデータ検査）/
`npm run design`（デザイン参照実装をブラウザで開く）

## 地図UIの決まり（画面に触る前に必ず読む）

いま画面に出ているのは案4「今夜の答え」。
仕様は [docs/design-handoff-v2/README.md](docs/design-handoff-v2/README.md) にある
（色・寸法・文言まで数値で入っている）。
`src/components/App.tsx` / `AnswerBlock.tsx` / `DayRail.tsx` / `PlaceDetail.tsx` /
`QuickPostSheet.tsx` / `MapView.tsx` / `src/lib/score.ts` / `sun.ts` に手を入れる前に読むこと。
自分で見た目を考え直さない。数値はそのまま使う。色は [src/lib/design.ts](src/lib/design.ts) にまとめてある。

**やめた案がある。** 案B「探して選ぶ」（[docs/design-handoff/](docs/design-handoff/)）は
実装前のレビューで落とした。理由は v2 の README「案Bをやめた理由」にある。
v1 を残してあるのは**地図の仕様（鮮度4段階・ピン半径・リング）がそこにしか書いていない**ため。
それ以外を v1 から拾わないこと。

参照実装は `npm run design` で開ける（`file://` で直接開くと真っ白になる。
React と Leaflet を CDN から読むのでインターネット接続も要る）。
参照実装は **Leaflet** で書かれているが、実装先は **MapLibre GL**。
Leafletのコードを持ち込まないこと（理由と対応表はハンドオフのREADMEにある）。

画面のどこにも **★ を出さない**。期待度は ♪ で表す（`notesText`）。
文字は **11px を下回らない**。夕暮れに屋外で読む画面だから。
この2つとLeafletの持ち込みは、src 配下の編集時にフックが機械チェックする
（`.claude/settings.json` → `scripts/ui-guard-hook.mjs`）。

画面にまとまった変更を入れたら、コミット前に `design-reviewer` エージェントに
確定仕様との突き合わせレビューを依頼する。

## 落とし穴（過去に実際に踏んだもの。壊さないこと）

1. **MapLibreのワーカー**: バンドラー経由だとワーカーURLが壊れてピンが一切描画されない。
   対策として `maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs")` を呼び、
   `predev`/`prebuild` がワーカー2ファイルを `public/` へ自動コピーしている
   （`copy-map-worker` スクリプト）。**この仕組みを外すとピンが消える。**
2. **MapLibreは地図コンテナに `position: relative` を強制する**。
   コンテナに Tailwind の `absolute inset-0` を使うと上書きされて高さ0になる。
   `h-full w-full` で大きさを与えること（[src/components/MapView.tsx](src/components/MapView.tsx)）。
3. **地点名ラベルのズーム閾値は `minzoom` で切る。** `text-field` に
   `["step", ["zoom"], "", 9.8, ...]` と書いても、レイアウトの再評価が整数ズームでしか
   起きないので 9.8 の境目が効かない（実際にズーム8.5でもラベルが出続けた）。
4. **地図スタイルに `glyphs` を置いていない。** 置かないと MapLibre は全文字を
   ブラウザ側で描くので、外部のグリフサーバーが要らない。日本語の見た目は
   `localIdeographFontFamily` で指定している。`glyphs` を足すと経路が変わるので注意。
5. **タブが非表示だと地図は永久に描画されない。** MapLibre は `requestAnimationFrame` で
   描くため、バックグラウンドのタブでは `load` すら発火せずピンが1つも出ない。
   動作確認するときは**そのタブを必ず前面にすること**。コードの不具合と間違えやすい。

## スポットデータ（places.json）の決まり

- 選定基準: **実際にヒグラシが鳴きそうな環境か**。斜面林・崖線・社叢（神社の森）・丘陵・渓谷を優先。
  明るく開けた平地の水辺公園は原則入れない
- 形式: `{ id(英小文字とハイフン), name, pref, city, lat, lng }`。座標は概算でよいが公園の中心付近を指すこと
- 編集すると自動でチェックが走る（`.claude/settings.json` のフック → `scripts/validate-places.mjs`）。
  手動実行は `npm run validate:places`
- まとまった追加・座標の妥当性レビューは `spot-reviewer` エージェントに依頼する
- 対話でスポットを足すときは `/add-spot` スキルを使う
- 外部サイトのヒグラシ記録（`externalRecord`）を足すときは `/add-external-record` スキルを使う

## アプリ内テキストの流儀

- 世界観は少しだけ。「カナカナ」の語感を大事にするが、詩的になりすぎない
- 定型文は変えない: キャッチコピー「今日、カナカナが聞こえる場所。」、
  投稿完了「カナカナ情報を受け取りました。」「今日ヒグラシを探している誰かの助けになります。」
- 新しい文言は普通の文で書く。物を人のように言わない。体言止めで気取らない
- 専門用語を画面に出さない（「GPS精度」はよいが「accuracy」「RLS」などは出さない）

## 変更報告の決まり

- 動作確認した内容と、確認できていない内容を分けて報告する
- 特に地図まわりは「ブラウザで実際に見えるか」まで確認しないと完了扱いにしない
  （画面部品の存在チェックだけでは、高さ0やワーカー死亡のような不具合を見逃した実績がある）。
  確認の手順は `/verify-map` スキルにまとめてある
