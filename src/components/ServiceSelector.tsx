import { SERVICES, type ServiceType, type ServiceConfig } from '../lib/database.types';
import {
  FileText, IndianRupee, ClipboardList, ShieldCheck, HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  FileText,
  IndianRupee,
  ClipboardList,
  ShieldCheck,
  HelpCircle,
};

interface ServiceSelectorProps {
  selectedService: ServiceType | null;
  onSelect: (service: ServiceType) => void;
  disabled?: boolean;
}

export default function ServiceSelector({ selectedService, onSelect, disabled }: ServiceSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {SERVICES.map((service) => {
        const Icon = ICON_MAP[service.icon] || HelpCircle;
        const isSelected = selectedService === service.id;

        return (
          <button
            key={service.id}
            onClick={() => onSelect(service.id)}
            disabled={disabled}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
              isSelected
                ? 'border-blue-500 bg-blue-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-sm font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                {service.name}
              </p>
              <p className="text-xs text-slate-400">
                ~{service.estimatedDurationMinutes} min avg
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
