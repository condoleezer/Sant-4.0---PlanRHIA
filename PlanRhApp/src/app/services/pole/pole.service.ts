import { Injectable } from '@angular/core';
import { environment } from '../../environment/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Response } from '../../dtos/response/Response';
import { Pole } from '../../models/services';
import { CreatePoleRequest } from '../../dtos/request/CreateServiceRequest';


@Injectable({
  providedIn: 'root'
})
export class PoleService {
  apiUrl = environment.apiUrl + '/polls';
  
  constructor(private http: HttpClient) {}

  findAllPoles(): Observable<Response<Pole[]>> {
    return this.http.get<Response<Pole[]>>(`${this.apiUrl}`);
  }

  findPoleById(poleId: string): Observable<Response<Pole>> {
    return this.http.get<Response<Pole>>(`${this.apiUrl}/${poleId}`);
  }

  createPole(createPoleRequest: CreatePoleRequest): Observable<Response<Pole>> {
    return this.http.post<Response<Pole>>(`${this.apiUrl}/create`, createPoleRequest);
  }

  updatePole(poleId: string, poleData: CreatePoleRequest): Observable<any> {
    return this.http.put(`${this.apiUrl}/update/${poleId}`, poleData);
  }
  
  deletePole(poleId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete/${poleId}`);
  }
}
