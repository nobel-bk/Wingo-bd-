import { useState } from "react";
import {
  getUsers, createUser, deleteUser, toggleUser, extendUser,
  getAdminPassword, setAdminPassword, clearSession,
  type User,
} from "../lib/auth";

const PLAN_LABELS = { daily:"Daily (1 দিন)", weekly:"Weekly (7 দিন)", monthly:"Monthly (30 দিন)" };

function timeLeft(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return "EXPIRED";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmt(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

const S = {
  card: { borderRadius:"2px", border:"1px solid oklch(0.82 0.24 145 / 0.4)", background:"oklch(0.16 0.025 150 / 0.8)", padding:"1.25rem" } as React.CSSProperties,
  label: { fontSize:"10px", letterSpacing:"0.2em", color:"var(--muted-foreground)" } as React.CSSProperties,
  input: { width:"100%", borderRadius:"2px", border:"1px solid oklch(0.82 0.24 145 / 0.4)", background:"oklch(0.13 0.02 150 / 0.6)", padding:"0.5rem 0.75rem", fontFamily:"inherit", color:"var(--primary)", outline:"none", fontSize:"13px" } as React.CSSProperties,
  btn: (color: string) => ({ borderRadius:"2px", border:`1px solid ${color}`, background:"transparent", color, padding:"0.3rem 0.6rem", fontSize:"10px", letterSpacing:"0.1em", cursor:"pointer", fontFamily:"inherit", fontWeight:700 }) as React.CSSProperties,
};

export function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [users, setUsers]       = useState<User[]>(() => getUsers());
  const [tab, setTab]           = useState<"users"|"settings">("users");
  const [newUsername, setNewUsername] = useState("");
  const [newPlan, setNewPlan]   = useState<User["plan"]>("monthly");
  const [copied, setCopied]     = useState<string|null>(null);

  // Settings state
  const [curPass, setCurPass]   = useState("");
  const [newPass, setNewPass]   = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passMsg, setPassMsg]   = useState<{ok:boolean; text:string}|null>(null);

  const refresh = () => setUsers(getUsers());

  const handleCreate = () => {
    if (!newUsername.trim()) return;
    createUser(newUsername.trim(), newPlan);
    setNewUsername("");
    refresh();
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleChangePass = () => {
    if (curPass !== getAdminPassword()) {
      setPassMsg({ ok:false, text:"বর্তমান পাসওয়ার্ড ভুল" }); return;
    }
    if (newPass.length < 6) {
      setPassMsg({ ok:false, text:"নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষর" }); return;
    }
    if (newPass !== confirmPass) {
      setPassMsg({ ok:false, text:"পাসওয়ার্ড মিলছে না" }); return;
    }
    setAdminPassword(newPass);
    setCurPass(""); setNewPass(""); setConfirmPass("");
    setPassMsg({ ok:true, text:"পাসওয়ার্ড পরিবর্তন হয়েছে ✓" });
    setTimeout(() => setPassMsg(null), 3000);
  };

  const handleLogout = () => { clearSession(); onLogout(); };

  return (
    <div style={{ minHeight:"100vh", padding:"1rem" }}>
      <div className="scanline" />
      <div style={{ maxWidth:"900px", margin:"0 auto", display:"flex", flexDirection:"column", gap:"1rem" }}>

        {/* Header */}
        <header className="frame-corners" style={S.card}>
          <span className="corner-tl"/><span className="corner-br"/>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <h1 className="text-glow" style={{ fontSize:"1.25rem", fontWeight:700, letterSpacing:"0.25em", color:"var(--primary)" }}>ADMIN PANEL</h1>
              <p style={{ fontSize:"10px", letterSpacing:"0.2em", color:"var(--muted-foreground)" }}>SIGNAL HUB — USER MANAGEMENT</p>
            </div>
            <button onClick={handleLogout} style={S.btn("oklch(0.65 0.27 25)")}>⏻ LOGOUT</button>
          </div>
        </header>

        {/* Tabs */}
        <div style={{ display:"flex", gap:"0.5rem" }}>
          {(["users","settings"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={tab===t ? "text-glow box-glow" : ""}
              style={{ borderRadius:"2px", padding:"0.5rem 1.25rem", fontSize:"11px", fontWeight:700, letterSpacing:"0.2em", cursor:"pointer", fontFamily:"inherit", border: tab===t ? "1px solid var(--primary)" : "1px solid oklch(0.82 0.24 145 / 0.3)", background: tab===t ? "oklch(0.82 0.24 145 / 0.15)" : "transparent", color: tab===t ? "var(--primary)" : "oklch(0.82 0.24 145 / 0.6)" }}>
              {t === "users" ? "👥 USERS" : "⚙ SETTINGS"}
            </button>
          ))}
        </div>

        {tab === "users" && <>
          {/* Create user */}
          <section style={S.card}>
            <p className="text-glow" style={{ fontSize:"11px", letterSpacing:"0.2em", color:"var(--primary)", marginBottom:"1rem" }}>▸ NEW USER CREATE</p>
            <div style={{ display:"flex", gap:"0.75rem", flexWrap:"wrap" }}>
              <div style={{ flex:"1", minWidth:"150px" }}>
                <p style={S.label}>USERNAME</p>
                <input style={{ ...S.input, marginTop:"0.25rem" }} value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="username..." onKeyDown={e => e.key==="Enter" && handleCreate()} />
              </div>
              <div style={{ minWidth:"160px" }}>
                <p style={S.label}>PLAN</p>
                <select style={{ ...S.input, marginTop:"0.25rem" }} value={newPlan} onChange={e => setNewPlan(e.target.value as User["plan"])}>
                  <option value="daily">Daily (1 দিন)</option>
                  <option value="weekly">Weekly (7 দিন)</option>
                  <option value="monthly">Monthly (30 দিন)</option>
                </select>
              </div>
              <div style={{ display:"flex", alignItems:"flex-end" }}>
                <button onClick={handleCreate} className="box-glow text-glow"
                  style={{ borderRadius:"2px", border:"1px solid var(--primary)", background:"oklch(0.82 0.24 145 / 0.1)", padding:"0.5rem 1.25rem", fontSize:"11px", fontWeight:700, letterSpacing:"0.2em", color:"var(--primary)", cursor:"pointer", fontFamily:"inherit" }}>
                  ＋ CREATE
                </button>
              </div>
            </div>
          </section>

          {/* Users list */}
          <section style={S.card}>
            <p className="text-glow" style={{ fontSize:"11px", letterSpacing:"0.2em", color:"var(--primary)", marginBottom:"1rem" }}>▸ USERS ({users.length})</p>
            {users.length === 0 ? (
              <p style={{ textAlign:"center", color:"var(--muted-foreground)", fontSize:"12px", padding:"2rem 0" }}>কোনো user নেই</p>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
                {users.map((u) => {
                  const expired = Date.now() > u.expiresAt;
                  return (
                    <div key={u.id} style={{ borderRadius:"2px", border:`1px solid ${!u.active ? "oklch(0.65 0.27 25 / 0.4)" : expired ? "oklch(0.65 0.27 25 / 0.6)" : "oklch(0.82 0.24 145 / 0.3)"}`, background:"oklch(0.13 0.02 150 / 0.5)", padding:"0.75rem" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:"0.5rem" }}>
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
                            <span style={{ fontSize:"13px", fontWeight:700, color:"var(--primary)" }}>{u.username}</span>
                            <span style={{ fontSize:"9px", padding:"2px 6px", borderRadius:"2px", fontWeight:700, letterSpacing:"0.1em",
                              background: !u.active ? "oklch(0.65 0.27 25 / 0.2)" : expired ? "oklch(0.65 0.27 25 / 0.2)" : "oklch(0.82 0.24 145 / 0.15)",
                              color: !u.active ? "var(--destructive)" : expired ? "var(--destructive)" : "var(--signal-green)" }}>
                              {!u.active ? "DISABLED" : expired ? "EXPIRED" : "ACTIVE"}
                            </span>
                            <span style={{ fontSize:"9px", color:"var(--muted-foreground)", letterSpacing:"0.1em" }}>{PLAN_LABELS[u.plan]}</span>
                          </div>
                          <p style={{ fontSize:"10px", color:"var(--muted-foreground)", marginTop:"0.25rem" }}>
                            Expires: {fmt(u.expiresAt)} &nbsp;|&nbsp; <span style={{ color: expired ? "var(--destructive)" : "var(--signal-green)" }}>{timeLeft(u.expiresAt)}</span>
                          </p>
                        </div>
                        <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap" }}>
                          <button onClick={() => handleCopy(u.code)} style={S.btn(copied===u.code ? "var(--signal-green)" : "var(--primary)")}>
                            {copied===u.code ? "✓ COPIED" : "📋 CODE"}
                          </button>
                          <select onChange={e => { if(!e.target.value) return; extendUser(u.id, e.target.value as User["plan"]); refresh(); e.target.value=""; }}
                            style={{ ...S.btn("oklch(0.7 0.22 195)"), paddingRight:"0.5rem" }} defaultValue="">
                            <option value="" disabled>↑ EXTEND</option>
                            <option value="daily">+1 Day</option>
                            <option value="weekly">+7 Days</option>
                            <option value="monthly">+30 Days</option>
                          </select>
                          <button onClick={() => { toggleUser(u.id); refresh(); }} style={S.btn(u.active ? "oklch(0.65 0.27 25)" : "var(--signal-green)")}>
                            {u.active ? "⏸ DISABLE" : "▶ ENABLE"}
                          </button>
                          <button onClick={() => { if(confirm(`"${u.username}" delete করবেন?`)) { deleteUser(u.id); refresh(); } }} style={S.btn("oklch(0.65 0.27 25)")}>
                            🗑 DEL
                          </button>
                        </div>
                      </div>
                      {/* Code display */}
                      <div style={{ marginTop:"0.5rem", background:"oklch(0.13 0.02 150 / 0.8)", borderRadius:"2px", padding:"0.4rem 0.6rem", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"0.5rem" }}>
                        <code style={{ fontSize:"11px", color:"oklch(0.82 0.24 145 / 0.7)", wordBreak:"break-all", flex:1 }}>{u.code}</code>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>}

        {tab === "settings" && (
          <section style={S.card}>
            <p className="text-glow" style={{ fontSize:"11px", letterSpacing:"0.2em", color:"var(--primary)", marginBottom:"1.25rem" }}>▸ ADMIN PASSWORD পরিবর্তন</p>
            <div style={{ maxWidth:"400px", display:"flex", flexDirection:"column", gap:"0.75rem" }}>
              {[
                { label:"বর্তমান পাসওয়ার্ড", val:curPass, set:setCurPass },
                { label:"নতুন পাসওয়ার্ড",   val:newPass, set:setNewPass },
                { label:"নতুন পাসওয়ার্ড (confirm)", val:confirmPass, set:setConfirmPass },
              ].map((f) => (
                <div key={f.label}>
                  <p style={S.label}>{f.label.toUpperCase()}</p>
                  <input type="password" value={f.val} onChange={e => f.set(e.target.value)} style={{ ...S.input, marginTop:"0.25rem" }} placeholder="••••••••" />
                </div>
              ))}
              <button onClick={handleChangePass} className="box-glow text-glow"
                style={{ borderRadius:"2px", border:"1px solid var(--primary)", background:"oklch(0.82 0.24 145 / 0.1)", padding:"0.6rem 1.25rem", fontSize:"11px", fontWeight:700, letterSpacing:"0.2em", color:"var(--primary)", cursor:"pointer", fontFamily:"inherit", marginTop:"0.25rem" }}>
                ✓ PASSWORD SAVE
              </button>
              {passMsg && (
                <p style={{ fontSize:"12px", fontWeight:700, color: passMsg.ok ? "var(--signal-green)" : "var(--destructive)" }}>{passMsg.text}</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
