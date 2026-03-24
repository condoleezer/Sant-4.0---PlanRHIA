export interface Event {
  _id?: string;
  title: string;
  description: string;
  type: 'meeting' | 'training' | 'maintenance' | 'emergency' | 'other';
  start_date: string;
  end_date: string;
  user_id?: string;
  user_name?: string;
  service_id?: string;
  service_name?: string;
  location?: string;
  attendees?: string[];
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at?: string;
  metadata?: any;
}














