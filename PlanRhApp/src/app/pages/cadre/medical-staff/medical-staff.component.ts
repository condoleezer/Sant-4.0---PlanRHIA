import { Component, signal, WritableSignal, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, AbstractControl } from '@angular/forms';
import { UserService } from '../../../services/user/user.service';
import { RoleService } from '../../../services/role/role.service';
import { ServiceService } from '../../../services/service/service.service';
import { SpecialityService } from '../../../services/speciality/speciality.service';
import { ContratService, Contrat, WorkDay } from '../../../services/contrat/contrat.service';
import { AuthService } from '../../../services/auth/auth.service';
import { User } from '../../../models/User';
import { Role } from '../../../models/role';
import { Service } from '../../../models/services';
import { Speciality } from '../../../models/services';
import { MessageService, ConfirmationService, SelectItem } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { IftaLabelModule } from 'primeng/iftalabel';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DatePickerModule } from 'primeng/datepicker';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DropdownModule } from 'primeng/dropdown';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-medical-staff',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    IftaLabelModule,
    ConfirmDialogModule,
    ToastModule,
    DatePickerModule,
    FormsModule,
    DropdownModule,
    PaginatorModule
  ],
  standalone: true,
  templateUrl: './medical-staff.component.html',
  styleUrls: ['./medical-staff.component.css'],
  providers: [ConfirmationService, MessageService, AuthService]
})
export class MedicalStaffComponent implements AfterViewInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  roles: Role[] = [];
  services: Service[] = [];
  speciality: Speciality[] = [];
  contrats: { [userId: string]: Contrat | null } = {};
  selectedUser: User | null = null;
  selectedUserForDetails: User | null = null;
  selectedContrat: Contrat | null = null;
  loggedInUser: User | null = null;
  loading = signal(false);

  searchTerm: string = '';
  selectedRole: string = '';
  roleOptions: SelectItem[] = [
    { label: 'Tous', value: '' },
    { label: 'Administrateur', value: 'admin' },
    { label: 'Cadre de santé', value: 'cadre' },
    { label: 'Agent de santé', value: 'nurse' }
  ];

  first: number = 0;
  rows: number = 10;
  totalRecords: number = 0;

  userForm: FormGroup;
  contratForm: FormGroup;
  drawerVisible: WritableSignal<boolean> = signal(false);
  detailsDrawerVisible: WritableSignal<boolean> = signal(false);
  contratDialogVisible: WritableSignal<boolean> = signal(false);
  isEditMode: boolean = false;
  isContratEditMode: boolean = false;

  working_period: string[] = ['Travail de jour', 'Travail de nuit'];
  contratTypes: string[] = ['Temps plein', 'Temps partiel'];
  availableDays: string[] = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  constructor(
    private userService: UserService,
    private roleService: RoleService,
    private serviceService: ServiceService,
    private specialityService: SpecialityService,
    private contratService: ContratService,
    private authService: AuthService,
    private fb: FormBuilder,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.userForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(3)]],
      last_name: ['', [Validators.required, Validators.minLength(3)]],
      tel: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      email: ['', [Validators.required, Validators.email]],
      role: ['', Validators.required],
      service: [''],
    });

    this.contratForm = this.fb.group({
      contrat_type: ['', Validators.required],
      working_period: ['', Validators.required],
      start_time: ['', Validators.required],
      contrat_hour_week: ['', [Validators.required, Validators.pattern('^[0-9]+$')]],
      contrat_hour_day: ['', [Validators.required, Validators.pattern('^[0-9]+$')]],
      work_days: this.fb.array([], this.uniqueDaysValidator),
    });
  }

  ngOnInit() {
    this.loadUserAndData();
  }

  ngAfterViewInit() {
    if (this.workDaysArray.length === 0) {
      this.addWorkDay();
    }
    this.cdr.detectChanges();
  }

  loadUserAndData(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: User | null) => {
        if (user?._id) {
          this.loggedInUser = user;
          this.loadAllData();
        } else {
          this.showError('Impossible de charger les informations utilisateur');
        }
      },
      error: () => {
        this.showError('Échec de la connexion au serveur');
      }
    });
  }

  loadAllData(): void {
    forkJoin([
      this.roleService.findAllRoles(),
      this.serviceService.findAllServices(),
      this.specialityService.findAllSpecialities()
    ]).subscribe({
      next: ([rolesResponse, servicesResponse, specialityResponse]) => {
        this.roles = rolesResponse.data || [];
        this.services = servicesResponse.data || [];
        this.speciality = specialityResponse.data || [];
        this.loadUsers();
      },
      error: () => {
        this.showError('Échec du chargement des données');
      }
    });
  }

  loadUsers() {
    if (!this.loggedInUser?.service_id) {
      this.showError('Service de l\'utilisateur non défini');
      this.users = [];
      this.filteredUsers = [];
      return;
    }

    this.userService.findAllUsers().subscribe({
      next: (response) => {
        this.users = response.data
          .filter(user => user.service_id === this.loggedInUser?.service_id)
          .map(user => ({
            ...user,
            serviceName: this.services.find(s => s.id === user.service_id)?.name || 'Non attribué',
            specialityName: this.speciality.find(s => s.id === user.speciality_id)?.name || 'Non attribué'
          }))
          .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
            const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
            return dateB.getTime() - dateA.getTime();
          });

        this.filteredUsers = [...this.users];
        this.applyFilter();

        if (this.users.length === 0) {
          this.showInfo('Aucun utilisateur trouvé pour votre service');
        }

        this.users.forEach(user => this.loadContratForUser(user));
        console.log('Filtered users loaded:', this.users);
      },
      error: () => this.showError('Erreur lors du chargement des utilisateurs')
    });
  }

  applyFilter() {
    const term = (this.searchTerm || '').toLowerCase();
    this.filteredUsers = this.users.filter(user => {
      const firstName = (user.first_name || '').toLowerCase();
      const lastName = (user.last_name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const role = (user.role || '').toLowerCase();
      const serviceName = (user.serviceName || '').toLowerCase();
      const specialityName = (user.specialityName || '').toLowerCase();
      const matchesSearch =
        term === '' ||
        firstName.includes(term) ||
        lastName.includes(term) ||
        email.includes(term) ||
        this.getDisplayRole(role).toLowerCase().includes(term) ||
        serviceName.includes(term) ||
        specialityName.includes(term);
      const matchesRole = !this.selectedRole || user.role === this.selectedRole;
      return matchesSearch && matchesRole;
    });
    this.updatePagination();
  }

  updatePagination() {
    this.totalRecords = this.filteredUsers.length;
    this.first = 0;
  }

  onPageChange(event: PaginatorState) {
    this.first = event.first ?? 0;
    this.rows = event.rows ?? 10;
  }

  getDisplayRole(role: string): string {
    switch (role) {
      case 'admin': return 'Administrateur';
      case 'cadre': return 'Cadre de santé';
      case 'nurse': return 'Agent de santé';
      case 'vacataire': return 'Vacataire';
      default: return role;
    }
  }

  uniqueDaysValidator(control: AbstractControl): { [key: string]: any } | null {
    const array = control as FormArray;
    const days = array.controls
      .map(control => control.get('day')?.value)
      .filter(day => !!day);
      
    const uniqueDays = new Set(days);
    return days.length === uniqueDays.size ? null : { duplicateDays: true };
  }

  get workDaysArray(): FormArray {
    return this.contratForm.get('work_days') as FormArray;
  }

  timeRangeValidator(control: FormGroup): { [key: string]: boolean } | null {
    const startTime = control.get('start_time')?.value;
    const endTime = control.get('end_time')?.value;
    if (startTime instanceof Date && endTime instanceof Date && !isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
      if (startTime.getTime() >= endTime.getTime()) {
        return { invalidTimeRange: true };
      }
    }
    return null;
  }

  addWorkDay(day: string = '', startTime: string | Date = '09:00', endTime: string | Date = '17:00') {
    const start = typeof startTime === 'string' ? this.parseTime(startTime) : startTime;
    const end = typeof endTime === 'string' ? this.parseTime(endTime) : endTime;
  
    const selectedDay = day || this.getFirstAvailableDay();
  
    const workDayGroup = this.fb.group({
      day: [selectedDay, Validators.required],
      start_time: [start, Validators.required],
      end_time: [end, Validators.required],
    }, { validators: this.timeRangeValidator });
  
    // Ensure the form group is properly initialized before adding to array
    if (workDayGroup.valid) {
      this.workDaysArray.push(workDayGroup);
      this.workDaysArray.updateValueAndValidity();
      this.cdr.detectChanges();
    } else {
      console.error('Invalid workDay group created:', workDayGroup.errors);
    }
  }

  getFirstAvailableDay(): string {
    const selectedDays = this.workDaysArray.controls.map(control => control.get('day')?.value).filter(day => !!day);
    return this.availableDays.find(day => !selectedDays.includes(day)) || this.availableDays[0];
  }

  trackByFn(index: number, item: any): number {
    return index;
  }

  removeWorkDay(index: number) {
    this.workDaysArray.removeAt(index);
    if (this.workDaysArray.length === 0) {
      this.addWorkDay();
    }
    this.cdr.detectChanges();
    console.log('WorkDay removed, current state:', this.workDaysArray.value);
  }

  getAvailableDaysForIndex(index: number): string[] {
    const selectedDays = this.workDaysArray.controls
      .map((control, idx) => (idx !== index ? control.get('day')?.value : null))
      .filter(day => day !== null);
      
    return this.availableDays.filter(day => !selectedDays.includes(day));
  }

  getUserWorkDays(user: User): { day: string, isWorking: boolean }[] {
    const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const userId = user.id || user._id;
    const contrat = this.contrats[userId!];
    if (!contrat || !contrat.work_days) {
      return days.map(day => ({ day, isWorking: false }));
    }

    return days.map((day, index) => {
      const fullDay = this.availableDays[index];
      const isWorking = contrat.work_days.some((workDay: WorkDay) => workDay.day === fullDay);
      return { day, isWorking };
    });
  }

  parseTime(time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  formatTime(time: Date | string): string {
    if (typeof time === 'string') {
      return time;
    }
    if (!(time instanceof Date) || isNaN(time.getTime())) {
      return '00:00';
    }
    const hours = time.getHours().toString().padStart(2, '0');
    const minutes = time.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  loadContratForUser(user: User) {
    const userId = user.id || user._id;
    if (!userId) return;
    this.contratService.getContratByUserId(userId).subscribe({
      next: (response) => {
        if (response && response.data) {
          this.contrats[userId] = response.data;
        } else {
          this.contrats[userId] = null;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.contrats[userId] = null;
        this.cdr.detectChanges();
      }
    });
  }

  loadServices(): Promise<void> {
    return new Promise((resolve) => {
      this.serviceService.findAllServices().subscribe({
        next: (response) => {
          this.services = response.data;
          console.log('Services loaded:', this.services);
          resolve();
        },
        error: () => {
          this.showError('Erreur lors du chargement des services');
          resolve();
        }
      });
    });
  }

  loadSpecialities(): Promise<void> {
    return new Promise((resolve) => {
      this.specialityService.findAllSpecialities().subscribe({
        next: (response) => {
          this.speciality = response.data;
          console.log('Specialities loaded:', this.speciality);
          resolve();
        },
        error: () => {
          this.showError('Erreur lors du chargement des spécialités');
          resolve();
        }
      });
    });
  }

  loadRoles() {
    this.roleService.findAllRoles().subscribe({
      next: (response) => {
        this.roles = response.data;
        console.log('Roles loaded:', this.roles);
      },
      error: () => this.showError('Erreur lors du chargement des rôles')
    });
  }

  editUser(user: User) {
    this.isEditMode = true;
    this.selectedUser = { ...user };
    this.userForm.patchValue({
      first_name: user.first_name,
      last_name: user.last_name,
      tel: user.phoneNumber,
      email: user.email,
      role: this.roles.find(r => r.name === user.role) || user.role,
      service: this.services.find(s => s.id === user.service_id)?.id || user.service_id,
    });
    this.drawerVisible.set(true);
  }

  onSubmit() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const values = this.userForm.value;

    if (this.isEditMode && (this.selectedUser?.id || this.selectedUser?._id)) {
      const userId = this.selectedUser.id || this.selectedUser._id;
      const updatedUser = {
        first_name: values.first_name,
        last_name: values.last_name,
        phoneNumber: values.tel,
        email: values.email,
        role: typeof values.role === 'object' ? values.role.name : values.role,
        service_id: values.service || null
      };
      this.userService.updateUser(userId!, updatedUser).subscribe({
        next: () => {
          this.showSuccess('Utilisateur mis à jour avec succès');
          this.loadUsers();
          this.closeDrawer();
        },
        error: (err) => {
          this.showError(err.error?.message || 'Erreur lors de la mise à jour');
        },
        complete: () => this.loading.set(false)
      });
    }
  }

  closeDrawer() {
    this.drawerVisible.set(false);
    this.userForm.reset();
    this.selectedUser = null;
    this.isEditMode = false;
  }

  confirmDelete(user: User) {
    const userId = user.id || user._id;
    if (!userId) {
      this.showError('ID utilisateur invalide');
      return;
    }
    this.confirmationService.confirm({
      message: `Êtes-vous sûr de vouloir supprimer ${user.first_name} ${user.last_name} ?`,
      header: 'Confirmation de suppression',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer',
      acceptIcon: 'pi pi-check',
      acceptButtonStyleClass: 'p-button-danger',
      rejectLabel: 'Annuler',
      rejectIcon: 'pi pi-times',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => {
        this.deleteUser(userId);
      },
    });
  }

  deleteUser(userId: string) {
    this.loading.set(true);
    this.userService.deleteUser(userId).subscribe({
      next: () => {
        this.showSuccess('Utilisateur supprimé avec succès');
        this.loadUsers();
      },
      error: (err) => {
        this.showError(err.error?.message || 'Erreur lors de la suppression');
      },
      complete: () => this.loading.set(false)
    });
  }

  viewDetails(user: User) {
    this.selectedUserForDetails = { ...user };
    this.loadContrat(user);
    this.detailsDrawerVisible.set(true);
  }

  loadContrat(user: User) {
    const userId = user.id || user._id;
    if (!userId) return;
    this.contratService.getContratByUserId(userId).subscribe({
      next: (response) => {
        if (response?.data) {
          this.selectedContrat = response.data;
          this.isContratEditMode = true;
  
          this.contratForm.reset();
          while (this.workDaysArray.length > 0) {
            this.workDaysArray.removeAt(0);
          }
  
          if (this.selectedContrat.work_days?.length) {
            this.selectedContrat.work_days.forEach(workDay => {
              this.addWorkDay(
                workDay.day,
                this.parseTime(workDay.start_time),
                this.parseTime(workDay.end_time)
              );
            });
          } else {
            this.addWorkDay();
          }
  
          this.contratForm.patchValue({
            contrat_type: this.selectedContrat.contrat_type,
            working_period: this.selectedContrat.working_period,
            start_time: this.parseTime(this.selectedContrat.start_time),
            contrat_hour_week: this.selectedContrat.contrat_hour_week,
            contrat_hour_day: this.selectedContrat.contrat_hour_day,
          });
  
          console.log('Contrat chargé dans le formulaire:', this.contratForm.value);
        } else {
          this.selectedContrat = null;
          this.isContratEditMode = false;
          this.contratForm.reset();
          while (this.workDaysArray.length > 0) {
            this.workDaysArray.removeAt(0);
          }
          this.addWorkDay();
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.showError('Erreur lors du chargement du contrat');
        this.selectedContrat = null;
        this.isContratEditMode = false;
        this.contratForm.reset();
        while (this.workDaysArray.length > 0) {
          this.workDaysArray.removeAt(0);
        }
        this.addWorkDay();
        this.cdr.detectChanges();
      }
    });
  }

  openContratDialog() {
    if (this.workDaysArray.length === 0) {
      this.addWorkDay();
    }
    this.contratDialogVisible.set(true);
    this.cdr.detectChanges();
  }

  closeDetailsDrawer() {
    this.detailsDrawerVisible.set(false);
    this.selectedUserForDetails = null;
    this.selectedContrat = null;
    this.isContratEditMode = false;
  }

  closeContratDialog() {
    this.contratDialogVisible.set(false);
    this.contratForm.reset();
    while (this.workDaysArray.length > 0) {
      this.workDaysArray.removeAt(0);
    }
    this.addWorkDay();
    this.cdr.detectChanges();
  }

  submitContrat() {
    if (this.contratForm.invalid) {
      this.contratForm.markAllAsTouched();
      console.log('Formulaire invalide:', this.contratForm.errors);
      console.log('Valeurs du formulaire:', this.contratForm.value);
      return;
    }
  
    this.loading.set(true);
  
    const formValues = this.contratForm.getRawValue();
    const workDays = formValues.work_days.map((workDay: any) => ({
      day: workDay.day,
      start_time: this.formatTime(workDay.start_time),
      end_time: this.formatTime(workDay.end_time),
    }));
  
    const contratData: Contrat = {
      user_id: this.selectedUserForDetails!.id || this.selectedUserForDetails!._id!,
      contrat_type: formValues.contrat_type,
      working_period: formValues.working_period,
      start_time: this.formatTime(formValues.start_time),
      contrat_hour_week: formValues.contrat_hour_week,
      contrat_hour_day: formValues.contrat_hour_day,
      work_days: workDays,
    };

    console.log('Données envoyées au backend:', contratData);

    if (this.isContratEditMode && this.selectedContrat?.id) {
      this.contratService.updateContrat(this.selectedContrat.id, contratData).subscribe({
        next: () => {
          this.showSuccess('Contrat mis à jour avec succès');
          this.loadContrat(this.selectedUserForDetails!);
          this.closeContratDialog();
        },
        error: (err) => {
          console.error('Erreur mise à jour:', err);
          this.showError(err.error?.message || 'Erreur lors de la mise à jour du contrat');
        },
        complete: () => this.loading.set(false)
      });
    } else {
      this.contratService.createContrat(contratData).subscribe({
        next: () => {
          this.showSuccess('Contrat créé avec succès');
          this.loadContrat(this.selectedUserForDetails!);
          this.closeContratDialog();
        },
        error: (err) => {
          console.error('Erreur création:', err);
          this.showError(err.error?.message || 'Erreur lors de la création du contrat');
        },
        complete: () => this.loading.set(false)
      });
    }
  }

  showSuccess(message: string) {
    this.messageService.add({ severity: 'success', summary: 'Succès', detail: message });
  }

  showError(message: string) {
    this.messageService.add({ severity: 'error', summary: 'Erreur', detail: message });
  }

  showInfo(message: string) {
    this.messageService.add({ severity: 'info', summary: 'Information', detail: message });
  }

  /**
   * Navigue vers la page de création de compte
   */
  navigateToAddAccount(): void {
    this.router.navigate(['/cadre/add-account']);
  }
}