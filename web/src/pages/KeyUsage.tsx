import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchKeyUsage, resetQuota } from "../api/keys";
import type { AliasUsageEntry, KeyUsageResponse, UsageWindow } from "../types";
import { useT } from "../i18n";
import { MobileTabBar } from "./KeyList";

// Window switch for the per-alias breakdown table: each alias row has its own
// daily and rolling-weekly window, and the user toggles which one all rows
// show at once. Mirrors the KeyList usage column's today/this-week framing.
type Window = "daily" | "weekly";

const usdFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtUsd(n: number): string {
  return usdFormatter.format(Number.isFinite(n) ? n : 0);
}

// Compact integer formatting with thousands separators. 0 shows as "0".
function fmtInt(n: number): string {
  if (!n || n <= 0) return "0";
  return Math.round(n).toLocaleString("en-US");
}

// Hit-rate = cacheRead / (cacheRead + input), expressed as a percentage.
// Returns "—" when there's no input activity for the window (avoid 0/0).
function hitRate(w: UsageWindow): string {
  const cr = w.cache_read_tokens ?? 0;
  const inp = w.input_tokens ?? 0;
  const denom = cr + inp;
  if (denom <= 0) return "—";
  return Math.round((cr / denom) * 100) + "%";
}

// Billing-mode tag, reusing the existing .tag styling. Per-call rows use a
// distinct tint so they're scannable at a glance.
function BillingTag({ mode }: { mode?: string }) {
  const t = useT();
  const perCall = mode === "per_call";
  return (
    <span className={"tag " + (perCall ? "off" : "on")} style={perCall ? { color: "var(--accent)", borderColor: "var(--accent-ring)", background: "var(--accent-soft)" } : undefined}>
      {perCall ? t("keyUsage.billingPerCall") : t("keyUsage.billingTokens")}
    </span>
  );
}

export default function KeyUsage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const [data, setData] = useState<KeyUsageResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [win, setWin] = useState<Window>("daily");
  const [quotaResetting, setQuotaResetting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const keyId = decodeURIComponent(id ?? "");
        if (!keyId) {
          setError(t("keyUsage.notFound"));
          return;
        }
        setData(await fetchKeyUsage(keyId));
      } catch (e) {
        const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
        setError(err.response?.data?.error?.message ?? err.message ?? t("keyUsage.loadFailed"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="muted">{t("keyUsage.loading")}</div>;
  if (error || !data) return <div className="error">{error || t("keyUsage.notFound")}</div>;

  const aliases = data.aliases ?? [];
  const fixedQuota = data.quota_mode === "fixed";
  const hasUsage = aliases.some((a) => (a.fixed.call_count ?? 0) > 0 || (a.daily.call_count ?? 0) > 0 || (a.weekly.call_count ?? 0) > 0 || (a.fixed.total_usd ?? 0) > 0 || (a.daily.total_usd ?? 0) > 0 || (a.weekly.total_usd ?? 0) > 0);

  const windowOf = (a: AliasUsageEntry): UsageWindow => fixedQuota ? a.fixed : (win === "daily" ? a.daily : a.weekly);

  // Mobile hero totals: sum across aliases for the active window.
  const heroUsd = aliases.reduce((s, a) => s + (windowOf(a).total_usd ?? 0), 0);
  const heroCalls = aliases.reduce((s, a) => s + (windowOf(a).call_count ?? 0), 0);
  const heroInput = aliases.reduce((s, a) => s + (windowOf(a).input_tokens ?? 0), 0);
  const heroOutput = aliases.reduce((s, a) => s + (windowOf(a).output_tokens ?? 0), 0);
  const heroLimit = fixedQuota ? data.fixed_limit_usd : (win === "daily" ? data.daily_limit_usd : data.weekly_limit_usd);
  const heroPct = heroLimit > 0 ? Math.min(100, (heroUsd / heroLimit) * 100) : 0;
  const maxAliasUsd = Math.max(1, ...aliases.map((a) => windowOf(a).total_usd ?? 0));
  const windowLabel = fixedQuota ? t("keyUsage.tabFixed") : (win === "daily" ? t("keyUsage.mobile.today") : t("keyUsage.mobile.thisWeek"));

  const handleResetQuota = async () => {
    if (!confirm(t("keys.resetQuotaConfirm", { id: data.key_id }))) return;
    setQuotaResetting(true);
    try {
      await resetQuota(data.key_id);
      setData(await fetchKeyUsage(data.key_id));
    } catch (e) {
      alert((e as Error).message ?? t("keys.resetQuotaFailed"));
    } finally {
      setQuotaResetting(false);
    }
  };

  return (
    <div>
      {/* Header: back · key id (mono) · name · daily/weekly toggle */}
      <div className="keyusage-header">
        <div className="keyusage-idline">
          <Link className="btn sm" to="/keys">{t("keyUsage.back")}</Link>
          <span className="mono keyusage-id">{data.key_id}</span>
          <span className="muted">{data.key_name}</span>
          <Link
            to={`/keys/${encodeURIComponent(data.key_id)}/edit`}
            className="btn sm mobile-only keyusage-edit-link"
          >
            {t("keys.edit")}
          </Link>
          {fixedQuota && (
            <button type="button" className="btn sm" disabled={quotaResetting} onClick={() => void handleResetQuota()}>
              {t("keys.resetQuota")}
            </button>
          )}
        </div>
        {!fixedQuota && <div className="seg" role="tablist" aria-label={t("keyUsage.windowToggle")}>
          <button
            role="tab"
            aria-selected={win === "daily"}
            className={"seg-btn " + (win === "daily" ? "active" : "")}
            onClick={() => setWin("daily")}
          >
            {t("keyUsage.tabDaily")}
          </button>
          <button
            role="tab"
            aria-selected={win === "weekly"}
            className={"seg-btn " + (win === "weekly" ? "active" : "")}
            onClick={() => setWin("weekly")}
          >
            {t("keyUsage.tabWeekly")}
          </button>
        </div>}
      </div>

      {/* Desktop: hero summary + per-alias table (unchanged) */}
      <div className="usage-hero-d">
        <div className="uhd-tiles">
          <div className="uhd-tile">
            <span className="uhd-tk">{fixedQuota ? t("keyUsage.tabFixed") : (win === "daily" ? t("keyUsage.mobile.todaySpend") : t("keyUsage.mobile.weekSpend"))}</span>
            <span className={"uhd-tv" + (heroLimit > 0 && heroUsd >= heroLimit ? " accent" : "")}>{fmtUsd(heroUsd)}</span>
          </div>
          <div className="uhd-tile">
            <span className="uhd-tk">{t("keyUsage.colCalls")}</span>
            <span className="uhd-tv">{fmtInt(heroCalls)}</span>
          </div>
          <div className="uhd-tile">
            <span className="uhd-tk">{t("keyUsage.mobile.limit")}</span>
            <span className="uhd-tv">{heroLimit > 0 ? fmtUsd(heroLimit) : t("keyUsage.mobile.noLimit")}</span>
          </div>
        </div>
        {heroLimit > 0 && (
          <>
            <div className={"uhd-bar" + (heroUsd >= heroLimit ? " over" : "")}>
              <span style={{ width: Math.min(100, heroPct) + "%" }} />
            </div>
            <div className="uhd-barcap">
              <span>{fmtUsd(heroUsd)} / {fmtUsd(heroLimit)}</span>
              <span className={heroUsd >= heroLimit ? "over" : ""}>{Math.round(heroPct)}%</span>
            </div>
          </>
        )}
      </div>

      <div className="card table-wrap">
        {!hasUsage && <div className="muted keyusage-empty">{t("keyUsage.empty")}</div>}
        <table>
          <thead>
            <tr>
              <th>{t("keyUsage.colAlias")}</th>
              <th>{t("keyUsage.colBillingMode")}</th>
              <th>{t("keyUsage.colProvider")}</th>
              <th className="num">{t("keyUsage.colUsd")}</th>
              <th className="num">{t("keyUsage.colCalls")}</th>
              <th className="num">{t("keyUsage.colInput")}</th>
              <th className="num">{t("keyUsage.colOutput")}</th>
              <th className="num">{t("keyUsage.colCache")}</th>
              <th className="num">{t("keyUsage.colHitRate")}</th>
            </tr>
          </thead>
          <tbody>
            {aliases.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted keyusage-noalias">
                  {t("keyUsage.noAlias")}
                </td>
              </tr>
            ) : (
              aliases.map((a) => {
                const w = windowOf(a);
                return (
                  <tr key={a.alias} className={a.in_config ? "" : "keyusage-residual"}>
                    <td>
                      <div className="mono">{a.alias}</div>
                      {!a.in_config && <span className="keyusage-badge">{t("keyUsage.notInConfig")}</span>}
                    </td>
                    <td>
                      <BillingTag mode={a.billing_mode} />
                    </td>
                    <td className="muted">{a.provider || "—"}</td>
                    <td className="num strong">{fmtUsd(w.total_usd ?? 0)}</td>
                    <td className="num mono">{fmtInt(w.call_count ?? 0)}</td>
                    <td className="num mono">{fmtInt(w.input_tokens ?? 0)}</td>
                    <td className="num mono">{fmtInt(w.output_tokens ?? 0)}</td>
                    <td className="num mono">{fmtInt(w.cache_read_tokens ?? 0)}</td>
                    <td className="num mono">{hitRate(w)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: hero card + horizontal bar ranking */}
      <div className="mobile-only">
        <div className="usage-hero">
          <div className="uh-label">{windowLabel}</div>
          <div className="uh-amount">{fmtUsd(heroUsd)}</div>
          <div className="uh-row">
            <div className="uh-ring">
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="26" fill="none" stroke="var(--muted-bg)" strokeWidth="6" />
                <circle cx="32" cy="32" r="26" fill="none" stroke="var(--accent)" strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(heroPct / 100) * 163.36} 163.36`} />
              </svg>
              <span className="uh-pct">{Math.round(heroPct)}%</span>
            </div>
            <div className="uh-limits">
              <div><span className="uh-lk">{t("keyUsage.mobile.limit")}</span> <span className="uh-lv">{heroLimit > 0 ? fmtUsd(heroLimit) : t("keyUsage.mobile.noLimit")}</span></div>
              <div><span className="uh-lk">{t("keyUsage.mobile.remaining")}</span> <span className="uh-lv">{heroLimit > 0 ? fmtUsd(Math.max(0, heroLimit - heroUsd)) : "—"}</span></div>
            </div>
          </div>
          <div className="uh-stats">
            <span>{t("keyUsage.mobile.calls")} {fmtInt(heroCalls)}</span>
            <span>{t("keyUsage.mobile.inputTok")} {fmtInt(heroInput)}</span>
            <span>{t("keyUsage.mobile.outputTok")} {fmtInt(heroOutput)}</span>
          </div>
        </div>

        <div className="section-label">{t("keyUsage.mobile.byAlias")}</div>
        <div className="bar-rank">
          {aliases.length === 0 ? (
            <div className="muted">{t("keyUsage.noAlias")}</div>
          ) : aliases.map((a) => {
            const w = windowOf(a);
            const usd = w.total_usd ?? 0;
            const w2 = Math.max(2, (usd / maxAliasUsd) * 100);
            const perCall = a.billing_mode === "per_call";
            return (
              <div key={a.alias} className={"br-row" + (a.in_config ? "" : " br-residual")}>
                <div className="br-top">
                  <span className="br-name">{a.alias}{!a.in_config && <span className="br-badge">!</span>}</span>
                  <span className="br-usd">{fmtUsd(usd)}</span>
                </div>
                <div className="br-bar"><span style={{ width: w2 + "%" }} /></div>
                <div className="br-cap">
                  {a.provider || "—"} · {perCall ? t("keyUsage.billingPerCall") : t("keyUsage.billingTokens")} · {t("keys.mobile.callCount", { n: fmtInt(w.call_count ?? 0) })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <MobileTabBar
        active="usage"
        showUsage
        usagePath={`/keys/${encodeURIComponent(data.key_id)}/usage`}
      />
    </div>
  );
}
