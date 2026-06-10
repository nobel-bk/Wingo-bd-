import { useState, useEffect } from "react";
import type { Session } from "../lib/auth";

interface Props {
  session: Session;
}

function timeLeft(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return "Expired";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export function FloatingBar({ session }: Props) {
  const [visible, setVisible]     = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [pulse, setPulse]         = useState(true);

  useEffect(() => {
    // Slide in after a short delay
    const t = setTimeout(() => setVisible(true), 1200);
    // Stop pulsing after 4s
    const t2 = setTimeout(() => setPulse(false), 4000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  if (dismissed) return null;

  const expiry = session.expiresAt ? timeLeft(session.expiresAt) : null;
  const isExpiringSoon = session.expiresAt ? (session.expiresAt - Date.now()) < 2 * 24 * 60 * 60 * 1000 : false;

  return (
    <>
      {/* Backdrop (when expanded) */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,0.4)",
            zIndex:998, backdropFilter:"blur(4px)",
          }}
        />
      )}

      {/* Floating Bar */}
      <div style={{
        position: "fixed",
        bottom: visible ? (expanded ? "50%" : "1.25rem") : "-120px",
        left: expanded ? "50%" : "50%",
        transform: expanded ? "translate(-50%, 50%)" : "translateX(-50%)",
        zIndex: 999,
        width: expanded ? "min(420px, 92vw)" : "min(380px, 92vw)",
        transition: "all 0.45s cubic-bezier(0.34, 1.2, 0.64, 1)",
      }}>

        {/* Expanded Card */}
        {expanded && (
          <div style={{
            background:"rgba(15,18,41,0.97)", border:"1.5px solid rgba(91,94,244,0.3)",
            borderRadius:20, padding:"1.5rem", marginBottom:"0.75rem",
            backdropFilter:"blur(20px)",
            boxShadow:"0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(91,94,244,0.1)",
            animation:"slideUp 0.3s ease",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.25rem" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
                <div style={{
                  width:32, height:32, borderRadius:10,
                  background:"linear-gradient(135deg, #5b5ef4, #0dc5c1)",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:16,
                }}>⚡</div>
                <span style={{ fontSize:15, fontWeight:800, color:"#fff" }}>Signal Hub</span>
              </div>
              <button onClick={() => setExpanded(false)} style={{
                background:"rgba(255,255,255,0.08)", border:"none", color:"rgba(255,255,255,0.5)",
                width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:14,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>✕</button>
            </div>

            {/* User info */}
            <div style={{
              background:"rgba(91,94,244,0.1)", border:"1px solid rgba(91,94,244,0.2)",
              borderRadius:12, padding:"0.85rem 1rem", marginBottom:"0.85rem",
              display:"flex", justifyContent:"space-between", alignItems:"center",
            }}>
              <div>
                <p style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600, textTransform:"uppercase" }}>Logged in as</p>
                <p style={{ fontSize:15, fontWeight:800, color:"#fff", marginTop:2 }}>👤 {session.username}</p>
              </div>
              <div style={{ textAlign:"right" }}>
                <p style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600, textTransform:"uppercase" }}>License</p>
                <p style={{ fontSize:13, fontWeight:700, color: isExpiringSoon ? "#f59e0b" : "#22c55e", marginTop:2 }}>
                  {isExpiringSoon ? "⚠️ " : "✅ "}{expiry}
                </p>
              </div>
            </div>

            {/* Quick links */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.6rem" }}>
              <a href="https://t.me/erorruk404" target="_blank" rel="noreferrer" style={{
                display:"flex", alignItems:"center", gap:"0.5rem",
                background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:12, padding:"0.75rem", textDecoration:"none",
                color:"rgba(255,255,255,0.75)", fontSize:13, fontWeight:600,
              }}>
                <span style={{ fontSize:18 }}>📨</span> Telegram
              </a>
              <div style={{
                display:"flex", alignItems:"center", gap:"0.5rem",
                background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.15)",
                borderRadius:12, padding:"0.75rem",
                color:"#22c55e", fontSize:13, fontWeight:600,
              }}>
                <span style={{ fontSize:18 }}>🟢</span> Live Signals
              </div>
            </div>
          </div>
        )}

        {/* Floating Pill Bar */}
        <div
          onClick={() => !expanded && setExpanded(true)}
          style={{
            background:"rgba(15,18,41,0.92)", backdropFilter:"blur(20px)",
            border:"1.5px solid rgba(91,94,244,0.35)",
            borderRadius: expanded ? 16 : 999,
            padding:"0.7rem 1rem",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            boxShadow:"0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(91,94,244,0.1), 0 0 20px rgba(91,94,244,0.15)",
            cursor: expanded ? "default" : "pointer",
            transition:"border-radius 0.3s ease",
          }}
        >
          {/* Left: live indicator + name */}
          <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
            <div style={{ position:"relative" }}>
              <div style={{
                width:8, height:8, borderRadius:"50%", background:"#22c55e",
              }} />
              {pulse && (
                <div style={{
                  position:"absolute", inset:-3, borderRadius:"50%",
                  border:"2px solid rgba(34,197,94,0.5)",
                  animation:"pingPulse 1.5s ease-out infinite",
                }} />
              )}
            </div>
            <span style={{ fontSize:13, fontWeight:700, color:"#fff" }}>Signal Hub</span>
            <span style={{
              fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.4)",
              background:"rgba(255,255,255,0.06)", borderRadius:6, padding:"2px 7px",
            }}>
              @{session.username}
            </span>
          </div>

          {/* Right: expiry + close */}
          <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
            {expiry && (
              <span style={{
                fontSize:11, fontWeight:700,
                color: isExpiringSoon ? "#f59e0b" : "#0dc5c1",
                background: isExpiringSoon ? "rgba(245,158,11,0.1)" : "rgba(13,197,193,0.1)",
                borderRadius:6, padding:"3px 8px",
              }}>
                {isExpiringSoon ? "⚠️ " : "⏰ "}{expiry}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
              style={{
                background:"rgba(255,255,255,0.07)", border:"none",
                color:"rgba(255,255,255,0.4)", width:24, height:24, borderRadius:"50%",
                cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center",
              }}
            >✕</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pingPulse {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
