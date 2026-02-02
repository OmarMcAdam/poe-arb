import { useEffect, useMemo, useState } from "react";
import type { PoeNinjaOverviewResponse } from "../lib/api/poeNinjaModels";
import { fetchCurrencyDetails, invalidateCurrencyDetails } from "../lib/api/poeNinja";
import { normalizeCurrencyDetails } from "../lib/arb/normalize";
import type { RouteKind } from "../lib/arb/edges";
import { computeScreeningEdges } from "../lib/arb/edges";
import { computeVolatility7d } from "../lib/arb/volatility";
import type { NormalizedCurrencyDetails } from "../lib/arb/models";
import { normalizeImageUrl } from "../lib/images";
import {
  appendQuoteSnapshot,
  getLatestQuoteSnapshot,
  loadStore,
  quotesKey,
  saveStore,
  type Quote,
  type QuoteCurrency,
} from "../lib/store/storage";
import { convertUsingQuote, quoteIsValid } from "../lib/arb/quotes";

import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Slider } from "./ui/slider";

export type DetailOpportunity = {
  league: string;
  detailsId: string;
  itemName: string;
  itemIconUrl: string | null;
  routeKind: RouteKind;
};

export function OpportunityDetail(props: {
  overview: PoeNinjaOverviewResponse;
  opp: DetailOpportunity;
  onBack: () => void;
}) {
  const { overview, opp, onBack } = props;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<NormalizedCurrencyDetails | null>(null);

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [modes, setModes] = useState<Record<string, "instant" | "listing">>({});
  const [savedCount, setSavedCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const [startDiv, setStartDiv] = useState(1);
  const [aggressiveness, setAggressiveness] = useState(0.25);

  const baseline = useMemo(
    () => ({
      exaltedPerDiv: overview.core.rates.exalted,
      chaosPerDiv: overview.core.rates.chaos,
    }),
    [overview],
  );

  const currency = useMemo(() => {
    const map = new Map<string, { id: string; name: string; iconUrl: string | null }>();
    for (const it of overview.core.items) {
      map.set(it.id, {
        id: it.id,
        name: it.name,
        iconUrl: normalizeImageUrl(it.image),
      });
    }
    const divine = map.get("divine") || { id: "divine", name: "Divine Orb", iconUrl: null };
    const other = map.get(opp.routeKind) || {
      id: opp.routeKind,
      name: opp.routeKind === "exalted" ? "Exalted Orb" : "Chaos Orb",
      iconUrl: null,
    };
    return { map, divine, other };
  }, [overview, opp.routeKind]);

  async function load(opts?: { force?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      if (opts?.force) invalidateCurrencyDetails(opp.league, opp.detailsId);
      const raw = await fetchCurrencyDetails(opp.league, opp.detailsId);
      setDetails(normalizeCurrencyDetails(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opp.league, opp.detailsId]);

  useEffect(() => {
    const store = loadStore();
    const key = quotesKey(opp.league, opp.detailsId, opp.routeKind);
    const snapshots = store.quotesByKey[key];
    setSavedCount(Array.isArray(snapshots) ? snapshots.length : 0);
    const latest = getLatestQuoteSnapshot(store, key);
    if (latest) {
      const rawQuotes = latest.quotes || {};
      const hasModeKeys = Object.keys(rawQuotes).some(
        (k) => k.endsWith(":instant") || k.endsWith(":listing"),
      );
      if (hasModeKeys) {
        setQuotes(rawQuotes);
      } else {
        // Back-compat: older snapshots stored quotes under "pay:receive".
        const migrated: Record<string, Quote> = {};
        for (const [k, v] of Object.entries(rawQuotes)) {
          const parts = k.split(":");
          if (parts.length === 2) migrated[`${k}:instant`] = v;
          else migrated[k] = v;
        }
        setQuotes(migrated);
      }
      setModes(latest.modes || {});
      setLastSavedAt(latest.createdAt);
    } else {
      setQuotes({});
      setModes({});
      setLastSavedAt(null);
    }
  }, [opp.league, opp.detailsId, opp.routeKind]);

  const edge = useMemo(() => {
    if (!details) return null;
    const all = computeScreeningEdges(details, baseline);
    return all.find((e) => e.kind === opp.routeKind) || null;
  }, [details, baseline, opp.routeKind]);

  const vol = useMemo(() => {
    if (!details) return null;
    return computeVolatility7d(details, opp.routeKind);
  }, [details, opp.routeKind]);

  const pDiv = details?.pairs.divine?.rate ?? null;
  const pEx = details?.pairs.exalted?.rate ?? null;
  const pCha = details?.pairs.chaos?.rate ?? null;

  const other: QuoteCurrency = opp.routeKind;

  type QuoteMode = "instant" | "listing";
  function baseKey(pay: QuoteCurrency, receive: QuoteCurrency) {
    return `${pay}:${receive}`;
  }
  function quoteKey(pay: QuoteCurrency, receive: QuoteCurrency, mode: QuoteMode) {
    return `${pay}:${receive}:${mode}`;
  }

  function getQuote(pay: QuoteCurrency, receive: QuoteCurrency, mode: QuoteMode): Quote {
    const k = quoteKey(pay, receive, mode);
    const q = quotes[k];
    return q || { pay, receive, payQty: 0, receiveQty: 0 };
  }

  function modeFor(pay: QuoteCurrency, receive: QuoteCurrency): QuoteMode {
    const k = baseKey(pay, receive);
    const v = modes[k];
    return v === "listing" ? "listing" : "instant";
  }

  function setModeFor(pay: QuoteCurrency, receive: QuoteCurrency, mode: QuoteMode) {
    const k = baseKey(pay, receive);
    setModes((prev) => ({ ...prev, [k]: mode }));
  }

  function updateQuoteField(
    pay: QuoteCurrency,
    receive: QuoteCurrency,
    mode: QuoteMode,
    field: "payQty" | "receiveQty" | "stock",
    value: number,
  ) {
    const k = quoteKey(pay, receive, mode);
    setQuotes((prev) => {
      const existing: Quote = prev[k] || { pay, receive, payQty: 0, receiveQty: 0 };
      return { ...prev, [k]: { ...existing, [field]: value } };
    });
  }

  const pnl = useMemo(() => {
    const q1Mode = modeFor("divine", "item");
    const q2Mode = modeFor("item", other);
    const q3Mode = modeFor(other, "divine");

    const qDivToItem = getQuote("divine", "item", q1Mode);
    const qItemToOther = getQuote("item", other, q2Mode);
    const qOtherToDiv = getQuote(other, "divine", q3Mode);

    const missing: string[] = [];
    if (!quoteIsValid(qDivToItem)) {
      missing.push(`Buy ${opp.itemName} with ${currency.divine.name} (${q1Mode})`);
    }
    if (!quoteIsValid(qItemToOther)) {
      missing.push(`Sell ${opp.itemName} for ${currency.other.name} (${q2Mode})`);
    }
    if (!quoteIsValid(qOtherToDiv)) {
      missing.push(`Convert ${currency.other.name} to ${currency.divine.name} (${q3Mode})`);
    }

    if (missing.length > 0) return { ok: false as const, missing };

    const warnings: string[] = [];

    const items = convertUsingQuote(startDiv, qDivToItem);
    if (items == null) return { ok: false as const, missing: ["Invalid step 1 quote"] };
    if (
      q1Mode === "instant" &&
      Number.isFinite(qDivToItem.stock) &&
      (qDivToItem.stock as number) > 0 &&
      items > (qDivToItem.stock as number)
    ) {
      const maxStart = (qDivToItem.stock as number) * (qDivToItem.payQty / qDivToItem.receiveQty);
      warnings.push(
        `Step 1 stock: need ${items.toFixed(3)} item, available ${(qDivToItem.stock as number).toFixed(3)}. Try listing or reduce Start <= ${maxStart.toFixed(3)} div.`,
      );
    }
    const otherAmt = convertUsingQuote(items, qItemToOther);
    if (otherAmt == null) return { ok: false as const, missing: ["Invalid step 2 quote"] };
    if (
      q2Mode === "instant" &&
      Number.isFinite(qItemToOther.stock) &&
      (qItemToOther.stock as number) > 0 &&
      otherAmt > (qItemToOther.stock as number)
    ) {
      // Max items you can sell at this ratio (based on receive-stock).
      const maxItems = (qItemToOther.stock as number) * (qItemToOther.payQty / qItemToOther.receiveQty);
      const itemsPerDiv = qDivToItem.receiveQty / qDivToItem.payQty;
      const maxStart = itemsPerDiv > 0 ? maxItems / itemsPerDiv : 0;
      warnings.push(
        `Step 2 stock: need ${otherAmt.toFixed(3)} ${currency.other.name}, available ${(qItemToOther.stock as number).toFixed(3)}. Try listing or reduce Start <= ${maxStart.toFixed(3)} div.`,
      );
    }
    const endDiv = convertUsingQuote(otherAmt, qOtherToDiv);
    if (endDiv == null) return { ok: false as const, missing: ["Invalid step 3 quote"] };
    if (
      q3Mode === "instant" &&
      Number.isFinite(qOtherToDiv.stock) &&
      (qOtherToDiv.stock as number) > 0 &&
      endDiv > (qOtherToDiv.stock as number)
    ) {
      const otherPerDiv =
        (qDivToItem.receiveQty / qDivToItem.payQty) * (qItemToOther.receiveQty / qItemToOther.payQty);
      const maxOther = (qOtherToDiv.stock as number) * (qOtherToDiv.payQty / qOtherToDiv.receiveQty);
      const maxStart = otherPerDiv > 0 ? maxOther / otherPerDiv : 0;
      warnings.push(
        `Step 3 stock: need ${endDiv.toFixed(3)} div, available ${(qOtherToDiv.stock as number).toFixed(3)}. Try listing or reduce Start <= ${maxStart.toFixed(3)} div.`,
      );
    }

    const profitDiv = endDiv - startDiv;
    const profitPct = startDiv > 0 ? (profitDiv / startDiv) * 100 : 0;
    if (!Number.isFinite(endDiv) || !Number.isFinite(profitDiv) || !Number.isFinite(profitPct)) {
      return { ok: false as const, missing: ["Computation produced invalid values"] };
    }
    return {
      ok: true as const,
      startDiv,
      endDiv,
      profitDiv,
      profitPct,
      warnings,
      modes: { q1Mode, q2Mode, q3Mode },
    };
  }, [quotes, modes, other, startDiv, opp.itemName, currency.divine.name, currency.other.name]);

  const pnlMissingPretty = useMemo(() => {
    if (pnl.ok) return null;
    return pnl.missing.join(" · ");
  }, [pnl]);

  const sellSoon = useMemo(() => {
    const ask = getQuote("item", other, "listing");
    const bid = getQuote(other, "item", "instant");
    if (!quoteIsValid(ask) || !quoteIsValid(bid)) {
      return {
        ok: false as const,
        reason: `Enter ${opp.itemName} → ${currency.other.name} (listing) and ${currency.other.name} → ${opp.itemName} (instant).`,
      };
    }

    const bestAsk = ask.receiveQty / ask.payQty; // other per item
    const bestBid = bid.payQty / bid.receiveQty; // other per item
    if (!Number.isFinite(bestAsk) || !Number.isFinite(bestBid) || bestAsk <= 0 || bestBid <= 0) {
      return { ok: false as const, reason: "Invalid bid/ask values." };
    }

    const low = Math.min(bestBid, bestAsk);
    const high = Math.max(bestBid, bestAsk);
    const a = Math.max(0, Math.min(1, aggressiveness));
    const suggested = low + (high - low) * a;

    const decimals = suggested >= 10 ? 2 : suggested >= 1 ? 3 : 4;
    const rounded = Number(suggested.toFixed(decimals));

    return {
      ok: true as const,
      bestBidOtherPerItem: bestBid,
      bestAskOtherPerItem: bestAsk,
      suggestedOtherPerItem: rounded,
      payQty: 1,
      receiveQty: rounded,
      receiveCurrency: other,
    };
  }, [quotes, other, aggressiveness, opp.itemName, currency.other.name]);

  function ratioHint(payQty: number | null, payLabel: string, receiveQty: number | null, receiveLabel: string) {
    if (!payQty || !receiveQty) return null;
    if (!Number.isFinite(payQty) || !Number.isFinite(receiveQty) || payQty <= 0 || receiveQty <= 0) return null;
    const fmt = (x: number) => {
      if (x >= 100) return x.toFixed(1);
      if (x >= 10) return x.toFixed(2);
      if (x >= 1) return x.toFixed(3);
      return x.toFixed(4);
    };
    return `poe.ninja mid: Pay ${fmt(payQty)} ${payLabel} / Receive ${fmt(receiveQty)} ${receiveLabel}`;
  }

  function RouteChain() {
    const div = currency.divine;
    const oth = currency.other;
    return (
      <div className="flex items-center gap-2 text-sm">
        {div.iconUrl ? <img src={div.iconUrl} alt="" width={18} height={18} /> : null}
        <span className="text-muted-foreground">{div.name}</span>
        <span className="text-muted-foreground">→</span>
        {opp.itemIconUrl ? <img src={opp.itemIconUrl} alt="" width={18} height={18} /> : null}
        <span className="text-muted-foreground">{opp.itemName}</span>
        <span className="text-muted-foreground">→</span>
        {oth.iconUrl ? <img src={oth.iconUrl} alt="" width={18} height={18} /> : null}
        <span className="text-muted-foreground">{oth.name}</span>
        <span className="text-muted-foreground">→</span>
        {div.iconUrl ? <img src={div.iconUrl} alt="" width={18} height={18} /> : null}
        <span className="text-muted-foreground">{div.name}</span>
      </div>
    );
  }

  function displayName(c: QuoteCurrency) {
    if (c === "item") return opp.itemName;
    return currency.map.get(c)?.name || c;
  }

  function renderQuoteRow(opts: {
    pay: QuoteCurrency;
    receive: QuoteCurrency;
    mode: QuoteMode;
    title: string;
    hint?: string;
    showStock?: boolean;
    stockLabel?: string;
  }) {
    const q = getQuote(opts.pay, opts.receive, opts.mode);
    const ok = quoteIsValid(q);
    const badgeVariant = ok ? "secondary" : "destructive";

    return (
      <div className="rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{opts.title}</div>
              <Badge variant={opts.mode === "instant" ? "secondary" : "outline"}>
                {opts.mode === "instant" ? "instant" : "listing"}
              </Badge>
            </div>
            {opts.hint ? <div className="text-xs text-muted-foreground">{opts.hint}</div> : null}
          </div>
          <Badge variant={badgeVariant}>{ok ? "ok" : "missing"}</Badge>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Pay</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={q.payQty}
                onChange={(e) =>
                  updateQuoteField(opts.pay, opts.receive, opts.mode, "payQty", Number(e.currentTarget.value))
                }
              />
              <span className="w-24 text-xs text-muted-foreground">
                {opts.pay === "item" ? "item" : currency.map.get(opts.pay)?.name || opts.pay}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Receive</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={q.receiveQty}
                onChange={(e) =>
                  updateQuoteField(opts.pay, opts.receive, opts.mode, "receiveQty", Number(e.currentTarget.value))
                }
              />
              <span className="w-24 text-xs text-muted-foreground">
                {opts.receive === "item" ? "item" : currency.map.get(opts.receive)?.name || opts.receive}
              </span>
            </div>
          </div>
        </div>

        {opts.showStock ? (
          <div className="mt-3 grid gap-2">
            <Label className="text-xs text-muted-foreground">
              Stock at this ratio (receive units)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                value={q.stock ?? 0}
                onChange={(e) =>
                  updateQuoteField(opts.pay, opts.receive, opts.mode, "stock", Number(e.currentTarget.value))
                }
              />
              <span className="w-24 text-xs text-muted-foreground">
                {opts.stockLabel || (opts.receive === "item" ? "item" : currency.map.get(opts.receive)?.name || opts.receive)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              From the in-game "Stock" column at the selected ratio.
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function saveSnapshot() {
    const store = loadStore();
    const key = quotesKey(opp.league, opp.detailsId, opp.routeKind);
    const snapshot = { createdAt: Date.now(), quotes, modes };
    const next = appendQuoteSnapshot(store, key, snapshot);
    saveStore(next);
    setSavedCount((prev) => prev + 1);
    setLastSavedAt(snapshot.createdAt);
  }

  const detailError = useMemo(() => {
    if (!error) return null;
    if (error.includes("http error: 429")) {
      return "poe.ninja rate limited this request (HTTP 429). Wait ~30-60s and try Reload.";
    }
    return error;
  }, [error]);

  const pnlTone = pnl.ok
    ? pnl.profitDiv > 0
      ? ("positive" as const)
      : pnl.profitDiv < 0
        ? ("negative" as const)
        : ("flat" as const)
    : ("missing" as const);

  return (
    <div className="mx-auto w-[min(1120px,92vw)] py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          {opp.itemIconUrl ? <img src={opp.itemIconUrl} alt="" width={28} height={28} /> : null}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{opp.itemName}</h2>
              <Badge variant="secondary">{opp.routeKind} route</Badge>
            </div>
            <div className="text-xs text-muted-foreground">{opp.detailsId}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={saveSnapshot}>
            Save snapshot
          </Button>
          <Button onClick={() => load({ force: true })} disabled={loading}>
            {loading ? "Loading..." : "Reload"}
          </Button>
        </div>
      </header>

      <div className="mt-3 text-xs text-muted-foreground">
        Saved snapshots: {savedCount}
        {lastSavedAt ? ` · latest: ${new Date(lastSavedAt).toLocaleString()}` : ""}
      </div>

      {detailError ? (
        <div className="mt-4">
          <Alert variant="destructive">
            <AlertTitle>Details failed to load</AlertTitle>
            <AlertDescription>{detailError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {!details ? null : (
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Snapshot (poe.ninja)</CardTitle>
                <CardDescription>Screening math uses these mid-ish rates.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">pDiv (Div per item)</span>
                    <span className="tabular-nums">{pDiv ?? "?"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">pEx (Ex per item)</span>
                    <span className="tabular-nums">{pEx ?? "?"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">pChaos (Chaos per item)</span>
                    <span className="tabular-nums">{pCha ?? "?"}</span>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Baseline</span>
                    <span className="tabular-nums">
                      {overview.core.rates.exalted} Ex / 1 Div · {overview.core.rates.chaos} Chaos / 1 Div
                    </span>
                  </div>
                  {edge ? (
                    <>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Implied</span>
                        <span className="tabular-nums">
                          {edge.impliedOtherPerDiv.toFixed(4)} {opp.routeKind} / 1 Div
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Edge</span>
                        <span className="tabular-nums">{(edge.edge * 100).toFixed(2)}%</span>
                      </div>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Last ~7 days (implied cross)</CardTitle>
                <CardDescription>
                  Volatility is stdev of daily log returns on the implied cross series.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {vol?.series.length ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Volatility: <span className="tabular-nums">{vol.volatility7d?.toFixed(4) ?? "?"}</span>
                    </div>
                    <div className="grid gap-1 rounded-md border bg-muted/40 p-3 text-xs">
                      {vol.series.map((p) => (
                        <div key={p.ts} className="flex items-center justify-between gap-4 tabular-nums">
                          <span className="text-muted-foreground">{new Date(p.ts).toLocaleDateString()}</span>
                          <span>{p.impliedOtherPerDiv.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Not enough aligned history to compute.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Confirm With In-Game Quotes</CardTitle>
                <CardDescription>
                  Enter what you actually see on trade. Use the exact listing format: Pay X / Receive Y.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Trade chain</div>
                    <RouteChain />
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="font-medium">What you should check</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      1) {currency.divine.name} → {opp.itemName} price (buy item). 2) {opp.itemName} → {currency.other.name} price (sell item). 3) {currency.other.name} → {currency.divine.name} price (convert back).
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="startDiv">Start</Label>
                      <Input
                        id="startDiv"
                        type="number"
                        min={0}
                        step={0.1}
                        value={startDiv}
                        onChange={(e) => setStartDiv(Number(e.currentTarget.value))}
                        className="w-28"
                      />
                      <span className="text-xs text-muted-foreground">divine</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {pnlTone === "positive" ? <Badge>profit</Badge> : null}
                      {pnlTone === "negative" ? <Badge variant="destructive">loss</Badge> : null}
                      {pnlTone === "flat" ? <Badge variant="secondary">flat</Badge> : null}
                      {pnlTone === "missing" ? <Badge variant="destructive">missing quotes</Badge> : null}
                    </div>
                  </div>

                  <div className="text-sm">
                    {pnl.ok ? (
                      <div className="tabular-nums">
                        End: <span className="font-medium">{pnl.endDiv.toFixed(4)}</span> div · Profit:{" "}
                        <span className={pnl.profitDiv >= 0 ? "text-foreground" : "text-destructive"}>
                          {pnl.profitDiv.toFixed(4)} div ({pnl.profitPct.toFixed(2)}%)
                        </span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Missing: {pnlMissingPretty ?? pnl.missing.join(" · ")}</div>
                    )}
                  </div>

                  {pnl.ok && pnl.warnings.length > 0 ? (
                    <Alert>
                      <AlertTitle>Stock check</AlertTitle>
                      <AlertDescription>
                        <div className="space-y-1">
                          {pnl.warnings.map((w) => (
                            <div key={w}>{w}</div>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="space-y-3">
                    {/* Step 1 */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">
                          Step 1: Check {displayName("divine")} → {displayName("item")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={modeFor("divine", "item") === "instant" ? "default" : "outline"}
                            onClick={() => setModeFor("divine", "item", "instant")}
                          >
                            Instant
                          </Button>
                          <Button
                            size="sm"
                            variant={modeFor("divine", "item") === "listing" ? "default" : "outline"}
                            onClick={() => setModeFor("divine", "item", "listing")}
                          >
                            Listing
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        In Currency Exchange: Have {displayName("divine")}, Want {displayName("item")}. "Available Trades" = instant. "Competing Trades" = what you post and wait.
                      </div>
                      <div className="grid gap-3">
                        {renderQuoteRow({
                          pay: "divine",
                          receive: "item",
                          mode: "instant",
                          title: `Available Trades (instant)` ,
                          hint:
                            ratioHint(pDiv, currency.divine.name, 1, "item") ||
                            `Expected around poe.ninja mid above.`,
                          showStock: true,
                          stockLabel: displayName("item"),
                        })}
                        {renderQuoteRow({
                          pay: "divine",
                          receive: "item",
                          mode: "listing",
                          title: `Competing Trades (your listing)` ,
                          hint: `Pick a ratio that will likely fill soon.`,
                        })}
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">
                          Step 2: Check {displayName("item")} → {displayName(other)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={modeFor("item", other) === "instant" ? "default" : "outline"}
                            onClick={() => setModeFor("item", other, "instant")}
                          >
                            Instant
                          </Button>
                          <Button
                            size="sm"
                            variant={modeFor("item", other) === "listing" ? "default" : "outline"}
                            onClick={() => setModeFor("item", other, "listing")}
                          >
                            Listing
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        In Currency Exchange: Have {displayName("item")}, Want {displayName(other)}.
                      </div>
                      <div className="grid gap-3">
                        {renderQuoteRow({
                          pay: "item",
                          receive: other,
                          mode: "instant",
                          title: `Available Trades (instant)` ,
                          hint:
                            ratioHint(1, "item", opp.routeKind === "exalted" ? pEx : pCha, currency.other.name) ||
                            `Expected around poe.ninja mid above.`,
                          showStock: true,
                          stockLabel: displayName(other),
                        })}
                        {renderQuoteRow({
                          pay: "item",
                          receive: other,
                          mode: "listing",
                          title: `Competing Trades (your listing)` ,
                          hint: `This is what you'll post if you don't need instant fill.`,
                        })}
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">
                          Step 3: Check {displayName(other)} → {displayName("divine")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={modeFor(other, "divine") === "instant" ? "default" : "outline"}
                            onClick={() => setModeFor(other, "divine", "instant")}
                          >
                            Instant
                          </Button>
                          <Button
                            size="sm"
                            variant={modeFor(other, "divine") === "listing" ? "default" : "outline"}
                            onClick={() => setModeFor(other, "divine", "listing")}
                          >
                            Listing
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        In Currency Exchange: Have {displayName(other)}, Want {displayName("divine")}. This is the "{currency.other.name} to {currency.divine.name}" price you mentioned.
                      </div>
                      <div className="grid gap-3">
                        {renderQuoteRow({
                          pay: other,
                          receive: "divine",
                          mode: "instant",
                          title: `Available Trades (instant)` ,
                          hint:
                            ratioHint(
                              opp.routeKind === "exalted" ? overview.core.rates.exalted : overview.core.rates.chaos,
                              currency.other.name,
                              1,
                              currency.divine.name,
                            ) || `Expected around baseline above.`,
                          showStock: true,
                          stockLabel: displayName("divine"),
                        })}
                        {renderQuoteRow({
                          pay: other,
                          receive: "divine",
                          mode: "listing",
                          title: `Competing Trades (your listing)` ,
                          hint: `If you post and wait, you'll usually get a better ratio than instant.`,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sell-Soon Listing</CardTitle>
                <CardDescription>
                  Optional: If you want to list the item for {other}, enter both sides (bid + ask).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-sm">Aggressiveness</Label>
                    <div className="tabular-nums text-xs text-muted-foreground">{aggressiveness.toFixed(2)}</div>
                  </div>
                  <Slider
                    value={[aggressiveness]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(v) => setAggressiveness(v[0] ?? 0)}
                  />

                  {sellSoon.ok ? (
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                      <div className="text-xs text-muted-foreground tabular-nums">
                        bid: {sellSoon.bestBidOtherPerItem.toFixed(4)} · ask: {sellSoon.bestAskOtherPerItem.toFixed(4)} ({other} per item)
                      </div>
                      <div className="mt-1 tabular-nums">
                        List: <span className="font-medium">Pay 1 item / Receive {sellSoon.receiveQty} {other}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">{sellSoon.reason}</div>
                  )}

                  <div className="space-y-3">
                    {renderQuoteRow({
                      pay: "item",
                      receive: other,
                      mode: "listing",
                      title: `${displayName("item")} → ${displayName(other)} (ask / your listing)`,
                      hint: "This is the price you list to sell quickly.",
                    })}
                    {renderQuoteRow({
                      pay: other,
                      receive: "item",
                      mode: "instant",
                      title: `${displayName(other)} → ${displayName("item")} (bid / available)`,
                      hint: "This is what you can sell into immediately.",
                      showStock: true,
                      stockLabel: displayName("item"),
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
