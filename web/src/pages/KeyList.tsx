import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listKeys, deleteKey, rotateKey, resetRPM } from "../api/keys";
import type { KeyPublic, UsageSummary } from "../types";
import PlainKeyModal from "../components/PlainKeyModal";

function fmtUsd(n: number): string {
  return "$" + n.toFixed(2);
}

// Renders a key's daily/weekly dollar usage against its limits. Empty limits
// (0) show as "不限"; usage at/over a limit is flagged in the danger color so an
// admin can spot a throttled key at a glance.
function UsageCell({ usage }: { usage: UsageSummary }) {
  const dailyOver = usage.daily_limit_usd > 0 && usage.daily_usd >= usage.daily_limit_usd;
  const weeklyOver = usage.weekly_limit_usd > 0 && usage.weekly_usd >= usage.weekly_limit_usd;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className={dailyOver ? "" : "muted"} style={dailyOver ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
        今日 {fmtUsd(usage.daily_usd)}
        {usage.daily_limit_usd > 0 ? ` / ${fmtUsd(usage.daily_limit_usd)}` : " / 不限"}
      </span>
      <span className={weeklyOver ? "" : "muted"} style={weeklyOver ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
        本周 {fmtUsd(usage.weekly_usd)}
        {usage.weekly_limit_usd > 0 ? ` / ${fmtUsd(usage.weekly_limit_usd)}` : " / 不限"}
      </span>
    </div>
  );
}

export default function KeyList() {
  const [keys, setKeys] = useState<KeyPublic[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [plain, setPlain] = useState<string | null>(null);
  const [plainTitle, setPlainTitle] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setKeys(await listKeys());
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setError(err.response?.data?.error?.message ?? err.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRotate = async (id: string) => {
    if (!confirm(`确认轮换 key ${id} 的密钥？旧密钥将立即失效。`)) return;
    try {
      const r = await rotateKey(id);
      setPlain(r.plain_key);
      setPlainTitle("新 Key 已生成（轮换）");
      void load();
    } catch (e) {
      alert((e as Error).message ?? "轮换失败");
    }
  };

  const onReset = async (id: string) => {
    try {
      await resetRPM(id);
      void load();
    } catch (e) {
      alert((e as Error).message ?? "重置失败");
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm(`确认删除 key ${id}？此操作不可撤销。`)) return;
    try {
      await deleteKey(id);
      void load();
    } catch (e) {
      alert((e as Error).message ?? "删除失败");
    }
  };

  return (
    <div>
      <div className="actions" style={{ marginBottom: 14 }}>
        <Link to="/keys/new"><button className="btn primary">新建 Key</button></Link>
        <button className="btn" onClick={load}>刷新</button>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="muted">加载中…</div>
      ) : keys.length === 0 ? (
        <div className="card muted">还没有任何下游 key，点击"新建 Key"创建。</div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID / 名称</th>
                <th>状态</th>
                <th>Key 预览</th>
                <th>RPM</th>
                <th>用量（今日 / 本周）</th>
                <th>模型数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>
                    <div className="mono">{k.id}</div>
                    <div className="muted">{k.name}</div>
                  </td>
                  <td>
                    <span className={"tag " + (k.enabled ? "on" : "off")}>
                      {k.enabled ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td className="mono">{k.key_preview}</td>
                  <td>{k.rpm}</td>
                  <td>
                    <UsageCell usage={k.usage} />
                  </td>
                  <td>{k.models.length}</td>
                  <td>
                    <div className="actions">
                      <Link to={`/keys/${encodeURIComponent(k.id)}/edit`}>
                        <button className="btn sm">编辑</button>
                      </Link>
                      <button className="btn sm" onClick={() => onReset(k.id)}>重置RPM</button>
                      <button className="btn sm" onClick={() => onRotate(k.id)}>轮换</button>
                      <button className="btn sm danger" onClick={() => onDelete(k.id)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {plain && (
        <PlainKeyModal
          plainKey={plain}
          title={plainTitle}
          onClose={() => setPlain(null)}
        />
      )}
    </div>
  );
}
