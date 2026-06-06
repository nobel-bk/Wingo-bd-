import { useEffect, useMemo, useRef, useState } from "react";
import {
  PERIODS, predict, digitToColor, digitToSize, fetchCurrent, fetchHistory,
  type GamePeriod, type Color, type CurrentResp, type HistoryItem,
} from "../lib/wingo";

interface HistoryRow {
  period: string; num: number; color: Color[]; signalSize: "BIG"|"SMALL"; signalDigit: number; win: boolean;
}

function parseColors(s: string): Color[] {
  return s.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean) as Color[];
}

const colorHex = (c: Color) =>
  c === "GREEN" ? "var(--signal-green)" : c === "RED" ? "var(--signal-red)" : "var(--signal-violet)";

const S: Record<string, React.CSSProperties> = {
  card: { borderRadius:"2px", border:"1px solid oklch(0.82 0.24 145 / 0.5)", background:"oklch(0.16 0.025 150 / 0.7)", padding:"1.25rem", backdropFilter:"blur(8px)" },
  label: { fontSize:"10px", letterSpacing:"0.3em", color:"var(--muted-foreground)" },
  mono: { fontFamily:"inherit" },
};

export function SignalDashboard({ onLock }: { onLock: () => void }) {
  const [activePeriod, setActivePeriod] = useState<GamePeriod>("1min");
  const game = useMemo(() => PERIODS.find((p) => p.id === activePeriod)!, [activePeriod]);
  const [now, setNow] = useState(() => Date.now());
  const [cur, setCur] = useState<CurrentResp | null>(null);
  const [hist, setHist] = useState<HistoryItem[]>([]);
  const [err, setErr] = useState(false);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const load = async () => {
    try {
      const [h, c] = await Promise.all([fetchHistory(game.code), fetchCurrent(game.code)]);
      setHist(h.slice(0, 10)); setCur(c); setErr(false);
    } catch { setErr(true); }
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [activePeriod]);

  const remaining = cur ? Math.max(0, Math.floor((cur.current.endTime - now) / 1000)) : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  const reloadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (cur && remaining === 0 && reloadedFor.current !== cur.current.issueNumber) {
      reloadedFor.current = cur.current.issueNumber;
      setTimeout(load, 2000);
    }
  }, [remaining, cur]);

  const curIssue  = cur?.current.issueNumber ?? "—";
  const nextIssue = cur?.next.issueNumber    ?? "—";
  const prediction     = useMemo(() => predict(curIssue,  activePeriod), [curIssue,  activePeriod]);
  const nextPrediction = useMemo(() => predict(nextIssue, activePeriod), [nextIssue, activePeriod]);

  const history = useMemo<HistoryRow[]>(() => hist.map((it) => {
    const num = parseInt(it.number, 10);
    const pr = predict(it.issueNumber, activePeriod);
    return { period: it.issueNumber, num, color: parseColors(it.color), signalSize: pr.size, signalDigit: pr.digit, win: digitToSize(num) === pr.size };
  }), [hist, activePeriod]);

  const stats = history.reduce((acc, r) => { r.win ? acc.win++ : acc.loss++; return acc; }, { win:0, loss:0 });

  const [flash, setFlash] = useState(false);
  const prevRef = useRef(curIssue);
  useEffect(() => {
    if (prevRef.current !== curIssue) { prevRef.current = curIssue; setFlash(true); setTimeout(() => setFlash(false), 800); }
  }, [curIssue]);

  return (
    <div style={{ minHeight:"100vh", padding:"1rem" }}>
      <div className="scanline" />
      <div style={{ maxWidth:"768px", margin:"0 auto", display:"flex", flexDirection:"column", gap:"1rem" }}>

        {/* Header */}
        <header className="frame-corners" style={S.card}>
          <span className="corner-tl" /><span className="corner-br" />
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
              <div className="animate-pulse-ring" style={{ width:"40px", height:"40px", display:"grid", placeItems:"center", border:"1px solid var(--primary)", color:"var(--primary)", borderRadius:"2px" }}>⬡</div>
              <div>
                <h1 className="text-glow" style={{ fontSize:"1.25rem", fontWeight:700, letterSpacing:"0.25em", color:"var(--primary)" }}>SIGNAL HUB</h1>
                <p style={{ fontSize:"10px", letterSpacing:"0.3em", color:"var(--muted-foreground)" }}>PREDICTION ENGINE • LIVE</p>
              </div>
            </div>
            <button onClick={onLock} style={{ borderRadius:"2px", border:"1px solid oklch(0.82 0.24 145 / 0.4)", padding:"0.375rem 0.75rem", fontSize:"10px", letterSpacing:"0.1em", color:"oklch(0.82 0.24 145 / 0.8)", background:"transparent", cursor:"pointer", fontFamily:"inherit" }}>
              ⏻ LOCK
            </button>
          </div>
        </header>

        {/* Period selector */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0.5rem" }}>
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setActivePeriod(p.id)}
              className={activePeriod === p.id ? "box-glow text-glow" : ""}
              style={{
                borderRadius:"2px", padding:"0.75rem 0.5rem", fontSize:"10px", fontWeight:700,
                letterSpacing:"0.1em", cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s",
                border: activePeriod === p.id ? "1px solid var(--primary)" : "1px solid oklch(0.82 0.24 145 / 0.3)",
                background: activePeriod === p.id ? "oklch(0.82 0.24 145 / 0.15)" : "transparent",
                color: activePeriod === p.id ? "var(--primary)" : "oklch(0.82 0.24 145 / 0.6)",
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Main panel */}
        <section className="frame-corners" style={S.card}>
          <span className="corner-tl" /><span className="corner-br" />
          {err && (
            <div className="animate-blink" style={{ marginBottom:"0.75rem", borderRadius:"2px", border:"1px solid oklch(0.65 0.27 25 / 0.6)", background:"oklch(0.65 0.27 25 / 0.1)", padding:"0.5rem 0.75rem", fontSize:"10px", letterSpacing:"0.1em", color:"var(--destructive)" }}>
              ⚠ API CONNECTION ERROR — RETRYING IN 15s...
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid oklch(0.82 0.24 145 / 0.2)", paddingBottom:"0.75rem" }}>
            <span style={{ display:"flex", alignItems:"center", gap:"0.5rem", fontSize:"11px", letterSpacing:"0.1em", color:"var(--primary)" }}>
              ⬡ {game.label}
              <span className="animate-blink" style={{ borderRadius:"2px", background:"oklch(0.65 0.27 25 / 0.8)", padding:"2px 6px", fontSize:"9px", color:"white" }}>LIVE</span>
            </span>
            <span style={{ fontSize:"11px", letterSpacing:"0.1em", color:"oklch(0.82 0.24 145 / 0.8)" }}>◉ ANALYZING</span>
          </div>

          <div style={{ marginTop:"1rem", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.75rem" }}>
            <div style={{ borderRadius:"2px", border:"1px solid oklch(0.82 0.24 145 / 0.3)", background:"oklch(0.13 0.02 150 / 0.4)", padding:"0.75rem" }}>
              <p style={S.label}>▸ CURRENT PERIOD</p>
              <p className={flash ? "text-glow" : ""} style={{ marginTop:"0.25rem", fontFamily:"monospace", fontSize:"1rem", color:"var(--primary)", wordBreak:"break-all" }}>{curIssue}</p>
            </div>
            <div style={{ borderRadius:"2px", border:"1px solid oklch(0.82 0.24 145 / 0.3)", background:"oklch(0.13 0.02 150 / 0.4)", padding:"0.75rem", textAlign:"right" }}>
              <p style={S.label}>▸ COUNTDOWN</p>
              <p className="text-glow" style={{ marginTop:"0.25rem", fontFamily:"monospace", fontSize:"1.875rem", fontWeight:700, color:"var(--primary)" }}>{mm}:{ss}</p>
            </div>
          </div>

          {/* Next signal */}
          <div style={{ marginTop:"1rem", borderRadius:"2px", border:"1px solid oklch(0.82 0.24 145 / 0.4)", background:"oklch(0.82 0.24 145 / 0.05)", padding:"1rem" }}>
            <p style={S.label}>▸ NEXT SIGNAL</p>
            <div style={{ marginTop:"0.5rem", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <p className="text-glow" style={{ fontSize:"2.25rem", fontWeight:800, letterSpacing:"0.1em", color: colorHex(nextPrediction.color) }}>{nextPrediction.size}</p>
                <p style={{ marginTop:"0.25rem", fontSize:"10px", letterSpacing:"0.1em", color:"var(--muted-foreground)" }}>
                  COLOR: <span style={{ color: colorHex(nextPrediction.color) }}>{nextPrediction.color}</span>
                </p>
              </div>
              <div style={{ textAlign:"right" }}>
                <p className="text-glow" style={{ fontFamily:"monospace", fontSize:"3rem", fontWeight:700, color:"var(--primary)" }}>{nextPrediction.digit}</p>
                <p style={{ fontSize:"10px", letterSpacing:"0.1em", color:"var(--muted-foreground)" }}>PREDICTED #</p>
              </div>
            </div>
            <div style={{ marginTop:"0.75rem", display:"flex", justifyContent:"space-between", fontSize:"10px", letterSpacing:"0.1em" }}>
              <span style={{ color:"var(--muted-foreground)" }}>CONFIDENCE</span>
              <span className="text-glow" style={{ color:"var(--primary)" }}>{nextPrediction.confidence}%</span>
            </div>
            <div style={{ marginTop:"0.25rem", height:"6px", borderRadius:"9999px", background:"oklch(0.82 0.24 145 / 0.1)", overflow:"hidden" }}>
              <div className="box-glow" style={{ height:"100%", background:"var(--primary)", width:`${nextPrediction.confidence}%`, transition:"width 0.3s" }} />
            </div>
            <p style={{ marginTop:"0.75rem", fontSize:"10px", letterSpacing:"0.1em", color:"var(--muted-foreground)", wordBreak:"break-all" }}>
              NEXT PERIOD: <span style={{ color:"oklch(0.82 0.24 145 / 0.8)" }}>{nextIssue}</span>
            </p>
          </div>

          {/* This round */}
          <div style={{ marginTop:"0.75rem", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.5rem", textAlign:"center" }}>
            {[
              { label:"THIS ROUND", val: prediction.size, col: colorHex(prediction.color) },
              { label:"COLOR",      val: prediction.color, col: colorHex(prediction.color), dot: true },
              { label:"NUMBER",     val: String(prediction.digit), col: "var(--primary)" },
            ].map((item) => (
              <div key={item.label} style={{ borderRadius:"2px", border:"1px solid oklch(0.82 0.24 145 / 0.2)", background:"oklch(0.13 0.02 150 / 0.4)", padding:"0.5rem" }}>
                <p style={{ fontSize:"9px", letterSpacing:"0.1em", color:"var(--muted-foreground)" }}>{item.label}</p>
                {item.dot ? (
                  <div style={{ marginTop:"0.25rem", display:"flex", alignItems:"center", justifyContent:"center", gap:"4px" }}>
                    <span style={{ width:"10px", height:"10px", borderRadius:"50%", background: item.col, display:"inline-block" }} />
                    <span style={{ fontSize:"12px", fontWeight:700, color: item.col }}>{item.val}</span>
                  </div>
                ) : (
                  <p className="text-glow" style={{ marginTop:"0.25rem", fontSize:"0.875rem", fontWeight:700, color: item.col }}>{item.val}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* History */}
        <section className="frame-corners" style={{ ...S.card, padding:"1rem" }}>
          <span className="corner-tl" /><span className="corner-br" />
          <div style={{ display:"flex", justifyContent:"space-between", borderBottom:"1px solid oklch(0.82 0.24 145 / 0.2)", paddingBottom:"0.5rem" }}>
            <p style={{ fontSize:"11px", letterSpacing:"0.1em", color:"var(--primary)" }}>▸ HISTORY — LAST 10 RESULTS</p>
            <p style={{ fontSize:"10px", letterSpacing:"0.1em" }}>
              <span style={{ color:"var(--signal-green)" }}>WIN:{stats.win}</span>
              <span style={{ color:"var(--muted-foreground)" }}> | </span>
              <span style={{ color:"var(--signal-red)" }}>LOSS:{stats.loss}</span>
            </p>
          </div>
          <div style={{ marginTop:"0.5rem", overflowX:"auto" }}>
            <table style={{ width:"100%", textAlign:"left", fontSize:"11px", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ color:"var(--muted-foreground)", letterSpacing:"0.1em" }}>
                  {["PERIOD","NUM","CLR","SIGNAL","RESULT"].map(h=><th key={h} style={{ padding:"0.5rem 0.5rem 0.5rem 0", fontWeight:"normal" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody style={{ fontFamily:"monospace" }}>
                {history.map((r) => (
                  <tr key={r.period} style={{ borderTop:"1px solid oklch(0.82 0.24 145 / 0.1)" }}>
                    <td style={{ padding:"0.5rem 0.5rem 0.5rem 0", fontSize:"10px", color:"oklch(0.82 0.24 145 / 0.8)" }}>…{r.period.slice(-6)}</td>
                    <td style={{ padding:"0.5rem 0.5rem 0.5rem 0", color:"var(--primary)" }}>{r.num}</td>
                    <td style={{ padding:"0.5rem 0.5rem 0.5rem 0" }}>
                      <div style={{ display:"flex", gap:"4px" }}>
                        {r.color.map((c) => <span key={c} style={{ width:"10px", height:"10px", borderRadius:"50%", background: colorHex(c), display:"inline-block" }} />)}
                      </div>
                    </td>
                    <td style={{ padding:"0.5rem 0.5rem 0.5rem 0", fontWeight:700, color: r.signalSize==="BIG" ? "var(--signal-green)" : "var(--signal-violet)" }}>{r.signalSize}</td>
                    <td style={{ padding:"0.5rem 0.5rem 0.5rem 0", fontWeight:700, color: r.win ? "var(--signal-green)" : "var(--signal-red)" }}>{r.win ? "✓ WIN" : "✗ LOSS"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer style={{ paddingTop:"0.5rem", textAlign:"center", fontSize:"10px", letterSpacing:"0.1em", color:"var(--muted-foreground)" }}>
          ◈ SIGNAL HUB v2.0 — UNAUTHORIZED ACCESS PROHIBITED ◈
        </footer>
      </div>
    </div>
  );
}
