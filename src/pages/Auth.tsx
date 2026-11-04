import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import { mobileError, normalizeMobile } from '../lib/phone';
import { Button } from '../components/ui/Button';
import { Banner, Field } from '../components/ui';
import { LangToggle, t } from '../lib/i18n';

/**
 * OTP login switch — the backend (otp_send function + auth table) is fully built
 * and tested, but the feature stays PAUSED for users until an SMS provider
 * (MSG91) key is deployed into functions/otp_send.js. Flip this to `true`,
 * rebuild and deploy once the key is in place.
 */
const OTP_LOGIN_LIVE = false;

export default function Auth() {
  const { role } = useParams<{ role: 'worker' | 'employer' }>();
  const isWorker = role !== 'employer';
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'signup'>(
    params.get('mode') === 'signup' ? 'signup' : 'login',
  );
  const { signIn, signUp, signInOtp } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpMethod, setOtpMethod] = useState<'password' | 'otp'>('password');
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [otpInput, setOtpInput] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = isWorker ? 'worker' : 'employer';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const mErr = mobileError(mobile);
    if (mErr) return setError(mErr);

    setBusy(true);
    try {
      if (mode === 'login' && otpMethod === 'otp') {
        if (!OTP_LOGIN_LIVE) return; // feature paused — form is not rendered either
        if (otpStep === 'phone') {
          const r = await api.otpSend(mobile);
          if (r.dev_code) setDevCode(r.dev_code);
          setOtpStep('code');
          return;
        }
        if (!/^[0-9]{6}$/.test(otpInput)) throw new Error(t('6 अंकों का OTP डालें'));
        await signInOtp(mobile, otpInput);
        navigate('/redirect', { replace: true });
        return;
      }
      if (mode === 'signup') {
        if (name.trim().length < 2) throw new Error(t('कृपया अपना पूरा नाम लिखें।'));
        if (password.length < 6) throw new Error(t('पासवर्ड कम से कम 6 अक्षर का होना चाहिए।'));
        await signUp(mobile, password, name.trim());
        navigate(`/onboarding/${isWorker ? 'worker' : 'employer'}`, { replace: true });
      } else {
        await signIn(mobile, password);
        navigate('/redirect', { replace: true });
      }
    } catch (err) {
      const raw = errMsg(err);
      // the alias address is an internal detail — never surface it in an error
      if (/already (exists|registered)|duplicate/i.test(raw))
        setError(t('यह मोबाइल नंबर पहले से रजिस्टर है। लॉगिन करें।'));
      else if (/not (registered|found)|पंजीकृत नहीं/i.test(raw) && mode === 'login' && otpMethod === 'otp')
        setError(t('यह मोबाइल नंबर पंजीकृत नहीं है। पहले रजिस्टर करें।'));
      else if (/credential|incorrect|password|unauthorized|invalid otp|otp/i.test(raw) && mode === 'login' && otpMethod === 'otp')
        setError(t('OTP गलत है या समय खत्म हो गया। दोबारा भेजें।'));
      else if (/credential|incorrect|password|unauthorized|not found|पासवर्ड/i.test(raw))
        setError(t('मोबाइल नंबर या पासवर्ड गलत है। दोबारा कोशिश करें।'));
      else setError(raw);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-cream">
<div className="flex justify-end px-4 pt-3"><LangToggle /></div>
            <div className="mx-auto flex max-w-md flex-col px-4 py-8 sm:py-14">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-ink-faint hover:text-ink">{t('← वापस होम पर')}</Link>

        <div className="kg-card p-6 sm:p-8">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${
              isWorker ? 'bg-worker-soft' : 'bg-employer-soft'
            }`}
          >
            {isWorker ? '👷' : '🏗️'}
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
            {isWorker ? t('कामगार') : t('नियोक्ता')} {mode === 'login' ? t('लॉगिन') : t('रजिस्ट्रेशन')}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {isWorker
              ? t('मोबाइल नंबर से काम ढूंढें और बताएं कि आप उपलब्ध हैं।')
              : t('मोबाइल नंबर से काम पोस्ट करें और सही कारीगर खोजें।')}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-cream-deep p-1">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setOtpMethod('password');
                  setOtpStep('phone');
                  setOtpInput('');
                  setDevCode(null);
                }}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m ? 'bg-white shadow-sm' : 'text-ink-faint'
                }`}
              >
                {m === 'login' ? t('लॉगिन') : t('नया खाता')}
              </button>
            ))}
          </div>

          {mode === 'login' && (
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-cream-deep p-1">
              {(['password', 'otp'] as const).map((mth) => (
                <button
                  key={mth}
                  type="button"
                  onClick={() => {
                    setOtpMethod(mth);
                    setOtpStep('phone');
                    setOtpInput('');
                    setDevCode(null);
                    setError(null);
                  }}
                  className={`rounded-lg py-2 text-sm font-semibold transition ${
                    otpMethod === mth ? 'bg-white shadow-sm' : 'text-ink-faint hover:text-ink-soft'
                  }`}
                >
                  {mth === 'password' ? t('पासवर्ड से') : t('OTP से लॉगिन')}
                </button>
              ))}
            </div>
          )}

          {mode === 'login' && otpMethod === 'otp' && !OTP_LOGIN_LIVE ? (
            <div className="mt-6 rounded-2xl border border-line bg-cream p-6 text-center">
              <div className="text-4xl" aria-hidden="true">🔜</div>
              <h3 className="mt-3 text-lg font-bold text-ink">{t('जल्द ही शुरू होगा')}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {t('SMS OTP से लॉगिन की सुविधा तैयार हो रही है। तब तक कृपया पासवर्ड से लॉगिन करें।')}
              </p>
              <Button
                variant="outline"
                size="md"
                className="mt-5"
                onClick={() => {
                  setOtpMethod('password');
                  setError(null);
                }}
              >
                {t('पासवर्ड से लॉगिन करें')}
              </Button>
            </div>
          ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'signup' && (
              <Field label={t('पूरा नाम')} required>
                <input
                  className="kg-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('जैसे: राज कुमार')}
                  autoComplete="name"
                  required
                />
              </Field>
            )}

            <Field label={t('मोबाइल नंबर')} required hint={t('इसी नंबर से आप हर बार लॉगिन करेंगे।')}>
              <div className="flex items-stretch gap-2">
                <span className="flex select-none items-center rounded-xl border border-line bg-cream px-3 text-[15px] font-semibold text-ink-soft">
                  +91
                </span>
                <input
                  className="kg-input flex-1 text-lg tracking-wide"
                  value={mobile}
                  onChange={(e) => setMobile(normalizeMobile(e.target.value).slice(0, 10))}
                  placeholder="98765 43210"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  required
                />
              </div>
            </Field>

            {(mode === 'signup' || otpMethod === 'password') && (
            <Field label={t('पासवर्ड')} required hint={mode === 'signup' ? t('कम से कम 6 अक्षर') : undefined}>
              <div className="relative">
                <input
                  className="kg-input pr-16"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-ink-faint hover:bg-cream"
                >
                  {showPassword ? t('छिपाएं') : t('दिखाएं')}
                </button>
              </div>
            </Field>
            )}

            {mode === 'login' && otpMethod === 'otp' && otpStep === 'code' && devCode && (
              <Banner tone="info">
                {t('Dev OTP (test): ')}
                <span className="font-mono text-base font-bold tracking-widest">{devCode}</span>
              </Banner>
            )}
            {mode === 'login' && otpMethod === 'otp' && otpStep === 'code' && (
              <Field label={t('6 अंकों का OTP डालें')} required>
                <input
                  className="kg-input text-center text-2xl tracking-[0.4em]"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </Field>
            )}

            {error && <Banner tone="error">{error}</Banner>}

            <Button type="submit" variant={accent} size="lg" block loading={busy}>
              {mode === 'signup'
                ? t('खाता बनाएं')
                : otpMethod === 'otp' && otpStep === 'phone'
                  ? t('📩 OTP भेजें')
                  : t('लॉगिन करें')}
            </Button>
            {mode === 'login' && otpMethod === 'otp' && otpStep === 'code' && (
              <button
                type="button"
                onClick={() => {
                  setOtpStep('phone');
                  setOtpInput('');
                  setDevCode(null);
                }}
                className="w-full text-center text-xs font-semibold text-employer hover:underline"
              >
                {t('पुनः भेजें')}
              </button>
            )}
          </form>
          )}

          {mode === 'login' && otpMethod === 'password' && (
            <p className="mt-4 text-center text-xs text-ink-faint">
              {t('पासवर्ड भूल गए?')}{' '}
              <Link to="/forgot-password" className="font-semibold text-employer hover:underline">{t('पासवर्ड रीसेट करें')}</Link>
            </p>
          )}

          {/* separate pages for worker / employer — just a small switch link */}
          <p className="mt-4 border-t border-line pt-4 text-center text-xs text-ink-faint">
            {isWorker ? (
              <>
                {t('क्या आप नियोक्ता हैं? ')}
                <Link to="/auth/employer" className="font-semibold text-employer hover:underline">{t('नियोक्ता लॉगिन पर जाएँ')}</Link>
              </>
            ) : (
              <>
                {t('क्या आप कामगार हैं? ')}
                <Link to="/auth/worker" className="font-semibold text-employer hover:underline">{t('कामगार लॉगिन पर जाएँ')}</Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
