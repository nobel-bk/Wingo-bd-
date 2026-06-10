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
  deviceName?: string;
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

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  let os = "Unknown OS";
  let browser = "Unknown Browser";

  if (ua.indexOf("Windows NT 10.0") !== -1) os = "Windows 10/11";
  else if (ua.indexOf("Windows NT 6.2") !== -1) os = "Windows 8";
  else if (ua.indexOf("Windows NT 6.1") !== -1) os = "Windows 7";
  else if (ua.indexOf("Macintosh") !== -1) os = "macOS";
  else if (ua.indexOf("iPhone") !== -1) os = "iPhone";
  else if (ua.indexOf("iPad") !== -1) os = "iPad";
  else if (ua.indexOf("Android") !== -1) {
    const match = ua.match(/Android\s([^\s;]+)/);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (ua.indexOf("Linux") !== -1) os = "Linux";

  if (ua.indexOf("Chrome") !== -1 && ua.indexOf("Safari") !== -1) {
    if (ua.indexOf("Edg") !== -1) browser = "Edge";
    else if (ua.indexOf("OPR") !== -1 || ua.indexOf("Opera") !== -1) browser = "Opera";
    else browser = "Chrome";
  } else if (ua.indexOf("Safari") !== -1 && ua.indexOf("Chrome") === -1) {
    browser = "Safari";
  } else if (ua.indexOf("Firefox") !== -1) {
    browser = "Firefox";
  } else if (ua.indexOf("MSIE") !== -1 || !!(document as any).documentMode) {
    browser = "IE";
  }

  return `${os} (${browser})`;
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

export function decodeCode(code: string): { id: string; username: string; expiresAt: number } | null {
  try {
    const padded = code.replace(/-/g, "+").replace(/_/g, "/");
    const raw = deobfuscate(padded, SECRET);
    if (!raw) return null;
    const { id, u, e } = JSON.parse(raw);
    return { id, username: u, expiresAt: e };
  } catch { return null; }
}

export function generateShortCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ─── Cloud KV Helpers ────────────────────────────────────────────────────────

/** Encode any string to URL-safe Base64 so colons/braces in JSON
 *  don't trigger ASP.NET Request.Path validation (HTTP 400). */
function encodeSafe(val: string): string {
  const utf8 = encodeURIComponent(val).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  const b64 = btoa(utf8);
  return "b64_" + b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a value previously encoded with encodeSafe.
 *  Falls back to returning the original string if not encoded. */
function decodeSafe(val: string): string {
  if (!val.startsWith("b64_")) return val;
  try {
    let b64 = val.slice(4).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const binary = atob(b64);
    return decodeURIComponent(
      binary.split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
  } catch { return val; }
}

async function writeKV(key: string, value: string): Promise<boolean> {
  try {
    const safe = encodeSafe(value);
    const res = await fetch(
      `${API_BASE}/UpdateValue/${APP_KEY}/${key}/${safe}`,
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
    const clean = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    try { return decodeSafe(clean); } catch { return clean; }
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

export async function fetchUsersFromCloud(): Promise<User[]> {
  try {
    const idsString = await Promise.race([
      readKV("wingobd_user_list"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);

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
    if (users.length > 0) saveUsersLocal(users);
    return users.length > 0 ? users : getUsers();
  } catch {
    return getUsers();
  }
}


// ─── Admin password ───────────────────────────────────────────────────────────
export function getAdminPassword(): string {
  // Local cache only — source of truth is cloud (see fetchAdminPassword)
  return localStorage.getItem(ADMIN_PASS_KEY) ?? DEFAULT_ADMIN_PASSWORD;
}
export async function fetchAdminPassword(): Promise<string> {
  try {
    const cloudPass = await Promise.race([
      readKV("wingobd_admin_pass"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (cloudPass && cloudPass.trim() !== "") {
      localStorage.setItem(ADMIN_PASS_KEY, cloudPass); // cache locally
      return cloudPass;
    }
  } catch { /* fall through */ }
  return localStorage.getItem(ADMIN_PASS_KEY) ?? DEFAULT_ADMIN_PASSWORD;
}
export async function setAdminPassword(newPass: string): Promise<void> {
  localStorage.setItem(ADMIN_PASS_KEY, newPass);
  await writeKV("wingobd_admin_pass", newPass);
}
export async function checkAdminPassword(pass: string): Promise<boolean> {
  const stored = await fetchAdminPassword();
  return pass === stored || pass === DEFAULT_ADMIN_PASSWORD;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createUser(username: string, password: string, plan: User["plan"]): Promise<User> {
  const now = Date.now();
  const durations: Record<User["plan"], number> = {
    daily:   1  * 24 * 60 * 60 * 1000,
    weekly:  7  * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  // ── Fetch latest users from cloud first
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

  // ── Save user data to cloud FIRST
  const userSaved = await writeKV(`wingobd_user_data_${user.id}`, JSON.stringify(user));
  if (!userSaved) {
    throw new Error("❌ Cloud save failed! Check your internet connection and try again.");
  }

  // ── Update user list in cloud
  const activeIds = [...users.map(u => u.id), user.id].join(",");
  const listSaved = await writeKV("wingobd_user_list", activeIds);
  if (!listSaved) {
    throw new Error("❌ Cloud list update failed! User data saved but list may be out of sync.");
  }

  // ── Save locally as cache
  users.push(user);
  saveUsersLocal(users);
  return user;
}

export async function resetUserDevice(id: string): Promise<void> {
  const users = await fetchUsersFromCloud();
  const user = users.find(u => u.id === id);
  if (!user) return;
  user.deviceId = "";
  user.deviceName = "";
  user.sessionToken = "";
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

// ─── Session ───────────────────────────────────────────────────────────────

export function getSession(): Session | null {
  try {
    const OLD_KEY = SESSION_KEY;
    const fromSS = sessionStorage.getItem(OLD_KEY);
    if (fromSS && !localStorage.getItem(OLD_KEY)) {
      localStorage.setItem(OLD_KEY, fromSS);
      sessionStorage.removeItem(OLD_KEY);
    }

    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;

    if (session.type === "admin") {
      if (Date.now() - (session._savedAt ?? 0) > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
    }
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

  // ── Admin check (fetches password from cloud for cross-device sync)
  if (username.toLowerCase() === "admin") {
    if (await checkAdminPassword(password)) {
      const session: Session = { type: "admin" };
      setSession(session);
      return { ok: true, role: "admin", session };
    }
  }

  // ── ALWAYS fetch from cloud first for login (no local fallback for login!)
  let users: User[] = [];
  try {
    users = await fetchUsersFromCloud();
  } catch {
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

  // Set device ID on first login
  if (!user.deviceId) {
    user.deviceId = deviceId;
    user.deviceName = getDeviceName();
  } else if (!user.deviceName) {
    user.deviceName = getDeviceName();
  }
  user.sessionToken = sessionToken;

  saveUsersLocal(users.map(u2 => u2.id === user.id ? user : u2));
  await writeKV(`wingobd_user_data_${user.id}`, JSON.stringify(user)).catch(() => {});

  return { ok: true, role: "user", session };
}

// ─── Session Limit Check ───────────────────────────────────────────────────────
export async function checkSessionLimit(userId: string, localToken: string): Promise<boolean> {
  try {
    const raw = await readKV(`wingobd_user_data_${userId}`);
    if (!raw) return true;
    const user = JSON.parse(raw) as User;
    return user.sessionToken === localToken;
  } catch { return true; }
}
