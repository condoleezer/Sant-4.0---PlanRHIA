import { Injectable } from '@angular/core';
import {environment} from '../../environment/environment';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {Response} from "../../dtos/response/Response";
import {User} from '../../models/User';
import {ChangePasswordRequest} from '../../dtos/request/ChangePasswordRequest';
import {AssignServiceRequest} from '../../dtos/request/AssignServiceRequest';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  apiUrl = environment.apiUrl + '/users'
  
  constructor(private http: HttpClient) {}

  findAllUsers(): Observable<Response<User[]>> {
    return this.http.get<Response<User[]>>(`${this.apiUrl}`)
  }

  findUserById(userId: string): Observable<Response<User>> {
    return this.http.get<Response<User>>(`${this.apiUrl}/${userId}`)
  }

  getNurses(): Observable<Response<User[]>> {
    return this.http.get<Response<User[]>>(`${this.apiUrl}/nurse`);
  }

  getUserInfo(): Observable<Response<User>> {
    return this.http.get<Response<User>>(`${this.apiUrl}/user-info`);
  }

  findAllNurse(): Observable<Response<User[]>> {
    return this.http.get<Response<User[]>>(`${this.apiUrl}/nurse`)
  }

  findAllHead(): Observable<Response<User[]>> {
    return this.http.get<Response<User[]>>(`${this.apiUrl}/head`)
  }

  deleteUser(userId: string): Observable<Response<any>> {
    return this.http.delete<Response<any>>(`${this.apiUrl}/delete/${userId}`);
  }

  updateUser(userId: string, userData: any): Observable<Response<User>> {
    return this.http.put<Response<User>>(`${this.apiUrl}/update/${userId}`, userData);
  }

  assignService(userId: string, assignServiceRequest: AssignServiceRequest): Observable<Response<User>> {
    return this.http.put<Response<User>>(`${this.apiUrl}/assignService/${userId}`, assignServiceRequest);
  }

  changePassword(userId: string, changePasswordRequest: ChangePasswordRequest): Observable<Response<User>> {
    return this.http.put<Response<User>>(`${this.apiUrl}/changePassword/${userId}`, changePasswordRequest);
  }
}