"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Place } from "@/lib/types";
import type { Freshness } from "@/lib/score";
import { FRESHNESS_COLOR } from "@/lib/score";

type Props = {
  places: Place[];
  freshnessById: Record<string, Freshness>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUserLocate: (lat: number, lng: number) => void;
};

function toGeoJson(
  places: Place[],
  freshnessById: Record<string, Freshness>
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        color: FRESHNESS_COLOR[freshnessById[p.id] ?? "none"],
      },
    })),
  };
}

export default function MapView({
  places,
  freshnessById,
  selectedId,
  onSelect,
  onUserLocate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  // クリックハンドラから最新のコールバックを呼ぶための参照
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onUserLocateRef = useRef(onUserLocate);
  onUserLocateRef.current = onUserLocate;
  // 地図の読み込み完了とデータ取得の順番がどちらでも正しく描けるよう、
  // 常に最新のデータを参照で持っておく
  const dataRef = useRef({ places, freshnessById });
  dataRef.current = { places, freshnessById };

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
      center: [139.55, 35.86], // 埼玉南部あたり
      zoom: 9.3,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
    });
    map.addControl(geolocate);
    geolocate.on("geolocate", (e) => {
      onUserLocateRef.current(e.coords.latitude, e.coords.longitude);
    });

    map.on("load", () => {
      map.addSource("places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "places-circle",
        type: "circle",
        source: "places",
        paint: {
          // スポットが密集する縮尺では小さく、寄ったら大きく
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, 5,
            11, 9,
            14, 12,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#334155",
        },
      });
      map.addLayer({
        id: "places-selected",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-radius": 14,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#0ea5e9",
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
        onSelectRef.current(fs.length > 0 ? String(fs[0].properties?.id) : null);
      });
      map.on("mouseenter", "places-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "places-circle", () => {
        map.getCanvas().style.cursor = "";
      });
      readyRef.current = true;
      (map.getSource("places") as maplibregl.GeoJSONSource).setData(
        toGeoJson(dataRef.current.places, dataRef.current.freshnessById)
      );
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // 初期化は1回だけ。データ更新は下のuseEffectで行う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("places") as maplibregl.GeoJSONSource).setData(
      toGeoJson(places, freshnessById)
    );
  }, [places, freshnessById]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setFilter("places-selected", [
      "==",
      ["get", "id"],
      selectedId ?? "__none__",
    ]);
    if (selectedId) {
      const p = places.find((x) => x.id === selectedId);
      if (p) {
        map.flyTo({
          center: [p.lng, p.lat],
          zoom: Math.max(map.getZoom(), 11.5),
          duration: 600,
        });
      }
    }
  }, [selectedId, places]);

  // 注意: MapLibreはこのdivに position:relative を強制するため、
  // absolute+inset ではなく width/height 100% で大きさを与える
  return <div ref={containerRef} className="h-full w-full" />;
}
