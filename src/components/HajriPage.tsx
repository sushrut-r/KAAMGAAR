import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import type { Attendance, Hire, Job, Profile } from '../lib/types';
import { ATTENDANCE_LABEL, fmtDate, fmtTime, hoursLabel, rupee } from '../lib/format';
import { Button } from './ui/Button';
import { Banner, Card, Chip, EmptyState, Field, Modal, SectionTitle, Skeleton } from './ui';
import { t } from '../lib/i18n';

export function HajriPage({ side }: { side: 'worker' | 'employer' }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Attendance[] | null>(null);
  const [hires, setHires] = useState<Record<string, Hire>>({});
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dispute, setDispute] = useState<Attendance | null>(null);
  const [disputeText, setDisputeText] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const att = await api.myAttendance(profile.id, side);
      setRows(att);
      const hs = await api.myHires(profile.id, side);
      const hireMap: Record<string, Hire> = {};
      hs.forEach((h) => (hireMap[h.id] = h));
      setHires(hireMap);

      const jobIds = [...new Set(hs.map((h) => h.job_id))];
      const jobMap: Record<string, Job> = {};
      await Promise.all(
        jobIds.map(async (id) => {
          const j = await api.getJob(id).catch(() => null);
          if (j) jobMap[id] = j;
        }),
      );
      setJobs(jobMap);

      const otherIds = [
        ...new Set(att.map((a) => (side === 'worker' ? a.employer_id : a.worker_id))),
      ];
      const pMap: Record<string, Profile> = {};
      await Promise.all(
        otherIds.map(async (id) => {
          const p = await api.getProfile(id).catch(() => null);
          if (p) pMap[id] = p;
        }),
      );
      setPeople(pMap);
    } catch (e) {
      setError(errMsg(e));
      setRows([]);
    }
  }, [profile, side]);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const [todayRows, pastRows] = useMemo(() => {
    const r = rows ?? [];
    return [r.filter((a) => a.date >= today), r.filter((a) => a.date < today)];
  }, [rows, today]);

  async function mark(a: Attendance, action: 'in' | 'out') {
    setBusyId(a.id);
    setError(null);
    setFlash(null);
    try {
      const key = (side === 'worker' ? 'worker_' : 'employer_') + action;
      await api.markAttendance(a.id, key as never);
      setFlash(
        action === 'in'
          ? side === 'worker'
            ? t('आपका Check-IN दर्ज हो गया ✅')
            : t('आपने कामगार का IN कन्फर्म कर दिया ✅')
          : side === 'worker'
            ? t('आपका Check-OUT दर्ज हो गया ✅')
            : t('आपने कामगार का OUT कन्फर्म कर दिया ✅'),
      );
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  async function submitDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!dispute) return;
    try {
      await api.raiseDispute({
        type: 'attendance',
        description: disputeText,
        hire_id: dispute.hire_id,
        attendance_id: dispute.id,
      });
      setFlash(t('विवाद दर्ज कर दिया गया। एडमिन इसकी जाँच करेंगे।'));
      setDispute(null);
      setDisputeText('');
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  function renderCard(a: Attendance) {
    const hire = hires[a.hire_id];
    const job = hire ? jobs[hire.job_id] : undefined;
    const other = people[side === 'worker' ? a.employer_id : a.worker_id];
    const mine = side === 'worker';
    const myIn = mine ? a.worker_in : a.employer_in;
    const theirIn = mine ? a.employer_in : a.worker_in;
    const myOut = mine ? a.worker_out : a.employer_out;
    const theirOut = mine ? a.employer_out : a.worker_out;

    return (
      <Card key={a.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bold">{job?.title ?? t('काम')}</p>
            <p className="text-sm text-ink-soft">
              {other?.name ?? '—'} · {fmtDate(a.date)}
            </p>
          </div>
          <Chip
            tone={
              a.attendance_status === 'completed' || a.attendance_status === 'present'
                ? 'green'
                : a.attendance_status === 'disputed'
                  ? 'red'
                  : 'amber'
            }
          >
            {t(ATTENDANCE_LABEL[a.attendance_status])}
          </Chip>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <TimeBox label={t('कामगार IN')} value={a.worker_in} />
          <TimeBox label={t('नियोक्ता IN')} value={a.employer_in} />
          <TimeBox label={t('कामगार OUT')} value={a.worker_out} />
          <TimeBox label={t('नियोक्ता OUT')} value={a.employer_out} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>
            🕗 {t('तय:')} {fmtTime(a.scheduled_in)} - {fmtTime(a.scheduled_out)}
          </Chip>
          {a.attendance_status === 'completed' && (
            <>
              <Chip>{t('सामान्य घंटे:')} {hoursLabel(a.regular_hours)}</Chip>
              <Chip tone="amber">{t('ओवरटाइम:')} {hoursLabel(a.overtime_hours)}</Chip>
              <Chip>{t('कुल:')} {hoursLabel(a.total_hours)}</Chip>
              <Chip tone="worker">{t('OT राशि')} {rupee(a.overtime_amount)}</Chip>
              <Chip tone="green">{t('कुल मजदूरी')} {rupee(a.total_wage)}</Chip>
            </>
          )}
        </div>

        {a.attendance_status !== 'completed' && a.attendance_status !== 'disputed' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {!myIn && (
              <Button variant={side} loading={busyId === a.id} onClick={() => mark(a, 'in')}>
                {mine ? '🟢 Check IN' : '🟢 Confirm IN'}
              </Button>
            )}
            {myIn && !theirIn && <Chip tone="amber">{t('🟡 दूसरी तरफ से IN की पुष्टि बाकी')}</Chip>}
            {a.confirmed_in && !myOut && (
              <Button variant={side} loading={busyId === a.id} onClick={() => mark(a, 'out')}>
                {mine ? '🔴 Check OUT' : '🔴 Confirm OUT'}
              </Button>
            )}
            {myOut && !theirOut && <Chip tone="amber">{t('🟡 दूसरी तरफ से OUT की पुष्टि बाकी')}</Chip>}
          </div>
        )}

        {a.attendance_status !== 'not_started' && (
          <button
            onClick={() => setDispute(a)}
            className="mt-3 text-xs font-semibold text-ink-faint underline hover:text-danger"
          >{t('हाजिरी में गड़बड़ी? विवाद दर्ज करें')}</button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('कामगार और नियोक्ता — दोनों की पुष्टि के बाद ही हाजिरी पक्की होती है।')}>{t('डिजिटल हाजिरी')}</SectionTitle>

      {flash && <Banner tone="success">{flash}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      {rows === null ? (
        <Skeleton count={2} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🕐"
          title={t('अभी कोई हाजिरी रिकॉर्ड नहीं है।')}
          hint={t('जैसे ही कोई काम पक्का होगा, उस दिन की हाजिरी यहाँ अपने आप बन जाएगी।')}
        />
      ) : (
        <>
          <div className="space-y-3">
            <p className="text-sm font-bold text-ink-soft">{t('आज और आने वाले दिन')}</p>
            {todayRows.length === 0 ? (
              <Card>
                <p className="py-3 text-center text-sm text-ink-faint">{t('आज के लिए कोई हाजिरी नहीं है।')}</p>
              </Card>
            ) : (
              todayRows.map(renderCard)
            )}
          </div>

          {pastRows.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-ink-soft">{t('पुराना रिकॉर्ड')}</p>
              {pastRows.map(renderCard)}
            </div>
          )}
        </>
      )}

      <Modal open={!!dispute} title={t('विवाद दर्ज करें')} onClose={() => setDispute(null)}>
        <form onSubmit={submitDispute} className="space-y-3">
          <Banner tone="info">{t('विवाद दर्ज करते ही यह हाजिरी रिकॉर्ड लॉक हो जाएगा और एडमिन जाँच करेंगे। दर्ज समय नहीं बदले जाते।')}</Banner>
          <Field label={t('क्या दिक्कत है?')} required>
            <textarea
              className="kg-input"
              rows={4}
              value={disputeText}
              onChange={(e) => setDisputeText(e.target.value)}
              placeholder={t('जैसे: मैंने 8:05 पर आकर काम शुरू किया लेकिन IN कन्फर्म नहीं हुआ।')}
              required
            />
          </Field>
          <Button type="submit" variant="danger" block>{t('विवाद दर्ज करें')}</Button>
        </form>
      </Modal>
    </div>
  );
}

function TimeBox({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${value ? 'border-employer/25 bg-employer-soft/50' : 'border-line bg-cream'}`}>
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="text-sm font-bold">{value ? fmtTime(value) : '—'}</p>
    </div>
  );
}
