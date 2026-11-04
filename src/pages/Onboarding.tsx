import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import type { Skill } from '../lib/types';
import { Button } from '../components/ui/Button';
import { Banner, Field } from '../components/ui';
import { CameraCapture } from '../components/CameraCapture';
import { geoErrorHindi, getLocationDetailed, reverseGeocodeAddress } from '../lib/geo';
import { formatMobile } from '../lib/phone';
import { LangToggle, t } from '../lib/i18n';

export default function Onboarding() {
  const { role } = useParams<{ role: 'worker' | 'employer' }>();
  const isWorker = role !== 'employer';
  const { refresh, profile, userId, loading, mobile } = useAuth();
  const navigate = useNavigate();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [form, setForm] = useState({
    name: '',
    location: '',
    experience: '2',
    expected_wage: '600',
    company_name: '',
    business_type: t('ठेकेदार'),
  });
  const [skillId, setSkillId] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !userId) navigate(`/auth/${isWorker ? 'worker' : 'employer'}`, { replace: true });
    if (!loading && profile) navigate('/redirect', { replace: true });
  }, [loading, userId, profile, isWorker, navigate]);

  // when GPS coords arrive, fetch the address and fill the empty
  // Area/City field automatically (OpenStreetMap reverse geocoding)
  function fillAddressFromCoords(c: { lat: number; lng: number }) {
    reverseGeocodeAddress(c.lat, c.lng)
      .then((addr) => {
        if (addr) setForm((f) => (f.location.trim() ? f : { ...f, location: addr }));
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    api.skills().then(setSkills).catch(() => undefined);
    // try to fill the location silently — the button below is the manual retry
    getLocationDetailed()
      .then((c) => {
        setCoords(c);
        fillAddressFromCoords(c);
      })
      .catch(() => setGpsError(t("लोकेशन अपने-आप नहीं मिली। नीचे 'GPS से लोकेशन लें' बटन दबाएं, या इलाका हाथ से लिखें।")));
  }, []);

  // keep an object URL for the captured photo preview
  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function fetchGps() {
    setGpsError(null);
    setGpsBusy(true);
    try {
      const c = await getLocationDetailed();
      setCoords(c);
      fillAddressFromCoords(c);
    } catch (e) {
      setGpsError(geoErrorHindi(e));
    } finally {
      setGpsBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!photo) {
      setError(t('कृपया कैमरे से अपनी लाइव फोटो लें — बिना फोटो के प्रोफाइल नहीं बन सकती।'));
      return;
    }
    setBusy(true);
    try {
      const up = await api.uploadFile('avatars', photo);
      await api.createMyProfile({
        role: isWorker ? 'worker' : 'employer',
        name: form.name.trim(),
        // the number is taken from the verified login identity, server-side
        location: form.location.trim() || undefined,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        company_name: form.company_name.trim() || undefined,
        business_type: form.business_type || undefined,
        experience: Number(form.experience) || 0,
        expected_wage: Number(form.expected_wage) || 0,
        profile_photo: up.url,
        profile_photo_key: up.key,
      });
      if (isWorker && skillId && userId) {
        await api.addWorkerSkill(userId, skillId, Number(form.experience) || 0).catch(() => undefined);
      }
      await refresh();
      navigate(isWorker ? '/worker' : '/employer', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-cream">
<div className="flex justify-end px-4 pt-3"><LangToggle /></div>
            <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        <div className="kg-card p-6 sm:p-8">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${
              isWorker ? 'bg-worker-soft' : 'bg-employer-soft'
            }`}
          >
            {isWorker ? '👷' : '🏗️'}
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t('अपनी प्रोफाइल बनाएं')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {isWorker
              ? t('सही जानकारी से आपको नज़दीकी काम जल्दी मिलेगा।')
              : t('सही जानकारी से आपको भरोसेमंद कारीगर जल्दी मिलेंगे।')}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label={t('पूरा नाम')} required>
              <input
                className="kg-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('राज कुमार')}
                required
              />
            </Field>
            <Field label={t('मोबाइल नंबर')} hint={t('यही आपका लॉगिन नंबर है। यह सार्वजनिक नहीं दिखाया जाता।')}>
              <div className="kg-input flex items-center justify-between bg-cream-deep/60">
                <span className="font-semibold tracking-wide">{formatMobile(mobile)}</span>
                <span className="text-xs font-semibold text-employer">{t('✔️ लॉगिन नंबर')}</span>
              </div>
            </Field>

            <Field
              label={isWorker ? t('आपकी लाइव फोटो') : t('आपकी लाइव फोटो (खाताधारक)')}
              required
              hint={t('भरोसा बनाए रखने के लिए कैमरे से लाइव फोटो जरूरी है — गैलरी से फोटो नहीं चलेगी।')}
            >
              {photo ? (
                <div className="flex items-center gap-4">
                  <img
                    src={photoUrl ?? undefined}
                    alt={t('लाइव फोटो')}
                    className="h-24 w-24 rounded-xl border border-line object-cover"
                  />
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-employer">{t('✔️ फोटो तैयार है')}</span>
                    <button
                      type="button"
                      onClick={() => setPhoto(null)}
                      className="self-start text-xs font-semibold text-ink-faint underline hover:text-danger"
                    >{t('फोटो हटाएं / दोबारा लें')}</button>
                  </div>
                </div>
              ) : (
                <CameraCapture
                  direction="user"
                  onCaptured={setPhoto}
                  idleLabel={t('📷 कैमरा चालू करके फोटो लें')}
                />
              )}
            </Field>
            <Field
              label={t('इलाका / शहर')}
              required
              hint={coords ? `📍 ${t('GPS लोकेशन मिल गई है')} (${coords.lat}, ${coords.lng})` : undefined}
            >
              <input
                className="kg-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder={t('जैसे: गोमती नगर, लखनऊ')}
                required
              />
            </Field>
            <div className="-mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={fetchGps}
                disabled={gpsBusy}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  gpsBusy
                    ? 'border-line bg-cream text-ink-faint'
                    : 'border-employer/30 bg-employer-soft text-employer hover:opacity-80'
                }`}
              >
                {gpsBusy ? t('⏳ लोकेशन मिल रही है…') : t('📍 GPS से लोकेशन लें')}
              </button>
              {coords && (
                <span className="text-xs font-medium text-employer">
                  ✔️ {coords.lat}, {coords.lng}
                </span>
              )}
            </div>
            {gpsError && <p className="-mt-2 text-xs font-medium text-danger">{gpsError}</p>}

            {isWorker ? (
              <>
                <Field label={t('मुख्य काम / ट्रेड')}>
                  <select
                    className="kg-input"
                    value={skillId}
                    onChange={(e) => setSkillId(e.target.value)}
                  >
                    <option value="">{t('चुनें...')}</option>
                    {skills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.name_hi} ({s.name})
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('अनुभव (साल)')}>
                    <input
                      className="kg-input"
                      type="number"
                      min={0}
                      max={60}
                      value={form.experience}
                      onChange={(e) => setForm({ ...form, experience: e.target.value })}
                    />
                  </Field>
                  <Field label={t('अपेक्षित मजदूरी (₹/दिन)')}>
                    <input
                      className="kg-input"
                      type="number"
                      min={0}
                      value={form.expected_wage}
                      onChange={(e) => setForm({ ...form, expected_wage: e.target.value })}
                    />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field label={t('कंपनी / ठेकेदारी का नाम')}>
                  <input
                    className="kg-input"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    placeholder={t('जैसे: शर्मा कंस्ट्रक्शन')}
                  />
                </Field>
                <Field label={t('काम का प्रकार')}>
                  <select
                    className="kg-input"
                    value={form.business_type}
                    onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                  >
                    {[t('ठेकेदार'), t('बिल्डर'), t('घर मालिक'), t('दुकान / व्यापार'), t('फैक्ट्री'), t('अन्य')].map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            {error && <Banner tone="error">{error}</Banner>}

            <Button type="submit" variant={isWorker ? 'worker' : 'employer'} size="lg" block loading={busy}>{t('प्रोफाइल बनाएं और आगे बढ़ें →')}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
