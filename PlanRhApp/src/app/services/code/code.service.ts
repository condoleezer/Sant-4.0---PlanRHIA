import { Injectable } from '@angular/core';
import { environment } from '../../environment/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Response } from '../../dtos/response/Response';
import { Code } from '../../models/services';
import { CreateCodeRequest } from '../../dtos/request/CreateServiceRequest';


@Injectable({
  providedIn: 'root'
})
export class CodeService {
  apiUrl = environment.apiUrl + '/codes';
  
  constructor(private http: HttpClient) {}

  findAllCodes(): Observable<Response<Code[]>> {
    return this.http.get<Response<Code[]>>(`${this.apiUrl}`);
  }

  findCodeById(codeId: string): Observable<Response<Code>> {
    return this.http.get<Response<Code>>(`${this.apiUrl}/${codeId}`);
  }

  createCode(createCodeRequest: CreateCodeRequest): Observable<Response<Code>> {
    return this.http.post<Response<Code>>(`${this.apiUrl}/create`, createCodeRequest);
  }

  updateCode(codeId: string, CodeData: CreateCodeRequest): Observable<any> {
    return this.http.put(`${this.apiUrl}/update/${codeId}`, CodeData);
  }
  
  deleteCode(codeId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete/${codeId}`);
  }

  syncCodesFromPlannings(): Observable<any> {
    return this.http.post(`${this.apiUrl}/sync-from-plannings`, {});
  }
}
