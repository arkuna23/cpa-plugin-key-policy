import { useEffect } from "react";
import { useT } from "../i18n";

interface Props {
  plainKey: string;
  title?: string;
  onClose: () => void;
}

// Shows a freshly-issued/rotated plain key once. After closing it can never be retrieved again.
export default function PlainKeyModal({ plainKey, title, onClose }: Props) {
  const t = useT();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainKey);
    } catch {
      /* clipboard may be blocked; user can select manually */
    }
  };
  return (
    <dialog
      open
      className="modal-overlay"
      aria-modal="true"
      aria-labelledby="plain-key-modal-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="modal">
        <h3 id="plain-key-modal-title">{title ?? t("plainModal.defaultTitle")}</h3>
        <div className="error" style={{ fontWeight: 600 }}>
          {t("plainModal.warning")}
        </div>
        <div className="keybox">{plainKey}</div>
        <div className="actions">
          <button type="button" className="btn primary" onClick={copy}>{t("plainModal.copy")}</button>
          <button type="button" className="btn" onClick={onClose}>{t("plainModal.saved")}</button>
        </div>
      </div>
    </dialog>
  );
}
