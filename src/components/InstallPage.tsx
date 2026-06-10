import { useState, useEffect } from "react";

type InstallStep = "prompt" | "ios-guide" | "installing" | "done";

interface Props {
  onInstalled: () => void;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPage({ onInstalled }: Props) {
  const [step, setStep]           = useState<InstallStep>("prompt");
  const [deferredPrompt, setDeferred] = useState<any>(null);
  const [progress, setProgress]   = useState(0);
  const [particles, setParticles] = useState<{ x: number; y: number; color: string; size: number }[]>([]);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Catch Android install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler as any);

    // If already installed, skip
    if (window.matchMedia("(display-mode: standalone)").matches) {
      onInstalled();
    }

    return () => window.removeEventListener("beforeinstallprompt", handler as any);
  }, []);

  const launchConfetti = () => {
    const colors = ["#5b5ef4", "#0dc5c1", "#f43f5e", "#f59e0b", "#22c55e", "#fff"];
    const pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
    }));
    setParticles(pts);
    setTimeout(() => setParticles([]), 3000);
  };

  const runInstallAnimation = () => {
    setStep("installing");
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 18 + 5;
      if (p >= 100) {
        p = 100;
        clearInterval(iv);
        setProgress(100);
        setTimeout(() => {
          setStep("done");
          launchConfetti();
          setTimeout(onInstalled, 2800);
        }, 400);
      }
      setProgress(Math.min(p, 100));
    }, 200);
  };

  const handleAndroidInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") runInstallAnimation();
    } else {
      // Fallback: just show animation (browser may handle it)
      runInstallAnimation();
    }
  };

  const handleIOSInstall = () => setStep("ios-guide");

  const features = [
    { icon: "⚡", label: "Real-time Signals" },
    { icon: "🔒", label: "Secure Access" },
    { icon: "📊", label: "Live Predictions" },
    { icon: "🌐", label: "Works Offline" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--background)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "1.5rem", position: "relative", overflow: "hidden",
    }}>

      {/* Ambient background blobs */}
      <div style={{ position:"absolute", top:"-20%", left:"-20%", width:"60vw", height:"60vw", borderRadius:"50%",
        background:"radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:"-15%", right:"-15%", width:"50vw", height:"50vw", borderRadius:"50%",
        background:"radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)", pointerEvents:"none" }} />

      {/* Confetti particles */}
      {particles.map((p, i) => (
        <div key={i} style={{
          position: "fixed", left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size, borderRadius: "50%",
          background: p.color, pointerEvents: "none", zIndex: 100,
          animation: "confettiFall 2.5s ease-out forwards",
        }} />
      ))}

      {/* ── PROMPT STEP ── */}
      {step === "prompt" && (
        <div className="glass-panel fade-up" style={{ width:"100%", maxWidth:400, padding:"2.5rem 2rem", textAlign:"center" }}>

          {/* App Icon */}
          <div style={{ display:"flex", justifyContent:"center", marginBottom:"1.5rem" }}>
            <div style={{
              width:88, height:88, borderRadius:24,
              background:"linear-gradient(135deg, var(--primary), var(--accent))",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 12px 40px var(--primary-glow)",
              overflow:"hidden",
            }}>
              <img src="/icon-512.png" alt="Signal Hub" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            </div>
          </div>

          <h1 style={{ fontSize:"1.75rem", fontWeight:900, color:"var(--foreground)", letterSpacing:"-0.03em", marginBottom:"0.5rem" }}>
            Signal Hub
          </h1>
          <p style={{ fontSize:13, color:"var(--muted-foreground)", marginBottom:"2rem", fontWeight:500 }}>
            Premium Prediction Terminal
          </p>

          {/* Features */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.75rem", marginBottom:"2rem" }}>
            {features.map((f, i) => (
              <div key={i} style={{
                background:"var(--surface-2)", border:"1.5px solid var(--border)",
                borderRadius:12, padding:"0.85rem 0.75rem", display:"flex", alignItems:"center", gap:"0.6rem",
              }}>
                <span style={{ fontSize:20 }}>{f.icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color:"var(--foreground-soft)", textAlign:"left" }}>{f.label}</span>
              </div>
            ))}
          </div>

          {/* Install Button */}
          {isIOS() ? (
            <button onClick={handleIOSInstall} style={{
              width:"100%", padding:"1rem", borderRadius:14, border:"none", cursor:"pointer",
              background:"linear-gradient(135deg, var(--primary), var(--accent))",
              color:"#fff", fontSize:15, fontWeight:800, letterSpacing:"-0.01em",
              boxShadow:"0 8px 30px var(--primary-glow)",
              transition:"transform 0.15s ease, box-shadow 0.15s ease",
            }}
              onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
              onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              📲 Add to Home Screen
            </button>
          ) : (
            <button onClick={handleAndroidInstall} style={{
              width:"100%", padding:"1rem", borderRadius:14, border:"none", cursor:"pointer",
              background:"linear-gradient(135deg, var(--primary), var(--accent))",
              color:"#fff", fontSize:15, fontWeight:800, letterSpacing:"-0.01em",
              boxShadow:"0 8px 30px var(--primary-glow)",
              transition:"transform 0.15s ease",
            }}
              onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
              onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              ⚡ Install App — Free
            </button>
          )}

          <p style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:"1rem" }}>
            No App Store required · Instant install
          </p>
        </div>
      )}

      {/* ── iOS GUIDE STEP ── */}
      {step === "ios-guide" && (
        <div className="glass-panel fade-up" style={{ width:"100%", maxWidth:400, padding:"2rem", textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:"1rem" }}>📱</div>
          <h2 style={{ fontSize:"1.3rem", fontWeight:800, color:"var(--foreground)", marginBottom:"0.5rem" }}>
            Add to Home Screen
          </h2>
          <p style={{ fontSize:12.5, color:"var(--muted-foreground)", marginBottom:"1.75rem" }}>
            Follow these steps to install Signal Hub on your iPhone/iPad
          </p>

          {[
            { step:"1", icon:"🔗", text: "Tap the Share button at the bottom of Safari" },
            { step:"2", icon:"📋", text: "Scroll down and tap \"Add to Home Screen\"" },
            { step:"3", icon:"✅", text: "Tap \"Add\" in the top right corner" },
            { step:"4", icon:"🚀", text: "Open Signal Hub from your Home Screen!" },
          ].map((s) => (
            <div key={s.step} style={{
              display:"flex", alignItems:"center", gap:"1rem",
              background:"var(--surface-2)", border:"1.5px solid var(--border)",
              padding:"0.85rem 1rem", marginBottom:"0.65rem", textAlign:"left",
              borderRadius:12,
            }}>
              <div style={{
                minWidth:32, height:32, borderRadius:"50%",
                background:"linear-gradient(135deg, var(--primary), var(--accent))",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontWeight:800, color:"#fff",
              }}>{s.step}</div>
              <span style={{ fontSize:13, color:"var(--foreground-soft)", fontWeight:500 }}>{s.icon} {s.text}</span>
            </div>
          ))}

          <button onClick={() => setStep("prompt")} className="pill-button" style={{
            marginTop:"1.25rem", padding:"0.7rem 1.5rem",
            fontSize:13, cursor:"pointer",
          }}>
            ← Back
          </button>
        </div>
      )}

      {/* ── INSTALLING STEP ── */}
      {step === "installing" && (
        <div className="glass-panel fade-up" style={{ width:"100%", maxWidth:360, padding:"2.5rem 2rem", textAlign:"center" }}>
          <div style={{ fontSize:56, marginBottom:"1.25rem", animation:"spin 1.5s linear infinite", display:"inline-block" }}>⚡</div>
          <h2 style={{ fontSize:"1.4rem", fontWeight:800, color:"var(--foreground)", marginBottom:"0.5rem" }}>
            Installing…
          </h2>
          <p style={{ fontSize:13, color:"var(--muted-foreground)", marginBottom:"2rem" }}>
            Setting up Signal Hub on your device
          </p>

          {/* Progress bar */}
          <div style={{ background:"var(--primary-light)", borderRadius:99, height:8, overflow:"hidden", marginBottom:"1rem" }}>
            <div style={{
              height:"100%", borderRadius:99, transition:"width 0.3s ease",
              background:"linear-gradient(90deg, var(--primary), var(--accent))",
              width:`${progress}%`,
              boxShadow:"0 0 12px var(--primary-glow)",
            }} />
          </div>
          <p style={{ fontSize:13, fontWeight:700, color:"var(--primary)" }}>{Math.round(progress)}%</p>
        </div>
      )}

      {/* ── DONE STEP ── */}
      {step === "done" && (
        <div className="glass-panel fade-up" style={{ width:"100%", maxWidth:360, padding:"2.5rem 2rem", textAlign:"center" }}>
          <div style={{
            width:80, height:80, borderRadius:"50%",
            background:"linear-gradient(135deg, var(--green), var(--accent))",
            display:"flex", alignItems:"center", justifyContent:"center",
            margin:"0 auto 1.5rem",
            boxShadow:"0 0 40px var(--green-glow)",
            fontSize:36,
            color:"#fff",
            fontWeight:"bold",
            animation:"popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            ✓
          </div>
          <h2 style={{ fontSize:"1.5rem", fontWeight:900, color:"var(--foreground)", marginBottom:"0.5rem" }}>
            Installed! 🎉
          </h2>
          <p style={{ fontSize:13, color:"var(--muted-foreground)" }}>
            Launching Signal Hub…
          </p>
        </div>
      )}

      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(80px) rotate(360deg); opacity: 0; }
        }
        @keyframes spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes popIn {
          0%   { transform: scale(0); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
