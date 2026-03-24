import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

/**
 * Interface pour un remplacement temporaire par un vacataire
 */
export interface Replacement {
  _id?: string;
  absence_id: string; // ID de l'absence remplacée
  vacataire_id: string; // ID du vacataire (user avec role='vacataire')
  start_date: string; // Date de début du remplacement (YYYY-MM-DD)
  end_date: string; // Date de fin du remplacement (YYYY-MM-DD)
  service_id: string; // Service où le remplacement a lieu
  created_at?: string;
  updated_at?: string;
}

/**
 * Interface pour créer un remplacement
 */
export interface CreateReplacementRequest {
  absence_id: string;
  vacataire_id: string;
  start_date: string;
  end_date: string;
  service_id: string;
}

/**
 * Service pour gérer les remplacements temporaires par des vacataires
 */
@Injectable({
  providedIn: 'root'
})
export class ReplacementService {
  private apiUrl = `${environment.apiUrl}/replacements`;

  constructor(private http: HttpClient) {}

  /**
   * Créer un remplacement temporaire
   * Cela crée automatiquement les plannings pour le vacataire pendant la période
   */
  createReplacement(replacement: CreateReplacementRequest): Observable<any> {
    return this.http.post(this.apiUrl, replacement);
  }

  /**
   * Récupérer tous les remplacements actifs pour un service
   */
  getActiveReplacementsByService(serviceId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/service/${serviceId}/active`);
  }

  /**
   * Récupérer les remplacements pour un vacataire
   */
  getReplacementsByVacataire(vacataireId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/vacataire/${vacataireId}`);
  }

  /**
   * Récupérer le remplacement pour une absence
   */
  getReplacementByAbsence(absenceId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/absence/${absenceId}`);
  }

  /**
   * Mettre à jour un remplacement
   */
  updateReplacement(replacementId: string, replacement: Partial<Replacement>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${replacementId}`, replacement);
  }

  /**
   * Supprimer un remplacement (met fin au remplacement)
   */
  deleteReplacement(replacementId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${replacementId}`);
  }
}


