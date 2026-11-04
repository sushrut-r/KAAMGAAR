import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Application, Job, Profile, WorkerProfile } from '../../lib/types';
import { APPLICATION_LABEL, rupee, timeAgo } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Avatar, Banner, Card, Chip, EmptyState, SectionTitle, Skeleton, Stars } from '../../components/ui';
import { t } from '../../lib/i18n';

export default function EmployerApplications() {
  const { profile } = useAuth();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [workers, setWorkers] = useState<Record<string, Profile>>({});
  const [wp, setWp] = useState<Record<string, WorkerProfile>>({});
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'all'>('active');

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const rows = await api.employerApplications(profile.id);
      setApps(rows);
      const jm: Record<string, Job> = {};
      const pm: Record<string, Profile> = {};
      const wm: Record<string, WorkerProfile> = {};
      await Promise.all(
        [...new Set(rows.map((r) => r.job_id))].map(async (id) => {
          const j = await api.getJob(id).catch(() => null);
          if (j) jm[id] = j;
        }),
      );
      await Promise.all(
        [...new Set(rows.map((r) => r.worker_id))].map(async (id) => {
          const [p, w] = await Promise.all([
            api.getProfile(id).catch(() => null),
            api.getWorkerProfile(id).catch(() => null),
          ]);
          if (p) pm[id] = p;
          if (w) wm[id] = w;
        }),
      );
      setJobs(jm);
      setWorkers(pm);
      setWp(wm);
    } catch (e) {
      setError(errMsg(e));
      setApps([]);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(a: Application, action: 'accept' | 'shortlist' | 'reject') {
    setBusy(a.id);
    setError(null);
    try {
      if (action === 'accept') {
        await api.acceptApplication(a.id);
        setFlash(t('काम पक्का हो गया ✅ — हाजिरी अपने आप बन गई है।'));
      } else {
        await api.setApplicationStatus(a.id, action === 'shortlist' ? 'shortlisted' : 'rejected');
        setFlash(t('आवेदन अपडेट हो गया।'));
      }
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const list = (apps ?? []).filter((a) =>
    tab === 'active' ? ['applied', 'shortlisted', 'invited'].includes(a.status) : true,
  );

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('कामगार के आवेदन और आपके भेजे बुलावे।')}>{t('आवेदन')}</SectionTitle>
      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <div className="inline-grid grid-cols-2 gap-1 rounded-xl bg-cream-deep p-1">
        {(['active', 'all'] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === tb ? 'bg-white shadow-sm' : 'text-ink-faint'}`}
          >
            {tb === 'active' ? t('चालू') : t('सभी')}
          </button>
        ))}
      </div>

      {apps === null ? (
        <Skeleton count={3} />
      ) : list.length === 0 ? (
        <EmptyState icon="📨" title={t('अभी कोई आवेदन नहीं आया है।')} hint={t('काम पोस्ट करें या कारीगर को खुद बुलावा भेजें।')} />
      ) : (
        <div className="space-y-3">
          {list.map((a) => {
            const j = jobs[a.job_id];
            const w = workers[a.worker_id];
            const wpr = wp[a.worker_id];
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar name={w?.name ?? '?'} src={w?.profile_photo} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{w?.name ?? t('कामगार')}</p>
                    <p className="text-sm text-ink-soft">
                      {j?.title ?? t('काम')} · {timeAgo(a.applied_at)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Chip>{a.source === 'employer_invited' ? t('📤 आपका बुलावा') : t('📩 कामगार का आवेदन')}</Chip>
                      {wpr && <Chip tone="employer">{rupee(wpr.expected_daily_wage)}{t('/दिन')}</Chip>}
                      {wpr?.experience ? <Chip>{wpr.experience} {t('साल अनुभव')}</Chip> : null}
                      {wpr && (
                        <Chip>
                          <Stars value={wpr.rating_avg} />
                        </Chip>
                      )}
                      {w?.location && <Chip>📍 {w.location}</Chip>}
                    </div>
                    {a.message && <p className="mt-2 text-sm text-ink-soft">💬 {a.message}</p>}
                  </div>
                  <Chip
                    tone={
                      a.status === 'accepted'
                        ? 'green'
                        : a.status === 'rejected' || a.status === 'cancelled'
                          ? 'red'
                          : 'amber'
                    }
                  >
                    {t(APPLICATION_LABEL[a.status])}
                  </Chip>
                </div>

                {['applied', 'shortlisted'].includes(a.status) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="employer" size="sm" loading={busy === a.id} onClick={() => act(a, 'accept')}>{t('स्वीकार करें (Hire)')}</Button>
                    {a.status === 'applied' && (
                      <Button variant="outline" size="sm" loading={busy === a.id} onClick={() => act(a, 'shortlist')}>{t('शॉर्टलिस्ट')}</Button>
                    )}
                    <Button variant="ghost" size="sm" loading={busy === a.id} onClick={() => act(a, 'reject')}>{t('अस्वीकार')}</Button>
                  </div>
                )}
                {a.status === 'invited' && (
                  <p className="mt-3 text-sm text-ink-faint">{t('कामगार के जवाब का इंतज़ार है।')}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
