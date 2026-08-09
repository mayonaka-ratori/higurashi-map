// ひぐらしのなくところに — 再設計v2の共有ロジック。
// higurashi-core.js（期待度・鮮度・サンプルデータ）はそのまま使い、
// ここには今回の見直しで足したものだけを置く。
//
// 足したのは2つ。
//  ① 期待度の単位を ★ から ♪ へ。★はレビュー点数に見える。
//  ② 聞きどきを「日の入り前後」だけでなく朝夕2回に。ヒグラシは夜明け前後にもよく鳴き、
//     曇りの日や暗い林では日中も鳴く。夕方だけを指すと、朝に行ける人を取りこぼす。

import { sunsetDate, hm } from "./higurashi-core.js";

const MIN = 60000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ── 期待度の表示 ────────────────────────────────
// 点いた分だけ出す。空の記号を並べない（それをやるとレビュー点数に見える）。
export const notesText = (n) => (n > 0 ? "♪".repeat(n) : "");
export const notesLabel = (n) =>
  n >= 5 ? "よく鳴いている" : n >= 4 ? "鳴いている" : n >= 3 ? "たぶん鳴く" : n >= 2 ? "望みはある" : n >= 1 ? "わずか" : "記録なし";

// ── 聞きどき（朝と夕の2回） ──────────────────────
// 日の入りの計算は higurashi-core.js のものを使い、夜明けは同じ式の対称側から出す。
export function sunriseDate(now, lat, lng) {
  const ss = sunsetDate(now, lat, lng);
  if (!ss) return null;
  const noon = startOfDay(now);
  noon.setMinutes(Math.round((12 - (lng - 135) / 15) * 60));
  const d = new Date(+noon - (ss - noon));
  return d;
}

const WIN = 30 * MIN; // 前後30分

export function listeningWindows(now, lat, lng) {
  const dawn = sunriseDate(now, lat, lng);
  const dusk = sunsetDate(now, lat, lng);
  if (!dawn || !dusk) return null;
  const wins = [
    { kind: "dawn", label: "夜明け", center: dawn, from: new Date(+dawn - WIN), to: new Date(+dawn + WIN) },
    { kind: "dusk", label: "日の入り", center: dusk, from: new Date(+dusk - WIN), to: new Date(+dusk + WIN) },
  ];
  const active = wins.find((w) => now >= w.from && now <= w.to) || null;
  const next = wins.find((w) => now < w.from) || null;
  const mins = (a, b) => Math.max(1, Math.round((b - a) / MIN));

  let state, remain, tone;
  if (active) {
    state = active.kind === "dawn" ? "いま聞きどき・朝" : "いま聞きどき・夕";
    remain = hm(active.to) + "まで あと" + mins(now, active.to) + "分";
    tone = "now";
  } else if (next) {
    state = next.kind === "dawn" ? "朝の聞きどきはこれから" : "夕の聞きどきはこれから";
    const m = mins(now, next.from);
    remain = m >= 90 ? hm(next.from) + "から" : "あと" + m + "分ではじまる";
    tone = "soon";
  } else {
    state = "今日の聞きどきは過ぎた";
    const tomorrow = sunriseDate(new Date(+now + 86400000), lat, lng);
    remain = tomorrow ? "次は明日の夜明け " + hm(tomorrow) + "ごろ" : "次は明日の夜明け";
    tone = "past";
  }
  // 谷間の時間帯に「今は無理」と言い切らないための一行。実際、曇天や暗い林では日中も鳴く。
  const daytime = !active && now > wins[0].to && now < wins[1].from;
  const note = daytime
    ? "曇りの日や暗い林なら、日中でも鳴きます"
    : "鳴くのは夜明けと日の入りの前後30分が中心です";
  return { dawn, dusk, wins, active, next, state, remain, tone, note, daytime };
}

// 1日を0〜1で表した位置（時間帯グラフ用）
export const dayPos = (d) => (d.getHours() * 60 + d.getMinutes()) / 1440;

// 時間帯。画面の色温度を変える案で使う。
export function phaseOf(now, w) {
  if (!w) return "day";
  if (now < w.wins[0].from) return "night";
  if (now <= w.wins[0].to) return "dawn";
  if (now < w.wins[1].from) return "day";
  if (now <= w.wins[1].to) return "dusk";
  return "night";
}

// 「狭山湖（トトロの森・狭山丘陵）」→「狭山湖」。地図に出す呼び名。
export const shortName = (name) => name.split(/[（(・]/)[0] || name;

// ── 鮮度ドット ────────────────────────────────
const DOT = {
  today: { bg: "#059669", ring: "2px solid #fff", halo: "0 0 0 1px rgba(5,150,105,.4)", size: 14 },
  recent3d: { bg: "#f59e0b", ring: "2px solid #fff", halo: "0 0 0 1px rgba(245,158,11,.45)", size: 12 },
  season: { bg: "#fff", ring: "1.75px solid #64748b", halo: "none", size: 10 },
  none: { bg: "#94a3b8", ring: "0", halo: "none", size: 10 },
};
export function dotStyle(fresh, size) {
  const d = DOT[fresh] || DOT.none;
  const s = size || d.size;
  return `flex:none;display:block;width:${s}px;height:${s}px;border-radius:9999px;background:${d.bg};border:${d.ring};box-shadow:${d.halo}`;
}

// ── 地図 ─────────────────────────────────────
// ピンは「色・大きさ・縁取り」を鮮度で同時に変える。今日を最大・最も濃く、
// 記録なしを最小・薄くして、地図を開いた瞬間の視線を今日へ寄せる。
const PIN = {
  today: { r: [7.5, 11, 15], fillColor: "#059669", color: "#ffffff", weight: 2.5, fillOpacity: 1 },
  recent3d: { r: [5.5, 8.5, 11], fillColor: "#f59e0b", color: "#ffffff", weight: 2, fillOpacity: 1 },
  season: { r: [4, 6.5, 9], fillColor: "#ffffff", color: "#64748b", weight: 1.75, fillOpacity: 1 },
  none: { r: [2.5, 4.5, 6], fillColor: "#94a3b8", color: "#e2e8f0", weight: 1, fillOpacity: 0.85 },
};
const ORDER = ["none", "season", "recent3d", "today"];

export function mountMap(el, opts) {
  const L = window.L;
  const o = Object.assign(
    { center: [35.78, 139.56], zoom: 10, labelZoom: 9.8, pulse: true, tile: "pale", onSelect() {}, onHover() {}, onMove() {} },
    opts
  );
  const map = L.map(el, { zoomControl: false, zoomSnap: 0.1, fadeAnimation: false }).setView(o.center, o.zoom);
  L.tileLayer(`https://cyberjapandata.gsi.go.jp/xyz/${o.tile}/{z}/{x}/{y}.png`, {
    maxZoom: 18,
    crossOrigin: "anonymous",
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
  }).addTo(map);
  L.control.zoom({ position: o.zoomPosition || "topright" }).addTo(map);

  map.createPane("pulse");
  map.getPane("pulse").style.zIndex = 350;
  map.getPane("pulse").style.pointerEvents = "none";

  const pins = {};
  const pulses = {};
  let places = [];
  let statsOf = () => null;
  let selectedId = null;
  let hoverId = null;

  const hovRing = L.circleMarker([0, 0], { radius: 17, color: "#0f172a", weight: 3, opacity: 0, fill: false, interactive: false }).addTo(map);
  const selRing = L.circleMarker([0, 0], { radius: 20, color: "#0f172a", weight: 4, opacity: 0, fill: false, interactive: false }).addTo(map);

  function style(fresh) {
    const z = Math.max(8, Math.min(14, map.getZoom()));
    const p = PIN[fresh] || PIN.none;
    const radius = z <= 11 ? p.r[0] + (p.r[1] - p.r[0]) * ((z - 8) / 3) : p.r[1] + (p.r[2] - p.r[1]) * ((z - 11) / 3);
    return { radius, opacity: 1, fillColor: p.fillColor, color: p.color, weight: p.weight, fillOpacity: p.fillOpacity };
  }

  // ズームを寄せたときだけ、今日のピンに地点名を出す。
  // 155件すべてに出すと地図が文字で埋まって、逆に何も読めなくなる。
  function syncLabels() {
    const z = map.getZoom();
    const off = style("today").radius + 6;
    const size = map.getSize();
    const shown = [];
    const cand = places
      .filter((p) => pins[p.id] && z >= o.labelZoom && statsOf(p.id) && statsOf(p.id).freshness === "today")
      .sort((a, b) => statsOf(b.id).score - statsOf(a.id).score);
    for (const p of places) {
      const m = pins[p.id];
      if (!m) continue;
      if (cand.indexOf(p) === -1) {
        if (m.getTooltip()) m.unbindTooltip();
        continue;
      }
      const label = shortName(p.name);
      const pt = map.latLngToContainerPoint([p.lat, p.lng]);
      const w = label.length * 12 + 16;
      const h = 22;
      const left = pt.x + off + w > size.x - 8;
      const x = left ? pt.x - off - w : pt.x + off;
      const box = { x1: x, y1: pt.y - h / 2, x2: x + w, y2: pt.y + h / 2 };
      const hit =
        box.x1 < (o.labelInset || 4) ||
        box.x2 > size.x - (o.labelInsetRight || 4) ||
        shown.some((b) => box.x1 < b.x2 + 4 && box.x2 + 4 > b.x1 && box.y1 < b.y2 + 2 && box.y2 + 2 > b.y1);
      if (hit) {
        if (m.getTooltip()) m.unbindTooltip();
        continue;
      }
      shown.push(box);
      const dir = left ? "left" : "right";
      const tip = m.getTooltip();
      if (tip && tip.options.direction === dir && tip.getContent() === label) continue;
      if (tip) m.unbindTooltip();
      m.bindTooltip(label, { permanent: true, direction: dir, offset: [left ? -off : off, 0], className: "hig-label", opacity: 1 });
    }
  }

  function paintRings() {
    const byId = {};
    for (const p of places) byId[p.id] = p;
    const s = selectedId ? byId[selectedId] : null;
    if (s) {
      selRing.setLatLng([s.lat, s.lng]);
      selRing.setStyle({ opacity: 1 });
      selRing.bringToFront();
    } else selRing.setStyle({ opacity: 0 });
    const h = hoverId ? byId[hoverId] : null;
    if (h) {
      hovRing.setLatLng([h.lat, h.lng]);
      hovRing.setStyle({ opacity: 0.5 });
      hovRing.bringToFront();
    } else hovRing.setStyle({ opacity: 0 });
  }

  function draw() {
    const ordered = [...places].sort(
      (a, b) => ORDER.indexOf((statsOf(a.id) || {}).freshness || "none") - ORDER.indexOf((statsOf(b.id) || {}).freshness || "none")
    );
    for (const p of ordered) {
      const st = statsOf(p.id);
      const fresh = (st && st.freshness) || "none";
      const s = style(fresh);
      let m = pins[p.id];
      if (!m) {
        m = L.circleMarker([p.lat, p.lng], s).addTo(map);
        m.on("click", (e) => {
          L.DomEvent.stop(e);
          o.onSelect(p.id);
        });
        m.on("mouseover", () => o.onHover(p.id, map.latLngToContainerPoint([p.lat, p.lng])));
        m.on("mouseout", () => o.onHover(null, null));
        pins[p.id] = m;
      } else {
        m.setStyle(s);
        m.setRadius(s.radius);
        m.bringToFront();
      }
      if (fresh !== "today" && pulses[p.id]) {
        map.removeLayer(pulses[p.id]);
        delete pulses[p.id];
      }
      if (fresh === "today" && o.pulse && !pulses[p.id]) {
        pulses[p.id] = L.marker([p.lat, p.lng], {
          pane: "pulse",
          interactive: false,
          icon: L.divIcon({
            className: "",
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            html: '<span style="display:block;width:36px;height:36px;border-radius:9999px;background:#059669;animation:higPulse 2.4s ease-out infinite"></span>',
          }),
        }).addTo(map);
      }
    }
    paintRings();
    syncLabels();
  }

  map.on("click", () => o.onSelect(null));
  map.on("zoomend", () => {
    for (const id in pins) pins[id].setRadius(style((statsOf(id) || {}).freshness || "none").radius);
    syncLabels();
  });
  map.on("moveend", () => {
    syncLabels();
    o.onMove(map.getBounds());
  });

  let meMarker = null;

  return {
    map,
    // 画面を切り替えたときに地図・ピン・イベントをまとめて捨てる。
    // これをやらないと、155個のピンと zoomend/moveend のハンドラが残り続けて主スレッドが詰まる。
    destroy() {
      map.off();
      map.remove();
    },
    setData(nextPlaces, nextStatsOf) {
      places = nextPlaces;
      statsOf = nextStatsOf;
      draw();
    },
    setSelected(id) {
      selectedId = id;
      paintRings();
    },
    setHover(id) {
      hoverId = id;
      paintRings();
    },
    // 選んだ地点がパネルの裏に隠れないよう、中心をパネル幅の半分だけずらす
    focus(place, offsetX, offsetY) {
      const z = Math.max(map.getZoom(), 11.5);
      const pt = map.project([place.lat, place.lng], z).subtract([offsetX || 0, offsetY || 0]);
      map.flyTo(map.unproject(pt, z), z, { duration: 0.7 });
    },
    locate(pos) {
      if (!meMarker) {
        meMarker = L.marker([pos.lat, pos.lng], {
          interactive: false,
          icon: L.divIcon({
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html:
              '<span style="display:block;width:22px;height:22px;border-radius:9999px;background:rgba(14,165,233,.22)">' +
              '<span style="display:block;margin:5px;width:12px;height:12px;border-radius:9999px;background:#0ea5e9;border:2px solid #fff;box-shadow:0 1px 3px rgba(15,23,42,.4)"></span></span>',
          }),
        }).addTo(map);
      }
      map.flyTo([pos.lat, pos.lng], 11.4, { duration: 0.9 });
    },
    addControl(title, glyph, onClick, position) {
      const C = L.Control.extend({
        options: { position: position || "topright" },
        onAdd() {
          const d = L.DomUtil.create("div", "leaflet-bar");
          const a = L.DomUtil.create("a", "", d);
          a.href = "#";
          a.title = title;
          a.style.cssText = "font-size:17px;line-height:30px;text-align:center;color:#334155";
          a.textContent = glyph;
          L.DomEvent.on(a, "click", (e) => {
            L.DomEvent.stop(e);
            onClick();
          });
          return d;
        },
      });
      map.addControl(new C());
    },
  };
}
