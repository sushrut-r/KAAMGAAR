import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Application, Job, Profile } from '../../lib/types';
import { APPLICATION_LABEL, dayLabel, fmtClock, rupee, timeAgo } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Banner, Card, Chip, EmptyState, SectionTitle, Skeleton } from '../../components/ui';
import { t } from '../../lib/i18n';

export default function WorkerApplications() {
  const { profile } = useAuth();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [employers, setEmployers] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const rows = await api.myApplications(profile.id);
      setApps(rows);
      const jobMap: Record<string, Job> = {};
      const empMap: Record<string, Profile> = {};
      await Promise.all(
        [...new Set(rows.map((r) => r.job_id))].map(async (id) => {
          const j = await api.getJob(id).catch(() => null);
          if (j) jobMap[id] = j;
        }),
      );
      await Promise.all(
        [...new Set(rows.map((r) => r.employer_id))].map(async (id) => {
          const p = await api.getProfile(id).catch(() => null);
          if (p) empMap[id] = p;
        }),
      );
      setJobs(jobMap);
      setEmployers(empMap);
    } catch (e) {
      setError(errMsg(e));
      setApps([]);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function accept(a: Application) {
    setBusy(a.id);
    setError(null);
    try {
      await api.acceptApplication(a.id);
      setFlash(t('बुलावा स्वीकार — काम पक्का हो गया ✅'));
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(a: Application) {
    setBusy(a.id);
    try {
      await api.setApplicationStatus(a.id, 'cancelled');
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('आपके भेजे आवेदन और नियोक्ता के बुलावे।')}>{t('मेरे आवेदन')}</SectionTitle>
      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      {apps === null ? (
        <Skeleton count={3} />
      ) : apps.length === 0 ? (
        <EmptyState icon="📨" title={t('अभी कोई आवेदन नहीं है।')} hint={t("'काम खोजें' में जाकर पसंद के काम पर Apply करें।")} />
      ) : (
        <div className="space-y-3">
          {apps.map((a) => {
            const j = jobs[a.job_id];
            const emp = employers[a.employer_id];
            const isInvite = a.source === 'employer_invited' && a.status === 'invited';
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{j?.title ?? t('काम')}</p>
                    <p className="text-sm text-ink-soft">
                      {emp?.name ?? '—'} · {timeAgo(a.applied_at)}
                    </p>
                  </div>
                  <Chip
                    tone={
                      a.status === 'accepted'
                        ? 'green'
                        : a.status === 'rejected' || a.status === 'cancelled'
                          ? 'red'
                          : a.status === 'invited'
                            ? 'worker'
                            : 'amber'
                    }
                  >
                    {t(APPLICATION_LABEL[a.status])}
                  </Chip>
                </div>

                {j && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Chip tone="worker">{rupee(j.daily_wage)}{t('/दिन')}</Chip>
                    <Chip>📍 {j.location}</Chip>
                    <Chip>📅 {dayLabel(j.start_date)}</Chip>
                    <Chip>
                      🕗 {fmtClock(j.start_time)} - {fmtClock(j.end_time)}
                    </Chip>
                  </div>
                )}

                {a.message && <p className="mt-2 text-sm text-ink-soft">💬 {a.message}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  {isInvite && (
                    <Button variant="worker" size="sm" loading={busy === a.id} onClick={() => accept(a)}>{t('बुलावा स्वीकार करें')}</Button>
                  )}
                  {['applied', 'shortlisted', 'invited'].includes(a.status) && (
                    <Button variant="outline" size="sm" loading={busy === a.id} onClick={() => cancel(a)}>{t('रद्द करें')}</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
