export type PoeNinjaEconomyLeague = {
  name: string;
  url: string;
  displayName?: string;
  hardcore?: boolean;
  indexed?: boolean;
};

export type PoeNinjaIndexState = {
  economyLeagues: PoeNinjaEconomyLeague[];
  oldEconomyLeagues?: PoeNinjaEconomyLeague[];
  snapshotVersions?: unknown;
  buildLeagues?: unknown;
  oldBuildLeagues?: unknown;
};

export type PoeNinjaExchangeSearchItem = {
  name: string;
  icon: string;
};

export type PoeNinjaExchangeSearchResponse = {
  items: {
    Currency?: PoeNinjaExchangeSearchItem[];
    [key: string]: unknown;
  };
};

export type PoeNinjaOverviewItem = {
  id: string;
  name: string;
  image?: string;
  category?: string;
  detailsId: string;
};

export type PoeNinjaOverviewCoreRates = {
  exalted: number;
  chaos: number;
};

export type PoeNinjaOverviewResponse = {
  core: {
    items: PoeNinjaOverviewItem[];
    rates: PoeNinjaOverviewCoreRates;
    primary?: unknown;
    secondary?: unknown;
  };
  items: PoeNinjaOverviewItem[];
  lines?: unknown;
};

export type PoeNinjaPairHistoryPoint = {
  timestamp: string;
  rate: number;
  volumePrimaryValue: number;
};

export type PoeNinjaDetailsPair = {
  id: string;
  rate: number;
  volumePrimaryValue: number;
  history: PoeNinjaPairHistoryPoint[];
};

export type PoeNinjaDetailsResponse = {
  item: PoeNinjaOverviewItem;
  pairs: PoeNinjaDetailsPair[];
  core?: unknown;
};
