import type { Token } from '../lib/database.types';
import { getServiceConfig } from '../lib/database.types';
import StatusBadge from './StatusBadge';
import { Clock, Hash, Briefcase } from 'lucide-react';

interface TokenCardProps {
  token: Token;
  showService?: boolean;
  showTimestamps?: boolean;
  compact?: boolean;
  children?: React.ReactNode;
}

export default function TokenCard({
  token,
  showService = true,
  showTimestamps = false,
  compact = false,
  children,
}: TokenCardProps) {
  const service = getServiceConfig(token.service_type);

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between py-3 px-4 bg-white rounded-lg border border-slate-200 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-slate-900 font-mono">
            {token.token_number}
          </span>
          {showService && (
            <span className="text-sm text-slate-500">{service.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={token.status} size="sm" />
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm animate-fade-in hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-slate-400" />
            <span className="text-2xl font-bold text-slate-900 font-mono tracking-wide">
              {token.token_number}
            </span>
          </div>
          {showService && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Briefcase className="w-3.5 h-3.5" />
              {service.name}
            </div>
          )}
        </div>
        <StatusBadge
          status={token.status}
          pulse={token.status === 'called' || token.status === 'serving'}
        />
      </div>

      {showTimestamps && (
        <div className="flex flex-wrap gap-4 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Created: {formatTime(token.created_at)}
          </span>
          {token.called_at && (
            <span>Called: {formatTime(token.called_at)}</span>
          )}
          {token.completed_at && (
            <span>Done: {formatTime(token.completed_at)}</span>
          )}
        </div>
      )}

      {children && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}
