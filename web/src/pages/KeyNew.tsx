import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createKey } from "../api/keys";
import KeyForm from "../components/KeyForm";
import PlainKeyModal from "../components/PlainKeyModal";

export default function KeyNew() {
  const nav = useNavigate();
  const [plain, setPlain] = useState<string | null>(null);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>新建 Key</h2>
      <KeyForm
        submitLabel="创建 Key"
        onCancel={() => nav("/keys")}
        onSubmit={async (v) => {
          const r = await createKey({
            id: v.id,
            name: v.name || undefined,
            enabled: v.enabled,
            rpm: v.rpm,
            models: v.models,
            daily_limit_usd: v.daily_limit_usd,
            weekly_limit_usd: v.weekly_limit_usd,
          });
          setPlain(r.plain_key);
        }}
      />
      {plain && (
        <PlainKeyModal
          plainKey={plain}
          title="Key 已创建"
          onClose={() => {
            setPlain(null);
            nav("/keys");
          }}
        />
      )}
    </div>
  );
}
