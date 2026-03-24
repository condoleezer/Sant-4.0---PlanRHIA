export interface Alert {
  _id?: string;
  title: string;
  description: string;
  type: 'unjustified_absence' | 'overtime' | 'schedule_conflict' | 'insufficient_resources' | 'contract_anomaly';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'in_progress' | 'resolved' | 'escalated' | 'dismissed';
  user_id: string;
  user_name?: string;
  service_id?: string;
  service_name?: string;
  created_at: string;
  updated_at?: string;
  resolved_at?: string;
  resolved_by?: string;
  comment?: string;
  metadata?: any;
}