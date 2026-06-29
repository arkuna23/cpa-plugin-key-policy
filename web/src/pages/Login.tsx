import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setSession, verifySession } from "../store/session";
import { isEmbedded } from "../store/panelAuth";

export default function Login() {
  const nav = useNavigate();
  // Default to the current page origin: when the UI is hosted by CPA at
  // /v0/resource/plugins/cpa-key-policy/index.html, the API is on the same
  // origin, so same-origin requests avoid CORS and hit the right host:port.
  // In standalone dev (vite), origin is the dev server, which the vite proxy
  // forwards to CPA — still correct.
  const [baseUrl, setBaseUrl] = useState(
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8317",
  );
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!secretKey.trim()) {
      setError("请填写 management key");
      return;
    }
    setBusy(true);
    try {
      setSession(baseUrl, secretKey);
      await verifySession(fetch);
      nav("/keys");
    } catch (err) {
      setError((err as Error).message || "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>cpa-key-policy 管理面板</h1>
          <div className="sub">登录到 CLIProxyAPI</div>
        </div>
      </div>
      <form className="card" onSubmit={submit} style={{ maxWidth: 460 }}>
        <div className="form-row">
          <label>CPA 地址 (Base URL)</label>
          <input
            className="input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:8317"
            autoFocus
          />
        </div>
        <div className="form-row">
          <label>Management Key (CPA secret-key)</label>
          <input
            className="input"
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="remote-management.secret-key"
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "校验中…" : "登录"}
        </button>
        <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          key 仅存在内存中，关闭/刷新页面即失效，不会写入本地存储。
        </div>
        {isEmbedded() && (
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            未从面板读取到已保存的 management key（可能未勾选“记住密码”），请手动输入。
          </div>
        )}
      </form>
    </div>
  );
}
