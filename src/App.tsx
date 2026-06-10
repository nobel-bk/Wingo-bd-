import { useState, useEffect } from "react";
import { getSession, clearSession, type Session } from "./lib/auth";
import { LoginPage }      from "./components/LoginPage";
import { AdminPanel }     from "./components/AdminPanel";
import { SignalDashboard } from "./components/SignalDashboard";
import { InstallPage }    from "./components/InstallPage";
import { FloatingBar }    from "./components/FloatingBar";

// ── Device detection helpers ──────────────────────────────────────────────────
function isMobileDevice(): boolean {
  return /android|iphone|ipad|ipod|mobile|tablet/i.test(navigator.userAgent);
}

function isPWAInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile]            = useState(isMobileDevice);
  const [isInstalled, setIsInstalled] = useState(isPWAInstalled);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Listen for display-mode change (user installs PWA mid-session)
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMQChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsInstalled(true);
    };
    mq.addEventListener("change", onMQChange);

    const activeSession = getSession();
    if (activeSession) setSession(activeSession);
    setLoading(false);

    return () => mq.removeEventListener("change", onMQChange);
  }, []);

  const handleLogin = () => {
    const activeSession = getSession();
    setSession(activeSession);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  const handleInstalled = () => {
    setIsInstalled(true);
  };

  // ── Loading spinner ──
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--background)", color: "var(--foreground)",
      }}>
        <div className="pulse-loader" style={{ color: "var(--primary)" }}>
          <span /><span /><span />
        </div>
      </div>
    );
  }

  // ── Mobile + NOT installed → force Install Page ──
  if (isMobile && !isInstalled) {
    return <InstallPage onInstalled={handleInstalled} />;
  }

  // ── Not logged in → Login ──
  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // ── Admin → Admin Panel ──
  if (session.type === "admin") {
    return <AdminPanel onLogout={handleLogout} />;
  }

  // ── User → Dashboard + Floating Bar (mobile app only) ──
  return (
    <>
      <SignalDashboard onLock={handleLogout} />
      {isMobile && isInstalled && <FloatingBar session={session} />}
    </>
  );
}
