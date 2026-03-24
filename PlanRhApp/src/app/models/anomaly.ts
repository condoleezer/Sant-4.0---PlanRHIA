export interface Anomaly {
  _id?: string;
  title: string;
  description: string;
  type: 'overtime' | 'unjustified_absence' | 'schedule_conflict' | 'understaffing' | 'overstaffing' | 'contract_anomaly' | 'rule_violation';
  severity: 'info' | 'minor' | 'major' | 'critical';
  status: 'detected' | 'in_progress' | 'resolved' | 'escalated' | 'dismissed';
  user_id: string;
  user_name?: string;
  service_id?: string;
  service_name?: string;
  detected_at: string;
  updated_at?: string;
  resolved_at?: string;
  resolved_by?: string;
  comment?: string;
  metadata?: any;
}