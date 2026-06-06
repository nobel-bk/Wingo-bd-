import { useState, type FormEvent } from "react";

const ACCESS_CODE = "Test123ai";

export function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pw.trim() === ACCESS_CODE) {
      try { localStorage.setItem("signal-hub-unlocked", "1"); } catch {}
      onUnlock();
    } else {
      setErr("ACCESS DENIED — INVALID CODE");
      setTimeout(() => setErr(""), 2500);
    }
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", alignItems:"center", justifyContent:"center", padding:"0 1rem" }}>
      <div className="scanline" />
      <div className="frame-corners box-glow" style={{
        width:"100%", maxWidth:"448px", borderRadius:"2px",
        border:"1px solid oklch(0.82 0.24 145 / 0.6)",
        background:"oklch(0.16 0.025 150 / 0.8)", padding:"2rem",
        backdropFilter:"blur(8px)"
      }}>
        <span className="corner-tl" /><span className="corner-br" />
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.25rem" }}>
          <Hexagon />
          <h1 className="text-glow" style={{ marginTop:"0.75rem", fontSize:"1.875rem", fontWeight:700, letterSpacing:"0.2em", color:"var(--primary)" }}>
            SIGNAL HUB
          </h1>
          <p style={{ fontSize:"10px", letterSpacing:"0.4em", color:"var(--muted-foreground)" }}>
            PREDICTION SYSTEM &nbsp;v2.0
          </p>
        </div>

        <form onSubmit={submit} style={{ marginTop:"2rem", display:"flex", flexDirection:"column", gap:"1rem" }}>
          <label style={{ display:"block" }}>
            <span style={{ fontSize:"10px", letterSpacing:"0.3em", color:"oklch(0.82 0.24 145 / 0.8)" }}>▸ ACCESS CODE</span>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Enter password..."
              autoFocus
              style={{
                marginTop:"0.5rem", width:"100%", borderRadius:"2px",
                border:"1px solid oklch(0.82 0.24 145 / 0.4)",
                background:"oklch(0.13 0.02 150 / 0.6)",
                padding:"0.75rem", fontFamily:"inherit", letterSpacing:"0.1em",
                color:"var(--primary)", outline:"none",
              }}
            />
          </label>
          <button
            type="submit"
            className="box-glow text-glow"
            style={{
              width:"100%", borderRadius:"2px",
              border:"1px solid var(--primary)",
              background:"oklch(0.82 0.24 145 / 0.1)",
              padding:"0.75rem", fontSize:"0.875rem",
              fontWeight:700, letterSpacing:"0.3em",
              color:"var(--primary)", cursor:"pointer",
              fontFamily:"inherit",
            }}
          >
            ▶ INITIALIZE ACCESS
          </button>
          {err && (
            <p className="animate-blink" style={{ textAlign:"center", fontSize:"12px", letterSpacing:"0.1em", color:"var(--destructive)" }}>{err}</p>
          )}
        </form>

        <div style={{ marginTop:"2rem", borderTop:"1px solid oklch(0.82 0.24 145 / 0.2)", paddingTop:"1rem", textAlign:"center" }}>
          <p style={{ fontSize:"10px", letterSpacing:"0.1em", color:"var(--muted-foreground)" }}>
            পাসওয়ার্ড পেতে Telegram এ মেসেজ করুন
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

function Hexagon() {
  return (
    <svg width="40" height="44" viewBox="0 0 40 44" style={{ color:"var(--primary)" }}>
      <polygon points="20,2 38,12 38,32 20,42 2,32 2,12" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
