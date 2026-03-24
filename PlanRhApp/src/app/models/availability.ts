export interface Availability {
  _id?: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: 'proposé' | 'validé' | 'refusé';
  commentaire?: string;
  created_at?: string;
  updated_at?: string;
  user_name?: string;
  user_matricule?: string;
}

export interface AvailabilityUpdate {
  date?: string;
  start_time?: string;
  end_time?: string;
  status?: 'proposé' | 'validé' | 'refusé';
  commentaire?: string;
}








