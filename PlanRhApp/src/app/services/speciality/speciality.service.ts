import { Injectable } from '@angular/core';
import { environment } from '../../environment/environment';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Response } from '../../dtos/response/Response';
import { Speciality } from '../../models/services';
import { CreateSpecialityRequest } from '../../dtos/request/CreateServiceRequest';


@Injectable({
  providedIn: 'root'
})
export class SpecialityService {
  apiUrl = environment.apiUrl + '/speciality';
  
  constructor(private http: HttpClient) {}

  findAllSpecialities(): Observable<Response<Speciality[]>> {
    return this.http.get<Response<Speciality[]>>(`${this.apiUrl}`);
  }

  findSpecialityById(specialityId: string): Observable<Response<Speciality>> {
    return this.http.get<Response<Speciality>>(`${this.apiUrl}/${specialityId}`);
  }

  createSpeciality(createSpecialityRequest: CreateSpecialityRequest): Observable<Response<Speciality>> {
    return this.http.post<Response<Speciality>>(`${this.apiUrl}/create`, createSpecialityRequest);
  }

  updateSpeciality(specialityId: string, SpecialityData: CreateSpecialityRequest): Observable<any> {
    return this.http.put(`${this.apiUrl}/update/${specialityId}`, SpecialityData);
  }
  
  deleteSpeciality(specialityId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete/${specialityId}`);
  }
}
