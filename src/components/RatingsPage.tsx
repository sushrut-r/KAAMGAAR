import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import type { Profile, Review } from '../lib/types';
import { fmtDate } from '../lib/format';
import { Avatar, Banner, Card, Chip, EmptyState, SectionTitle, Skeleton, Stars, Stat } from './ui';
import { t } from '../lib/i18n';

const CAT_LABEL: Record<string, string> = {
  work_quality: t('काम की गुणवत्ता'),
  punctuality: t('समय की पाबंदी'),
  behaviour: t('व्यवहार'),
  reliability: t('भरोसा'),
  payment_timeliness: t('भुगतान समय पर'),
  work_conditions: t('काम की जगह'),
  job_accuracy: t('जानकारी सही'),
};

export function RatingsPage({ side }: { side: 'worker' | 'employer' }) {
  const { profile, worker, employer } = useAuth();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    api
      .reviewsFor(profile.id)
      .then(async (r) => {
        setReviews(r);
        const map: Record<string, Profile> = {};
        await Promise.all(
          [...new Set(r.map((x) => x.reviewer_id))].map(async (id) => {
            const p = await api.getProfile(id).catch(() => null);
            if (p) map[id] = p;
          }),
        );
        setPeople(map);
      })
      .catch((e) => {
        setError(errMsg(e));
        setReviews([]);
      });
  }, [profile]);

  const avg = side === 'worker' ? worker?.rating_avg : employer?.rating_avg;
  const count = side === 'worker' ? worker?.rating_count : employer?.rating_count;
  const score = side === 'worker' ? worker?.work_score : employer?.employer_score;

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('रेटिंग केवल पूरे हुए काम के बाद ही दी जा सकती है।')}>
        {side === 'worker' ? t('मेरी रेटिंग') : t('मेरी रेटिंग और रिव्यू')}
      </SectionTitle>
      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('औसत रेटिंग')} value={`⭐ ${Number(avg ?? 0).toFixed(1)}`} tone="gold" />
        <Stat label={t('कुल रिव्यू')} value={count ?? 0} />
        <Stat label={side === 'worker' ? t('वर्क स्कोर') : t('नियोक्ता स्कोर')} value={Number(score ?? 0).toFixed(0)} tone={side} />
      </div>

      {reviews === null ? (
        <Skeleton count={2} />
      ) : reviews.length === 0 ? (
        <EmptyState icon="⭐" title={t('अभी कोई रेटिंग नहीं मिली है।')} hint={t('काम पूरा होने पर दूसरा पक्ष आपको रेटिंग दे सकेगा।')} />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => {
            const p = people[r.reviewer_id];
            return (
              <Card key={r.id}>
                <div className="flex items-start gap-3">
                  <Avatar name={p?.name ?? '?'} src={p?.profile_photo} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold">{p?.name ?? t('यूज़र')}</p>
                      <Stars value={r.rating} size="md" />
                    </div>
                    <p className="text-xs text-ink-faint">{fmtDate(r.created_at)}</p>
                    {r.review && <p className="mt-2 text-sm text-ink-soft">"{r.review}"</p>}
                    {r.work_photo && (
                      <a
                        href={r.work_photo}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block"
                        aria-label={t('काम की फोटो बड़ी देखें')}
                      >
                        <img
                          src={r.work_photo}
                          alt={t('पूरे हुए काम की फोटो')}
                          loading="lazy"
                          className="h-28 w-28 rounded-lg border border-line object-cover"
                        />
                        <span className="block text-xs text-ink-faint">{t('📸 काम की फोटो — बड़ी देखने के लिए टैप करें')}</span>
                      </a>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(r.categories ?? {}).map(([k, v]) => (
                        <Chip key={k}>
                          {CAT_LABEL[k] ?? k}: {v}★
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
