import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { PoleService } from '../../../services/pole/pole.service';
import { SpecialityService } from '../../../services/speciality/speciality.service';
import { UserService } from '../../../services/user/user.service';
import { Pole, Speciality } from '../../../models/services';
import { User } from '../../../models/User';
import { CreatePoleRequest } from '../../../dtos/request/CreateServiceRequest';
import { SharedService } from '../../../services/shared/shared.service';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { MultiSelect } from 'primeng/multiselect';
import { Select,  } from 'primeng/select';
import { IftaLabel } from 'primeng/iftalabel';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { BadgeModule } from 'primeng/badge';

@Component({
  selector: 'app-pole',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    Button,
    Drawer,
    InputText,
    FormsModule,
    MultiSelect,
    IftaLabel,
    ReactiveFormsModule,
    DialogModule,
    ToastModule,
    BadgeModule,
    Select,
  ],
  templateUrl: './pole.component.html',
  styleUrl: './pole.component.css',
  providers: [PoleService, UserService, SpecialityService, SharedService]
})
export class PoleComponent implements OnInit {
  pole: Pole[] = [];
  filteredPole: Pole[] = [];
  poleForm: FormGroup;
  poleVisible = false;
  deletePoleDialog = false;
  isEditMode = false;
  currentPoleId: string | null = null;
  poleToDelete: Pole | null = null;
  cadreUsers: User[] = [];
  specialityOptions: { label: string, value: string }[] = [];
  searchTermPole = '';
  first = 0;
  rows = 10;
  totalRecords = 0;

  constructor(
    private poleService: PoleService,
    private specialityService: SpecialityService,
    private userService: UserService,
    private fb: FormBuilder,
    private sharedService: SharedService
  ) {
    this.poleForm = this.fb.group({
      name: ['', Validators.required],
      head: [''],
      specialities: [[]]
    });
  }

  ngOnInit() {
    this.loadPoles();
    this.loadCadreUsers();
    this.loadSpecialityOptions();
  }

  loadPoles() {
    this.poleService.findAllPoles().subscribe(polesData => {
      this.specialityService.findAllSpecialities().subscribe(specialitiesData => {
        const specialitiesMap = new Map<string, Speciality>();
        specialitiesData.data.forEach(spec => specialitiesMap.set(spec.id, spec));
        this.pole = polesData.data.map(pole => ({
          ...pole,
          specialities: pole.specialities?.map(spec =>
            typeof spec === 'string' ? specialitiesMap.get(spec) || { id: spec, name: 'Inconnue' } : spec
          ) || []
        })).sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
          const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        this.filteredPole = [...this.pole];
        this.applyFilter();
      });
    });
  }

  loadCadreUsers() {
    this.userService.findAllUsers().subscribe(data => {
      this.cadreUsers = data.data.filter(user => user.role === 'cadre');
    });
  }

  loadSpecialityOptions() {
    this.specialityService.findAllSpecialities().subscribe(data => {
      this.specialityOptions = data.data.map(spec => ({ label: spec.name, value: spec.id }));
    });
  }

  applyFilter() {
    this.filteredPole = this.sharedService.applyFilter(this.pole, this.searchTermPole, ['name', 'head', 'matricule']);
    this.totalRecords = this.filteredPole.length;
    this.first = 0;
  }

  showAddDialogPole() {
    this.isEditMode = false;
    this.poleForm.reset();
    this.poleVisible = true;
  }

  showEditDialogPole(pole: Pole) {
    this.isEditMode = true;
    this.currentPoleId = pole.id;
    const selectedCadre = this.cadreUsers.find(user => user.first_name === pole.head);
    const selectedSpecialities = pole.specialities?.map(spec => typeof spec === 'string' ? spec : spec.id) || [];
    this.poleForm.patchValue({ name: pole.name, head: selectedCadre, specialities: selectedSpecialities });
    this.poleVisible = true;
  }

  onSubmitPole() {
    if (this.poleForm.invalid) {
      this.poleForm.markAllAsTouched();
      return;
    }
    const rawValues = this.poleForm.getRawValue();
    const request: CreatePoleRequest = {
      name: rawValues.name,
      head: rawValues.head?.first_name || '',
      specialities: rawValues.specialities || []
    };
    this.poleService.createPole(request).subscribe({
      next: () => {
        this.sharedService.showSuccess('Pôle créé avec succès');
        this.poleVisible = false;
        this.loadPoles();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la création')
    });
  }

  updatePole() {
    if (this.poleForm.invalid || !this.currentPoleId) {
      this.sharedService.showError('Formulaire invalide');
      return;
    }
    const rawValues = this.poleForm.getRawValue();
    const request: CreatePoleRequest = {
      name: rawValues.name,
      head: rawValues.head?.first_name || '',
      specialities: rawValues.specialities || []
    };
    this.poleService.updatePole(this.currentPoleId, request).subscribe({
      next: () => {
        this.sharedService.showSuccess('Pôle mis à jour avec succès');
        this.poleVisible = false;
        this.loadPoles();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la mise à jour')
    });
  }

  confirmDeletePole(pole: Pole) {
    this.poleToDelete = pole;
    this.deletePoleDialog = true;
  }

  deletePole() {
    if (!this.poleToDelete) return;
    this.poleService.deletePole(this.poleToDelete.id).subscribe({
      next: () => {
        this.sharedService.showSuccess('Pôle supprimé avec succès');
        this.deletePoleDialog = false;
        this.loadPoles();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la suppression')
    });
  }

  onPageChange(event: any) {
    this.first = event.first;
    this.rows = event.rows;
  }
}
