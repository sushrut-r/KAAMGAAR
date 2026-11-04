import { createClient } from '@insforge/sdk';
import { t } from './i18n';

const baseUrl = import.meta.env.VITE_INSFORGE_BASE_URL as string;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string;

if (!baseUrl || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'InsForge config missing. Copy .env.example to .env.local and fill in VITE_INSFORGE_BASE_URL / VITE_INSFORGE_ANON_KEY.',
  );
}

export const insforge = createClient({ baseUrl, anonKey });

/** Normalises any InsForge/SDK error into a Hindi-first, user-readable message. */
export function errMsg(error: unknown, fallback = t('कुछ गलत हो गया। दोबारा कोशिश करें।')): string {
  if (!error) return fallback;
  const anyErr = error as Record<string, unknown>;
  const raw =
    (typeof anyErr.message === 'string' && anyErr.message) ||
    (typeof anyErr.error === 'string' && anyErr.error) ||
    (typeof error === 'string' ? error : '');
  if (!raw) return fallback;
  if (/duplicate key|already exists/i.test(raw)) return t('यह जानकारी पहले से दर्ज है।');
  if (/permission to write|in bucket|upload failed/i.test(raw))
    return t('फोटो अपलोड नहीं हो पाई। इंटरनेट जांचकर दोबारा फोटो लें।');
  if (/permission denied|not authorized|forbidden/i.test(raw)) return t('आपको इसकी अनुमति नहीं है।');
  if (/invalid credentials|incorrect|unauthorized|invalid login/i.test(raw))
    return t('मोबाइल नंबर या पासवर्ड गलत है। दोबारा कोशिश करें।');
  // users log in by mobile number; the internal alias address must never leak into a message
  if (/e-?mail|@mobile\.kaamgaar\.app/i.test(raw)) return t('मोबाइल नंबर या पासवर्ड गलत है।');
  if (/verification code|invalid code|expired code/i.test(raw))
    return t('OTP गलत है या समय खत्म हो गया। दोबारा भेजें।');
  if (/too many|rate limit/i.test(raw)) return t('बहुत बार कोशिश हुई है। कुछ देर बाद दोबारा भेजें।');
  if (/network|fetch failed|Failed to fetch/i.test(raw))
    return t('इंटरनेट कनेक्शन में दिक्कत है। दोबारा कोशिश करें।');
  return raw;
}
