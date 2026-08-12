// ヒグラシの記録を集計する期間の開始日。
// 1〜5月は、前年の夏を「今シーズン」として見せない。
export function seasonStart(now: Date): Date {
  return new Date(now.getFullYear(), 5, 1);
}
