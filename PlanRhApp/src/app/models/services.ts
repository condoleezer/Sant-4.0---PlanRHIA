export interface Service {
  id: string;
  name: string;
  head : string;
  created_at?: string;
  updated_at?: string;
  matricule?: string;
}

export interface Code {
  id: string;
  name: string;
  name_abrege? : string;
  regroupement? : string;
  indicator? : string;
  begin_date? : string;
  end_date? : string;
  created_at?: string;
  updated_at?: string;
  matricule?: string;
}

export interface Speciality {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  matricule?: string;
}

export interface Pole {
  id: string;
  name: string;
  head? : string;
  created_at?: string;
  updated_at?: string;
  matricule?: string;
  specialities?:  Speciality[] | string[];
}
