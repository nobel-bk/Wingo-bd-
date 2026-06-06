import { useEffect, useState } from "react";
import { getSession, clearSession, type Session } from "./lib/auth";
import { LoginPage } from "./components/LoginPage";
import { AdminPanel } from "./components/AdminPanel";
import { SignalDashboard } from "./components/SignalDashboard";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => getSession());

  useEffect(() => {
    // Check if user session expired
    if (session?.type === "user" && session.expiresAt && Date.now() > session.expiresAt) {
      clearSession();
      setSession(null);
    }
  }, [session]);

  const handleLogin = (role: "admin" | "user") => {
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
