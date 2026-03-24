import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';
import { Availability, AvailabilityUpdate } from '../../models/availability';

@Injectable({
  providedIn: 'root'
})
export class AvailabilityService {
  private apiUrl = `${environment.apiUrl}/availabilities`;

  constructor(private http: HttpClient) {}

  // Endpoints spécifiques selon les rôles - Tâche 1.1.2
  proposeAvailability(availability: Availability): Observable<any> {
    return this.http.post(this.apiUrl, availability);
  }

  getAvailabilitiesByUser(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/me?user_id=${userId}`);
  }

  getAvailabilitiesByServiceAndStatus(serviceId: string, status: string): Observable<any> {
    return this.http.get(`${this.apiUrl}?service_id=${serviceId}&status=${status}`);
  }

  updateAvailability(id: string, availability: AvailabilityUpdate): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, availability);
  }

  // Endpoints utilitaires (pour admin/testing)
  getAllAvailabilities(): Observable<any> {
    return this.http.get(`${this.apiUrl}/all`);
  }

  getAvailabilityById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/id/${id}`);
  }

  deleteAvailability(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}








