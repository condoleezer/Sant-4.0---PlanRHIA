import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environment/environment';
import { Response } from '../../dtos/response/Response';

export interface WorkDay {
  day: string;
  start_time: string;
  end_time: string;
}

export interface Contrat {
    id?: string;
    user_id: string;
    contrat_type: string;
    working_period: string;
    start_time: string;
    contrat_hour_week: string;
    contrat_hour_day: string;
    work_days: WorkDay[];
}

@Injectable({
  providedIn: 'root'
})
export class ContratService {
  private apiUrl = environment.apiUrl + '/contrats';

  constructor(private http: HttpClient) {}

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Une erreur est survenue';
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Erreur: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Code: ${error.status}, Message: ${error.error?.detail || error.message}`;
    }
    return throwError(() => new Error(errorMessage));
  }

  createContrat(contrat: Contrat): Observable<Response<any>> {
    return this.http.post<Response<any>>(`${this.apiUrl}/create`, contrat)
      .pipe(catchError(this.handleError));
  }

  updateContrat(contratId: string, contrat: Contrat): Observable<Response<any>> {
    return this.http.put<Response<any>>(`${this.apiUrl}/update/${contratId}`, contrat)
      .pipe(catchError(this.handleError));
  }

  getContratById(contratId: string): Observable<Response<Contrat>> {
    return this.http.get<Response<Contrat>>(`${this.apiUrl}/${contratId}`)
      .pipe(catchError(this.handleError));
  }

  getContratByUserId(userId: string): Observable<Response<Contrat> | null> {
    return this.http.get<Response<Contrat> | null>(`${this.apiUrl}/user/${userId}`)
      .pipe(catchError(this.handleError));
  }

  deleteContrat(contratId: string): Observable<Response<any>> {
    return this.http.delete<Response<any>>(`${this.apiUrl}/delete/${contratId}`)
      .pipe(catchError(this.handleError));
  }
}