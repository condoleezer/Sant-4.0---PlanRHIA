import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

export interface MonthlySummary {
  user_id: string;
  user_name: string;
  year: number;
  month: number;
  month_hours: number;
  monthly_threshold: number;
  overtime_month: number;
  rtt_suggested: number;
  alert: boolean;
  alert_message: string | null;
  year_hours: number;
  year_overtime: number;
  monthly_breakdown: MonthlyBreakdownItem[];
}

export interface MonthlyBreakdownItem {
  month: number;
  month_name: string;
  hours_worked: number;
  threshold: number;
  overtime_hours: number;
  deficit_hours: number;
  ca_taken: number;
  rtt_taken: number;
  rtt_suggested: number;
  alert: boolean;
  has_data: boolean;
  is_future: boolean;
}

export interface MonthlyCurrent {
  user_id: string;
  user_name: string;
  year: number;
  month: number;
  month_name: string;
  contract_label: string;
  monthly_threshold: number;
  prorata_threshold: number;
  days_elapsed: number;
  days_in_month: number;
  progress_pct: number;
  hours_worked: number;
  overtime_hours: number;
  ca_taken: number;
  rtt_taken: number;
  rtt_suggested: number;
  alert: boolean;
  alert_message: string | null;
}

export interface MyRttSummary {
  user_id: string;
  user_name: string;
  year: number;
  months_shown: number;
  // Obligations
  annual_obligation: number;
  prorata_obligation: number;
  monthly_threshold: number;
  monthly_overtime_alert_threshold: number;
  contract_label: string;
  qj: number;
  // Heures
  year_hours: number;
  total_overtime: number;
  // RTT
  total_rtt_suggested: number;
  rtt_taken: number;
  rtt_remaining_to_take: number;
  // CA
  ca_taken_ytd: number;
  // CHS
  chs_official: number;
  chs_exchange: number;
  chs_total_hours: number;
  // Alertes
  annual_alert: boolean;
  months_in_alert_count: number;
  // Détail
  monthly_breakdown: MonthlyBreakdownItem[];
}

export interface CaConflictCheck {
  has_conflict: boolean;
  colleagues_on_leave: { name: string; dates: string[] }[];
  count: number;
  warning: string | null;
}

@Injectable({ providedIn: 'root' })
export class AlertsRttService {
  private api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Synthèse mensuelle/annuelle d'un agent */
  getMonthlySummary(userId: string, year?: number, month?: number): Observable<MonthlySummary> {
    let params = new HttpParams();
    if (year) params = params.set('year', year.toString());
    if (month) params = params.set('month', month.toString());
    return this.http.get<MonthlySummary>(`${this.api}/alerts-rtt/monthly-summary/${userId}`, { params });
  }

  /** Déclenche la vérification et l'envoi de notification si dépassement */
  checkAndNotifyOvertime(userId: string): Observable<any> {
    return this.http.post<any>(`${this.api}/alerts-rtt/check-and-notify/${userId}`, {});
  }

  /** Synthèse de tous les agents d'un service (vue cadre) */
  getServiceSummary(serviceId: string, year?: number, month?: number): Observable<any> {
    let params = new HttpParams();
    if (year) params = params.set('year', year.toString());
    if (month) params = params.set('month', month.toString());
    return this.http.get<any>(`${this.api}/alerts-rtt/service-summary/${serviceId}`, { params });
  }

  /** Balance horaire du mois en cours (page Accueil) */
  getMonthlyBalance(userId: string): Observable<any> {
    return this.http.get<any>(`${this.api}/alerts-rtt/monthly-balance/${userId}`);
  }

  /** Synthèse du mois en cours pour l'agent (page Accueil) */
  getMonthlyCurrent(userId: string): Observable<MonthlyCurrent> {
    return this.http.get<MonthlyCurrent>(`${this.api}/alerts-rtt/monthly-current/${userId}`);
  }

  /** Synthèse RTT personnelle annuelle de l'agent connecté */
  getMyRttSummary(userId: string, year?: number): Observable<MyRttSummary> {
    let params = new HttpParams();
    if (year) params = params.set('year', year.toString());
    return this.http.get<MyRttSummary>(`${this.api}/alerts-rtt/my-rtt-summary/${userId}`, { params });
  }

  /** Vérifie les conflits CA avec les collègues */
  checkCaConflict(userId: string, serviceId: string, startDate: string, endDate: string): Observable<CaConflictCheck> {
    const params = new HttpParams()
      .set('user_id', userId)
      .set('service_id', serviceId)
      .set('start_date', startDate)
      .set('end_date', endDate);
    return this.http.get<CaConflictCheck>(`${this.api}/alerts-rtt/ca-conflict-check`, { params });
  }
}
