/** Timpul de studiu, același în tot aplicația: sub o oră în minute, apoi ore cu o zecimală (fără ".0"). */
export function formatStudyTime(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds || 0);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.round((seconds / 3600) * 10) / 10;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}
