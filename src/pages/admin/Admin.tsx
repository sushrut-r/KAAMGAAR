import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { errMsg } from '../../lib/insforge';
import { fmtDate, rupee } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Banner, Card, Chip, EmptyState, SectionTitle, Skeleton, Stat } from '../../components/ui';
import { t, useLang } from '../../lib/i18n';

export function AdminDashboard() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminStats()
      .then(setStats)
      .catch((e) => setError(errMsg(e)));
  }, []);

  return (
    <div className="space-y-5">
      <SectionTitle sub={t('पूरे प्लेटफॉर्म की स्थिति।')}>{t('एडमिन डैशबोर्ड')}</SectionTitle>
      {error && <Banner tone="error">{error}</Banner>}
      {!stats && !error ? (
        <Skeleton count={2} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('कुल कामगार')} value={stats?.total_workers ?? 0} icon="👷" tone="worker" />
          <Stat label={t('कुल नियोक्ता')} value={stats?.total_employers ?? 0} icon="🏗️" tone="employer" />
          <Stat label={t('अभी उपलब्ध कामगार')} value={stats?.active_workers ?? 0} icon="🟢" />
          <Stat label={t('चालू काम')} value={stats?.active_jobs ?? 0} icon="📋" />
          <Stat label={t('पूरे हुए काम')} value={stats?.completed_jobs ?? 0} icon="✅" />
          <Stat label={t('लंबित विवाद')} value={stats?.pending_disputes ?? 0} icon="⚖️" tone="gold" />
          <Stat label={t('सत्यापन बाकी')} value={stats?.pending_verification ?? 0} icon="🪪" />
          <Stat label={t('बकाया भुगतान')} value={rupee(stats?.pending_payments ?? 0)} icon="💰" tone="gold" />
        </div>
      )}
      {stats && Number(stats.open_flags) > 0 && (
        <Banner tone="error">⚠️ {stats.open_flags} {t('संदिग्ध गतिविधियाँ जाँच के लिए चिन्हित हैं।')}</Banner>
      )}
    </div>
  );
}

function useEntity<T>(entity: string) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () =>
    api
      .adminList<T>(entity)
      .then(setRows)
      .catch((e) => {
        setError(errMsg(e));
        setRows([]);
      });
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);
  return { rows, error, reload };
}

function Table({
  title,
  sub,
  entity,
  columns,
}: {
  title: string;
  sub?: string;
  entity: string;
  columns: { key: string; label: string; render?: (v: unknown, row: Record<string, unknown>) => React.ReactNode }[];
}) {
  const { rows, error } = useEntity<Record<string, unknown>>(entity);
  return (
    <div className="space-y-4">
      <SectionTitle sub={sub}>{title}</SectionTitle>
      {error && <Banner tone="error">{error}</Banner>}
      {rows === null ? (
        <Skeleton count={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon="📭" title={t('कोई रिकॉर्ड नहीं मिला।')} />
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-cream/60">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-4 py-2.5 text-left font-semibold text-ink-soft">
                      {t(c.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-4 py-2.5">
                        {c.render ? c.render(r[c.key], r) : String(r[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const roleHi = (r: string) => (r === 'worker' ? t('कामगार') : r === 'employer' ? t('नियोजक') : t('एडमिन'));
const roleEn = (r: string) => (r === 'worker' ? 'Worker' : r === 'employer' ? 'Employer' : 'Admin');

export function AdminUsers() {
  const { lang } = useLang();
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState<'worker' | 'employer' | 'admin'>('admin');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function updateRole(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (mobile.trim().length !== 10) {
      setResult({ ok: false, text: t('कृपया 10 अंकों का मोबाइल नंबर लिखें।') });
      return;
    }
    setBusy(true);
    try {
      const r = await api.adminSetUserRole(mobile.trim(), role);
      setResult({
        ok: true,
        text: lang === 'hi' ? `✔️ ${r.name} — ${roleHi(r.previous_role)} से ${roleHi(r.new_role)} बन गए।` : `✔️ ${r.name} — changed from ${roleEn(r.previous_role)} to ${roleEn(r.new_role)}`,
      });
      setMobile('');
    } catch (err) {
      setResult({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="font-bold">{t('🔑 रोल बदलें — एडमिन बनाएं / हटाएं')}</p>
        <p className="mt-1 text-sm text-ink-soft">{t('यूज़र का मोबाइल नंबर लिखें, नई भूमिका चुनें — एडमिन बनते ही वो एडमिन पैनल देख सकेगा।')}</p>
        <form onSubmit={updateRole} className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-stretch gap-1">
            <span className="flex select-none items-center rounded-lg border border-line bg-cream px-2.5 text-sm font-semibold text-ink-soft">
              +91
            </span>
            <input
              className="kg-input"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder={t('10 अंकों का मोबाइल')}
              inputMode="numeric"
            />
          </div>
          <select
            className="kg-input"
            value={role}
            onChange={(e) => setRole(e.target.value as 'worker' | 'employer' | 'admin')}
          >
            <option value="admin">{t('एडमिन')}</option>
            <option value="employer">{t('नियोजक')}</option>
            <option value="worker">{t('कामगार')}</option>
          </select>
          <Button variant="employer" loading={busy}>{t('अपडेट करें')}</Button>
        </form>
        {result && (
          <div className="mt-3">
            <Banner tone={result.ok ? 'success' : 'error'}>{result.text}</Banner>
          </div>
        )}
      </Card>
      <Table
      title={t('यूज़र्स')}
      sub={t('कामगार, नियोक्ता और एडमिन।')}
      entity="profiles"
      columns={[
        { key: 'name', label: t('नाम') },
        { key: 'phone', label: t('मोबाइल'), render: (v) => (v ? `+91 ${v}` : '—') },
        {
          key: 'role',
          label: t('भूमिका'),
          render: (v) => <Chip tone={v === 'worker' ? 'worker' : v === 'employer' ? 'employer' : 'neutral'}>{String(v)}</Chip>,
        },
        { key: 'location', label: t('इलाका') },
        {
          key: 'verification_status',
          label: t('सत्यापन'),
          render: (v) => <Chip tone={v === 'verified' ? 'green' : 'amber'}>{String(v)}</Chip>,
        },
        { key: 'created_at', label: t('जुड़ा'), render: (v) => fmtDate(String(v)) },
      ]}
      />
    </div>
  );
}

export function AdminJobs() {
  return (
    <Table
      title={t('काम')}
      entity="jobs"
      columns={[
        { key: 'title', label: t('शीर्षक') },
        { key: 'location', label: t('जगह') },
        { key: 'daily_wage', label: t('मजदूरी'), render: (v) => rupee(Number(v)) },
        { key: 'workers_required', label: t('चाहिए') },
        { key: 'workers_hired', label: t('रखे') },
        { key: 'status', label: t('स्थिति'), render: (v) => <Chip>{String(v)}</Chip> },
        { key: 'created_at', label: t('तारीख'), render: (v) => fmtDate(String(v)) },
      ]}
    />
  );
}

export function AdminAttendance() {
  return (
    <Table
      title={t('हाजिरी')}
      sub={t('दर्ज टाइमस्टैम्प बदले नहीं जा सकते — केवल विवाद प्रक्रिया से सुधार होता है।')}
      entity="attendance"
      columns={[
        { key: 'date', label: t('तारीख'), render: (v) => fmtDate(String(v)) },
        { key: 'attendance_status', label: t('स्थिति'), render: (v) => <Chip>{String(v)}</Chip> },
        { key: 'regular_hours', label: t('सामान्य घंटे') },
        { key: 'overtime_hours', label: t('ओवरटाइम') },
        { key: 'total_wage', label: t('कुल मजदूरी'), render: (v) => rupee(Number(v)) },
      ]}
    />
  );
}

export function AdminPayments() {
  return (
    <Table
      title={t('भुगतान')}
      entity="payments"
      columns={[
        { key: 'amount', label: t('राशि'), render: (v) => rupee(Number(v)) },
        { key: 'paid_amount', label: t('दिया गया'), render: (v) => rupee(Number(v)) },
        { key: 'status', label: t('स्थिति'), render: (v) => <Chip>{String(v)}</Chip> },
        { key: 'method', label: t('माध्यम') },
        { key: 'created_at', label: t('तारीख'), render: (v) => fmtDate(String(v)) },
      ]}
    />
  );
}

export function AdminReviews() {
  return (
    <Table
      title={t('रिव्यू')}
      entity="reviews"
      columns={[
        { key: 'rating', label: t('रेटिंग'), render: (v) => `⭐ ${v}` },
        { key: 'reviewer_role', label: t('किसने दी') },
        { key: 'review', label: t('टिप्पणी') },
        { key: 'created_at', label: t('तारीख'), render: (v) => fmtDate(String(v)) },
      ]}
    />
  );
}

export function AdminDisputes() {
  const { rows, error, reload } = useEntity<Record<string, unknown>>('disputes');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function resolve(id: string, status: string) {
    setBusy(id);
    try {
      await api.adminResolveDispute(id, status, status === 'resolved' ? t('एडमिन ने जाँच के बाद हल किया।') : t('अस्वीकृत।'));
      setMsg(t('विवाद अपडेट हो गया।'));
      reload();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle sub={t('हाजिरी, ओवरटाइम, भुगतान और अन्य शिकायतें।')}>{t('विवाद')}</SectionTitle>
      {error && <Banner tone="error">{error}</Banner>}
      {msg && <Banner tone="success">{msg}</Banner>}
      {rows === null ? (
        <Skeleton count={2} />
      ) : rows.length === 0 ? (
        <EmptyState icon="⚖️" title={t('कोई विवाद लंबित नहीं है।')} />
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Card key={String(d.id)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{String(d.type)}</p>
                  <p className="text-sm text-ink-soft">{String(d.description)}</p>
                  <p className="mt-1 text-xs text-ink-faint">{fmtDate(String(d.created_at))}</p>
                </div>
                <Chip tone={d.status === 'resolved' ? 'green' : d.status === 'rejected' ? 'red' : 'amber'}>
                  {String(d.status)}
                </Chip>
              </div>
              {['open', 'under_review'].includes(String(d.status)) && (
                <div className="mt-3 flex gap-2">
                  <Button variant="employer" size="sm" loading={busy === d.id} onClick={() => resolve(String(d.id), 'resolved')}>{t('हल किया')}</Button>
                  <Button variant="ghost" size="sm" loading={busy === d.id} onClick={() => resolve(String(d.id), 'rejected')}>{t('अस्वीकार')}</Button>
                </div>
              )}
              {d.resolution ? <p className="mt-2 text-sm text-ink-soft">✅ {String(d.resolution)}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminVerification() {
  const { rows, error, reload } = useEntity<Record<string, unknown>>('profiles');
  const [busy, setBusy] = useState<string | null>(null);
  const pending = (rows ?? []).filter((r) => r.verification_status === 'pending');

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await api.adminSetVerification(id, status);
      reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle sub={t('सत्यापन से भरोसा बढ़ता है।')}>{t('सत्यापन')}</SectionTitle>
      {error && <Banner tone="error">{error}</Banner>}
      {rows === null ? (
        <Skeleton count={2} />
      ) : pending.length === 0 ? (
        <EmptyState icon="✅" title={t('सत्यापन के लिए कोई लंबित यूज़र नहीं है।')} />
      ) : (
        <div className="space-y-2">
          {pending.map((p) => (
            <Card key={String(p.id)} className="!py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{String(p.name)}</p>
                  <p className="text-xs text-ink-faint">
                    {String(p.role)} · {String(p.location ?? '—')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="employer" size="sm" loading={busy === p.id} onClick={() => setStatus(String(p.id), 'verified')}>{t('सत्यापित करें')}</Button>
                  <Button variant="ghost" size="sm" loading={busy === p.id} onClick={() => setStatus(String(p.id), 'rejected')}>{t('अस्वीकार')}</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminResetRequests() {
  const [pending, setPending] = useState<Array<Record<string, unknown>> | null>(null);
  const [recent, setRecent] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = () =>
    Promise.all([
      api.adminResetRequests('pending', 50).catch(() => []),
      api.adminResetRequests('all', 10).catch(() => []),
    ]).then(([p, r]) => {
      setPending(p);
      setRecent(r);
      setError(null);
    });

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve(id: string) {
    if (!window.confirm(t('इस यूज़र को टेंपरेरी पासवर्ड सेट करें? (उसकी रिक्वेस्ट पेज पर पासवर्ड दिखेगा।)'))) return;
    setBusy(id);
    setMsg(null);
    try {
      await api.adminApproveReset(id);
      setMsg(t('✔️ टेंपरेरी पासवर्ड सेट हो गया — यूज़र के पेज पर दिखने लगा है।'));
      load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function doReject(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      await api.adminRejectReset(id, note || undefined);
      setRejecting(null);
      setNote('');
      setMsg(t('रिक्वेस्ट अस्वीकार की गई।'));
      load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const roleChip = (role: string) => (role === 'worker' ? t('👷 कामगार') : role === 'employer' ? t('🏗️ नियोजक') : role);

  return (
    <div className="space-y-4">
      <SectionTitle sub={t('जो यूज़र अपना पासवर्ड भूल गए — उनकी रिक्वेस्ट यहाँ आती है। मंज़ूरी पर टेंपरेरी पासवर्ड सेट होता है।')}>{t('🔑 पासवर्ड रीसेट')}</SectionTitle>
      {error && <Banner tone="error">{error}</Banner>}
      {msg && <Banner tone="success">{msg}</Banner>}

      <p className="text-sm font-bold text-ink-soft">{t('लंबित रिक्वेस्ट (')}{pending?.length ?? '…'})</p>
      {pending === null ? (
        <Skeleton count={1} />
      ) : pending.length === 0 ? (
        <EmptyState icon="🔑" title={t('कोई लंबित रिक्वेस्ट नहीं है।')} />
      ) : (
        <div className="space-y-3">
          {pending.map((r) => (
            <Card key={String(r.id)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{String(r.user_name)}</p>
                  <p className="text-sm text-ink-soft">
                    📱 +91 {String(r.mobile)} · {roleChip(String(r.user_role))}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">{fmtDate(String(r.created_at))}</p>
                </div>
                <Chip tone="amber">{t('⏳ लंबित')}</Chip>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="employer" size="sm" loading={busy === r.id} onClick={() => approve(String(r.id))}>{t('✔️ मंज़ूर करें (पासवर्ड सेट करें)')}</Button>
                <Button variant="ghost" size="sm" onClick={() => { setRejecting(String(r.id)); setNote(''); }}>{t('✖️ अस्वीकार')}</Button>
              </div>
              {rejecting === r.id && (
                <div className="mt-3 space-y-2 rounded-xl border border-line bg-cream-deep/40 p-3">
                  <textarea
                    className="kg-input"
                    rows={2}
                    placeholder={t('कारण लिखें (वैकल्पिक — यूज़र को दिखेगा)')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" loading={busy === r.id} onClick={() => doReject(String(r.id))}>{t('अस्वीकार पक्का करें')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(null)}>{t('रद्द करें')}</Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {recent && recent.length > 0 && (
        <>
          <p className="pt-2 text-sm font-bold text-ink-soft">{t('हाल के रिज़ल्ट')}</p>
          <div className="space-y-2">
            {recent.map((r) => (
              <Card key={String(r.id)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-semibold">{String(r.user_name)}</span>
                    <span className="text-ink-faint"> · +91 {String(r.mobile)}</span>
                  </div>
                  <Chip tone={r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'neutral'}>
                    {r.status === 'approved' ? t('✔️ पासवर्ड सेट') : r.status === 'rejected' ? t('✖️ अस्वीकृत') : r.status === 'consumed' ? t('✅ नया पासवर्ड सेट हुआ') : String(r.status)}
                  </Chip>
                </div>
                {r.admin_note ? <p className="mt-1 text-xs text-ink-faint">{t('कारण:')} {String(r.admin_note)}</p> : null}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
