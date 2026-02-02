export type MainCurrencyId = "divine" | "exalted" | "chaos";

export type PairHistoryPoint = {
  ts: number;
  rate: number;
  volumePrimaryValue: number;
};

export type PairQuote = {
  id: MainCurrencyId;
  rate: number;
  volumePrimaryValue: number;
  history: PairHistoryPoint[];
};

export type NormalizedCurrencyDetails = {
  detailsId: string;
  name: string;
  image: string | null;
  pairs: Partial<Record<MainCurrencyId, PairQuote>>;
};
