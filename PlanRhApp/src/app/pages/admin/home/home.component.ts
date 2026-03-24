import { Component } from '@angular/core';
import {Card} from 'primeng/card';
import {TableModule} from 'primeng/table';
import {NgForOf} from '@angular/common';
import {UserService} from '../../../services/user/user.service';
import {User} from '../../../models/User';
import {Service} from '../../../models/services';
import {Code} from '../../../models/services';
import {Pole} from '../../../models/services';
import {Speciality} from '../../../models/services';
import {ServiceService} from '../../../services/service/service.service';
import {PoleService} from '../../../services/pole/pole.service';
import {CodeService} from '../../../services/code/code.service';
import {SpecialityService} from '../../../services/speciality/speciality.service';

@Component({
  selector: 'app-home',
  imports: [
    Card,
    TableModule,
    NgForOf,
  ],
  standalone : true,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})

export class HomeComponent {
  cols: any[] = [
    { field: 'nom', header: 'Nom' },
    { field: 'prenom', header: 'Prenom' },
    { field: 'email', header: 'Email' },
    { field: 'téléphone', header: 'Téléphone' },
    { field: 'matricule', header: 'Matricule' },
    { field: 'role', header: 'Role' }
  ];

  users: User[] = [];
  services: Service[] = [];
  codes: Code[] = [];
  poles: Pole[] = [];
  specialities: Speciality[] = [];

  // Propriétés calculées pour chaque rôle
  get cadreCount(): number {
    return this.users.filter(user => user.role === 'cadre').length;
  }

  get nurseCount(): number {
    return this.users.filter(user => user.role === 'nurse').length;
  }

  constructor(
    private userService: UserService, 
    private  serviceService: ServiceService,
    private  poleService: PoleService,
    private  codeService: CodeService,
    private  specialityService: SpecialityService) {
  }

  ngOnInit(): void {
    this.userService.findAllUsers().subscribe(data => {
      this.users = data.data.map(user => ({
        ...user,
        displayRole: this.getDisplayRole(user.role)
      })).sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      }) || [];
    });

    this.serviceService.findAllServices().subscribe(data => {
      this.services = data.data || [];
    });

    this.poleService.findAllPoles().subscribe(data => {
      this.poles = data.data || [];
    });

    this.codeService.findAllCodes().subscribe(data => {
      this.codes = data.data || [];
    });

    this.specialityService.findAllSpecialities().subscribe(data => {
      this.specialities = data.data || [];
    });
  }

  getDisplayRole(role: string): string {
    switch (role) {
      case 'admin': return 'Administrateur';
      case 'cadre': return 'Cadre de santé';
      case 'nurse': return 'Agent de santé';
      default: return role;
    }
  }
}
