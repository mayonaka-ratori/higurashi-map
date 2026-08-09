# 参照実装の開き方

`docs/design-handoff-v2/README.md` の仕様に対応する、実際に動くプロトタイプ。

```
plan4-answer.dc.html      案4 PC（1440×900）
plan4-answer-sp.dc.html   案4 スマホ（390×844）
hig-kit.js                ♪・朝夕の窓・地図（今回足した共有ロジック）
higurashi-core.js         期待度・鮮度・時刻表記・サンプルデータ
support.js                上のHTMLをブラウザで開くための実行環境
data/places.json          155スポット（正本は src/data/places.json）
```

## 開く

`file://` で直接開くと真っ白になる（`fetch("data/places.json")` と
`import("./hig-kit.js")` をブラウザが `file://` では止めるため）。
このディレクトリを HTTP で配信すること。

```
npx serve docs/design-handoff-v2/design
```

インターネット接続も要る。React・Leaflet を CDN から、地図タイルを国土地理院から読んでいる。

## 見どころ

上部の「表示するデータ」で3つの日を切り替えられる。

- **今夜のサンプル** — 21件の投稿がある日。答えが立つ
- **報告が1件の日** — 弱い根拠しかない日。候補の見出しが「近くの場所」に変わる
- **投稿ゼロの日** — 一番よく起きる日。別の画面に切り替わる

投稿は最後まで通る。押すと送信中→完了まで進み、**その場所のピンが緑になり、♪が増え、
時間帯レールに点が増える**。PCは3回に1回だけ失敗させてエラー画面も見えるようにしてある。

## 実装先との違い

| | プロトタイプ | 実装先（既存） |
|---|---|---|
| 地図ライブラリ | **Leaflet 1.9.4**（CDN） | **MapLibre GL v6** |
| ピン | `L.circleMarker` を155個 | `circle` レイヤー + GeoJSON ソース1本 |
| ラベル | 自前の衝突判定（`hig-kit.js` の `syncLabels`） | `symbol` レイヤー（`text-allow-overlap:false`） |
| データ | 固定時刻のサンプル21件 | Supabase / お試しモードの実データ |
| タイル | 国土地理院 pale | 同じ（変更なし） |

**Leaflet のコードを持ち込まないこと。** プロトタイプが Leaflet なのは、
デザイン検討の場で手早く動かすためだけの都合。

`data/places.json` は動かすためのコピー。スポットを増やしたり座標を直したら
`src/data/places.json` からコピーし直すこと。
