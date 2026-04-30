import { Component, OnInit, OnDestroy, ViewEncapsulation, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

// PrimeNG
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';

// Services
import { AbsenceService } from '../../../services/absence/absence.service';
import { UserService } from '../../../services/user/user.service';
import { CodeService } from '../../../services/code/code.service';
import { AuthService } from '../../../services/auth/auth.service';
import { PlanningExchangeService, CompatibleAgent } from '../../../services/planning-exchange/planning-exchange.service';
import { AlertsRttService } from '../../../services/alerts-rtt/alerts-rtt.service';

// Models
import { User } from '../../../models/User';
import { Code } from '../../../models/services';
import { CreateAbsenceRequest } from '../../../dtos/request/CreateAbsenceRequest';
import { Response } from '../../../dtos/response/Response';

type Step = 'calendar' | 'exchange' | 'absence-form';

@Component({
  selector: 'app-report-absence',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    InputTextModule,
    TextareaModule,
    ToastModule,
    TagModule,
    ProgressSpinnerModule,
  ],
  templateUrl: './report-absence.component.html',
  styleUrls: ['./report-absence.component.css'],
  encapsulation: ViewEncapsulation.None,
  providers: [MessageService, AuthService]
})
export class ReportAbsenceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ── Wizard state ──────────────────────────────────────────────────────────
  step: Step = 'calendar';
  selectedDate: Date | null = null;
  selectedDateStr = '';
  isEligibleForExchange = false;   // >= 60 jours
  today = new Date();

  // ── User / service ────────────────────────────────────────────────────────
  currentUser: User | null = null;
  serviceId: string | null = null;
  isLoading = true;

  // ── Exchange step ─────────────────────────────────────────────────────────
  compatibleAgents: CompatibleAgent[] = [];
  loadingAgents = false;
  requesterPlanningId = '';
  requesterActivityCode = '';
  selectedAgent: CompatibleAgent | null = null;
  selectedTargetPlanning: any = null;
  exchangeMessage = '';
  submittingExchange = false;

  // Dates de récupération que A propose à B
  myRestDays: { planning_id: string; date: string; activity_code: string; plage_horaire: string; b_activity_code?: string; b_planning_id?: string; b_plage_horaire?: string }[] = [];
  loadingMyRestDays = false;
  proposedRecoveryDates: { planning_id: string; date: string; activity_code: string; plage_horaire: string; b_activity_code?: string; b_planning_id?: string }[] = [];
  recoveryStepDone = false;

  // ── Absence form ──────────────────────────────────────────────────────────
  reportForm!: FormGroup;
  codeAbsence: Code[] = [];
  submittingAbsence = false;
  caConflictWarning: string | null = null;  // avertissement collègues en congé
  checkingCaConflict = false;

  constructor(
    private fb: FormBuilder,
    private absenceService: AbsenceService,
    private userService: UserService,
    private codeService: CodeService,
    private authService: AuthService,
    private planningExchangeService: PlanningExchangeService,
    private alertsRttService: AlertsRttService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.buildAbsenceForm();
    this.loadCurrentUser();
    this.loadCodes();
    // Force la détection de changements pour éviter le flash de thème sombre au premier chargement
    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  ngAfterViewInit(): void {
    // Force la détection de changements après le rendu initial
    // pour éviter le problème de thème sombre au premier chargement
    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Form builder ──────────────────────────────────────────────────────────
  private buildAbsenceForm(): void {
    this.reportForm = this.fb.group({
      absenceCodeId: ['', Validators.required],
      startHour:     ['', Validators.required],
      endHour:       ['', Validators.required],
      reason:        ['', Validators.required],
      comment:       [''],
    }, { validators: [this.timeRangeValidator] });
  }

  timeRangeValidator(g: FormGroup): { [k: string]: boolean } | null {
    const s = g.get('startHour')?.value;
    const e = g.get('endHour')?.value;
    if (s instanceof Date && e instanceof Date && !isNaN(s.getTime()) && !isNaN(e.getTime())) {
      if (s.getTime() >= e.getTime()) return { invalidTimeRange: true };
    }
    return null;
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  loadCurrentUser(): void {
    this.authService.getUserInfo()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user: User | null) => {
          this.currentUser = user;
          this.serviceId = user?.service_id || null;
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
  }

  loadCodes(): void {
    this.codeService.syncCodesFromPlannings().subscribe({
      next: () => this.fetchCodes(),
      error: () => this.fetchCodes()
    });
  }

  private fetchCodes(): void {
    this.codeService.findAllCodes()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (r: Response<Code[]>) => { this.codeAbsence = r?.data || []; },
        error: () => {}
      });
  }

  // ── STEP 1 : Calendar ─────────────────────────────────────────────────────
  onDateSelected(date: Date): void {
    this.selectedDate = date;
    this.selectedDateStr = this.formatDate(date);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / 86400000);

    this.isEligibleForExchange = diffDays >= 60;

    if (this.isEligibleForExchange) {
      this.step = 'exchange';
      this.loadCompatibleAgents();
    } else {
      this.step = 'absence-form';
      // Vérifier les conflits CA dès la sélection de la date
      if (this.currentUser?._id && this.serviceId) {
        this.checkCaConflict();
      }
    }
  }

  // ── STEP 2a : Exchange ────────────────────────────────────────────────────
  loadCompatibleAgents(): void {
    if (!this.currentUser?._id || !this.selectedDateStr) return;
    this.loadingAgents = true;
    this.compatibleAgents = [];
    this.selectedAgent = null;
    this.selectedTargetPlanning = null;
    this.proposedRecoveryDates = [];
    this.recoveryStepDone = false;
    this.myRestDays = [];

    this.planningExchangeService.getCompatibleAgents(this.currentUser._id, this.selectedDateStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.compatibleAgents = res.data || [];
          this.requesterPlanningId = res.requester_planning?.planning_id || '';
          this.requesterActivityCode = res.requester_planning?.activity_code || '';
          this.loadingAgents = false;
          // Les repos sont chargés après sélection de l'agent (voir selectAgent)
        },
        error: (err: any) => {
          this.loadingAgents = false;
          if (err.status === 400) {
            this.messageService.add({
              severity: 'info',
              summary: 'Aucun planning',
              detail: 'Vous n\'avez pas de planning validé à cette date. Redirigé vers la demande d\'absence.',
              life: 5000
            });
            this.step = 'absence-form';
          }
        }
      });
  }

  loadMyRestDays(): void {
    if (!this.currentUser?._id) return;
    this.loadingMyRestDays = true;
    // Passer le target_id pour filtrer uniquement les dates où B travaille
    const targetId = this.selectedAgent?._id;
    this.planningExchangeService.getMyRestDays(this.currentUser._id, targetId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => { this.myRestDays = res.data || []; this.loadingMyRestDays = false; },
        error: () => { this.myRestDays = []; this.loadingMyRestDays = false; }
      });
  }

  toggleProposedRecoveryDate(day: { planning_id: string; date: string; activity_code: string; plage_horaire: string }): void {
    const idx = this.proposedRecoveryDates.findIndex(d => d.date === day.date);
    if (idx >= 0) this.proposedRecoveryDates.splice(idx, 1);
    else this.proposedRecoveryDates.push(day);
  }

  isProposedRecoveryDate(date: string): boolean {
    return this.proposedRecoveryDates.some(d => d.date === date);
  }

  selectAgent(agent: CompatibleAgent): void {
    this.selectedAgent = agent;
    this.selectedTargetPlanning = null;
    this.proposedRecoveryDates = [];
    this.recoveryStepDone = false;
    // Charger les dates où A est en repos ET B travaille
    this.loadMyRestDays();
  }

  selectTargetPlanning(planning: any): void {
    this.selectedTargetPlanning = planning;
  }

  submitExchange(): void {
    if (!this.currentUser?._id || !this.selectedAgent || !this.requesterPlanningId) return;

    this.submittingExchange = true;
    const data = {
      requester_id: this.currentUser._id,
      target_id: this.selectedAgent._id,
      requester_date: this.selectedDateStr,
      target_date: '',
      requester_planning_id: this.requesterPlanningId,
      target_planning_id: '',
      message: this.exchangeMessage,
      proposed_recovery_dates: this.proposedRecoveryDates
    };

    this.planningExchangeService.createExchangeRequest(data)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.submittingExchange = false;
          this.messageService.add({
            severity: 'success',
            summary: 'Demande envoyée',
            detail: `Proposition d'échange envoyée à ${this.selectedAgent!.first_name} ${this.selectedAgent!.last_name}. L'échange sera appliqué automatiquement si accepté.`,
            life: 8000
          });
          this.reset();
        },
        error: (err: any) => {
          this.submittingExchange = false;
          const detail = err.error?.detail;
          if (err.status === 422 && detail?.error_code === 'EXCHANGE_TOO_SOON') {
            // Ne devrait pas arriver ici (on a déjà vérifié), mais au cas où
            this.messageService.add({ severity: 'warn', summary: 'Échange impossible', detail: detail.message, life: 8000 });
            this.step = 'absence-form';
          } else {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: typeof detail === 'string' ? detail : 'Erreur lors de la demande d\'échange' });
          }
        }
      });
  }

  goToAbsenceForm(): void {
    this.step = 'absence-form';
    this.caConflictWarning = null;
    // Vérifier les conflits CA dès l'ouverture du formulaire
    if (this.currentUser?._id && this.serviceId && this.selectedDateStr) {
      this.checkCaConflict();
    }
  }

  /** Vérifie si des collègues sont déjà en congé sur la période sélectionnée */
  checkCaConflict(): void {
    if (!this.currentUser?._id || !this.serviceId || !this.selectedDateStr) return;
    this.checkingCaConflict = true;
    this.alertsRttService.checkCaConflict(
      this.currentUser._id,
      this.serviceId,
      this.selectedDateStr,
      this.selectedDateStr
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.caConflictWarning = res.warning;
        this.checkingCaConflict = false;
      },
      error: () => { this.checkingCaConflict = false; }
    });
  }

  // ── STEP 2b : Absence form ────────────────────────────────────────────────
  submitAbsence(): void {
    if (this.reportForm.invalid || !this.currentUser?._id || !this.serviceId || !this.selectedDate) {
      this.reportForm.markAllAsTouched();
      return;
    }

    this.submittingAbsence = true;
    const v = this.reportForm.value;
    const absenceData: CreateAbsenceRequest = {
      staff_id: this.currentUser._id,
      start_date: this.selectedDateStr,
      start_hour: this.formatTime(v.startHour),
      end_date: this.selectedDateStr,
      end_hour: this.formatTime(v.endHour),
      reason: v.reason,
      comment: v.comment || '',
      service_id: this.serviceId,
      absence_code_id: v.absenceCodeId,
      status: 'En cours'
    };

    this.absenceService.createAbsence(absenceData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.submittingAbsence = false;
          this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Demande d\'absence envoyée à l\'encadrement' });
          // Vérifier les heures sup après soumission
          if (this.currentUser?._id) {
            this.alertsRttService.checkAndNotifyOvertime(this.currentUser._id).subscribe();
          }
          this.reset();
        },
        error: (err: any) => {
          this.submittingAbsence = false;
          this.messageService.add({ severity: 'error', summary: 'Erreur', detail: err.error?.message || 'Erreur lors de la soumission' });
        }
      });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  reset(): void {
    this.step = 'calendar';
    this.selectedDate = null;
    this.selectedDateStr = '';
    this.compatibleAgents = [];
    this.selectedAgent = null;
    this.selectedTargetPlanning = null;
    this.exchangeMessage = '';
    this.myRestDays = [];
    this.proposedRecoveryDates = [];
    this.recoveryStepDone = false;
    this.reportForm.reset();
  }

  formatDate(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatDateDisplay(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  formatTime(t: Date | string): string {
    if (typeof t === 'string') return t;
    if (!(t instanceof Date) || isNaN(t.getTime())) return '00:00';
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  }

  daysUntil(dateStr: string): number {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
  }
}
