import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Hire, Job, Profile, Review } from '../../lib/types';
import { HIRE_LABEL, fmtClock, fmtDate, rupee } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Banner, Card, Chip, EmptyState, SectionTitle, Skeleton } from '../../components/ui';
import { RateModal } from '../../components/RateModal';
import { t } from '../../lib/i18n';

export default function WorkerMyJobs() {
  const { profile } = useAuth();
  const [hires, setHires] = useState<Hire[] | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [emps, setEmps] = useState<Record<string, Profile>>({});
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rating, setRating] = useState<Hire | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const rows = await api.myHires(profile.id, 'worker');
      setHires(rows);
      setMyReviews(await api.reviewsBy(profile.id).catch(() => []));
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
      setEmps(empMap);
    } catch (e) {
      setError(errMsg(e));
      setHires([]);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const reviewed = new Set(myReviews.map((r) => r.hire_id));

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('पक्के हुए, चल रहे और पूरे हो चुके काम।')}>{t('मेरा काम')}</SectionTitle>
      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      {hires === null ? (
        <Skeleton count={3} />
      ) : hires.length === 0 ? (
        <EmptyState icon="📋" title={t('अभी कोई काम पक्का नहीं हुआ है।')} hint={t('काम खोजें और आवेदन करें।')} />
      ) : (
        <div className="space-y-3">
          {hires.map((h) => {
            const j = jobs[h.job_id];
            const emp = emps[h.employer_id];
            return (
              <Card key={h.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{j?.title ?? t('काम')}</p>
                    <p className="text-sm text-ink-soft">{emp?.name ?? '—'}</p>
                  </div>
                  <Chip
                    tone={
                      h.status === 'completed'
                        ? 'green'
                        : h.status === 'disputed' || h.status === 'cancelled'
                          ? 'red'
                          : 'worker'
                    }
                  >
                    {t(HIRE_LABEL[h.status])}
                  </Chip>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Chip tone="worker">{rupee(h.daily_wage)}{t('/दिन')}</Chip>
                  <Chip>📅 {fmtDate(h.work_date)}</Chip>
                  <Chip>
                    🕗 {fmtClock(h.scheduled_in)} - {fmtClock(h.scheduled_out)}
                  </Chip>
                  {Number(h.overtime_rate) > 0 && <Chip tone="amber">⏱️ OT {rupee(h.overtime_rate)}{t('/घंटा')}</Chip>}
                  {j && <Chip>📍 {j.location}</Chip>}
                </div>
                {h.status === 'completed' && (
                  <div className="mt-3">
                    {reviewed.has(h.id) ? (
                      <Chip tone="green">{t('⭐ आपने रेटिंग दे दी है')}</Chip>
                    ) : (
                      <Button variant="worker" size="sm" onClick={() => setRating(h)}>{t('नियोक्ता को रेटिंग दें')}</Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <RateModal
        hire={rating}
        side="worker"
        onClose={() => setRating(null)}
        onDone={() => {
          setFlash(t('धन्यवाद! आपकी रेटिंग दर्ज हो गई ⭐'));
          setRating(null);
          load();
        }}
        onError={setError}
      />
    </div>
  );
}
