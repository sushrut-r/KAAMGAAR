import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { PortfolioItem } from '../../lib/types';
import { fmtDate } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Banner, Card, Chip, EmptyState, Field, SectionTitle, Skeleton } from '../../components/ui';
import { t } from '../../lib/i18n';

export default function WorkerPortfolio() {
  const { profile } = useAuth();
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<PortfolioItem['kind']>('work_photo');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setItems(await api.portfolioOf(profile.id));
    } catch (e) {
      setError(errMsg(e));
      setItems([]);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !profile) return setError(t('कृपया एक फोटो या फाइल चुनें।'));
    setBusy(true);
    setError(null);
    try {
      const bucket = kind === 'identity' ? 'documents' : 'portfolio';
      const up = await api.uploadFile(bucket, file);
      await api.addPortfolio({
        worker_id: profile.id,
        file_url: up.url,
        file_key: up.key,
        kind,
        title: title || file.name,
        is_public: kind !== 'identity',
      });
      setFlash(t('फाइल जुड़ गई ✅'));
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('अपने काम की फोटो और प्रमाणपत्र दिखाकर भरोसा बढ़ाएं।')}>{t('मेरा पोर्टफोलियो')}</SectionTitle>
      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <Card>
        <form onSubmit={upload} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('प्रकार')}>
              <select className="kg-input" value={kind} onChange={(e) => setKind(e.target.value as never)}>
                <option value="work_photo">{t('काम की फोटो')}</option>
                <option value="certificate">{t('प्रमाणपत्र')}</option>
                <option value="skill_proof">{t('हुनर का सबूत')}</option>
                <option value="identity">{t('पहचान पत्र (निजी)')}</option>
              </select>
            </Field>
            <Field label={t('शीर्षक')}>
              <input
                className="kg-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('जैसे: प्लास्टर का काम')}
              />
            </Field>
            <Field label={t('फाइल')} required>
              <input ref={fileRef} className="kg-input !py-2" type="file" accept="image/*,.pdf" required />
            </Field>
          </div>
          {kind === 'identity' && (
            <Banner tone="info">{t('पहचान पत्र निजी रहेगा — यह किसी और को नहीं दिखाया जाता।')}</Banner>
          )}
          <Button type="submit" variant="worker" loading={busy}>{t('अपलोड करें')}</Button>
        </form>
      </Card>

      {items === null ? (
        <Skeleton count={2} />
      ) : items.length === 0 ? (
        <EmptyState icon="🖼️" title={t('अभी कोई फोटो नहीं जोड़ी गई।')} hint={t('अपने अच्छे काम की 2-3 फोटो जोड़ें।')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <Card key={i.id} className="!p-3">
              {/\.(png|jpe?g|webp|gif)$/i.test(i.file_url) || i.kind !== 'certificate' ? (
                <img
                  src={i.file_url}
                  alt={i.title ?? ''}
                  className="mb-2 h-40 w-full rounded-xl border border-line object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                />
              ) : null}
              <p className="font-semibold">{i.title}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <Chip tone={i.kind === 'identity' ? 'red' : 'neutral'}>
                  {i.kind === 'identity' ? t('🔒 निजी') : i.kind === 'certificate' ? t('📜 प्रमाणपत्र') : t('🖼️ फोटो')}
                </Chip>
                <span className="text-[11px] text-ink-faint">{fmtDate(i.created_at)}</span>
              </div>
              <button
                onClick={async () => {
                  await api.removePortfolio(i.id).catch(() => undefined);
                  load();
                }}
                className="mt-2 text-xs font-semibold text-ink-faint underline hover:text-danger"
              >{t('हटाएं')}</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
