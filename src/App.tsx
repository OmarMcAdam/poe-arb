import { useEffect, useMemo, useRef, useState } from "react";
import type { PoeNinjaEconomyLeague } from "./lib/api/poeNinjaModels";
import {
  fetchEconomyLeagues,
  invalidateLeagueCurrencyCaches,
} from "./lib/api/poeNinja";
import type { Opportunity, ScanProgress, ScanResult } from "./lib/arb/scan";
import { scanLeagueCurrencyOpportunities } from "./lib/arb/scan";
import { normalizeImageUrl } from "./lib/images";
import {
  computeExecutionRating,
  computeProfitRating,
  harmonicMean2,
  type RatingThresholds,
} from "./lib/arb/ratings";
import { OpportunityDetail, type DetailOpportunity } from "./components/OpportunityDetail";
import { loadStore, saveStore, toggleInList, upsertSettings, type SettingsV1 } from "./lib/store/storage";

import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Checkbox } from "./components/ui/checkbox";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Progress } from "./components/ui/progress";
import { Separator } from "./components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

function App() {
  const [leagues, setLeagues] = useState<PoeNinjaEconomyLeague[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [showScanErrors, setShowScanErrors] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  const [selected, setSelected] = useState<DetailOpportunity | null>(null);

  const scanSeq = useRef(0);

  const [includeExalted, setIncludeExalted] = useState(true);
  const [includeChaos, setIncludeChaos] = useState(true);

  const [sortMode, setSortMode] = useState<"overall" | "profit" | "execution">(
    "overall",
  );

  const [minProfitPct, setMinProfitPct] = useState(2);
  const [greatProfitPct, setGreatProfitPct] = useState(12);
  const [minVolumePerHour, setMinVolumePerHour] = useState(5);
  const [targetVolumePerHour, setTargetVolumePerHour] = useState(50);
  const [targetVolatility, setTargetVolatility] = useState(0.08);
  const [maxVolatility, setMaxVolatility] = useState(0.18);

  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [ignore, setIgnore] = useState<Set<string>>(() => new Set());

  const defaultLeagueName = "Fate of the Vaal";

  useEffect(() => {
    const store = loadStore();
    const s = store.settings || {};

    if (typeof s.league === "string") setSelectedLeague(s.league);
    if (typeof s.includeExalted === "boolean") setIncludeExalted(s.includeExalted);
    if (typeof s.includeChaos === "boolean") setIncludeChaos(s.includeChaos);
    if (s.sortMode === "overall" || s.sortMode === "profit" || s.sortMode === "execution") {
      setSortMode(s.sortMode);
    }

    if (typeof s.minProfitPct === "number") setMinProfitPct(s.minProfitPct);
    if (typeof s.greatProfitPct === "number") setGreatProfitPct(s.greatProfitPct);
    if (typeof s.minVolumePerHour === "number") setMinVolumePerHour(s.minVolumePerHour);
    if (typeof s.targetVolumePerHour === "number") setTargetVolumePerHour(s.targetVolumePerHour);
    if (typeof s.targetVolatility === "number") setTargetVolatility(s.targetVolatility);
    if (typeof s.maxVolatility === "number") setMaxVolatility(s.maxVolatility);

    setFavorites(new Set(store.favorites || []));
    setIgnore(new Set(store.ignore || []));
  }, []);

  async function loadLeagues() {
    setLoadingLeagues(true);
    setLeagueError(null);
    try {
      const next = await fetchEconomyLeagues();
      setLeagues(next);
      const preferred = next.find((l) => l.name === defaultLeagueName)?.name;
      setSelectedLeague((prev) => prev || preferred || next[0]?.name || "");
    } catch (err) {
      setLeagueError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingLeagues(false);
    }
  }

  useEffect(() => {
    loadLeagues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runScan(reason: "manual" | "league" | "auto") {
    if (!selectedLeague) return;
    if (scanning) return;
    const now = Date.now();
    if (now < cooldownUntil && reason === "manual") return;

    const seq = ++scanSeq.current;
    setScanning(true);
    setScanError(null);
    setScanProgress({ total: 0, done: 0, ok: 0, failed: 0 });
    try {
      // Manual-only scan: invalidate caches so the button is a true refresh.
      if (reason === "manual") invalidateLeagueCurrencyCaches(selectedLeague);

      const res = await scanLeagueCurrencyOpportunities(selectedLeague, {
        onProgress: (p) => {
          if (seq !== scanSeq.current) return;
          setScanProgress(p);
        },
      });
      if (seq !== scanSeq.current) return;
      setScanResult(res);
      setLastScanAt(Date.now());
      if (res.errors.length > 0 && reason !== "auto") {
        // keep errors visible without failing the scan
        setScanError(`${res.errors.length} item(s) failed to load details.`);
        setShowScanErrors(false);
      }
    } catch (err) {
      if (seq !== scanSeq.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("http error: 429")) {
        setScanError(
          "poe.ninja rate limited this scan (HTTP 429). Wait a bit and try again.",
        );
        setCooldownUntil(Date.now() + 60_000);
      } else {
        setScanError(msg);
      }
      setScanResult(null);
    } finally {
      if (seq === scanSeq.current) setScanning(false);
    }
  }

  useEffect(() => {
    if (!selectedLeague) return;
    setSelected(null);
    setScanResult(null);
    setScanError(null);
    setScanProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague]);

  const currencyIconById = useMemo(() => {
    const map = new Map<string, string>();
    if (!scanResult) return map;
    for (const c of scanResult.overview.core.items) {
      const url = normalizeImageUrl(c.image);
      if (url) map.set(c.id, url);
    }
    return map;
  }, [scanResult]);

  const filtered = useMemo(() => {
    const opps = scanResult?.opportunities || [];
    return opps
      .filter((o) => !ignore.has(o.detailsId))
      .filter((o) => (o.routeKind === "exalted" ? includeExalted : includeChaos))
      .filter((o) => o.edge * 100 >= minProfitPct)
      .filter((o) => (o.volumeMin == null ? true : o.volumeMin >= minVolumePerHour))
      .filter((o) => (o.volatility7d == null ? true : o.volatility7d <= maxVolatility));
  }, [
    scanResult,
    includeExalted,
    includeChaos,
    minProfitPct,
    minVolumePerHour,
    maxVolatility,
    ignore,
  ]);

  const ratingThresholds: RatingThresholds = useMemo(
    () => ({
      minProfitPct,
      greatProfitPct,
      minVolumePerHour,
      targetVolumePerHour,
      targetVolatility,
      maxVolatility,
    }),
    [
      minProfitPct,
      greatProfitPct,
      minVolumePerHour,
      targetVolumePerHour,
      targetVolatility,
      maxVolatility,
    ],
  );

  const scored = useMemo(() => {
    return filtered.map((o) => {
      const edgePct = o.edge * 100;
      const profitRating = computeProfitRating(edgePct, ratingThresholds);
      const executionRating = computeExecutionRating(o.volumeMin, o.volatility7d, ratingThresholds);
      const overall = harmonicMean2(profitRating, executionRating);
      return { ...o, profitRating, executionRating, overall };
    });
  }, [filtered, ratingThresholds]);

  const sorted = useMemo(() => {
    const primary = (o: { overall: number; profitRating: number; executionRating: number }) => {
      if (sortMode === "profit") return o.profitRating;
      if (sortMode === "execution") return o.executionRating;
      return o.overall;
    };

    return [...scored].sort((a, b) => {
      const favA = favorites.has(a.detailsId) ? 1 : 0;
      const favB = favorites.has(b.detailsId) ? 1 : 0;
      if (favA !== favB) return favB - favA;

      const d = primary(b) - primary(a);
      if (d !== 0) return d;
      // Stable-ish tie-breakers.
      const e = b.edge - a.edge;
      if (e !== 0) return e;
      const n = a.itemName.localeCompare(b.itemName);
      if (n !== 0) return n;
      return a.routeKind.localeCompare(b.routeKind);
    });
  }, [scored, sortMode, favorites]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const store = loadStore();
      const settings: Partial<SettingsV1> = {
        league: selectedLeague,
        includeExalted,
        includeChaos,
        sortMode,
        minProfitPct,
        greatProfitPct,
        minVolumePerHour,
        targetVolumePerHour,
        targetVolatility,
        maxVolatility,
      };
      const next = upsertSettings(store, settings);
      next.favorites = Array.from(favorites);
      next.ignore = Array.from(ignore);
      saveStore(next);
    }, 250);
    return () => window.clearTimeout(t);
  }, [
    selectedLeague,
    includeExalted,
    includeChaos,
    sortMode,
    minProfitPct,
    greatProfitPct,
    minVolumePerHour,
    targetVolumePerHour,
    targetVolatility,
    maxVolatility,
    favorites,
    ignore,
  ]);

  const selectedLeagueObj = useMemo(
    () => leagues.find((l) => l.name === selectedLeague) || null,
    [leagues, selectedLeague],
  );

  function fmtPct(x: number) {
    return `${(x * 100).toFixed(2)}%`;
  }

  function fmtVol(x: number | null) {
    if (x == null) return "?";
    if (x >= 1000) return x.toFixed(0);
    if (x >= 100) return x.toFixed(1);
    if (x >= 10) return x.toFixed(2);
    return x.toFixed(3);
  }

  function fmtVolatility(v: number | null) {
    if (v == null) return "?";
    return v.toFixed(3);
  }

  function fmtRating(x: number) {
    return Math.round(x).toString();
  }

  function RouteIcons({ opp }: { opp: Opportunity }) {
    const div = currencyIconById.get("divine");
    const other = currencyIconById.get(opp.routeKind);
    return (
      <div className="flex items-center gap-2">
        {div ? <img src={div} alt="" width={18} height={18} /> : null}
        <span className="text-muted-foreground">→</span>
        {opp.itemIconUrl ? (
          <img src={opp.itemIconUrl} alt="" width={18} height={18} />
        ) : null}
        <span className="text-muted-foreground">→</span>
        {other ? <img src={other} alt="" width={18} height={18} /> : null}
        <span className="text-muted-foreground">→</span>
        {div ? <img src={div} alt="" width={18} height={18} /> : null}
      </div>
    );
  }

  const now = Date.now();
  const cooldownLeftSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  return (
    <main className="min-h-screen bg-[radial-gradient(1200px_600px_at_20%_-10%,hsl(36_45%_92%)_0%,transparent_55%),radial-gradient(900px_500px_at_80%_0%,hsl(30_10%_94%)_0%,transparent_60%)]">
      {selected && scanResult ? (
        <OpportunityDetail
          overview={scanResult.overview}
          opp={selected}
          onBack={() => setSelected(null)}
        />
      ) : (
        <div className="mx-auto w-[min(1120px,92vw)] py-10">
          <div className="flex flex-col gap-6">
            <header className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">PoE2 Arbitrage</h1>
                  <Badge variant="secondary">manual scan</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Scan poe.ninja (Currency) for screening edges. Manual-only to avoid rate limits.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-[260px]">
                  <Select
                    value={selectedLeague}
                    onValueChange={(v) => setSelectedLeague(v)}
                    disabled={loadingLeagues || scanning}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select league" />
                    </SelectTrigger>
                    <SelectContent>
                      {leagues.map((l) => (
                        <SelectItem key={l.name} value={l.name}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={() => runScan("manual")}
                  disabled={!selectedLeague || scanning || cooldownLeftSec > 0}
                >
                  {scanning
                    ? "Scanning..."
                    : cooldownLeftSec > 0
                      ? `Cooldown ${cooldownLeftSec}s`
                      : "Scan"}
                </Button>
              </div>
            </header>

            {leagueError ? (
              <Alert variant="destructive">
                <AlertTitle>Leagues failed to load</AlertTitle>
                <AlertDescription>{leagueError}</AlertDescription>
              </Alert>
            ) : null}

            {scanError ? (
              <Alert variant="destructive">
                <AlertTitle>Scan error</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2">
                    <div>{scanError}</div>
                    {scanResult?.errors?.length ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowScanErrors((v) => !v)}
                      >
                        {showScanErrors ? "Hide" : "Show"} error list
                      </Button>
                    ) : null}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {scanning && scanProgress ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Scanning</CardTitle>
                  <CardDescription>
                    {scanProgress.done}/{scanProgress.total || "?"} done · {scanProgress.ok} ok · {scanProgress.failed} failed · expected ~15-30s
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Progress
                    value={
                      scanProgress.total > 0
                        ? Math.round((scanProgress.done / scanProgress.total) * 100)
                        : 0
                    }
                  />
                </CardContent>
              </Card>
            ) : null}

            {showScanErrors && scanResult?.errors?.length ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Partial failures</CardTitle>
                  <CardDescription>Some detail endpoints failed during the scan.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
                    {scanResult.errors.slice(0, 80).map((e) => (
                      <div key={e}>{e}</div>
                    ))}
                    {scanResult.errors.length > 80 ? (
                      <div>...and {scanResult.errors.length - 80} more</div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Controls</CardTitle>
                <CardDescription>
                  {selectedLeagueObj ? `League: ${selectedLeagueObj.name}` : "Pick a league"}
                  {lastScanAt ? ` · Updated: ${new Date(lastScanAt).toLocaleTimeString()}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <Label className="text-xs text-muted-foreground">Filters</Label>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="minProfit" className="text-xs">Min edge %</Label>
                        <Input
                          id="minProfit"
                          type="number"
                          value={minProfitPct}
                          step={0.5}
                          onChange={(e) => setMinProfitPct(Number(e.currentTarget.value))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="greatProfit" className="text-xs">Great edge %</Label>
                        <Input
                          id="greatProfit"
                          type="number"
                          value={greatProfitPct}
                          step={0.5}
                          onChange={(e) => setGreatProfitPct(Number(e.currentTarget.value))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="minVol" className="text-xs">Min vol/hr</Label>
                        <Input
                          id="minVol"
                          type="number"
                          value={minVolumePerHour}
                          step={1}
                          onChange={(e) => setMinVolumePerHour(Number(e.currentTarget.value))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="maxV" className="text-xs">Max volatility</Label>
                        <Input
                          id="maxV"
                          type="number"
                          value={maxVolatility}
                          step={0.01}
                          onChange={(e) => setMaxVolatility(Number(e.currentTarget.value))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <Label className="text-xs text-muted-foreground">Routes</Label>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={includeExalted}
                          onCheckedChange={(v) => setIncludeExalted(Boolean(v))}
                          id="route-ex"
                        />
                        <Label htmlFor="route-ex">Exalted route</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={includeChaos}
                          onCheckedChange={(v) => setIncludeChaos(Boolean(v))}
                          id="route-chaos"
                        />
                        <Label htmlFor="route-chaos">Chaos route</Label>
                      </div>
                    </div>

                    <Separator className="my-4" />

                    <Label className="text-xs text-muted-foreground">Sort</Label>
                    <div className="mt-2">
                      <Select value={sortMode} onValueChange={(v) => {
                        if (v === "overall" || v === "profit" || v === "execution") setSortMode(v);
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="overall">Overall</SelectItem>
                          <SelectItem value="profit">Profit</SelectItem>
                          <SelectItem value="execution">Execution</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="md:col-span-4">
                    <Label className="text-xs text-muted-foreground">Lists</Label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Fav: {favorites.size}</Badge>
                      <Badge variant="secondary">Hidden: {ignore.size}</Badge>
                      <Button variant="outline" size="sm" onClick={() => setIgnore(new Set())} disabled={ignore.size === 0}>
                        Clear hidden
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setFavorites(new Set())} disabled={favorites.size === 0}>
                        Clear fav
                      </Button>
                    </div>

                    <Separator className="my-4" />

                    <div className="text-xs text-muted-foreground">
                      Tip: Click a row for details. Use Fav to pin items to the top.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Opportunities</CardTitle>
                <CardDescription>
                  {scanResult ? `${sorted.length} routes (after filters)` : "Press Scan to load."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Profit</TableHead>
                      <TableHead>Exec</TableHead>
                      <TableHead>Edge</TableHead>
                      <TableHead>Vol/hr</TableHead>
                      <TableHead>Volatility</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((opp) => (
                      <TableRow
                        key={opp.id}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelected({
                            league: opp.league,
                            detailsId: opp.detailsId,
                            itemName: opp.itemName,
                            itemIconUrl: opp.itemIconUrl,
                            routeKind: opp.routeKind,
                          })
                        }
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {opp.itemIconUrl ? (
                              <img src={opp.itemIconUrl} alt="" width={22} height={22} />
                            ) : null}
                            <div className="min-w-0">
                              <div className="truncate font-medium">{opp.itemName}</div>
                              <div className="text-xs text-muted-foreground">{opp.routeKind}</div>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              <Button
                                variant={favorites.has(opp.detailsId) ? "secondary" : "outline"}
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFavorites((prev) =>
                                    new Set(toggleInList(Array.from(prev), opp.detailsId)),
                                  );
                                }}
                              >
                                {favorites.has(opp.detailsId) ? "Pinned" : "Pin"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIgnore((prev) =>
                                    new Set(toggleInList(Array.from(prev), opp.detailsId)),
                                  );
                                }}
                              >
                                Hide
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <RouteIcons opp={opp} />
                        </TableCell>
                        <TableCell className="tabular-nums">{fmtRating(opp.profitRating)}</TableCell>
                        <TableCell className="tabular-nums">{fmtRating(opp.executionRating)}</TableCell>
                        <TableCell className="tabular-nums">{fmtPct(opp.edge)}</TableCell>
                        <TableCell className="tabular-nums">{fmtVol(opp.volumeMin)}</TableCell>
                        <TableCell className="tabular-nums">{fmtVolatility(opp.volatility7d)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {!scanning && scanResult && sorted.length === 0 ? (
                  <div className="mt-4 text-sm text-muted-foreground">
                    No opportunities match the current filters.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
