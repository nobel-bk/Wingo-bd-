import { useEffect, useState } from "react";
import { PasswordGate } from "./components/PasswordGate";
import { SignalDashboard } from "./components/SignalDashboard";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("signal-hub-unlocked") === "1") setUnlocked(true);
    } catch {}
  }, []);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return (
    <SignalDashboard
      onLock={() => {
        try { localStorage.removeItem("signal-hub-unlocked"); } catch {}
        setUnlocked(false);
      }}
    />
  );
}
