import { useState, type FormEvent } from "react";
import { login, getLocalDeviceId } from "../lib/auth";

export function LoginPage({ onLogin }: { onLogin: (role: "admin" | "user") => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr]       = useState("");
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [shake, setShake]   = useState(false);

  const steps = [
    "⚡ Authenticating access code…",
    "🔒 Verifying license key…",
    "🧬 Linking prediction engine…",
    "🛰️ Establishing live feed…",
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setLoadStep(0);
    setErr("");

    const deviceId = getLocalDeviceId();

    const iv = setInterval(() => {
      setLoadStep((prev) => {
        if (prev < steps.length - 1) return prev + 1;
        clearInterval(iv);
        login(username.trim(), password.trim(), deviceId).then((result) => {
          setLoading(false);
          if (result.ok) {
            onLogin(result.role);
          } else {
            setShake(true);
            setErr(
              result.reason === "expired"  ? "⏰ Access license has expired" :
              result.reason === "disabled" ? "🚫 License suspended by admin" :
              result.reason === "device_locked" ? "🚫 Locked: Registered on another device" :
              "❌ Invalid Username or Password"
            );
            setTimeout(() => setShake(false), 500);
          }
        });
        return prev;
      });
    }, 450);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      background: "var(--background)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient blobs */}
      <div style={{
        position: "absolute", top: "-100px", left: "-80px",
        width: 420, height: 420, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(91,94,244,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-60px", right: "-60px",
        width: 380, height: 380, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(13,197,193,0.1) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div
        className={`glass-panel fade-up ${shake ? "animate-shake" : ""}`}
        style={{
          width: "100%", maxWidth: 420,
          padding: "2.75rem 2.25rem",
          position: "relative", zIndex: 1,
          boxShadow: "0 20px 60px rgba(91,94,244,0.12), 0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2.25rem" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 64, height: 64, borderRadius: 18,
            background: "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
            boxShadow: "0 8px 24px var(--primary-glow)",
            marginBottom: "1.1rem",
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--foreground)", letterSpacing: "-0.03em", lineHeight: 1 }}>
            Signal Hub
          </h1>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6, fontWeight: 500 }}>
            Prediction Terminal v2.5
          </p>
        </div>

        {loading ? (
          /* ── Loading state ── */
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Connecting…
              </span>
              <div className="pulse-loader" style={{ color: "var(--primary)" }}>
                <span /><span /><span />
              </div>
            </div>

            <div style={{
              background: "var(--surface-2)", border: "1.5px solid var(--border)",
              borderRadius: 12, padding: "1.25rem",
              display: "flex", flexDirection: "column", gap: "0.65rem",
              minHeight: 140,
            }}>
              {steps.map((step, idx) => {
                const done    = loadStep > idx;
                const current = loadStep === idx;
                return (
                  <div key={idx} style={{
                    fontSize: 12, fontWeight: 500, display: "flex",
                    justifyContent: "space-between", alignItems: "center",
                    color: done ? "var(--green)" : current ? "var(--foreground)" : "var(--muted-foreground)",
                    opacity: done || current ? 1 : 0.45,
                    transition: "all 0.3s ease",
                  }}>
                    <span>{step}</span>
                    <span style={{ fontSize: 10, fontWeight: 700 }}>
                      {done ? "✓ Done" : current ? "⋯ Active" : "Pending"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div style={{ height: 5, borderRadius: 99, background: "var(--primary-light)", overflow: "hidden" }}>
              <div
                className="shimmer-bar"
                style={{ height: "100%", width: `${((loadStep + 1) / steps.length) * 100}%`, borderRadius: 99, transition: "width 0.4s ease" }}
              />
            </div>
          </div>
        ) : (
          /* ── Login form ── */
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground-soft)", letterSpacing: "0.04em", display: "block", marginBottom: 8 }}>
                USERNAME
              </label>
              <input
                id="login-username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username…"
                autoFocus
                autoComplete="off"
                className="premium-input"
                style={{ fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground-soft)", letterSpacing: "0.04em", display: "block", marginBottom: 8 }}>
                PASSWORD
              </label>
              <input
                id="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password…"
                autoComplete="off"
                className="premium-input mono-font"
                style={{ letterSpacing: "0.1em", fontSize: 14 }}
              />
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="pill-button active"
              style={{ width: "100%", padding: "0.95rem", fontSize: 13, fontWeight: 800, borderRadius: 10, border: "none" }}
            >
              Initialize Connection →
            </button>

            {err && (
              <div style={{
                textAlign: "center", fontSize: 12.5, fontWeight: 600,
                color: "var(--red)", padding: "0.75rem 1rem",
                background: "var(--red-light)",
                border: "1px solid rgba(244,63,94,0.2)",
                borderRadius: 10,
              }}>
                {err}
              </div>
            )}
          </form>
        )}

        {/* Footer */}
        <div style={{
          marginTop: "2.25rem",
          borderTop: "1.5px solid var(--border)",
          paddingTop: "1.5rem",
          textAlign: "center",
        }}>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Need a license key?</p>
          <a
            href="https://t.me/erorruk404"
            target="_blank"
            rel="noreferrer"
            style={{
              marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 700, color: "var(--primary)",
              textDecoration: "none", transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            📨 Telegram: @ERORRUK404
          </a>
        </div>
      </div>
    </div>
  );
}
