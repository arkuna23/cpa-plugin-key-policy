import { apiClient } from "./client";
import type { CatalogModel } from "../types";

// CPA has no single "list providers+models" endpoint. We compose from several
// management routes. The raw shapes are loose, so each adapter pulls strings out
// defensively and feeds them into normalizeCatalog, which is the unit-tested core.

const STATIC_CHANNELS = [
  "claude",
  "gemini",
  "vertex",
  "aistudio",
  "codex",
  "kimi",
  "antigravity",
  "xai",
] as const;

interface RawEntry {
  provider?: string;
  models?: unknown;
}

// Collect (provider, model) pairs from heterogeneous CPA responses.
export function normalizeCatalog(entries: RawEntry[]): CatalogModel[] {
  const seen = new Set<string>();
  const out: CatalogModel[] = [];
  for (const e of entries) {
    const provider = (e.provider ?? "").toString().trim().toLowerCase();
    if (!provider) continue;
    for (const m of toStrings(e.models)) {
      const model = m.trim();
      if (!model) continue;
      const key = provider + "/" + model.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ provider, model });
    }
  }
  // Stable sort: by provider then model (case-insensitive).
  out.sort((a, b) =>
    a.provider === b.provider
      ? a.model.toLowerCase().localeCompare(b.model.toLowerCase())
      : a.provider.localeCompare(b.provider),
  );
  return out;
}

function toStrings(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const mo = (x as Record<string, unknown>).model;
          if (typeof mo === "string") return mo;
          const id = (x as Record<string, unknown>).id;
          if (typeof id === "string") return id;
          const name = (x as Record<string, unknown>).name;
          if (typeof name === "string") return name;
        }
        return "";
      })
      .filter((s) => s !== "");
  }
  if (typeof v === "object") {
    // object map like { "model-a": {...}, "model-b": {...} }
    return Object.keys(v as Record<string, unknown>);
  }
  return [];
}

// --- CPA response adapters (best-effort, defensive) ---

function fromOpenAICompat(payload: unknown): RawEntry[] {
  const root = payload as Record<string, unknown> | null;
  const list = root?.["openai-compatibility"];
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const o = item as Record<string, unknown> | null;
    // Prefer `name` (e.g. "opencode") as the provider identity on CPA's
    // openai-compatibility entries, then fall back to provider/id.
    const provider =
      (o?.["name"] as string) ??
      (o?.["provider"] as string) ??
      (o?.["id"] as string) ??
      "openai-compat";
    return { provider, models: o?.["models"] };
  });
}

function fromChannelKey(channel: string, payload: unknown): RawEntry[] {
  // CPA per-channel endpoints vary; try common shapes.
  const o = payload as Record<string, unknown> | null;
  if (!o) return [];
  // Could be { models: [...] } or an array directly under a key.
  const models = o["models"] ?? o["keys"];
  return [{ provider: channel, models }];
}

function fromAuthFiles(payload: unknown): { name: string }[] {
  const root = payload as Record<string, unknown> | null;
  const list = root?.["auth-files"] ?? root?.["files"];
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      const o = item as Record<string, unknown> | null;
      const name = (o?.["name"] as string) ?? (o?.["id"] as string) ?? "";
      return { name };
    })
    .filter((x) => x.name !== "");
}

function fromAuthFileModels(name: string, payload: unknown): RawEntry[] {
  const root = payload as Record<string, unknown> | null;
  const models = root?.["models"] ?? root?.["available_models"];
  const provider =
    ((root?.["channel"] as string) ?? (root?.["provider"] as string) ?? "").trim() ||
    name;
  return [{ provider, models }];
}

function fromModelDefinitions(channel: string, payload: unknown): RawEntry[] {
  const root = payload as Record<string, unknown> | null;
  const models = root?.["models"] ?? root?.["definitions"];
  return [{ provider: channel, models }];
}

// Fetch the composed catalog. Failures of individual sources are swallowed so
// that one unavailable endpoint doesn't blank the whole picker. A 401/403 here
// is real (bad key) and surfaces through the shared client as a forced
// re-login — that's intended; we don't mask auth failures.
export async function fetchCatalog(): Promise<CatalogModel[]> {
  const c = apiClient();
  const entries: RawEntry[] = [];

  const safe = async <T>(p: Promise<{ data: T }>, apply: (d: T) => void) => {
    try {
      const { data } = await p;
      apply(data);
    } catch {
      /* skip unavailable source */
    }
  };

  await safe(
    c.get("/v0/management/openai-compatibility"),
    (d) => entries.push(...fromOpenAICompat(d)),
  );

  for (const ch of ["gemini-api-key", "claude-api-key", "codex-api-key", "vertex-api-key"]) {
    await safe(
      c.get("/v0/management/" + ch),
      (d) => entries.push(...fromChannelKey(ch, d)),
    );
  }

  // auth-files: await each per-file models sub-request so the catalog isn't
  // rendered before they resolve (which previously produced an empty list).
  await safe(c.get("/v0/management/auth-files"), async (d) => {
    for (const f of fromAuthFiles(d)) {
      await safe(
        c.get("/v0/management/auth-files/models", { params: { name: f.name } }),
        (m) => entries.push(...fromAuthFileModels(f.name, m)),
      );
    }
  });

  for (const ch of STATIC_CHANNELS) {
    await safe(
      c.get("/v0/management/model-definitions/" + ch),
      (d) => entries.push(...fromModelDefinitions(ch, d)),
    );
  }

  return normalizeCatalog(entries);
}

export function groupByProvider(
  catalog: CatalogModel[],
): { provider: string; models: string[] }[] {
  const map = new Map<string, string[]>();
  for (const c of catalog) {
    const arr = map.get(c.provider) ?? [];
    arr.push(c.model);
    map.set(c.provider, arr);
  }
  return Array.from(map.entries())
    .map(([provider, models]) => ({ provider, models }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}
