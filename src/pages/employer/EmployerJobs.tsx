import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Hire, Job, Profile, Review } from '../../lib/types';
import { HIRE_LABEL, dayLabel, fmtClock, rupee } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Banner, Card, Chip, EmptyState, SectionTitle, Skeleton } from '../../components/ui';
import { RateModal } from '../../components/RateModal';
import { t } from '../../lib/i18n';

export default function EmployerJobs() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [hires, setHires] = useState<Hire[]>([]);
  const [workers, setWorkers] = useState<Record<string, Profile>>({});
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rating, setRating] = useState<Hire | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const [j, h, r] = await Promise.all([
        api.myJobs(profile.id),
        api.myHires(profile.id, 'employer'),
        api.reviewsBy(profile.id).catch(() => []),
      ]);
      setJobs(j);
      setHires(h);
      setMyReviews(r);
      const map: Record<string, Profile> = {};
      await Promise.all(
        [...new Set(h.map((x) => x.worker_id))].map(async (id) => {
          const p = await api.getProfile(id).catch(() => null);
          if (p) map[id] = p;
        }),
      );
      setWorkers(map);
    } catch (e) {
      setError(errMsg(e));
      setJobs([]);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const reviewed = new Set(myReviews.map((r) => r.hire_id));

  async function closeJob(j: Job) {
    try {
      await api.updateJob(j.id, { status: 'cancelled' });
      setFlash(t('काम बंद कर दिया गया।'));
      load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        sub={t('आपके पोस्ट किए काम और उन पर रखे गए कामगार।')}
        action={
          <Link to="/employer/post">
            <Button variant="employer" size="sm">{t('➕ नया काम')}</Button>
          </Link>
        }
      >{t('मेरे काम')}</SectionTitle>

      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      {jobs === null ? (
        <Skeleton count={3} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="📋"
          title={t('आपने अभी कोई काम पोस्ट नहीं किया।')}
          action={
            <Link to="/employer/post">
              <Button variant="employer">{t('काम पोस्ट करें')}</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => {
            const jh = hires.filter((h) => h.job_id === j.id);
            return (
              <Card key={j.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{j.title}</p>
                    <p className="text-sm text-ink-soft">{j.description}</p>
                  </div>
                  <Chip
                    tone={j.status === 'open' ? 'green' : j.status === 'cancelled' ? 'red' : 'neutral'}
                  >
                    {j.status === 'open'
                      ? t('🟢 खुला')
                      : j.status === 'filled'
                        ? t('👷 भर गया')
                        : j.status === 'completed'
                          ? t('✅ पूरा')
                          : j.status === 'cancelled'
                            ? t('✖️ बंद')
                            : j.status}
                  </Chip>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Chip tone="employer">{rupee(j.daily_wage)}{t('/दिन')}</Chip>
                  <Chip>📍 {j.location}</Chip>
                  <Chip>📅 {dayLabel(j.start_date)}</Chip>
                  <Chip>
                    🕗 {fmtClock(j.start_time)} - {fmtClock(j.end_time)}
                  </Chip>
                  <Chip>
                    👷 {j.workers_hired}/{j.workers_required}
                  </Chip>
                  {Number(j.overtime_rate) > 0 && <Chip tone="amber">⏱️ OT {rupee(j.overtime_rate)}{t('/घंटा')}</Chip>}
                </div>

                {jh.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    <p className="text-sm font-bold text-ink-soft">{t('रखे गए कामगार')}</p>
                    {jh.map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold">{workers[h.worker_id]?.name ?? '—'}</span>
                          <Chip tone={h.status === 'completed' ? 'green' : 'employer'}>{t(HIRE_LABEL[h.status])}</Chip>
                        </div>
                        {h.status === 'completed' &&
                          (reviewed.has(h.id) ? (
                            <Chip tone="green">{t('⭐ रेटिंग दी गई')}</Chip>
                          ) : (
                            <Button variant="employer" size="sm" onClick={() => setRating(h)}>{t('कामगार को रेटिंग दें')}</Button>
                          ))}
                      </div>
                    ))}
                  </div>
                )}

                {j.status === 'open' && (
                  <button
                    onClick={() => closeJob(j)}
                    className="mt-3 text-xs font-semibold text-ink-faint underline hover:text-danger"
                  >{t('यह काम बंद करें')}</button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <RateModal
        hire={rating}
        side="employer"
        onClose={() => setRating(null)}
        onDone={() => {
          setFlash(t('रेटिंग दर्ज हो गई ⭐'));
          setRating(null);
          load();
        }}
        onError={setError}
      />
    </div>
  );
}
