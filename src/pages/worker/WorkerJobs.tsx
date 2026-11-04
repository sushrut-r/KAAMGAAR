import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { JobSearchRow, Skill } from '../../lib/types';
import { dayLabel, distanceLabel, fmtClock, rupee } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import {
  Banner,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  SectionTitle,
  Skeleton,
  Stars,
} from '../../components/ui';
import { t, useLang } from '../../lib/i18n';

export default function WorkerJobs() {
  const { lang } = useLang();
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<JobSearchRow[] | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [filters, setFilters] = useState({ skill_id: '', min_wage: '', max_distance: '', search: '' });
  const [selected, setSelected] = useState<JobSearchRow | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setJobs(null);
    setError(null);
    try {
      const rows = await api.searchJobs({
        skill_id: filters.skill_id || null,
        min_wage: filters.min_wage ? Number(filters.min_wage) : null,
        max_distance: filters.max_distance ? Number(filters.max_distance) : null,
        search: filters.search || null,
        lat: profile?.latitude ?? null,
        lng: profile?.longitude ?? null,
      });
      setJobs(rows);
    } catch (e) {
      setError(errMsg(e));
      setJobs([]);
    }
  }, [filters, profile]);

  useEffect(() => {
    api.skills().then(setSkills).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function apply(job: JobSearchRow) {
    setApplying(true);
    setError(null);
    try {
      await api.applyToJob(job.job_id);
      setFlash(lang === 'hi' ? `"${job.title}" के लिए आपका आवेदन भेज दिया गया ✅` : `Application for "${job.title}" sent ✅`);
      setSelected(null);
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('केवल चालू (open) काम ही यहाँ दिखते हैं।')}>{t('मेरे आसपास उपलब्ध काम')}</SectionTitle>

      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <Card className="!p-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <select
            className="kg-input"
            value={filters.skill_id}
            onChange={(e) => setFilters({ ...filters, skill_id: e.target.value })}
          >
            <option value="">{t('सभी ट्रेड')}</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name_hi}
              </option>
            ))}
          </select>
          <input
            className="kg-input"
            placeholder={t('कम से कम मजदूरी ₹')}
            inputMode="numeric"
            value={filters.min_wage}
            onChange={(e) => setFilters({ ...filters, min_wage: e.target.value })}
          />
          <select
            className="kg-input"
            value={filters.max_distance}
            onChange={(e) => setFilters({ ...filters, max_distance: e.target.value })}
          >
            <option value="">{t('कोई भी दूरी')}</option>
            <option value="2">{t('2 km तक')}</option>
            <option value="5">{t('5 km तक')}</option>
            <option value="10">{t('10 km तक')}</option>
            <option value="25">{t('25 km तक')}</option>
          </select>
          <input
            className="kg-input"
            placeholder={t('इलाका या काम खोजें')}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
      </Card>

      {jobs === null ? (
        <Skeleton count={3} />
      ) : error && jobs.length === 0 ? (
        <ErrorState message={error} onRetry={load} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="🔨"
          title={t('कोई काम उपलब्ध नहीं है।')}
          hint={t('फ़िल्टर बदलकर देखें, या थोड़ी देर बाद दोबारा कोशिश करें।')}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {jobs.map((j) => (
            <Card key={j.job_id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">
                    {j.icon ?? '🔨'} {j.title}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {j.company_name ?? j.employer_name}{' '}
                    {j.employer_verified === 'verified' && <span title={t('सत्यापित')}>✔️</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-extrabold text-worker">{rupee(j.daily_wage)}</p>
                  <p className="text-[11px] text-ink-faint">{t('प्रति दिन')}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip>📍 {j.location}</Chip>
                {distanceLabel(j.distance_km) && <Chip>🧭 {distanceLabel(j.distance_km)}</Chip>}
                <Chip>📅 {dayLabel(j.start_date)}</Chip>
                <Chip>
                  🕗 {fmtClock(j.start_time)} - {fmtClock(j.end_time)}
                </Chip>
                <Chip>{lang === 'hi' ? <>👷 {j.workers_required - j.workers_hired} {t('जगह बाकी')}</> : <>👷 {j.workers_required - j.workers_hired} {t('spots left')}</>}</Chip>
                {Number(j.overtime_rate) > 0 && <Chip tone="amber">⏱️ OT {rupee(j.overtime_rate)}{t('/घंटा')}</Chip>}
                {j.food && <Chip tone="green">{t('🍲 खाना')}</Chip>}
                {j.transport && <Chip tone="green">{t('🚐 आना-जाना')}</Chip>}
                {j.employer_rating ? (
                  <Chip>
                    <Stars value={j.employer_rating} />
                  </Chip>
                ) : null}
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelected(j)}>{t('काम देखें')}</Button>
                {j.already_applied ? (
                  <Chip tone="green">
                    ✅ {j.application_status === 'accepted' ? t('काम पक्का') : t('आवेदन भेजा गया')}
                  </Chip>
                ) : (
                  <Button variant="worker" size="sm" onClick={() => apply(j)} loading={applying}>{t('Apply करें')}</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!selected} title={selected?.title ?? ''} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="worker">{rupee(selected.daily_wage)}{t('/दिन')}</Chip>
              <Chip>📍 {selected.location}</Chip>
              <Chip>📅 {dayLabel(selected.start_date)}</Chip>
              <Chip>
                🕗 {fmtClock(selected.start_time)} - {fmtClock(selected.end_time)}
              </Chip>
              <Chip>👷 {selected.workers_required} {t('कामगार')}</Chip>
              <Chip>⏳ {selected.duration}</Chip>
            </div>
            <Field label={t('काम का विवरण')}>
              <p className="text-sm text-ink-soft">{selected.description || t('कोई अतिरिक्त विवरण नहीं दिया गया।')}</p>
            </Field>
            <Field label={t('नियोक्ता')}>
              <p className="text-sm text-ink-soft">
                {selected.company_name ?? selected.employer_name} · <Stars value={selected.employer_rating} />
              </p>
            </Field>
            {Number(selected.overtime_rate) > 0 && (
              <Banner tone="info">
                ⏱️ {t('तय समय के बाद का काम अपने आप ओवरटाइम में गिना जाएगा —')} {rupee(selected.overtime_rate)}{t('/घंटा।')}
              </Banner>
            )}
            {selected.already_applied ? (
              <Banner tone="success">{t('आपने इस काम के लिए पहले ही आवेदन कर दिया है।')}</Banner>
            ) : (
              <Button variant="worker" size="lg" block loading={applying} onClick={() => apply(selected)}>{t('Apply करें')}</Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
