import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { SpecialityService } from '../../../services/speciality/speciality.service';
import { Speciality } from '../../../models/services';
import { CreateSpecialityRequest } from '../../../dtos/request/CreateServiceRequest';
import { SharedService } from '../../../services/shared/shared.service';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { IftaLabel } from 'primeng/iftalabel';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-speciality',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    Button,
    Drawer,
    InputText,
    IftaLabel,
    ReactiveFormsModule,
    DialogModule,
    ToastModule,
    FormsModule
  ],
  templateUrl: './speciality.component.html',
  styleUrl: './speciality.component.css',
  providers: [SpecialityService, SharedService]
})
export class SpecialityComponent implements OnInit {
  specialities: Speciality[] = [];
  filteredSpeciality: Speciality[] = [];
  specialityForm: FormGroup;
  specialityVisible = false;
  deleteSpecialityDialog = false;
  isEditMode = false;
  currentSpecialityId: string | null = null;
  specialityToDelete: Speciality | null = null;
  searchTermSpeciality = '';
  first = 0;
  rows = 10;
  totalRecords = 0;

  constructor(
    private specialityService: SpecialityService,
    private fb: FormBuilder,
    private sharedService: SharedService
  ) {
    this.specialityForm = this.fb.group({
      name: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.loadSpecialities();
  }

  loadSpecialities() {
    this.specialityService.findAllSpecialities().subscribe(data => {
      this.specialities = data.data.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      this.filteredSpeciality = [...this.specialities];
      this.applyFilter();
    });
  }

  applyFilter() {
    this.filteredSpeciality = this.sharedService.applyFilter(this.specialities, this.searchTermSpeciality, ['name', 'matricule']);
    this.totalRecords = this.filteredSpeciality.length;
    this.first = 0;
  }

  showAddDialogSpeciality() {
    this.isEditMode = false;
    this.specialityForm.reset();
    this.specialityVisible = true;
  }

  showEditDialogSpeciality(speciality: Speciality) {
    this.isEditMode = true;
    this.currentSpecialityId = speciality.id;
    this.specialityForm.patchValue({ name: speciality.name });
    this.specialityVisible = true;
  }

  onSubmitSpeciality() {
    if (this.specialityForm.invalid) {
      this.specialityForm.markAllAsTouched();
      return;
    }
    const rawValues = this.specialityForm.getRawValue();
    const request: CreateSpecialityRequest = { name: rawValues.name };
    this.specialityService.createSpeciality(request).subscribe({
      next: () => {
        this.sharedService.showSuccess('Spécialité créée avec succès');
        this.specialityVisible = false;
        this.loadSpecialities();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la création')
    });
  }

  updateSpeciality() {
    if (this.specialityForm.invalid || !this.currentSpecialityId) {
      this.sharedService.showError('Formulaire invalide');
      return;
    }
    const rawValues = this.specialityForm.getRawValue();
    const request: CreateSpecialityRequest = { name: rawValues.name };
    this.specialityService.updateSpeciality(this.currentSpecialityId, request).subscribe({
      next: () => {
        this.sharedService.showSuccess('Spécialité mise à jour avec succès');
        this.specialityVisible = false;
        this.loadSpecialities();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la mise à jour')
    });
  }

  confirmDeleteSpeciality(speciality: Speciality) {
    this.specialityToDelete = speciality;
    this.deleteSpecialityDialog = true;
  }

  deleteSpeciality() {
    if (!this.specialityToDelete) return;
    this.specialityService.deleteSpeciality(this.specialityToDelete.id).subscribe({
      next: () => {
        this.sharedService.showSuccess('Spécialité supprimée avec succès');
        this.deleteSpecialityDialog = false;
        this.loadSpecialities();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la suppression')
    });
  }

  onPageChange(event: any) {
    this.first = event.first;
    this.rows = event.rows;
  }
}
