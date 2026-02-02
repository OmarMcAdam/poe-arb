import type { PoeNinjaOverviewResponse } from "../api/poeNinjaModels";
import {
  fetchCurrencyDetails,
  fetchCurrencyOverview,
  fetchSearchCurrencyItems,
} from "../api/poeNinja";
import { normalizeCurrencyDetails } from "./normalize";
import { computeScreeningEdges } from "./edges";
import { computeVolatility7d } from "./volatility";
import { computeVolumeMin } from "./volume";

export type ScanRouteKind = "exalted" | "chaos";

export type Opportunity = {
  id: string;
  league: string;
  detailsId: string;
  itemName: string;
  itemIconUrl: string | null;

  routeKind: ScanRouteKind;
  edge: number;
  impliedOtherPerDiv: number;
  baselineOtherPerDiv: number;

  pDiv: number;
  pOther: number;

  volumeDivLeg: number | null;
  volumeOtherLeg: number | null;
  volumeMin: number | null;

  volatility7d: number | null;
  historyPointsUsed: number;
};

export type ScanResult = {
  overview: PoeNinjaOverviewResponse;
  opportunities: Opportunity[];
  errors: string[];
};

export type ScanProgress = {
  total: number;
  done: number;
  ok: number;
  failed: number;
};

function buildBaseline(overview: PoeNinjaOverviewResponse) {
  return {
    exaltedPerDiv: overview.core.rates.exalted,
    chaosPerDiv: overview.core.rates.chaos,
  };
}

export async function scanLeagueCurrencyOpportunities(
  league: string,
  opts?: { onProgress?: (p: ScanProgress) => void },
): Promise<ScanResult> {
  const [searchItems, overview] = await Promise.all([
    fetchSearchCurrencyItems(league),
    fetchCurrencyOverview(league),
  ]);

  const iconByName = new Map<string, string>();
  for (const it of searchItems) {
    if (it?.name && it?.icon) iconByName.set(it.name, it.icon);
  }

  const baseline = buildBaseline(overview);
  const detailsIds = Array.from(
    new Set(overview.items.map((i) => i.detailsId).filter(Boolean)),
  );

  let done = 0;
  let ok = 0;
  let failed = 0;
  const total = detailsIds.length;
  opts?.onProgress?.({ total, done, ok, failed });

  const errors: string[] = [];
  const opportunities: Opportunity[] = [];

  const results = await Promise.all(
    detailsIds.map(async (detailsId) => {
      try {
        const data = await fetchCurrencyDetails(league, detailsId);
        ok++;
        return { detailsId, ok: true as const, data };
      } catch (err) {
        failed++;
        return {
          detailsId,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        done++;
        opts?.onProgress?.({ total, done, ok, failed });
      }
    }),
  );

  for (const r of results) {
    if (!r.ok) {
      errors.push(`${r.detailsId}: ${r.error}`);
      continue;
    }

    const normalized = normalizeCurrencyDetails(r.data);
    const edges = computeScreeningEdges(normalized, baseline);
    if (edges.length === 0) continue;

    const itemIconUrl = iconByName.get(normalized.name) || normalized.image;

    for (const e of edges) {
      const vol = computeVolumeMin(normalized, e.kind);
      const v = computeVolatility7d(normalized, e.kind);
      opportunities.push({
        id: `${normalized.detailsId}:${e.kind}`,
        league,
        detailsId: normalized.detailsId,
        itemName: normalized.name,
        itemIconUrl,
        routeKind: e.kind,
        edge: e.edge,
        impliedOtherPerDiv: e.impliedOtherPerDiv,
        baselineOtherPerDiv: e.baselineOtherPerDiv,
        pDiv: e.pDiv,
        pOther: e.pOther,
        volumeDivLeg: vol.volumeDivLeg,
        volumeOtherLeg: vol.volumeOtherLeg,
        volumeMin: vol.volumeMin,
        volatility7d: v.volatility7d,
        historyPointsUsed: v.pointsUsed,
      });
    }
  }

  return { overview, opportunities, errors };
}
