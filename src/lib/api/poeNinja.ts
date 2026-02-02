import { httpGetJson } from "./tauriHttp";
import { clearCache, withCache } from "./cache";
import { createLimiter } from "../async/limit";
import type {
  PoeNinjaEconomyLeague,
  PoeNinjaDetailsResponse,
  PoeNinjaExchangeSearchItem,
  PoeNinjaExchangeSearchResponse,
  PoeNinjaIndexState,
  PoeNinjaOverviewResponse,
} from "./poeNinjaModels";

const INDEX_STATE_URL = "https://poe.ninja/poe2/api/data/index-state";
const EXCHANGE_SEARCH_URL =
  "https://poe.ninja/poe2/api/economy/exchange/current/search";
const EXCHANGE_OVERVIEW_URL =
  "https://poe.ninja/poe2/api/economy/exchange/current/overview";
const EXCHANGE_DETAILS_URL =
  "https://poe.ninja/poe2/api/economy/exchange/current/details";

const LEAGUES_TTL_MS = 10 * 60 * 1000;
const SEARCH_TTL_MS = 5 * 60 * 1000;
const OVERVIEW_TTL_MS = 45 * 1000;
const DETAILS_TTL_MS = 3 * 60 * 1000;

const limitDetails = createLimiter(2);

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export async function fetchIndexState(): Promise<PoeNinjaIndexState> {
  return withCache("poe:index-state", LEAGUES_TTL_MS, () =>
    httpGetJson<PoeNinjaIndexState>(INDEX_STATE_URL),
  );
}

export async function fetchEconomyLeagues(): Promise<PoeNinjaEconomyLeague[]> {
  const state = await fetchIndexState();
  return Array.isArray(state.economyLeagues) ? state.economyLeagues : [];
}

export async function fetchExchangeSearch(
  league: string,
): Promise<PoeNinjaExchangeSearchResponse> {
  const url = `${EXCHANGE_SEARCH_URL}?league=${encodeURIComponent(league)}`;
  return withCache(`poe:search:${league}`, SEARCH_TTL_MS, () =>
    httpGetJson<PoeNinjaExchangeSearchResponse>(url),
  );
}

export async function fetchSearchCurrencyItems(
  league: string,
): Promise<PoeNinjaExchangeSearchItem[]> {
  const search = await fetchExchangeSearch(league);
  const list = search.items?.Currency;
  return Array.isArray(list) ? list : [];
}

export async function fetchCurrencyOverview(
  league: string,
): Promise<PoeNinjaOverviewResponse> {
  const url = `${EXCHANGE_OVERVIEW_URL}?league=${encodeURIComponent(league)}&type=Currency`;
  return withCache(`poe:overview:Currency:${league}`, OVERVIEW_TTL_MS, () =>
    httpGetJson<PoeNinjaOverviewResponse>(url),
  );
}

export async function fetchCurrencyDetails(
  league: string,
  detailsId: string,
): Promise<PoeNinjaDetailsResponse> {
  const url = `${EXCHANGE_DETAILS_URL}?league=${encodeURIComponent(league)}&type=Currency&id=${encodeURIComponent(detailsId)}`;
  return withCache(
    `poe:details:Currency:${league}:${detailsId}`,
    DETAILS_TTL_MS,
    () =>
      limitDetails(async () => {
        // Keep scan behavior closer to a human client.
        await sleep(450 + Math.floor(Math.random() * 450));
        return httpGetJson<PoeNinjaDetailsResponse>(url, {
          retries: 4,
          baseDelayMs: 500,
        });
      }),
  );
}

export function invalidateLeagueCurrencyCaches(league: string) {
  clearCache(`poe:overview:Currency:${league}`);
  clearCache(`poe:search:${league}`);
  clearCache(`poe:details:Currency:${league}:`);
}

export function invalidateCurrencyDetails(league: string, detailsId: string) {
  clearCache(`poe:details:Currency:${league}:${detailsId}`);
}
