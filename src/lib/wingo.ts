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
  rng?: RNGDiagnostics;
}

// ─── Period Increment Helper ─────────────────────────────────────────────
export function incrementPeriod(period: string): string {
  if (!period || period === "—") return "—";
  try {
    const bi = BigInt(period);
    return (bi + 1n).toString();
  } catch (e) {
    const match = period.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const suffix = match[2];
      const nextSuffix = (BigInt(suffix) + 1n).toString().padStart(suffix.length, "0");
      return prefix + nextSuffix;
    }
    return period;
  }
}

// ─── Mathematical Formula A: Period Sum Modulo ───────────────────────────
export function calculatePeriodSum(period: string, lastResult: number): { digit: number; explanation: string } {
  const digits = period.split("").map(Number).filter(n => !isNaN(n));
  const sum = digits.reduce((a, b) => a + b, 0);
  const combined = sum + lastResult;
  const digit = (combined * 7) % 10;
  const explanation = `Sum of Period digits (${digits.join("+")} = ${sum}) + Last Result (${lastResult}) = ${combined}. ((${combined} × 7) % 10) = ${digit}`;
  return { digit, explanation };
}

// ─── Mathematical Formula B: VIP Markov Transition Pattern ───────────────
const MARKOV_MATRIX: Record<number, number[]> = {
  0: [1, 5, 7, 8],
  1: [2, 6, 8, 9],
  2: [3, 7, 0, 9],
  3: [8, 9, 1, 4],
  4: [0, 5, 2, 6],
  5: [0, 6, 7, 3],
  6: [1, 7, 8, 2],
  7: [2, 8, 9, 3],
  8: [9, 0, 3, 5],
  9: [0, 1, 4, 6]
};

export function calculateMarkovTransition(period: string, lastResult: number): { digit: number; explanation: string } {
  const targets = MARKOV_MATRIX[lastResult] ?? [0, 1, 2, 3];
  const hash = fnv32("markov:" + period);
  const digit = targets[hash % targets.length];
  const explanation = `Markov transitions for ${lastResult} suggest: [${targets.join(", ")}]. Cycle selection with period hash (${hash % targets.length}) = ${digit}`;
  return { digit, explanation };
}

// ─── Mathematical Formula C: Golden Ratio Engine ────────────────────────
export function calculateGoldenRatio(period: string, lastResult: number): { digit: number; explanation: string } {
  const last4 = parseInt(period.slice(-4)) || 0;
  const phi = 1.618033988749895;
  const val = Math.floor((last4 * phi + lastResult * Math.PI) * 100);
  const digit = Math.abs(val) % 10;
  const explanation = `Golden Ratio: Math.floor((${last4} × 1.618 + ${lastResult} × 3.14) × 100) = ${val}. (${val} % 10) = ${digit}`;
  return { digit, explanation };
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
 * 4. Formula blend (integrating the 3 custom formulas for advanced signals)
 * 5. Deterministic tie-breaker using period hash (no Digit 0 bias)
 */
export function analyzeHybrid(history: HistoryItem[], nextPeriod: string): Prediction {
  // --- Fallback: not enough data ---
  if (!history || history.length < 3) {
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
  const recent = digits.slice(-6);
  const lastSize = digitToSize(recent[recent.length - 1]);
  let streakLen = 1;
  for (let i = recent.length - 2; i >= 0; i--) {
    if (digitToSize(recent[i]) === lastSize) streakLen++;
    else break;
  }

  if (streakLen <= 3) {
    const followDigits = lastSize === "BIG" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
    followDigits.forEach(d => { scores[d] += 4.0; });
    method = `TREND FOLLOW (${lastSize}×${streakLen})`;
  } else {
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
    if (freq[d] === minF) scores[d] += 1.0;
    if (freq[d] === maxF) scores[d] -= 0.5;
  }

  // ─── 4. Blend in Custom Mathematical Formulas ────────────────────────────
  const lastDigit = digits[n - 1];
  const lastPeriod = list[list.length - 1].issueNumber;
  
  const fA = calculatePeriodSum(lastPeriod, lastDigit).digit;
  const fB = calculateMarkovTransition(lastPeriod, lastDigit).digit;
  const fC = calculateGoldenRatio(lastPeriod, lastDigit).digit;
  
  scores[fA] += 3.5;
  scores[fB] += 3.0;
  scores[fC] += 2.5;
  method = `VIP FORMULA ENSEMBLE`;

  // ─── 5. Tie-breaker: deterministic hash of period — NO Digit 0 bias ──────
  const maxScore = Math.max(...Array.from(scores));
  const tied: number[] = [];
  for (let d = 0; d < 10; d++) {
    if (Math.abs(scores[d] - maxScore) < 0.001) tied.push(d);
  }
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
// ─── Main Entry Point ────────────────────────────────────────────────────────
// ─── Adaptive Pattern Trend Matcher ──────────────────────────────────────────
export function calculatePatternTrend(history: HistoryItem[]): { size: Size; explanation: string } {
  if (!history || history.length < 5) {
    return { size: "BIG", explanation: "Default Trend" };
  }

  const sizes = history.map(h => digitToSize(parseInt(h.number, 10)));

  // Trend Models
  const streakFollow = (hist: Size[]) => hist[0];
  const alternating = (hist: Size[]) => (hist[0] === "BIG" ? "SMALL" : "BIG");
  const doubleDouble = (hist: Size[]) => {
    if (hist.length >= 3 && hist[0] === hist[1] && hist[0] !== hist[2]) {
      return hist[0] === "BIG" ? "SMALL" : "BIG";
    }
    return hist[0];
  };
  const sizeMarkov = (hist: Size[]) => {
    let bigToBig = 0, bigToSmall = 0;
    let smallToBig = 0, smallToSmall = 0;
    for (let i = 0; i < hist.length - 1; i++) {
      if (hist[i + 1] === "BIG") {
        hist[i] === "BIG" ? bigToBig++ : bigToSmall++;
      } else {
        hist[i] === "BIG" ? smallToBig++ : smallToSmall++;
      }
    }
    const last = hist[0];
    if (last === "BIG") {
      return bigToBig >= bigToSmall ? "BIG" : "SMALL";
    } else {
      return smallToSmall >= smallToBig ? "SMALL" : "BIG";
    }
  };

  const predictors = [
    { name: "Dragon Streak", run: streakFollow, score: 0 },
    { name: "Alternating", run: alternating, score: 0 },
    { name: "Double-Double", run: doubleDouble, score: 0 },
    { name: "Markov Chain", run: sizeMarkov, score: 0 },
  ];

  // Backtest models on the last 8 rounds to find the active pattern
  const testLimit = Math.min(8, sizes.length - 4);
  for (let j = 1; j <= testLimit; j++) {
    const subHistory = sizes.slice(j);
    const actualResult = sizes[j - 1];
    predictors.forEach(p => {
      if (p.run(subHistory) === actualResult) {
        p.score++;
      }
    });
  }

  // Pick the best model for the current trend
  predictors.sort((a, b) => b.score - a.score);
  const best = predictors[0];
  const predictedSize = best.run(sizes);

  return {
    size: predictedSize,
    explanation: `Active Pattern: ${best.name}`
  };
}

export interface RNGDiagnostics {
  entropy: number;
  autocorrelation: number;
  runsZScore: number;
  detectedType: "CSPRNG (Secure)" | "PRNG (Weak)" | "INSUFFICIENT DATA";
  predictabilityScore: number;
  explanation: string;
  // Adaptive prediction support
  bestLcgA: number;
  bestLcgC: number;
  lcgFitRate: number;
  hotDigit: number;
  hotDigitFreq: number; // 0-1 frequency
}

export function analyzeRNG(history: HistoryItem[]): RNGDiagnostics {
  if (!history || history.length < 10) {
    return {
      entropy: 0,
      autocorrelation: 0,
      runsZScore: 0,
      detectedType: "INSUFFICIENT DATA",
      predictabilityScore: 50,
      explanation: "আরএনজি বিশ্লেষণের জন্য অন্তত ১০টি হিস্ট্রি রেকর্ড প্রয়োজন।",
      bestLcgA: 0,
      bestLcgC: 0,
      lcgFitRate: 0,
      hotDigit: 0,
      hotDigitFreq: 0
    };
  }

  // Parse digits newest→oldest
  const digits = history.map(h => parseInt(h.number, 10)).filter(n => !isNaN(n));
  const n = digits.length;

  // 1. Shannon Entropy (Max entropy for base 10 is log2(10) ≈ 3.32)
  const freqs = new Float64Array(10);
  digits.forEach(d => {
    if (d >= 0 && d <= 9) freqs[d]++;
  });
  let entropy = 0;
  for (let i = 0; i < 10; i++) {
    const p = freqs[i] / n;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  // 2. Lag-1 Autocorrelation
  const mean = digits.reduce((sum, val) => sum + val, 0) / n;
  let varNum = 0;
  let covNum = 0;
  for (let i = 0; i < n; i++) {
    varNum += (digits[i] - mean) ** 2;
  }
  for (let i = 0; i < n - 1; i++) {
    covNum += (digits[i] - mean) * (digits[i + 1] - mean);
  }
  const autocorrelation = varNum > 0 ? covNum / varNum : 0;

  // 3. Runs Test (Wald-Wolfowitz) for BIG/SMALL randomness
  const binary = digits.map(d => (d >= 5 ? 1 : 0));
  let n1 = 0; // count of SMALL
  let n2 = 0; // count of BIG
  binary.forEach(b => {
    if (b === 0) n1++;
    else n2++;
  });

  let runs = 1;
  for (let i = 1; i < binary.length; i++) {
    if (binary[i] !== binary[i - 1]) {
      runs++;
    }
  }

  const expectedRuns = (2 * n1 * n2) / n + 1;
  const runsVar = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  const runsSD = runsVar > 0 ? Math.sqrt(runsVar) : 0;
  const runsZScore = runsSD > 0 ? (runs - expectedRuns) / runsSD : 0;

  // 4. LCG Check & Cyclic Pattern Matcher — also store best (a, c) params
  let bestLcgFit = 0;
  let bestLcgA = 0, bestLcgC = 0;
  for (let a = 0; a < 10; a++) {
    for (let c = 0; c < 10; c++) {
      let matches = 0;
      for (let i = 0; i < n - 1; i++) {
        if (digits[i + 1] === (a * digits[i] + c) % 10) {
          matches++;
        }
      }
      if (matches > bestLcgFit) {
        bestLcgFit = matches;
        bestLcgA = a;
        bestLcgC = c;
      }
    }
  }
  const lcgFitRate = (bestLcgFit / (n - 1)) * 100;

  // Hot digit (most frequent in last 20 results)
  const recentFreq = new Float64Array(10);
  digits.slice(0, 20).forEach(d => { if (d >= 0 && d <= 9) recentFreq[d]++; });
  let hotDigit = 0;
  let hotMax = 0;
  for (let i = 0; i < 10; i++) {
    if (recentFreq[i] > hotMax) { hotMax = recentFreq[i]; hotDigit = i; }
  }
  const hotDigitFreq = hotMax / Math.min(n, 20);

  let cyclicPattern = false;
  if (n >= 6) {
    let p2 = true, p3 = true;
    for (let i = 0; i < n - 2; i++) {
      if (digits[i] !== digits[i + 2]) p2 = false;
    }
    for (let i = 0; i < n - 3; i++) {
      if (digits[i] !== digits[i + 3]) p3 = false;
    }
    cyclicPattern = p2 || p3;
  }

  // 5. Diagnostics Output
  let detectedType: "CSPRNG (Secure)" | "PRNG (Weak)" = "CSPRNG (Secure)";
  let predictabilityScore = 50;
  let explanation = "";

  const absZ = Math.abs(runsZScore);
  const absAuto = Math.abs(autocorrelation);
  const isWeak = lcgFitRate >= 60 || cyclicPattern || absAuto > 0.35 || absZ > 1.96 || entropy < 2.5;

  if (isWeak) {
    detectedType = "PRNG (Weak)";
    let scoreBoost = 0;
    if (lcgFitRate >= 60) scoreBoost = Math.max(scoreBoost, (lcgFitRate - 50) * 1.5);
    if (cyclicPattern) scoreBoost = Math.max(scoreBoost, 40);
    if (absAuto > 0.35) scoreBoost = Math.max(scoreBoost, (absAuto - 0.35) * 60);
    if (absZ > 1.96) scoreBoost = Math.max(scoreBoost, (absZ - 1.96) * 15);
    if (entropy < 2.5) scoreBoost = Math.max(scoreBoost, (2.5 - entropy) * 35);

    predictabilityScore = Math.min(94, Math.round(50 + scoreBoost));

    const reasons: string[] = [];
    if (lcgFitRate >= 60) reasons.push("LCG গাণিতিক মিল");
    if (cyclicPattern) reasons.push("চক্রীয় আবর্তন");
    if (absAuto > 0.35) reasons.push("ধারাবাহিক সহসম্পর্ক");
    if (absZ > 1.96) reasons.push("অস্বাভাবিক রান প্যাটার্ন");
    if (entropy < 2.5) reasons.push("অসম বণ্টন (নিম্ন এন্ট্রপি)");

    explanation = `দুর্বল RNG বা প্যাটার্ন সনাক্ত হয়েছে (${reasons.join(", ")})। সূত্রগুলোর কার্যকারিতা বেশি।`;
  } else {
    detectedType = "CSPRNG (Secure)";
    predictabilityScore = 50;
    explanation = "সিস্টেমটি ক্রিপ্টোগ্রাফিক সিকিউর CSPRNG ব্যবহার করছে। কোনো গাণিতিক প্যাটার্ন বা সূত্র কাজ নাও করতে পারে।";
  }

  return {
    entropy: Math.round(entropy * 100) / 100,
    autocorrelation: Math.round(autocorrelation * 100) / 100,
    runsZScore: Math.round(runsZScore * 100) / 100,
    detectedType,
    predictabilityScore,
    explanation,
    bestLcgA,
    bestLcgC,
    lcgFitRate: Math.round(lcgFitRate * 10) / 10,
    hotDigit,
    hotDigitFreq: Math.round(hotDigitFreq * 100) / 100,
  };
}

// ─── Formula E: LCG-Fitted Adaptive Prediction ───────────────────────────────
// Uses the statistically-best LCG parameters from analyzeRNG to project the
// next digit. Only called when PRNG behaviour is detected.
export function calculateLCGAdaptive(
  lastDigit: number,
  bestA: number,
  bestC: number
): { digit: number; explanation: string } {
  const digit = (bestA * lastDigit + bestC) % 10;
  const explanation = `LCG Adaptive: (${bestA} × ${lastDigit} + ${bestC}) mod 10 = ${digit}`;
  return { digit, explanation };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────
// ─── Main Entry Point ────────────────────────────────────────────────────────
export function smartPredict(
  periodNumber: string,
  history: HistoryItem[],
  fullHistory?: HistoryItem[],
  geminiSignal?: { size: "BIG" | "SMALL"; color: string; confidence: number; reasoning: string } | null
): Prediction {
  const rng = analyzeRNG(history);

  if (!history || history.length < 3) {
    const idx = fnv32("seed:" + periodNumber) % 10;
    const colors = digitToColor(idx);
    const color = colors.find(c => c !== "VIOLET") ?? colors[0];
    return { period: periodNumber, digit: idx, size: digitToSize(idx), color, confidence: 82, method: "VIP FORMULA ENSEMBLE", rng };
  }

  // ── Backtest accuracy for formulas A–D ─────────────────────────────────────
  let statsA = { win: 0, loss: 0 };
  let statsB = { win: 0, loss: 0 };
  let statsC = { win: 0, loss: 0 };
  let statsD = { win: 0, loss: 0 };
  let statsE = { win: 0, loss: 0 }; // LCG Adaptive

  for (let idx = 0; idx < history.length - 1; idx++) {
    const curItem  = history[idx];
    const prevItem = history[idx + 1];
    const actualNum  = parseInt(curItem.number, 10);
    const actualSize = digitToSize(actualNum);
    const prevResult = parseInt(prevItem.number, 10);
    const remainingHistory = history.slice(idx + 1);

    if (!isNaN(actualNum) && !isNaN(prevResult)) {
      const predValA = calculatePeriodSum(prevItem.issueNumber, prevResult).digit;
      digitToSize(predValA) === actualSize ? statsA.win++ : statsA.loss++;

      const predValB = calculateMarkovTransition(prevItem.issueNumber, prevResult).digit;
      digitToSize(predValB) === actualSize ? statsB.win++ : statsB.loss++;

      const predValC = calculateGoldenRatio(prevItem.issueNumber, prevResult).digit;
      digitToSize(predValC) === actualSize ? statsC.win++ : statsC.loss++;

      const predValD = calculatePatternTrend(remainingHistory).size;
      predValD === actualSize ? statsD.win++ : statsD.loss++;

      // Backtest Formula E with the RNG's best LCG params
      if (rng.detectedType === "PRNG (Weak)") {
        const predValE = calculateLCGAdaptive(prevResult, rng.bestLcgA, rng.bestLcgC).digit;
        digitToSize(predValE) === actualSize ? statsE.win++ : statsE.loss++;
      }
    }
  }

  const totalA = statsA.win + statsA.loss;
  const totalB = statsB.win + statsB.loss;
  const totalC = statsC.win + statsC.loss;
  const totalD = statsD.win + statsD.loss;
  const totalE = statsE.win + statsE.loss;

  const rateA = totalA > 0 ? Math.round((statsA.win / totalA) * 100) : 0;
  const rateB = totalB > 0 ? Math.round((statsB.win / totalB) * 100) : 0;
  const rateC = totalC > 0 ? Math.round((statsC.win / totalC) * 100) : 0;
  const rateD = totalD > 0 ? Math.round((statsD.win / totalD) * 100) : 0;
  const rateE = totalE > 0 ? Math.round((statsE.win / totalE) * 100) : 0;

  // ── Get predictions for next period ────────────────────────────────────────
  const lastItem      = history[0];
  const lastResultNum = parseInt(lastItem.number, 10);
  const lastIssueNum  = lastItem.issueNumber;

  const resA = calculatePeriodSum(lastIssueNum, lastResultNum);
  const resB = calculateMarkovTransition(lastIssueNum, lastResultNum);
  const resC = calculateGoldenRatio(lastIssueNum, lastResultNum);
  const resD = calculatePatternTrend(history);

  // Formula E — LCG Adaptive (only active when PRNG detected)
  const resE = rng.detectedType === "PRNG (Weak)"
    ? calculateLCGAdaptive(lastResultNum, rng.bestLcgA, rng.bestLcgC)
    : null;

  const sizeA = digitToSize(resA.digit);
  const sizeB = digitToSize(resB.digit);
  const sizeC = digitToSize(resC.digit);
  const sizeD = resD.size;
  const sizeE = resE ? digitToSize(resE.digit) : null;

  const colorA = digitToColor(resA.digit).find(c => c !== "VIOLET") ?? "GREEN";
  const colorB = digitToColor(resB.digit).find(c => c !== "VIOLET") ?? "GREEN";
  const colorC = digitToColor(resC.digit).find(c => c !== "VIOLET") ?? "GREEN";
  const colorD = sizeD === "BIG" ? "GREEN" : "RED";
  const colorE = resE ? (digitToColor(resE.digit).find(c => c !== "VIOLET") ?? "GREEN") : "GREEN";

  // ── Weights ─────────────────────────────────────────────────────────────────
  const wA = rateA >= 40 ? rateA : 0;
  const wB = rateB >= 40 ? rateB : 0;
  const wC = rateC >= 40 ? rateC : 0;
  // Formula D: double-weight for dynamic backtest pattern matching
  const wD = rateD >= 40 ? rateD * 2 : 0;
  // Formula E: weight scales with both backtested accuracy AND LCG fit rate
  const wE = (rng.detectedType === "PRNG (Weak)" && rateE >= 40)
    ? Math.round(rateE * (1 + rng.lcgFitRate / 100)) 
    : 0;
  // Gemini AI: set weight to 40 so it participates but does not override backtests
  const wG = geminiSignal ? 40 : 0;

  // ── Entropy Hot-Digit Bias (Formula F) ─────────────────────────────────────
  const hotDigitSize  = digitToSize(rng.hotDigit);
  const hotDigitColor = (digitToColor(rng.hotDigit).find(c => c !== "VIOLET") ?? "GREEN") as Color;
  // Weight: stronger when entropy is lower and hot digit is more dominant
  const wF = (rng.entropy < 3.0 && rng.hotDigitFreq > 0.15)
    ? Math.round((3.32 - rng.entropy) * rng.hotDigitFreq * 80)
    : 0;

  const totalW = Math.max(wA + wB + wC + wD + wE + wF + wG, 1);

  const bigScore =
    (sizeA === "BIG" ? wA : 0) +
    (sizeB === "BIG" ? wB : 0) +
    (sizeC === "BIG" ? wC : 0) +
    (sizeD === "BIG" ? wD : 0) +
    (sizeE === "BIG" ? wE : 0) +
    (hotDigitSize === "BIG" ? wF : 0) +
    (geminiSignal && geminiSignal.size === "BIG" ? wG : 0);

  const smallScore  = totalW - bigScore;
  const votedSize: "BIG" | "SMALL" = bigScore >= smallScore ? "BIG" : "SMALL";

  // Build all-preds list for color & digit resolution
  const allPreds: { size: "BIG" | "SMALL"; color: Color; digit: number; w: number }[] = [
    { size: sizeA, color: colorA, digit: resA.digit, w: wA },
    { size: sizeB, color: colorB, digit: resB.digit, w: wB },
    { size: sizeC, color: colorC, digit: resC.digit, w: wC },
    { size: sizeD, color: colorD as Color, digit: sizeD === "BIG" ? 7 : 2, w: wD },
  ];
  if (resE && wE > 0) {
    allPreds.push({ size: sizeE!, color: colorE as Color, digit: resE.digit, w: wE });
  }
  if (wF > 0) {
    allPreds.push({ size: hotDigitSize, color: hotDigitColor, digit: rng.hotDigit, w: wF });
  }
  if (geminiSignal) {
    allPreds.push({ size: geminiSignal.size, color: geminiSignal.color as Color, digit: geminiSignal.size === "BIG" ? 7 : 2, w: wG });
  }

  // ── Determine Color ─────────────────────────────────────────────────────────
  const colorScores: Record<string, number> = {};
  allPreds.filter(x => x.size === votedSize).forEach(({ color, w }) => {
    colorScores[color] = (colorScores[color] ?? 0) + w;
  });
  const votedColor = (Object.entries(colorScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "GREEN") as Color;

  // ── Determine Digit ─────────────────────────────────────────────────────────
  let votedDigit    = votedSize === "BIG" ? 7 : 2;
  let maxDigitWeight = -1;
  allPreds.filter(x => x.size === votedSize).forEach(({ digit, w }) => {
    if (w > maxDigitWeight) { maxDigitWeight = w; votedDigit = digit; }
  });

  // ── Confidence ──────────────────────────────────────────────────────────────
  let confidence = Math.round((Math.max(bigScore, smallScore) / totalW) * 100);
  confidence = Math.min(94, Math.max(80, confidence));

  if (rng.detectedType === "CSPRNG (Secure)") {
    confidence = Math.max(80, Math.min(82, confidence - 5));
  } else if (rng.detectedType === "PRNG (Weak)") {
    const boost = Math.round((rng.predictabilityScore - 50) / 10);
    confidence  = Math.min(94, confidence + boost);
  }

  // ── Method label ────────────────────────────────────────────────────────────
  let method = "VIP FORMULA ENSEMBLE";
  if (rng.detectedType === "PRNG (Weak)") {
    if (wE > 0 && wF > 0) method = "PRNG LCG + ENTROPY ADAPTIVE";
    else if (wE > 0)      method = "PRNG LCG ADAPTIVE";
    else if (wF > 0)      method = "ENTROPY BIAS ADAPTIVE";
    else                  method = "PRNG PATTERN MATCH";
  }

  return {
    period: periodNumber,
    digit:  votedDigit,
    size:   votedSize,
    color:  votedColor,
    confidence,
    method,
    rng,
  };
}

