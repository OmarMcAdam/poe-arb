import type { MainCurrencyId, NormalizedCurrencyDetails } from "./models";

export type RouteKind = "exalted" | "chaos";

export type BaselineRates = {
  exaltedPerDiv: number;
  chaosPerDiv: number;
};

export type ScreeningEdge = {
  kind: RouteKind;
  pDiv: number;
  pOther: number;
  impliedOtherPerDiv: number;
  baselineOtherPerDiv: number;
  edge: number;
};

function getRate(details: NormalizedCurrencyDetails, id: MainCurrencyId): number | null {
  const p = details.pairs[id];
  if (!p) return null;
  if (!Number.isFinite(p.rate) || p.rate <= 0) return null;
  return p.rate;
}

export function computeScreeningEdges(
  details: NormalizedCurrencyDetails,
  baseline: BaselineRates,
): ScreeningEdge[] {
  const pDiv = getRate(details, "divine");
  if (!pDiv) return [];

  const out: ScreeningEdge[] = [];

  const pEx = getRate(details, "exalted");
  if (pEx && Number.isFinite(baseline.exaltedPerDiv) && baseline.exaltedPerDiv > 0) {
    const impliedOtherPerDiv = pEx / pDiv;
    const baselineOtherPerDiv = baseline.exaltedPerDiv;
    const edge = impliedOtherPerDiv / baselineOtherPerDiv - 1;
    out.push({
      kind: "exalted",
      pDiv,
      pOther: pEx,
      impliedOtherPerDiv,
      baselineOtherPerDiv,
      edge,
    });
  }

  const pCha = getRate(details, "chaos");
  if (pCha && Number.isFinite(baseline.chaosPerDiv) && baseline.chaosPerDiv > 0) {
    const impliedOtherPerDiv = pCha / pDiv;
    const baselineOtherPerDiv = baseline.chaosPerDiv;
    const edge = impliedOtherPerDiv / baselineOtherPerDiv - 1;
    out.push({
      kind: "chaos",
      pDiv,
      pOther: pCha,
      impliedOtherPerDiv,
      baselineOtherPerDiv,
      edge,
    });
  }

  return out;
}
