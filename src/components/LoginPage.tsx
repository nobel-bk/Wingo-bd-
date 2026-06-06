import { useState, type FormEvent } from "react";
import { login } from "../lib/auth";

export function LoginPage({ onLogin }: { onLogin: (role: "admin" | "user") => void }) {
  const [code, setCode] = useState("");
  const [err, setErr]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const result = login(code.trim());
      setLoading(false);
      if (result.ok) {
        onLogin(result.role);
      } else {
        const msg =
          result.reason === "expired"  ? "⚠ SUBSCRIPTION EXPIRED" :
          result.reason === "disabled" ? "⚠ ACCOUNT DISABLED"     :
          "✗ INVALID CODE";
        setErr(msg);
        setTimeout(() => setErr(""), 3000);
      }
    }, 400);
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
      <div className="scanline" />
      <div className="frame-corners box-glow" style={{
        width:"100%", maxWidth:"420px", borderRadius:"2px",
        border:"1px solid oklch(0.82 0.24 145 / 0.6)",
        background:"oklch(0.16 0.025 150 / 0.85)", padding:"2rem",
        backdropFilter:"blur(8px)",
      }}>
        <span className="corner-tl" /><span className="corner-br" />

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <svg width="40" height="44" viewBox="0 0 40 44" style={{ color:"var(--primary)", margin:"0 auto" }}>
            <polygon points="20,2 38,12 38,32 20,42 2,32 2,12" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <h1 className="text-glow" style={{ marginTop:"0.75rem", fontSize:"1.75rem", fontWeight:700, letterSpacing:"0.2em", color:"var(--primary)" }}>
            SIGNAL HUB
          </h1>
          <p style={{ fontSize:"10px", letterSpacing:"0.4em", color:"var(--muted-foreground)", marginTop:"0.25rem" }}>
            PREDICTION SYSTEM v2.0
          </p>
        </div>

        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          <label style={{ display:"block" }}>
            <span style={{ fontSize:"10px", letterSpacing:"0.3em", color:"oklch(0.82 0.24 145 / 0.8)" }}>▸ ACCESS CODE / PASSWORD</span>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter your code..."
              autoFocus
              style={{
                marginTop:"0.5rem", width:"100%", borderRadius:"2px",
                border:"1px solid oklch(0.82 0.24 145 / 0.4)",
                background:"oklch(0.13 0.02 150 / 0.6)",
                padding:"0.75rem", fontFamily:"inherit",
                letterSpacing:"0.05em", color:"var(--primary)", outline:"none",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className={loading ? "" : "box-glow text-glow"}
            style={{
              width:"100%", borderRadius:"2px",
              border:"1px solid var(--primary)",
              background: loading ? "oklch(0.82 0.24 145 / 0.05)" : "oklch(0.82 0.24 145 / 0.1)",
              padding:"0.75rem", fontSize:"0.875rem",
              fontWeight:700, letterSpacing:"0.3em",
              color: loading ? "oklch(0.82 0.24 145 / 0.4)" : "var(--primary)",
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily:"inherit", transition:"all 0.2s",
            }}
          >
            {loading ? "▷ VERIFYING..." : "▶ INITIALIZE ACCESS"}
          </button>

          {err && (
            <p className="animate-blink" style={{ textAlign:"center", fontSize:"11px", letterSpacing:"0.1em", color:"var(--destructive)", fontWeight:700 }}>
              {err}
            </p>
          )}
        </form>

        <div style={{ marginTop:"2rem", borderTop:"1px solid oklch(0.82 0.24 145 / 0.2)", paddingTop:"1rem", textAlign:"center" }}>
          <p style={{ fontSize:"10px", letterSpacing:"0.1em", color:"var(--muted-foreground)" }}>
            কোড পেতে Telegram এ মেসেজ করুন
          </p>
          <a href="https://t.me/erorruk404" target="_blank" rel="noreferrer"
            style={{ marginTop:"0.5rem", display:"inline-flex", alignItems:"center", gap:"0.5rem", fontSize:"12px", fontWeight:600, letterSpacing:"0.1em", color:"var(--primary)" }}>
            📨 @ERORRUK404
          </a>
        </div>
      </div>
    </div>
  );
}
