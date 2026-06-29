import { useCallback, useState } from "react";
import type { KeyPublic, ModelRule } from "../types";
import ModelPicker from "./ModelPicker";

export interface KeyFormValues {
  id: string;
  name: string;
  enabled: boolean;
  rpm: number;
  models: ModelRule[];
  daily_limit_usd: number;
  weekly_limit_usd: number;
}

interface Props {
  initial?: KeyPublic;
  idReadOnly?: boolean;
  submitLabel: string;
  onSubmit: (v: KeyFormValues) => Promise<void>;
  onCancel: () => void;
  // top-level error to render
  error?: string;
  // when set, show a one-time plain key modal
}

// Pricing for a single alias, kept in form state alongside the model selection.
interface PriceRow {
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_price_per_million: number;
}

function parseNum(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export default function KeyForm({
  initial,
  idReadOnly,
  submitLabel,
  onSubmit,
  onCancel,
  error,
}: Props) {
  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [rpm, setRpm] = useState(initial?.rpm ?? 0);
  const [dailyLimit, setDailyLimit] = useState(initial?.daily_limit_usd ?? 0);
  const [weeklyLimit, setWeeklyLimit] = useState(initial?.weekly_limit_usd ?? 0);
  // Pricing table keyed by alias (lowercased) so it survives picker re-emits.
  const [prices, setPrices] = useState<Record<string, PriceRow>>(() => {
    const out: Record<string, PriceRow> = {};
    for (const m of initial?.models ?? []) {
      out[m.alias.toLowerCase()] = {
        input_price_per_million: m.input_price_per_million ?? 0,
        output_price_per_million: m.output_price_per_million ?? 0,
        cache_read_price_per_million: m.cache_read_price_per_million ?? 0,
      };
    }
    return out;
  });
  const [models, setModels] = useState<ModelRule[]>(initial?.models ?? []);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState("");

  // ModelPicker emits fresh ModelRule[] on every selection change (and once
  // when the catalog finishes loading). We must NOT let those re-emits wipe
  // pricing the user already typed: when merging, preserve existing rows and
  // only (a) add empty rows for newly-selected aliases, (b) drop rows for
  // aliases that are no longer selected. Keys already present are copied
  // through untouched. Wrapped in useCallback so ModelPicker's emit effect
  // does not re-fire on every KeyForm re-render (which would otherwise loop
  // and risk dropping mid-typing values).
  const handleModelsChange = useCallback((next: ModelRule[]) => {
    setModels(next);
    setPrices((prev) => {
      const updated: Record<string, PriceRow> = {};
      for (const m of next) {
        const key = m.alias.toLowerCase();
        updated[key] = prev[key] ?? { input_price_per_million: 0, output_price_per_million: 0, cache_read_price_per_million: 0 };
      }
      // Rows for aliases no longer selected simply aren't copied into `updated`.
      return updated;
    });
  }, []);

  const setPrice = (alias: string, field: keyof PriceRow, value: string) => {
    setPrices((prev) => ({
      ...prev,
      [alias.toLowerCase()]: {
        ...(prev[alias.toLowerCase()] ?? { input_price_per_million: 0, output_price_per_million: 0, cache_read_price_per_million: 0 }),
        [field]: parseNum(value),
      },
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr("");
    if (!id.trim()) {
      setLocalErr("id 不能为空");
      return;
    }
    // Stamp the per-alias pricing back onto the model rules before submit.
    const pricedModels: ModelRule[] = models.map((m) => {
      const row = prices[m.alias.toLowerCase()];
      return {
        ...m,
        input_price_per_million: row?.input_price_per_million ?? 0,
        output_price_per_million: row?.output_price_per_million ?? 0,
        cache_read_price_per_million: row?.cache_read_price_per_million ?? 0,
      };
    });
    setBusy(true);
    try {
      await onSubmit({
        id: id.trim(),
        name: name.trim(),
        enabled,
        rpm,
        models: pricedModels,
        daily_limit_usd: dailyLimit,
        weekly_limit_usd: weeklyLimit,
      });
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setLocalErr(e.response?.data?.error?.message ?? e.message ?? "提交失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="row2">
        <div className="form-row">
          <label>Key ID *</label>
          <input
            className="input"
            value={id}
            onChange={(e) => setId(e.target.value)}
            readOnly={idReadOnly}
            placeholder="例如 team-a"
            autoFocus={!idReadOnly}
          />
        </div>
        <div className="form-row">
          <label>名称（可选）</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="留空则用 ID"
          />
        </div>
      </div>
      <div className="row2">
        <div className="form-row">
          <label>RPM（每分钟请求数，0 = 不限）</label>
          <input
            className="input"
            type="number"
            min={0}
            value={rpm}
            onChange={(e) => setRpm(parseInt(e.target.value || "0", 10) || 0)}
          />
        </div>
        <div className="form-row">
          <label>状态</label>
          <label className="switch">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="track"><span className="thumb" /></span>
            <span>启用此 key</span>
          </label>
        </div>
      </div>

      <div className="row2">
        <div className="form-row">
          <label>每日用量上限（美元，0 = 不限）</label>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(parseNum(e.target.value))}
          />
        </div>
        <div className="form-row">
          <label>每周用量上限（美元，0 = 不限，滚动 7 天）</label>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={weeklyLimit}
            onChange={(e) => setWeeklyLimit(parseNum(e.target.value))}
          />
        </div>
      </div>

      <div className="form-row">
        <label>允许的模型（多选，别名自动 = 模型名）</label>
        <ModelPicker initial={initial?.models} onChange={handleModelsChange} />
      </div>

      {/* Per-alias pricing table. Stamped onto each ModelRule at submit. */}
      {models.length > 0 && (
        <div className="form-row" style={{ marginTop: 8 }}>
          <label>模型单价（美元 / 每百万 token；留 0 = 不计费）</label>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>别名</th>
                  <th>Provider</th>
                  <th>输入单价 $/M</th>
                  <th>输出单价 $/M</th>
                  <th title="缓存命中输入 token 单价（prompt-caching read）。留 0 = 按 输入单价 计。Claude 的 cache 读 token 不含在输入里，单独计；OpenAI/Gemini/Codex 的 cached 是输入的子集，会从输入里拆出来按此价重算，不重复计费。">缓存读单价 $/M</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const key = m.alias.toLowerCase();
                  const row = prices[key] ?? { input_price_per_million: 0, output_price_per_million: 0, cache_read_price_per_million: 0 };
                  return (
                    <tr key={m.alias}>
                      <td className="mono">{m.alias}</td>
                      <td className="muted">{m.provider}</td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.input_price_per_million}
                          onChange={(e) => setPrice(m.alias, "input_price_per_million", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.output_price_per_million}
                          onChange={(e) => setPrice(m.alias, "output_price_per_million", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.cache_read_price_per_million}
                          onChange={(e) => setPrice(m.alias, "cache_read_price_per_million", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(localErr || error) && <div className="error">{localErr || error}</div>}

      <div className="actions">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "提交中…" : submitLabel}
        </button>
        <button className="btn" type="button" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}
