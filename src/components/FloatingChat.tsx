import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { errMsg } from '../lib/insforge';
import type { Job, Message, Profile } from '../lib/types';
import { fmtTime, timeAgo } from '../lib/format';
import { Avatar } from './ui';
import { t } from '../lib/i18n';

interface Thread {
  otherId: string;
  jobId: string | null;
  lastMessage: string;
  lastAt: string;
  unread: number;
  isPlaceholder: boolean;
}

/**
 * WhatsApp-style floating chat. Lives in the bottom-right corner on every signed-in
 * page: a bubble button with an unread badge, opening a panel that holds the
 * conversation list and the open thread.
 */
export function FloatingChat({ accent }: { accent: 'worker' | 'employer' | 'neutral' }) {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [contacts, setContacts] = useState<Record<string, Profile>>({});
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [engaged, setEngaged] = useState<{ id: string; jobId: string | null }[]>([]);
  const [active, setActive] = useState<{ otherId: string; jobId: string | null } | null>(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const accentBg =
    accent === 'worker' ? 'bg-worker' : accent === 'employer' ? 'bg-employer' : 'bg-ink';
  const accentSoft =
    accent === 'worker' ? 'bg-worker-soft' : accent === 'employer' ? 'bg-employer-soft' : 'bg-cream-deep';

  /* ------------------------------------------------------------- loading */

  const loadMessages = useCallback(async () => {
    if (!profile) return;
    try {
      const msgs = await api.allMyMessages();
      setMessages(msgs);
      const ids = [
        ...new Set(msgs.flatMap((m) => [m.sender_id, m.receiver_id]).filter((id) => id !== profile.id)),
      ];
      const missing = ids.filter((id) => !contacts[id]);
      if (missing.length) {
        const cm: Record<string, Profile> = {};
        await Promise.all(
          missing.map(async (id) => {
            const p = await api.getProfile(id).catch(() => null);
            if (p) cm[id] = p;
          }),
        );
        setContacts((c) => ({ ...c, ...cm }));
      }
      const jobIds = [...new Set(msgs.map((m) => m.job_id).filter(Boolean) as string[])].filter(
        (id) => !jobs[id],
      );
      if (jobIds.length) {
        const jm: Record<string, Job> = {};
        await Promise.all(
          jobIds.map(async (id) => {
            const j = await api.getJob(id).catch(() => null);
            if (j) jm[id] = j;
          }),
        );
        setJobs((x) => ({ ...x, ...jm }));
      }
    } catch (e) {
      setError(errMsg(e));
      setMessages([]);
    }
  }, [profile, contacts, jobs]);

  // people this user may talk to (applications + hires), so a chat can start before any message
  useEffect(() => {
    if (!profile || profile.role === 'admin') return;
    (async () => {
      const as = profile.role === 'worker' ? 'worker' : 'employer';
      const [apps, hires] = await Promise.all([
        as === 'worker'
          ? api.myApplications(profile.id).catch(() => [])
          : api.employerApplications(profile.id).catch(() => []),
        api.myHires(profile.id, as).catch(() => []),
      ]);
      const list: { id: string; jobId: string | null }[] = [];
      apps.forEach((a) => list.push({ id: as === 'worker' ? a.employer_id : a.worker_id, jobId: a.job_id }));
      hires.forEach((h) => list.push({ id: as === 'worker' ? h.employer_id : h.worker_id, jobId: h.job_id }));
      const seen = new Set<string>();
      const dedup = list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
      setEngaged(dedup);
      const cm: Record<string, Profile> = {};
      await Promise.all(
        dedup.map(async (x) => {
          const p = await api.getProfile(x.id).catch(() => null);
          if (p) cm[x.id] = p;
        }),
      );
      setContacts((c) => ({ ...cm, ...c }));
    })();
  }, [profile]);

  // poll: quickly while the panel is open, slowly in the background just for the badge
  useEffect(() => {
    if (!profile) return;
    loadMessages();
    const t = setInterval(loadMessages, open ? 8000 : 25000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, open]);

  // /chat is kept as a deep link (older notifications point at it). It redirects to the
  // dashboard carrying ?chat=1 — the redirect mounts a different layout instance, so the
  // "open" intent has to travel through the URL rather than component state.
  useEffect(() => {
    if (location.pathname === '/chat') {
      const home =
        profile?.role === 'employer' ? '/employer' : profile?.role === 'admin' ? '/admin' : '/worker';
      navigate(`${home}?chat=1`, { replace: true });
    }
  }, [location.pathname, navigate, profile]);

  useEffect(() => {
    if (searchParams.get('chat')) {
      setOpen(true);
      navigate(location.pathname, { replace: true });
    }
  }, [searchParams, location.pathname, navigate]);

  /* -------------------------------------------------------------- derived */

  const threads = useMemo<Thread[]>(() => {
    if (!profile || !messages) return [];
    const map = new Map<string, Thread>();
    messages.forEach((m) => {
      const other = m.sender_id === profile.id ? m.receiver_id : m.sender_id;
      const prev = map.get(other);
      const unread = m.receiver_id === profile.id && !m.read_at ? 1 : 0;
      if (!prev) {
        map.set(other, {
          otherId: other,
          jobId: m.job_id,
          lastMessage: m.message,
          lastAt: m.created_at,
          unread,
          isPlaceholder: false,
        });
      } else {
        prev.lastMessage = m.message;
        prev.lastAt = m.created_at;
        prev.unread += unread;
        if (m.job_id) prev.jobId = m.job_id;
      }
    });
    engaged.forEach((e) => {
      if (!map.has(e.id))
        map.set(e.id, {
          otherId: e.id,
          jobId: e.jobId,
          lastMessage: t('बातचीत शुरू करें'),
          lastAt: '',
          unread: 0,
          isPlaceholder: true,
        });
    });
    const rows = [...map.values()].sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
    const q = search.trim().toLowerCase();
    return q
      ? rows.filter((r) => (contacts[r.otherId]?.name ?? '').toLowerCase().includes(q))
      : rows;
  }, [messages, profile, engaged, search, contacts]);

  const totalUnread = useMemo(() => {
    if (!profile || !messages) return 0;
    return messages.filter((m) => m.receiver_id === profile.id && !m.read_at).length;
  }, [messages, profile]);

  const activeMessages = useMemo(() => {
    if (!active || !messages || !profile) return [];
    return messages.filter(
      (m) =>
        (m.sender_id === active.otherId && m.receiver_id === profile.id) ||
        (m.sender_id === profile.id && m.receiver_id === active.otherId),
    );
  }, [active, messages, profile]);

  useEffect(() => {
    if (open && active) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [activeMessages.length, open, active]);

  // opening a thread marks its incoming messages as read
  useEffect(() => {
    if (!open || !active || !profile || !messages) return;
    const unreadIds = messages
      .filter((m) => m.sender_id === active.otherId && m.receiver_id === profile.id && !m.read_at)
      .map((m) => m.id);
    if (!unreadIds.length) return;
    api.markMessagesRead(unreadIds).then(() =>
      setMessages((prev) =>
        (prev ?? []).map((m) =>
          unreadIds.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m,
        ),
      ),
    );
  }, [open, active, profile, messages]);

  /* -------------------------------------------------------------- actions */

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !active || !text.trim()) return;
    const body = text.trim();
    setText('');
    setSending(true);
    setError(null);
    try {
      await api.sendMessage({
        sender_id: profile.id,
        receiver_id: active.otherId,
        job_id: active.jobId,
        message: body,
      });
      await loadMessages();
    } catch (err) {
      setError(errMsg(err));
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function sendImage() {
    const file = fileRef.current?.files?.[0];
    if (!file || !profile || !active) return;
    setSending(true);
    try {
      const up = await api.uploadFile('chat', file);
      await api.sendMessage({
        sender_id: profile.id,
        receiver_id: active.otherId,
        job_id: active.jobId,
        message: t('📷 फोटो'),
        message_type: 'image',
        attachment_url: up.url,
      });
      if (fileRef.current) fileRef.current.value = '';
      await loadMessages();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  if (!profile) return null;
  const activeContact = active ? contacts[active.otherId] : null;

  return (
    <>
      {/* ---------------------------------------------------- bubble button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('संदेश')}
        className={`fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-2xl
          text-white shadow-lg transition hover:brightness-110 active:scale-95 lg:bottom-6 lg:right-6
          ${accentBg} ${open ? 'scale-95' : ''}`}
      >
        {open ? '✕' : '💬'}
        {!open && totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-6 rounded-full border-2 border-cream bg-danger px-1 text-xs font-bold leading-5 text-white">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {/* ----------------------------------------------------------- panel */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex flex-col bg-white sm:inset-auto sm:bottom-24 sm:right-4
            sm:h-[560px] sm:max-h-[calc(100vh-8rem)] sm:w-[380px] sm:rounded-3xl sm:border sm:border-line
            sm:shadow-2xl lg:bottom-24 lg:right-6"
        >
          {/* header */}
          <div className={`flex items-center gap-2.5 rounded-t-none px-3 py-3 sm:rounded-t-3xl ${accentSoft}`}>
            {active ? (
              <>
                <button
                  onClick={() => setActive(null)}
                  className="rounded-full px-2 py-1 text-lg leading-none hover:bg-white/60"
                  aria-label={t('वापस')}
                >
                  ←
                </button>
                <Avatar name={activeContact?.name ?? '?'} src={activeContact?.profile_photo} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold leading-tight">{activeContact?.name ?? t('यूज़र')}</p>
                  {active.jobId && jobs[active.jobId] && (
                    <p className="truncate text-[11px] text-ink-faint">{t('काम:')} {jobs[active.jobId].title}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="text-xl">💬</span>
                <div className="flex-1">
                  <p className="font-bold leading-tight">{t('संदेश')}</p>
                  <p className="text-[11px] text-ink-faint">
                    {totalUnread > 0 ? `${totalUnread} ${t('नए संदेश')}` : t('आपकी सभी बातचीत')}
                  </p>
                </div>
              </>
            )}
            <button
              onClick={() => setOpen(false)}
              className="rounded-full px-2 py-1 text-xl leading-none text-ink-faint hover:bg-white/60"
              aria-label={t('बंद करें')}
            >
              ×
            </button>
          </div>

          {error && (
            <p className="border-b border-line bg-danger/5 px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}

          {/* body */}
          {!active ? (
            <>
              <div className="border-b border-line px-3 py-2">
                <input
                  className="kg-input !py-2 text-sm"
                  placeholder={t('नाम खोजें...')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {messages === null ? (
                  <div className="space-y-2 p-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-xl bg-cream-deep/60" />
                    ))}
                  </div>
                ) : threads.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                    <span className="text-4xl">💬</span>
                    <p className="font-semibold">{t('अभी कोई बातचीत नहीं है।')}</p>
                    <p className="text-sm text-ink-faint">{t('आवेदन या काम पक्का होने के बाद यहाँ बातचीत शुरू होती है।')}</p>
                  </div>
                ) : (
                  threads.map((th) => {
                    const p = contacts[th.otherId];
                    return (
                      <button
                        key={th.otherId}
                        onClick={() => setActive({ otherId: th.otherId, jobId: th.jobId })}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left hover:bg-cream"
                      >
                        <Avatar name={p?.name ?? '?'} src={p?.profile_photo} size={44} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate font-semibold">{p?.name ?? t('यूज़र')}</p>
                            {th.lastAt && (
                              <span className="shrink-0 text-[10px] text-ink-faint">
                                {timeAgo(th.lastAt)}
                              </span>
                            )}
                          </div>
                          <p
                            className={`truncate text-sm ${
                              th.unread > 0 ? 'font-semibold text-ink' : 'text-ink-faint'
                            }`}
                          >
                            {th.lastMessage}
                          </p>
                        </div>
                        {th.unread > 0 && (
                          <span className="min-w-5 rounded-full bg-worker px-1.5 text-[11px] font-bold leading-5 text-white">
                            {th.unread}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 space-y-1.5 overflow-y-auto bg-cream/60 p-3">
                {activeMessages.length === 0 && (
                  <p className="py-10 text-center text-sm text-ink-faint">{t('बातचीत शुरू करें 👋')}</p>
                )}
                {activeMessages.map((m) => {
                  const mine = m.sender_id === profile.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          mine
                            ? `${accentBg} rounded-br-md text-white`
                            : 'rounded-bl-md border border-line bg-white'
                        }`}
                      >
                        {m.message_type === 'image' && m.attachment_url && (
                          <img src={m.attachment_url} alt="" className="mb-1 max-h-44 rounded-lg" />
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        <p
                          className={`mt-0.5 text-right text-[10px] ${
                            mine ? 'text-white/70' : 'text-ink-faint'
                          }`}
                        >
                          {fmtTime(m.created_at)}
                          {mine && (m.read_at ? ' ✓✓' : ' ✓')}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="flex items-center gap-1.5 border-t border-line p-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={sendImage} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-full px-2.5 py-2 text-lg hover:bg-cream"
                  aria-label={t('फोटो भेजें')}
                >
                  📷
                </button>
                <input
                  className="kg-input !py-2 flex-1 text-sm"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('संदेश लिखें...')}
                />
                <button
                  type="submit"
                  disabled={sending || !text.trim()}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition
                    disabled:opacity-40 ${accentBg}`}
                  aria-label={t('भेजें')}
                >
                  ➤
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
