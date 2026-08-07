// 日の入り時刻のざっくり計算（誤差±15分程度）。
// ヒグラシは日の入り前後と明け方によく鳴くので、目安として表示する。
export function sunsetText(now: Date, lat: number, lng: number): string {
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const decl =
    (-23.44 * Math.PI) / 180 *
    Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const latRad = (lat * Math.PI) / 180;
  const cosH = -Math.tan(latRad) * Math.tan(decl);
  if (cosH < -1 || cosH > 1) return "";
  const hourAngle = (Math.acos(cosH) * 180) / Math.PI / 15; // 時間
  // 日本標準時の基準経線は東経135度
  const solarNoonJst = 12 - (lng - 135) / 15;
  const sunset = solarNoonJst + hourAngle;
  const h = Math.floor(sunset);
  const m = Math.round((sunset - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
