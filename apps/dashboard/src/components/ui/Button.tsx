import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '~/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'flow';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconAfter?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: cn(
    'bg-ink text-canvas hover:bg-ink-2 active:bg-ink-3',
    'dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400',
    'border border-ink/0 dark:border-indigo-400/20',
  ),
  secondary: cn(
    'bg-canvas-raised text-ink border border-ink/10',
    'hover:border-indigo-500/40 hover:text-ink',
    'active:bg-paper',
    'dark:bg-canvas-raised dark:text-ink dark:border-white/10',
    'dark:hover:border-indigo-400/50',
  ),
  ghost: cn(
    'bg-transparent text-ink',
    'hover:bg-paper/70 active:bg-paper',
    'dark:hover:bg-white/5',
  ),
  danger: cn(
    'bg-state-danger text-white',
    'hover:brightness-110 active:brightness-95',
    'border border-state-danger/20',
  ),
  flow: cn(
    'text-white border border-transparent',
    'bg-gradient-to-r from-flow-cyan to-flow-mint',
    'hover:brightness-105 active:brightness-95',
  ),
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-md gap-1.5',
  md: 'h-9 px-3.5 text-sm rounded-md gap-2',
  lg: 'h-11 px-5 text-sm rounded-md gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    iconAfter,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={cn(
        'relative inline-flex items-center justify-center font-medium whitespace-nowrap',
        'select-none leading-none',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-expo',
        'active:scale-[0.98]',
        'disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        VARIANTS[variant],
        SIZES[size],
        loading && 'text-transparent',
        className,
      )}
      {...rest}
    >
      {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
      <span>{children}</span>
      {iconAfter ? <span className="inline-flex shrink-0">{iconAfter}</span> : null}
      {loading ? (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin text-current opacity-80" />
        </span>
      ) : null}
    </button>
  );
});
