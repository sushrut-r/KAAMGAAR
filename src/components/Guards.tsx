import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Loading } from './ui';
import type { Role } from '../lib/types';
import { AppLayout, ADMIN_NAV, EMPLOYER_NAV, WORKER_NAV } from './AppLayout';
import { t, useLang } from '../lib/i18n';

export function RequireRole({ role }: { role: Role }) {
  const { loading, userId, profile } = useAuth();
  const location = useLocation();

  if (loading) return <FullLoading />;
  if (!userId)
    return <Navigate to={`/auth/${role === 'employer' ? 'employer' : 'worker'}`} state={{ from: location }} replace />;
  if (!profile) return <Navigate to={`/onboarding/${role === 'employer' ? 'employer' : 'worker'}`} replace />;
  if (profile.role !== role) return <Unauthorized actual={profile.role} />;

  const nav = role === 'worker' ? WORKER_NAV : role === 'employer' ? EMPLOYER_NAV : ADMIN_NAV;
  const accent = role === 'worker' ? 'worker' : role === 'employer' ? 'employer' : 'neutral';

  return (
    <AppLayout nav={nav} accent={accent}>
      <Outlet />
    </AppLayout>
  );
}

/** Shared authenticated routes (chat) — any signed-in role may enter. */
export function RequireAuth() {
  const { loading, userId, profile } = useAuth();
  if (loading) return <FullLoading />;
  if (!userId) return <Navigate to="/auth/worker" replace />;
  if (!profile) return <Navigate to="/onboarding/worker" replace />;
  const nav = profile.role === 'worker' ? WORKER_NAV : profile.role === 'employer' ? EMPLOYER_NAV : ADMIN_NAV;
  const accent = profile.role === 'worker' ? 'worker' : profile.role === 'employer' ? 'employer' : 'neutral';
  return (
    <AppLayout nav={nav} accent={accent}>
      <Outlet />
    </AppLayout>
  );
}

export function RoleRedirect() {
  const { loading, userId, profile } = useAuth();
  const navigate = useNavigate();
  // after a reset (temp password) login, force a password change before the dashboard
  const [checking, setChecking] = useState(() => !!localStorage.getItem('kg_pw_reset'));

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem('kg_pw_reset');
        if (raw) {
          const s = JSON.parse(raw) as { request_id: string };
          const r = await api.getResetRequest(s.request_id);
          if (!cancelled && r.status === 'approved') {
            navigate('/change-password?from=reset', { replace: true });
            return;
          }
        }
      } catch {
        /* ignore — fall through to the normal redirect */
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, navigate]);

  if (loading) return <FullLoading />;
  if (checking) return <FullLoading />;
  if (!userId) return <Navigate to="/" replace />;
  if (!profile) return <Navigate to="/onboarding/worker" replace />;
  return (
    <Navigate
      to={profile.role === 'admin' ? '/admin' : profile.role === 'worker' ? '/worker' : '/employer'}
      replace
    />
  );
}

function FullLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <Loading label={t('कामगार खुल रहा है...')} />
    </div>
  );
}

function Unauthorized({ actual }: { actual: Role }) {
  const { lang } = useLang();
  const home = actual === 'admin' ? '/admin' : actual === 'worker' ? '/worker' : '/employer';
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="kg-card max-w-md p-8 text-center">
        <span className="text-4xl">🔒</span>
        <h1 className="mt-3 text-xl font-bold">{t('यह पेज आपके लिए नहीं है')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {lang === 'hi' ? (
            <>आप {actual === 'worker' ? t('कामगार') : actual === 'employer' ? t('नियोक्ता') : t('एडमिन')} के रूप में लॉगिन हैं, इसलिए यह हिस्सा उपलब्ध नहीं है।</>
          ) : (
            <>You are logged in as {actual === 'worker' ? 'Worker' : actual === 'employer' ? 'Employer' : 'Admin'}, so this section is not available.</>
          )}
        </p>
        <a href={home} className="mt-5 inline-block rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white">{t('अपने डैशबोर्ड पर जाएं')}</a>
      </div>
    </div>
  );
}
