/**
 * mobileAuth.ts
 * 
 * Capacitor Android app mein cookie-based auth kaam nahi karta
 * (WebView ka origin `https://localhost` hota hai, InsForge httpOnly
 * cookie wahan set nahi hoti).
 *
 * Solution:
 *  - Web (browser): normal InsForge SDK use karo — cookie handle ho jaati hai.
 *  - Native (Android/iOS Capacitor): REST ?client_type=mobile use karo,
 *    refreshToken body mein milta hai, Capacitor Preferences mein store karo.
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const BASE_URL = import.meta.env.VITE_INSFORGE_BASE_URL as string;
const ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY as string;

// ─── Token Store (native only) ───────────────────────────────────────────────

const PREF_ACCESS  = 'kg_access_token';
const PREF_REFRESH = 'kg_refresh_token';
const PREF_USER    = 'kg_user';

export async function saveTokens(accessToken: string, refreshToken: string, user: unknown) {
  await Preferences.set({ key: PREF_ACCESS,  value: accessToken });
  await Preferences.set({ key: PREF_REFRESH, value: refreshToken });
  await Preferences.set({ key: PREF_USER,    value: JSON.stringify(user) });
}

export async function loadTokens(): Promise<{ accessToken: string | null; refreshToken: string | null; user: unknown }> {
  const [a, r, u] = await Promise.all([
    Preferences.get({ key: PREF_ACCESS }),
    Preferences.get({ key: PREF_REFRESH }),
    Preferences.get({ key: PREF_USER }),
  ]);
  return {
    accessToken:  a.value,
    refreshToken: r.value,
    user: u.value ? JSON.parse(u.value) : null,
  };
}

export async function clearTokens() {
  await Promise.all([
    Preferences.remove({ key: PREF_ACCESS }),
    Preferences.remove({ key: PREF_REFRESH }),
    Preferences.remove({ key: PREF_USER }),
  ]);
}

// ─── Platform detection ───────────────────────────────────────────────────────

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// ─── Mobile REST Auth ─────────────────────────────────────────────────────────

interface MobileAuthResponse {
  user: unknown;
  accessToken: string;
  refreshToken: string;
}

/**
 * Mobile signup (native only)
 */
export async function mobileSignUp(email: string, password: string): Promise<MobileAuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/users?client_type=mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'Signup failed');
  }

  const data = await res.json() as MobileAuthResponse;
  await saveTokens(data.accessToken, data.refreshToken, data.user);
  return data;
}

/**
 * Mobile signin (native only)
 */
export async function mobileSignIn(email: string, password: string): Promise<MobileAuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/sessions?client_type=mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'Login failed');
  }

  const data = await res.json() as MobileAuthResponse;
  await saveTokens(data.accessToken, data.refreshToken, data.user);
  return data;
}

/**
 * Token refresh (native only)
 */
export async function mobileRefreshSession(): Promise<string | null> {
  const { refreshToken } = await loadTokens();
  if (!refreshToken) return null;

  const res = await fetch(`${BASE_URL}/api/auth/sessions/refresh?client_type=mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    await clearTokens();
    return null;
  }

  const data = await res.json() as MobileAuthResponse;
  await saveTokens(data.accessToken, data.refreshToken, data.user);
  return data.accessToken;
}

/**
 * Mobile OTP sign-in (native only)
 */
export async function mobileOtpSignIn(email: string, otp: string): Promise<MobileAuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/sessions?client_type=mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ method: 'otp', email, otp }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? err?.message ?? `OTP login failed (${res.status})`);
  }

  const data = await res.json() as MobileAuthResponse;
  await saveTokens(data.accessToken, data.refreshToken, data.user);
  return data;
}

/**
 * Mobile signout (native only)
 */
export async function mobileSignOut() {
  const { accessToken } = await loadTokens();

  if (accessToken) {
    await fetch(`${BASE_URL}/api/auth/sessions?client_type=mobile`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }).catch(() => { /* ignore */ });
  }

  await clearTokens();
}

/**
 * Get stored user (native only)
 */
export async function getMobileUser(): Promise<unknown> {
  const { user } = await loadTokens();
  return user;
}
