import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import type { Attendance, Payment } from '../../lib/types';
import { PAYMENT_LABEL, fmtDate, hoursLabel, rupee } from '../../lib/format';
import { Banner, Card, Chip, EmptyState, SectionTitle, Skeleton, Stat } from '../../components/ui';
import { t } from '../../lib/i18n';

export default function WorkerEarnings() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const [p, a] = await Promise.all([
        api.myPayments(profile.id, 'worker'),
        api.myAttendance(profile.id, 'worker'),
      ]);
      setPayments(p);
      const map: Record<string, Attendance> = {};
      a.forEach((x) => (map[x.id] = x));
      setAttendance(map);
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

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('हर पूरे हुए दिन का हिसाब — दोनों पक्षों को एक जैसा दिखता है।')}>{t('मेरी कमाई')}</SectionTitle>
      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t('कुल कमाई')} value={rupee(total)} icon="💰" tone="worker" />
        <Stat label={t('मिल चुका')} value={rupee(paid)} icon="✅" tone="employer" />
        <Stat label={t('बकाया')} value={rupee(total - paid)} icon="⏳" tone="gold" />
      </div>

      {payments === null ? (
        <Skeleton count={3} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon="💰"
          title={t('अभी कोई कमाई दर्ज नहीं है।')}
          hint={t('जैसे ही कोई दिन पूरा होगा (दोनों तरफ से OUT), मजदूरी अपने आप यहाँ जुड़ जाएगी।')}
        />
      ) : (
        <div className="space-y-3">
          {payments.map((p) => {
            const a = p.attendance_id ? attendance[p.attendance_id] : undefined;
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{fmtDate(a?.date ?? p.created_at)}</p>
                    <p className="text-sm text-ink-soft">
                      {a ? `${hoursLabel(a.total_hours)} ${t('काम')} · OT ${hoursLabel(a.overtime_hours)}` : t('मजदूरी')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold text-worker">{rupee(p.amount)}</p>
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
                {Number(p.paid_amount) > 0 && Number(p.paid_amount) < Number(p.amount) && (
                  <p className="mt-2 text-sm text-ink-soft">
                    {t('मिल चुका')} {rupee(p.paid_amount)} · {t('बाकी')} {rupee(Number(p.amount) - Number(p.paid_amount))}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
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
