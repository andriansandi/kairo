import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  TextareaHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`mb-6 flex items-end justify-between gap-4 ${className}`}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-k-text">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-k-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-k-border bg-k-surface p-5 ${className}`}>
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

const buttonBase =
  'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:k-focus-ring disabled:pointer-events-none disabled:opacity-50';

const buttonStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-k-text text-white hover:bg-slate-800 active:bg-slate-950 shadow-sm',
  secondary:
    'border border-k-border bg-k-surface text-k-text-secondary hover:bg-k-elevated hover:text-k-text active:bg-k-border',
  danger:
    'bg-k-danger-text text-white hover:bg-red-800 active:bg-red-950 shadow-sm',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={`${buttonBase} ${buttonStyles[variant]} ${className}`} {...props} />;
}

const fieldBase =
  'block w-full rounded-md border border-k-border bg-k-surface px-3 py-2 text-sm text-k-text placeholder:text-k-text-muted focus:border-k-border-strong focus:k-focus-ring disabled:opacity-60';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={fieldBase} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={fieldBase} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldBase} min-h-[5rem]`} {...props} />;
}

export type BadgeProps = {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'risk' | 'info';
  className?: string;
};

const badgeStyles: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-k-neutral-bg text-k-neutral-text ring-k-neutral-border',
  success: 'bg-k-success-bg text-k-success-text ring-k-success-border',
  warning: 'bg-k-warning-bg text-k-warning-text ring-k-warning-border',
  risk: 'bg-k-risk-bg text-k-risk-text ring-k-risk-border',
  danger: 'bg-k-danger-bg text-k-danger-text ring-k-danger-border',
  info: 'bg-k-info-bg text-k-info-text ring-k-info-border',
};

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeStyles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-4 w-4 animate-spin rounded-full border-[1.5px] border-k-border-strong border-t-k-text ${className}`}
      aria-label="Loading"
    />
  );
}

type ErrorStateProps = {
  title?: string;
  message: string;
  retry?: () => void;
};

export function ErrorState({ title = 'Error', message, retry }: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-k-danger-border bg-k-danger-bg p-5">
      <h3 className="text-sm font-semibold text-k-danger-text">{title}</h3>
      <p className="mt-1 text-sm text-k-danger-text/90">{message}</p>
      {retry && (
        <Button variant="danger" className="mt-4" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}

type EmptyStateProps = {
  title?: string;
  message?: string;
};

export function EmptyState({ title = 'Nothing here', message }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-k-border bg-k-surface px-6 py-8 text-center">
      <p className="text-sm font-medium text-k-text">{title}</p>
      {message && <p className="mt-1 text-sm text-k-text-secondary">{message}</p>}
    </div>
  );
}

export function TruncatedText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`block truncate ${className}`}>{text}</span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-k-border bg-k-surface">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-k-elevated text-left">{children}</thead>;
}

export function TH(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className="sticky top-0 z-10 border-b border-k-border bg-k-elevated px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-k-text-tertiary"
      {...props}
    />
  );
}

export function TR(props: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className="transition-colors hover:bg-k-elevated/60 focus-within:bg-k-elevated/60"
      {...props}
    />
  );
}

export function TD(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className="border-b border-k-border px-3 py-2 text-sm tabular-nums text-k-text-secondary" {...props} />;
}
