import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'kaamgaar_install_dismissed_at';
const SNOOZE_DAYS = 14;

/**
 * t('फोन में ऐप जोड़ें') prompt. Uses the real beforeinstallprompt event on Android/Chrome;
 * on iOS Safari (which has no such event) it shows the manual Share → Add to Home Screen hint.
 */
export function InstallPrompt({ accent = 'worker' }: { accent?: 'worker' | 'employer' }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const snoozed = Date.now() - dismissedAt < SNOOZE_DAYS * 86400000;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone || snoozed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    if (isIos) {
      setIosHint(true);
      setShow(true);
    }

    const onInstalled = () => setShow(false);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setShow(false);
  };

  const accentBg = accent === 'employer' ? 'bg-employer' : 'bg-worker';

  return (
    <div
      className="kg-card mb-4 flex flex-wrap items-center gap-3 border-worker/25 bg-worker-soft/50 p-4"
      role="region"
      aria-label={t('ऐप इंस्टॉल करें')}
    >
      <span className="text-3xl">📲</span>
      <div className="min-w-[180px] flex-1">
        <p className="font-bold">{t('कामगार को फोन में जोड़ें')}</p>
        <p className="text-sm text-ink-soft">
          {iosHint
            ? t('नीचे Share बटन दबाएं, फिर "Add to Home Screen" चुनें।')
            : t('ऐप की तरह खुलेगा — हर बार ब्राउज़र में पता लिखने की ज़रूरत नहीं।')}
        </p>
      </div>
      <div className="flex gap-2">
        {!iosHint && (
          <button
            onClick={install}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${accentBg}`}
          >{t('इंस्टॉल करें')}</button>
        )}
        <button
          onClick={dismiss}
          className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium text-ink-soft"
        >{t('अभी नहीं')}</button>
      </div>
    </div>
  );
}
