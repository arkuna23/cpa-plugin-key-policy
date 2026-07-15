// Community price hints from LiteLLM's public model price table.
//
// The user picks CPA provider models in the key form. Each selected
// ModelRule has an `alias` equal to the upstream `target_model` name. We offer an
// optional "recommend" affordance per row: if LiteLLM's table has a matching model
// entry, the user can one-click fill that row's input/output/cache-read prices
// (per million tokens).
//
// Design decisions (agreed with the user):
//   - DO NOT pre-fill. Prices stay 0 until the user explicitly clicks "recommend".
//   - Front-end fetches the raw JSON directly (no backend route, nothing embedded
//     in the .so). Cached in sessionStorage with a 24h TTL.
//   - Match `target_model` against LiteLLM top-level keys, case-insensitive. No
//     provider second-pass, no fuzzy/substring matching. Miss → no recommend.
//   - Map LiteLLM `input_cost_per_token`/`output_cost_per_token`/
//     `cache_read_input_token_cost` (per-token USD) to the form's per-million
//     fields by ×1e6. Missing fields → 0 (the form's "leave 0 = not billed"
//     semantic). Partial hit is still a hit.
//   - Clicking "recommend" OVERWRITES all three fields of that row (replace
//     semantics, not fill-gaps).
//   - Silent degradation: if the fetch is in flight or failed, we simply don't
//     show a recommend button. The form is fully usable without it.

const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

// sessionStorage key + stamped cache envelope. Persists only for the tab's
// lifetime; window close clears it. Stale after TTL_MS.
const CACHE_KEY = "cpa-key-policy:litellm-prices";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface PriceRow {
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_price_per_million: number;
}

export interface EditablePriceRow extends PriceRow {
  billing_mode: "tokens" | "per_call";
  per_call_usd: number;
}

export interface PriceModelRow {
  alias: string;
  target_model: string;
  group?: string;
}

// Lowercased model name → per-million price row. null entries mark models that
// exist in the catalog but carry no usable price info (so callers can
// distinguish "no such model" from "found, but no price" if needed).
export type PriceTable = Map<string, PriceRow>;

export function modelPriceKey(model: { alias: string; group?: string }): string {
  const group = (model.group ?? "").toLowerCase();
  return (group ? group + "|" : "") + model.alias.toLowerCase();
}

// Replace every eligible price row with its LiteLLM recommendation. A price
// row is eligible only when it is token-billed and maps to exactly one target
// model. Multi-target aliases share one price but may point at different
// models, so choosing a recommendation for them would be ambiguous.
export function fillAllRecommendedPrices(
  models: PriceModelRow[],
  prices: Record<string, EditablePriceRow>,
  table: PriceTable,
): { prices: Record<string, EditablePriceRow>; updated: number; skipped: number } {
  const grouped = new Map<string, PriceModelRow[]>();
  for (const model of models) {
    const key = modelPriceKey(model);
    grouped.set(key, [...(grouped.get(key) ?? []), model]);
  }

  const next = { ...prices };
  let updated = 0;
  let skipped = 0;
  for (const [key, rows] of grouped) {
    const current = prices[key] ?? {
      input_price_per_million: 0,
      output_price_per_million: 0,
      cache_read_price_per_million: 0,
      billing_mode: "tokens" as const,
      per_call_usd: 0,
    };
    if (rows.length !== 1 || current.billing_mode === "per_call") {
      skipped++;
      continue;
    }
    const recommendation = lookupPrice(table, rows[0].target_model);
    if (!recommendation) {
      skipped++;
      continue;
    }
    next[key] = {
      ...current,
      input_price_per_million: recommendation.input_price_per_million,
      output_price_per_million: recommendation.output_price_per_million,
      cache_read_price_per_million: recommendation.cache_read_price_per_million,
    };
    updated++;
  }
  return { prices: next, updated, skipped };
}

interface CacheEnvelope {
  fetchedAt: number;
  table: [string, PriceRow][];
}

// Per-token USD → per-million-token USD. Litellm stores costs as USD per single
// token; the form is USD per million tokens.
function perMillion(perToken: unknown): number {
  if (typeof perToken !== "number" || !Number.isFinite(perToken) || perToken < 0) {
    return 0;
  }
  return perToken * 1_000_000;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

interface LiteLLMEntry {
  input_cost_per_token?: unknown;
  output_cost_per_token?: unknown;
  cache_read_input_token_cost?: unknown;
  mode?: unknown;
}

// Parse the raw LiteLLM JSON into a price table. Skips non-objects and the
// `sample_spec` schema-template entry. Lowercases keys for case-insensitive
// matching. Any entry that has at least an input or output cost yields a row;
// missing components default to 0.
export function parseLiteLLM(raw: Record<string, unknown>): PriceTable {
  const table: PriceTable = new Map();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "sample_spec") continue;
    if (!value || typeof value !== "object") continue;
    const e = value as LiteLLMEntry;
    const input = num(e.input_cost_per_token);
    const output = num(e.output_cost_per_token);
    const cacheRead = num(e.cache_read_input_token_cost);
    // An entry with no price fields at all carries no recommendation signal.
    if (input === 0 && output === 0 && cacheRead === 0) continue;
    table.set(key.toLowerCase(), {
      input_price_per_million: perMillion(e.input_cost_per_token),
      output_price_per_million: perMillion(e.output_cost_per_token),
      cache_read_price_per_million: perMillion(e.cache_read_input_token_cost),
    });
  }
  return table;
}

function readCache(): PriceTable | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope;
    if (
      !env ||
      typeof env.fetchedAt !== "number" ||
      !Array.isArray(env.table)
    ) {
      return null;
    }
    if (Date.now() - env.fetchedAt > TTL_MS) return null;
    return new Map(env.table);
  } catch {
    return null;
  }
}

function writeCache(table: PriceTable): void {
  try {
    const env: CacheEnvelope = { fetchedAt: Date.now(), table: Array.from(table.entries()) };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(env));
  } catch {
    /* sessionStorage may be unavailable (private mode); degrade silently */
  }
}

// In-memory memo so multiple KeyForm mounts in one tab share both the fetch and
// parsed table. The LiteLLM catalog is large; reparsing its sessionStorage JSON
// on every form mount caused avoidable main-thread work.
let inflight: Promise<PriceTable | null> | null = null;
let memoryCache: PriceTable | null = null;

export async function getPriceTable(): Promise<PriceTable | null> {
  if (memoryCache) return memoryCache;
  const cached = readCache();
  if (cached) {
    memoryCache = cached;
    return cached;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(LITELLM_URL, { cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as Record<string, unknown>;
      if (!json || typeof json !== "object") return null;
      const table = parseLiteLLM(json);
      writeCache(table);
      memoryCache = table;
      return table;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Look up a model in a table. Case-insensitive (the table keys are already
// lowercased). Returns null when no entry exists → caller shows no recommend.
export function lookupPrice(table: PriceTable | null, model: string): PriceRow | null {
  if (!table || !model) return null;
  return table.get(model.toLowerCase()) ?? null;
}

// Exposed for tests to reset cache state between cases.
export function _resetPriceCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
  inflight = null;
  memoryCache = null;
}
