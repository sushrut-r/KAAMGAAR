import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { Notification } from '../lib/types';
import { Avatar } from './ui';
import { FloatingChat } from './FloatingChat';
import { timeAgo } from '../lib/format';
import { LangToggle, t } from '../lib/i18n';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  mobile?: boolean;
}

export const WORKER_NAV: NavItem[] = [
  { to: '/worker', label: t('होम'), icon: '🏠', mobile: true },
  { to: '/worker/jobs', label: t('काम खोजें'), icon: '🔎', mobile: true },
  { to: '/worker/availability', label: t('मैं उपलब्ध हूँ'), icon: '🟢', mobile: true },
  { to: '/worker/applications', label: t('मेरे आवेदन'), icon: '📨' },
  { to: '/worker/my-jobs', label: t('मेरा काम'), icon: '📋' },
  { to: '/worker/hajri', label: t('हाजिरी'), icon: '🕐', mobile: true },
  { to: '/worker/earnings', label: t('मेरी कमाई'), icon: '💰' },
  { to: '/worker/ratings', label: t('मेरी रेटिंग'), icon: '⭐' },
  { to: '/worker/portfolio', label: t('पोर्टफोलियो'), icon: '🖼️' },
  { to: '/worker/profile', label: t('प्रोफाइल'), icon: '👤', mobile: true },
];

export const EMPLOYER_NAV: NavItem[] = [
  { to: '/employer', label: t('होम'), icon: '🏠', mobile: true },
  { to: '/employer/post', label: t('काम पोस्ट करें'), icon: '➕', mobile: true },
  { to: '/employer/workers', label: t('उपलब्ध कारीगर'), icon: '👷', mobile: true },
  { to: '/employer/applications', label: t('आवेदन'), icon: '📨' },
  { to: '/employer/jobs', label: t('मेरे काम'), icon: '📋' },
  { to: '/employer/hajri', label: t('हाजिरी'), icon: '🕐', mobile: true },
  { to: '/employer/payments', label: t('भुगतान'), icon: '💰' },
  { to: '/employer/reviews', label: t('रेटिंग'), icon: '⭐' },
  { to: '/employer/profile', label: t('प्रोफाइल'), icon: '👤', mobile: true },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: t('डैशबोर्ड'), icon: '🏠', mobile: true },
  { to: '/admin/users', label: t('यूज़र्स'), icon: '👥', mobile: true },
  { to: '/admin/jobs', label: t('काम'), icon: '📋', mobile: true },
  { to: '/admin/attendance', label: t('हाजिरी'), icon: '🕐' },
  { to: '/admin/payments', label: t('भुगतान'), icon: '💰' },
  { to: '/admin/disputes', label: t('विवाद'), icon: '⚖️', mobile: true },
  { to: '/admin/reset', label: t('पासवर्ड'), icon: '🔑' },
  { to: '/admin/verification', label: t('सत्यापन'), icon: '✅' },
];

export function AppLayout({
  nav,
  accent,
  children,
}: {
  nav: NavItem[];
  accent: 'worker' | 'employer' | 'neutral';
  children: ReactNode;
}) {
  const { profile, signOut, userId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notes, setNotes] = useState<Notification[]>([]);
  const [openNotes, setOpenNotes] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const accentText =
    accent === 'worker' ? 'text-worker' : accent === 'employer' ? 'text-employer' : 'text-ink';
  const accentBg =
    accent === 'worker' ? 'bg-worker-soft' : accent === 'employer' ? 'bg-employer-soft' : 'bg-cream-deep';

  useEffect(() => {
    if (!userId) return;
    let stop = false;
    const load = () =>
      api
        .myNotifications(userId)
        .then((n) => !stop && setNotes(n))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 25000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [userId, location.pathname]);

  const unread = notes.filter((n) => !n.read_status).length;
  const mobileNav = nav.filter((n) => n.mobile).slice(0, 5);

  // close the mobile menu whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-full bg-cream">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => setMenuOpen(true)}
            className="-ml-1 rounded-xl border border-line bg-white px-2.5 py-2 text-sm hover:bg-cream lg:hidden"
            aria-label={t('मेनिऊ')}
          >
            ☰
          </button>
          <Link to="/" className="flex items-center gap-2">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accentBg} text-lg`}>
              🛠️
            </span>
            <div className="leading-tight">
              <p className="text-lg font-extrabold tracking-tight">{t('कामगार')}</p>
              <p className="hidden text-[11px] text-ink-faint sm:block">{t('डिजिटल कारीगर एवं मजदूर डायरेक्टरी')}</p>
            </div>
          </Link>
          <div className="flex-1" />
          <div className="relative">
            <button
              onClick={() => setOpenNotes((v) => !v)}
              className="relative rounded-xl border border-line bg-white px-3 py-2 text-sm hover:bg-cream"
              aria-label={t('सूचनाएं')}
            >
              🔔
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-worker px-1 text-[11px] font-bold leading-5 text-white">
                  {unread}
                </span>
              )}
            </button>
            {openNotes && (
              <div className="absolute right-0 z-40 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-xl">
                <p className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">{t('सूचनाएं')}</p>
                {notes.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-ink-faint">{t('कोई सूचना नहीं है।')}</p>
                )}
                {notes.map((n) => (
                  <button
                    key={n.id}
                    onClick={async () => {
                      if (!n.read_status) {
                        await api.markNotificationRead(n.id).catch(() => undefined);
                        setNotes((prev) =>
                          prev.map((x) => (x.id === n.id ? { ...x, read_status: true } : x)),
                        );
                      }
                      setOpenNotes(false);
                      if (n.link) navigate(n.link);
                    }}
                    className={`block w-full rounded-xl px-3 py-2 text-left hover:bg-cream ${
                      n.read_status ? 'opacity-60' : ''
                    }`}
                  >
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-ink-soft">{n.message}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">{timeAgo(n.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <LangToggle className="shrink-0" />
          <div className="hidden items-center gap-2 sm:flex">
            <Avatar name={profile?.name ?? '?'} src={profile?.profile_photo} size={36} />
            <div className="leading-tight">
              <p className="text-sm font-semibold">{profile?.name}</p>
              <p className={`text-[11px] font-medium ${accentText}`}>
                {profile?.role === 'worker' ? t('कामगार') : profile?.role === 'employer' ? t('नियोक्ता') : t('एडमिन')}
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-cream"
          >{t('लॉगआउट')}</button>
        </div>
      </header>

      {/* mobile drawer — ALL sections reachable on phone */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accentBg} text-lg`}>🛠️</span>
              <div className="min-w-0 leading-tight">
                <p className="truncate font-extrabold">{profile?.name ?? 'कामगार'}</p>
                <p className="text-[11px] text-ink-faint">
                  {profile?.role === 'worker'
                    ? t('कामगार')
                    : profile?.role === 'employer'
                      ? t('नियोजक')
                      : t('एडमिन')}
                </p>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="ml-auto rounded-lg px-2 py-1 text-ink-faint hover:bg-cream"
                aria-label={t('बंद करें')}
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/worker' || item.to === '/employer' || item.to === '/admin'}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xl px-3 py-3 text-[15px] font-medium transition ${
                      isActive
                        ? `${accentBg} ${accentText} font-semibold`
                        : 'text-ink-soft hover:bg-cream'
                    }`
                  }
                >
                  <span className="text-lg">{item.icon}</span>
                  {t(item.label)}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-line p-3">
              <button
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                className="w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream-deep"
              >
                {t('लॉगआउट')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5">
        {/* sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/worker' || item.to === '/employer' || item.to === '/admin'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
                    isActive
                      ? `${accentBg} ${accentText} font-semibold`
                      : 'text-ink-soft hover:bg-white hover:text-ink'
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                {t(item.label)}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* floating chat — WhatsApp style, available on every page */}
      <FloatingChat accent={accent} />

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl">
          {mobileNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/worker' || item.to === '/employer' || item.to === '/admin'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  isActive ? accentText : 'text-ink-faint'
                }`
              }
            >
              <span className="text-xl leading-none">{item.icon}</span>
              {t(item.label)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
