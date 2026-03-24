// Codes d'activité unifiés pour toute l'application
export type ActivityCode = 'RH' | 'CA' | 'J\'' | 'EX' | 'CSF' | 'F' | 'DISP' | 'SOIN' | 'CONGÉ' | 'REPOS' | 'FORMATION' | 'ADMINISTRATIF';

export interface Planning {
  _id?: string;
  user_id: string;
  date: string;
  activity_code: ActivityCode | string; // Codes unifiés: RH, CA, J', EX, CSF, F, DISP (et anciens codes pour compatibilité)
  plage_horaire: string;
  created_at?: string;
  updated_at?: string;
  validated_by?: string;
  commentaire?: string;
  user_name?: string;
  user_matricule?: string;
}

export interface PlanningUpdate {
  activity_code?: ActivityCode | string;
  plage_horaire?: string;
  commentaire?: string;
}








