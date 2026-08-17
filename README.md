# ひぐらしのなくところに

> 今日、カナカナが聞こえる場所。

ヒグラシを聞きたい人が、今日聞ける場所へ行けるようにするための匿名共有マップ。

**公開中: https://higurashi-map-xi.vercel.app/** （2026-08-08リリース）

## ドキュメント

- [docs/VISION.md](docs/VISION.md) — 何のためのサービスか・作らないもの
- [docs/SPEC.md](docs/SPEC.md) — 実装済み仕様（期待度の計算式・データモデル）
- [docs/ROADMAP.md](docs/ROADMAP.md) — 今後の計画
- [docs/DESIGN.md](docs/DESIGN.md) — UI再設計ブリーフ（PC対応。依頼側の記録）
- [docs/design-handoff-v2/](docs/design-handoff-v2/) — 確定した地図UIの仕様と参照実装（案4「今夜の答え」。2026-08-09に実装済み）
- [docs/design-handoff/](docs/design-handoff/) — 実装前に落とした案Bの記録。地図の仕様（鮮度4段階・ピン半径・リング）だけは現行
- [AGENTS.md](AGENTS.md) — 開発の決まり（AIアシスタント向け。人が読んでも有用）

## 構成

- Next.js (App Router) + Tailwind CSS
- 地図: MapLibre GL + 国土地理院タイル（無料・キー不要）
- DB: Supabase（`reports` テーブル1つだけ。スポット一覧は `src/data/places.json` で管理）
- ホスティング: Vercel

Supabaseの接続情報が設定されていない場合は自動的に「お試しモード」になり、
サンプル投稿を表示し、投稿は端末のlocalStorageにだけ保存される。

## ローカルで動かす

```
npm install
npm run dev
```

→ http://localhost:3000 （接続情報が無ければお試しモードで動く）

デザインの参照実装（[docs/design-handoff-v2/](docs/design-handoff-v2/)）を見るには:

```
npm run design
```

→ PC版 http://localhost:4321/plan4-answer.dc.html / スマホ版 http://localhost:4321/plan4-answer-sp.dc.html
（React と Leaflet を CDN から読むため、インターネット接続が要る）

## 公開手順

1. **Supabase** (https://supabase.com) でプロジェクトを作成（無料枠でOK、リージョンは Tokyo 推奨）
2. SQL Editor で `supabase/schema.sql` の中身を貼り付けて Run
3. Project Settings → API Keys から Project URL と **Publishable key** をコピー
   （旧 anon キーの後継。ブラウザに出てよい公開用キー。**Secret keys は使わない**）
4. プロジェクト直下に `.env.local` を作る:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
   ```
   （環境変数名は歴史的に ANON_KEY のままだが、値は Publishable key でよい）
5. **Vercel** (https://vercel.com) にこのリポジトリをインポートし、
   上と同じ2つの環境変数を設定してデプロイ

## スポットの追加・修正

`src/data/places.json` を編集して再デプロイするだけ。

### 座標の検算

手で入力した緯度経度は数百m〜数kmずれることがある。
OpenStreetMap の実データと突き合わせて、ずれを一覧にするスクリプトを用意してある。

```
node scripts/check-coords.mjs              # 全件
node scripts/check-coords.mjs takao mitake  # 指定したidだけ
```

無料・APIキー不要（Overpass API を使う）。**書き換えはしない**ので、
出た差分を見て、納得できるものだけ手で直す。

同名の別施設・案内看板・バス停を拾うことがあるため、鵜呑みにしないこと。
実際に「石坂の森」でゴルフ場を、「舎人公園」で駅を拾った例がある。

## コントリビュート歓迎

一番助かるのは **スポットの追加・座標の修正** です。
`src/data/places.json` を編集してプルリクエストを送ってください。
「実際にヒグラシが鳴く場所か」を基準にしています（住宅街の公園でも、鳴くなら歓迎）。

ライセンスは MIT です（[LICENSE](LICENSE)）。

## 期待度の計算（ルールベース、AI不使用）

- 30分以内に「聞こえた」 +30 / 3時間以内 +10 / 24時間以内 +5
- 3時間以内に2件以上 +20（複数人確認）
- 直近の投稿がGPS高精度（50m以内） +10
- 3時間以内の「静かだった」 1件につき -5（最大-15）
- 外部サイトの記録（運営が調べたもの）が3日以内 +10 / 今シーズン内 +5

合計を ♪0〜5 に変換して表示する。外部記録だけでは ♪2 が上限で、
♪3以上はアプリへのリアルタイム投稿でしか付かない。
詳しい変換の値は [docs/SPEC.md](docs/SPEC.md) を参照。

## ピンの色

- 🟢 今日「聞こえた」報告あり
- 🟡 3日以内
- ⚪ 今シーズン（6/1以降）
- ⚫ 今シーズンの記録なし
