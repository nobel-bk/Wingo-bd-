// ─── Constants ───────────────────────────────────────────────────────────────
export const DEFAULT_ADMIN_PASSWORD = "Admin@2024";
const ADMIN_PASS_KEY  = "sh_admin_pass";
const USERS_KEY       = "sh_users";
const SESSION_KEY     = "sh_session";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  plan: "daily" | "weekly" | "monthly";
  expiresAt: number; // unix ms
  createdAt: number;
  active: boolean;
  code: string;      // login code given to user
}

export interface Session {
  type: "admin" | "user";
  userId?: string;
  username?: string;
  expiresAt?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function b64e(s: string) { return btoa(unescape(encodeURIComponent(s))); }
function b64d(s: string) { return decodeURIComponent(escape(atob(s))); }

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Simple XOR obfuscation so codes aren't plain text */
function obfuscate(data: string, key: string): string {
  let out = "";
  for (let i = 0; i < data.length; i++) {
    out += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return b64e(out);
}
function deobfuscate(encoded: string, key: string): string {
  const data = b64d(encoded);
  let out = "";
  for (let i = 0; i < data.length; i++) {
    out += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

const SECRET = "SH-v2-secret-key-2024";

/** Generate a user login code encoding {id, username, expiresAt} */
export function generateCode(user: User): string {
  const payload = JSON.stringify({ id: user.id, u: user.username, e: user.expiresAt });
  return obfuscate(payload, SECRET).replace(/[+/=]/g, (c) =>
    c === "+" ? "-" : c === "/" ? "_" : ""
  );
}

/** Decode a user code → null if invalid */
export function decodeCode(code: string): { id: string; username: string; expiresAt: number } | null {
  try {
    const padded = code.replace(/-/g, "+").replace(/_/g, "/");
    const raw = deobfuscate(padded, SECRET);
    const { id, u, e } = JSON.parse(raw);
    return { id, username: u, expiresAt: e };
  } catch {
    return null;
  }
}

// ─── Admin password ───────────────────────────────────────────────────────────
export function getAdminPassword(): string {
  return localStorage.getItem(ADMIN_PASS_KEY) ?? DEFAULT_ADMIN_PASSWORD;
}
export function setAdminPassword(newPass: string) {
  localStorage.setItem(ADMIN_PASS_KEY, newPass);
}
export function checkAdminPassword(pass: string): boolean {
  return pass === getAdminPassword();
}

// ─── Users storage ────────────────────────────────────────────────────────────
export function getUsers(): User[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]"); } catch { return []; }
}
function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function createUser(username: string, plan: User["plan"]): User {
  const now = Date.now();
  const durations: Record<User["plan"], number> = {
    daily:   1  * 24 * 60 * 60 * 1000,
    weekly:  7  * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };
  const user: User = {
    id: uid(), username, plan,
    expiresAt: now + durations[plan],
    createdAt: now, active: true, code: "",
  };
  user.code = generateCode(user);
  const users = getUsers();
  users.push(user);
  saveUsers(users);
  return user;
}

export function deleteUser(id: string) {
  saveUsers(getUsers().filter((u) => u.id !== id));
}

export function toggleUser(id: string) {
  const users = getUsers().map((u) => u.id === id ? { ...u, active: !u.active } : u);
  saveUsers(users);
}

export function extendUser(id: string, plan: User["plan"]) {
  const durations: Record<User["plan"], number> = {
    daily:   1  * 24 * 60 * 60 * 1000,
    weekly:  7  * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };
  const users = getUsers().map((u) => {
    if (u.id !== id) return u;
    const base = Math.max(u.expiresAt, Date.now());
    const updated = { ...u, plan, expiresAt: base + durations[plan] };
    updated.code = generateCode(updated);
    return updated;
  });
  saveUsers(users);
}

// ─── Session ──────────────────────────────────────────────────────────────────
export function getSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null"); } catch { return null; }
}
export function setSession(s: Session) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
export function clearSession()          { sessionStorage.removeItem(SESSION_KEY); }

// ─── Login ────────────────────────────────────────────────────────────────────
export type LoginResult =
  | { ok: true;  role: "admin" | "user"; session: Session }
  | { ok: false; reason: "invalid" | "expired" | "disabled" };

export function login(input: string): LoginResult {
  // Admin check
  if (checkAdminPassword(input)) {
    const session: Session = { type: "admin" };
    setSession(session);
    return { ok: true, role: "admin", session };
  }

  // User code check
  const decoded = decodeCode(input.trim());
  if (!decoded) return { ok: false, reason: "invalid" };

  const users = getUsers();
  const user = users.find((u) => u.id === decoded.id);
  if (!user || !user.active) return { ok: false, reason: "disabled" };
  if (Date.now() > user.expiresAt) return { ok: false, reason: "expired" };

  const session: Session = { type: "user", userId: user.id, username: user.username, expiresAt: user.expiresAt };
  setSession(session);
  return { ok: true, role: "user", session };
}
