import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

export interface CompatibleAgent {
  _id: string;
  first_name: string;
  last_name: string;
  matricule: string;
  email: string;
  available_dates: {
    date: string;
    activity_code: string;
    plage_horaire: string;
    planning_id: string;
  }[];
  charte_ok?: boolean;
  charte_warnings?: string[];
  charte_violations?: string[];
}

export interface PlanningExchange {
  _id: string;
  requester_id: string;
  target_id: string;
  requester_date: string;
  target_date: string;
  requester_planning_id: string;
  target_planning_id: string;
  message?: string;
  status: 'en_attente' | 'accepté' | 'refusé' | 'validé_auto' | 'validé_cadre' | 'refusé_cadre';
  created_at: string;
  updated_at?: string;
  requester_name?: string;
  target_name?: string;
  requester_matricule?: string;
  target_matricule?: string;
  requester_activity_code?: string;
  target_activity_code?: string;
  requester_plage_horaire?: string;
  target_plage_horaire?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlanningExchangeService {
  private apiUrl = `${environment.apiUrl}/planning-exchanges`;

  constructor(private http: HttpClient) {}

  /**
   * Récupère les agents compatibles pour un échange
   */
  getCompatibleAgents(userId: string, date: string): Observable<any> {
    const params = new HttpParams()
      .set('user_id', userId)
      .set('date', date);
    
    return this.http.get(`${this.apiUrl}/compatible-agents`, { params });
  }

  /**
   * Vérifie si un agent a atteint son quota d'heures supplémentaires
   */
  checkOvertimeQuota(userId: string): Observable<any> {
    const params = new HttpParams().set('user_id', userId);
    return this.http.get(`${this.apiUrl}/check-overtime-quota`, { params });
  }

  /**
   * Récupère les jours de repos de A où B travaille (dates valides pour récupération)
   */
  getMyRestDays(userId: string, targetId?: string): Observable<any> {
    let params = new HttpParams().set('user_id', userId);
    if (targetId) params = params.set('target_id', targetId);
    return this.http.get(`${this.apiUrl}/my-rest-days`, { params });
  }

  /**
   * Crée une demande d'échange de planning
   */
  createExchangeRequest(exchangeData: {
    requester_id: string;
    target_id: string;
    requester_date: string;
    target_date: string;
    requester_planning_id: string;
    target_planning_id: string;
    message?: string;
    proposed_recovery_dates?: { planning_id: string; date: string; activity_code: string; plage_horaire: string }[];
  }): Observable<any> {
    return this.http.post(this.apiUrl, exchangeData);
  }

  /**
   * Récupère les demandes d'échange pour un utilisateur
   */
  getExchanges(userId?: string, status?: string): Observable<any> {
    let params = new HttpParams();
    
    if (userId) {
      params = params.set('user_id', userId);
    }
    
    if (status) {
      params = params.set('status', status);
    }
    
    return this.http.get(this.apiUrl, { params });
  }

  /**
   * Répond à une demande d'échange (accepter ou refuser)
   * recovery_date : date optionnelle choisie par B pour récupérer ses heures dans le planning de A
   */
  respondToExchange(exchangeId: string, response: 'accepté' | 'refusé', message?: string, recoveryDate?: string, targetPlanningId?: string, bPlanningId?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${exchangeId}/respond`, {
      exchange_id: exchangeId,
      response,
      message,
      recovery_date: recoveryDate || null,
      target_planning_id: targetPlanningId || null,
      b_planning_id: bPlanningId || null
    });
  }

  /**
   * Récupère les plannings disponibles de l'agent demandeur (A)
   * pour que B puisse choisir une date de récupération
   */
  getRequesterPlannings(exchangeId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${exchangeId}/requester-plannings`);
  }

  /**
   * Valide ou refuse un échange (cadre uniquement)
   */
  validateExchange(exchangeId: string, status: 'validé_cadre' | 'refusé_cadre', cadreId: string, commentaire?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${exchangeId}/validate`, {
      exchange_id: exchangeId,
      status,
      cadre_id: cadreId,
      commentaire
    });
  }

  /**
   * Récupère les échanges en attente de validation par le cadre
   */
  getPendingValidationExchanges(serviceId?: string): Observable<any> {
    let params = new HttpParams();
    
    if (serviceId) {
      params = params.set('service_id', serviceId);
    }
    
    return this.http.get(`${this.apiUrl}/pending-validation`, { params });
  }
}
