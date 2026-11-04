import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Skill } from '../../lib/types';
import { todayISO } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Banner, Card, Field, SectionTitle } from '../../components/ui';
import { t } from '../../lib/i18n';

export default function EmployerPostJob() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({
    title: '',
    skill_id: '',
    workers_required: '1',
    location: '',
    start_date: todayISO(),
    start_time: '08:00',
    end_time: '18:00',
    daily_wage: '900',
    overtime_rate: '100',
    duration: t('1 दिन'),
    duration_days: '1',
    description: '',
    food: false,
    transport: false,
    other_facilities: '',
  });

  useEffect(() => {
    api.skills().then(setSkills).catch(() => undefined);
    setF((x) => ({ ...x, location: x.location || profile?.location || '' }));
  }, [profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      await api.createJob({
        employer_id: profile.id,
        skill_id: f.skill_id || null,
        title: f.title,
        description: f.description || null,
        workers_required: Number(f.workers_required) || 1,
        location: f.location,
        latitude: profile.latitude ?? null,
        longitude: profile.longitude ?? null,
        start_date: f.start_date,
        start_time: f.start_time,
        end_time: f.end_time,
        daily_wage: Number(f.daily_wage),
        overtime_rate: Number(f.overtime_rate) || 0,
        duration: f.duration,
        duration_days: Number(f.duration_days) || 1,
        food: f.food,
        transport: f.transport,
        other_facilities: f.other_facilities || null,
        status: 'open',
      });
      navigate('/employer/jobs');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('जितनी साफ जानकारी देंगे, उतने सही कारीगर मिलेंगे।')}>{t('काम पोस्ट करें')}</SectionTitle>
      {error && <Banner tone="error">{error}</Banner>}

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('काम का शीर्षक')} required>
              <input
                className="kg-input"
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder={t('जैसे: मिस्त्री चाहिए')}
                required
              />
            </Field>
            <Field label={t('कौन सा कारीगर चाहिए')} required>
              <select
                className="kg-input"
                value={f.skill_id}
                onChange={(e) => setF({ ...f, skill_id: e.target.value })}
                required
              >
                <option value="">{t('चुनें...')}</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.name_hi} ({s.name})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('कितने कामगार चाहिए')} required>
              <input
                className="kg-input"
                type="number"
                min={1}
                value={f.workers_required}
                onChange={(e) => setF({ ...f, workers_required: e.target.value })}
                required
              />
            </Field>
            <Field label={t('काम की जगह')} required>
              <input
                className="kg-input"
                value={f.location}
                onChange={(e) => setF({ ...f, location: e.target.value })}
                placeholder={t('गोमती नगर, लखनऊ')}
                required
              />
            </Field>
            <Field label={t('शुरू होने की तारीख')} required>
              <input
                className="kg-input"
                type="date"
                value={f.start_date}
                onChange={(e) => setF({ ...f, start_date: e.target.value })}
                required
              />
            </Field>
            <Field label={t('काम की अवधि')}>
              <input
                className="kg-input"
                value={f.duration}
                onChange={(e) => setF({ ...f, duration: e.target.value })}
                placeholder={t('जैसे: 3 दिन')}
              />
            </Field>
            <Field label={t('शुरू होने का समय')} required>
              <input
                className="kg-input"
                type="time"
                value={f.start_time}
                onChange={(e) => setF({ ...f, start_time: e.target.value })}
                required
              />
            </Field>
            <Field label={t('खत्म होने का तय समय')} required hint={t('इसके बाद का काम अपने आप ओवरटाइम गिना जाएगा।')}>
              <input
                className="kg-input"
                type="time"
                value={f.end_time}
                onChange={(e) => setF({ ...f, end_time: e.target.value })}
                required
              />
            </Field>
            <Field label={t('दिन की मजदूरी (₹)')} required>
              <input
                className="kg-input"
                type="number"
                min={0}
                value={f.daily_wage}
                onChange={(e) => setF({ ...f, daily_wage: e.target.value })}
                required
              />
            </Field>
            <Field label={t('ओवरटाइम रेट (₹/घंटा)')}>
              <input
                className="kg-input"
                type="number"
                min={0}
                value={f.overtime_rate}
                onChange={(e) => setF({ ...f, overtime_rate: e.target.value })}
              />
            </Field>
          </div>

          <Field label={t('काम का विवरण')}>
            <textarea
              className="kg-input"
              rows={3}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              placeholder={t('क्या काम करना है, कोई ख़ास बात...')}
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={f.food} onChange={(e) => setF({ ...f, food: e.target.checked })} />{t('🍲 खाना मिलेगा')}</label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={f.transport}
                onChange={(e) => setF({ ...f, transport: e.target.checked })}
              />{t('🚐 आना-जाना मिलेगा')}</label>
          </div>

          <Field label={t('अन्य सुविधाएं')}>
            <input
              className="kg-input"
              value={f.other_facilities}
              onChange={(e) => setF({ ...f, other_facilities: e.target.value })}
              placeholder={t('जैसे: रहने की जगह, चाय-नाश्ता')}
            />
          </Field>

          <Button type="submit" variant="employer" size="lg" block loading={busy}>{t('काम पोस्ट करें')}</Button>
        </form>
      </Card>
    </div>
  );
}
