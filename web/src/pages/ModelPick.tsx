import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { fetchCatalog, groupByCatalog } from "../api/models";
import type { CatalogGroup } from "../api/models";
import type { ModelRule } from "../types";
import { useT } from "../i18n";

// Tier label: known tiers get a localized name; anything unrecognized falls
// back to the raw string. Mirrors the inline ModelPicker's tierLabel.
function tierLabel(
  t: (k: string, v?: Record<string, string | number>) => string,
  group: string,
): string {
  const key = "picker.tier." + group;
  const translated = t(key);
  return translated === key ? group : translated;
}

// Selection key: "provider|group|model" (all lowercased for dedupe matching).
function keyOf(g: CatalogGroup, model: string): string {
  return g.provider + "|" + (g.group ?? "").toLowerCase() + "|" + model.toLowerCase();
}

export default function ModelPick() {
  const { id } = useParams<{ id?: string }>();
  const nav = useNavigate();
  const loc = useLocation();
  const t = useT();
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState("");

  // Initial selection comes from router state (passed by KeyForm when it
  // navigates here). Edit-mode keys pass their current models in too.
  const initial = (loc.state as { models?: ModelRule[] } | null)?.models ?? [];
  const backTo = id ? `/keys/${encodeURIComponent(id)}/edit` : "/keys/new";

  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of initial) {
      const g = (r.group ?? "").toLowerCase();
      s.add(r.provider.toLowerCase() + "|" + g + "|" + r.target_model.toLowerCase());
    }
    return s;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Keep providers already bound to this key visible even if their
        // credential has since been removed (edit-mode prefill).
        const selectedProviders = new Set(
          initial.map((r) => r.provider.toLowerCase()),
        );
        const cat = await fetchCatalog(selectedProviders);
        if (!alive) return;
        setGroups(groupByCatalog(cat));
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message || t("picker.loadFailed"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the ModelRule[] for the current selection. Includes stale entries
  // the catalog no longer covers (legacy edit-mode rows), so upgrading never
  // drops a model from an existing key.
  const rules: ModelRule[] = useMemo(() => {
    const covered = new Set<string>();
    const out: ModelRule[] = [];
    for (const g of groups) {
      for (const m of g.models) {
        const k = keyOf(g, m);
        covered.add(k);
        if (selected.has(k)) {
          const rule: ModelRule = { alias: m, provider: g.provider, target_model: m };
          if (g.group) rule.group = g.group;
          out.push(rule);
        }
      }
    }
    for (const k of selected) {
      if (covered.has(k)) continue;
      const [provider, group, ...rest] = k.split("|");
      const model = rest.join("|");
      if (!provider || !model) continue;
      const rule: ModelRule = { alias: model, provider, target_model: model };
      if (group) rule.group = group;
      out.push(rule);
    }
    return out;
  }, [selected, groups]);

  const filtered = useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        provider: g.provider,
        group: g.group,
        models: g.models.filter(
          (m) => m.toLowerCase().includes(q) || g.provider.includes(q) || (g.group ?? "").includes(q),
        ),
      }))
      .filter((g) => g.models.length > 0);
  }, [groups, query]);

  const toggle = (g: CatalogGroup, model: string) => {
    const k = keyOf(g, model);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const selectAll = (g: CatalogGroup) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const m of g.models) next.add(keyOf(g, m));
      return next;
    });
  };
  const clearAll = (g: CatalogGroup) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const m of g.models) next.delete(keyOf(g, m));
      return next;
    });
  };

  const finish = () => {
    // Hand the selection back to the form via router state. The form reads
    // loc.state.models on mount/return to repopulate its model list.
    nav(backTo, { state: { pickedModels: rules } });
  };

  return (
    <div className="model-pick-page">
      <div className="mp-head">
        <Link to={backTo} className="btn sm">{t("keyUsage.back")}</Link>
        <h1>{t("picker.title")}</h1>
        <button className="btn primary sm" onClick={finish} disabled={loading}>
          {t("picker.done", { count: selected.size })}
        </button>
      </div>
      <div className="mp-sub">{t("picker.selected", { count: selected.size })}</div>
      <div className="mp-search">
        <span className="mp-icon">⌕</span>
        <input
          className="input"
          placeholder={t("picker.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="card mp-list">
        {loading ? (
          <div className="muted">{t("picker.loading")}</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : groups.length === 0 ? (
          <div className="muted">{t("picker.empty")}</div>
        ) : filtered.length === 0 ? (
          <div className="muted">{t("picker.noMatch")}</div>
        ) : (
          filtered.map((g) => {
            const groupLabel = g.group ? tierLabel(t, g.group) : "";
            const head = g.provider + (groupLabel ? " · " + groupLabel : "");
            const allSelected = g.models.every((m) => selected.has(keyOf(g, m)));
            return (
              <div className="picker-group" key={head}>
                <div className="pg-head">
                  <span>{head}</span>
                  <span className="pg-actions">
                    <button type="button" className="btn sm" onClick={() => (allSelected ? clearAll(g) : selectAll(g))}>
                      {allSelected ? t("picker.clearAll") : t("picker.selectAll")}
                    </button>
                  </span>
                </div>
                <div className="pg-models">
                  {g.models.map((m) => {
                    const k = keyOf(g, m);
                    const active = selected.has(k);
                    return (
                      <label key={k} className={active ? "active" : ""}>
                        <input type="checkbox" checked={active} onChange={() => toggle(g, m)} />
                        {m}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="mp-footer">
        <span className="mp-count">{t("picker.selected", { count: selected.size })}</span>
        <div className="mp-btns">
          <Link to={backTo} className="btn sm">{t("keyForm.cancel")}</Link>
          <button className="btn primary sm" onClick={finish} disabled={loading}>
            {t("picker.done", { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  );
}
