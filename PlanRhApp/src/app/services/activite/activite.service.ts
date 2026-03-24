import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

export interface Activite {
  _id?: string;
  code: string;
  libelle: string;
  heureDebut: string;
  heureFin: string;
  service_id: string;
}

@Injectable({
  providedIn: 'root'
})
export class ActiviteService {
  private apiUrl = `${environment.apiUrl}/activites`;

  constructor(private http: HttpClient) { }

  // Récupérer toutes les activités pour le service
  getActivites(): Observable<Activite[]> {
    return this.http.get<Activite[]>(this.apiUrl);
  }

  // Ajouter une nouvelle activité
  addActivite(activite: Activite): Observable<Activite> {
    return this.http.post<Activite>(this.apiUrl, activite);
  }

  // Mettre à jour une activité
  updateActivite(id: string, activite: Activite): Observable<Activite> {
    return this.http.put<Activite>(`${this.apiUrl}/${id}`, activite);
  }

  // Supprimer une activité
  deleteActivite(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
