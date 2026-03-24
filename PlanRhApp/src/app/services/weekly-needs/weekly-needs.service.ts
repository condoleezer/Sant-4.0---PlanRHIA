import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

export interface WeeklyNeed {
  _id?: string;
  pole_id: string;
  service_id?: string;
  day_of_week: number; // 0=Dimanche, 1=Lundi, ..., 6=Samedi
  needs: {
    J02?: number;
    J1?: number;
    JB?: number;
  };
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WeeklyNeedsCreate {
  pole_id: string;
  service_id?: string;
  day_of_week: number;
  needs: {
    J02?: number;
    J1?: number;
    JB?: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WeeklyNeedsService {
  private apiUrl = `${environment.apiUrl}/weekly-needs`;

  constructor(private http: HttpClient) { }

  getWeeklyNeeds(serviceId: string, specialityId?: string): Observable<WeeklyNeed[]> {
    let url = `${this.apiUrl}/${serviceId}`;
    if (specialityId) url += `?speciality_id=${specialityId}`;
    return this.http.get<WeeklyNeed[]>(url);
  }

  createOrUpdateWeeklyNeed(need: WeeklyNeedsCreate, createdBy: string = 'system'): Observable<WeeklyNeed> {
    return this.http.post<WeeklyNeed>(this.apiUrl, { ...need, created_by: createdBy });
  }

  deleteWeeklyNeed(needId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${needId}`);
  }

  getDailyOverrides(poleId: string): Observable<{date: string, needs: {J02?: number, J1?: number, JB?: number}}[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/daily-needs-override/${poleId}`);
  }
}















