import type { TokenStatus } from '../lib/database.types';

const STATUS_STYLES: Record<TokenStatus, { bg: string; text: string; label: string }> = {
  waiting: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Waiting' },
  called: { bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700', label: 'Called' },
  serving: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Serving' },
  completed: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Completed' },
  skipped: { bg: 'bg-slate-100 border-slate-300', text: 'text-slate-600', label: 'Skipped' },
  cancelled: { bg: 'bg-red-50 border-red-200', text: 'text-red-600', label: 'Cancelled' },
};

interface StatusBadgeProps {
  status: TokenStatus;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

export default function StatusBadge({ status, size = 'md', pulse = false }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.waiting;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${style.bg} ${style.text} ${sizeClasses[size]} ${
        pulse ? 'animate-pulse-gentle' : ''
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'waiting' ? 'bg-amber-500' :
          status === 'called' ? 'bg-violet-500' :
          status === 'serving' ? 'bg-blue-500' :
          status === 'completed' ? 'bg-emerald-500' :
          status === 'skipped' ? 'bg-slate-400' :
          'bg-red-500'
        }`}
      />
      {style.label}
    </span>
  );
}
