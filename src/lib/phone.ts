import { t } from './i18n';
/**
 * मोबाइल नंबर से लॉगिन।
 *
 * InsForge's auth layer issues identities against an email address (email+password,
 * email OTP, OAuth) — it has no phone identity type. So the mobile number is the real
 * user-facing credential and we map it deterministically onto a reserved internal alias
 * address. The alias is never shown in the UI; `profiles.phone` is the displayed number.
 *
 *   9876543210  ->  919876543210@mobile.kaamgaar.app
 *
 * Because the alias is unique per number, one mobile number can only ever hold one account.
 */

export const MOBILE_ALIAS_DOMAIN = 'mobile.kaamgaar.app';
export const COUNTRY_CODE = '91';

/** Strips spaces, dashes, +91 / 0 prefixes. Returns the bare 10-digit number, or ''. */
export function normalizeMobile(input: string): string {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith(COUNTRY_CODE)) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** Indian mobile numbers are 10 digits starting 6-9. */
export function isValidMobile(input: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeMobile(input));
}

export function mobileError(input: string): string | null {
  const n = normalizeMobile(input);
  if (!n) return t('कृपया अपना मोबाइल नंबर लिखें।');
  if (n.length !== 10) return t('मोबाइल नंबर 10 अंकों का होना चाहिए।');
  if (!/^[6-9]/.test(n)) return t('सही मोबाइल नंबर लिखें (6, 7, 8 या 9 से शुरू)।');
  return null;
}

export function mobileToAliasEmail(input: string): string {
  return `${COUNTRY_CODE}${normalizeMobile(input)}@${MOBILE_ALIAS_DOMAIN}`;
}

/** Reverses the alias back to a display number; returns null for real email addresses. */
export function aliasEmailToMobile(email?: string | null): string | null {
  if (!email || !email.endsWith('@' + MOBILE_ALIAS_DOMAIN)) return null;
  const local = email.split('@')[0];
  return local.startsWith(COUNTRY_CODE) ? local.slice(COUNTRY_CODE.length) : local;
}

/** 9876543210 -> +91 98765 43210 */
export function formatMobile(input?: string | null): string {
  const n = normalizeMobile(input ?? '');
  if (n.length !== 10) return input ?? '';
  return `+${COUNTRY_CODE} ${n.slice(0, 5)} ${n.slice(5)}`;
}
