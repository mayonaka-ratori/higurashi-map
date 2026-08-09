"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Place } from "@/lib/types";
import type { PlaceStats } from "@/lib/score";
import { FRESHNESS_COLOR } from "@/lib/score";
import { C, FONT_STACK, shortName } from "@/lib/design";

export type MapHandle = {
  // スマホの◎ボタンから現在地取得を起こす（見た目は自前のボタン）
  locate: () => void;
};

type Props = {
  places: Place[];
  statsById: Record<string, PlaceStats>;
  selectedId: string | null;
  hoverId: string | null;
  variant: "pc" | "sp";
  onSelect: (id: string | null) => void;
  onHover: (id: string | null, point: { x: number; y: number } | null) => void;
  onUserLocate: (lat: number, lng: number) => void;
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
  selectedId,
  hoverId,
  variant,
  onSelect,
  onHover,
  onUserLocate,
  ref,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null);
  const readyRef = useRef(false);
  // 今日のピンに出しているパルス（DOMマーカー）。地点IDで引く
  const pulsesRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // イベントハンドラから常に最新のコールバックとデータを見るための参照
  const cb = useRef({ onSelect, onHover, onUserLocate });
  cb.current = { onSelect, onHover, onUserLocate };
  const dataRef = useRef({ places, statsById, variant });
  dataRef.current = { places, statsById, variant };

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
    if (!containerRef.current || mapRef.current) return;
    // MapLibreのワーカー（ピン描画の計算役）はバンドラー経由だとURLが壊れるため、
    // publicに置いた実ファイルを明示的に指定する（copy-map-workerスクリプトが配置）
    maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container: containerRef.current,
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
      localIdeographFontFamily: FONT_STACK,
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

    map.on("load", () => {
      map.addSource("places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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
        const fs = map.queryRenderedFeatures(
          [
            [e.point.x - pad, e.point.y - pad],
            [e.point.x + pad, e.point.y + pad],
          ],
          { layers: ["places-circle"] }
        );
        cb.current.onSelect(fs.length > 0 ? String(fs[0].properties?.id) : null);
      });
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
      syncPulses(map);
      applyLabelInset(map);
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
    map.setFilter("places-hover", [
      "==",
      ["get", "id"],
      hoverId ?? "__none__",
    ]);
  }, [hoverId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setFilter("places-selected", [
      "==",
      ["get", "id"],
      selectedId ?? "__none__",
    ]);
    if (!selectedId) return;
    const p = places.find((x) => x.id === selectedId);
    if (!p) return;
    // 選んだ地点がパネル・シートの裏に隠れないよう、中心をずらす
    map.flyTo({
      center: [p.lng, p.lat],
      zoom: Math.max(map.getZoom(), 11.5),
      offset: variant === "pc" ? [-202, 0] : [0, -110],
      duration: 700,
    });
  }, [selectedId, places, variant]);

  // 注意: MapLibreはこのdivに position:relative を強制するため、
  // absolute+inset ではなく width/height 100% で大きさを与える
  return (
    <div
      ref={containerRef}
      className={`h-full w-full ${variant === "sp" ? "hig-map-sp" : ""}`}
    />
  );
}
