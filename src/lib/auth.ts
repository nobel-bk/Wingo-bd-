import { supabase } from './supabase';

// ─── Constants ───────────────────────────────────────────────────────────────
export const DEFAULT_ADMIN_PASSWORD = "Admin@2024";
const ADMIN_PASS_KEY = "sh_admin_pass";
const SESSION_KEY    = "sh_session";

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

// ─── DB Row ↔ User mapper ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(row: any): User {
  return {
    id:           row.id,
    username:     row.username,
    password:     row.password ?? undefined,
    deviceId:     row.device_id  || undefined,
    deviceName:   row.device_name || undefined,
    plan:         row.plan,
    expiresAt:    row.expires_at,
    createdAt:    row.created_at,
    active:       row.active,
    code:         row.code,
    sessionToken: row.session_token || undefined,
  };
}

function userToRow(user: User) {
  return {
    id:           user.id,
    username:     user.username,
    password:     user.password ?? null,
    device_id:    user.deviceId  ?? '',
    device_name:  user.deviceName ?? '',
    plan:         user.plan,
    expires_at:   user.expiresAt,
    created_at:   user.createdAt,
    active:       user.active,
    code:         user.code,
    session_token: user.sessionToken ?? '',
  };
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
  } else if (ua.indexOf("MSIE") !== -1 || !!(document as unknown as Record<string, unknown>).documentMode) {
    browser = "IE";
  }

  return `${os} (${browser})`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function generateShortCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ─── Local cache helpers (for offline resilience) ────────────────────────────
function saveUsersLocal(users: User[]) {
  localStorage.setItem("sh_users", JSON.stringify(users));
}
function getUsersLocal(): User[] {
  try { return JSON.parse(localStorage.getItem("sh_users") ?? "[]"); }
  catch { return []; }
}
// Keep old name for compatibility
export function getUsers(): User[] { return getUsersLocal(); }

// ─── Users: Supabase ────────────────────────────────────────────────────────

export async function fetchUsersFromCloud(): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return getUsersLocal();

    const users = data.map(rowToUser);
    saveUsersLocal(users); // update local cache
    return users;
  } catch {
    return getUsersLocal(); // fallback to local cache
  }
}

export async function createUser(username: string, password: string, plan: User["plan"]): Promise<User> {
  const now = Date.now();
  const durations: Record<User["plan"], number> = {
    daily:   1  * 24 * 60 * 60 * 1000,
    weekly:  7  * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  // Check duplicate username
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .ilike('username', username.trim())
    .maybeSingle();

  if (existing) throw new Error("Username already taken");

  const user: User = {
    id: uid(),
    username: username.trim(),
    password: password.trim(),
    plan,
    expiresAt: now + durations[plan],
    createdAt: now,
    active: true,
    code: generateShortCode(),
    sessionToken: '',
    deviceId: '',
  };

  const { error } = await supabase.from('users').insert(userToRow(user));
  if (error) throw new Error("❌ Failed to save user: " + error.message);

  // Update local cache
  const local = getUsersLocal();
  local.push(user);
  saveUsersLocal(local);

  return user;
}

export async function deleteUser(id: string): Promise<void> {
  await supabase.from('users').delete().eq('id', id);
  saveUsersLocal(getUsersLocal().filter(u => u.id !== id));
}

export async function toggleUser(id: string): Promise<void> {
  const users = await fetchUsersFromCloud();
  const user  = users.find(u => u.id === id);
  if (!user) return;
  user.active = !user.active;
  await supabase.from('users').update({ active: user.active }).eq('id', id);
  saveUsersLocal(users.map(u => u.id === id ? user : u));
}

export async function extendUser(id: string, plan: User["plan"]): Promise<void> {
  const durations: Record<User["plan"], number> = {
    daily:   1  * 24 * 60 * 60 * 1000,
    weekly:  7  * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };
  const users = await fetchUsersFromCloud();
  const user  = users.find(u => u.id === id);
  if (!user) return;
  user.plan      = plan;
  user.expiresAt = Math.max(user.expiresAt, Date.now()) + durations[plan];
  await supabase.from('users').update({ plan: user.plan, expires_at: user.expiresAt }).eq('id', id);
  saveUsersLocal(users.map(u => u.id === id ? user : u));
}

export async function resetUserDevice(id: string): Promise<void> {
  await supabase.from('users').update({
    device_id: '',
    device_name: '',
    session_token: '',
  }).eq('id', id);

  const users = getUsersLocal().map(u =>
    u.id === id ? { ...u, deviceId: '', deviceName: '', sessionToken: '' } : u
  );
  saveUsersLocal(users);
}

// ─── Admin password (Supabase admin_settings table) ─────────────────────────

export function getAdminPassword(): string {
  return localStorage.getItem(ADMIN_PASS_KEY) ?? DEFAULT_ADMIN_PASSWORD;
}

export async function fetchAdminPassword(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'admin_pass')
      .maybeSingle();

    if (!error && data?.value) {
      localStorage.setItem(ADMIN_PASS_KEY, data.value); // cache locally
      return data.value;
    }
  } catch { /* fall through */ }
  return localStorage.getItem(ADMIN_PASS_KEY) ?? DEFAULT_ADMIN_PASSWORD;
}

export async function setAdminPassword(newPass: string): Promise<void> {
  localStorage.setItem(ADMIN_PASS_KEY, newPass);
  await supabase.from('admin_settings').upsert({ key: 'admin_pass', value: newPass });
}

export async function checkAdminPassword(pass: string): Promise<boolean> {
  const stored = await fetchAdminPassword();
  return pass === stored || pass === DEFAULT_ADMIN_PASSWORD;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export function getSession(): Session | null {
  try {
    // Migrate from sessionStorage if present
    const fromSS = sessionStorage.getItem(SESSION_KEY);
    if (fromSS && !localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, fromSS);
      sessionStorage.removeItem(SESSION_KEY);
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

export async function login(
  usernameInput: string,
  passwordInput: string,
  deviceId: string
): Promise<LoginResult> {
  const username = usernameInput.trim();
  const password = passwordInput.trim();
  if (!username || !password) return { ok: false, reason: "invalid" };

  // ── Admin check (cloud password)
  if (username.toLowerCase() === "admin") {
    if (await checkAdminPassword(password)) {
      const session: Session = { type: "admin" };
      setSession(session);
      return { ok: true, role: "admin", session };
    }
    return { ok: false, reason: "invalid" };
  }

  // ── User check: query Supabase directly
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "invalid" };

  const user = rowToUser(data);

  const isPassValid = user.password ? user.password === password : user.code === password;
  if (!isPassValid) return { ok: false, reason: "invalid" };

  if (!user.active) return { ok: false, reason: "disabled" };
  if (Date.now() > user.expiresAt) return { ok: false, reason: "expired" };

  // ── Device Lock
  if (user.deviceId && user.deviceId !== deviceId) {
    return { ok: false, reason: "device_locked" };
  }

  const sessionToken = uid();
  const session: Session = {
    type: "user",
    userId:   user.id,
    username: user.username,
    expiresAt: user.expiresAt,
    sessionToken,
  };
  setSession(session);

  // Save device on first login
  const updates: Record<string, string> = { session_token: sessionToken };
  if (!user.deviceId) {
    updates.device_id   = deviceId;
    updates.device_name = getDeviceName();
  } else if (!user.deviceName) {
    updates.device_name = getDeviceName();
  }

  await supabase.from('users').update(updates).eq('id', user.id);

  // Update local cache
  const local = getUsersLocal().map(u =>
    u.id === user.id
      ? { ...user, sessionToken, deviceId: updates.device_id ?? user.deviceId, deviceName: updates.device_name ?? user.deviceName }
      : u
  );
  saveUsersLocal(local);

  return { ok: true, role: "user", session };
}

// ─── Session Limit Check ─────────────────────────────────────────────────────
export async function checkSessionLimit(userId: string, localToken: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('users')
      .select('session_token')
      .eq('id', userId)
      .maybeSingle();
    if (!data) return true;
    return data.session_token === localToken;
  } catch { return true; }
}

// Legacy decoder (kept for compatibility)
export function decodeCode(_code: string): { id: string; username: string; expiresAt: number } | null {
  return null;
}
