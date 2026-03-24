export interface CreateServiceRequest {
  name: string
  head: string
  created_at?: string;
  updated_at?: string;
  matricule?: string;
}

export interface CreateCodeRequest {
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

export interface CreateSpecialityRequest {
  name: string;
  created_at?: string;
  updated_at?: string;
  matricule?: string;
}

export interface CreatePoleRequest {
  name: string;
  head? : string;
  created_at?: string;
  updated_at?: string;
  matricule?: string;
  specialities: string[];
}