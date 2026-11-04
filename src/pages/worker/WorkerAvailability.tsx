import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Availability, Skill } from '../../lib/types';
import { fmtDate, fmtTime, rupee } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Banner, Card, Chip, Field, SectionTitle, Skeleton } from '../../components/ui';
import { t, useLang } from '../../lib/i18n';

function localDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function WorkerAvailability() {
  const { lang } = useLang();
  const { profile, worker, refresh } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [history, setHistory] = useState<Availability[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const endOfDay = new Date();
  endOfDay.setHours(20, 0, 0, 0);

  const [form, setForm] = useState({
    skill_id: '',
    location: '',
    radius: '5',
    from: localDateTime(new Date()),
    until: localDateTime(endOfDay),
    wage: '',
    job_type: 'daily',
    time_note: t('सुबह 8 बजे से'),
    note: '',
  });

  const load = useCallback(async () => {
    if (!profile) return;
    setHistory(null);
    try {
      await api.expireAvailability().catch(() => undefined);
      setHistory(await api.myAvailability(profile.id));
    } catch (e) {
      setError(errMsg(e));
      setHistory([]);
    }
  }, [profile]);

  useEffect(() => {
    api.skills().then(setSkills).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    setForm((f) => ({
      ...f,
      location: f.location || profile?.location || '',
      wage: f.wage || String(worker?.expected_daily_wage ?? ''),
      radius: String(worker?.work_radius ?? 5),
    }));
  }, [load, profile, worker]);

  const active = history?.find((h) => h.status === 'active' && new Date(h.available_until) > new Date());

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await api.publishAvailability({
        skill_id: form.skill_id || null,
        location: form.location,
        radius: Number(form.radius) || 5,
        available_from: new Date(form.from).toISOString(),
        available_until: new Date(form.until).toISOString(),
        expected_wage: Number(form.wage) || 0,
        job_type: form.job_type,
        available_time: form.time_note,
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
        note: form.note || undefined,
      });
      setFlash(t('आपकी उपलब्धता दर्ज हो गई — अब नियोक्ता आपको देख सकते हैं ✅'));
      await refresh();
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await api.stopAvailability();
      setFlash(t('उपलब्धता बंद कर दी गई।'));
      await refresh();
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('उपलब्धता आपकी प्रोफाइल से अलग है — यह समय पूरा होते ही अपने आप बंद हो जाती है।')}>{t('मैं काम के लिए उपलब्ध हूँ')}</SectionTitle>

      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      {active && (
        <Card className="border-employer/30 bg-employer-soft/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold">{t('🟢 अभी उपलब्ध')}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip>📍 {active.location}</Chip>
                <Chip>{lang === 'hi' ? <>🧭 {active.radius} {t('km के अंदर')}</> : <>🧭 {t('within')} {active.radius} {t('km')}</>}</Chip>
                <Chip tone="worker">{rupee(active.expected_wage)}{t('/दिन')}</Chip>
                <Chip>🕗 {active.available_time}</Chip>
                <Chip>⏳ {lang === 'hi' ? <> {fmtTime(active.available_until)} {t('तक')}</> : <>{t('until')} {fmtTime(active.available_until)}</>}</Chip>
              </div>
            </div>
            <Button variant="outline" onClick={stop} loading={busy}>{t('उपलब्धता बंद करें')}</Button>
          </div>
        </Card>
      )}

      <Card>
        <form onSubmit={publish} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('काम / ट्रेड')}>
              <select
                className="kg-input"
                value={form.skill_id}
                onChange={(e) => setForm({ ...form, skill_id: e.target.value })}
              >
                <option value="">{t('कोई भी काम')}</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.name_hi}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('इलाका')} required>
              <input
                className="kg-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder={t('गोमती नगर, लखनऊ')}
                required
              />
            </Field>
            <Field label={t('कितनी दूर तक काम करेंगे (km)')}>
              <input
                className="kg-input"
                type="number"
                min={1}
                max={100}
                value={form.radius}
                onChange={(e) => setForm({ ...form, radius: e.target.value })}
              />
            </Field>
            <Field label={t('अपेक्षित मजदूरी (₹/दिन)')} required>
              <input
                className="kg-input"
                type="number"
                min={0}
                value={form.wage}
                onChange={(e) => setForm({ ...form, wage: e.target.value })}
                required
              />
            </Field>
            <Field label={t('कब से उपलब्ध')} required>
              <input
                className="kg-input"
                type="datetime-local"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                required
              />
            </Field>
            <Field label={t('कब तक उपलब्ध')} required hint={t('इस समय के बाद उपलब्धता अपने आप बंद हो जाएगी।')}>
              <input
                className="kg-input"
                type="datetime-local"
                value={form.until}
                onChange={(e) => setForm({ ...form, until: e.target.value })}
                required
              />
            </Field>
            <Field label={t('काम का प्रकार')}>
              <select
                className="kg-input"
                value={form.job_type}
                onChange={(e) => setForm({ ...form, job_type: e.target.value })}
              >
                <option value="daily">{t('दिहाड़ी')}</option>
                <option value="weekly">{t('हफ्ते का')}</option>
                <option value="contract">{t('ठेका')}</option>
              </select>
            </Field>
            <Field label={t('समय (जैसे: सुबह 8 बजे से)')}>
              <input
                className="kg-input"
                value={form.time_note}
                onChange={(e) => setForm({ ...form, time_note: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t('कोई ख़ास बात (वैकल्पिक)')}>
            <textarea
              className="kg-input"
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t('जैसे: अपना औज़ार साथ लाता हूँ')}
            />
          </Field>
          <Button type="submit" variant="worker" size="lg" block loading={busy}>{t('उपलब्धता अपडेट करें')}</Button>
        </form>
      </Card>

      <section>
        <SectionTitle sub={t('पुरानी और चालू उपलब्धता।')}>{t('उपलब्धता का रिकॉर्ड')}</SectionTitle>
        {history === null ? (
          <Skeleton count={2} />
        ) : history.length === 0 ? (
          <Card>
            <p className="py-4 text-center text-sm text-ink-faint">{t('अभी कोई उपलब्धता दर्ज नहीं है।')}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <Card key={h.id} className="!py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip
                      tone={
                        h.status === 'active' ? 'green' : h.status === 'hired' ? 'worker' : 'neutral'
                      }
                    >
                      {h.status === 'active'
                        ? t('🟢 चालू')
                        : h.status === 'hired'
                          ? t('🤝 काम मिल गया')
                          : h.status === 'expired'
                            ? t('⌛ समय पूरा')
                            : t('✖️ बंद')}
                    </Chip>
                    <Chip>📍 {h.location}</Chip>
                    <Chip>{rupee(h.expected_wage)}{t('/दिन')}</Chip>
                  </div>
                  <p className="text-xs text-ink-faint">
                    {fmtDate(h.available_from)} → {fmtDate(h.available_until)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
