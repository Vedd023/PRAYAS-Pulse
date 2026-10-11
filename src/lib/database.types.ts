/**
 * Database type definitions for Supabase.
 * These types correspond to the tables in the PostgreSQL database.
 */

export type TokenStatus = 'waiting' | 'called' | 'serving' | 'completed' | 'skipped' | 'cancelled';

export type ServiceType = 'bonafide' | 'fee_query' | 'examination' | 'document_verification' | 'other';

export interface ServiceConfig {
  id: ServiceType;
  name: string;
  prefix: string;
  estimatedDurationMinutes: number;
  icon: string;
}

export const SERVICES: ServiceConfig[] = [
  { id: 'bonafide', name: 'Bonafide Certificate', prefix: 'B', estimatedDurationMinutes: 4, icon: 'FileText' },
  { id: 'fee_query', name: 'Fee Query', prefix: 'F', estimatedDurationMinutes: 5, icon: 'IndianRupee' },
  { id: 'examination', name: 'Examination Form', prefix: 'E', estimatedDurationMinutes: 6, icon: 'ClipboardList' },
  { id: 'document_verification', name: 'Document Verification', prefix: 'D', estimatedDurationMinutes: 3, icon: 'ShieldCheck' },
  { id: 'other', name: 'Other Services', prefix: 'O', estimatedDurationMinutes: 5, icon: 'HelpCircle' },
];

export function getServiceConfig(serviceType: ServiceType): ServiceConfig {
  return SERVICES.find(s => s.id === serviceType) ?? SERVICES[SERVICES.length - 1];
}

export interface Token {
  id: string;
  token_number: string;
  service_type: ServiceType;
  status: TokenStatus;
  counter_number: number | null;
  created_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  session_id: string | null;
}

/**
 * Allowed status transitions. Each key maps to the set of statuses it can transition to.
 */
export const ALLOWED_TRANSITIONS: Record<TokenStatus, TokenStatus[]> = {
  waiting: ['called', 'cancelled'],
  called: ['serving', 'skipped', 'cancelled'],
  serving: ['completed', 'skipped'],
  completed: [],
  skipped: ['waiting'],   // skipped tokens can be re-queued
  cancelled: [],
};

export function isValidTransition(from: TokenStatus, to: TokenStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface Database {
  public: {
    Tables: {
      tokens: {
        Row: Token;
        Insert: Omit<Token, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Token>;
      };
      daily_counters: {
        Row: {
          id: string;
          service_type: ServiceType;
          date: string;
          last_number: number;
        };
        Insert: {
          service_type: ServiceType;
          date: string;
          last_number: number;
        };
        Update: Partial<{
          last_number: number;
        }>;
      };
    };
    Functions: {
      generate_token: {
        Args: { p_service_type: ServiceType; p_session_id: string };
        Returns: Token;
      };
      call_next_token: {
        Args: { p_service_type: ServiceType | null; p_counter: number };
        Returns: Token | null;
      };
      update_token_status: {
        Args: { p_token_id: string; p_new_status: TokenStatus };
        Returns: Token;
      };
    };
  };
}

export type PressureLevel = 'normal' | 'watch' | 'congested' | 'unknown';
