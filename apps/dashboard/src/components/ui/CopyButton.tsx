import { Check, Copy } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '~/lib/cn';
import { Tooltip } from './Tooltip';

interface CopyButtonProps {
  value: string;
  label?: string;
  size?: 'xs' | 'sm';
  className?: string;
}

export function CopyButton({
  value,
  label = 'Copy',
  size = 'sm',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* no-op */
    }
  }, [value]);

  const dim = size === 'xs' ? 'size-6' : 'size-7';
  const icon = size === 'xs' ? 'size-3' : 'size-3.5';

  return (
    <Tooltip label={copied ? 'Copied' : label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={copied ? 'Copied' : label}
        className={cn(
          dim,
          'inline-flex items-center justify-center rounded-md',
          'text-ink-muted hover:text-ink hover:bg-paper',
          'dark:hover:bg-white/5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40',
          className,
        )}
      >
        {copied ? (
          <Check className={cn(icon, 'text-state-success')} />
        ) : (
          <Copy className={icon} />
        )}
      </button>
    </Tooltip>
  );
}
