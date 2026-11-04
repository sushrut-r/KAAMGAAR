import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Application, Attendance, Job, Payment, WorkerSearchRow } from '../../lib/types';
import { ATTENDANCE_LABEL, dayLabel, fmtClock, greeting, rupee, todayISO } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { InstallPrompt } from '../../components/InstallPrompt';
import { Banner, Card, Chip, EmptyState, SectionTitle, Skeleton, Stat, Stars, Avatar } from '../../components/ui';
import { t } from '../../lib/i18n';

export default function EmployerHome() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [att, setAtt] = useState<Attendance[]>([]);
  const [pays, setPays] = useState<Payment[]>([]);
  const [workers, setWorkers] = useState<WorkerSearchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      await api.expireAvailability().catch(() => undefined);
      const [j, a, at, p, w] = await Promise.all([
        api.myJobs(profile.id),
        api.employerApplications(profile.id),
        api.myAttendance(profile.id, 'employer'),
        api.myPayments(profile.id, 'employer'),
        api.searchWorkers({ lat: profile.latitude, lng: profile.longitude }),
      ]);
      setJobs(j);
      setApps(a);
      setAtt(at);
      setPays(p);
      setWorkers(w.slice(0, 4));
    } catch (e) {
      setError(errMsg(e));
      setJobs([]);
      setWorkers([]);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const activeJobs = (jobs ?? []).filter((j) => j.status === 'open' || j.status === 'filled').length;
  const hiredCount = (jobs ?? []).reduce((s, j) => s + j.workers_hired, 0);
  const todayAtt = att.filter((a) => a.date === todayISO());
  const pending = pays.reduce((s, p) => s + (Number(p.amount) - Number(p.paid_amount)), 0);
  const newApps = apps.filter((a) => a.status === 'applied').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {greeting()}, {profile?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-ink-faint">{t('काम पोस्ट करें, कारीगर खोजें और हाजिरी पक्की करें।')}</p>
      </div>

      <InstallPrompt accent="employer" />

      {error && <Banner tone="error">{error}</Banner>}

      <div className="flex flex-wrap gap-2">
        <Link to="/employer/post">
          <Button variant="employer" size="lg">{t('➕ काम पोस्ट करें')}</Button>
        </Link>
        <Link to="/employer/workers">
          <Button variant="outline" size="lg">{t('👷 उपलब्ध कारीगर देखें')}</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('चालू काम')} value={activeJobs} icon="📋" tone="employer" />
        <Stat label={t('कामगार रखे')} value={hiredCount} icon="👷" />
        <Stat label={t('आज की हाजिरी')} value={todayAtt.length} icon="🕐" tone="worker" />
        <Stat label={t('बकाया भुगतान')} value={rupee(pending)} icon="💰" tone="gold" />
      </div>

      {newApps > 0 && (
        <Banner tone="info">
          📩 {newApps} {t('नए आवेदन आपकी मंज़ूरी का इंतज़ार कर रहे हैं.')}{' '}
          <Link to="/employer/applications" className="font-bold underline">{t('देखें')}</Link>
        </Banner>
      )}

      <section>
        <SectionTitle sub={t('दोनों तरफ से पुष्टि होने पर ही हाजिरी पक्की होती है।')}>{t('आज की हाजिरी')}</SectionTitle>
        {todayAtt.length === 0 ? (
          <EmptyState icon="🕐" title={t('आज कोई हाजिरी नहीं है।')} hint={t('काम पक्का होते ही हाजिरी अपने आप बन जाती है।')} />
        ) : (
          <div className="space-y-2">
            {todayAtt.map((a) => (
              <Card key={a.id} className="!py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Chip tone={a.attendance_status === 'completed' || a.attendance_status === 'present' ? 'green' : 'amber'}>
                    {t(ATTENDANCE_LABEL[a.attendance_status])}
                  </Chip>
                  <Link to="/employer/hajri">
                    <Button variant="employer" size="sm">{t('हाजिरी खोलें')}</Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          sub={t('अभी काम के लिए तैयार कारीगर।')}
          action={
            <Link to="/employer/workers">
              <Button variant="outline" size="sm">{t('सभी देखें')}</Button>
            </Link>
          }
        >{t('काम के लिए उपलब्ध कारीगर')}</SectionTitle>
        {workers === null ? (
          <Skeleton count={2} />
        ) : workers.length === 0 ? (
          <EmptyState icon="🧑‍🏭" title={t('अभी आपके आसपास कोई उपलब्ध कारीगर नहीं मिला।')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {workers.map((w) => (
              <Card key={w.worker_id}>
                <div className="flex items-start gap-3">
                  <Avatar name={w.name} src={w.photo} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{w.name}</p>
                    <p className="text-sm text-ink-soft">
                      {w.icon ?? '🔨'} {w.skill_hi ?? t('कारीगर')}
                    </p>
                  </div>
                  <Stars value={w.rating} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Chip tone="employer">{rupee(w.expected_wage)}{t('/दिन')}</Chip>
                  {w.area && <Chip>📍 {w.area}</Chip>}
                  <Chip tone="green">{t('🟢 उपलब्ध')}</Chip>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          action={
            <Link to="/employer/jobs">
              <Button variant="outline" size="sm">{t('सभी काम')}</Button>
            </Link>
          }
        >{t('मेरे हाल के काम')}</SectionTitle>
        {jobs === null ? (
          <Skeleton count={2} />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon="📋"
            title={t('आपने अभी कोई काम पोस्ट नहीं किया।')}
            hint={t('पहला काम पोस्ट करें और कारीगर पाएं।')}
            action={
              <Link to="/employer/post">
                <Button variant="employer">{t('काम पोस्ट करें')}</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.slice(0, 4).map((j) => (
              <Card key={j.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold">{j.title}</p>
                  <Chip tone={j.status === 'open' ? 'green' : 'neutral'}>{j.status}</Chip>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip tone="employer">{rupee(j.daily_wage)}{t('/दिन')}</Chip>
                  <Chip>📍 {j.location}</Chip>
                  <Chip>📅 {dayLabel(j.start_date)}</Chip>
                  <Chip>
                    🕗 {fmtClock(j.start_time)} - {fmtClock(j.end_time)}
                  </Chip>
                  <Chip>
                    👷 {j.workers_hired}/{j.workers_required}
                  </Chip>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
