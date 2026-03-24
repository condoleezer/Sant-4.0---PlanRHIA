export interface PendingEvent {
  id: string;
  title: string;
  description: string;
  type: 'approval' | 'notification' | 'reminder' | 'deadline';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  due_date?: string;
  created_at: string;
  completed_at?: string;
  user_id?: string;
  service_id?: string;
  related_entity_type?: 'absence' | 'ask' | 'user' | 'service';
  related_entity_id?: string;
  metadata?: any;
}

