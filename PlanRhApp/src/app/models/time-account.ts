/**
 * Modèles pour les comptes de temps et synthèse des droits
 */

export interface TimeAccount {
  id: string;
  user_id: string;
  reference_date: string; // Format: YYYY-MM-DD
  year: number;
  chs_days: number; // Compte Heures Supplémentaires
  cfr_days: number; // Compte Fériés/Récupérations
  ca_days: number; // Congés Annuels
  rtt_days: number; // Réduction du Temps de Travail
  cet_days: number; // Compte Épargne Temps
  calculated_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AnnualLeaveRights {
  total_days: number; // 25 jours ouvrés/an
  remaining_before_may15: number;
  remaining_before_dec31: number;
  taken_days: number;
  carryover_days: number; // Max 5 jours
}

export interface RTTRights {
  total_days: number;
  remaining_days: number;
  taken_days: number;
  cumulated_days: number; // Max 5/an
}

export interface LocalExceptionalDays {
  jm_days: number; // 1 jour si ≥6 mois présence
  jfo_days: number; // 1 jour si présence en septembre
}

export interface CompensatoryRest {
  total_days: number; // Si ≥20 dimanches/fériés travaillés
  remaining_days: number;
  taken_days: number;
}

export interface LeaveRights {
  annual_leave: AnnualLeaveRights;
  rtt: RTTRights;
  local_exceptional_days: LocalExceptionalDays;
  compensatory_rest: CompensatoryRest;
}

export interface LeaveRightsSummary {
  id: string;
  user_id: string;
  reference_date: string; // Format: YYYY-MM-DD
  year: number;
  rights: LeaveRights;
  calculated_at?: string;
  created_at?: string;
  updated_at?: string;
}

