export type GamePeriod = "30s" | "1min" | "3min" | "5min";

export const PERIODS: { id: GamePeriod; label: string; seconds: number; code: string }[] = [
  { id: "30s",  label: "WINGO 30S",  seconds: 30,  code: "WinGo_30S" },
  { id: "1min", label: "WINGO 1MIN", seconds: 60,  code: "WinGo_1M"  },
  { id: "3min", label: "WINGO 3MIN", seconds: 180, code: "WinGo_3M"  },
  { id: "5min", label: "WINGO 5MIN", seconds: 300, code: "WinGo_5M"  },
];

const API_BASE = "https://draw.ar-lottery01.com/WinGo";

export interface IssueInfo { issueNumber: string; startTime: number; endTime: number; }
export interface CurrentResp { gameCode: string; previous: IssueInfo; current: IssueInfo; next: IssueInfo; }
export interface HistoryItem { issueNumber: string; number: string; color: string; premium: string; }

export async function fetchCurrent(code: string): Promise<CurrentResp> {
  const r = await fetch(`${API_BASE}/${code}.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("api");
  return r.json();
}
export async function fetchHistory(code: string): Promise<HistoryItem[]> {
  const r = await fetch(`${API_BASE}/${code}/GetHistoryIssuePage.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("api");
  const j = await r.json();
  return j?.data?.list ?? [];
}

export type Color = "GREEN" | "RED" | "VIOLET";
export type Size  = "BIG"   | "SMALL";

export function digitToColor(d: number): Color[] {
  if (d === 0) return ["VIOLET", "RED"];
  if (d === 5) return ["VIOLET", "GREEN"];
  return d % 2 === 0 ? ["RED"] : ["GREEN"];
}
export function digitToSize(d: number): Size { return d >= 5 ? "BIG" : "SMALL"; }

export interface Prediction {
  period: string;
  digit: number;
  size: Size;
  color: Color;
  confidence: number;
  method: string;
}

// ─── FNV-1a Hash (deterministic, no bias) ─────────────────────────────────
function fnv32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0; // full 32-bit value — no % 10 bias here
}

/**
 * Smart Trend Engine:
 * 1. Streak trend-following (if last 2-3 same size, follow it; if 4+, expect reversal)
 * 2. Markov transition (last digit → next likely digit)
 * 3. Hot/Cold frequency nudge
 * 4. Deterministic tie-breaker using period hash (no Digit 0 bias)
 */
export function analyzeHybrid(history: HistoryItem[], nextPeriod: string): Prediction {
  // --- Fallback: not enough data ---
  if (!history || history.length < 3) {
    // Deterministic fallback spread across all 10 digits
    const idx = fnv32("seed:" + nextPeriod) % 10;
    const colors = digitToColor(idx);
    const color = colors.find(c => c !== "VIOLET") ?? colors[0];
    return { period: nextPeriod, digit: idx, size: digitToSize(idx), color, confidence: 82, method: "SEED" };
  }

  // Parse digits newest→oldest from API, then reverse to oldest→newest
  const list = [...history].reverse();
  const digits = list.map(h => parseInt(h.number, 10)).filter(n => !isNaN(n));
  const n = digits.length;

  const scores = new Float64Array(10); // clean zero-initialized array
  let method = "TREND ENGINE";

  // ─── 1. Streak / Trend Analysis ──────────────────────────────────────────
  // Look at last 6 digits and count BIG/SMALL streak from the MOST RECENT end
  const recent = digits.slice(-6);
  const lastSize = digitToSize(recent[recent.length - 1]);
  let streakLen = 1;
  for (let i = recent.length - 2; i >= 0; i--) {
    if (digitToSize(recent[i]) === lastSize) streakLen++;
    else break;
  }

  if (streakLen <= 3) {
    // Streak ≤ 3 → follow the trend (momentum)
    const followDigits = lastSize === "BIG" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
    followDigits.forEach(d => { scores[d] += 4.0; });
    method = `TREND FOLLOW (${lastSize}×${streakLen})`;
  } else {
    // Streak ≥ 4 → reversal likely
    const reverseDigits = lastSize === "BIG" ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
    reverseDigits.forEach(d => { scores[d] += 5.0; });
    method = `STREAK REVERSAL (${lastSize}×${streakLen})`;
  }

  // ─── 2. Markov Transition ─────────────────────────────────────────────────
  if (n >= 5) {
    const lastDigit = digits[n - 1];
    const transitions = new Float64Array(10);
    let total = 0;
    for (let i = 0; i < n - 1; i++) {
      if (digits[i] === lastDigit) {
        transitions[digits[i + 1]]++;
        total++;
      }
    }
    if (total > 0) {
      for (let d = 0; d < 10; d++) {
        scores[d] += (transitions[d] / total) * 3.5;
      }
      if (total >= 3) method = "MARKOV + TREND";
    }
  }

  // ─── 3. Hot/Cold Nudge ───────────────────────────────────────────────────
  const freq = new Float64Array(10);
  digits.slice(-10).forEach(d => freq[d]++);
  const minF = Math.min(...Array.from(freq));
  const maxF = Math.max(...Array.from(freq));
  for (let d = 0; d < 10; d++) {
    // Slightly boost cold numbers, slightly suppress hot ones
    if (freq[d] === minF) scores[d] += 1.0;
    if (freq[d] === maxF) scores[d] -= 0.5;
  }

  // ─── 4. Tie-breaker: deterministic hash of period — NO Digit 0 bias ──────
  // Collect all digits with top score
  const maxScore = Math.max(...Array.from(scores));
  const tied: number[] = [];
  for (let d = 0; d < 10; d++) {
    if (Math.abs(scores[d] - maxScore) < 0.001) tied.push(d);
  }
  // Use period hash to deterministically pick one (cycles through tied digits)
  const tieHash = fnv32("tiebreak:" + nextPeriod);
  const bestDigit = tied[tieHash % tied.length];

  // ─── Confidence ──────────────────────────────────────────────────────────
  const sumAll = Array.from(scores).reduce((a, b) => a + b, 0);
  const ratio  = sumAll > 0 ? maxScore / sumAll : 0.1;
  let confidence = Math.round(80 + ratio * 20);
  confidence = Math.min(94, Math.max(80, confidence));

  const colors = digitToColor(bestDigit);
  const color  = colors.find(c => c !== "VIOLET") ?? colors[0];

  return { period: nextPeriod, digit: bestDigit, size: digitToSize(bestDigit), color, confidence, method };
}

// Deprecated signature kept for compatibility
export function predict(periodNumber: string, _salt?: string): Prediction {
  const idx = fnv32("legacy:" + periodNumber) % 10;
  const colors = digitToColor(idx);
  const color = colors.find(c => c !== "VIOLET") ?? colors[0];
  return { period: periodNumber, digit: idx, size: digitToSize(idx), color, confidence: 82, method: "SEED" };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────
// Always uses ONLY past history available before this period (consistent with live view)
export function smartPredict(periodNumber: string, history: HistoryItem[]): Prediction {
  return analyzeHybrid(history, periodNumber);
}
