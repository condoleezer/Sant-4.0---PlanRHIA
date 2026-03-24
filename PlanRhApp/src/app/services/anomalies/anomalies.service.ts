import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

@Injectable({
  providedIn: 'root'
})
export class AnomaliesService {
  private apiUrl = `${environment.apiUrl}/anomalies`;

  constructor(private http: HttpClient) {}

  getAllAnomalies(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  getAnomaliesByUser(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/user/${userId}`);
  }

  getAnomaliesByService(serviceId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/service/${serviceId}`);
  }

  getAnomalyById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  createAnomaly(anomaly: any): Observable<any> {
    return this.http.post(this.apiUrl, anomaly);
  }

  updateAnomaly(id: string, anomaly: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}`, anomaly);
  }

  deleteAnomaly(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}