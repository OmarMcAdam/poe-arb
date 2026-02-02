import type { MainCurrencyId, NormalizedCurrencyDetails } from "./models";
import type { RouteKind } from "./edges";

export type ImpliedSeriesPoint = {
  ts: number;
  impliedOtherPerDiv: number;
};

export type VolatilityResult = {
  volatility7d: number | null;
  pointsUsed: number;
  series: ImpliedSeriesPoint[];
};

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function buildAlignedImpliedSeries(
  details: NormalizedCurrencyDetails,
  other: MainCurrencyId,
): ImpliedSeriesPoint[] {
  const div = details.pairs.divine;
  const oth = details.pairs[other];
  if (!div || !oth) return [];

  const divByTs = new Map<number, number>();
  for (const h of div.history) divByTs.set(h.ts, h.rate);

  const series: ImpliedSeriesPoint[] = [];
  for (const h of oth.history) {
    const divRate = divByTs.get(h.ts);
    if (!divRate || divRate <= 0) continue;
    if (!Number.isFinite(h.rate) || h.rate <= 0) continue;
    series.push({ ts: h.ts, impliedOtherPerDiv: h.rate / divRate });
  }
  series.sort((a, b) => a.ts - b.ts);
  return series;
}

export function computeVolatility7d(
  details: NormalizedCurrencyDetails,
  kind: RouteKind,
): VolatilityResult {
  const other: MainCurrencyId = kind === "exalted" ? "exalted" : "chaos";
  const seriesAll = buildAlignedImpliedSeries(details, other);
  const series = seriesAll.slice(Math.max(0, seriesAll.length - 7));
  if (series.length < 3) {
    return { volatility7d: null, pointsUsed: series.length, series };
  }

  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].impliedOtherPerDiv;
    const cur = series[i].impliedOtherPerDiv;
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0 || cur <= 0) continue;
    returns.push(Math.log(cur / prev));
  }

  const volatility7d = stdev(returns);
  return {
    volatility7d,
    pointsUsed: series.length,
    series,
  };
}
