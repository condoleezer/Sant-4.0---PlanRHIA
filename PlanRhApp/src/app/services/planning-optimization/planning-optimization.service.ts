import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';

export interface OptimizationRequest {
  start_date: string; // YYYY-MM-DD
  num_weeks: number; // 8 par défaut
  pole_id: string;
}

export interface PlanningAssignment {
  date: string;
  employee_id: string;
  employee_name: string;
  shift: string;
  hours: number;
  start_time: string;
  end_time: string;
  constraintsSatisfied: boolean;
}

export interface OptimizationStatistics {
  total_assignments: number;
  total_hours_by_employee: { [employeeId: string]: number };
  equity_scores: {
    [shift: string]: {
      max: number;
      min: number;
      diff: number;
    };
  };
  weekend_equity: {
    max: number;
    min: number;
    diff: number;
  };
  solver_time: number;
}

export interface OptimizationResponse {
  success: boolean;
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE';
  planning: PlanningAssignment[];
  statistics?: OptimizationStatistics;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlanningOptimizationService {
  private apiUrl = `${environment.apiUrl}/planning/optimize`;

  constructor(private http: HttpClient) { }

  optimizePlanning(request: OptimizationRequest): Observable<OptimizationResponse> {
    return this.http.post<OptimizationResponse>(this.apiUrl, request);
  }
}















