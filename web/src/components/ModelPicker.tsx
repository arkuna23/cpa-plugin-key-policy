import { useEffect, useMemo, useState } from "react";
import { fetchCatalog, groupByProvider } from "../api/models";
import type { ModelRule } from "../types";

interface Props {
  // currently bound rules (for edit mode preselection)
  initial?: ModelRule[];
  // called whenever the selection changes
  onChange: (rules: ModelRule[]) => void;
}

// Multi-select picker over CPA's available models, grouped by provider.
// Selected models become ModelRule[] with alias = target_model.
export default function ModelPicker({ initial, onChange }: Props) {
  const [groups, setGroups] = useState<{ provider: string; models: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState("");

  // selection key set: "provider/model" (lowercased for dedupe matching)
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of initial ?? []) {
      s.add(r.provider.toLowerCase() + "/" + r.target_model.toLowerCase());
    }
    return s;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const cat = await fetchCatalog();
        if (!alive) return;
        setGroups(groupByProvider(cat));
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message || "加载模型列表失败");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // emit ModelRule[] whenever selection (or available groups) change.
  // Guard: do NOT emit before the catalog has loaded (groups is empty). On
  // mount, groups=[] would otherwise emit rules=[] and wipe any pre-filled
  // state the parent derived from `initial` (e.g. per-alias pricing on the
  // edit page). Selection can only map to real rules once groups exist, and
  // the user can't toggle anything before the catalog renders, so skipping
  // the empty-groups emit is safe and preserves edit-mode prefill.
  useEffect(() => {
    if (groups.length === 0) return;
    const rules: ModelRule[] = [];
    for (const g of groups) {
      for (const m of g.models) {
        const key = g.provider + "/" + m.toLowerCase();
        if (selected.has(key)) {
          rules.push({ alias: m, provider: g.provider, target_model: m });
        }
      }
    }
    onChange(rules);
  }, [selected, groups, onChange]);

  const filtered = useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        provider: g.provider,
        models: g.models.filter((m) => m.toLowerCase().includes(q) || g.provider.includes(q)),
      }))
      .filter((g) => g.models.length > 0);
  }, [groups, query]);

  const toggle = (provider: string, model: string) => {
    const key = provider + "/" + model.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) return <div className="muted">加载可用模型…</div>;
  if (error) return <div className="error">{error}</div>;
  if (groups.length === 0)
    return <div className="muted">未从 CPA 取到任何模型。请确认 CPA 已配置上游 provider。</div>;

  return (
    <div>
      <input
        className="input"
        placeholder="搜索 provider 或模型名…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div className="muted" style={{ marginBottom: 8 }}>
        已选 {selected.size} 个模型 · 别名自动等于模型名
      </div>
      {filtered.map((g) => (
        <div className="picker-group" key={g.provider}>
          <div className="pg-head">{g.provider}</div>
          <div className="pg-models">
            {g.models.map((m) => {
              const key = g.provider + "/" + m.toLowerCase();
              const active = selected.has(key);
              return (
                <label key={key} className={active ? "active" : ""}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(g.provider, m)}
                  />
                  {m}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
