// The model and farm plans are derived only from the sealed snapshot. No protocol name is used
// to choose a score or an action; names appear in the resulting instructions for the reader.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_breadth_weight: number;
  chain_breadth_weight: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_breadth_weight: 0.05,
  chain_breadth_weight: 0.1,
  breadth_cap: 8,
};

export const MODEL_VERSION = 'radar-2';
export const LIVE_ROWS = 24;

export interface ModelTrace {
  raw_implied_value_usd: number;
  base_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
  category_chain_breadth: number;
  category_breadth_multiplier: number;
  chain_count: number;
  chain_breadth_multiplier: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: ModelTrace;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelTrace;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const min = (a: number, b: number): number => Math.min(a, b);
const max = (a: number, b: number): number => Math.max(a, b);
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole UTC days since the first listed day, clamped at zero; null for an absent or invalid date. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const listedMs = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(listedMs)) return null;
  return max(0, Math.floor((asOfMs - listedMs) / DAY_MS));
}

/** Protocols with no recorded market cap, CoinGecko id, or symbol stay in the pre-token set. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Count unique deployment chains represented by each category across this snapshot. */
function categoryChainBreadth(snapshot: Snapshot): Map<string, number> {
  const chainsByCategory = new Map<string, Set<string>>();
  for (const p of snapshot.protocols) {
    if (p.category === null) continue;
    let chains = chainsByCategory.get(p.category);
    if (chains === undefined) {
      chains = new Set<string>();
      chainsByCategory.set(p.category, chains);
    }
    for (const chain of p.chains) chains.add(chain);
  }
  return new Map([...chainsByCategory].map(([category, chains]) => [category, chains.size]));
}

/** Score and retain the inputs behind one protocol's raw model value. */
function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  categoryBreadth: number,
  model: ModelConstants,
): ModelTrace {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = min(model.growth_cap, max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMultiplier = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMultiplier = model.maturity_floor +
    (min(max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainCount = new Set(protocol.chains).size;
  const categoryBreadthMultiplier = 1 + model.category_breadth_weight *
    min(categoryBreadth, model.breadth_cap) / model.breadth_cap;
  const chainBreadthMultiplier = 1 + model.chain_breadth_weight *
    min(chainCount, model.breadth_cap) / model.breadth_cap;
  const rawValue = Math.max(1, Math.round(
    protocol.tvl_usd * model.base_multiple * growthMultiplier * maturityMultiplier *
    categoryBreadthMultiplier * chainBreadthMultiplier,
  ));
  return {
    raw_implied_value_usd: rawValue,
    base_multiple: model.base_multiple,
    growth_pct: round4(growthPct),
    growth_multiplier: round4(growthMultiplier),
    maturity_multiplier: round4(maturityMultiplier),
    age_days: age,
    category_chain_breadth: categoryBreadth,
    category_breadth_multiplier: round4(categoryBreadthMultiplier),
    chain_count: chainCount,
    chain_breadth_multiplier: round4(chainBreadthMultiplier),
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains[0] ?? 'the primary deployment';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function categoryRisk(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return 'Check utilization, oracle and liquidation thresholds first; do not borrow against this test position.';
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('farm') || c.includes('liquidity')) {
    return 'Check pool depth, fee tier and price range; both assets can lose value through price movement.';
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return 'Send a small test first and wait for finality; verify the destination balance before routing more.';
  }
  if (c.includes('staking') || c.includes('restak')) {
    return 'Read the unbonding period and slashing terms; confirm the receipt token can be redeemed.';
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option') || c.includes('basis')) {
    return 'Use isolated margin and no more than 1x exposure; verify the liquidation price and funding cost.';
  }
  if (c.includes('prediction')) {
    return 'Check the market resolution source and settlement date; treat the full position as a possible loss.';
  }
  if (c.includes('rwa') || c.includes('real world')) {
    return 'Confirm eligibility, issuer, redemption window and custody terms before subscribing.';
  }
  if (c.includes('insurance')) {
    return 'Read exclusions, waiting periods and the payout trigger; do not assume a quoted policy will pay.';
  }
  if (c.includes('stable')) {
    return 'Check the collateral, redemption path and current peg; do not leave funds in an unverified wrapper.';
  }
  if (c.includes('marketplace') || c.includes('nft') || c.includes('launchpad')) {
    return 'Verify the collection or sale contract, total fees and refund terms before signing.';
  }
  return 'Verify the contract from the protocol documentation, preview the exact fee, and keep an exit route.';
}

function categoryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${n} on ${chain}; leave borrowing disabled and keep the receipt in the wallet.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('farm') || c.includes('liquidity')) {
    return `Add $${capital} to one active ${n} pool on ${chain}, split only across its listed pair, and save the LP receipt.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Route $${capital} through ${n} to its listed ${chain} deployment, starting with a $10 test before the remainder.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the supported network asset through ${n} on ${chain}, then retain the receipt token.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option') || c.includes('basis')) {
    return `Deposit $${capital} USDC as isolated margin on ${n} on ${chain}, then open at most a $10 notional position at 1x.`;
  }
  if (c.includes('prediction')) {
    return `Place a $5 limit position in one liquid open market on ${n} on ${chain}, and record its resolution date.`;
  }
  if (c.includes('rwa') || c.includes('real world')) {
    return `Subscribe $${capital} to the smallest available ${n} yield position on ${chain}, only if your account is eligible.`;
  }
  if (c.includes('insurance')) {
    return `Request a quote from ${n} on ${chain} and buy the shortest cover whose premium is $10 or less.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} through ${n} on ${chain}, using only its published collateral and redemption route.`;
  }
  if (c.includes('marketplace') || c.includes('nft') || c.includes('launchpad')) {
    return `Place one $10-or-less bid in an active ${n} listing or sale on ${chain}; do not use a market order.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Make one $5 test payment through ${n} on ${chain} and save the settled receipt before using it again.`;
  }
  return `Complete the smallest published ${p.category ?? 'onchain'} action in ${n} on ${chain}, capped at $${Math.min(capital, 25)}.`;
}

function step(action: string, cost: string, time: string, check: string): string {
  const suffix = ` Cost: ${cost}. Time: ${time}. Check: ${check}`;
  const room = Math.max(0, 600 - suffix.length);
  const clippedAction = action.length <= room ? action : `${action.slice(0, Math.max(0, room - 3)).trimEnd()}...`;
  return `${clippedAction}${suffix}`.trim();
}

/** Four record-derived steps with an action, explicit dollar cost, duration, and a safety check. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chains = uniqueSorted(p.chains);
  const chain = chainOf(p);
  const chainLabel = chains.length === 0 ? 'not reported' : chains.join(', ');
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    step(
      `Open ${p.name}'s ${p.category ?? 'protocol'} page and confirm its deployment list: ${chainLabel}. Start on ${chain}.`,
      '$0', '5 minutes',
      'Match the app and contract to its published documentation before connecting or signing.',
    ),
    step(
      categoryAction(p, capital, chain),
      `$${capital} principal and a fee budget capped at $12`, '15 minutes',
      categoryRisk(p.category),
    ),
    step(
      `After 7 days, open ${p.name}'s position or activity page on ${chain} and record the credited balance or transaction.`,
      '$0', '3 minutes after 7 days',
      'Verify the action appears under the same wallet; add no funds unless published campaign rules count another action.',
    ),
    step(
      `Keep the position for ${hold} days, then use the app's normal exit or redemption flow and save the final receipt.`,
      `$${capital} remains exposed; allow up to $12 for exit fees`, `${hold} days, then 10 minutes`,
      'Check unlock time, price impact and exit fees before confirming; no token reward is assumed.',
    ),
  ];
}

/** Build the pre-token board from the watchlist and every pre-token protocol below its floor. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (p.tvl_usd < snapshot.floor_usd && isPreToken(p)) chosen.set(p.slug, p);
  }

  const categoryBreadth = categoryChainBreadth(snapshot);
  const scored = [...chosen.values()].filter(isPreToken).map((p) => {
    const trace = scoreProtocol(p, snapshot.as_of, categoryBreadth.get(p.category ?? '') ?? 0, model);
    return { p, trace, age: trace.age_days };
  });
  scored.sort((a, b) => b.trace.raw_implied_value_usd - a.trace.raw_implied_value_usd ||
    a.p.slug.localeCompare(b.p.slug));

  // Dollar rounding can tie raw scores. Keep the model order and lower a tied display value by $1
  // per row so the board always communicates a strict ranking without changing any material score.
  let previous = Number.POSITIVE_INFINITY;
  return scored.map(({ p, trace, age }, i) => {
    const implied = Math.min(trace.raw_implied_value_usd, previous - 1);
    if (implied < 1) throw new SnapshotError('the model cannot assign a positive distinct value to every board row');
    previous = implied;
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: age,
      implied_value_usd: implied,
      model: trace,
      farm_steps: farmSteps(p, age),
    };
  });
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    model: row.model,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** Parse and shape the sealed snapshot, refusing malformed required fields. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Local mirror of the gate checks most likely to fail while developing the board. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4_000) return `the board has ${board.length} rows; expected 100 to 4,000`;
  const slugs = new Set<string>();
  const input = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  for (const row of board) {
    if (slugs.has(row.slug)) return `duplicate slug ${row.slug}`;
    slugs.add(row.slug);
    const p = input.get(row.slug);
    if (p === undefined) return `invented slug ${row.slug}`;
    if (!isPreToken(p)) return `${row.slug} records a token and cannot appear on the ranked board`;
  }
  const missing = snapshot.watchlist.filter((slug) => !slugs.has(slug));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (row.rank !== i + 1) return `row ${i + 1} has rank ${row.rank}`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has implied value ${row.implied_value_usd}`;
    if (i > 0 && row.implied_value_usd >= board[i - 1]!.implied_value_usd) return `${row.slug} does not have a distinct lower value than the row above`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const text of row.farm_steps) {
      const trimmed = text.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${row.slug} has a farm step of ${trimmed.length} characters`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
