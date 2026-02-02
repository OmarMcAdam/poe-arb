export type RatingThresholds = {
  minProfitPct: number;
  greatProfitPct: number;

  minVolumePerHour: number;
  targetVolumePerHour: number;

  targetVolatility: number;
  maxVolatility: number;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp100(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

export function computeProfitRating(edgePct: number, t: RatingThresholds): number {
  const denom = t.greatProfitPct - t.minProfitPct;
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  const x = (edgePct - t.minProfitPct) / denom;
  return clamp100(clamp01(x) * 100);
}

export function computeExecutionRating(
  volumeMin: number | null,
  volatility7d: number | null,
  t: RatingThresholds,
): number {
  if (volumeMin == null || !Number.isFinite(volumeMin)) return 0;
  if (volumeMin < t.minVolumePerHour) return 0;
  if (volatility7d != null && Number.isFinite(volatility7d) && volatility7d > t.maxVolatility) {
    return 0;
  }

  const volDenom = t.targetVolumePerHour - t.minVolumePerHour;
  const volumeScore =
    volDenom > 0 ? clamp01((volumeMin - t.minVolumePerHour) / volDenom) : 0;

  let volatilityScore = 0.65;
  if (volatility7d != null && Number.isFinite(volatility7d)) {
    if (volatility7d <= t.targetVolatility) volatilityScore = 1;
    else if (volatility7d >= t.maxVolatility) volatilityScore = 0;
    else {
      const denom = t.maxVolatility - t.targetVolatility;
      volatilityScore = denom > 0 ? 1 - (volatility7d - t.targetVolatility) / denom : 0;
      volatilityScore = clamp01(volatilityScore);
    }
  }

  const score = Math.sqrt(volumeScore * volatilityScore);
  return clamp100(score * 100);
}

export function harmonicMean2(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  if (a <= 0 || b <= 0) return 0;
  return 2 / (1 / a + 1 / b);
}
