import { Component, signal, WritableSignal, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, AbstractControl } from '@angular/forms';
import { UserService } from '../../../services/user/user.service';
import { RoleService } from '../../../services/role/role.service';
import { ServiceService } from '../../../services/service/service.service';
import { SpecialityService } from '../../../services/speciality/speciality.service';
import { ContratService, Contrat, WorkDay } from '../../../services/contrat/contrat.service';
import { AbsenceService } from '../../../services/absence/absence.service';
import { PlanningService } from '../../../services/planning/planning.service';
import { AuthService } from '../../../services/auth/auth.service';
import { User } from '../../../models/User';
import { Role } from '../../../models/role';
import { Service } from '../../../models/services';
import { Speciality } from '../../../models/services';
import { Absence } from '../../../models/absence';
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
import { DropdownModule } from 'primeng/dropdown';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { CalendarModule } from 'primeng/calendar';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-sec-medical-staff',
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
    DropdownModule,
    PaginatorModule,
    FormsModule,
    CardModule,
    CalendarModule
  ],
  standalone: true,
  templateUrl: './sec-medical-staff.component.html',
  styleUrls: ['./sec-medical-staff.component.css'],
  providers: [ConfirmationService, MessageService, AuthService]
})
export class SecMedicalStaffComponent implements AfterViewInit {
  cols: string[] = [
    "Nom",
    "Prénom",
    "Contact",
    "Jour de travail de la semaine",
    "Compétence",
    "Actions"
  ];

  users: User[] = [];
  filteredUsers: User[] = [];
  roles: Role[] = [];
  services: Service[] = [];
  speciality: Speciality[] = [];
  contrats: { [userId: string]: Contrat | null } = {};
  absences: { [userId: string]: Absence[] } = {};
  selectedUser: User | null = null;
  selectedUserForDetails: User | null = null;
  selectedContrat: Contrat | null = null;
  selectedUserForCalendar: User | null = null;
  selectedMonth: Date = new Date(); // Default to current month
  loading = signal(false);
  calendarDialogVisible: WritableSignal<boolean> = signal(false);
  workSchedule: { date: Date, isWorking: boolean, isAbsent: boolean, activityCode?: string }[] = [];
  contractWorkDays: string[] = [];
  currentUser: User | null = null;
  currentUserServiceId: string | null = null;
  currentUserSpecialityId: string | null = null;

  searchTerm: string = '';
  selectedRole: string = '';
  selectedSpeciality: string = '';
  roleOptions: SelectItem[] = [
    { label: 'Tous', value: '' },
    { label: 'Administrateur', value: 'admin' },
    { label: 'Cadre de santé', value: 'cadre' },
    { label: 'Agent de santé', value: 'nurse' }
  ];
  specialityOptions: SelectItem[] = [];

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
    private absenceService: AbsenceService,
    private planningService: PlanningService,
    private authService: AuthService,
    private fb: FormBuilder,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private cdr: ChangeDetectorRef
  ) {
    this.userForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(3)]],
      last_name: ['', [Validators.required, Validators.minLength(3)]],
      tel: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      email: ['', [Validators.required, Validators.email]],
      role: ['', Validators.required],
      service: [''],
      speciality: ['']
    });

    this.contratForm = this.fb.group({
      contrat_type: ['', Validators.required],
      working_period: ['', Validators.required],
      start_time: ['', [Validators.required]],
      contrat_hour_week: ['', [Validators.required, Validators.pattern('^[0-9]+$')]],
      contrat_hour_day: ['', [Validators.required, Validators.pattern('^[0-9]+$')]],
      work_days: this.fb.array([], this.uniqueDaysValidator),
    });
  }

  ngOnInit() {
    this.loadCurrentUser();
  }

  loadCurrentUser() {
    this.authService.getUserInfo().subscribe({
      next: (user: User | null) => {
        if (user) {
          this.currentUser = user;
          this.currentUserServiceId = user.service_id || null;
          this.currentUserSpecialityId = user.speciality_id || null;
          console.log('Current user service:', this.currentUserServiceId);
          console.log('Current user speciality:', this.currentUserSpecialityId);
          this.loadAllData();
        } else {
          this.showError('Impossible de charger les informations utilisateur');
        }
      },
      error: () => {
        this.showError('Erreur lors du chargement de l\'utilisateur');
      }
    });
  }

  ngAfterViewInit() {
    // Attendre que le formulaire soit complètement initialisé
    setTimeout(() => {
      if (this.workDaysArray.length === 0) {
        this.addWorkDay();
      }
      this.cdr.detectChanges();
    }, 0);
  }

  loadAllData(): void {
    forkJoin([
      this.roleService.findAllRoles(),
      this.serviceService.findAllServices(),
      this.specialityService.findAllSpecialities(),
      this.absenceService.findAllAbsences()
    ]).subscribe({
      next: ([rolesResponse, servicesResponse, specialityResponse, absencesResponse]) => {
        this.roles = rolesResponse.data || [];
        this.services = servicesResponse.data || [];
        this.speciality = specialityResponse.data || [];
        this.specialityOptions = [
          { label: 'Toutes', value: '' },
          ...this.speciality.map(s => ({ label: s.name, value: s.id }))
        ];
        this.absences = (absencesResponse.data || []).reduce((acc: { [userId: string]: Absence[] }, absence: Absence) => {
          if (absence.staff_id) {
            if (!acc[absence.staff_id]) {
              acc[absence.staff_id] = [];
            }
            acc[absence.staff_id].push(absence);
          }
          return acc;
        }, {});
        this.loadUsers();
      },
      error: () => {
        this.showError('Échec du chargement des données');
      }
    });
  }

  loadUsers() {
    this.userService.getNurses().subscribe({
      next: (response) => {
        // Filtrer les utilisateurs par service de l'utilisateur connecté
        const allUsers = response.data
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

        // Filtrer par service ET spécialité de l'utilisateur connecté
        this.users = allUsers.filter(user => {
          const sameService = user.service_id === this.currentUserServiceId;
          const sameSpeciality = user.speciality_id === this.currentUserSpecialityId;
          
          // Log pour debug
          if (sameService) {
            console.log('User:', user.first_name, user.last_name, 
                       'service_id:', user.service_id, 
                       'speciality_id:', user.speciality_id,
                       'currentUserSpecialityId:', this.currentUserSpecialityId,
                       'match:', sameSpeciality);
          }
          
          return sameService && sameSpeciality;
        });

        console.log(`Utilisateurs du service ${this.currentUserServiceId} avec spécialité ${this.currentUserSpecialityId}:`, this.users.length);

        this.filteredUsers = [...this.users];
        this.applyFilter();

        if (this.users.length === 0) {
          this.showInfo('Aucun utilisateur trouvé dans votre service');
        }

        this.users.forEach(user => this.loadContratForUser(user));
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
      const matchesSpeciality = !this.selectedSpeciality || user.speciality_id === this.selectedSpeciality;
      return matchesSearch && matchesRole && matchesSpeciality;
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
      default: return role;
    }
  }

  uniqueDaysValidator(control: AbstractControl): { [key: string]: any } | null {
    const array = control as FormArray;
    const days = array.controls.map(control => control.get('day')?.value).filter(day => !!day);
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
    const startTimeStr = typeof startTime === 'string' ? startTime : this.formatTime(startTime);
    const endTimeStr = typeof endTime === 'string' ? endTime : this.formatTime(endTime);

    const start = this.parseTime(startTimeStr);
    const end = this.parseTime(endTimeStr);

    const workDayGroup = this.fb.group({
      day: [day || this.getFirstAvailableDay(), Validators.required],
      start_time: [start, Validators.required],
      end_time: [end, Validators.required],
    }, { validators: this.timeRangeValidator });

    this.workDaysArray.push(workDayGroup);
    this.workDaysArray.markAsDirty();
    this.cdr.detectChanges();
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
  }

  getAvailableDaysForIndex(index: number): string[] {
    const selectedDays = this.workDaysArray.controls
      .map((control, idx) => idx !== index ? control.get('day')?.value : null)
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
      speciality: this.speciality.find(s => s.id === user.speciality_id)?.id || user.speciality_id
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
        service_id: values.service || null,
        speciality_id: values.speciality || null
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

  viewCalendar(user: User) {
    this.selectedUserForCalendar = { ...user };
    const userId = user.id || user._id;
    if (!userId) {
      this.showError('ID utilisateur invalide');
      return;
    }
    
    // Charger les plannings de l'utilisateur pour l'année en cours
    this.planningService.getPlanningsByUser(userId).subscribe({
      next: (response: any) => {
        const plannings = response.data || [];
        this.selectedMonth = new Date();
        this.generateMonthlyScheduleWithPlannings(userId, this.selectedMonth.getFullYear(), this.selectedMonth.getMonth(), plannings);
        this.calendarDialogVisible.set(true);
      },
      error: () => {
        this.showError('Erreur lors du chargement des plannings');
      }
    });
  }

  onMonthChange() {
    const userId = this.selectedUserForCalendar?.id || this.selectedUserForCalendar?._id;
    if (userId && this.selectedMonth) {
      // Recharger les plannings pour le mois sélectionné
      this.planningService.getPlanningsByUser(userId).subscribe({
        next: (response: any) => {
          const plannings = response.data || [];
          this.generateMonthlyScheduleWithPlannings(userId, this.selectedMonth.getFullYear(), this.selectedMonth.getMonth(), plannings);
        },
        error: () => {
          this.showError('Erreur lors du chargement des plannings');
        }
      });
    }
  }

  generateMonthlyScheduleWithPlannings(userId: string, year: number, month: number, plannings: any[]): void {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    this.workSchedule = [];
    const contrat = this.contrats[userId];
    this.contractWorkDays = contrat && contrat.work_days ? contrat.work_days.map(w => w.day) : [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = this.getDayName(date);
      const isWorkingDay = this.contractWorkDays.includes(dayName);
      const isAbsent = this.isAbsentDay(userId, date);
      
      // Chercher le planning pour ce jour
      const planning = plannings.find(p => p.date === dateStr);
      const activityCode = planning?.activity_code || (isWorkingDay && !isAbsent ? 'J02' : 'RH');
      
      this.workSchedule.push({
        date,
        isWorking: isWorkingDay && !isAbsent,
        isAbsent,
        activityCode: activityCode
      });
    }
    this.cdr.detectChanges();
  }

  getDayName(date: Date): string {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[date.getDay()];
  }

  isAbsentDay(userId: string, date: Date): boolean {
    const userAbsences = this.absences[userId] || [];
    return userAbsences.some(a => {
      if (a.status !== 'Validé par le cadre') return false;
      const start = new Date(a.start_date);
      const end = new Date(a.end_date);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      date.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });
  }

  closeCalendarDialog() {
    this.calendarDialogVisible.set(false);
    this.selectedUserForCalendar = null;
    this.selectedMonth = new Date(); // Reset to current month
    this.workSchedule = [];
    this.contractWorkDays = [];
  }

  loadContrat(user: User) {
    const userId = user.id || user._id;
    if (!userId) return;
    this.contratService.getContratByUserId(userId).subscribe({
      next: (response) => {
        if (response && response.data) {
          this.selectedContrat = response.data;
          this.isContratEditMode = true;

          this.contratForm.patchValue({
            contrat_type: this.selectedContrat.contrat_type,
            working_period: this.selectedContrat.working_period,
            start_time: this.selectedContrat.start_time,
            contrat_hour_week: this.selectedContrat.contrat_hour_week,
            contrat_hour_day: this.selectedContrat.contrat_hour_day,
          });

          while (this.workDaysArray.length > 0) {
            this.workDaysArray.removeAt(0);
          }

          if (this.selectedContrat.work_days && this.selectedContrat.work_days.length > 0) {
            this.selectedContrat.work_days.forEach((workDay: WorkDay) => {
              this.addWorkDay(workDay.day, workDay.start_time, workDay.end_time);
            });
          } else {
            this.addWorkDay();
          }
        } else {
          this.selectedContrat = null;
          this.isContratEditMode = false;
          this.contratForm.reset();
          while (this.workDaysArray.length > 0) {
            this.workDaysArray.removeAt(0);
          }
          this.addWorkDay();
          this.messageService.add({
            severity: 'warn',
            summary: 'Avertissement',
            detail: 'Aucun contrat trouvé pour cet utilisateur.',
          });
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.showError('Erreur lors du chargement du contrat');
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
      return;
    }

    if (this.contratForm.get('work_days')?.errors?.['duplicateDays']) {
      this.showError('Les jours de travail doivent être uniques.');
      return;
    }

    this.loading.set(true);

    const formValues = this.contratForm.getRawValue();
    const contratData: Contrat = {
      user_id: this.selectedUserForDetails!.id || this.selectedUserForDetails!._id!,
      contrat_type: formValues.contrat_type,
      working_period: formValues.working_period,
      start_time: formValues.start_time,
      contrat_hour_week: formValues.contrat_hour_week,
      contrat_hour_day: formValues.contrat_hour_day,
      work_days: formValues.work_days.map((workDay: any) => ({
        day: workDay.day,
        start_time: this.formatTime(workDay.start_time),
        end_time: this.formatTime(workDay.end_time),
      })),
    };

    if (this.isContratEditMode && this.selectedContrat?.id) {
      this.contratService.updateContrat(this.selectedContrat.id, contratData).subscribe({
        next: () => {
          this.showSuccess('Contrat mis à jour avec succès');
          this.loadContrat(this.selectedUserForDetails!);
          this.closeContratDialog();
        },
        error: (err) => {
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
}