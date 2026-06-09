import { useEffect, useMemo, useRef, useState } from "react";
import {
  PERIODS, smartPredict, digitToColor, digitToSize, fetchCurrent, fetchHistory,
  incrementPeriod, calculatePeriodSum, calculateMarkovTransition, calculateGoldenRatio,
  type GamePeriod, type Color, type CurrentResp, type HistoryItem,
} from "../lib/wingo";
import { getSession, checkSessionLimit } from "../lib/auth";
import { getGeminiSignal, type GeminiSignal } from "../lib/gemini";

// Brand name for AI signal source
const AI_BRAND = "Signal Hub AI";

interface ManualPredictionRow {
  id: string;
  inputPeriod: string;
  inputResult: number;
  nextPeriod: string;
  formula: string;
  predictedDigit: number;
  predictedSize: "BIG" | "SMALL";
  predictedColor: Color;
  actualResult?: number;
  win?: boolean;
}

function getDigitBg(d: number): string {
  if (d === 0) return "linear-gradient(135deg, var(--violet) 0%, var(--red) 100%)";
  if (d === 5) return "linear-gradient(135deg, var(--violet) 0%, var(--green) 100%)";
  return d % 2 === 0
    ? "linear-gradient(135deg, var(--red) 0%, #e11d48 100%)"
    : "linear-gradient(135deg, var(--green) 0%, #059669 100%)";
}

interface HistoryRow {
  period: string;
  num: number;
  color: Color[];
  signalSize: "BIG" | "SMALL";
  signalDigit: number;
  win: boolean;
}

function parseColors(s: string): Color[] {
  return s.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean) as Color[];
}

const SIG_COLOR: Record<Color, string> = {
  GREEN:  "var(--green)",
  RED:    "var(--red)",
  VIOLET: "var(--violet)",
};

// ─── Mini Bar Graph ────────────────────────────────────────────────────────
function MiniBarGraph({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Loading data…</span>
      </div>
    );
  }

  // Display last 10 rows oldest→newest (left→right)
  const display = [...rows].reverse();
  const maxNum = 9;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, padding: "0 4px" }}>
      {display.map((r, i) => {
        const heightPct = ((r.num + 1) / (maxNum + 1)) * 100;
        const color = r.win ? "var(--green)" : "var(--red)";
        const bg   = r.win ? "var(--green-light)" : "var(--red-light)";
        return (
          <div
            key={i}
            title={`Period: …${r.period.slice(-6)}\nNumber: ${r.num}\n${r.win ? "✅ WIN" : "❌ LOSS"}`}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 3,
              height: "100%",
            }}
          >
            {/* Number label */}
            <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: "JetBrains Mono, monospace" }}>
              {r.num}
            </span>
            {/* Bar */}
            <div
              style={{
                width: "100%",
                height: `${heightPct}%`,
                background: color,
                borderRadius: "4px 4px 2px 2px",
                opacity: 0.85,
                boxShadow: `0 2px 8px ${r.win ? "var(--green-glow)" : "var(--red-glow)"}`,
                transition: "height 0.5s cubic-bezier(0.16,1,0.3,1)",
                position: "relative",
              }}
            />
            {/* W/L dot */}
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Accuracy Line Graph ──────────────────────────────────────────────────
function AccuracyLineGraph({ rows }: { rows: HistoryRow[] }) {
  if (rows.length < 2) return null;

  const W = 280, H = 64;
  const display = [...rows].reverse(); // oldest→newest
  const n = display.length;

  // Running win-rate at each point
  const points = display.map((_, i) => {
    const sub = display.slice(0, i + 1);
    const wins = sub.filter(r => r.win).length;
    return (wins / sub.length) * 100;
  });

  const ptX = (i: number) => (i / (n - 1)) * W;
  const ptY = (v: number) => H - (v / 100) * H;

  // Build SVG polyline
  const poly = points.map((v, i) => `${ptX(i)},${ptY(v)}`).join(" ");
  // Area fill path
  const area = `M${ptX(0)},${ptY(points[0])} ` +
    points.slice(1).map((v, i) => `L${ptX(i + 1)},${ptY(v)}`).join(" ") +
    ` L${W},${H} L0,${H} Z`;

  const last = points[points.length - 1];
  const color = last >= 60 ? "#22c55e" : last >= 45 ? "#f59e0b" : "#f43f5e";

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        {/* Clip path so area doesn't overflow */}
        <clipPath id="graphClip">
          <rect x="0" y="0" width={W} height={H} />
        </clipPath>
      </defs>
      {/* 50% reference line */}
      <line x1="0" y1={H / 2} x2={W} y2={H / 2}
        stroke="rgba(100,120,220,0.15)" strokeWidth="1" strokeDasharray="4 3" />
      {/* Area */}
      <path d={area} fill="url(#areaGrad)" clipPath="url(#graphClip)" />
      {/* Line */}
      <polyline
        points={poly}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last dot */}
      <circle cx={ptX(n - 1)} cy={ptY(last)} r="4" fill={color} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}


// ─── Main Dashboard ────────────────────────────────────────────────────────
export function SignalDashboard({ onLock }: { onLock: () => void }) {
  const [activePeriod, setActivePeriod] = useState<GamePeriod>("1min");
  const game = useMemo(() => PERIODS.find((p) => p.id === activePeriod)!, [activePeriod]);
  const [now, setNow] = useState(() => Date.now());
  const [cur, setCur] = useState<CurrentResp | null>(null);
  const [hist, setHist] = useState<HistoryItem[]>([]);
  const [err, setErr] = useState(false);
  const [timeOffset, setTimeOffset] = useState(0);
  const [geminiSignal, setGeminiSignal] = useState<GeminiSignal | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);

  // Automatic Formula Stats & Predictions
  const formulaStats = useMemo(() => {
    let statsA = { win: 0, loss: 0 };
    let statsB = { win: 0, loss: 0 };
    let statsC = { win: 0, loss: 0 };

    for (let idx = 0; idx < hist.length - 1; idx++) {
      const curItem = hist[idx];
      const prevItem = hist[idx + 1];
      const actualNum = parseInt(curItem.number, 10);
      const actualSize = digitToSize(actualNum);
      const prevResult = parseInt(prevItem.number, 10);

      if (!isNaN(actualNum) && !isNaN(prevResult)) {
        const predA = calculatePeriodSum(prevItem.issueNumber, prevResult).digit;
        digitToSize(predA) === actualSize ? statsA.win++ : statsA.loss++;

        const predB = calculateMarkovTransition(prevItem.issueNumber, prevResult).digit;
        digitToSize(predB) === actualSize ? statsB.win++ : statsB.loss++;

        const predC = calculateGoldenRatio(prevItem.issueNumber, prevResult).digit;
        digitToSize(predC) === actualSize ? statsC.win++ : statsC.loss++;
      }
    }

    const totalA = statsA.win + statsA.loss;
    const totalB = statsB.win + statsB.loss;
    const totalC = statsC.win + statsC.loss;

    return {
      A: { win: statsA.win, loss: statsA.loss, rate: totalA > 0 ? Math.round((statsA.win / totalA) * 100) : 0 },
      B: { win: statsB.win, loss: statsB.loss, rate: totalB > 0 ? Math.round((statsB.win / totalB) * 100) : 0 },
      C: { win: statsC.win, loss: statsC.loss, rate: totalC > 0 ? Math.round((statsC.win / totalC) * 100) : 0 },
    };
  }, [hist]);

  const lastResultNum = hist[0] ? parseInt(hist[0].number, 10) : null;
  const lastIssueNum   = hist[0] ? hist[0].issueNumber : null;

  const predA = useMemo(() => {
    if (lastResultNum === null || !lastIssueNum) return null;
    const res = calculatePeriodSum(lastIssueNum, lastResultNum);
    const size = digitToSize(res.digit);
    const colors = digitToColor(res.digit);
    const color = colors.find(c => c !== "VIOLET") ?? colors[0];
    return { digit: res.digit, size, color, explanation: res.explanation };
  }, [lastIssueNum, lastResultNum]);

  const predB = useMemo(() => {
    if (lastResultNum === null || !lastIssueNum) return null;
    const res = calculateMarkovTransition(lastIssueNum, lastResultNum);
    const size = digitToSize(res.digit);
    const colors = digitToColor(res.digit);
    const color = colors.find(c => c !== "VIOLET") ?? colors[0];
    return { digit: res.digit, size, color, explanation: res.explanation };
  }, [lastIssueNum, lastResultNum]);

  const predC = useMemo(() => {
    if (lastResultNum === null || !lastIssueNum) return null;
    const res = calculateGoldenRatio(lastIssueNum, lastResultNum);
    const size = digitToSize(res.digit);
    const colors = digitToColor(res.digit);
    const color = colors.find(c => c !== "VIOLET") ?? colors[0];
    return { digit: res.digit, size, color, explanation: res.explanation };
  }, [lastIssueNum, lastResultNum]);

  // Sync client time with Akamai NTP-like service to prevent local clock drift delay
  useEffect(() => {
    const syncTime = async () => {
      try {
        const start = Date.now();
        const r = await fetch("https://time.akamai.com/?ts=" + Date.now());
        if (r.ok) {
          const text = await r.text();
          const latency = (Date.now() - start) / 2;
          const serverTime = parseInt(text.trim(), 10) * 1000 + latency;
          const offset = serverTime - Date.now();
          setTimeOffset(offset);
        }
      } catch (e) {
        console.error("Time sync failed:", e);
      }
    };
    syncTime();
    const t = setInterval(syncTime, 60000); // Re-sync every 60 seconds
    return () => clearInterval(t);
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const load = async () => {
    try {
      const [h, c] = await Promise.all([fetchHistory(game.code), fetchCurrent(game.code)]);
      setHist(h.slice(0, 30)); setCur(c); setErr(false);
      return c;
    } catch {
      setErr(true);
      return null;
    }
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [activePeriod]);

  const curIssue  = cur?.current.issueNumber ?? "—";
  const nextIssue = cur?.next.issueNumber    ?? "—";

  // Gemini AI signal — refresh when issue changes
  useEffect(() => {
    if (hist.length < 5 || !nextIssue || nextIssue === "—") return;
    const nums = hist.slice(0, 20).map(h => parseInt(h.number, 10)).filter(n => !isNaN(n));
    if (nums.length < 5) return;
    setGeminiSignal(null); // Clear the previous issue's signal
    setGeminiLoading(true);
    getGeminiSignal(nums, nextIssue).then(sig => {
      setGeminiSignal(sig);
      setGeminiLoading(false);
    }).catch(() => setGeminiLoading(false));
  }, [nextIssue, hist.length > 0 ? hist[0]?.issueNumber : ""]);

  // Device session limit
  useEffect(() => {
    const session = getSession();
    if (!session?.userId || !session.sessionToken) return;
    const t = setInterval(async () => {
      const valid = await checkSessionLimit(session.userId!, session.sessionToken!);
      if (!valid) { clearInterval(t); alert("🚨 Disconnected: License used on another device."); onLock(); }
    }, 12000);
    return () => clearInterval(t);
  }, [onLock]);

  const nowAdjusted = now + timeOffset;
  const remaining = cur ? Math.max(0, Math.floor((cur.current.endTime - nowAdjusted) / 1000)) : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  // Fast poll when countdown hits 00:00 until new period data is fetched
  useEffect(() => {
    if (cur && remaining === 0) {
      const t = setInterval(async () => {
        const newCur = await load();
        if (newCur && newCur.current.issueNumber !== cur.current.issueNumber) {
          clearInterval(t);
        }
      }, 2000);
      return () => clearInterval(t);
    }
  }, [remaining === 0, cur?.current.issueNumber]);

  // curIssue and nextIssue declared above (before Gemini useEffect)

  const prediction     = useMemo(() => smartPredict(curIssue,  hist, hist, geminiSignal), [curIssue,  hist, geminiSignal]);
  const nextPrediction = useMemo(() => smartPredict(nextIssue, hist, hist, geminiSignal), [nextIssue, hist, geminiSignal]);

  const history = useMemo<HistoryRow[]>(() =>
    hist.slice(0, 10).map((it, idx) => {
      const num = parseInt(it.number, 10);
      // Use only history BEFORE this round — same data the live signal used
      const pr  = smartPredict(it.issueNumber, hist.slice(idx + 1), hist, geminiSignal);
      return { period: it.issueNumber, num, color: parseColors(it.color), signalSize: pr.size, signalDigit: pr.digit, win: digitToSize(num) === pr.size };
    }), [hist, geminiSignal]);

  const stats = history.reduce((a, r) => { r.win ? a.win++ : a.loss++; return a; }, { win: 0, loss: 0 });
  const total   = stats.win + stats.loss;
  const winRate = total > 0 ? Math.round((stats.win / total) * 100) : 0;



  const [flash, setFlash] = useState(false);
  const prevRef = useRef(curIssue);
  useEffect(() => {
    if (prevRef.current !== curIssue) { prevRef.current = curIssue; setFlash(true); setTimeout(() => setFlash(false), 900); }
  }, [curIssue]);

  const rateColor = winRate >= 60 ? "var(--green)" : winRate >= 45 ? "#f59e0b" : "var(--red)";

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem 1rem", background: "var(--background)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* ── HEADER ───────────────────────────────────────── */}
        <header className="glass-panel fade-up" style={{ padding: "1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {/* Logo */}
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px var(--primary-glow)"
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
                Signal Hub
              </h1>
              <span className={`status-indicator ${err ? "error" : ""}`}>
                ● {err ? "reconnecting…" : "live feed"}
              </span>
            </div>
          </div>

          <button onClick={onLock} className="pill-button" style={{ gap: "0.4rem" }}>
            🔒 Logout
          </button>
        </header>

        {/* ── PERIOD TABS ──────────────────────────────────── */}
        <div className="fade-up" style={{ display: "flex", gap: "0.5rem", animationDelay: "0.05s" }}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePeriod(p.id)}
              style={{
                flex: 1,
                padding: "0.6rem 0.25rem",
                borderRadius: 10,
                border: activePeriod === p.id
                  ? "2px solid var(--primary)"
                  : "2px solid var(--border)",
                background: activePeriod === p.id
                  ? "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)"
                  : "var(--surface)",
                color: activePeriod === p.id ? "#fff" : "var(--muted-foreground)",
                fontWeight: activePeriod === p.id ? 800 : 600,
                fontSize: 11,
                cursor: "pointer",
                letterSpacing: "0.03em",
                transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)",
                boxShadow: activePeriod === p.id ? "0 4px 14px var(--primary-glow)" : "none",
              }}
            >
              {p.label.replace("WINGO ", "")}
            </button>
          ))}
        </div>

        {/* ── UNIFIED AI SIGNAL HUB CARD ────────────────────── */}
        <section className="glass-panel fade-up" style={{ animationDelay: "0.1s" }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>🤖</span> {AI_BRAND}
              </h3>
              <p className="mono-font" style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                Next issue: <strong style={{ color: "var(--foreground)" }}>{nextIssue}</strong>
              </p>
            </div>
            <span className="badge badge-blue">Auto Ensemble</span>
          </div>

          {/* Big signal row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: `linear-gradient(135deg, ${nextPrediction.color === "GREEN" ? "var(--green)" : "var(--red)"}18 0%, var(--surface-2) 100%)`,
            border: `2px solid ${nextPrediction.color === "GREEN" ? "var(--green)" : "var(--red)"}55`,
            borderRadius: 14,
            padding: "1.5rem 1.75rem",
            gap: "1rem"
          }}>
            {/* Size */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase" }}>FINAL SIGNAL</p>
              <p style={{
                fontSize: "3rem", fontWeight: 900, lineHeight: 1.1,
                color: SIG_COLOR[nextPrediction.color]
              }}>
                {nextPrediction.size}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: SIG_COLOR[nextPrediction.color],
                  boxShadow: `0 0 8px ${SIG_COLOR[nextPrediction.color]}`
                }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: SIG_COLOR[nextPrediction.color] }}>
                  {nextPrediction.color}
                </span>
              </div>
            </div>

            {/* Digit */}
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.06em" }}>DIGIT</p>
              <p className="mono-font" style={{ fontSize: "3.5rem", fontWeight: 800, lineHeight: 1, color: "var(--primary)" }}>
                {nextPrediction.digit}
              </p>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
                Predicted number
              </p>
            </div>
          </div>

          {/* Confidence bar */}
          <div style={{ marginTop: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: "var(--muted-foreground)" }}>AI Confidence Weight</span>
              <span className="mono-font" style={{ fontWeight: 700, color: "var(--primary)" }}>
                {nextPrediction.confidence}%
              </span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: "var(--primary-light)", overflow: "hidden" }}>
              <div
                className="shimmer-bar"
                style={{ height: "100%", width: `${nextPrediction.confidence}%`, borderRadius: 99, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }}
              />
            </div>
          </div>

          {/* Voting agreement and Formula breakdown */}
          {lastResultNum !== null && lastIssueNum && predA && predB && predC && (() => {
            const wA = formulaStats.A.rate >= 40 ? formulaStats.A.rate : 0;
            const wB = formulaStats.B.rate >= 40 ? formulaStats.B.rate : 0;
            const wC = formulaStats.C.rate >= 40 ? formulaStats.C.rate : 0;
            const wG = geminiSignal ? 65 : 0;
            const totalW = Math.max(wA + wB + wC + wG, 1);
            const totalVoters = geminiSignal ? 4 : 3;
            const allPreds = [
              { size: predA.size, color: predA.color, w: wA },
              { size: predB.size, color: predB.color, w: wB },
              { size: predC.size, color: predC.color, w: wC },
            ];
            if (geminiSignal) allPreds.push({ size: geminiSignal.size, color: geminiSignal.color as Color, w: wG });
            const agreeCount = allPreds.filter(p => p.size === nextPrediction.size).length;

            const formulaRows = [
              { label: "A", name: "Period-Sum",  pred: predA,      rate: formulaStats.A.rate },
              { label: "B", name: "Markov",       pred: predB,      rate: formulaStats.B.rate },
              { label: "C", name: "Golden Ratio", pred: predC,      rate: formulaStats.C.rate },
            ];

            return (
              <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                {/* Voting Agreement Info */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)" }}>VOTE AGREEMENT</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)" }}>{agreeCount}/{totalVoters} sources agree</span>
                </div>

                {/* Gemini source details */}
                <div style={{
                  background: geminiLoading ? "var(--surface-2)" :
                    geminiSignal ? (geminiSignal.size === nextPrediction.size ? "rgba(16,185,129,0.06)" : "var(--surface-2)") : "var(--surface-2)",
                  border: `1px solid ${geminiSignal?.size === nextPrediction.size ? "rgba(16,185,129,0.2)" : "var(--border)"}`,
                  borderRadius: 10, padding: "0.6rem 0.85rem", marginBottom: "0.5rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "#fff" }}>🎯</span>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{AI_BRAND} (AI Agent)</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {geminiLoading ? (
                        <span style={{ fontSize: 10, color: "var(--muted-foreground)", animation: "pulse 1.5s infinite" }}>Analyzing…</span>
                      ) : geminiSignal ? (
                        <>
                          <span style={{ fontSize: 11, fontWeight: 800, color: SIG_COLOR[geminiSignal.color as Color] }}>{geminiSignal.size}</span>
                          <span style={{ fontSize: 9, color: geminiSignal.size === nextPrediction.size ? "var(--green)" : "var(--muted-foreground)", fontWeight: 700 }}>
                            {geminiSignal.size === nextPrediction.size ? "✓ Agrees" : "✗ Differs"}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>Offline</span>
                      )}
                    </div>
                  </div>
                  {geminiSignal?.reasoning && (
                    <p style={{ fontSize: 9.5, color: "var(--muted-foreground)", marginTop: 4, paddingLeft: 30 }}>
                      Reasoning: {geminiSignal.reasoning}
                    </p>
                  )}
                </div>

                {/* Formulas breakdown list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {formulaRows.map((f, i) => {
                    const agrees = f.pred.size === nextPrediction.size;
                    const fc = f.pred.color === "GREEN" ? "var(--green)" : f.pred.color === "RED" ? "var(--red)" : "var(--violet)";
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: agrees ? "rgba(16,185,129,0.04)" : "var(--surface-2)",
                        border: `1px solid ${agrees ? "rgba(16,185,129,0.15)" : "var(--border)"}`,
                        borderRadius: 8, padding: "0.45rem 0.75rem",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: 5, fontWeight: 800, fontSize: 10,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: agrees ? "var(--green)" : "var(--border)",
                            color: agrees ? "#fff" : "var(--muted-foreground)"
                          }}>{f.label}</span>
                          <span style={{ fontSize: 10.5, color: "var(--muted-foreground)", fontWeight: 600 }}>{f.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: fc }}>{f.pred.size}</span>
                          <span style={{ fontSize: 9, color: agrees ? "var(--green)" : "var(--muted-foreground)", fontWeight: 700 }}>
                            {agrees ? "✓ Agrees" : "✗ Differs"}
                          </span>
                          <span style={{ fontSize: 9.5, color: "var(--muted-foreground)" }}>{f.rate}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </section>

        {/* ── TIMER + CURRENT ROUND CARDS ─────────────────── */}
        <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "0.75rem", animationDelay: "0.15s" }}>
          {/* Current period */}
          <div className="glass-panel" style={{ padding: "1.1rem 1.25rem" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Current Period
            </p>
            <p className={`mono-font ${flash ? "glow-text" : ""}`} style={{ marginTop: 5, fontSize: "1.05rem", fontWeight: 700, wordBreak: "break-all", color: "var(--foreground)" }}>
              {curIssue}
            </p>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              {[
                { label: "SIZE",   val: prediction.size,          col: SIG_COLOR[prediction.color] },
                { label: "COLOR",  val: prediction.color,         col: SIG_COLOR[prediction.color] },
                { label: "DIGIT",  val: String(prediction.digit), col: "var(--primary)" },
              ].map((item, i) => (
                <div key={i} style={{ flex: 1, background: "var(--surface-2)", borderRadius: 8, padding: "0.45rem 0.5rem", textAlign: "center", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700 }}>{item.label}</p>
                  <p className="mono-font" style={{ fontSize: 11.5, fontWeight: 800, color: item.col, marginTop: 2 }}>{item.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Timer */}
          <div className="glass-panel" style={{ padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Time Left
            </p>
            <p className="mono-font glow-text" style={{ fontSize: "2.5rem", fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>
              {mm}:{ss}
            </p>
            <p style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4 }}>seconds remaining</p>
          </div>
        </div>


        {/* ── GRAPH SECTION ────────────────────────────────── */}
        <section className="glass-panel fade-up" style={{ animationDelay: "0.2s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>Performance Graph</h3>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                Last 10 rounds — green = WIN, red = LOSS
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Circular win rate */}
              <div style={{ position: "relative", width: 44, height: 44 }}>
                <svg width="44" height="44" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--primary-light)" strokeWidth="4" />
                  <circle
                    cx="22" cy="22" r="18"
                    fill="none"
                    stroke={rateColor}
                    strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 18}`}
                    strokeDashoffset={`${2 * Math.PI * 18 * (1 - winRate / 100)}`}
                    strokeLinecap="round"
                    className="progress-ring-circle"
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: rateColor }}>
                  {winRate}%
                </div>
              </div>
              <div>
                <p style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700 }}>WIN RATE</p>
                <p className="mono-font" style={{ fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: "var(--green)" }}>{stats.win}W</span>
                  <span style={{ color: "var(--muted-foreground)", margin: "0 3px" }}>/</span>
                  <span style={{ color: "var(--red)" }}>{stats.loss}L</span>
                </p>
              </div>
            </div>
          </div>

          {/* Bar graph */}
          <MiniBarGraph rows={history} />

          {/* Accuracy trend line */}
          {history.length >= 2 && (
            <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em", marginBottom: 8, textTransform: "uppercase" }}>
                Accuracy Trend
              </p>
              <AccuracyLineGraph rows={history} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>Oldest</span>
                <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>Latest</span>
              </div>
            </div>
          )}
        </section>

        {/* ── RNG SECURITY DIAGNOSTICS ──────────────────────── */}
        {nextPrediction.rng && (
          <section className="glass-panel fade-up" style={{ animationDelay: "0.22s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🛡️</span> RNG Security Diagnostics (নিরাপত্তা নির্ণয়)
                </h3>
                <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                  Real-time statistical evaluation of lottery number generator
                </p>
              </div>
              <span className={`badge ${nextPrediction.rng.detectedType === "CSPRNG (Secure)" ? "badge-green" : "badge-red"}`} style={{ padding: "0.25rem 0.6rem", fontSize: 10 }}>
                {nextPrediction.rng.detectedType === "CSPRNG (Secure)" ? "CSPRNG Secure" : "PRNG (Pattern)"}
              </span>
            </div>

            {/* Metrics grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "1rem" }}>
              {[
                { label: "PREDICTABILITY", value: `${nextPrediction.rng.predictabilityScore}%`, sub: nextPrediction.rng.predictabilityScore > 50 ? "⚠️ Pattern Found" : "🛡️ Pure Random", color: nextPrediction.rng.predictabilityScore > 50 ? "var(--red)" : "var(--green)" },
                { label: "ENTROPY", value: nextPrediction.rng.entropy, sub: `${Math.round((nextPrediction.rng.entropy / 3.32) * 100)}% Max`, color: nextPrediction.rng.entropy < 2.5 ? "var(--rose)" : "var(--foreground)" },
                { label: "LAG-1 AUTOCORR", value: nextPrediction.rng.autocorrelation, sub: Math.abs(nextPrediction.rng.autocorrelation) > 0.35 ? "⚠️ High Corel" : "✓ Low Corel", color: Math.abs(nextPrediction.rng.autocorrelation) > 0.35 ? "var(--rose)" : "var(--foreground)" },
                { label: "RUNS Z-SCORE", value: nextPrediction.rng.runsZScore, sub: Math.abs(nextPrediction.rng.runsZScore) > 1.96 ? "⚠️ Non-Random" : "✓ Random Dist", color: Math.abs(nextPrediction.rng.runsZScore) > 1.96 ? "var(--rose)" : "var(--foreground)" },
              ].map((m, idx) => (
                <div key={idx} style={{ background: "var(--surface-2)", borderRadius: 10, padding: "0.6rem 0.5rem", textAlign: "center", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 8.5, color: "var(--muted-foreground)", fontWeight: 700, letterSpacing: "0.03em" }}>{m.label}</p>
                  <p className="mono-font" style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: m.color }}>{m.value}</p>
                  <p style={{ fontSize: 9, color: "var(--muted-foreground)", marginTop: 2 }}>{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Explanation box */}
            <div style={{
              background: nextPrediction.rng.detectedType === "CSPRNG (Secure)" ? "rgba(16,185,129,0.05)" : "rgba(244,63,94,0.05)",
              border: `1px solid ${nextPrediction.rng.detectedType === "CSPRNG (Secure)" ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)"}`,
              borderRadius: 8,
              padding: "0.75rem",
              fontSize: 11,
              display: "flex",
              alignItems: "flex-start",
              gap: 8
            }}>
              <span style={{ fontSize: 13 }}>{nextPrediction.rng.detectedType === "CSPRNG (Secure)" ? "🛡️" : "⚠️"}</span>
              <div>
                <p style={{ fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>
                  {nextPrediction.rng.detectedType === "CSPRNG (Secure)" ? "ক্রিপ্টোগ্রাফিক সুরক্ষা সক্রিয়" : "গাণিতিক অসঙ্গতি সনাক্ত"}
                </p>
                <p style={{ color: "var(--muted-foreground)", lineHeight: 1.4 }}>
                  {nextPrediction.rng.explanation}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── HISTORY TABLE ────────────────────────────────── */}
        <section className="glass-panel fade-up" style={{ animationDelay: "0.25s" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: "1rem" }}>
            Verified History
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", textAlign: "left", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["PERIOD ID", "NUM", "COLOR", "SIGNAL", "RESULT"].map((h, i) => (
                    <th key={i} style={{ padding: "0 0.5rem 0.75rem", fontWeight: 700, fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.05em", borderBottom: "1.5px solid var(--border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="mono-font">
                {history.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.7rem 0.5rem", color: "var(--muted-foreground)", fontSize: 11 }}>
                      …{r.period.slice(-6)}
                    </td>
                    <td style={{ padding: "0.7rem 0.5rem", fontWeight: 800, fontSize: 13 }}>
                      {r.num}
                    </td>
                    <td style={{ padding: "0.7rem 0.5rem" }}>
                      <div style={{ display: "flex", gap: 5 }}>
                        {r.color.map((c, i) => (
                          <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: SIG_COLOR[c], display: "inline-block", boxShadow: `0 0 5px ${SIG_COLOR[c]}` }} />
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "0.7rem 0.5rem", fontWeight: 700, color: r.signalSize === "BIG" ? "var(--green)" : "var(--violet)" }}>
                      {r.signalSize} <span style={{ color: "var(--muted-foreground)" }}>({r.signalDigit})</span>
                    </td>
                    <td style={{ padding: "0.7rem 0.5rem" }}>
                      <span className={`badge ${r.win ? "badge-green" : "badge-red"}`}>
                        {r.win ? "✓ WIN" : "✗ MISS"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer style={{ textAlign: "center", fontSize: 11, color: "var(--muted-foreground)", padding: "0.5rem 0 1rem" }}>
          Signal Hub Terminal v2.5 · © 2025
        </footer>

      </div>
    </div>
  );
}
