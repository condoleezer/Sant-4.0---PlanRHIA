export interface CreateUserRequest {
  first_name: string
  last_name: string
  phoneNumber : number | string
  email: string
  password: string
  role : string
  service_id?: string,
  speciality_id?: string,
  created_at?: string;
  updated_at?: string;
  matricule?: string;
}
