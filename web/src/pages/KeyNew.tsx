import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createKey } from "../api/keys";
import KeyForm from "../components/KeyForm";
import PlainKeyModal from "../components/PlainKeyModal";
import { MobileFormHeader, MobileTabBar } from "./KeyList";
import { useT } from "../i18n";

export default function KeyNew() {
  const nav = useNavigate();
  const t = useT();
  const [plain, setPlain] = useState<string | null>(null);

  const title = t("new.title");

  return (
    <div className="form-page">
      <h2 className="mobile-hidden" style={{ marginTop: 0 }}>{title}</h2>
      <MobileFormHeader title={title} backTo="/keys" />
      <KeyForm
        submitLabel={t("new.create")}
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
            allow_models_endpoint: v.allow_models_endpoint,
          });
          setPlain(r.plain_key);
        }}
      />
      {plain && (
        <PlainKeyModal
          plainKey={plain}
          title={t("plainModal.created")}
          onClose={() => {
            setPlain(null);
            nav("/keys");
          }}
        />
      )}
      <MobileTabBar active="new" />
    </div>
  );
}
