import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import type { PlatformStats, PublicWorkerRow } from '../lib/types';
import { rupee } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Avatar, Chip, Stars } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { LangToggle, t } from '../lib/i18n';

export default function Landing() {
  const navigate = useNavigate();
  const { userId, role, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [workers, setWorkers] = useState<PublicWorkerRow[] | null>(null);
  const [workersErr, setWorkersErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && userId && role) {
      navigate(role === 'admin' ? '/admin' : role === 'worker' ? '/worker' : '/employer', {
        replace: true,
      });
    }
  }, [authLoading, userId, role, navigate]);

  useEffect(() => {
    api.expireAvailability().catch(() => undefined);
    api
      .platformStats()
      .then(setStats)
      .catch((e) => setStatsErr(errMsg(e)));
    api
      .publicAvailableWorkers(6)
      .then(setWorkers)
      .catch((e) => {
        setWorkers([]);
        setWorkersErr(errMsg(e));
      });
  }, []);

  return (
    <div className="min-h-full bg-cream">
      {/* header */}
      <header className="border-b border-line/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-worker-soft text-2xl">
            🛠️
          </span>
          <div className="leading-tight">
            <h1 className="text-2xl font-extrabold tracking-tight">{t('कामगार')}</h1>
            <p className="text-xs text-ink-faint sm:text-[13px]">{t('डिजिटल कारीगर एवं मजदूर डायरेक्टरी')}</p>
          </div>
          <span className="kg-chip ml-1 hidden sm:inline-flex">{t('📍 GPS & फोटो सुविधा')}</span>
          <div className="flex-1" />
          <LangToggle className="shrink-0" />
          <div className="flex gap-2">
            <Link to="/auth/worker">
              <Button variant="outline" size="sm">{t('लॉगिन')}</Button>
            </Link>
            <Link to="/auth/employer?mode=signup">
              <Button variant="employer" size="sm">{t('रजिस्टर करें')}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pt-10 sm:pt-14">
        <div className="max-w-3xl">
          <span className="kg-chip mb-4 sm:hidden">{t('📍 GPS & फोटो सुविधा')}</span>
          <h2 className="text-3xl font-extrabold leading-[1.2] tracking-tight sm:text-5xl">{t('काम और भरोसेमंद कारीगर —')}<span className="text-worker">{t('अब एक ही जगह!')}</span>
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft sm:text-lg">{t('मिस्त्री, इलेक्ट्रिशियन, प्लंबर, कारपेंटर और अन्य कामगारों के लिए आसान प्लेटफॉर्म। काम ढूंढें, कामगार खोजें और भरोसे के साथ जुड़ें।')}</p>
        </div>

        {/* role cards */}
        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2">
          <RoleCard
            emoji="👷"
            accent="worker"
            title={t('मैं मजदूर / कारीगर हूँ')}
            desc={t('काम ढूंढें, अपना प्रोफाइल बनाएं और बताएं कि आप अभी काम के लिए उपलब्ध हैं।')}
            cta={t('काम ढूंढें / प्रोफाइल बनाएं')}
            to="/auth/worker"
            points={[t('नज़दीकी काम देखें'), t('रोज़ की हाजिरी डिजिटल'), t('मजदूरी का पक्का हिसाब')]}
          />
          <RoleCard
            emoji="🏗️"
            accent="employer"
            title={t('मुझे कारीगर चाहिए')}
            desc={t('अपने काम की जानकारी पोस्ट करें और आसपास उपलब्ध सही कारीगर खोजें।')}
            cta={t('काम पोस्ट करें / कारीगर खोजें')}
            to="/auth/employer"
            points={[t('उपलब्ध कारीगर तुरंत देखें'), t('हाजिरी दोनों तरफ से पक्की'), t('ओवरटाइम अपने आप जुड़े')]}
          />
        </div>
      </section>

      {/* stats */}
      <section className="mx-auto max-w-6xl px-4 pt-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox label={t('पंजीकृत कामगार')} value={stats?.registered_workers} loading={!stats && !statsErr} />
          <StatBox label={t('अभी उपलब्ध कामगार')} value={stats?.active_workers} loading={!stats && !statsErr} tone="worker" />
          <StatBox label={t('चालू काम')} value={stats?.active_jobs} loading={!stats && !statsErr} tone="employer" />
          <StatBox label={t('पूरे हुए काम')} value={stats?.completed_jobs} loading={!stats && !statsErr} />
        </div>
        {statsErr && (
          <p className="mt-2 text-center text-xs text-danger">{t('आँकड़े लोड नहीं हो पाए।')} {statsErr}</p>
        )}
      </section>

      {/* available workers */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold tracking-tight sm:text-2xl">{t('अभी उपलब्ध कारीगर')}</h3>
            <p className="text-sm text-ink-faint">{t('जो कामगार इस समय काम के लिए तैयार हैं।')}</p>
          </div>
          <Link to="/auth/employer" className="hidden sm:block">
            <Button variant="outline" size="sm">{t('सभी देखें')}</Button>
          </Link>
        </div>

        {workers === null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="kg-card h-40 animate-pulse bg-cream-deep/50" />
            ))}
          </div>
        ) : workers.length === 0 ? (
          <div className="kg-card flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="text-4xl">🧑‍🏭</span>
            <p className="font-semibold">{t('अभी आपके आसपास कोई उपलब्ध कारीगर नहीं मिला।')}</p>
            <p className="max-w-md text-sm text-ink-faint">
              {workersErr ?? t("जैसे ही कोई कामगार \"मैं उपलब्ध हूँ\" चुनेगा, वह यहाँ दिखेगा।")}
            </p>
            <Link to="/auth/worker" className="mt-2">
              <Button variant="worker" size="sm">{t('पहले कामगार बनें')}</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workers.map((w) => (
              <div key={w.worker_id} className="kg-card p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={w.name} src={w.photo} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{w.name}</p>
                    <p className="text-sm text-ink-soft">
                      {w.icon ?? '🔨'} {w.skill_hi ?? w.skill ?? t('कारीगर')}
                    </p>
                  </div>
                  <Stars value={w.rating} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Chip tone="worker">{rupee(w.expected_wage)}{t('/दिन')}</Chip>
                  {w.area && <Chip>📍 {w.area}</Chip>}
                  {w.experience ? <Chip>{w.experience} {t('साल अनुभव')}</Chip> : null}
                  <Chip tone="green">{t('🟢 आज उपलब्ध')}</Chip>
                </div>
                <Link to="/auth/employer" className="mt-3 block">
                  <Button variant="outline" size="sm" block>{t('प्रोफाइल देखें')}</Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* how it works */}
      <section className="border-y border-line/70 bg-cream-deep/40">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h3 className="text-xl font-bold tracking-tight sm:text-2xl">{t('काम शुरू से भुगतान तक — सब डिजिटल')}</h3>
          <p className="mt-1 text-sm text-ink-faint">{t("t('काम भी दिखाओ, कामगार भी दिखाओ, और काम शुरू होने से भुगतान तक सब कुछ डिजिटल रिकॉर्ड करो।')")}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '🤝', t: t('काम पक्का'), d: t('आवेदन या बुलावा — दोनों तरफ से हाँ होते ही काम पक्का।') },
              { icon: '🕐', t: t('डिजिटल हाजिरी'), d: t('कामगार और नियोक्ता — दोनों Check-IN करें, तभी हाजिरी पक्की।') },
              { icon: '⏱️', t: t('अपने आप ओवरटाइम'), d: t('तय समय के बाद का काम अपने आप ओवरटाइम में जुड़ता है।') },
              { icon: '💰', t: t('मजदूरी का हिसाब'), d: t('दोनों को एक ही हिसाब दिखता है — कोई झगड़ा नहीं।') },
            ].map((s) => (
              <div key={s.t} className="kg-card p-4">
                <span className="text-2xl">{s.icon}</span>
                <p className="mt-2 font-bold">{s.t}</p>
                <p className="mt-0.5 text-sm text-ink-soft">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-ink-faint">
        <p className="font-semibold text-ink">{t('कामगार')}</p>
        <p className="mt-1">{t('डिजिटल कारीगर एवं मजदूर डायरेक्टरी · भारत')}</p>
      </footer>
    </div>
  );
}

function RoleCard({
  emoji,
  title,
  desc,
  cta,
  to,
  accent,
  points,
}: {
  emoji: string;
  title: string;
  desc: string;
  cta: string;
  to: string;
  accent: 'worker' | 'employer';
  points: string[];
}) {
  const isWorker = accent === 'worker';
  return (
    <Link
      to={to}
      className="kg-card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${
          isWorker ? 'bg-worker-soft' : 'bg-employer-soft'
        }`}
      >
        {emoji}
      </span>
      <h3 className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{desc}</p>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <span className={isWorker ? 'text-worker' : 'text-employer'}>✓</span>
            {p}
          </li>
        ))}
      </ul>
      <div className="flex-1" />
      <Button variant={accent} size="lg" block className="mt-5">
        {cta} →
      </Button>
    </Link>
  );
}

function StatBox({
  label,
  value,
  loading,
  tone = 'neutral',
}: {
  label: string;
  value?: number;
  loading?: boolean;
  tone?: 'neutral' | 'worker' | 'employer';
}) {
  const tones = { neutral: 'text-ink', worker: 'text-worker', employer: 'text-employer' } as const;
  return (
    <div className="kg-card px-4 py-4 text-center">
      <p className={`text-2xl font-extrabold tracking-tight sm:text-3xl ${tones[tone]}`}>
        {loading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-cream-deep" /> : (value ?? 0)}
      </p>
      <p className="mt-0.5 text-xs text-ink-faint sm:text-[13px]">{label}</p>
    </div>
  );
}
