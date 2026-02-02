export type QuoteCurrency = "divine" | "exalted" | "chaos" | "item";

export type Quote = {
  pay: QuoteCurrency;
  receive: QuoteCurrency;
  payQty: number;
  receiveQty: number;
  // Optional depth at this ratio, measured in receive units.
  stock?: number;
};

export type QuoteSnapshot = {
  createdAt: number;
  quotes: Record<string, Quote>;
  // For each leg (e.g. "divine:item"), which quote the user intends to use.
  modes?: Record<string, "instant" | "listing">;
};

export type SettingsV1 = {
  league: string;
  includeExalted: boolean;
  includeChaos: boolean;
  sortMode: "overall" | "profit" | "execution";

  minProfitPct: number;
  greatProfitPct: number;

  minVolumePerHour: number;
  targetVolumePerHour: number;

  targetVolatility: number;
  maxVolatility: number;
};

export type AppStoreV1 = {
  version: 1;
  quotesByKey: Record<string, QuoteSnapshot[]>;
  settings?: Partial<SettingsV1>;
  favorites?: string[];
  ignore?: string[];
};

const STORAGE_KEY = "poe2-arb:store";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadStore(): AppStoreV1 {
  const parsed = safeParse<AppStoreV1>(localStorage.getItem(STORAGE_KEY));
  if (parsed && parsed.version === 1) {
    return {
      version: 1,
      quotesByKey: parsed.quotesByKey || {},
      settings: parsed.settings || {},
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      ignore: Array.isArray(parsed.ignore) ? parsed.ignore : [],
    };
  }
  return { version: 1, quotesByKey: {}, settings: {}, favorites: [], ignore: [] };
}

export function saveStore(next: AppStoreV1) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function quotesKey(league: string, detailsId: string, routeKind: string) {
  return `${league}::${detailsId}::${routeKind}`;
}

export function getLatestQuoteSnapshot(
  store: AppStoreV1,
  key: string,
): QuoteSnapshot | null {
  const arr = store.quotesByKey[key];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[arr.length - 1] || null;
}

export function appendQuoteSnapshot(
  store: AppStoreV1,
  key: string,
  snapshot: QuoteSnapshot,
  maxSnapshots = 25,
): AppStoreV1 {
  const prev = Array.isArray(store.quotesByKey[key]) ? store.quotesByKey[key] : [];
  const nextArr = [...prev, snapshot].slice(Math.max(0, prev.length + 1 - maxSnapshots));
  return { ...store, quotesByKey: { ...store.quotesByKey, [key]: nextArr } };
}

export function upsertSettings(store: AppStoreV1, settings: Partial<SettingsV1>): AppStoreV1 {
  return { ...store, settings: { ...(store.settings || {}), ...settings } };
}

export function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
