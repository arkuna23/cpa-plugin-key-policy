import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listKeys, deleteKey, rotateKey, resetQuota, resetRPM } from "../api/keys";
import type { KeyPublic } from "../types";
import PlainKeyModal from "../components/PlainKeyModal";
import { useT } from "../i18n";

const usdFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtUsd(value: number): string {
  return usdFormatter.format(Number.isFinite(value) ? value : 0);
}

// Renders a key's daily/weekly dollar usage against its limits. Empty limits
// (0) show as "不限"; usage at/over a limit is flagged in the danger color so an
// admin can spot a throttled key at a glance.
//
// When the backend reports cache stats (cache-read tokens + non-cache input
// tokens), a third line shows cache spend and hit-rate per window. Hit-rate =
// cacheRead / (cacheRead + input); cache-creation tokens are excluded by the
// backend so this stays a clean "of the input we read, how much was cached".
export default function KeyList() {
  const t = useT();
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
      setError(err.response?.data?.error?.message ?? err.message ?? t("keys.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRotate = async (id: string) => {
    if (!confirm(t("keys.rotateConfirm", { id }))) return;
    try {
      const r = await rotateKey(id);
      setPlain(r.plain_key);
      setPlainTitle(t("keys.rotated"));
      void load();
    } catch (e) {
      alert((e as Error).message ?? t("keys.rotateFailed"));
    }
  };

  const onReset = async (id: string) => {
    try {
      await resetRPM(id);
      void load();
    } catch (e) {
      alert((e as Error).message ?? t("keys.resetFailed"));
    }
  };

  const onResetQuota = async (id: string) => {
    if (!confirm(t("keys.resetQuotaConfirm", { id }))) return;
    try {
      await resetQuota(id);
      void load();
    } catch (e) {
      alert((e as Error).message ?? t("keys.resetQuotaFailed"));
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm(t("keys.deleteConfirm", { id }))) return;
    try {
      await deleteKey(id);
      void load();
    } catch (e) {
      alert((e as Error).message ?? t("keys.deleteFailed"));
    }
  };

  return (
    <div>
      {/* Desktop: page toolbar (h1 + refresh). Nav/new-key live in the topnav. */}
      <div className="fp-head mobile-hidden" style={{ margin: "0 0 16px" }}>
        <h1>{t("header.keyList")}</h1>
        <div className="fp-actions">
          <button className="btn sm" onClick={load}>{t("keys.refresh")}</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="muted">{t("keys.loading")}</div>
      ) : keys.length === 0 ? (
        <div className="card muted">{t("keys.empty")}</div>
      ) : (
        /* Unified card grid: mobile stack + desktop grid (CSS switches). */
        <div className="card-stack">
          {keys.map((k) => (
            <KeyCard
              key={k.id}
              k={k}
              onDelete={onDelete}
              onRotate={onRotate}
              onReset={onReset}
              onResetQuota={onResetQuota}
            />
          ))}
        </div>
      )}

      {/* Mobile: FAB + bottom tab bar */}
      <Link to="/keys/new" className="fab" aria-label={t("keys.newKey")}>+</Link>
      <MobileTabBar active="keys" />

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

// Mobile key card with swipe-to-revoke. Renders the daily usage as an
// ink-drop progress bar and the first few model aliases as chips. Tapping
// the card navigates to the detail/usage page; swiping left reveals a
// destructive Revoke action that calls onDelete.
function KeyCard({
  k,
  onDelete,
  onRotate,
  onReset,
  onResetQuota,
}: {
  k: KeyPublic;
  onDelete: (id: string) => void;
  onRotate?: (id: string) => void;
  onReset?: (id: string) => void;
  onResetQuota?: (id: string) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);          // current swipe translate
  const [revoking, setRevoking] = useState(false);
  const startX = useRef(0); const startY = useRef(0); const dragging = useRef(false); const horizontal = useRef(false); const moved = useRef(false);

  const fixedQuota = k.quota_mode === "fixed";
  const limit = fixedQuota
    ? (k.usage.fixed_limit_usd > 0 ? k.usage.fixed_limit_usd : 0)
    : (k.usage.daily_limit_usd > 0 ? k.usage.daily_limit_usd : 0);
  const used = fixedQuota ? (k.usage.fixed_usd ?? 0) : (k.usage.daily_usd ?? 0);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const over = limit > 0 && used >= limit;
  const models = k.models ?? [];
  // Deduplicate by alias name for display: a multi-target alias resolves
  // to multiple ModelRules sharing one alias, but the key list should show
  // each alias once (not 'test' twice for a 2-target alias).
  const uniqueAliases: string[] = [];
  const seenAlias = new Set<string>();
  for (const m of models) {
    const key = (m.alias ?? "").toLowerCase();
    if (key && !seenAlias.has(key)) {
      seenAlias.add(key);
      uniqueAliases.push(m.alias);
    }
  }
  const shownChips = uniqueAliases.slice(0, 2);
  const moreCount = Math.max(0, uniqueAliases.length - 2);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true; horizontal.current = false; moved.current = false;
    startX.current = e.clientX; startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const ddx = e.clientX - startX.current;
    const ddy = e.clientY - startY.current;
    if (!horizontal.current && Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) {
      horizontal.current = true; // lock to horizontal swipe
    }
    if (horizontal.current) {
      e.preventDefault();
      moved.current = true;
      setDx(Math.max(-96, Math.min(0, ddx))); // only allow left swipe
    }
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (horizontal.current) {
      if (dx <= -64) { setRevoking(true); setDx(-88); }
      else { setDx(0); }
    }
  };

  const doRevoke = () => { setDx(0); setRevoking(false); onDelete(k.id); };

  return (
    <div
      ref={ref}
      className={"keycard" + (k.enabled ? "" : " disabled") + (over ? " over" : "")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
    >
      <button type="button" className="kc-revoke" disabled={!revoking} style={{ opacity: revoking || dx < -8 ? 1 : 0, transition: "opacity 150ms" }}
           onClick={(e) => { e.stopPropagation(); if (revoking) doRevoke(); }}>
        <span className="revoke-icon">⊘</span>
        <span>{t("keys.mobile.revoke")}</span>
      </button>
      <Link
        className="kc-open"
        to={`/keys/${encodeURIComponent(k.id)}/usage`}
        aria-label={`${k.name || k.id} · ${fixedQuota ? t("keys.quotaFixed") : t("keys.quotaPeriodic")}`}
        onClick={(e) => {
          if (moved.current || revoking) e.preventDefault();
        }}
      >
        <div className="kc-head">
          <span className="kc-dot" aria-hidden="true" />
          <span className="kc-name">{k.name || k.id}</span>
          <span className={"kc-quota-mode" + (fixedQuota ? " fixed" : "")}>{fixedQuota ? t("keys.quotaFixed") : t("keys.quotaPeriodic")}</span>
          <span className="kc-chevron" aria-hidden="true">›</span>
        </div>
        <div className="kc-preview">{k.key_preview}</div>
        {limit > 0 && (
          <>
            <div className="kc-bar"><span style={{ width: pct + "%" }} /></div>
            <div className="kc-meta">
              <span>{fmtUsd(used)} / {fmtUsd(limit)}</span>
              <span>{uniqueAliases.length} {t("keys.mobile.modelsSuffix")}</span>
            </div>
          </>
        )}
        {limit === 0 && (
          <div className="kc-meta">
            <span>{fmtUsd(used)} · {t("keys.mobile.noLimit")}</span>
            <span>{uniqueAliases.length} {t("keys.mobile.modelsSuffix")}</span>
          </div>
        )}
        {shownChips.length > 0 && (
          <div className="kc-chips">
            {shownChips.map((a) => <span key={a} className="chip">{a}</span>)}
            {moreCount > 0 && <span className="chip more">+{moreCount}</span>}
          </div>
        )}
      </Link>

      {/* Desktop: hover/focus action row. Not an overlay — sits at the card
       * footer and expands on hover/focus-within so card info stays visible.
       * Hidden on mobile (CSS .kc-actions display:none under 641px). The
       * swipe-to-revoke layer above handles mobile delete. */}
      <div className="kc-actions">
        <Link className="btn sm" to={`/keys/${encodeURIComponent(k.id)}/usage`}>{t("keys.detail")}</Link>
        <Link className="btn sm" to={`/keys/${encodeURIComponent(k.id)}/edit`}>{t("keys.edit")}</Link>
        {onReset && <button className="btn sm" onClick={(e) => { e.stopPropagation(); onReset(k.id); }}>{t("keys.resetRpm")}</button>}
        {fixedQuota && onResetQuota && <button className="btn sm" onClick={(e) => { e.stopPropagation(); onResetQuota(k.id); }}>{t("keys.resetQuota")}</button>}
        {onRotate && <button className="btn sm" onClick={(e) => { e.stopPropagation(); onRotate(k.id); }}>{t("keys.rotate")}</button>}
        <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); onDelete(k.id); }}>{t("keys.delete")}</button>
      </div>
    </div>
  );
}

// Mobile bottom tab bar. Active tab is highlighted with a 2px primary
// underline. Shown only on narrow screens via .tabbar CSS. The "usage" tab
// is hidden on the key list / new / edit screens (usage is per-key); it only
// appears once the user has opened a specific key's usage page.
// Compact top bar for mobile create/edit screens (desktop keeps the h2).
export function MobileFormHeader({ title, backTo }: { title: string; backTo: string }) {
  const t = useT();
  return (
    <div className="mobile-form-header mobile-only">
      <Link to={backTo} className="mfb-back">
        {t("keyUsage.back")}
      </Link>
      <h2 className="mfb-title">{title}</h2>
    </div>
  );
}

export function MobileTabBar({
  active,
  showUsage = false,
  usagePath = "/keys",
}: {
  active: "keys" | "usage" | "new";
  showUsage?: boolean;
  usagePath?: string;
}) {
  const t = useT();
  const tab = (id: "keys" | "usage" | "new", label: string, icon: string, target: string) => (
    <Link
      className={"tab" + (active === id ? " active" : "")}
      to={target}
    >
      <span className="tab-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </Link>
  );
  return (
    <nav className={"tabbar" + (showUsage ? "" : " tabbar--no-usage")}>
      {tab("keys", t("keys.mobile.tabKeys"), "#", "/keys")}
      {showUsage && tab("usage", t("keys.mobile.tabUsage"), "#", usagePath)}
      {tab("new", t("keys.mobile.tabNew"), "+", "/keys/new")}
    </nav>
  );
}
