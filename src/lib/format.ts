import { t } from './i18n';
/** Small shared helpers — currency, dates, hours, distance, greetings. */

export const rupee = (n: number | null | undefined) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const rupeeExact = (n: number | null | undefined) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function fmtTime(ts?: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function fmtClock(t?: string | null) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hh = Number(h);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${m} ${ampm}`;
}

export function fmtDate(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d.length <= 10 ? d + 'T00:00:00' : d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dayLabel(d?: string | null) {
  if (!d) return '';
  const date = new Date(d.length <= 10 ? d + 'T00:00:00' : d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return t('आज');
  if (diff === 1) return t('कल');
  if (diff === -1) return t('बीता कल');
  return fmtDate(d);
}

export function hoursLabel(h: number | null | undefined) {
  const v = Number(h ?? 0);
  const hh = Math.floor(v);
  const mm = Math.round((v - hh) * 60);
  if (hh === 0 && mm === 0) return '0h';
  return `${hh}h${mm ? ' ' + mm + 'm' : ''}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return t('सुप्रभात');
  if (h < 17) return t('नमस्ते');
  return t('शुभ संध्या');
}

export function distanceLabel(km: number | null | undefined) {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return t('अभी');
  if (diff < 3600) return `${Math.floor(diff / 60)} ${t('मिनट पहले')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('घंटे पहले')}`;
  return `${Math.floor(diff / 86400)} ${t('दिन पहले')}`;
}

export const APPLICATION_LABEL: Record<string, string> = {
  applied: t('आवेदन किया'),
  shortlisted: t('शॉर्टलिस्ट'),
  invited: t('बुलावा आया'),
  accepted: t('स्वीकृत'),
  rejected: t('अस्वीकृत'),
  cancelled: t('रद्द'),
};

export const HIRE_LABEL: Record<string, string> = {
  pending: t('लंबित'),
  confirmed: t('पक्का हुआ'),
  in_progress: t('चल रहा है'),
  completed: t('पूरा हुआ'),
  cancelled: t('रद्द'),
  disputed: t('विवाद'),
};

export const ATTENDANCE_LABEL: Record<string, string> = {
  not_started: t('शुरू नहीं हुआ'),
  pending_in: t('🟡 पुष्टि बाकी'),
  present: t('🟢 हाजिरी पक्की'),
  pending_out: t('🟡 आउट पुष्टि बाकी'),
  completed: t('🟢 दिन पूरा'),
  absent: t('गैरहाजिर'),
  disputed: t('⚠️ विवाद'),
};

export const PAYMENT_LABEL: Record<string, string> = {
  pending: t('बकाया'),
  partial: t('आंशिक'),
  paid: t('भुगतान हुआ'),
  disputed: t('विवाद'),
};

/** Browser geolocation, resolved leniently (never blocks the UI). */
export function getLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    const t = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        resolve({ lat: +pos.coords.latitude.toFixed(3), lng: +pos.coords.longitude.toFixed(3) });
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
      { timeout: 6000, maximumAge: 300000 },
    );
  });
}
