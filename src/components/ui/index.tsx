import { cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { t } from '../../lib/i18n';

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`kg-card p-4 sm:p-5 ${onClick ? 'cursor-pointer hover:shadow-md transition' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
  sub,
}: {
  children: ReactNode;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink">{children}</h2>
        {sub && <p className="text-sm text-ink-faint">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Loading({ label = t('लोड हो रहा है...') }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-ink-faint">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-worker" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Skeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kg-card h-28 animate-pulse bg-cream-deep/60" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = '📭',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="kg-card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-faint">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="kg-card flex flex-col items-center gap-2 border-danger/25 bg-danger/[0.03] px-6 py-10 text-center">
      <span className="text-3xl">⚠️</span>
      <p className="font-semibold text-danger">{t('कुछ गलत हो गया')}</p>
      <p className="max-w-md text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-cream"
        >{t('दोबारा कोशिश करें')}</button>
      )}
    </div>
  );
}

export function Stat({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  tone?: 'worker' | 'employer' | 'neutral' | 'gold';
}) {
  const tones = {
    worker: 'text-worker',
    employer: 'text-employer',
    neutral: 'text-ink',
    gold: 'text-gold',
  } as const;
  return (
    <div className="kg-card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-faint">
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>
      <p className={`mt-1 text-xl sm:text-2xl font-bold tracking-tight ${tones[tone]}`}>{value}</p>
    </div>
  );
}

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'worker' | 'employer' | 'green' | 'amber' | 'red';
}) {
  const tones = {
    neutral: 'bg-cream text-ink-soft border-line',
    worker: 'bg-worker-soft text-worker border-worker/20',
    employer: 'bg-employer-soft text-employer border-employer/20',
    green: 'bg-employer-soft text-employer border-employer/25',
    amber: 'bg-[#fdf5e3] text-gold border-gold/25',
    red: 'bg-[#fdecea] text-danger border-danger/20',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stars({ value, size = 'sm' }: { value: number | null | undefined; size?: 'sm' | 'md' }) {
  const v = Number(value ?? 0);
  return (
    <span className={`inline-flex items-center gap-1 font-semibold text-gold ${size === 'md' ? 'text-base' : 'text-sm'}`}>
      {v > 0 ? `⭐ ${v.toFixed(1)}` : <span className="text-ink-faint">{t('नया')}</span>}
    </span>
  );
}

export function Avatar({ name, src, size = 44 }: { name: string; src?: string | null; size?: number }) {
  const initials = (name || '?').trim().slice(0, 1).toUpperCase();
  return src ? (
    <img
      src={src}
      alt={name}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-line object-cover"
    />
  ) : (
    <div
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className="flex shrink-0 items-center justify-center rounded-full border border-line bg-cream-deep font-bold text-ink-soft"
    >
      {initials}
    </div>
  );
}

// Find the first form control (input/select/textarea) in a children tree and
// attach an id to it. Custom components are not descended into, so a field that
// only contains buttons (e.g. a camera capture area) simply gets no association.
function attachControlId(
  node: ReactNode,
  id: string,
  found: { current: string | null },
): ReactNode {
  if (found.current) return node;
  if (isValidElement(node)) {
    const el = node as unknown as {
      type: unknown;
      props: { id?: string; children?: ReactNode };
    };
    const tag = typeof el.type === 'string' ? el.type : '';
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (el.props.id === undefined) {
        found.current = id;
        return cloneElement(node as ReactElement<Record<string, unknown>>, { id });
      }
      found.current = el.props.id; // control already has its own id
      return node;
    }
    if (el.props.children != null) {
      return cloneElement(node as ReactElement<Record<string, unknown>>, {}, attachControlId(el.props.children, id, found));
    }
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((c) => attachControlId(c, id, found));
  }
  return node;
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  const genId = useId();
  const found = { current: null as string | null };
  const kids = attachControlId(children, genId, found);
  // a <label> must never wrap non-control elements: it would become the
  // accessible name of any button inside (breaking both a11y and test selectors)
  return (
    <div className="block">
      <label className="kg-label" htmlFor={found.current ?? undefined}>
        {label} {required && <span className="text-worker">*</span>}
      </label>
      {kids}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </div>
  );
}

export function Banner({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tones = {
    error: 'border-danger/25 bg-danger/[0.05] text-danger',
    success: 'border-employer/25 bg-employer-soft text-employer',
    info: 'border-line bg-cream text-ink-soft',
  } as const;
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium ${tones[tone]}`}>{children}</div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-white p-5 shadow-xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full px-2.5 py-1 text-xl leading-none text-ink-faint hover:bg-cream"
            aria-label={t('बंद करें')}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
