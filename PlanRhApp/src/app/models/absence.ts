export interface Absence {
  _id?: string;
  id?: string;  // Added to support API response format
  staff_id: string;
  start_date: string;
  start_hour: string;
  end_date: string;
  end_hour: string;
  reason: string;
  comment: string;
  service_id?: string;
  replacement_id?: string;  // Made optional with ?
  absence_code_id?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  matricule?: string;
}
