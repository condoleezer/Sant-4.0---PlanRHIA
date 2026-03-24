import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CodeService } from '../../../services/code/code.service';
import { Code } from '../../../models/services';
import { CreateCodeRequest } from '../../../dtos/request/CreateServiceRequest';
import { SharedService } from '../../../services/shared/shared.service';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { IftaLabel } from 'primeng/iftalabel';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-code',
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
    DatePickerModule,
    FormsModule
  ],
  templateUrl: './code.component.html',
  styleUrl: './code.component.css',
  providers: [CodeService, SharedService]
})
export class CodeComponent implements OnInit {
  codes: Code[] = [];
  filteredCode: Code[] = [];
  codeForm: FormGroup;
  codeVisible = false;
  deleteCodeDialog = false;
  isEditMode = false;
  currentCodeId: string | null = null;
  codeToDelete: Code | null = null;
  searchTermCode = '';
  first = 0;
  rows = 10;
  totalRecords = 0;

  constructor(
    private codeService: CodeService,
    private fb: FormBuilder,
    private sharedService: SharedService
  ) {
    this.codeForm = this.fb.group({
      name: ['', Validators.required],
      name_abrege: [''],
      regroupement: [''],
      indicator: [''],
      begin_date: [''],
      end_date: ['']
    });
  }

  ngOnInit() {
    this.loadCodes();
  }

  loadCodes() {
    this.codeService.findAllCodes().subscribe(data => {
      this.codes = data.data.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      this.filteredCode = [...this.codes];
      this.applyFilter();
    });
  }

  applyFilter() {
    this.filteredCode = this.sharedService.applyFilter(this.codes, this.searchTermCode, ['name', 'name_abrege', 'regroupement', 'indicator', 'matricule']);
    this.totalRecords = this.filteredCode.length;
    this.first = 0;
  }

  showAddDialogCode() {
    this.isEditMode = false;
    this.codeForm.reset();
    this.codeVisible = true;
  }

  showEditDialogCode(code: Code) {
    this.isEditMode = true;
    this.currentCodeId = code.id;
    this.codeForm.patchValue({
      name: code.name,
      name_abrege: code.name_abrege || '',
      regroupement: code.regroupement || '',
      indicator: code.indicator || '',
      begin_date: code.begin_date || '',
      end_date: code.end_date || ''
    });
    this.codeVisible = true;
  }

  onSubmitCode() {
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }
    const rawValues = this.codeForm.getRawValue();
    const request: CreateCodeRequest = {
      name: rawValues.name,
      name_abrege: rawValues.name_abrege,
      regroupement: rawValues.regroupement,
      indicator: rawValues.indicator,
      begin_date: rawValues.begin_date,
      end_date: rawValues.end_date
    };
    this.codeService.createCode(request).subscribe({
      next: () => {
        this.sharedService.showSuccess('Code créé avec succès');
        this.codeVisible = false;
        this.loadCodes();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la création')
    });
  }

  updateCodes() {
    if (this.codeForm.invalid || !this.currentCodeId) {
      this.sharedService.showError('Formulaire invalide');
      return;
    }
    const rawValues = this.codeForm.getRawValue();
    const request: CreateCodeRequest = {
      name: rawValues.name,
      name_abrege: rawValues.name_abrege,
      regroupement: rawValues.regroupement,
      indicator: rawValues.indicator,
      begin_date: rawValues.begin_date,
      end_date: rawValues.end_date
    };
    this.codeService.updateCode(this.currentCodeId, request).subscribe({
      next: () => {
        this.sharedService.showSuccess('Code mis à jour avec succès');
        this.codeVisible = false;
        this.loadCodes();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la mise à jour')
    });
  }

  confirmDeleteCode(code: Code) {
    this.codeToDelete = code;
    this.deleteCodeDialog = true;
  }

  deleteCode() {
    if (!this.codeToDelete) return;
    this.codeService.deleteCode(this.codeToDelete.id).subscribe({
      next: () => {
        this.sharedService.showSuccess('Code supprimé avec succès');
        this.deleteCodeDialog = false;
        this.loadCodes();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la suppression')
    });
  }

  onPageChange(event: any) {
    this.first = event.first;
    this.rows = event.rows;
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? dateString : date.toLocaleDateString('fr-FR');
  }

  syncCodesFromPlannings() {
    this.codeService.syncCodesFromPlannings().subscribe({
      next: (response) => {
        const message = `Synchronisation terminée: ${response.codes_created} code(s) créé(s), ${response.codes_existing} code(s) existant(s)`;
        this.sharedService.showSuccess(message);
        this.loadCodes();
      },
      error: () => this.sharedService.showError('Une erreur est survenue lors de la synchronisation')
    });
  }
}
