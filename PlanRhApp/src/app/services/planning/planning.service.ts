import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

@Injectable({
  providedIn: 'root'
})
export class PlanningService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Récupère les prochains congés/repos de l'agent depuis son planning réel
   */
  getUpcomingLeaves(userId: string, limit: number = 5): Observable<any> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get(`${this.apiUrl}/plannings/upcoming-leaves/${userId}`, { params });
  }

  /**
   * Récupère les plannings d'un utilisateur
   */
  getPlanningsByUser(userId: string): Observable<any> {
    const params = new HttpParams().set('user_id', userId);
    return this.http.get(`${this.apiUrl}/plannings`, { params });
  }

  /**
   * Récupère les plannings d'un service (avec plage de dates optionnelle)
   */
  getPlanningsByService(serviceId: string, dateRange?: string): Observable<any> {
    let params = new HttpParams().set('service_id', serviceId);
    if (dateRange) params = params.set('date', dateRange);
    return this.http.get(`${this.apiUrl}/plannings`, { params });
  }

  /**
   * Crée un planning
   */
  createPlanning(data: {
    user_id: string;
    date: string;
    activity_code: string;
    plage_horaire?: string;
    commentaire?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/plannings`, {
      user_id: data.user_id,
      date: data.date,
      activity_code: data.activity_code,
      plage_horaire: data.plage_horaire || '08:00-17:00',
      commentaire: data.commentaire || ''
    });
  }

  /**
   * L'agent soumet une demande de modification de planning (status = en_attente)
   */
  agentPlanningRequest(data: {
    user_id: string;
    date: string;
    activity_code: string;
    plage_horaire?: string;
    commentaire?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/plannings/agent-request`, {
      user_id: data.user_id,
      date: data.date,
      activity_code: data.activity_code,
      plage_horaire: data.plage_horaire || '08:00-17:00',
      commentaire: data.commentaire || ''
    });
  }

  /**
   * Le cadre valide ou refuse une demande de modification
   */
  validatePlanningRequest(planningId: string, status: 'validé' | 'refusé', cadreId?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/plannings/${planningId}/validate-request`, {
      status,
      cadre_id: cadreId
    });
  }

  /**
   * Récupère les demandes en attente pour un service
   */
  getPendingRequests(serviceId: string): Observable<any> {
    const params = new HttpParams().set('service_id', serviceId);
    return this.http.get(`${this.apiUrl}/plannings/pending-requests`, { params });
  }
}
