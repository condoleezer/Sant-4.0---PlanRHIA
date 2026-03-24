import { Injectable } from '@angular/core';
import { environment } from '../../environment/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from '../../dtos/response/Response';
import { CreateAbsenceRequest } from '../../dtos/request/CreateAbsenceRequest';
import { Absence } from '../../models/absence';

@Injectable({
  providedIn: 'root'
})
export class AbsenceService {
  apiUrl = environment.apiUrl + '/absences';

  constructor(private http: HttpClient) {}

  findAllAbsences(): Observable<Response<Absence[]>> {
    return this.http.get<Response<Absence[]>>(`${this.apiUrl}`);
  }

  findAbsenceById(absenceId: string): Observable<Response<Absence>> {
    return this.http.get<Response<Absence>>(`${this.apiUrl}/${absenceId}`);
  }

  createAbsence(createAbsenceRequest: CreateAbsenceRequest): Observable<Response<Absence>> {
    return this.http.post<Response<Absence>>(`${this.apiUrl}/create`, createAbsenceRequest);
  }

  deleteAbsence(absenceId: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/delete/${absenceId}`);
  }

  assignReplacement(absenceId: string, replacementId: string): Observable<Response<Absence>> {
    return this.http.post<Response<Absence>>(`${this.apiUrl}/replace/${absenceId}`, { replacement_id: replacementId });
  }

  /*updateAbsence(absenceId: string, updateData: { status?: string, replacement_id?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/absences/update/${absenceId}`, updateData);
  }*/

  // Dans absence.service.ts
  updateAbsence(absenceId: string, status: string, replacementId: string | null): Observable<any> {
    const updateData: { status: string; replacement_id?: string } = { status };
    if (replacementId) {
      updateData.replacement_id = replacementId;
    }
    return this.http.put(`${this.apiUrl}/update/${absenceId}`, updateData);
  }
  
  findAbsencesByReplacementId(replacementId: string): Observable<Response<Absence[]>> {
    return this.http.get<Response<Absence[]>>(`${this.apiUrl}/replacement/${replacementId}`);
  }
  
  findAbsencesByStaffId(staffId: string): Observable<Response<Absence[]>> {
    return this.http.get<Response<Absence[]>>(`${this.apiUrl}/staff/${staffId}`);
  }
}