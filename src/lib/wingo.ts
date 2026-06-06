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

function hashDigit(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 10;
}

export type Color = "GREEN" | "RED" | "VIOLET";
export type Size  = "BIG"   | "SMALL";

export function digitToColor(d: number): Color[] {
  if (d === 0) return ["VIOLET", "RED"];
  if (d === 5) return ["VIOLET", "GREEN"];
  return d % 2 === 0 ? ["RED"] : ["GREEN"];
}
export function digitToSize(d: number): Size { return d >= 5 ? "BIG" : "SMALL"; }

export interface Prediction { period: string; digit: number; size: Size; color: Color; confidence: number; }

export function predict(periodNumber: string, salt = "signal-hub-v1"): Prediction {
  const d = hashDigit(salt + ":" + periodNumber);
  const colors = digitToColor(d);
  const color = colors.find((c) => c !== "VIOLET") ?? colors[0];
  const confSeed = hashDigit(salt + ":conf:" + periodNumber);
  const confidence = 70 + confSeed * 3;
  return { period: periodNumber, digit: d, size: digitToSize(d), color, confidence };
}
