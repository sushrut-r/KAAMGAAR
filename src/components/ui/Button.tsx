import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'worker' | 'employer' | 'neutral' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  worker: 'bg-worker text-white hover:brightness-95 border border-transparent',
  employer: 'bg-employer text-white hover:brightness-95 border border-transparent',
  neutral: 'bg-ink text-white hover:brightness-110 border border-transparent',
  ghost: 'bg-transparent text-ink-soft hover:bg-cream-deep border border-transparent',
  outline: 'bg-white text-ink hover:bg-cream border border-line',
  danger: 'bg-danger text-white hover:brightness-95 border border-transparent',
};

const sizes: Record<Size, string> = {
  sm: 'text-sm px-3 py-1.5 rounded-lg gap-1.5',
  md: 'text-[15px] px-4 py-2.5 rounded-xl gap-2',
  lg: 'text-base px-5 py-3.5 rounded-2xl gap-2 font-semibold',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'neutral',
  size = 'md',
  loading,
  block,
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition
        disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]
        ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
    >
      {loading && (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
