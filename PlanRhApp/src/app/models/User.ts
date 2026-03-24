export interface User {
  _id: string
  id?: string;
  email: string,
  first_name: string,
  last_name: string,
  phoneNumber: number | string,
  role: string;
  competence?: string;
  service?: string;
  service_id?: string;
  speciality_id?: string,
  specialityName?: string;
  serviceName?: string;
  password?: string;
  created_at?: string;
  updated_at?: string;
  matricule?: string;
}
