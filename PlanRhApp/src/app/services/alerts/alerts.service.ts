import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

@Injectable({
  providedIn: 'root'
})
export class AlertsService {
  private apiUrl = `${environment.apiUrl}/alerts`;

  constructor(private http: HttpClient) {}

  getAllAlerts(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  getAlertsByUser(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/user/${userId}`);
  }

  getAlertsByService(serviceId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/service/${serviceId}`);
  }

  getAlertById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  createAlert(alert: any): Observable<any> {
    return this.http.post(this.apiUrl, alert);
  }

  updateAlert(id: string, alert: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}`, alert);
  }

  deleteAlert(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}