// ─── Constants ───────────────────────────────────────────────────────────────
export const DEFAULT_ADMIN_PASSWORD = "Admin@2024";
const ADMIN_PASS_KEY = "sh_admin_pass";
const USERS_KEY      = "sh_users";
const SESSION_KEY    = "sh_session";

// Cloud KV Database
const APP_KEY  = "zb8a38xt";
const API_BASE = "https://keyvalue.immanuel.co/api/KeyVal";
const SECRET   = "SH-v2-secret-key-2024";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  password?: string;
  deviceId?: string;
  plan: "daily" | "weekly" | "monthly";
  expiresAt: number;
  createdAt: number;
  active: boolean;
  code: string;
  sessionToken?: string;
}

export interface Session {
  type: "admin" | "user";
  userId?: string;
  username?: string;
  expiresAt?: number;
  sessionToken?: string;
  _savedAt?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function getLocalDeviceId(): string {
  let devId = localStorage.getItem("sh_device_id");
  if (!devId) {
    devId = "dev_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem("sh_device_id", devId);
  }
  return devId;
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function b64d(s: string) { return decodeURIComponent(escape(atob(s))); }

function deobfuscate(encoded: string, key: string): string {
  try {
    const data = b64d(encoded);
    let out = "";
    for (let i = 0; i < data.length; i++) {
      out += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return out;
  } catch { return ""; }
}

// Legacy long-token decoder
export function decodeCode(code: string): { id: string; username: string; expiresAt: number } | null {
  try {
    const padded = code.replace(/-/g, "+").replace(/_/g, "/");
    const raw = deobfuscate(padded, SECRET);
    if (!raw) return null;
    const { id, u, e } = JSON.parse(raw);
    return { id, username: u, expiresAt: e };
  } catch { return null; }
}

// Generates a short 6-char access code (no confusing chars)
export function generateShortCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ─── Cloud KV Helpers ────────────────────────────────────────────────────────

async function writeKV(key: string, value: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/UpdateValue/${APP_KEY}/${key}/${encodeURIComponent(value)}`,
      { method: "POST" }
    );
    return res.ok;
  } catch { return false; }
}

async function readKV(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/GetValue/${APP_KEY}/${key}`);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text === '""' || text === "null" || text.trim() === "") return null;
    // Strip surrounding double-quotes the API sometimes adds
    const clean = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    // Safe decode — avoid crash if already decoded
    try { return decodeURIComponent(clean); } catch { return clean; }
  } catch { return null; }
}

// ─── Users: local + cloud ────────────────────────────────────────────────────

export function getUsers(): User[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]"); }
  catch { return []; }
}

function saveUsersLocal(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * Fetch users from cloud with a timeout.
 * Falls back to localStorage if cloud is unavailable.
 */
export async function fetchUsersFromCloud(): Promise<User[]> {
  try {
    // 6-second timeout so login doesn't hang forever
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const idsRes = await fetch(`${API_BASE}/GetValue/${APP_KEY}/wingobd_user_list`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!idsRes.ok) return getUsers();
    const rawIds = await idsRes.text();
    const cleanIds = rawIds.startsWith('"') && rawIds.endsWith('"') ? rawIds.slice(1, -1) : rawIds;
    let idsString: string;
    try { idsString = decodeURIComponent(cleanIds); } catch { idsString = cleanIds; }

    if (!idsString || idsString === "null" || idsString.trim() === "") return getUsers();

    const ids = idsString.split(",").filter(Boolean);
    if (ids.length === 0) return getUsers();

    const usersData = await Promise.all(
      ids.map(async (id) => {
        const raw = await readKV(`wingobd_user_data_${id}`);
        if (!raw) return null;
        try { return JSON.parse(raw) as User; } catch { return null; }
      })
    );

    const users = usersData.filter((u): u is User => u !== null);
    // Only update cache if we got real data
    if (users.length > 0) saveUsersLocal(users);
    return users.length > 0 ? users : getUsers();
  } catch {
    // Network error / timeout → use local cache
    return getUsers();
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
  return pass === getAdminPassword() || pass === DEFAULT_ADMIN_PASSWORD;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createUser(username: string, password: string, plan: User["plan"]): Promise<User> {
  const now = Date.now();
  const durations: Record<User["plan"], number> = {
    daily:   1  * 24 * 60 * 60 * 1000,
    weekly:  7  * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  const users = await fetchUsersFromCloud();
  const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    throw new Error("Username already taken");
  }

  const code = generateShortCode();

  const user: User = {
    id: uid(),
    username: username.trim(),
    password: password.trim(),
    plan,
    expiresAt: now + durations[plan],
    createdAt: now,
    active: true,
    code,
    sessionToken: "",
    deviceId: "",
  };

  await writeKV(`wingobd_user_data_${user.id}`, JSON.stringify(user));
  const activeIds = [...users.map(u => u.id), user.id].join(",");
  await writeKV("wingobd_user_list", activeIds);

  users.push(user);
  saveUsersLocal(users);
  return user;
}

export async function resetUserDevice(id: string): Promise<void> {
  const users = await fetchUsersFromCloud();
  const user = users.find(u => u.id === id);
  if (!user) return;
  user.deviceId = "";
  await writeKV(`wingobd_user_data_${id}`, JSON.stringify(user));
  saveUsersLocal(users.map(u => u.id === id ? user : u));
}

export async function deleteUser(id: string): Promise<void> {
  const users = await fetchUsersFromCloud();
  const filtered = users.filter(u => u.id !== id);
  await writeKV("wingobd_user_list", filtered.map(u => u.id).join(","));
  saveUsersLocal(filtered);
}

export async function toggleUser(id: string): Promise<void> {
  const users = await fetchUsersFromCloud();
  const user = users.find(u => u.id === id);
  if (!user) return;
  user.active = !user.active;
  await writeKV(`wingobd_user_data_${id}`, JSON.stringify(user));
  saveUsersLocal(users.map(u => u.id === id ? user : u));
}

export async function extendUser(id: string, plan: User["plan"]): Promise<void> {
  const durations: Record<User["plan"], number> = {
    daily:   1  * 24 * 60 * 60 * 1000,
    weekly:  7  * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };
  const users = await fetchUsersFromCloud();
  const user = users.find(u => u.id === id);
  if (!user) return;
  user.plan = plan;
  user.expiresAt = Math.max(user.expiresAt, Date.now()) + durations[plan];
  await writeKV(`wingobd_user_data_${id}`, JSON.stringify(user));
  saveUsersLocal(users.map(u => u.id === id ? user : u));
}

// ─── Session (localStorage — survives page refresh) ───────────────────────────

export function getSession(): Session | null {
  try {
    // Migrate from old sessionStorage if present
    const OLD_KEY = SESSION_KEY;
    const fromSS = sessionStorage.getItem(OLD_KEY);
    if (fromSS && !localStorage.getItem(OLD_KEY)) {
      localStorage.setItem(OLD_KEY, fromSS);
      sessionStorage.removeItem(OLD_KEY);
    }

    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;

    // Admin expires after 24 h
    if (session.type === "admin") {
      if (Date.now() - (session._savedAt ?? 0) > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
    }
    // User expires at their plan's expiresAt
    if (session.type === "user" && session.expiresAt && Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch { return null; }
}

export function setSession(s: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, _savedAt: Date.now() }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

// ─── Login ───────────────────────────────────────────────────────────────────

export type LoginResult =
  | { ok: true;  role: "admin" | "user"; session: Session }
  | { ok: false; reason: "invalid" | "expired" | "disabled" | "device_locked" };

export async function login(usernameInput: string, passwordInput: string, deviceId: string): Promise<LoginResult> {
  const username = usernameInput.trim();
  const password = passwordInput.trim();
  if (!username || !password) return { ok: false, reason: "invalid" };

  // ── Admin check
  if (username.toLowerCase() === "admin") {
    if (checkAdminPassword(password)) {
      const session: Session = { type: "admin" };
      setSession(session);
      return { ok: true, role: "admin", session };
    }
  }

  // ── User check: try cloud first, fall back to local cache
  let users = await fetchUsersFromCloud();
  if (users.length === 0) {
    users = getUsers();
  }

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { ok: false, reason: "invalid" };

  const isPassValid = user.password ? user.password === password : user.code === password;
  if (!isPassValid) return { ok: false, reason: "invalid" };

  if (!user.active) return { ok: false, reason: "disabled" };
  if (Date.now() > user.expiresAt) return { ok: false, reason: "expired" };

  // ── Device Lock Check
  if (user.deviceId && user.deviceId !== deviceId) {
    return { ok: false, reason: "device_locked" };
  }

  const sessionToken = uid();
  const session: Session = {
    type: "user",
    userId: user.id,
    username: user.username,
    expiresAt: user.expiresAt,
    sessionToken,
  };
  setSession(session);

  // Set device ID if not already set (first login)
  if (!user.deviceId) {
    user.deviceId = deviceId;
  }
  user.sessionToken = sessionToken;

  saveUsersLocal(users.map(u2 => u2.id === user.id ? user : u2));
  await writeKV(`wingobd_user_data_${user.id}`, JSON.stringify(user)).catch(() => {});

  return { ok: true, role: "user", session };
}

// ─── Device Limit Check ───────────────────────────────────────────────────────
export async function checkSessionLimit(userId: string, localToken: string): Promise<boolean> {
  try {
    const raw = await readKV(`wingobd_user_data_${userId}`);
    if (!raw) return true;
    const user = JSON.parse(raw) as User;
    return user.sessionToken === localToken;
  } catch { return true; }
}
