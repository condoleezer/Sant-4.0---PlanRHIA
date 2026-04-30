import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environment/environment';
import { TimeAccount, LeaveRightsSummary } from '../../models/time-account';

@Injectable({
  providedIn: 'root'
})
export class TimeAccountService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Récupère les comptes de temps d'un utilisateur
   * @param userId ID de l'utilisateur
   * @param referenceDate Date de référence (optionnelle, défaut: date du jour)
   * @returns Observable<TimeAccount>
   */
  getTimeAccounts(userId: string, referenceDate?: string): Observable<TimeAccount> {
    let params = new HttpParams();
    if (referenceDate) {
      params = params.set('reference_date', referenceDate);
    }

    return this.http.get<any>(`${this.apiUrl}/time-accounts/user/${userId}`, { params })
      .pipe(
        map(response => response.data || response), // Gérer le format {message, data}
        catchError(this.handleError)
      );
  }

  /**
   * Calcule et sauvegarde les comptes de temps d'un utilisateur
   * @param userId ID de l'utilisateur
   * @param referenceDate Date de référence (optionnelle, défaut: date du jour)
   * @returns Observable<TimeAccount>
   */
  calculateTimeAccounts(userId: string, referenceDate?: string): Observable<TimeAccount> {
    let params = new HttpParams();
    if (referenceDate) {
      params = params.set('reference_date', referenceDate);
    }

    return this.http.post<any>(`${this.apiUrl}/time-accounts/calculate/${userId}`, {}, { params })
      .pipe(
        map(response => response.data || response), // Gérer le format {message, data}
        catchError(this.handleError)
      );
  }

  /**
   * Récupère la synthèse des droits d'un utilisateur
   * @param userId ID de l'utilisateur
   * @param referenceDate Date de référence (optionnelle, défaut: date du jour)
   * @returns Observable<LeaveRightsSummary>
   */
  getLeaveRightsSummary(userId: string, referenceDate?: string): Observable<LeaveRightsSummary> {
    let params = new HttpParams();
    if (referenceDate) {
      params = params.set('reference_date', referenceDate);
    }

    return this.http.get<any>(`${this.apiUrl}/leave-rights/user/${userId}`, { params })
      .pipe(
        map(response => response.data || response), // Gérer le format {message, data}
        catchError(this.handleError)
      );
  }

  /**
   * Calcule et sauvegarde la synthèse des droits d'un utilisateur
   * @param userId ID de l'utilisateur
   * @param referenceDate Date de référence (optionnelle, défaut: date du jour)
   * @returns Observable<LeaveRightsSummary>
   */
  calculateLeaveRights(userId: string, referenceDate?: string): Observable<LeaveRightsSummary> {
    let params = new HttpParams();
    if (referenceDate) {
      params = params.set('reference_date', referenceDate);
    }

    return this.http.post<any>(`${this.apiUrl}/leave-rights/calculate/${userId}`, {}, { params })
      .pipe(
        map(response => response.data || response),
        catchError(this.handleError)
      );
  }

  getHourlyBalance(userId: string, year?: number, referenceDate?: string): Observable<any> {
    let params = new HttpParams();
    if (year) params = params.set('year', year.toString());
    if (referenceDate) params = params.set('reference_date', referenceDate);
    return this.http.get<any>(`${this.apiUrl}/time-accounts/balance/${userId}`, { params })
      .pipe(map(r => r.data || r), catchError(this.handleError));
  }

  private handleError(error: any): Observable<never> {
    console.error('Erreur dans TimeAccountService:', error);
    return throwError(() => error);
  }
}

