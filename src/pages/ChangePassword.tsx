import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import { Button } from '../components/ui/Button';
import { Banner, Field } from '../components/ui';
import { LangToggle, t } from '../lib/i18n';

export default function ChangePassword() {
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const fromReset = params.get('from') === 'reset';
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError(t('नया पासवर्ड और पुष्टि वाला पासवर्ड एक जैसा नहीं है।'));
    if (next.length < 6) return setError(t('पासवर्ड कम से कम 6 अक्षर का होना चाहिए।'));
    if (!/[0-9]/.test(next)) return setError(t('पासवर्ड में कम से कम एक अंक होना चाहिए।'));
    if (!/[a-z]/.test(next)) return setError(t('पासवर्ड में कम से कम एक छोटा अक्षर (a–z) होना चाहिए।'));
    setBusy(true);
    try {
      await api.changeMyPassword(current, next);
      localStorage.removeItem('kg_pw_reset');
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const home = profile?.role === 'admin' ? '/admin' : profile?.role === 'worker' ? '/worker' : '/employer';

  if (done) {
    return (
      <div className="min-h-full bg-cream">
<div className="flex justify-end px-4 pt-3"><LangToggle /></div>
              <div className="mx-auto flex max-w-md flex-col px-4 py-14">
          <div className="kg-card p-8 text-center">
            <p className="text-4xl">✅</p>
            <h1 className="mt-3 text-xl font-extrabold">{t('पासवर्ड बदल दिया गया')}</h1>
            <p className="mt-2 text-sm text-ink-soft">{t('अब आगे इसी नए पासवर्ड से लॉगिन करें।')}</p>
            <Button
              className="mt-5"
              variant={profile?.role === 'worker' ? 'worker' : 'employer'}
              size="lg"
              block
              onClick={() => navigate(home, { replace: true })}
            >{t('होम पर जाएं →')}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-cream">
      <div className="mx-auto flex max-w-md flex-col px-4 py-8 sm:py-14">
        <div className="kg-card p-6 sm:p-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-employer-soft text-3xl">
            🔒
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t('पासवर्ड बदलें')}</h1>
          {fromReset ? (
            <p className="mt-1 text-sm font-medium text-danger">{t('आप टेंपरेरी पासवर्ड से लॉगिन हैं — कृपया अब अपना नया पासवर्ड सेट करें।')}</p>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">{t('नया पासवर्ड बनते समय कम से कम 6 अक्षर, एक अंक और एक छोटा अक्षर ज़रूरी है।')}</p>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label={t('मौजूदा पासवर्ड')} required>
              <input
                className="kg-input"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label={t('नया पासवर्ड')} required>
              <input
                className="kg-input"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label={t('नया पासवर्ड (फिर से)')} required>
              <input
                className="kg-input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>

            {error && <Banner tone="error">{error}</Banner>}

            <Button type="submit" variant="employer" size="lg" block loading={busy}>{t('पासवर्ड बदलें')}</Button>
            <p className="text-center">
              <Link to={home} className="text-xs font-semibold text-ink-faint hover:text-ink">{t('← वापस जाएं')}</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
