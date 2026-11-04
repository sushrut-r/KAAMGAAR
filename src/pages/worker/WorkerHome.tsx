import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Attendance, JobSearchRow, Payment } from '../../lib/types';
import {
  ATTENDANCE_LABEL,
  dayLabel,
  greeting,
  rupee,
  distanceLabel,
  fmtClock,
  fmtTime,
} from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { InstallPrompt } from '../../components/InstallPrompt';
import { Card, Chip, ErrorState, SectionTitle, Skeleton, Stat, EmptyState, Banner } from '../../components/ui';
import { t } from '../../lib/i18n';

export default function WorkerHome() {
  const { profile, worker, refresh } = useAuth();
  const [jobs, setJobs] = useState<JobSearchRow[] | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      await api.expireAvailability().catch(() => undefined);
      const [j, a, p] = await Promise.all([
        api.searchJobs({ lat: profile.latitude, lng: profile.longitude }),
        api.myAttendance(profile.id, 'worker'),
        api.myPayments(profile.id, 'worker'),
      ]);
      setJobs(j.slice(0, 4));
      setAttendance(a);
      setPayments(p);
    } catch (e) {
      setError(errMsg(e));
      setJobs([]);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const isAvailable = worker?.availability_status === 'available';
  const today = attendance.find((a) => a.date === new Date().toISOString().slice(0, 10));
  const totalEarned = payments.reduce((s, p) => s + Number(p.amount), 0);
  const paid = payments.reduce((s, p) => s + Number(p.paid_amount), 0);

  async function toggleAvailability() {
    setBusy(true);
    setError(null);
    try {
      if (isAvailable) await api.stopAvailability();
      else {
        const until = new Date();
        until.setHours(23, 59, 0, 0);
        await api.publishAvailability({
          skill_id: null,
          location: profile?.location ?? t('मेरा इलाका'),
          radius: worker?.work_radius ?? 5,
          available_from: new Date().toISOString(),
          available_until: until.toISOString(),
          expected_wage: worker?.expected_daily_wage ?? 0,
          job_type: 'daily',
          available_time: t('सुबह 8 बजे से'),
          latitude: profile?.latitude ?? null,
          longitude: profile?.longitude ?? null,
        });
      }
      await refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {greeting()}, {profile?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-ink-faint">{t('आज आपके आसपास का काम और आपकी हाजिरी — एक ही जगह।')}</p>
      </div>

      <InstallPrompt accent="worker" />

      {error && <Banner tone="error">{error}</Banner>}

      {/* availability control */}
      <div
        className={`kg-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${
          isAvailable ? 'border-employer/30 bg-employer-soft/40' : ''
        }`}
      >
        <div className="flex-1">
          <p className="text-lg font-bold">
            {isAvailable ? t('🟢 आप अभी काम के लिए उपलब्ध हैं') : t('⚪ आप अभी उपलब्ध नहीं हैं')}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {isAvailable
              ? t("नियोक्ता आपको \"उपलब्ध कारीगर\" में देख पा रहे हैं।")
              : t('चालू करें ताकि नियोक्ता आपको ढूंढ सकें और काम के लिए बुला सकें।')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isAvailable ? 'outline' : 'worker'}
            size="lg"
            loading={busy}
            onClick={toggleAvailability}
          >
            {isAvailable ? t('उपलब्धता बंद करें') : t('मैं काम के लिए उपलब्ध हूँ')}
          </Button>
          <Link to="/worker/availability" className="hidden sm:block">
            <Button variant="outline" size="lg">{t('विवरण')}</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('कुल कमाई')} value={rupee(totalEarned)} icon="💰" tone="worker" />
        <Stat label={t('मिल चुका')} value={rupee(paid)} icon="✅" tone="employer" />
        <Stat label={t('बकाया')} value={rupee(totalEarned - paid)} icon="⏳" tone="gold" />
        <Stat label={t('रेटिंग')} value={`⭐ ${Number(worker?.rating_avg ?? 0).toFixed(1)}`} icon="⭐" />
      </div>

      {/* today's hajri */}
      <section>
        <SectionTitle sub={t('दोनों तरफ से पुष्टि के बाद ही हाजिरी पक्की होती है।')}>{t('आज की हाजिरी')}</SectionTitle>
        {today ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{t(ATTENDANCE_LABEL[today.attendance_status])}</p>
                <p className="text-sm text-ink-soft">
                  {t('तय समय:')} {fmtTime(today.scheduled_in)} – {fmtTime(today.scheduled_out)}
                </p>
              </div>
              <Link to="/worker/hajri">
                <Button variant="worker">{t('हाजिरी खोलें')}</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <EmptyState
            icon="🕐"
            title={t('आज कोई हाजिरी नहीं है।')}
            hint={t('जब कोई काम पक्का होगा, उसी दिन की हाजिरी यहाँ दिखेगी।')}
          />
        )}
      </section>

      {/* nearby jobs */}
      <section>
        <SectionTitle
          sub={t('आपके इलाके में अभी खुले हुए काम।')}
          action={
            <Link to="/worker/jobs">
              <Button variant="outline" size="sm">{t('सभी काम')}</Button>
            </Link>
          }
        >{t('मेरे आसपास उपलब्ध काम')}</SectionTitle>
        {jobs === null ? (
          <Skeleton count={2} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : jobs.length === 0 ? (
          <EmptyState icon="🔨" title={t('कोई काम उपलब्ध नहीं है।')} hint={t('थोड़ी देर बाद फिर देखें — नए काम रोज़ आते हैं।')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.map((j) => (
              <Card key={j.job_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {j.icon ?? '🔨'} {j.title}
                    </p>
                    <p className="text-sm text-ink-soft">{j.company_name ?? j.employer_name}</p>
                  </div>
                  <p className="shrink-0 text-lg font-extrabold text-worker">{rupee(j.daily_wage)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Chip>📍 {j.location}</Chip>
                  {distanceLabel(j.distance_km) && <Chip>🧭 {distanceLabel(j.distance_km)}</Chip>}
                  <Chip>📅 {dayLabel(j.start_date)}</Chip>
                  <Chip>
                    🕗 {fmtClock(j.start_time)} - {fmtClock(j.end_time)}
                  </Chip>
                  <Chip>👷 {j.workers_required} {t('कामगार')}</Chip>
                </div>
                <Link to="/worker/jobs" className="mt-3 block">
                  <Button variant="worker" size="sm" block>{t('काम देखें')}</Button>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
