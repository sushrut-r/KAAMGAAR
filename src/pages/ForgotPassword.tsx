import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import { normalizeMobile, mobileError } from '../lib/phone';
import { Button } from '../components/ui/Button';
import { Banner, Field } from '../components/ui';
import { LangToggle, t } from '../lib/i18n';

type Stored = { request_id: string; name: string; role: string; mobile: string };
const LS_KEY = 'kg_pw_reset';

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

type Stage = 'request' | 'pending' | 'approved' | 'rejected' | 'expired';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [stage, setStage] = useState<Stage>('request');
  const [stored, setStored] = useState<Stored | null>(() => readStored());
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const store = useCallback((s: Stored) => {
    setStored(s);
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }, []);

  const clearStored = useCallback(() => {
    setStored(null);
    setTempPw(null);
    setAdminNote(null);
    localStorage.removeItem(LS_KEY);
  }, []);

  // poll the request while it is pending (or to pick up a just-approved one)
  const poll = useCallback(async () => {
    const s = readStored();
    if (!s) return;
    try {
      const r = await api.getResetRequest(s.request_id);
      if (r.status === 'approved') {
        setTempPw(r.temp_password ?? null);
        setStage('approved');
      } else if (r.status === 'rejected') {
        setAdminNote(r.admin_note ?? null);
        setStage('rejected');
      } else if (r.status === 'expired') {
        setStage('expired');
      }
      // 'pending' → keep polling
    } catch {
      /* transient network hiccup — the next tick retries */
    }
  }, []);

  useEffect(() => {
    if (stage === 'pending' && stored) {
      poll();
      pollRef.current = setInterval(poll, 5000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [stage, stored, poll]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const mErr = mobileError(mobile);
    if (mErr) return setError(mErr);
    setBusy(true);
    try {
      const r = await api.requestPasswordReset(mobile);
      store({ request_id: r.request_id, name: r.name, role: r.role, mobile });
      setStage('pending');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  function copyTemp() {
    if (!tempPw) return;
    navigator.clipboard?.writeText(tempPw).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function newRequest() {
    clearStored();
    setStage('request');
    setMobile('');
  }

  return (
    <div className="min-h-full bg-cream">
<div className="flex justify-end px-4 pt-3"><LangToggle /></div>
            <div className="mx-auto flex max-w-md flex-col px-4 py-8 sm:py-14">
        <div className="kg-card p-6 sm:p-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-employer-soft text-3xl">
            🔑
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t('पासवर्ड रीसेट करें')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('पासवर्ड भूल गए? अपना मोबाइल नंबर लिखें — हम आपको टेंपरेरी पासवर्ड देंगे।')}</p>

          {stage === 'request' && (
            <form onSubmit={submitRequest} className="mt-5 space-y-4">
              <Field label={t('मोबाइल नंबर')} required hint={t('वही नंबर जिससे आपने खाता बनाया था।')}>
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
              {error && <Banner tone="error">{error}</Banner>}
              <Button type="submit" variant="employer" size="lg" block loading={busy}>{t('रीसेट रिक्वेस्ट करें')}</Button>
              <p className="text-center text-xs text-ink-faint">{t('रिक्वेस्ट पर हमारी टीम जाँच करके टेंपरेरी पासवर्ड तैयार करेगी।')}</p>
            </form>
          )}

          {stage === 'pending' && stored && (
            <div className="mt-5 space-y-4">
              <Banner tone="success">
                ✔️ <b>{stored.name}</b>{t('— आपकी रिक्वेस्ट भेज दी गई है।')}</Banner>
              <div className="rounded-xl border border-line bg-cream-deep/40 p-4 text-center">
                <p className="text-2xl">⏳</p>
                <p className="mt-2 text-sm font-semibold">{t('एडमिन की मंज़ूरी का इंतज़ार है…')}</p>
                <p className="mt-1 text-xs text-ink-soft">{t('इस पेज को खुला रखें — पासवर्ड तैयार होते ही यहीं दिख जाएगा।')}</p>
              </div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={poll}>{t('🔄 अभी जाँचें')}</Button>
                <Button variant="ghost" size="sm" onClick={newRequest}>{t('दूसरा नंबर')}</Button>
              </div>
              <p className="text-center text-xs text-ink-faint">{t('पेज बंद कर दिया तो चिंता मत करें — इसी मोबाइल नंबर से फिर यह पेज खोलें, आपकी रिक्वेस्ट वहीं से आगे बढ़ेगी।')}</p>
            </div>
          )}

          {stage === 'approved' && stored && (
            <div className="mt-5 space-y-4">
              <Banner tone="success">{t('🔑 आपका टेंपरेरी पासवर्ड तैयार है।')}</Banner>
              {tempPw && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
                  <span className="font-mono text-xl font-bold tracking-wider select-all">
                    {tempPw}
                  </span>
                  <button
                    type="button"
                    onClick={copyTemp}
                    className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold transition hover:bg-cream"
                  >
                    {copied ? t('✔️ कॉपी') : t('📋 कॉपी')}
                  </button>
                </div>
              )}
              <Banner tone="error">{t('यह पासवर्ड सिर्फ़ लॉगिन के लिए है — लॉगिन के तुरंत बाद अपना नया पासवर्ड ज़रूर सेट करें।')}</Banner>
              <Button
                variant="employer"
                size="lg"
                block
                onClick={() => navigate(`/auth/${stored.role === 'worker' ? 'worker' : 'employer'}`)}
              >{t('अभी लॉगिन करें →')}</Button>
            </div>
          )}

          {stage === 'rejected' && (
            <div className="mt-5 space-y-4">
              <Banner tone="error">
                {adminNote || t('इस बार रिक्वेस्ट स्वीकार नहीं हो सकी। नीचे नई रिक्वेस्ट भेज सकते हैं।')}
              </Banner>
              <Button variant="employer" size="lg" block onClick={newRequest}>{t('नई रिक्वेस्ट करें')}</Button>
            </div>
          )}

          {stage === 'expired' && (
            <div className="mt-5 space-y-4">
              <Banner tone="error">{t('आपकी रिक्वेस्ट 24 घंटे हो चुकी है। नीचे नई रिक्वेस्ट करें।')}</Banner>
              <Button variant="employer" size="lg" block onClick={newRequest}>{t('नई रिक्वेस्ट करें')}</Button>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-ink-faint">
          <a href="/auth/worker" className="font-semibold text-worker hover:underline">{t('लॉगिन पर वापस जाएं')}</a>
        </p>
      </div>
    </div>
  );
}
