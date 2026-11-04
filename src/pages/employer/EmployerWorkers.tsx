import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Job, PortfolioItem, Review, Skill, WorkerSearchRow } from '../../lib/types';
import { distanceLabel, fmtTime, rupee } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import {
  Avatar,
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

export default function EmployerWorkers() {
  const { lang } = useLang();
  const { profile } = useAuth();
  const [rows, setRows] = useState<WorkerSearchRow[] | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    skill_id: '',
    max_wage: '',
    min_rating: '',
    min_experience: '',
    max_distance: '',
    search: '',
  });
  const [profileOf, setProfileOf] = useState<WorkerSearchRow | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [inviteFor, setInviteFor] = useState<WorkerSearchRow | null>(null);
  const [inviteJob, setInviteJob] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      await api.expireAvailability().catch(() => undefined);
      setRows(
        await api.searchWorkers({
          skill_id: filters.skill_id || null,
          max_wage: filters.max_wage ? Number(filters.max_wage) : null,
          min_rating: filters.min_rating ? Number(filters.min_rating) : null,
          min_experience: filters.min_experience ? Number(filters.min_experience) : null,
          max_distance: filters.max_distance ? Number(filters.max_distance) : null,
          search: filters.search || null,
          lat: profile?.latitude ?? null,
          lng: profile?.longitude ?? null,
        }),
      );
    } catch (e) {
      setError(errMsg(e));
      setRows([]);
    }
  }, [filters, profile]);

  useEffect(() => {
    api.skills().then(setSkills).catch(() => undefined);
    if (profile) api.myJobs(profile.id).then((j) => setJobs(j.filter((x) => x.status === 'open'))).catch(() => undefined);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function openProfile(w: WorkerSearchRow) {
    setProfileOf(w);
    setPortfolio([]);
    setReviews([]);
    api.portfolioOf(w.worker_id).then(setPortfolio).catch(() => undefined);
    api.reviewsFor(w.worker_id).then(setReviews).catch(() => undefined);
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteFor || !inviteJob) return;
    setBusy(true);
    setError(null);
    try {
      await api.inviteWorker(inviteJob, inviteFor.worker_id, inviteMsg || undefined);
      setFlash(lang === 'hi' ? `${inviteFor.name} को काम के लिए बुलावा भेज दिया गया ✅` : `Invite sent to ${inviteFor.name} ✅`);
      setInviteFor(null);
      setInviteMsg('');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('केवल वही कारीगर दिखते हैं जिनकी उपलब्धता अभी चालू है।')}>{t('काम के लिए उपलब्ध कारीगर')}</SectionTitle>

      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <Card className="!p-3">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
            placeholder={t('ज़्यादा से ज़्यादा ₹')}
            inputMode="numeric"
            value={filters.max_wage}
            onChange={(e) => setFilters({ ...filters, max_wage: e.target.value })}
          />
          <select
            className="kg-input"
            value={filters.min_rating}
            onChange={(e) => setFilters({ ...filters, min_rating: e.target.value })}
          >
            <option value="">{t('कोई भी रेटिंग')}</option>
            <option value="3">3★ +</option>
            <option value="4">4★ +</option>
            <option value="4.5">4.5★ +</option>
          </select>
          <select
            className="kg-input"
            value={filters.min_experience}
            onChange={(e) => setFilters({ ...filters, min_experience: e.target.value })}
          >
            <option value="">{t('कोई भी अनुभव')}</option>
            <option value="1">{t('1+ साल')}</option>
            <option value="3">{t('3+ साल')}</option>
            <option value="5">{t('5+ साल')}</option>
          </select>
          <select
            className="kg-input"
            value={filters.max_distance}
            onChange={(e) => setFilters({ ...filters, max_distance: e.target.value })}
          >
            <option value="">{t('कोई भी दूरी')}</option>
            <option value="2">2 km</option>
            <option value="5">5 km</option>
            <option value="10">10 km</option>
            <option value="25">25 km</option>
          </select>
          <input
            className="kg-input"
            placeholder={t('नाम / इलाका')}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
      </Card>

      {rows === null ? (
        <Skeleton count={3} />
      ) : error && rows.length === 0 ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🧑‍🏭"
          title={t('अभी आपके आसपास कोई उपलब्ध कारीगर नहीं मिला।')}
          hint={t('फ़िल्टर हटाकर देखें, या काम पोस्ट करें ताकि कारीगर खुद आवेदन करें।')}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((w) => (
            <Card key={w.worker_id}>
              <div className="flex items-start gap-3">
                <Avatar name={w.name} src={w.photo} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold">{w.name}</p>
                    {w.verification_status === 'verified' && <span title={t('सत्यापित')}>✔️</span>}
                  </div>
                  <p className="text-sm text-ink-soft">
                    {w.icon ?? '🔨'} {w.skill_hi ?? w.skill ?? t('कारीगर')}
                  </p>
                </div>
                <div className="text-right">
                  <Stars value={w.rating} size="md" />
                  <p className="text-[11px] text-ink-faint">{w.rating_count ?? 0} {t('रिव्यू')}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="employer">{rupee(w.expected_wage)}{t('/दिन')}</Chip>
                {w.experience ? <Chip>{w.experience} {t('साल अनुभव')}</Chip> : null}
                {w.area && <Chip>📍 {w.area}</Chip>}
                {distanceLabel(w.distance_km) && <Chip>🧭 {distanceLabel(w.distance_km)}</Chip>}
                <Chip tone="green">{lang === 'hi' ? <>🟢 {fmtTime(w.available_until)} {t('तक उपलब्ध')}</> : <>🟢 {t('available until')} {fmtTime(w.available_until)}</>}</Chip>
                {w.completed_jobs ? <Chip>✅ {w.completed_jobs} {t('काम पूरे')}</Chip> : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openProfile(w)}>{t('प्रोफाइल देखें')}</Button>
                <Button
                  variant="employer"
                  size="sm"
                  onClick={() => {
                    setInviteFor(w);
                    setInviteJob(jobs[0]?.id ?? '');
                  }}
                >{t('काम के लिए बुलाएं')}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* worker profile */}
      <Modal open={!!profileOf} title={profileOf?.name ?? ''} onClose={() => setProfileOf(null)}>
        {profileOf && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={profileOf.name} src={profileOf.photo} size={64} />
              <div>
                <p className="text-lg font-bold">{profileOf.name}</p>
                <p className="text-sm text-ink-soft">
                  {profileOf.icon} {profileOf.skill_hi}
                </p>
                <Stars value={profileOf.rating} size="md" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="employer">{rupee(profileOf.expected_wage)}{t('/दिन')}</Chip>
              <Chip>{profileOf.experience ?? 0} {t('साल अनुभव')}</Chip>
              <Chip>✅ {profileOf.completed_jobs ?? 0} {t('काम पूरे')}</Chip>
              <Chip>{t('स्कोर')} {Number(profileOf.work_score ?? 0).toFixed(0)}</Chip>
              {profileOf.area && <Chip>📍 {profileOf.area}</Chip>}
            </div>

            {portfolio.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-bold">{t('काम की फोटो')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {portfolio.slice(0, 6).map((p) => (
                    <img
                      key={p.id}
                      src={p.file_url}
                      alt={p.title ?? ''}
                      className="h-20 w-full rounded-lg border border-line object-cover"
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-bold">{t('रिव्यू')}</p>
              {reviews.length === 0 ? (
                <p className="text-sm text-ink-faint">{t('अभी कोई रिव्यू नहीं है।')}</p>
              ) : (
                <div className="space-y-2">
                  {reviews.slice(0, 5).map((r) => (
                    <div key={r.id} className="rounded-xl border border-line bg-cream px-3 py-2">
                      <Stars value={r.rating} />
                      {r.review && <p className="text-sm text-ink-soft">"{r.review}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="employer"
              size="lg"
              block
              onClick={() => {
                setInviteFor(profileOf);
                setInviteJob(jobs[0]?.id ?? '');
                setProfileOf(null);
              }}
            >{t('काम के लिए बुलाएं')}</Button>
          </div>
        )}
      </Modal>

      {/* invite */}
      <Modal open={!!inviteFor} title={lang === 'hi' ? `${inviteFor?.name ?? ''} ${t('को बुलाएं')}` : `${t('Invite')} ${inviteFor?.name ?? ''}`} onClose={() => setInviteFor(null)}>
        {jobs.length === 0 ? (
          <div className="space-y-3">
            <Banner tone="info">{t('बुलावा भेजने के लिए पहले कोई खुला काम पोस्ट करना ज़रूरी है।')}</Banner>
            <a href="/employer/post">
              <Button variant="employer" block>{t('काम पोस्ट करें')}</Button>
            </a>
          </div>
        ) : (
          <form onSubmit={sendInvite} className="space-y-3">
            <Field label={t('किस काम के लिए?')} required>
              <select className="kg-input" value={inviteJob} onChange={(e) => setInviteJob(e.target.value)} required>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} · {rupee(j.daily_wage)}{t('/दिन')} · {j.location}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('संदेश (वैकल्पिक)')}>
              <textarea
                className="kg-input"
                rows={3}
                value={inviteMsg}
                onChange={(e) => setInviteMsg(e.target.value)}
                placeholder={t('जैसे: कल सुबह 8 बजे साइट पर आ जाइए।')}
              />
            </Field>
            <Button type="submit" variant="employer" size="lg" block loading={busy}>{t('बुलावा भेजें')}</Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
