import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

export interface ReciprocityEntry {
  id: string;
  exchange_id: string;
  creditor_id: string;
  creditor_name?: string;
  debtor_id: string;
  debtor_name?: string;
  hours_owed: number;
  hours_repaid: number;
  hours_remaining: number;
  status: 'pending' | 'partially_repaid' | 'repaid' | 'expired';
  expires_at: string;
  expiring_soon?: boolean;
  repayment_exchanges: { exchange_id: string; hours_repaid: number; date: string }[];
  created_at?: string;
}

export interface UserReciprocities {
  debts: ReciprocityEntry[];      // ce que l'agent doit
  credits: ReciprocityEntry[];    // ce que l'agent doit recevoir
  total_hours_owed: number;
  total_hours_due: number;
}

@Injectable({ providedIn: 'root' })
export class ExchangeReciprocityService {
  private api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Jours de repos du débiteur disponibles pour récupération */
  getDebtorRestDays(reciprocityId: string): Observable<{ data: { date: string; activity_code: string; planning_id: string }[]; expires_at: string }> {
    return this.http.get<any>(`${this.api}/exchange-reciprocity/${reciprocityId}/debtor-rest-days`);
  }

  /** Réciprocités d'un agent (dettes + créances) */
  getUserReciprocities(userId: string): Observable<{ data: UserReciprocities }> {
    return this.http.get<{ data: UserReciprocities }>(
      `${this.api}/exchange-reciprocity/user/${userId}`
    );
  }

  /** Vérifie si debtorId a une dette envers creditorId */
  checkReciprocity(debtorId: string, creditorId: string): Observable<{
    has_debt: boolean;
    hours_remaining?: number;
    reciprocity_id?: string;
    expires_at?: string;
  }> {
    const params = new HttpParams()
      .set('debtor_id', debtorId)
      .set('creditor_id', creditorId);
    return this.http.get<any>(`${this.api}/exchange-reciprocity/check`, { params });
  }

  /** Enregistre un remboursement */
  repayReciprocity(reciprocityId: string, exchangeId: string, hoursRepaid: number): Observable<any> {
    const params = new HttpParams()
      .set('exchange_id', exchangeId)
      .set('hours_repaid', hoursRepaid.toString());
    return this.http.post<any>(
      `${this.api}/exchange-reciprocity/${reciprocityId}/repay`,
      {},
      { params }
    );
  }

  /** Vue cadre : toutes les réciprocités du service */
  getServiceReciprocities(serviceId: string): Observable<{ data: ReciprocityEntry[]; count: number }> {
    return this.http.get<any>(`${this.api}/exchange-reciprocity/service/${serviceId}`);
  }
}
