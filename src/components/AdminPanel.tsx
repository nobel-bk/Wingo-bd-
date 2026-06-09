import { useState, useEffect } from "react";
import {
  getUsers, createUser, deleteUser, toggleUser, extendUser,
  getAdminPassword, setAdminPassword, clearSession,
  fetchUsersFromCloud, resetUserDevice,
  type User,
} from "../lib/auth";

const PLAN_LABELS = { daily: "Daily (24h)", weekly: "Weekly (7d)", monthly: "Monthly (30d)" };

function timeLeft(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return "Expired";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m left`;
}

function fmt(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function UserStatusBadge({ u }: { u: User }) {
  const expired = Date.now() > u.expiresAt;
  if (!u.active) return <span className="badge badge-violet">Suspended</span>;
  if (expired)   return <span className="badge badge-red">Expired</span>;
  return <span className="badge badge-green">Active</span>;
}

function generateRandomPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let p = "";
  for (let i = 0; i < 8; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
  return p;
}

export function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [users, setUsers]         = useState<User[]>(() => getUsers());
  const [tab, setTab]             = useState<"users" | "settings">("users");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState(() => generateRandomPassword());
  const [newPlan, setNewPlan]     = useState<User["plan"]>("monthly");
  const [copied, setCopied]       = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "expired" | "disabled">("all");
  const [logs, setLogs]           = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);
  const [errorMsg, setErrorMsg]   = useState("");

  const [curPass, setCurPass]     = useState("");
  const [newPass, setNewPass]     = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passMsg, setPassMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const time = () => new Date().toLocaleTimeString("en-GB");
    setLogs([
      `[${time()}] 📡 Signal Hub Admin Console booted`,
      `[${time()}] 🔒 Syncing cloud database…`,
    ]);
    fetchUsersFromCloud().then((cloudUsers) => {
      setUsers(cloudUsers);
      setLoading(false);
      setLogs((prev) => [`[${time()}] ✅ Synced ${cloudUsers.length} clients from cloud`, ...prev]);
    });
  }, []);

  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString("en-GB");
    setLogs((prev) => [`[${t}] ${msg}`, ...prev].slice(0, 20));
  };

  const refresh = () => setUsers(getUsers());

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setErrorMsg("");
    try {
      const user = await createUser(newUsername.trim(), newPassword.trim(), newPlan);
      setNewUsername("");
      setNewPassword(generateRandomPassword());
      refresh();
      addLog(`➕ Created account for "${user.username}" — ${user.plan} plan`);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to create user");
    }
  };

  const handleCopy = (pass: string, username: string) => {
    navigator.clipboard.writeText(pass).catch(() => {});
    setCopied(pass);
    setTimeout(() => setCopied(null), 2000);
    addLog(`📋 Copied password for "${username}"`);
  };

  const handleCopyShare = (u: User) => {
    const exp = new Date(u.expiresAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const pass = u.password || u.code;
    const text = `🚀 Signal Hub Premium License\n━━━━━━━━━━━━━━━━━━\n👤 Username: ${u.username}\n🔑 Password: ${pass}\n📅 Plan: ${PLAN_LABELS[u.plan]}\n⏰ Expires: ${exp}\n\n🔗 ${window.location.origin}\n━━━━━━━━━━━━━━━━━━`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedShare(u.id);
    setTimeout(() => setCopiedShare(null), 2000);
    addLog(`📤 Copied Telegram share card for "${u.username}"`);
  };

  const handleResetDevice = async (id: string, username: string) => {
    if (!confirm(`Reset device lock for "${username}"?`)) return;
    await resetUserDevice(id);
    refresh();
    addLog(`🔄 Reset device lock for "${username}"`);
  };

  const handleToggle = async (id: string, username: string, wasActive: boolean) => {
    await toggleUser(id);
    refresh();
    addLog(`${wasActive ? "⏸ Suspended" : "▶ Activated"} "${username}"`);
  };

  const handleExtend = async (id: string, username: string, plan: User["plan"]) => {
    await extendUser(id, plan);
    refresh();
    addLog(`⚡ Extended "${username}" → ${PLAN_LABELS[plan]}`);
  };

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Delete "${username}"?\nThis will permanently revoke their access.`)) return;
    await deleteUser(id);
    refresh();
    addLog(`🗑 Deleted license for "${username}"`);
  };

  const handleChangePass = () => {
    if (curPass !== getAdminPassword()) { setPassMsg({ ok: false, text: "Current password is incorrect" }); return; }
    if (newPass.length < 6)             { setPassMsg({ ok: false, text: "New password must be at least 6 characters" }); return; }
    if (newPass !== confirmPass)         { setPassMsg({ ok: false, text: "Passwords don't match" }); return; }
    setAdminPassword(newPass);
    setCurPass(""); setNewPass(""); setConfirmPass("");
    setPassMsg({ ok: true, text: "✓ Password changed successfully" });
    setTimeout(() => setPassMsg(null), 3000);
    addLog("🔑 Admin password updated");
  };

  const total    = users.length;
  const active   = users.filter(u => u.active && Date.now() <= u.expiresAt).length;
  const expired  = users.filter(u => Date.now() > u.expiresAt).length;
  const disabled = users.filter(u => !u.active).length;

  const filtered = users.filter((u) => {
    const match = u.username.toLowerCase().includes(search.toLowerCase());
    const exp   = Date.now() > u.expiresAt;
    if (filterStatus === "active")   return match && u.active && !exp;
    if (filterStatus === "expired")  return match && exp;
    if (filterStatus === "disabled") return match && !u.active;
    return match;
  });

  const stats = [
    { label: "Total Clients",    val: total,    color: "var(--primary)",  bg: "var(--primary-light)" },
    { label: "Active Licenses",  val: active,   color: "var(--green)",    bg: "var(--green-light)" },
    { label: "Expired Plans",    val: expired,  color: "var(--red)",      bg: "var(--red-light)" },
    { label: "Suspended",        val: disabled, color: "var(--violet)",   bg: "var(--violet-light)" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "1.5rem 1rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* ── HEADER ── */}
        <header className="glass-panel fade-up" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px var(--primary-glow)"
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
                Admin Console
              </h1>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 500 }}>Signal Hub — License Management</p>
            </div>
          </div>
          <button onClick={() => { clearSession(); onLogout(); }} className="pill-button"
            style={{ borderColor: "rgba(244,63,94,0.3)", color: "var(--red)" }}>
            🚪 Logout
          </button>
        </header>

        {/* ── STATS ── */}
        <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem", animationDelay: "0.05s" }}>
          {stats.map((s, i) => (
            <div key={i} className="glass-panel" style={{ padding: "1rem 1.25rem", borderLeft: `3px solid ${s.color}` }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{s.label}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <h2 className="mono-font" style={{ fontSize: "2rem", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</h2>
                <div style={{ flex: 1, height: 28, background: s.bg, borderRadius: 6, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 8px" }}>
                    <div style={{ height: 4, borderRadius: 99, background: s.color, width: `${total ? (s.val / total) * 100 : 0}%`, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── TABS ── */}
        <div className="fade-up" style={{ display: "flex", gap: "0.5rem", animationDelay: "0.1s" }}>
          {(["users", "settings"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`pill-button ${tab === t ? "active" : ""}`}
              style={{ borderRadius: 10, padding: "0.6rem 1.5rem" }}>
              {t === "users" ? "👥 User Directory" : "⚙️ Settings"}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <>
            {/* ── CREATE USER ── */}
            <section className="glass-panel fade-up" style={{ animationDelay: "0.12s" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: "1rem" }}>
                Create Client Account
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: errorMsg ? 12 : 0 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase" }}>Username</p>
                  <input
                    className="premium-input" value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="Enter unique username…"
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase" }}>Password</p>
                  <input
                    className="premium-input" value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter password…"
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div style={{ minWidth: 140 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase" }}>Plan</p>
                  <select className="premium-input" style={{ cursor: "pointer" }} value={newPlan}
                    onChange={e => setNewPlan(e.target.value as User["plan"])}>
                    <option value="daily">Daily (24h)</option>
                    <option value="weekly">Weekly (7 days)</option>
                    <option value="monthly">Monthly (30 days)</option>
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button onClick={handleCreate} className="pill-button active"
                    style={{ borderRadius: 10, padding: "0.85rem 1.5rem", border: "none", fontWeight: 800 }}>
                    + Create
                  </button>
                </div>
              </div>
              {errorMsg && (
                <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--red)", marginTop: 8 }}>
                  ⚠️ {errorMsg}
                </p>
              )}
            </section>

            {/* ── FILTER + SEARCH ── */}
            <div className="fade-up" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", animationDelay: "0.14s" }}>
              <input
                type="text" placeholder="🔍 Search clients…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="premium-input" style={{ maxWidth: 260, padding: "0.55rem 1rem" }}
              />
              <div style={{ display: "flex", gap: "0.35rem" }}>
                {(["all", "active", "expired", "disabled"] as const).map((s) => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`pill-button ${filterStatus === s ? "active" : ""}`}
                    style={{ borderRadius: 8, padding: "0.45rem 0.9rem", textTransform: "capitalize" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* ── USER LIST ── */}
            <section className="glass-panel fade-up" style={{ animationDelay: "0.16s" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1.5px solid var(--border)" }}>
                Clients ({filtered.length})
                {loading && <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: 8, fontWeight: 500 }}>Syncing…</span>}
              </p>

              {filtered.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "2.5rem 0", fontSize: 13 }}>
                  No clients found.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {filtered.map((u) => {
                    const exp = Date.now() > u.expiresAt;
                    const pass = u.password || u.code;
                    return (
                      <div key={u.id} style={{
                        borderRadius: 12,
                        border: "1.5px solid var(--border)",
                        background: "var(--surface-2)",
                        padding: "1rem 1.1rem",
                        transition: "box-shadow 0.2s ease",
                      }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = "var(--shadow-md)")}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
                          {/* Info */}
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{u.username}</span>
                              <UserStatusBadge u={u} />
                              <span className="badge badge-blue">{PLAN_LABELS[u.plan]}</span>
                              {u.deviceId ? (
                                <span className="badge badge-green" title={`Linked device ID: ${u.deviceId}`}>🟢 Locked</span>
                              ) : (
                                <span className="badge badge-cyan">⚪ Unlocked</span>
                              )}
                            </div>
                            <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 4 }}>
                              Expires {fmt(u.expiresAt)} ·{" "}
                              <span className="mono-font" style={{ fontWeight: 700, color: exp ? "var(--red)" : "var(--green)" }}>
                                {timeLeft(u.expiresAt)}
                              </span>
                            </p>
                            {/* License password chip */}
                            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8, background: "var(--primary-light)", borderRadius: 8, padding: "4px 10px", border: "1px solid rgba(91,94,244,0.15)" }}>
                              <span style={{ fontSize: 11, color: "var(--text-soft)", fontWeight: 700 }}>Pass:</span>
                              <code className="mono-font" style={{ fontSize: 13, color: "var(--primary)", fontWeight: 700 }}>{pass}</code>
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                            <button onClick={() => handleCopyShare(u)} className="pill-button"
                              style={{ borderRadius: 8, padding: "0.4rem 0.8rem", fontSize: 11,
                                color: copiedShare === u.id ? "var(--green)" : "var(--accent)" }}>
                              {copiedShare === u.id ? "✓ Copied" : "📤 Share"}
                            </button>
                            <button onClick={() => handleCopy(pass, u.username)} className="pill-button"
                              style={{ borderRadius: 8, padding: "0.4rem 0.8rem", fontSize: 11,
                                color: copied === pass ? "var(--green)" : "var(--primary)" }}>
                              {copied === pass ? "✓ Copied" : "🔑 Copy Pass"}
                            </button>
                            <select
                              onChange={e => { if (!e.target.value) return; handleExtend(u.id, u.username, e.target.value as User["plan"]); e.target.value = ""; }}
                              className="pill-button" defaultValue=""
                              style={{ borderRadius: 8, padding: "0.4rem 0.8rem", fontSize: 11, cursor: "pointer", outline: "none" }}>
                              <option value="" disabled>Extend</option>
                              <option value="daily">+1 Day</option>
                              <option value="weekly">+7 Days</option>
                              <option value="monthly">+30 Days</option>
                            </select>
                            <button onClick={() => handleResetDevice(u.id, u.username)} className="pill-button"
                              disabled={!u.deviceId}
                              style={{ borderRadius: 8, padding: "0.4rem 0.8rem", fontSize: 11,
                                color: u.deviceId ? "var(--amber)" : "var(--text-muted)",
                                borderColor: u.deviceId ? "rgba(245,158,11,0.3)" : "var(--border)",
                                opacity: u.deviceId ? 1 : 0.5 }}>
                              🔄 Reset Device
                            </button>
                            <button onClick={() => handleToggle(u.id, u.username, u.active)} className="pill-button"
                              style={{ borderRadius: 8, padding: "0.4rem 0.8rem", fontSize: 11,
                                color: u.active ? "var(--red)" : "var(--green)",
                                borderColor: u.active ? "rgba(244,63,94,0.3)" : "rgba(34,197,94,0.3)" }}>
                              {u.active ? "Suspend" : "Activate"}
                            </button>
                            <button onClick={() => handleDelete(u.id, u.username)} className="pill-button"
                              style={{ borderRadius: 8, padding: "0.4rem 0.8rem", fontSize: 11,
                                color: "var(--red)", borderColor: "rgba(244,63,94,0.3)" }}>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "settings" && (
          <section className="glass-panel fade-up" style={{ animationDelay: "0.1s", maxWidth: 480 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: "1.25rem" }}>
              Change Admin Password
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {[
                { label: "Current Password", val: curPass, set: setCurPass },
                { label: "New Password",     val: newPass, set: setNewPass },
                { label: "Confirm Password", val: confirmPass, set: setConfirmPass },
              ].map((f, i) => (
                <div key={i}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase" }}>{f.label}</p>
                  <input type="password" value={f.val} onChange={e => f.set(e.target.value)} className="premium-input" />
                </div>
              ))}
              <button onClick={handleChangePass} className="pill-button active"
                style={{ borderRadius: 10, padding: "0.85rem", border: "none", fontWeight: 800 }}>
                Save Password
              </button>
              {passMsg && (
                <p style={{ fontSize: 12.5, fontWeight: 600, color: passMsg.ok ? "var(--green)" : "var(--red)" }}>
                  {passMsg.text}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── AUDIT LOG ── */}
        <section className="glass-panel fade-up" style={{ animationDelay: "0.2s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>🖥 Activity Log</p>
            <span className="status-indicator">● live</span>
          </div>
          <div style={{
            background: "#1a1f3c", borderRadius: 10, padding: "0.85rem 1rem",
            height: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.35rem",
          }}>
            {logs.map((log, i) => (
              <div key={i} className="mono-font" style={{
                fontSize: 11.5, lineHeight: "1.4",
                color: log.includes("✅") || log.includes("▶") ? "#22c55e" :
                       log.includes("🗑") || log.includes("⏸") ? "#f43f5e" :
                       log.includes("⚡") || log.includes("➕") ? "#0dc5c1" : "#8890b5",
              }}>
                {log}
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
