import { t } from './i18n';
// GPS location — web (browser Geolocation API) + native (Capacitor Geolocation plugin)
// Errors are thrown as GeoError so the UI can show a clear Hindi message instead
// of silently failing (the old behaviour — "GPS kaam nahi kar raha" without any hint).

export type GeoResult = { lat: number; lng: number };

export type GeoErrorKind = 'denied' | 'timeout' | 'unavailable' | 'unsupported';

export class GeoError extends Error {
  kind: GeoErrorKind;
  constructor(kind: GeoErrorKind) {
    super(kind);
    this.name = 'GeoError';
    this.kind = kind;
  }
}

/** Hindi message for any geolocation failure. */
export function geoErrorHindi(e: unknown): string {
  if (e instanceof GeoError) {
    switch (e.kind) {
      case 'denied':
        return t('लोकेशन की अनुमति नहीं मिली। ब्राउज़र/ऐप की सेटिंग्स में Location की अनुमति दें, फिर दोबारा कोशिश करें।');
      case 'timeout':
        return t('लोकेशन मिलने में देर हो गई। खुली जगह में दोबारा कोशिश करें, या नीचे अपना इलाका हाथ से लिखें।');
      case 'unavailable':
        return t('इस डिवाइस पर लोकेशन सेवा उपलब्ध नहीं है।');
      case 'unsupported':
        return t('यह ब्राउज़र लोकेशन नहीं ले सकता।');
    }
  }
  return t('लोकेशन नहीं मिल पाई। दोबारा कोशिश करें।');
}

/**
 * Reverse-geocode coordinates to a short address (e.g. "Tiwariaganj, Gomti Nagar,
 * Lucknow") using OpenStreetMap Nominatim — free, no API key.
 * Returns null on any failure; callers keep manual typing as the fallback.
 */
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&accept-language=hi`,
      { headers: { Accept: 'application/json' } },
    );
    if (!r.ok) return null;
    const d = await r.json();
    const parts = String(d?.display_name ?? '')
      .split(',')
      .map((x: string) => x.trim())
      .filter(Boolean);
    // drop the admin tail: division / state / pin-code / country
    const stopIdx = parts.findIndex((x: string) =>
      /division|uttar pradesh|madhya pradesh|bihar|rajasthan|haryana|chhattisgarh|jharkhand|uttarakhand|delhi|india|प्रदेश/i.test(x),
    );
    const keep = (stopIdx >= 0 ? parts.slice(0, stopIdx) : parts).slice(0, 3);
    return keep.length ? keep.join(', ') : null;
  } catch {
    return null;
  }
}

/**
 * Get the device location. Resolves to {lat,lng} (3 decimals) or rejects with GeoError.
 * Native apps use the Capacitor plugin (handles Android runtime permission);
 * the browser uses navigator.geolocation.
 */
export async function getLocationDetailed(): Promise<GeoResult> {
  const { isNative } = await import('./mobileAuth');
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    try {
      const pos = await Geolocation.getCurrentPosition({
        timeout: 15000,
        maximumAge: 300000,
        enableHighAccuracy: true,
      });
      return {
        lat: +pos.coords.latitude.toFixed(3),
        lng: +pos.coords.longitude.toFixed(3),
      };
    } catch (e) {
      const code = (e as { code?: number })?.code;
      // GeolocationPositionError codes: 1 = permission denied, 3 = timeout
      if (code === 1) throw new GeoError('denied');
      if (code === 3) throw new GeoError('timeout');
      throw new GeoError('unavailable');
    }
  }
  if (!('geolocation' in navigator)) throw new GeoError('unsupported');
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new GeoError('timeout')), 15000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(t);
        resolve({
          lat: +p.coords.latitude.toFixed(3),
          lng: +p.coords.longitude.toFixed(3),
        });
      },
      (e) => {
        clearTimeout(t);
        if (e.code === 1) reject(new GeoError('denied'));
        else if (e.code === 3) reject(new GeoError('timeout'));
        else reject(new GeoError('unavailable'));
      },
      { timeout: 15000, maximumAge: 300000, enableHighAccuracy: true },
    );
  });
}
