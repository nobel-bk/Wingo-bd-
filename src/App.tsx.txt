import { useEffect, useState } from "react";
import { getSession, clearSession, type Session } from "./lib/auth";
import { LoginPage } from "./components/LoginPage";
import { AdminPanel } from "./components/AdminPanel";
import { SignalDashboard } from "./components/SignalDashboard";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => getSession());

  // Periodic expiry check every 60 seconds
  useEffect(() => {
    const check = () => {
      const s = getSession();
      if (!s) {
        setSession(null);
      } else if (s.type === "user" && s.expiresAt && Date.now() > s.expiresAt) {
        clearSession();
        setSession(null);
      }
    };
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  const handleLogin = (_role: "admin" | "user") => {
    setSession(getSession());
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  if (!session) return <LoginPage onLogin={handleLogin} />;
  if (session.type === "admin") return <AdminPanel onLogout={handleLogout} />;
  return <SignalDashboard onLock={handleLogout} />;
}
