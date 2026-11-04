import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import type { Skill } from '../lib/types';
import { fmtDate, getLocation, rupee } from '../lib/format';
import { formatMobile } from '../lib/phone';
import { Button } from './ui/Button';
import { Avatar, Banner, Card, Chip, Field, Modal, SectionTitle, Stars, Stat } from './ui';
import { t } from '../lib/i18n';

export function ProfilePage({ side }: { side: 'worker' | 'employer' }) {
  const { profile, worker, employer, refresh, mobile } = useAuth();
  const navigate = useNavigate();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mySkills, setMySkills] = useState<{ id: string; skill_id: string; experience: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [dpMenuOpen, setDpMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    location: '',
    experience: '0',
    expected_wage: '0',
    bio: '',
    company_name: '',
    business_type: '',
  });
  const [newSkill, setNewSkill] = useState('');

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name ?? '',
      location: profile.location ?? '',
      experience: String(worker?.experience ?? 0),
      expected_wage: String(worker?.expected_daily_wage ?? 0),
      bio: worker?.bio ?? '',
      company_name: employer?.company_name ?? '',
      business_type: employer?.business_type ?? '',
    });
  }, [profile, worker, employer]);

  useEffect(() => {
    if (side !== 'worker' || !profile) return;
    api.skills().then(setSkills).catch(() => undefined);
    api.workerSkills(profile.id).then(setMySkills).catch(() => undefined);
  }, [side, profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await api.updateProfile(profile.id, { name: form.name, location: form.location });
      if (side === 'worker') {
        await api.updateWorkerProfile(profile.id, {
          experience: Number(form.experience) || 0,
          expected_daily_wage: Number(form.expected_wage) || 0,
          bio: form.bio,
        });
      } else {
        await api.updateEmployerProfile(profile.id, {
          company_name: form.company_name,
          business_type: form.business_type,
          location: form.location,
        });
      }
      await refresh();
      setEditOpen(false);
      setFlash(t('प्रोफाइल सेव हो गई ✅'));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto() {
    const file = photoRef.current?.files?.[0];
    if (!file || !profile) return;
    setBusy(true);
    try {
      const up = await api.uploadFile('avatars', file);
      await api.updateProfile(profile.id, { profile_photo: up.url, profile_photo_key: up.key });
      await refresh();
      setFlash(t('फोटो अपडेट हो गई ✅'));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function updateLocation() {
    const c = await getLocation();
    if (!c || !profile) return setError(t('लोकेशन नहीं मिल पाई। ब्राउज़र में अनुमति दें।'));
    await api.updateProfile(profile.id, { latitude: c.lat, longitude: c.lng }).catch((e) => setError(errMsg(e)));
    await refresh();
    setFlash(t('📍 लोकेशन अपडेट हो गई'));
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('आपका मोबाइल नंबर लॉगिन से जुड़ा है और किसी को सार्वजनिक रूप से नहीं दिखाया जाता।')}>{t('प्रोफाइल')}</SectionTitle>
      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setDpMenuOpen((v) => !v)}
              className="block rounded-full ring-2 ring-line transition hover:ring-ink/40"
              aria-label={t('फोटो या पासवर्ड बदलें')}
            >
              <Avatar name={profile?.name ?? '?'} src={profile?.profile_photo} size={72} />
            </button>
            {dpMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDpMenuOpen(false)} />
                <div className="absolute left-1/2 top-full z-50 mt-2 w-52 -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
                  <button
                    type="button"
                    className="block w-full px-4 py-3 text-left text-sm font-semibold hover:bg-cream"
                    onClick={() => {
                      setDpMenuOpen(false);
                      photoRef.current?.click();
                    }}
                  >
                    📷 {t('फोटो बदलें')}
                  </button>
                  <button
                    type="button"
                    className="block w-full border-t border-line px-4 py-3 text-left text-sm font-semibold hover:bg-cream"
                    onClick={() => {
                      setDpMenuOpen(false);
                      navigate('/change-password');
                    }}
                  >
                    🔒 {t('पासवर्ड बदलें')}
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold">{profile?.name}</p>
            <p className="text-sm font-medium text-ink-soft">📱 {formatMobile(mobile)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone={profile?.verification_status === 'verified' ? 'green' : 'amber'}>
                {profile?.verification_status === 'verified' ? t('✔️ सत्यापित') : t('⏳ सत्यापन बाकी')}
              </Chip>
              {profile?.location && <Chip>📍 {profile.location}</Chip>}
              <Chip>{t('सदस्य:')} {fmtDate(profile?.created_at)}</Chip>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <Button variant={side} onClick={() => setEditOpen(true)}>✏️ {t('प्रोफाइल एडिट करें')}</Button>
            <Button variant="outline" size="sm" onClick={updateLocation}>{t('📍 लोकेशन अपडेट')}</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {side === 'worker' ? (
          <>
            <Stat label={t('रेटिंग')} value={<Stars value={worker?.rating_avg} size="md" />} />
            <Stat label={t('पूरे किए काम')} value={worker?.completed_jobs ?? 0} tone="worker" />
            <Stat label={t('कुल कमाई')} value={rupee(worker?.total_earned)} tone="employer" />
          </>
        ) : (
          <>
            <Stat label={t('रेटिंग')} value={<Stars value={employer?.rating_avg} size="md" />} />
            <Stat label={t('पोस्ट किए काम')} value={employer?.jobs_posted ?? 0} tone="employer" />
            <Stat label={t('कामगार रखे')} value={employer?.workers_hired ?? 0} />
          </>
        )}
      </div>

      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />

      <Modal open={editOpen} title={t('✏️ प्रोफाइल एडिट करें')} onClose={() => setEditOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('नाम')} required>
              <input
                className="kg-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label={t('इलाका / शहर')}>
              <input
                className="kg-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            {side === 'worker' ? (
              <>
                <Field label={t('अनुभव (साल)')}>
                  <input
                    className="kg-input"
                    type="number"
                    min={0}
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
              </>
            ) : (
              <>
                <Field label={t('कंपनी / ठेकेदारी')}>
                  <input
                    className="kg-input"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  />
                </Field>
                <Field label={t('काम का प्रकार')}>
                  <input
                    className="kg-input"
                    value={form.business_type}
                    onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
          {side === 'worker' && (
            <Field label={t('अपने बारे में')}>
              <textarea
                className="kg-input"
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder={t('जैसे: 6 साल से प्लास्टर और चिनाई का काम कर रहा हूँ।')}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={side} loading={busy}>{t('सेव करें')}</Button>
            <Button variant="outline" type="button" loading={busy} onClick={() => photoRef.current?.click()}>
              📷 {t('फोटो बदलें')}
            </Button>
            <Button variant="outline" type="button" onClick={updateLocation}>{t('📍 लोकेशन अपडेट')}</Button>
          </div>
        </form>
      </Modal>

      {side === 'worker' && (
        <Card>
          <p className="mb-3 font-bold">{t('मेरे हुनर (Trades)')}</p>
          <div className="flex flex-wrap gap-2">
            {mySkills.length === 0 && <p className="text-sm text-ink-faint">{t('अभी कोई हुनर नहीं जोड़ा गया।')}</p>}
            {mySkills.map((ws) => {
              const s = skills.find((x) => x.id === ws.skill_id);
              return (
                <span key={ws.id} className="kg-chip">
                  {s?.icon} {s?.name_hi ?? '—'} · {ws.experience} {t('साल')}
                  <button
                    onClick={async () => {
                      await api.removeWorkerSkill(ws.id).catch(() => undefined);
                      if (profile) setMySkills(await api.workerSkills(profile.id));
                    }}
                    className="ml-1 text-ink-faint hover:text-danger"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <select className="kg-input max-w-xs" value={newSkill} onChange={(e) => setNewSkill(e.target.value)}>
              <option value="">{t('हुनर चुनें...')}</option>
              {skills
                .filter((s) => !mySkills.some((m) => m.skill_id === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.name_hi}
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              onClick={async () => {
                if (!newSkill || !profile) return;
                try {
                  await api.addWorkerSkill(profile.id, newSkill, Number(form.experience) || 0);
                  setMySkills(await api.workerSkills(profile.id));
                  setNewSkill('');
                } catch (e) {
                  setError(errMsg(e));
                }
              }}
            >{t('जोड़ें')}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
