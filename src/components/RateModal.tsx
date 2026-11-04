import { useEffect, useRef, useState } from 'react';
import type { Hire } from '../lib/types';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import { Button } from './ui/Button';
import { CameraCapture } from './CameraCapture';
import { Field, Modal } from './ui';
import { t } from '../lib/i18n';

const WORKER_CATS = [
  { key: 'work_quality', label: t('काम की गुणवत्ता') },
  { key: 'punctuality', label: t('समय की पाबंदी') },
  { key: 'behaviour', label: t('व्यवहार') },
  { key: 'reliability', label: t('भरोसा') },
];

const EMPLOYER_CATS = [
  { key: 'payment_timeliness', label: t('भुगतान समय पर') },
  { key: 'behaviour', label: t('व्यवहार') },
  { key: 'work_conditions', label: t('काम की जगह') },
  { key: 'job_accuracy', label: t('काम की जानकारी सही थी') },
];

export function RateModal({
  hire,
  side,
  onClose,
  onDone,
  onError,
}: {
  hire: Hire | null;
  /** who is writing the review */
  side: 'worker' | 'employer';
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  // a worker reviews the employer (employer categories) and vice-versa
  const cats = side === 'worker' ? EMPLOYER_CATS : WORKER_CATS;
  const [scores, setScores] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // employer may attach a photo of the completed work (optional)
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // reset when a new hire is selected
  useEffect(() => {
    setScores({});
    setText('');
    setPhoto(null);
    setShowCamera(false);
  }, [hire?.id]);

  const values = cats.map((c) => scores[c.key] ?? 0).filter(Boolean);
  const overall = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hire) return;
    if (!overall) return onError(t('कृपया कम से कम एक श्रेणी में स्टार चुनें।'));
    setBusy(true);
    try {
      let workPhoto: string | undefined;
      if (side === 'employer' && photo) {
        const up = await api.uploadFile('work_photos', photo);
        workPhoto = up.url;
      }
      await api.submitReview(hire.id, Math.round(overall * 10) / 10, scores, text || undefined, workPhoto);
      setScores({});
      setText('');
      setPhoto(null);
      onDone();
    } catch (err) {
      onError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!hire} title={t('रेटिंग दें')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {cats.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink-soft">{t(c.label)}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => setScores({ ...scores, [c.key]: n })}
                  className={`text-2xl leading-none transition ${
                    (scores[c.key] ?? 0) >= n ? 'text-gold' : 'text-line'
                  }`}
                  aria-label={`${t(c.label)} ${n} ${t("स्टार")}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-sm font-semibold">{t('कुल रेटिंग:')}<span className="text-gold">⭐ {overall ? overall.toFixed(1) : '—'}</span>
        </p>

        {side === 'employer' && (
          <div className="space-y-2 rounded-xl border border-line bg-cream-deep/40 p-3">
            <p className="text-sm font-semibold">{t('📸 पूरे हुए काम की फोटो')}<span className="text-xs font-normal text-ink-faint">{t('(वैकल्पिक)')}</span>
            </p>
            <p className="text-xs text-ink-faint">{t('काम की फोटो जोड़ें — इससे भरोसा बढ़ता है और दूसरे कामगार देख सकते हैं।')}</p>
            {photo ? (
              <div className="flex items-center gap-3">
                <img src={photoUrl ?? undefined} alt={t('काम की फोटो')} className="h-20 w-20 rounded-lg border border-line object-cover" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-employer">{t('✔️ फोटो जोड़ी गई')}</span>
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="self-start text-xs font-semibold text-ink-faint underline hover:text-danger"
                  >{t('फोटो हटाएं')}</button>
                </div>
              </div>
            ) : showCamera ? (
              <div className="space-y-2">
                <CameraCapture
                  direction="environment"
                  autoStart
                  onCaptured={(f) => {
                    setPhoto(f);
                    setShowCamera(false);
                  }}
                  heightClass="h-44"
                />
                <button
                  type="button"
                  onClick={() => setShowCamera(false)}
                  className="text-xs font-semibold text-ink-faint underline"
                >{t('कैमरा बंद करें')}</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="flex-1 rounded-lg border border-employer/30 bg-employer-soft px-3 py-2 text-xs font-semibold text-employer transition hover:opacity-80"
                >{t('📷 लाइव कैमरा')}</button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-soft transition hover:bg-cream"
                >{t('🖼️ गैलरी से चुनें')}</button>
              </div>
            )}
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        <Field label={t('कुछ लिखना चाहें? (वैकल्पिक)')}>
          <textarea className="kg-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button type="submit" variant={side} size="lg" block loading={busy}>{t('रेटिंग भेजें')}</Button>
      </form>
    </Modal>
  );
}
