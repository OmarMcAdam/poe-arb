import type { PoeNinjaDetailsResponse } from "../api/poeNinjaModels";
import { normalizeImageUrl } from "../images";
import type { MainCurrencyId, NormalizedCurrencyDetails, PairHistoryPoint, PairQuote } from "./models";

const MAIN: MainCurrencyId[] = ["divine", "exalted", "chaos"];

function parseHistory(history: Array<{ timestamp: string; rate: number; volumePrimaryValue: number }>):
  PairHistoryPoint[] {
  const points: PairHistoryPoint[] = [];
  for (const h of history) {
    const ts = Date.parse(h.timestamp);
    if (!Number.isFinite(ts)) continue;
    const rate = Number(h.rate);
    const volumePrimaryValue = Number(h.volumePrimaryValue);
    if (!Number.isFinite(rate) || !Number.isFinite(volumePrimaryValue)) continue;
    points.push({ ts, rate, volumePrimaryValue });
  }
  points.sort((a, b) => a.ts - b.ts);
  return points;
}

export function normalizeCurrencyDetails(d: PoeNinjaDetailsResponse): NormalizedCurrencyDetails {
  const pairs: Partial<Record<MainCurrencyId, PairQuote>> = {};
  for (const p of d.pairs || []) {
    if (!MAIN.includes(p.id as MainCurrencyId)) continue;
    const id = p.id as MainCurrencyId;
    const rate = Number(p.rate);
    const volumePrimaryValue = Number(p.volumePrimaryValue);
    if (!Number.isFinite(rate) || !Number.isFinite(volumePrimaryValue)) continue;

    pairs[id] = {
      id,
      rate,
      volumePrimaryValue,
      history: parseHistory(Array.isArray(p.history) ? p.history : []),
    };
  }

  return {
    detailsId: d.item.detailsId,
    name: d.item.name,
    image: normalizeImageUrl(d.item.image),
    pairs,
  };
}
