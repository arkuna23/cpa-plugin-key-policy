import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listKeys, patchKey } from "../api/keys";
import type { KeyPublic } from "../types";
import KeyForm from "../components/KeyForm";

export default function KeyEdit() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [key, setKey] = useState<KeyPublic | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all = await listKeys();
        const found = all.find((k) => k.id === decodeURIComponent(id ?? ""));
        if (!found) setError("未找到该 key");
        else setKey(found);
      } catch (e) {
        setError((e as Error).message ?? "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="muted">加载中…</div>;
  if (error || !key) return <div className="error">{error || "未找到"}</div>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>编辑 Key · {key.id}</h2>
      <KeyForm
        initial={key}
        idReadOnly
        submitLabel="保存修改"
        onCancel={() => nav("/keys")}
        onSubmit={async (v) => {
          await patchKey({
            id: v.id,
            name: v.name || undefined,
            enabled: v.enabled,
            rpm: v.rpm,
            models: v.models,
            daily_limit_usd: v.daily_limit_usd,
            weekly_limit_usd: v.weekly_limit_usd,
          });
          nav("/keys");
        }}
      />
    </div>
  );
}
