import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listKeys, deleteKey, rotateKey, resetRPM } from "../api/keys";
import type { KeyPublic, UsageSummary } from "../types";
import PlainKeyModal from "../components/PlainKeyModal";
import { useT, translate } from "../i18n";

function fmtUsd(n: number): string {
  return "$" + n.toFixed(2);
}

// Renders a key's daily/weekly dollar usage against its limits. Empty limits
// (0) show as "不限"; usage at/over a limit is flagged in the danger color so an
// admin can spot a throttled key at a glance.
//
// When the backend reports cache stats (cache-read tokens + non-cache input
// tokens), a third line shows cache spend and hit-rate per window. Hit-rate =
// cacheRead / (cacheRead + input); cache-creation tokens are excluded by the
// backend so this stays a clean "of the input we read, how much was cached".
function UsageCell({ usage }: { usage: UsageSummary }) {
  const t = useT();
  const dailyOver = usage.daily_limit_usd > 0 && usage.daily_usd >= usage.daily_limit_usd;
  const weeklyOver = usage.weekly_limit_usd > 0 && usage.weekly_usd >= usage.weekly_limit_usd;

  const dailyCache = cacheLine(usage.daily_cache_read_tokens, usage.daily_input_tokens, usage.daily_cache_cost_usd);
  const weeklyCache = cacheLine(usage.weekly_cache_read_tokens, usage.weekly_input_tokens, usage.weekly_cache_cost_usd);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className={dailyOver ? "" : "muted"} style={dailyOver ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
        {t("usage.today")} {fmtUsd(usage.daily_usd)}
        {usage.daily_limit_usd > 0 ? ` / ${fmtUsd(usage.daily_limit_usd)}` : ` / ${t("usage.unlimited")}`}
      </span>
      {dailyCache && <span className="muted" style={{ fontSize: 11 }}>{t("usage.cache")} {dailyCache}</span>}
      <span className={weeklyOver ? "" : "muted"} style={weeklyOver ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
        {t("usage.thisWeek")} {fmtUsd(usage.weekly_usd)}
        {usage.weekly_limit_usd > 0 ? ` / ${fmtUsd(usage.weekly_limit_usd)}` : ` / ${t("usage.unlimited")}`}
      </span>
      {weeklyCache && <span className="muted" style={{ fontSize: 11 }}>{t("usage.cache")} {weeklyCache}</span>}
      {(usage.daily_call_count || usage.weekly_call_count) ? (
        <span className="muted" style={{ fontSize: 11 }}>
          {t("usage.calls")} {usage.daily_call_count ?? 0} / {usage.weekly_call_count ?? 0}
        </span>
      ) : null}
    </div>
  );
}

// Build the "cache spend / hit-rate" suffix for one window. Returns "" when no
// cache activity is reported for that window (so the line is hidden entirely).
function cacheLine(cacheRead?: number, inputTokens?: number, cacheCost?: number): string {
  const cr = cacheRead ?? 0;
  const inp = inputTokens ?? 0;
  if (cr <= 0 && inp <= 0) return "";
  const denom = cr + inp;
  const rate = denom > 0 ? (cr / denom) * 100 : 0;
  const cost = fmtUsd(cacheCost ?? 0);
  return `${cost} · ${translate("usage.hitRate", { rate: rate.toFixed(0) })}`;
}

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
      <div className="actions mobile-hidden" style={{ marginBottom: 14 }}>
        <Link to="/keys/new"><button className="btn primary">{t("keys.newKey")}</button></Link>
        <button className="btn" onClick={load}>{t("keys.refresh")}</button>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="muted">{t("keys.loading")}</div>
      ) : keys.length === 0 ? (
        <div className="card muted">{t("keys.empty")}</div>
      ) : (
        <>
          {/* Desktop: table (unchanged) */}
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("keys.colIdName")}</th>
                  <th>{t("keys.colStatus")}</th>
                  <th>{t("keys.colPreview")}</th>
                  <th>{t("keys.colRpm")}</th>
                  <th>{t("keys.colUsage")}</th>
                  <th>{t("keys.colModels")}</th>
                  <th>{t("keys.colActions")}</th>
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
                        {k.enabled ? t("keys.enabled") : t("keys.disabled")}
                      </span>
                    </td>
                    <td className="mono">{k.key_preview}</td>
                    <td>{k.rpm}</td>
                    <td>
                      <UsageCell usage={k.usage} />
                    </td>
                    <td>{(k.models ?? []).length}</td>
                    <td>
                      <div className="actions">
                        <Link to={`/keys/${encodeURIComponent(k.id)}/usage`}>
                          <button className="btn sm" title={t("keys.detail")}>{t("keys.detail")}</button>
                        </Link>
                        <Link to={`/keys/${encodeURIComponent(k.id)}/edit`}>
                          <button className="btn sm">{t("keys.edit")}</button>
                        </Link>
                        <button className="btn sm" onClick={() => onReset(k.id)}>{t("keys.resetRpm")}</button>
                        <button className="btn sm" onClick={() => onRotate(k.id)}>{t("keys.rotate")}</button>
                        <button className="btn sm danger" onClick={() => onDelete(k.id)}>{t("keys.delete")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card stack */}
          <div className="card-stack">
            {keys.map((k) => (
              <KeyCard
                key={k.id}
                k={k}
                onDelete={onDelete}
              />
            ))}
          </div>
        </>
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
function KeyCard({ k, onDelete }: { k: KeyPublic; onDelete: (id: string) => void }) {
  const t = useT();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);          // current swipe translate
  const [revoking, setRevoking] = useState(false);
  const startX = useRef(0); const startY = useRef(0); const dragging = useRef(false); const horizontal = useRef(false); const moved = useRef(false);

  const limit = k.usage.daily_limit_usd > 0 ? k.usage.daily_limit_usd : 0;
  const pct = limit > 0 ? Math.min(100, (k.usage.daily_usd / limit) * 100) : 0;
  const over = limit > 0 && k.usage.daily_usd >= limit;
  const models = k.models ?? [];
  const shownChips = models.slice(0, 2).map((m) => m.alias);
  const moreCount = Math.max(0, models.length - 2);

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

  // Click handles tap-to-open. Skipped when the pointer turned into a swipe
  // (moved.current) or the revoke panel is revealed, so a swipe doesn't also
  // navigate. Using onClick (instead of navigating from pointerup) is more
  // reliable on mobile browsers where pointerup can be swallowed by touch
  // handling.
  const onClick = () => {
    if (moved.current || revoking) return;
    nav(`/keys/${encodeURIComponent(k.id)}/usage`);
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
      onClick={onClick}
      style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
    >
      <div className="kc-revoke" style={{ opacity: revoking || dx < -8 ? 1 : 0, transition: "opacity 150ms" }}
           onClick={(e) => { e.stopPropagation(); if (revoking) doRevoke(); }}>
        <span className="revoke-icon">⊘</span>
        <span>{t("keys.mobile.revoke")}</span>
      </div>
      <div className="kc-head">
        <span className="kc-dot" />
        <span className="kc-name">{k.name || k.id}</span>
        <span className="kc-chevron">›</span>
      </div>
      <div className="kc-preview">{k.key_preview}</div>
      {limit > 0 && (
        <>
          <div className="kc-bar"><span style={{ width: pct + "%" }} /></div>
          <div className="kc-meta">
            <span>${k.usage.daily_usd.toFixed(2)} / ${limit.toFixed(2)}</span>
            <span>{models.length} {t("keys.mobile.modelsSuffix")}</span>
          </div>
        </>
      )}
      {limit === 0 && (
        <div className="kc-meta">
          <span>${k.usage.daily_usd.toFixed(2)} · {t("keys.mobile.noLimit")}</span>
          <span>{models.length} {t("keys.mobile.modelsSuffix")}</span>
        </div>
      )}
      {shownChips.length > 0 && (
        <div className="kc-chips">
          {shownChips.map((a) => <span key={a} className="chip">{a}</span>)}
          {moreCount > 0 && <span className="chip more">+{moreCount}</span>}
        </div>
      )}
    </div>
  );
}

// Mobile bottom tab bar. Active tab is highlighted with a 2px primary
// underline. Shown only on narrow screens via .tabbar CSS. The "usage" tab
// has no dedicated global page (usage is per-key), so on the key list it
// navigates to the first key's usage if one exists; otherwise stays put.
export function MobileTabBar({ active }: { active: "keys" | "usage" | "new" }) {
  const t = useT();
  const nav = useNavigate();
  const tab = (id: "keys" | "usage" | "new", label: string, icon: string, target: string) => (
    <button
      className={"tab" + (active === id ? " active" : "")}
      onClick={() => nav(target)}
    >
      <span className="tab-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="tabbar">
      {tab("keys", t("keys.mobile.tabKeys"), "#", "/keys")}
      {tab("usage", t("keys.mobile.tabUsage"), "#", "/keys")}
      {tab("new", t("keys.mobile.tabNew"), "+", "/keys/new")}
    </nav>
  );
}
