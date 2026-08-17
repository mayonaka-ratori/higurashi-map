"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Place } from "@/lib/types";
import type { Freshness, PlaceStats } from "@/lib/score";
import type { FreeReport } from "@/lib/view";
import { C, FRESHNESS_COLOR, shortName } from "@/lib/design";

export type MapHandle = {
  // スマホの◎ボタンから現在地取得を起こす（見た目は自前のボタン）
  locate: () => void;
};

// 自由報告の点を押したときに吹き出しへ渡すもの。
// 地図の中では日付を扱えないので、時刻はミリ秒の数値のまま渡す
export type FreeTapInfo = {
  freshness: Freshness;
  count: number;
  latestAtMs: number;
};

type Props = {
  places: Place[];
  statsById: Record<string, PlaceStats>;
  // 地図に名前が載っていない場所での「聞こえた」。App.tsx でまとめ済み
  freeReports: FreeReport[];
  selectedId: string | null;
  hoverId: string | null;
  variant: "pc" | "sp";
  onSelect: (id: string | null) => void;
  onFreeTap: (info: FreeTapInfo, point: { x: number; y: number }) => void;
  onFreeTapClear: () => void;
  onHover: (id: string | null, point: { x: number; y: number } | null) => void;
  onUserLocate: (lat: number, lng: number) => void;
  onLocateStart: () => void;
  ref?: React.Ref<MapHandle>;
};

// PC は右パネル404pxの下に地点名を置かない。その分だけ右を空ける
const LABEL_INSET_RIGHT = 416;

function toGeoJson(
  places: Place[],
  statsById: Record<string, PlaceStats>
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        freshness: statsById[p.id]?.freshness ?? "none",
        score: statsById[p.id]?.score ?? 0,
        label: shortName(p.name),
      },
    })),
  };
}

// 自由報告の点。MapLibreはこの中身をワーカーへ渡すので、
// 数値・文字列・真偽値だけを入れる（Dateを入れると地図の式から読めない）
function freeToGeoJson(list: FreeReport[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: list.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.lng, f.lat] },
      properties: {
        freshness: f.freshness,
        count: f.count,
        latestAtMs: f.latestAtMs,
      },
    })),
  };
}

// 鮮度ごとの出し分け（design-handoff/README.md「地図の仕様」の確定値。v2でも変更なし）
function byFreshness(
  today: number | string,
  recent3d: number | string,
  season: number | string,
  none: number | string
) {
  return [
    "match",
    ["get", "freshness"],
    "today",
    today,
    "recent3d",
    recent3d,
    "season",
    season,
    none,
  ] as unknown as maplibregl.ExpressionSpecification;
}

const TODAY_ONLY = ["==", ["get", "freshness"], "today"] as unknown as maplibregl.FilterSpecification;

export default function MapView({
  places,
  statsById,
  freeReports,
  selectedId,
  hoverId,
  variant,
  onSelect,
  onFreeTap,
  onFreeTapClear,
  onHover,
  onUserLocate,
  onLocateStart,
  ref,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null);
  const readyRef = useRef(false);
  // 今日のピンに出しているパルス（DOMマーカー）。地点IDで引く
  const pulsesRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // イベントハンドラから常に最新のコールバックとデータを見るための参照
  const cb = useRef({
    onSelect,
    onFreeTap,
    onFreeTapClear,
    onHover,
    onUserLocate,
    onLocateStart,
  });
  cb.current = {
    onSelect,
    onFreeTap,
    onFreeTapClear,
    onHover,
    onUserLocate,
    onLocateStart,
  };
  const dataRef = useRef({ places, statsById, freeReports, variant, selectedId });
  dataRef.current = { places, statsById, freeReports, variant, selectedId };

  // 親（スマホの◎ボタン）から現在地取得を呼べるようにする
  useImperativeHandle(
    ref,
    () => ({ locate: () => geolocateRef.current?.trigger() }),
    []
  );

  // 右パネルの下に隠れるラベルを落とす。今日のピンだけが対象なので毎回10件前後
  function applyLabelInset(map: maplibregl.Map) {
    if (!map.getLayer("places-label")) return;
    if (dataRef.current.variant !== "pc") {
      map.setFilter("places-label", TODAY_ONLY);
      return;
    }
    const limit = map.getContainer().clientWidth - LABEL_INSET_RIGHT;
    const hidden: string[] = [];
    for (const p of dataRef.current.places) {
      if (dataRef.current.statsById[p.id]?.freshness !== "today") continue;
      if (map.project([p.lng, p.lat]).x > limit) hidden.push(p.id);
    }
    map.setFilter("places-label", [
      "all",
      TODAY_ONLY,
      ["!", ["in", ["get", "id"], ["literal", hidden]]],
    ] as unknown as maplibregl.FilterSpecification);
  }

  // 今日のピンにだけパルスを出す。数が変わったときだけ作り直す
  function syncPulses(map: maplibregl.Map) {
    const { places: ps, statsById: st } = dataRef.current;
    const want = new Set(
      ps.filter((p) => st[p.id]?.freshness === "today").map((p) => p.id)
    );
    for (const [id, marker] of pulsesRef.current) {
      if (!want.has(id)) {
        marker.remove();
        pulsesRef.current.delete(id);
      }
    }
    for (const p of ps) {
      if (!want.has(p.id) || pulsesRef.current.has(p.id)) continue;
      const el = document.createElement("span");
      el.className = "hig-pulse";
      el.style.pointerEvents = "none";
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      pulsesRef.current.set(p.id, marker);
    }
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    // MapLibreのワーカー（ピン描画の計算役）はバンドラー経由だとURLが壊れるため、
    // publicに置いた実ファイルを明示的に指定する（copy-map-workerスクリプトが配置）
    maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          gsi: {
            type: "raster",
            tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 18,
            attribution:
              '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
          },
        },
        layers: [{ id: "gsi", type: "raster", source: "gsi" }],
      },
      center: [139.55, 35.83],
      zoom: variant === "pc" ? 10 : 9.6,
      // glyphs を置かないので、文字はすべてブラウザ側で描かれる。
      // 日本語をこのフォントで出すために家族名を渡す（外部グリフサーバー不要）
      localIdeographFontFamily: getComputedStyle(container).fontFamily,
    });
    mapRef.current = map;

    // PCは地図コントロールを左上に置く（検索欄と縦に並べない）。
    // スマホはズームボタンを出さず、現在地だけ自前の◎ボタンから呼ぶ
    if (variant === "pc") {
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-left"
      );
    }
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
    });
    geolocateRef.current = geolocate;
    map.addControl(geolocate, variant === "pc" ? "top-left" : "bottom-left");
    geolocate.on("geolocate", (e) => {
      cb.current.onUserLocate(e.coords.latitude, e.coords.longitude);
    });
    // geolocate は追跡中の位置更新でも繰り返し発火するため、
    // ボタンを押した瞬間だけを知りたい側にはこちらを渡す
    geolocate.on("trackuserlocationstart", () => {
      cb.current.onLocateStart();
    });

    map.on("load", () => {
      map.addSource("places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("free-reports", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // 名前の無い場所の記録。登録スポットのピンより先に足して下に敷く。
      // 一段小さくし、ラベルも波紋もリングも付けない
      map.addLayer({
        id: "free-circle",
        type: "circle",
        source: "free-reports",
        layout: {
          "circle-sort-key": byFreshness(3, 2, 1, 0),
        },
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, byFreshness(4.5, 3.5, 2.5, 2.5),
            11, byFreshness(6.5, 5, 3.5, 3.5),
            14, byFreshness(9, 7, 5, 5),
          ],
          "circle-color": byFreshness(
            FRESHNESS_COLOR.today,
            FRESHNESS_COLOR.recent3d,
            FRESHNESS_COLOR.season,
            FRESHNESS_COLOR.season
          ),
          "circle-stroke-width": byFreshness(1.5, 1.5, 1.25, 1.25),
          "circle-stroke-color": byFreshness(
            "#ffffff",
            "#ffffff",
            C.muted,
            C.muted
          ),
        },
      });

      // hover / 選択のリング。ピンより先に足して下に敷く
      map.addLayer({
        id: "places-hover",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-radius": 17,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": C.ink,
          "circle-stroke-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "places-selected",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-radius": 20,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 4,
          "circle-stroke-color": C.ink,
        },
      });

      map.addLayer({
        id: "places-circle",
        type: "circle",
        source: "places",
        layout: {
          // 今日>3日内>今季>記録なし の順で手前に重ねる
          "circle-sort-key": byFreshness(3, 2, 1, 0),
        },
        paint: {
          // 半径はズーム連動＋鮮度で段階付け（確定値そのまま）
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, byFreshness(7.5, 5.5, 4, 2.5),
            11, byFreshness(11, 8.5, 6.5, 4.5),
            14, byFreshness(15, 11, 9, 6),
          ],
          "circle-color": byFreshness(
            FRESHNESS_COLOR.today,
            FRESHNESS_COLOR.recent3d,
            FRESHNESS_COLOR.season,
            FRESHNESS_COLOR.none
          ),
          "circle-opacity": byFreshness(1, 1, 1, 0.85),
          "circle-stroke-width": byFreshness(2.5, 2, 1.75, 1),
          "circle-stroke-color": byFreshness(
            "#ffffff",
            "#ffffff",
            C.muted,
            C.border2
          ),
        },
      });

      // 地点名。今日のピンにだけ出す。
      // 155件すべてに出すと地図が文字で埋まって逆に読めなくなる
      map.addLayer({
        id: "places-label",
        type: "symbol",
        source: "places",
        // ズームを寄せたときだけ出す。text-field の step 式だと
        // レイアウトの再評価が整数ズームでしか起きず、9.8の境目が効かない
        minzoom: variant === "pc" ? 9.8 : 10.4,
        filter: TODAY_ONLY,
        layout: {
          "text-field": ["get", "label"],
          "text-size": variant === "pc" ? 12 : 11,
          "text-variable-anchor": ["left", "right"],
          "text-radial-offset": 1.4,
          "text-justify": "auto",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-padding": 4,
          // 期待度の高い場所から先に置く。あふれた分が消える
          "symbol-sort-key": ["-", 0, ["get", "score"]],
        },
        paint: {
          "text-color": C.ink,
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.8,
          "text-halo-blur": 0.2,
        },
      });

      // 指でも押しやすいよう、タップ位置の周囲10pxまでをピンの判定にする
      map.on("click", (e) => {
        const pad = 10;
        const box: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - pad, e.point.y - pad],
          [e.point.x + pad, e.point.y + pad],
        ];
        const fs = map.queryRenderedFeatures(box, {
          layers: ["places-circle"],
        });
        if (fs.length > 0) {
          cb.current.onFreeTapClear();
          cb.current.onSelect(String(fs[0].properties?.id));
          return;
        }
        // 登録スポットに当たらなかったときだけ、名前の無い場所の点を調べる
        const free = map.queryRenderedFeatures(box, {
          layers: ["free-circle"],
        });
        if (free.length > 0) {
          const p = free[0].properties ?? {};
          cb.current.onFreeTap(
            {
              freshness: String(p.freshness) as Freshness,
              count: Number(p.count),
              latestAtMs: Number(p.latestAtMs),
            },
            { x: e.point.x, y: e.point.y }
          );
          // ここで onSelect(null) を呼ぶと、吹き出しを出した瞬間に選択が外れる
          return;
        }
        cb.current.onFreeTapClear();
        cb.current.onSelect(null);
      });
      // 地図が動いたら吹き出しは消す（点の上に貼り付いていないため）
      map.on("move", () => cb.current.onFreeTapClear());
      map.on("mousemove", "places-circle", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (f && dataRef.current.variant === "pc") {
          cb.current.onHover(String(f.properties?.id), {
            x: e.point.x,
            y: e.point.y,
          });
        }
      });
      map.on("mouseleave", "places-circle", () => {
        map.getCanvas().style.cursor = "";
        cb.current.onHover(null, null);
      });
      map.on("moveend", () => applyLabelInset(map));

      readyRef.current = true;
      (map.getSource("places") as maplibregl.GeoJSONSource).setData(
        toGeoJson(dataRef.current.places, dataRef.current.statsById)
      );
      // 地図はPC⇔スマホの幅切り替えで作り直されるので、ここでも入れ直す。
      // 落とすと、幅をまたいだ瞬間に名前の無い場所の点だけ消える
      (map.getSource("free-reports") as maplibregl.GeoJSONSource).setData(
        freeToGeoJson(dataRef.current.freeReports)
      );
      syncPulses(map);
      applyLabelInset(map);
      syncSelected(map);
    });

    return () => {
      for (const marker of pulsesRef.current.values()) marker.remove();
      pulsesRef.current.clear();
      map.remove();
      mapRef.current = null;
      geolocateRef.current = null;
      readyRef.current = false;
    };
    // 初期化は1回だけ。データ更新は下のuseEffectで行う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  function syncSelected(map: maplibregl.Map) {
    const id = dataRef.current.selectedId;
    map.setFilter("places-selected", ["==", ["get", "id"], id ?? "__none__"]);
    if (!id) return;
    const p = dataRef.current.places.find((x) => x.id === id);
    if (!p) return;
    map.flyTo({
      center: [p.lng, p.lat],
      zoom: Math.max(map.getZoom(), 11.5),
      offset: dataRef.current.variant === "pc" ? [-202, 0] : [0, -110],
      duration: 700,
    });
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("places") as maplibregl.GeoJSONSource).setData(
      toGeoJson(places, statsById)
    );
    syncPulses(map);
    applyLabelInset(map);
  }, [places, statsById]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("free-reports") as maplibregl.GeoJSONSource).setData(
      freeToGeoJson(freeReports)
    );
  }, [freeReports]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setFilter("places-hover", [
      "==",
      ["get", "id"],
      hoverId ?? "__none__",
    ]);
  }, [hoverId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncSelected(map);
  }, [selectedId, places, variant]);

  // 注意: MapLibreはこのdivに position:relative を強制するため、
  // absolute+inset ではなく width/height 100% で大きさを与える
  return (
    <div
      ref={containerRef}
      className={`hig-map h-full w-full ${variant === "sp" ? "hig-map-sp" : ""}`}
      style={{ "--hig-locate": C.locate } as React.CSSProperties}
    />
  );
}
