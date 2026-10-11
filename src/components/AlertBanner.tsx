import { AlertCircle, CheckCircle, XCircle, Info } from 'lucide-react';

type AlertType = 'error' | 'success' | 'warning' | 'info';

interface AlertBannerProps {
  type: AlertType;
  message: string;
  onDismiss?: () => void;
}

const ALERT_STYLES: Record<AlertType, { bg: string; border: string; text: string; icon: typeof AlertCircle }> = {
  error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: CheckCircle },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: AlertCircle },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: Info },
};

export default function AlertBanner({ type, message, onDismiss }: AlertBannerProps) {
  const style = ALERT_STYLES[type];
  const Icon = style.icon;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${style.bg} ${style.border} ${style.text} animate-fade-in`}
      role="alert"
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <p className="text-sm font-medium flex-1">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-current opacity-60 hover:opacity-100 transition-opacity p-1"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
