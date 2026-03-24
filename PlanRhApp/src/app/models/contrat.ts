export interface WorkDay {
    day: string;
    start_time: string;
    end_time: string;
}
  
export interface Contrat {
    id?: string;
    user_id: string;
    contrat_type: string;
    working_period: string;
    start_time: string;
    contrat_hour_week: string;
    contrat_hour_day: string;
    work_days?: WorkDay[];
}