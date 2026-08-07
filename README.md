# ひぐらしのなくところに

> 今日、カナカナが聞こえる場所。

ヒグラシを聞きたい人が、今日聞ける場所へ行けるようにするための匿名共有マップ。

## ドキュメント

- [docs/VISION.md](docs/VISION.md) — 何のためのサービスか・作らないもの
- [docs/SPEC.md](docs/SPEC.md) — 実装済み仕様（期待度の計算式・データモデル）
- [docs/ROADMAP.md](docs/ROADMAP.md) — 今後の計画
- [docs/DESIGN.md](docs/DESIGN.md) — UI再設計ブリーフ（PC対応）
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

## 公開手順

1. **Supabase** (https://supabase.com) でプロジェクトを作成（無料枠でOK、リージョンは Tokyo 推奨）
2. SQL Editor で `supabase/schema.sql` の中身を貼り付けて Run
3. Project Settings → API から URL と anon key をコピー
4. プロジェクト直下に `.env.local` を作る:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
5. **Vercel** (https://vercel.com) にこのリポジトリをインポートし、
   上と同じ2つの環境変数を設定してデプロイ

## スポットの追加・修正

`src/data/places.json` を編集して再デプロイするだけ。
座標はおおよその値で登録してあるので、ずれていたら直してほしい。

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

合計を ★0〜5 に変換して表示する。

## ピンの色

- 🟢 今日「聞こえた」報告あり
- 🟡 3日以内
- ⚪ 今シーズン（6/1以降）
- ⚫ 今シーズンの記録なし
