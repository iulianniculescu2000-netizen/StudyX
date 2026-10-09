export function clampChartData<T>(data: T[], maxPoints: number) {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0 || index === data.length - 1);
}

export function getChartDetailSettings(performanceLite: boolean) {
  return {
    isAnimationActive: !performanceLite,
    strokeWidth: performanceLite ? 1.75 : 2.4,
    dotRadius: performanceLite ? 2 : 4,
    radarOpacity: performanceLite ? 0.22 : 0.35,
    showGrid: !performanceLite,
    barRadius: performanceLite ? [3, 3, 0, 0] : [4, 4, 0, 0],
  };
}
