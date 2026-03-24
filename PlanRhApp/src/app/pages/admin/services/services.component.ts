import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ServiceService } from '../../../services/service/service.service';
import { UserService } from '../../../services/user/user.service';
import { Service } from '../../../models/services';
import { User } from '../../../models/User';
import { CreateServiceRequest } from '../../../dtos/request/CreateServiceRequest';
import { SharedService } from '../../../services/shared/shared.service';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { IftaLabel } from 'primeng/iftalabel';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-services',
  imports: [
    CommonModule,
    TableModule,
    Button,
    Drawer,
    InputText,
    Select,
    IftaLabel,
    ReactiveFormsModule,
    DialogModule,
    ToastModule,
    FormsModule
  ],
  standalone: true,
  templateUrl: './services.component.html',
  styleUrl: './services.component.css',
  providers: [ServiceService, UserService, SharedService]
})

export class ServicesComponent implements OnInit {
  services: Service[] = [];
  filteredService: Service[] = [];
  serviceForm: FormGroup;
  serviceVisible = false;
  deleteServiceDialog = false;
  isEditMode = false;
  currentServiceId: string | null = null;
  serviceToDelete: Service | null = null;
  cadreUsers: User[] = [];
  searchTermService = '';
  first = 0;
  rows = 10;
  totalRecords = 0;

  constructor(
    private serviceService: ServiceService,
    private userService: UserService,
    private fb: FormBuilder,
    private sharedService: SharedService
  ) {
    this.serviceForm = this.fb.group({
      name: ['', Validators.required],
      head: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.loadServices();
    this.loadCadreUsers();
  }

  loadServices() {
    this.serviceService.findAllServices().subscribe(data => {
      this.services = data.data.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      this.filteredService = [...this.services];
      this.applyFilter();
    });
  }

  loadCadreUsers() {
    this.userService.findAllUsers().subscribe(data => {
      this.cadreUsers = data.data.filter(user => user.role === 'cadre' || user.role === 'admin');
    });
  }

  applyFilter() {
    this.filteredService = this.sharedService.applyFilter(this.services, this.searchTermService, ['name', 'head', 'matricule']);
    this.totalRecords = this.filteredService.length;
    this.first = 0;
  }

  showAddDialog() {
    this.isEditMode = false;
    this.serviceForm.reset();
    this.serviceVisible = true;
  }

  showEditDialog(service: Service) {
    this.isEditMode = true;
    this.currentServiceId = service.id;
    const selectedCadre = this.cadreUsers.find(user => user.first_name === service.head);
    if (!selectedCadre) {
      this.sharedService.showError('Le responsable actuel n\'est pas un cadre ou n\'existe plus');
      return;
    }
    this.serviceForm.patchValue({ name: service.name, head: selectedCadre });
    this.serviceVisible = true;
  }

  onSubmit() {
    if (this.serviceForm.invalid) {
      this.serviceForm.markAllAsTouched();
      return;
    }
    const rawValues = this.serviceForm.getRawValue();
    const request: CreateServiceRequest = {
      name: rawValues.name,
      head: rawValues.head.first_name
    };
    this.serviceService.createService(request).subscribe({
      next: () => {
        this.sharedService.showSuccess('Service créé avec succès');
        this.serviceVisible = false;
        this.loadServices();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la création')
    });
  }

  updateService() {
    if (this.serviceForm.invalid || !this.currentServiceId) {
      this.sharedService.showError('Formulaire invalide');
      return;
    }
    const rawValues = this.serviceForm.getRawValue();
    const request: CreateServiceRequest = {
      name: rawValues.name,
      head: rawValues.head.first_name
    };
    this.serviceService.updateService(this.currentServiceId, request).subscribe({
      next: () => {
        this.sharedService.showSuccess('Service mis à jour avec succès');
        this.serviceVisible = false;
        this.loadServices();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la mise à jour')
    });
  }

  confirmDelete(service: Service) {
    this.serviceToDelete = service;
    this.deleteServiceDialog = true;
  }

  deleteService() {
    if (!this.serviceToDelete) return;
    this.serviceService.deleteService(this.serviceToDelete.id).subscribe({
      next: () => {
        this.sharedService.showSuccess('Service supprimé avec succès');
        this.deleteServiceDialog = false;
        this.loadServices();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la suppression')
    });
  }

  onPageChange(event: any) {
    this.first = event.first;
    this.rows = event.rows;
  }
}