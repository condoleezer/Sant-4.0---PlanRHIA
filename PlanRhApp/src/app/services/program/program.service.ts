import { Injectable } from '@angular/core';
import {environment} from '../../environment/environment';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from '../../dtos/response/Response';
import {GetPlanByNameRequest} from '../../dtos/request/GetPlanByNameRequest';
import {Programs} from '../../models/programs';

@Injectable({
  providedIn: 'root'
})
export class ProgramService {

  apiUrl = environment.apiUrl + '/programs'
  constructor(private http: HttpClient) { }

  findAllPrograms(): Observable<Response<Programs[]>>{
    return this.http.get<Response<Programs[]>>(this.apiUrl);
  }

  findProgramById(ProgramId: string): Observable<Response<Programs[]>> {
    return this.http.get<Response<Programs[]>>(`${this.apiUrl}/${ProgramId}`)
  }

  findProgramByName(getPlanByNameRequest: GetPlanByNameRequest): Observable<Response<Programs>> {
    return this.http.post<Response<Programs>>(`${this.apiUrl}/name`, getPlanByNameRequest)
  }
}
