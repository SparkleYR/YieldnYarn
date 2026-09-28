"use client";

/**
 * Client-side session.
 *
 * The long-lived refresh token is an httpOnly cookie set by Django
 * (implementation_plan.md §10.1) — script can't read it, so an XSS bug can't
 * steal a session that outlives the access token. Only the short-lived
 * access token and the user profile are kept in `localStorage` (so a reload
 * doesn't need a round trip). When the access token expires, API calls
 * refresh it through the cookie and retry (lib/api.ts); when that fails the
 * session is cleared and the dashboard layouts send the user to /login.
 */

import { logoutSession, refreshAccessToken, setRefreshHandler, type AuthTokens, type User } from "./api";

const TOKENS_KEY = "msme.auth.tokens";
const USER_KEY = "msme.auth.user";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getStoredTokens(): AuthTokens | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    return null;
  }
}

export function getStoredUser(): User | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setSession(tokens: AuthTokens, user: User) {
  if (!isBrowser()) return;
  // Never persist a refresh token here, even if an API response carried one.
  window.localStorage.setItem(TOKENS_KEY, JSON.stringify({ access: tokens.access }));
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("msme-auth-change"));
}

export function clearSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKENS_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("msme-auth-change"));
}

/** Revoke the server-side session (refresh cookie) and forget the local one. */
export async function logout() {
  try {
    await logoutSession();
  } catch {
    // Offline or already logged out: still clear locally.
  }
  clearSession();
}

let refreshing: Promise<string | null> | null = null;

/** One refresh at a time: parallel 401s share it (refresh tokens rotate). */
export function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const { access } = await refreshAccessToken();
      if (isBrowser()) {
        window.localStorage.setItem(TOKENS_KEY, JSON.stringify({ access }));
      }
      return access;
    } catch {
      clearSession();
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

if (isBrowser()) setRefreshHandler(refreshSession);

/** Where to send a signed-in user after login, based on role. */
export function dashboardPathForRole(role: User["role"]) {
  switch (role) {
    case "ADMIN":
      return "/admin/dashboard";
    case "VERIFIER":
      return "/verifier/dashboard";
    case "SELLER":
    case "BUYER":
    default:
      return "/buyer/dashboard";
  }
}
