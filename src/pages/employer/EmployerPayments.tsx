import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Attendance, Payment, Profile } from '../../lib/types';
import { PAYMENT_LABEL, fmtDate, hoursLabel, rupee } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Banner, Card, Chip, EmptyState, Field, Modal, SectionTitle, Skeleton, Stat } from '../../components/ui';
import { t, useLang } from '../../lib/i18n';

export default function EmployerPayments() {
  const { lang } = useLang();
  const { profile } = useAuth();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [att, setAtt] = useState<Record<string, Attendance>>({});
  const [workers, setWorkers] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [paying, setPaying] = useState<Payment | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const [p, a] = await Promise.all([
        api.myPayments(profile.id, 'employer'),
        api.myAttendance(profile.id, 'employer'),
      ]);
      setPayments(p);
      const am: Record<string, Attendance> = {};
      a.forEach((x) => (am[x.id] = x));
      setAtt(am);
      const wm: Record<string, Profile> = {};
      await Promise.all(
        [...new Set(p.map((x) => x.worker_id))].map(async (id) => {
          const pr = await api.getProfile(id).catch(() => null);
          if (pr) wm[id] = pr;
        }),
      );
      setWorkers(wm);
    } catch (e) {
      setError(errMsg(e));
      setPayments([]);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const total = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const paid = (payments ?? []).reduce((s, p) => s + Number(p.paid_amount), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!paying) return;
    setBusy(true);
    setError(null);
    try {
      await api.recordPayment(paying.id, Number(amount), method, reference || undefined);
      setFlash(t('भुगतान दर्ज हो गया ✅ (यह सिर्फ रिकॉर्ड है — असली पैसा आपने अलग से दिया है)'));
      setPaying(null);
      setAmount('');
      setReference('');
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('हर पूरे हुए दिन का भुगतान रिकॉर्ड — कामगार को भी यही हिसाब दिखता है।')}>{t('भुगतान')}</SectionTitle>
      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('कुल मजदूरी')} value={rupee(total)} icon="💰" tone="employer" />
        <Stat label={t('दिया जा चुका')} value={rupee(paid)} icon="✅" />
        <Stat label={t('बकाया')} value={rupee(total - paid)} icon="⏳" tone="gold" />
      </div>

      {payments === null ? (
        <Skeleton count={3} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon="💰"
          title={t('अभी कोई भुगतान रिकॉर्ड नहीं है।')}
          hint={t('जैसे ही कोई दिन पूरा होगा, मजदूरी अपने आप यहाँ जुड़ जाएगी।')}
        />
      ) : (
        <div className="space-y-3">
          {payments.map((p) => {
            const a = p.attendance_id ? att[p.attendance_id] : undefined;
            const w = workers[p.worker_id];
            const due = Number(p.amount) - Number(p.paid_amount);
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{w?.name ?? t('कामगार')}</p>
                    <p className="text-sm text-ink-soft">
                      {fmtDate(a?.date ?? p.created_at)}
                      {a ? ` · ${hoursLabel(a.total_hours)} ${t('काम')} · OT ${hoursLabel(a.overtime_hours)}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold text-employer">{rupee(p.amount)}</p>
                    <Chip tone={p.status === 'paid' ? 'green' : p.status === 'partial' ? 'amber' : 'red'}>
                      {t(PAYMENT_LABEL[p.status])}
                    </Chip>
                  </div>
                </div>
                {a && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Mini label={t('बेस मजदूरी')} value={rupee(a.daily_wage)} />
                    <Mini label={t('ओवरटाइम')} value={hoursLabel(a.overtime_hours)} />
                    <Mini label={t('OT राशि')} value={rupee(a.overtime_amount)} />
                    <Mini label={t('कुल')} value={rupee(a.total_wage)} />
                  </div>
                )}
                {due > 0 && (
                  <div className="mt-3">
                    <Button
                      variant="employer"
                      size="sm"
                      onClick={() => {
                        setPaying(p);
                        setAmount(String(due));
                      }}
                    >
                      {lang === 'hi' ? (
                        <>भुगतान दर्ज करें ({rupee(due)} बाकी)</>
                      ) : (
                        <>Record payment ({rupee(due)} left)</>
                      )}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!paying} title={t('भुगतान दर्ज करें')} onClose={() => setPaying(null)}>
        <form onSubmit={submit} className="space-y-3">
          <Banner tone="info">{t('यह केवल आपका अपना रिकॉर्ड है। ऐप से पैसा नहीं भेजा जाता — जो नकद/UPI आपने दिया, वही यहाँ लिखें।')}</Banner>
          <Field label={t('राशि (₹)')} required>
            <input
              className="kg-input"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label={t('माध्यम')}>
            <select className="kg-input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">{t('नकद')}</option>
              <option value="upi">UPI</option>
              <option value="bank">{t('बैंक ट्रांसफर')}</option>
              <option value="other">{t('अन्य')}</option>
            </select>
          </Field>
          <Field label={t('संदर्भ / UTR (वैकल्पिक)')}>
            <input className="kg-input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Button type="submit" variant="employer" size="lg" block loading={busy}>{t('दर्ज करें')}</Button>
        </form>
      </Modal>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-cream px-3 py-2">
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
