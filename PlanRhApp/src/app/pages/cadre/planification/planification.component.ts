import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';

// FullCalendar
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import multiMonthPlugin from '@fullcalendar/multimonth';

// PrimeNG Modules
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { ToastModule } from 'primeng/toast';
import { MessageService, ConfirmationService } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { CalendarModule } from 'primeng/calendar';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip'; // 🔥 NOUVEAU

// Services
import { PlanificationService, PlanningAgent, PlanningCell, PlanningWeek, PlanningFilters } from '../../../services/planification/planification.service';
import { AuthService } from '../../../services/auth/auth.service';
import { ContratService, Contrat, WorkDay } from '../../../services/contrat/contrat.service';
import { CalendarSyncService } from '../../../services/calendar-sync/calendar-sync.service';
import { PlanificationStateService } from '../../../services/planification-state/planification-state.service';
import { ServiceService } from '../../../services/service/service.service';
import { ActiviteService, Activite } from '../../../services/activite/activite.service';
import { WeeklyNeedsService, WeeklyNeed } from '../../../services/weekly-needs/weekly-needs.service';
import { PlanningOptimizationService, OptimizationRequest, PlanningAssignment } from '../../../services/planning-optimization/planning-optimization.service';
import { SpecialityService } from '../../../services/speciality/speciality.service'; // 🔥 NOUVEAU
import { PlanningService } from '../../../services/planning/planning.service';
import { forkJoin } from 'rxjs';
import * as XLSX from 'xlsx';

// Interface pour le modèle du formulaire, gérant les objets Date pour p-calendar
interface ActiviteFormModel extends Omit<Activite, 'heureDebut' | 'heureFin' | '_id'> {
  _id?: string;
  heureDebut: Date | string;
  heureFin: Date | string;
}

@Component({
  selector: 'app-planification',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FullCalendarModule,
    DialogModule,
    ButtonModule,
    DropdownModule,
    ToastModule,
    CardModule,
    ProgressSpinnerModule,
    TableModule,
    InputTextModule,
    CalendarModule,
    ConfirmDialogModule,
    TooltipModule
  ],
  templateUrl: './planification.component.html',
  styleUrls: ['./planification.component.css'],
  encapsulation: ViewEncapsulation.None,
  providers: [ConfirmationService]
})
export class PlanificationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Données
  agents: PlanningAgent[] = [];
  planningCells: PlanningCell[] = [];
  planningWeeks: PlanningWeek[] = [];
  userContrats: { [userId: string]: Contrat | null } = {}; // Stocker les contrats par utilisateur
  deletedCells: Array<{agent_id: string, date: string}> = []; // Cellules supprimées à persister en base
  
  // Filtres
  filters: PlanningFilters = {
    annee: new Date().getFullYear(),
    mois: new Date().getMonth() + 1,
    semaine: 0,
    jour: undefined,
    role: '',
    service_id: ''
  };
  
  // Options des filtres
  annees: number[] = [];
  mois: {label: string, value: number}[] = [];
  semaines: {label: string, value: number}[] = [];
  jours: {label: string, value: number}[] = [];
  roles: {label: string, value: string}[] = [];
  services: {label: string, value: string}[] = [];
  specialities: {label: string, value: string}[] = [];
  selectedSpecialityId: string = '';
  currentServiceName: string = '';
  
  // États
  editMode = false;
  hasChanges = false;
  showSimulationModal = false;
  showEditModal = false;
  showSimulationOptions = false;
  showPlanMenu = false; // Menu Plan dropdown

  // Mode de vue du planning
  viewMode: 'day' | 'week' | 'month' | 'year' = 'week';

  get isYearView(): boolean { return this.viewMode === 'year'; }
  get isMonthView(): boolean { return this.viewMode === 'month'; }
  get isCompactView(): boolean { return this.viewMode === 'month' || this.viewMode === 'year'; }

  // Options FullCalendar pour la vue Année
  yearCalendarReady = false;
  yearPlanningCells: PlanningCell[] = []; // Cache des données annuelles
  yearCalendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, multiMonthPlugin],
    initialView: 'multiMonthYear',
    events: [],
    headerToolbar: false,
    views: {
      multiMonthYear: {
        type: 'multiMonth',
        duration: { months: 12 },
        multiMonthMaxColumns: 3,
        fixedWeekCount: false
      }
    },
    firstDay: 1,
    dayMaxEvents: 3,
    eventContent: (arg: any) => {
      const code = arg.event.extendedProps.activityCode || '';
      const color = arg.event.backgroundColor || '#065594';
      return {
        html: `<span style="background:${color};color:#fff;padding:1px 4px;border-radius:3px;font-size:0.7rem;font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${code}</span>`
      };
    }
  };

  // Agents sélectionnés pour la simulation service réduit
  selectedAgentsForSim: Set<string> = new Set();
  showPublishOptions = false;
  loading = false;
  loadingMessage = 'Chargement des données...';
  loadingProgress = 0;
  
  // États pour optimisation et semaine type
  showImportWeeklyNeedsModal = false;
  showGeneratePlanningModal = false;
  showExcelFormatHelpModal = false;
  weeklyNeedsData: WeeklyNeed[] = [];
  dailyNeedsOverrides: {date: string, needs: {J02?: number, J1?: number, JB?: number}}[] = [];
  weeklyNeedsLoaded = false;
  savingWeeklyNeeds = false;
  generatingPlanning = false;
  optimizationStartDate: Date = new Date();
  today: Date = new Date();
  generationErrorMessage = '';
  
  // Édition manuelle
  selectedAgentId: string = '';
  selectedDate: string = '';
  selectedActivityCode: string = '';
  
  // États pour la gestion des activités
  showActiviteModal = false;
  activitesPersonnalisees: Activite[] = [];
  activiteEnEdition: ActiviteFormModel = this.getEmptyActiviteFormModel();
  savingActivity = false; // Pour le spinner sur le bouton

  // Codes d'activité système (non modifiables)
  systemActivityCodes = [
    // Codes jour
    {label: 'J02 - Service 6:45-18:45 (12h)', value: 'J02'},
    {label: 'J1 - Service 7:15-19:45 (12.5h)', value: 'J1'},
    {label: 'JB - Service 8:00-20:00 (12h)', value: 'JB'},
    // Codes matin
    {label: 'M06 - Matin 6:00-13:30', value: 'M06'},
    {label: 'M13 - Matin 13:00-20:30', value: 'M13'},
    {label: 'M15 - Matin 15:00-22:30', value: 'M15'},
    // Codes soir/nuit
    {label: 'S07 - Soir 7:00-19:30', value: 'S07'},
    {label: 'Nsr - Nuit standard', value: 'Nsr'},
    {label: 'Nsr3 - Nuit standard 3', value: 'Nsr3'},
    {label: 'Nld - Nuit longue durée', value: 'Nld'},
    // Repos et congés
    {label: 'RH - Repos hebdomadaire', value: 'RH'},
    {label: 'RJF - Repos jour férié', value: 'RJF'},
    {label: 'CA - Congé annuel', value: 'CA'},
    {label: 'RTT - Réduction temps travail', value: 'RTT'},
    // Heures et formations
    {label: 'HS-1 - Heures supplémentaires -1', value: 'HS-1'},
    {label: 'H- - Heures négatives', value: 'H-'},
    {label: 'FCJ - Formation continue jour', value: 'FCJ'},
    {label: 'TP - Temps partiel', value: 'TP'},
    // Autres
    {label: '? - Non défini', value: '?'},
    {label: '--- Supprimer ---', value: ''} // Option pour supprimer le code d'activité
  ];

  // La liste complète sera une combinaison des deux
  activityCodes: {label: string, value: string}[] = [];

  loggedInUser: any = null; // Pour stocker l'utilisateur connecté et son service_id

  // Demandes de modification en attente (soumises par les agents)
  pendingPlanningRequests: any[] = [];
  highlightedPlanningId: string | null = null;
  highlightedAgentId: string | null = null;
  highlightedDate: string | null = null;
  showPendingRequestsPanel = false;

  constructor(
    private planificationService: PlanificationService,
    private authService: AuthService,
    private messageService: MessageService,
    private contratService: ContratService,
    private calendarSyncService: CalendarSyncService,
    private planificationStateService: PlanificationStateService,
    private serviceService: ServiceService,
    private activiteService: ActiviteService,
    private confirmationService: ConfirmationService,
    private weeklyNeedsService: WeeklyNeedsService,
    private planningOptimizationService: PlanningOptimizationService,
    private specialityService: SpecialityService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private planningService: PlanningService,
    private el: ElementRef
  ) {}

  ngOnInit(): void {
    // 🔥 MODIFIÉ: Afficher directement la semaine en cours
    this.showCurrentWeek();
    
    this.initializeFilters();
    this.initializeRoleOptions();
    this.updateActivityCodesList();
    
    this.authService.getUserInfo().subscribe({
      next: (user: any) => {
        this.loggedInUser = user;
        
        if (user && user.service_id) {
          this.filters.service_id = user.service_id;
        }
        
        this.loadServices();
        this.loadSpecialities();
        this.loadActivites();
        this.loadWeeklyNeedsForDisplay();
        
        // Vider l'état sauvegardé
        this.planificationStateService.clearState();
        localStorage.removeItem('planification_deleted_cells');
        this.deletedCells = [];

        // Lire les query params UNE SEULE FOIS, appliquer les filtres, puis charger
        this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
          // Stocker les infos de mise en évidence
          if (params['planning_id']) {
            this.highlightedPlanningId = params['planning_id'];
            this.showPendingRequestsPanel = true;
          }
          if (params['user_id']) {
            this.highlightedAgentId = params['user_id'];
          }
          if (params['date']) {
            this.highlightedDate = params['date'];
            // Naviguer à la semaine correspondante AVANT de charger
            const targetDate = new Date(params['date']);
            if (!isNaN(targetDate.getTime())) {
              this.filters.annee = targetDate.getFullYear();
              this.filters.mois = targetDate.getMonth() + 1;
              this.filters.semaine = this.getWeekNumber(targetDate);
              this.updateWeeksOfYear();
            }
          }

          // Charger les données UNE SEULE FOIS avec les bons filtres
          this.loadData(true);

          // Charger les demandes en attente
          if (user?.service_id) {
            this.loadPendingRequests(user.service_id);
          }
        });
      },
      error: (error) => {
        console.error('Erreur lors du chargement de l\'utilisateur:', error);
        this.loadServices();
        this.loadActivites();
        this.loadData();
      }
    });
  }
  /**
   * Fusionne les codes système et personnalisés pour les menus déroulants.
   */
  updateActivityCodesList(): void {
    const customCodes = this.activitesPersonnalisees.map(a => ({
      label: `${a.code} - ${a.libelle}`,
      value: a.code
    }));
    this.activityCodes = [...this.systemActivityCodes, ...customCodes];
  }

  // --- DEMANDES DE MODIFICATION EN ATTENTE ---

  loadPendingRequests(serviceId: string): void {
    this.planningService.getPendingRequests(serviceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.pendingPlanningRequests = res.data || [];
          if (this.pendingPlanningRequests.length > 0) {
            this.showPendingRequestsPanel = true;
          }
          // Scroller vers la demande mise en évidence après un court délai (rendu)
          if (this.highlightedPlanningId) {
            setTimeout(() => this.scrollToHighlightedRequest(), 400);
          }
        },
        error: () => {}
      });
  }

  scrollToHighlightedRequest(): void {
    // Scroller vers le panneau des demandes en attente
    const panel = this.el.nativeElement.querySelector('.pending-requests-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Scroller vers la cellule mise en évidence dans le tableau
    if (this.highlightedAgentId && this.highlightedDate) {
      setTimeout(() => {
        const highlighted = this.el.nativeElement.querySelector('.planning-cell.pending-highlight');
        if (highlighted) {
          highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 600);
    }
  }

  validateRequest(request: any): void {
    this.planningService.validatePlanningRequest(request._id, 'validé', this.loggedInUser?._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Validé', detail: `Modification de ${request.user_name} validée` });
          this.pendingPlanningRequests = this.pendingPlanningRequests.filter(r => r._id !== request._id);
          if (this.pendingPlanningRequests.length === 0) this.showPendingRequestsPanel = false;
          this.loadData();
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de valider' })
      });
  }

  refuseRequest(request: any): void {
    this.planningService.validatePlanningRequest(request._id, 'refusé', this.loggedInUser?._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.messageService.add({ severity: 'warn', summary: 'Refusé', detail: `Modification de ${request.user_name} refusée` });
          this.pendingPlanningRequests = this.pendingPlanningRequests.filter(r => r._id !== request._id);
          if (this.pendingPlanningRequests.length === 0) this.showPendingRequestsPanel = false;
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de refuser' })
      });
  }

  isPendingHighlighted(request: any): boolean {
    return this.highlightedPlanningId === request._id;
  }

  isCellHighlighted(agentId: string, date: string): boolean {
    return this.highlightedAgentId === agentId && this.highlightedDate === date;
  }

  isCellPlanningRequest(agentId: string, date: string): boolean {
    const cell = this.planningCells.find(c => c.agent_id === agentId && c.date === date);
    return !!(cell?.is_planning_request);
  }

  /**
   * Navigue à la semaine de la demande et met en évidence la cellule correspondante
   */
  navigateToRequestWeek(request: any): void {
    if (!request.date) return;
    const targetDate = new Date(request.date);
    if (isNaN(targetDate.getTime())) return;

    this.highlightedAgentId = request.user_id;
    this.highlightedDate = request.date;
    this.highlightedPlanningId = request._id;

    this.filters.annee = targetDate.getFullYear();
    this.filters.mois = targetDate.getMonth() + 1;
    this.filters.semaine = this.getWeekNumber(targetDate);
    this.updateWeeksOfYear();
    this.loadData(true);

    // Scroller vers la cellule après le chargement
    setTimeout(() => {
      const highlighted = this.el.nativeElement.querySelector('.planning-cell.pending-highlight');
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 800);
  }

  // --- MÉTHODES POUR LA GESTION DES ACTIVITÉS ---

  /**
   * Ouvre la modale et charge les activités.
   */
  openActiviteModal(): void {
    this.showActiviteModal = true;
    this.resetActiviteForm();
  }

  /**
   * Charge les activités personnalisées depuis le backend.
   */
  loadActivites(): void {
    this.activiteService.getActivites().subscribe({
      next: (activites) => {
        this.activitesPersonnalisees = activites;
        this.updateActivityCodesList();
      },
      error: (err) => {
        console.error('Erreur lors du chargement des activités', err);
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger les activités' });
      }
    });
  }

  /**
   * Sauvegarde (ajoute ou met à jour) une activité.
   */
  saveActivite(): void {
    // Amélioration 1: Vérifier si l'utilisateur est bien chargé
    if (!this.loggedInUser || !this.loggedInUser.service_id) {
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de récupérer les informations de l\'utilisateur. Veuillez recharger la page.' });
        return;
    }

    if (!this.activiteEnEdition.code || !this.activiteEnEdition.libelle || !this.activiteEnEdition.heureDebut || !this.activiteEnEdition.heureFin) {
      this.messageService.add({ severity: 'warn', summary: 'Attention', detail: 'Tous les champs sont requis.' });
      return;
    }
    
    this.savingActivity = true;

    // Amélioration 2: Créer un payload propre avec les dates formatées
    const payload: Activite = {
      ...this.activiteEnEdition,
      _id: this.activiteEnEdition._id,
      heureDebut: this.formatTime(this.activiteEnEdition.heureDebut),
      heureFin: this.formatTime(this.activiteEnEdition.heureFin),
      service_id: this.loggedInUser.service_id
    };

    const operation = payload._id
      ? this.activiteService.updateActivite(payload._id, payload)
      : this.activiteService.addActivite(payload);

    operation.subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Succès', detail: `Activité sauvegardée.` });
        this.loadActivites();
        this.resetActiviteForm();
        this.savingActivity = false;
      },
      error: (err) => {
        // Amélioration 3: Afficher le message d'erreur du backend
        const detail = err.error?.message || err.error?.detail || 'Une erreur inattendue est survenue.';
        this.messageService.add({ severity: 'error', summary: 'Échec de la sauvegarde', detail: detail });
        this.savingActivity = false;
      }
    });
  }

  /**
   * Prépare le formulaire pour éditer une activité existante.
   * Convertit les heures (string) en objets Date pour p-calendar.
   */
  editActivite(activite: Activite): void {
    this.activiteEnEdition = { 
      ...activite,
      heureDebut: this.stringToDate(activite.heureDebut),
      heureFin: this.stringToDate(activite.heureFin)
    };
  }

  /**
   * Supprime une activité après confirmation.
   */
  deleteActivite(activite: Activite): void {
    this.confirmationService.confirm({
        message: `Êtes-vous sûr de vouloir supprimer l'activité "${activite.libelle}" ?`,
        accept: () => {
            if (activite._id) {
              this.activiteService.deleteActivite(activite._id).subscribe({
                next: () => {
                  this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Activité supprimée.' });
                  this.loadActivites();
                },
                error: (err) => {
                  this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de supprimer l\'activité.' });
                }
              });
            }
        }
    });
  }

  /**
   * Réinitialise le formulaire d'édition.
   */
  resetActiviteForm(): void {
    this.activiteEnEdition = this.getEmptyActiviteFormModel();
  }

  /**
   * Formate un objet Date (de p-calendar) ou une chaîne de caractères en une chaîne HH:mm.
   */
  formatTime(date: string | Date): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Convertit une chaîne "HH:mm" en un objet Date pour l'affichage dans p-calendar.
   */
  private stringToDate(timeStr: string): Date {
    if (!timeStr || !timeStr.includes(':')) {
        const defaultDate = new Date();
        defaultDate.setHours(0, 0, 0, 0);
        return defaultDate;
    }
    const date = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  // --- FIN DES MÉTHODES ---

  /**
   * Restaurer l'état sauvegardé au lieu de recharger depuis le serveur
   */
  restoreSavedState(): void {
    console.log('Restauration de l\'état sauvegardé de la simulation');
    
    // Restaurer les filtres
    const savedFilters = this.planificationStateService.getFilters();
    if (savedFilters) {
      this.filters = { ...savedFilters, jour: (savedFilters as any).jour ?? new Date().getDate() };
      this.initializeFilters();
    }
    
    // Restaurer les suppressions sauvegardées (si pas déjà fait dans ngOnInit)
    const savedDeletedCells = localStorage.getItem('planification_deleted_cells');
    if (savedDeletedCells && this.deletedCells.length === 0) {
      try {
        this.deletedCells = JSON.parse(savedDeletedCells);
      } catch (e) {
        console.error('Erreur lors de la restauration des suppressions:', e);
        this.deletedCells = [];
      }
    }
    
    // Charger les agents et semaines nécessaires (sans recharger le planning)
    this.loadAgents();
    
    // Restaurer les cellules après un court délai pour laisser les agents se charger
    setTimeout(() => {
      const savedCells = this.planificationStateService.getPlanningCells();
      if (savedCells.length > 0) {
        this.planningCells = savedCells;
        this.hasChanges = this.planificationStateService.getHasChanges();
        
        // Forcer la mise à jour de l'affichage
        this.planningCells = [...this.planningCells];
        
        console.log(`État restauré: ${savedCells.length} cellules, hasChanges: ${this.hasChanges}, suppressions: ${this.deletedCells.length}`);
        
        // Charger les disponibilités en arrière-plan (sans écraser les modifications)
        // Ne pas appeler loadPlanningData() pour éviter de réécraser les modifications
        this.loadAvailabilities();
      } else {
        // Si pas d'état sauvegardé, charger normalement
        this.loadData();
      }
    }, 500);
  }

  private getEmptyActiviteFormModel(): ActiviteFormModel {
    return {
      code: '',
      libelle: '',
      heureDebut: '',
      heureFin: '',
      service_id: this.loggedInUser?.service_id || ''
    };
  }

  loadUser(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: any) => {
        this.loggedInUser = user;
      },
      error: (error) => {
        console.error('Erreur lors du chargement de l\'utilisateur:', error);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Tâche 1.3.1 : Initialisation des filtres
  initializeFilters(): void {
    // Générer les années (année actuelle ± 2)
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 2; i <= currentYear + 2; i++) {
      this.annees.push(i);
    }
    
    // Générer les mois
    this.mois = [
      {label: 'Janvier', value: 1},
      {label: 'Février', value: 2},
      {label: 'Mars', value: 3},
      {label: 'Avril', value: 4},
      {label: 'Mai', value: 5},
      {label: 'Juin', value: 6},
      {label: 'Juillet', value: 7},
      {label: 'Août', value: 8},
      {label: 'Septembre', value: 9},
      {label: 'Octobre', value: 10},
      {label: 'Novembre', value: 11},
      {label: 'Décembre', value: 12}
    ];
    
    // Générer les semaines de l'année
    this.updateWeeksOfYear();
    // Générer les jours du mois courant
    this.updateJours();
  }

  updateJours(): void {
    const daysInMonth = new Date(this.filters.annee, this.filters.mois, 0).getDate();
    this.jours = Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      value: i + 1
    }));
    // S'assurer que le jour sélectionné est valide
    if ((this.filters.jour ?? 1) > daysInMonth) {
      this.filters.jour = daysInMonth;
    }
  }

  // Initialiser les options de rôles
  initializeRoleOptions(): void {
    this.roles = [
      { label: 'Tous les rôles', value: '' },
      { label: 'Agent de santé', value: 'nurse' },
      { label: 'Secrétaire', value: 'secretaire' },
      { label: 'Vacataire', value: 'vacataire' }
    ];
  }

  // Charger les services disponibles
  loadServices(): void {
    this.serviceService.findAllServices()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('📥 Réponse services:', response);
          const servicesData = response?.data || [];
          console.log(`✅ ${servicesData.length} services chargés`);
          
          this.services = [
            { label: 'Tous les services', value: '' },
            ...servicesData.map((service: any) => ({
              label: service.name || service.label || 'Service sans nom',
              value: service.id || service._id || ''
            }))
          ];
          
          // 🔥 NOUVEAU: Récupérer le nom du service du cadre connecté
          if (this.loggedInUser?.service_id) {
            const currentService = this.services.find(s => s.value === this.loggedInUser.service_id);
            this.currentServiceName = currentService?.label || 'Service non trouvé';
            console.log('✅ Nom du service actuel:', this.currentServiceName);
          }
          
          console.log('✅ Services mappés:', this.services.length);
        },
        error: (error) => {
          console.error('❌ Erreur lors du chargement des services:', error);
          // En cas d'erreur, au moins avoir l'option "Tous les services"
          this.services = [{ label: 'Tous les services', value: '' }];
          this.currentServiceName = 'Service non disponible';
          this.messageService.add({
            severity: 'warn',
            summary: 'Avertissement',
            detail: 'Impossible de charger la liste des services. Vérifiez votre connexion au serveur.'
          });
        }
      });
  }

  // 🔥 MODIFIÉ: Charger les métiers depuis la collection speciality
  loadSpecialities(): void {
    this.specialityService.findAllSpecialities()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('📥 Réponse métiers:', response);
          const specialitiesData = response?.data || [];
          console.log(`✅ ${specialitiesData.length} métiers chargés`);
          
          this.specialities = [
            { label: 'Tous les métiers', value: '' },
            ...specialitiesData.map((speciality: any) => ({
              label: speciality.name || 'Métier sans nom',
              value: speciality.id || speciality._id || ''
            }))
          ];
          
          console.log('✅ Métiers mappés:', this.specialities.length);
        },
        error: (error) => {
          console.error('❌ Erreur lors du chargement des métiers:', error);
          this.specialities = [{ label: 'Tous les métiers', value: '' }];
          this.messageService.add({
            severity: 'warn',
            summary: 'Avertissement',
            detail: 'Impossible de charger la liste des métiers.'
          });
        }
      });
  }

  // Tâche 1.3.1 : Chargement des données
  loadData(forceReload: boolean = false): void {
    this.loading = true;
    this.loadingMessage = 'Chargement des agents...';
    this.loadingProgress = 25;
    this.loadAgents();
    this.loadPlanningData(forceReload);
    this.loadAvailabilities();
    // Précharger les données annuelles en arrière-plan
    this.preloadYearData();
  }

  preloadYearData(): void {
    this.planificationService.getPlanningData(this.filters, 'year')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          const validAgentIds = new Set(this.agents.map(a => String(a.id)));
          this.yearPlanningCells = data.filter(c => validAgentIds.size === 0 || validAgentIds.has(String(c.agent_id)));
        },
        error: () => {} // Silencieux — pas critique
      });
  }

  loadAgents(): void {
    // Utiliser les utilisateurs existants comme agents
    this.planificationService.getUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          if (!users || users.length === 0) {
            console.warn('⚠️ Aucun utilisateur trouvé dans la base de données');
            this.agents = [];
            this.loading = false;
            return;
          }
          
          console.log('✅ Utilisateurs chargés depuis l\'API:', users.length);
          
          // Filtrer les utilisateurs selon les critères
          let filteredUsers = users.filter(user => {
            // Exclure les cadres
            if (user.role === 'cadre') {
              return false;
            }
            
            // Filtrer par service
            // Si un service spécifique est sélectionné, filtrer par ce service
            // Si "Tous les services" est sélectionné (service_id vide), ne pas filtrer par service
            if (this.filters.service_id && this.filters.service_id !== '') {
              // Un service spécifique est sélectionné
              // Comparer les IDs normalisés (string)
              const userServiceId = user.service_id ? String(user.service_id) : '';
              const filterServiceId = String(this.filters.service_id);
              if (userServiceId !== filterServiceId) {
                return false;
              }
            }
            // Sinon, "Tous les services" est sélectionné - inclure tous les utilisateurs
            
            // Filtrer par rôle si un rôle est sélectionné
            if (this.filters.role && this.filters.role !== '') {
              if (user.role !== this.filters.role) {
                return false;
              }
            }
            
            // 🔥 MODIFIÉ: Filtrer par speciality_id si un métier est sélectionné
            if (this.selectedSpecialityId && this.selectedSpecialityId !== '') {
              const userSpecialityId = user.speciality_id ? String(user.speciality_id) : '';
              if (userSpecialityId !== this.selectedSpecialityId) {
                return false;
              }
            }
            
            return true;
          });
          
          console.log(`✅ ${filteredUsers.length} agents filtrés sur ${users.length} utilisateurs`);
          
          this.agents = filteredUsers.map(user => ({
            id: user._id || user.id,
            nom: user.last_name || user.nom || '',
            prenom: user.first_name || user.prenom || '',
            contrat_hebdo: user.contrat_horaire || user.contrat_hebdo || 35,
            service_id: user.service_id || '',
            role: user.role || '',
            speciality_id: user.speciality_id || ''
          }));
          
          console.log('✅ Agents mappés:', this.agents.length);
          
          this.generatePlanningWeeks();
          // Charger les contrats après avoir généré les semaines
          this.loadContratsForAgents();
          this.loading = false;
        },
        error: (error) => {
          console.error('❌ Erreur lors du chargement des agents:', error);
          this.handleError(error, 'chargement des agents');
          this.agents = [];
          this.loading = false;
        }
      });
  }

  loadPlanningData(forceReload: boolean = false): void {
    // Si on a un état sauvegardé et qu'on ne force pas le rechargement, ne pas charger
    if (!forceReload && this.planificationStateService.hasSavedState() && this.planningCells.length > 0) {
      console.log('État sauvegardé détecté, pas de rechargement du planning');
      return;
    }
    
    this.planificationService.getPlanningData(this.filters, this.viewMode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          console.log('📥 Plannings reçus de l\'API:', data.length);
          console.log('📥 Échantillon:', data.slice(0, 3));
          
          // Filtrer les plannings en_attente pour debug
          const pendingPlannings = data.filter(c => c.statut === 'proposé');
          console.log('📥 Plannings en attente (statut proposé):', pendingPlannings.length);
          if (pendingPlannings.length > 0) {
            console.log('📥 Détails plannings en attente:', pendingPlannings);
          }
          
          // Ne remplacer que si on force le rechargement ou si on n'a pas d'état sauvegardé
          if (forceReload || !this.planificationStateService.hasSavedState()) {
            // Filtrer les cellules dont le user_id ne correspond pas à un agent réel
            const validAgentIds = new Set(this.agents.map(a => String(a.id)));
            console.log('📥 Agents valides:', validAgentIds.size, 'agents');
            
            this.planningCells = data.filter(c => validAgentIds.size === 0 || validAgentIds.has(String(c.agent_id)));
            console.log('📥 Plannings après filtre agents:', this.planningCells.length);
            
            if (this.planningWeeks.length > 0 && this.agents.length > 0) {
              this.generateDefaultPlanningFromContrats();
            }
          }
          this.planningCells = [...this.planningCells];
          if (this.viewMode === 'year') {
            this.refreshYearCalendar();
          }
        },
        error: (error) => {
          this.handleError(error, 'chargement du planning');
          if (forceReload || !this.planificationStateService.hasSavedState()) {
            this.planningCells = [];
            if (this.planningWeeks.length > 0 && this.agents.length > 0) {
              this.generateDefaultPlanningFromContrats();
            }
            this.planningCells = [...this.planningCells];
          }
        }
      });
  }

  // Tâche 1.3.2 : Charger les propositions de disponibilité
  loadAvailabilities(): void {
    this.planificationService.getAvailabilities(this.filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (availabilities) => {
          this.processAvailabilities(availabilities);
          this.loading = false;
        },
        error: (error) => {
          this.handleError(error, 'chargement des disponibilités');
          this.loading = false;
        }
      });
  }

  processAvailabilities(availabilities: any[]): void {
    availabilities.forEach(availability => {
      if (availability.status === 'proposé') {
        const cell: PlanningCell = {
          agent_id: availability.user_id,
          date: availability.date,
          code_activite: 'DISP', // Code spécial pour disponibilité proposée
          statut: 'proposé',
          availability_id: availability._id,
          heureDebut: availability.heureDebut, // Ajouter cette ligne
          heureFin: availability.heureFin     // Ajouter cette ligne
        };
        
        // Vérifier si la cellule existe déjà
        const existingCellIndex = this.planningCells.findIndex(c => 
          c.agent_id === cell.agent_id && c.date === cell.date
        );
        
        if (existingCellIndex >= 0) {
          // Mettre à jour la cellule existante
          this.planningCells[existingCellIndex] = cell;
        } else {
          // Ajouter une nouvelle cellule
          this.planningCells.push(cell);
        }
      }
    });
    // Régénérer le planning par défaut après le traitement des disponibilités
    // pour remplir les cellules vides restantes
    if (this.planningWeeks.length > 0 && this.agents.length > 0) {
      this.generateDefaultPlanningFromContrats();
    }
  }

  // Charger les contrats pour tous les agents
  loadContratsForAgents(): void {
    if (this.agents.length === 0) return;

    this.loadingMessage = `Chargement des contrats (0/${this.agents.length})...`;
    this.loadingProgress = 50;

    // Optimisation: Charger par lots de 5 agents pour éviter de surcharger le serveur
    const batchSize = 5;
    const batches = [];
    
    for (let i = 0; i < this.agents.length; i += batchSize) {
      const batch = this.agents.slice(i, i + batchSize);
      batches.push(batch);
    }

    let completedBatches = 0;
    const totalBatches = batches.length;
    
    batches.forEach((batch, batchIndex) => {
      setTimeout(() => {
        const contratRequests = batch.map(agent => {
          const userId = agent.id;
          return this.contratService.getContratByUserId(userId).pipe(
            takeUntil(this.destroy$)
          );
        });

        forkJoin(contratRequests).subscribe({
          next: (responses) => {
            responses.forEach((response, index) => {
              const agent = batch[index];
              if (response && response.data) {
                this.userContrats[agent.id] = response.data;
              } else {
                this.userContrats[agent.id] = null;
              }
            });
            
            completedBatches++;
            const totalLoaded = completedBatches * batchSize;
            this.loadingMessage = `Chargement des contrats (${Math.min(totalLoaded, this.agents.length)}/${this.agents.length})...`;
            this.loadingProgress = 50 + Math.floor((completedBatches / totalBatches) * 25);
            
            // Si tous les lots sont terminés, générer le planning
            if (completedBatches === totalBatches) {
              this.loadingMessage = 'Génération du planning...';
              this.loadingProgress = 75;
              this.generateDefaultPlanningFromContrats();
              this.loadingProgress = 100;
            }
          },
          error: (error) => {
            console.error(`Erreur lors du chargement du lot ${batchIndex + 1}:`, error);
            completedBatches++;
            
            // Si tous les lots sont terminés (avec ou sans erreur), générer le planning
            if (completedBatches === totalBatches) {
              this.generateDefaultPlanningFromContrats();
              this.loadingProgress = 100;
            }
          }
        });
      }, batchIndex * 500); // Délai de 500ms entre chaque lot
    });
  }

  // Générer le planning par défaut basé sur les contrats
  generateDefaultPlanningFromContrats(): void {
    if (this.planningWeeks.length === 0 || this.agents.length === 0) {
      return;
    }

    const defaultCells: PlanningCell[] = [];

    this.agents.forEach(agent => {
      const contrat = this.userContrats[agent.id];
      if (!contrat || !contrat.work_days || contrat.work_days.length === 0) {
        return; // Pas de contrat ou pas de jours de travail définis
      }

      // Parcourir toutes les semaines de planification
      this.planningWeeks.forEach(week => {
        week.dates.forEach(dateStr => {
          const date = new Date(dateStr);
          const dayOfWeek = date.getDay(); // 0 = Dimanche, 1 = Lundi, etc.

          // Vérifier si ce jour correspond à un jour de travail dans le contrat
          contrat.work_days.forEach((workDay: WorkDay) => {
            const contractDayIndex = this.getDayOfWeekIndexFromName(workDay.day);
            if (contractDayIndex === dayOfWeek) {
              // Vérifier si une cellule existe déjà pour cette date et cet agent
              const existingCell = this.planningCells.find(c => 
                c.agent_id === agent.id && c.date === dateStr
              );

              // Ne créer une cellule par défaut que si aucune cellule n'existe déjà
              // ou si la cellule existante est vide
              if (!existingCell || existingCell.statut === 'vide') {
                defaultCells.push({
                  agent_id: agent.id,
                  date: dateStr,
                  code_activite: 'RH', // Code par défaut pour les jours de travail
                  statut: 'validé',
                  availability_id: undefined
                });
              }
            }
          });
        });
      });
    });

    // Ajouter les cellules par défaut au planning existant
    defaultCells.forEach(cell => {
      // Vérifier à nouveau pour éviter les doublons
      const existingIndex = this.planningCells.findIndex(c => 
        c.agent_id === cell.agent_id && c.date === cell.date
      );
      
      if (existingIndex >= 0) {
        // Si la cellule existe mais est vide, la remplacer
        if (this.planningCells[existingIndex].statut === 'vide' || 
            !this.planningCells[existingIndex].code_activite) {
          this.planningCells[existingIndex] = cell;
        }
      } else {
        // Ajouter la nouvelle cellule
        this.planningCells.push(cell);
      }
    });
    
    // Forcer la détection de changements Angular après génération du planning par défaut
    this.planningCells = [...this.planningCells];
  }


  // Convertir le nom du jour français en index (0-6)
  getDayOfWeekIndexFromName(dayName: string): number {
    const daysMap: { [key: string]: number } = {
      'Dimanche': 0,
      'Lundi': 1,
      'Mardi': 2,
      'Mercredi': 3,
      'Jeudi': 4,
      'Vendredi': 5,
      'Samedi': 6
    };
    return daysMap[dayName] ?? -1;
  }

  // Génération d'une seule semaine de planification (Lundi à Dimanche)
  generatePlanningWeeks(): void {
    this.planningWeeks = [];
    const year = this.filters.annee;

    if (this.viewMode === 'day') {
      // Vue journalière : le jour exact sélectionné via filters.jour
      const d = new Date(this.filters.annee, this.filters.mois - 1, (this.filters.jour ?? 1));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      this.planningWeeks.push({ semaine: this.filters.semaine, annee: year, dates: [`${y}-${m}-${day}`] });
      return;
    }

    if (this.viewMode === 'month') {
      // Vue mensuelle : tous les jours du mois sélectionné
      const month = this.filters.mois - 1;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const dates: string[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, '0');
        const da = String(date.getDate()).padStart(2, '0');
        dates.push(`${y}-${mo}-${da}`);
      }
      this.planningWeeks.push({ semaine: 0, annee: year, dates });
      return;
    }

    if (this.viewMode === 'year') {
      // Vue annuelle : 12 colonnes, une par mois (label = "Jan", "Fév", etc.)
      // On génère le 1er de chaque mois comme date représentative
      const dates: string[] = [];
      for (let month = 0; month < 12; month++) {
        const d = new Date(year, month, 1);
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        dates.push(`${year}-${mo}-01`);
      }
      this.planningWeeks.push({ semaine: 0, annee: year, dates });
      return;
    }

    // Vue hebdomadaire (défaut) : 7 jours à partir du lundi de la semaine sélectionnée
    const startWeek = this.filters.semaine;
    const totalWeeksInYear = this.getNumberOfWeeks(year);

    const dateForYear = new Date(year, 0, 1);
    let weekStart = this.getStartOfWeek(dateForYear, startWeek);

    while (weekStart.getDay() !== 1) {
      weekStart.setDate(weekStart.getDate() + 1);
    }

    const dates: string[] = [];
    for (let j = 0; j < 7; j++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + j);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }

    this.planningWeeks.push({ semaine: startWeek, annee: weekStart.getFullYear(), dates });
  }

  // Navigation par semaine unique
  previousWeeks(): void {
    if (this.viewMode === 'day') {
      const d = new Date(this.filters.annee, this.filters.mois - 1, (this.filters.jour ?? 1) - 1);
      this.filters.annee = d.getFullYear();
      this.filters.mois = d.getMonth() + 1;
      this.filters.jour = d.getDate();
      this.updateJours();
      this.onFilterChange('jour');
    } else if (this.viewMode === 'week') {
      const newWeek = Math.max(1, this.filters.semaine - 1);
      if (this.filters.semaine !== newWeek) {
        this.filters.semaine = newWeek;
        this.onFilterChange('semaine');
      }
    } else if (this.viewMode === 'month') {
      if (this.filters.mois > 1) {
        this.filters.mois--;
      } else {
        this.filters.mois = 12;
        this.filters.annee--;
      }
      this.onFilterChange('mois');
    } else if (this.viewMode === 'year') {
      this.filters.annee--;
      this.onFilterChange('annee');
    }
  }

  nextWeeks(): void {
    if (this.viewMode === 'day') {
      const d = new Date(this.filters.annee, this.filters.mois - 1, (this.filters.jour ?? 1) + 1);
      this.filters.annee = d.getFullYear();
      this.filters.mois = d.getMonth() + 1;
      this.filters.jour = d.getDate();
      this.updateJours();
      this.onFilterChange('jour');
    } else if (this.viewMode === 'week') {
      const totalWeeksInYear = this.getNumberOfWeeks(this.filters.annee);
      if (this.filters.semaine + 1 <= totalWeeksInYear) {
        this.filters.semaine += 1;
        this.onFilterChange('semaine');
      }
    } else if (this.viewMode === 'month') {
      if (this.filters.mois < 12) {
        this.filters.mois++;
      } else {
        this.filters.mois = 1;
        this.filters.annee++;
      }
      this.onFilterChange('mois');
    } else if (this.viewMode === 'year') {
      this.filters.annee++;
      this.onFilterChange('annee');
    }
  }

  setViewMode(mode: 'day' | 'week' | 'month' | 'year'): void {
    this.viewMode = mode;
    if (mode === 'year') {
      if (this.yearPlanningCells.length > 0) {
        // Cache disponible : afficher immédiatement
        this.refreshYearCalendar();
      } else {
        // Pas encore de cache : charger
        this.loadPlanningData(true);
      }
    } else {
      this.generatePlanningWeeks();
      this.refreshPlanningCells();
    }
  }

  buildYearCalendarEvents(): EventInput[] {
    const events: EventInput[] = [];
    // Utiliser le cache annuel si disponible, sinon les cellules courantes
    const cells = this.yearPlanningCells.length > 0 ? this.yearPlanningCells : this.planningCells;
    for (const cell of cells) {
      if (!cell.code_activite || !cell.date) continue;
      const agent = this.agents.find(a => String(a.id) === String(cell.agent_id));
      const agentName = agent ? `${agent.nom} ${agent.prenom}` : '';
      const label = agentName ? `${agentName} — ${cell.code_activite}` : cell.code_activite;
      events.push({
        title: label,
        start: cell.date,
        allDay: true,
        backgroundColor: this.getActivityColor(cell.code_activite),
        borderColor: this.getActivityColor(cell.code_activite),
        extendedProps: {
          activityCode: cell.code_activite,
          agentName
        }
      });
    }
    return events;
  }

  refreshYearCalendar(): void {
    const year = this.filters.annee;
    // Forcer la recréation du composant FullCalendar via le flag
    this.yearCalendarReady = false;
    this.yearCalendarOptions = {
      plugins: [dayGridPlugin, multiMonthPlugin],
      initialView: 'multiMonthYear',
      initialDate: `${year}-01-01`,
      validRange: { start: `${year}-01-01`, end: `${year}-12-31` },
      events: this.buildYearCalendarEvents(),
      headerToolbar: false,
      views: {
        multiMonthYear: {
          type: 'multiMonth',
          duration: { months: 12 },
          multiMonthMaxColumns: 3,
          fixedWeekCount: false
        }
      },
      firstDay: 1,
      dayMaxEvents: 3,
      eventContent: (arg: any) => {
        const code = arg.event.extendedProps.activityCode || '';
        const name = arg.event.extendedProps.agentName || '';
        const color = arg.event.backgroundColor || '#065594';
        const shortName = name.split(' ')[0];
        return {
          html: `<span title="${name} — ${code}" style="background:${color};color:#fff;padding:1px 4px;border-radius:3px;font-size:0.68rem;font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${shortName} ${code}</span>`
        };
      }
    };
    // Remettre le flag à true après un tick pour forcer la recréation du composant
    setTimeout(() => { this.yearCalendarReady = true; }, 0);
  }

  getViewPeriodLabel(): string {
    if (this.viewMode === 'day') {
      const d = new Date(this.filters.annee, this.filters.mois - 1, (this.filters.jour ?? 1));
      return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (this.viewMode === 'week' && this.planningWeeks.length > 0) {
      return `Semaine ${this.planningWeeks[0].semaine} — ${this.filters.annee}`;
    }
    if (this.viewMode === 'month') {
      const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      return `${monthNames[this.filters.mois - 1]} ${this.filters.annee}`;
    }
    return `${this.filters.annee}`;
  }

  canGoPrevious(): boolean {
    if (this.viewMode === 'day' || this.viewMode === 'week') return this.filters.semaine > 1;
    return true;
  }

  canGoNext(): boolean {
    if (this.viewMode === 'day' || this.viewMode === 'week') {
      const totalWeeksInYear = this.getNumberOfWeeks(this.filters.annee);
      return this.filters.semaine + 1 <= totalWeeksInYear;
    }
    return true;
  }

  // Tâche 1.3.3 : Valider une proposition
  validerProposition(agentId: string, date: string, event: Event): void {
    event.stopPropagation();
    
    const cell = this.planningCells.find(c => 
      c.agent_id === agentId && c.date === date && c.statut === 'proposé'
    );
    
    if (!cell || !cell.availability_id) return;

    // Utiliser is_planning_request pour savoir quel endpoint appeler
    if (cell.is_planning_request) {
      const planningId = cell.availability_id!;
      this.planningService.validatePlanningRequest(planningId, 'validé', this.loggedInUser?._id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            cell.statut = 'validé';
            cell.is_planning_request = false;
            cell.availability_id = undefined;
            this.pendingPlanningRequests = this.pendingPlanningRequests.filter(r => r._id !== planningId);
            if (this.pendingPlanningRequests.length === 0) this.showPendingRequestsPanel = false;
            this.planningCells = [...this.planningCells];
            this.calendarSyncService.forceRefresh();
            this.messageService.add({ severity: 'success', summary: 'Validé', detail: `Modification de planning validée` });
          },
          error: (err) => {
            console.error('Erreur validation:', err);
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: err?.error?.detail || 'Impossible de valider' });
          }
        });
    } else {
      // Disponibilité classique
      this.planificationService.updateAvailabilityStatus(cell.availability_id, 'validé')
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            cell.statut = 'validé';
            cell.code_activite = 'RH';
            this.refreshPlanningCells();
            this.notifyCellChange(agentId, date, 'RH');
            this.hasChanges = true;
            this.saveState();
            this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Proposition validée' });
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de valider la proposition' })
        });
    }
  }

  // Tâche 1.3.3 : Refuser une proposition
  refuserProposition(agentId: string, date: string, event: Event): void {
    event.stopPropagation();
    
    const cell = this.planningCells.find(c => 
      c.agent_id === agentId && c.date === date && c.statut === 'proposé'
    );
    
    if (!cell || !cell.availability_id) return;

    if (cell.is_planning_request) {
      const planningId = cell.availability_id!;
      this.planningService.validatePlanningRequest(planningId, 'refusé', this.loggedInUser?._id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.pendingPlanningRequests = this.pendingPlanningRequests.filter(r => r._id !== planningId);
            if (this.pendingPlanningRequests.length === 0) this.showPendingRequestsPanel = false;
            // Supprimer immédiatement la cellule en_attente localement
            this.planningCells = this.planningCells.filter(c =>
              !(c.agent_id === agentId && c.date === date && c.is_planning_request)
            );
            // Puis recharger depuis l'API pour récupérer l'état réel (planning précédent ou vide)
            this.loadPlanningData(true);
            this.calendarSyncService.forceRefresh();
            this.messageService.add({ severity: 'warn', summary: 'Refusé', detail: 'Modification de planning refusée' });
          },
          error: (err) => {
            console.error('Erreur refus:', err);
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: err?.error?.detail || 'Impossible de refuser' });
          }
        });
    } else {
      this.planificationService.updateAvailabilityStatus(cell.availability_id, 'refusé')
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            cell.statut = 'refusé';
            this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Proposition refusée' });
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de refuser la proposition' })
        });
    }
  }

  // Tâche 1.3.4 : Mode édition manuelle
  toggleEditMode(): void {
    this.editMode = !this.editMode;
    this.messageService.add({
      severity: 'info',
      summary: 'Mode édition',
      detail: this.editMode ? 'Mode édition activé' : 'Mode édition désactivé'
    });
  }

  onCellClick(agentId: string, date: string): void {
    if (this.editMode) {
      this.selectedAgentId = agentId;
      this.selectedDate = date;
      this.selectedActivityCode = this.getCellCode(agentId, date);
      this.showEditModal = true;
    }
  }

  saveManualEdit(): void {
    const cell = this.planningCells.find(c => 
      c.agent_id === this.selectedAgentId && c.date === this.selectedDate
    );
    
    // Si le code d'activité est vide, supprimer la cellule
    if (!this.selectedActivityCode || this.selectedActivityCode.trim() === '') {
      if (cell) {
        // Retirer la cellule du tableau
        const index = this.planningCells.indexOf(cell);
        if (index > -1) {
          this.planningCells.splice(index, 1);
        }
        
        // Sauvegarder immédiatement la suppression en base
        this.planificationService.publishPlanning([], true, true, [{
          agent_id: this.selectedAgentId,
          date: this.selectedDate
        }]).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.showEditModal = false;
            this.refreshPlanningCells();
            
            // Notifier l'agent de la suppression
            this.calendarSyncService.notifyPlanningPublished(
              this.selectedAgentId,
              this.loggedInUser?.service_id || '',
              {
                date: this.selectedDate,
                activity_code: '',
                is_validated: true
              }
            );
            
            this.messageService.add({
              severity: 'success',
              summary: 'Supprimé',
              detail: 'Code d\'activité supprimé et agent notifié'
            });
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: 'Erreur',
              detail: 'Impossible de supprimer le code d\'activité'
            });
          }
        });
      } else {
        this.showEditModal = false;
        this.messageService.add({
          severity: 'info',
          summary: 'Information',
          detail: 'Aucun code d\'activité à supprimer'
        });
      }
      return;
    }
    
    // Si le code d'activité n'est pas vide, créer ou modifier la cellule
    const cellToSave: PlanningCell = {
      agent_id: this.selectedAgentId,
      date: this.selectedDate,
      code_activite: this.selectedActivityCode,
      statut: 'validé'
    };
    
    if (cell) {
      cell.code_activite = this.selectedActivityCode;
      cell.statut = 'validé';
    } else {
      this.planningCells.push(cellToSave);
    }
    
    this.showEditModal = false;
    this.refreshPlanningCells();
    
    // Sauvegarder immédiatement en base + notifier l'agent
    this.planificationService.publishPlanning([cellToSave], true, true, [])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Notifier l'agent du changement
          this.calendarSyncService.notifyPlanningPublished(
            this.selectedAgentId,
            this.loggedInUser?.service_id || '',
            {
              date: this.selectedDate,
              activity_code: this.selectedActivityCode,
              is_validated: true
            }
          );
          
          this.messageService.add({
            severity: 'success',
            summary: 'Sauvegardé',
            detail: 'Modification sauvegardée et agent notifié'
          });
        },
        error: (err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de sauvegarder la modification'
          });
        }
      });
  }

  cancelManualEdit(): void {
    this.showEditModal = false;
    this.selectedAgentId = '';
    this.selectedDate = '';
    this.selectedActivityCode = '';
  }

  // Méthodes utilitaires
  getCellCode(agentId: string, date: string): string {
    const cell = this.planningCells.find(c => 
      c.agent_id === agentId && c.date === date
    );
    
    if (!cell || !cell.code_activite) return '';
    
    // Extraire seulement le code d'activité (avant les espaces/horaires)
    let code = cell.code_activite;
    
    // Si le code contient des espaces (format: CODE HH:MM...), extraire juste le code
    if (code.includes(' ')) {
      code = code.split(' ')[0].trim();
    }
    
    return code;
  }

  getCellStatus(agentId: string, date: string): string {
    const cell = this.planningCells.find(c => 
      c.agent_id === agentId && c.date === date
    );
    return cell ? cell.statut : 'vide';
  }

  getActivityColor(activityCode: string): string {
    // Nettoyer le code pour enlever les horaires
    let code = activityCode || '';
    if (code.includes(' - ')) {
      code = code.split(' - ')[0].trim();
    } else if (code.includes(' ')) {
      code = code.split(' ')[0].trim();
    }

    // Codes Jour
    if (code === 'J02') return '#3b82f6'; // Bleu
    if (code === 'J1') return '#10b981'; // Vert
    if (code === 'JB') return '#f59e0b'; // Orange

    // Codes Matin
    if (code === 'M06') return '#fbbf24'; // Jaune
    if (code === 'M13') return '#f97316'; // Orange foncé
    if (code === 'M15') return '#fb923c'; // Orange clair

    // Codes Soir/Nuit
    if (code === 'S07') return '#8b5cf6'; // Violet
    if (code === 'Nsr') return '#6366f1'; // Indigo
    if (code === 'Nsr3') return '#818cf8'; // Indigo clair
    if (code === 'Nld') return '#4f46e5'; // Indigo foncé

    // Repos et Congés
    if (code === 'RH') return '#6b7280'; // Gris
    if (code === 'RJF') return '#9ca3af'; // Gris clair
    if (code === 'CA') return '#10b981'; // Vert
    if (code === 'RTT') return '#14b8a6'; // Teal

    // Heures et Formations
    if (code === 'HS-1') return '#06b6d4'; // Cyan
    if (code === 'H-') return '#ef4444'; // Rouge
    if (code === 'FCJ') return '#ec4899'; // Rose
    if (code === 'TP') return '#a855f7'; // Violet

    // Couleur par défaut
    return '#94a3b8'; // Gris bleu
  }

  getAllDays(): string[] {
    const days: string[] = [];
    this.planningWeeks.forEach(week => {
      days.push(...week.dates);
    });
    
    // Log de débogage détaillé
    console.log('🗓️ getAllDays() - planningWeeks:', this.planningWeeks.length, 'semaines');
    console.log('🗓️ getAllDays() retourne:', days.length, 'jours');
    if (days.length > 0) {
      console.log('🗓️ Jours:', days.map((d, idx) => {
        const dt = new Date(d);
        return `${idx}: ${dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}`;
      }));
    } else {
      console.log('🗓️ Aucun jour trouvé - planningWeeks est probablement vide');
      console.log('🗓️ planningWeeks:', this.planningWeeks);
    }
    
    return days;
  }

  getWeekLabel(week: PlanningWeek): string {
    const monthName = this.mois.find(m => m.value === this.filters.mois)?.label || '';
    return `${monthName} ${week.annee} sem ${week.semaine}`;
  }

  // Parse une date ISO 'YYYY-MM-DD' en local pour éviter le décalage UTC
  private parseDateLocal(date: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  getDayName(date: string): string {
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    return dayNames[this.parseDateLocal(date).getDay()];
  }

  getDayNumber(date: string): string {
    return this.parseDateLocal(date).getDate().toString();
  }

  // 🔥 NOUVEAU: Afficher la date complète avec le mois
  getFullDateLabel(date: string): string {
    const dateObj = this.parseDateLocal(date);
    const day = dateObj.getDate();
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const month = monthNames[dateObj.getMonth()];
    return `${day} ${month}`;
  }

  getCompactDateLabel(date: string): string {
    const dateObj = this.parseDateLocal(date);
    if (this.viewMode === 'year') {
      const monthNames = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
      return monthNames[dateObj.getMonth()];
    }
    return String(dateObj.getDate());
  }

  // En vue année : code d'activité dominant du mois pour un agent
  getMonthDominantCode(agentId: string, monthDate: string): string {
    const dateObj = this.parseDateLocal(monthDate);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const cells = this.planningCells.filter(c => {
      if (c.agent_id !== agentId) return false;
      const d = this.parseDateLocal(c.date);
      return d.getFullYear() === year && d.getMonth() === month && c.code_activite;
    });
    if (cells.length === 0) return '';
    const freq: {[k: string]: number} = {};
    cells.forEach(c => { freq[c.code_activite] = (freq[c.code_activite] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }

  getMonthWorkedDays(agentId: string, monthDate: string): number {
    const dateObj = this.parseDateLocal(monthDate);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const REST_CODES = new Set(['RH', 'RJF', 'RTT', 'CA', 'H-', '?']);
    return this.planningCells.filter(c => {
      if (c.agent_id !== agentId) return false;
      const d = this.parseDateLocal(c.date);
      return d.getFullYear() === year && d.getMonth() === month && c.code_activite && !REST_CODES.has(c.code_activite);
    }).length;
  }

  /**
   * Notifie un changement de cellule en temps réel (prévisualisation)
   * Cette méthode envoie une notification même si le planning n'est pas encore sauvegardé
   */
  notifyCellChange(agentId: string, date: string, activityCode: string): void {
    if (!this.loggedInUser?.service_id) {
      console.warn('Service ID non disponible pour la notification');
      return;
    }

    // Notifier le changement (prévisualisation - pas encore sauvegardé)
    this.calendarSyncService.notifyPlanningUpdated(
      agentId,
      this.loggedInUser.service_id,
      date,
      {
        activity_code: activityCode,
        is_preview: true, // Indique que c'est une prévisualisation
        plage_horaire: '08:00-17:00'
      }
    );
  }

  /**
   * Sauvegarder l'état actuel de la simulation
   */
  saveState(): void {
    this.planificationStateService.savePlanningCells(this.planningCells);
    this.planificationStateService.saveFilters(this.filters);
    this.planificationStateService.saveHasChanges(this.hasChanges);
    // Sauvegarder aussi les suppressions
    localStorage.setItem('planification_deleted_cells', JSON.stringify(this.deletedCells));
  }

  /**
   * Notifie tous les changements d'une simulation en temps réel
   */
  notifySimulationChanges(cells: PlanningCell[]): void {
    if (!this.loggedInUser?.service_id) {
      console.warn('Service ID non disponible pour la notification');
      return;
    }

    // Notifier chaque cellule de la simulation
    cells.forEach(cell => {
      if (cell.statut === 'validé' && cell.code_activite) {
        this.calendarSyncService.notifyPlanningUpdated(
          cell.agent_id,
          this.loggedInUser.service_id,
          cell.date,
          {
            activity_code: cell.code_activite,
            is_preview: true, // Indique que c'est une prévisualisation
            plage_horaire: '08:00-17:00'
          }
        );
      }
    });

    // Forcer un rafraîchissement global après la simulation
    setTimeout(() => {
      this.calendarSyncService.forceRefresh();
    }, 100);
  }

  formatContractHours(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  }

  onFilterChange(changedFilter?: string): void {
    // 🔥 MODIFIÉ: Retirer la protection du filtre de service car il n'est plus modifiable
    
    if (changedFilter === 'annee') {
      this.updateWeeksOfYear();
      this.updateJours();
      if (this.filters.mois !== 1) this.filters.mois = 1;
      if (this.filters.semaine !== 1) this.filters.semaine = 1;
    } else if (changedFilter === 'mois') {
      this.updateJours();
      const firstDayOfMonth = new Date(this.filters.annee, this.filters.mois - 1, 1);
      const firstWeek = this.getWeekNumber(firstDayOfMonth);
      if (this.filters.semaine !== firstWeek) this.filters.semaine = firstWeek;
    } else if (changedFilter === 'semaine') {
      const monthForWeek = this.getMonthForWeek(this.filters.annee, this.filters.semaine);
      if (this.filters.mois !== monthForWeek) {
        this.filters.mois = monthForWeek;
        this.updateJours();
      }
    } else if (changedFilter === 'jour') {
      if (this.filters.jour) {
        const date = new Date(this.filters.annee, this.filters.mois - 1, this.filters.jour);
        this.filters.semaine = this.getWeekNumber(date);
        if (this.viewMode !== 'day') this.viewMode = 'day';
      } else {
        if (this.viewMode === 'day') this.viewMode = 'week';
      }
    }

    // Sauvegarder les nouveaux filtres et recharger les données
    this.saveState();
    this.loadData(true);
    if (changedFilter === 'speciality') {
      this.loadWeeklyNeedsForDisplay();
    }
  }

  updateWeeksOfYear(): void {
    this.semaines = [];
    const year = this.filters.annee;
    const numberOfWeeks = this.getNumberOfWeeks(year);
    
    for (let i = 1; i <= numberOfWeeks; i++) {
      this.semaines.push({
        label: `Semaine ${i}`,
        value: i
      });
    }
  }

  getCurrentWeek(): number {
    const now = new Date();
    const weekNum = this.getWeekNumber(now);
    console.log('📍 Semaine actuelle:', weekNum, 'Date:', now.toLocaleDateString('fr-FR'));
    return weekNum;
  }

  // Fonction pour afficher directement la semaine en cours
  showCurrentWeek(): void {
    const today = new Date();
    this.filters.annee = today.getFullYear();
    this.filters.mois = today.getMonth() + 1;
    this.filters.semaine = this.getCurrentWeek();
    
    console.log('📅 Affichage semaine en cours:', this.filters.semaine, 'Mois:', this.filters.mois, 'Année:', this.filters.annee);
    
    // Mettre à jour la liste des semaines
    this.updateWeeksOfYear();
    
    // Recharger les données
    this.loadData(true);
  }

  getSelectedAgentName(): string {
    const agent = this.agents.find(a => a.id === this.selectedAgentId);
    return agent ? `${agent.nom} ${agent.prenom}` : '';
  }

  // 🔥 MODIFIÉ: Calcul du numéro de semaine ISO (commence le lundi)
  getWeekNumber(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7; // Lundi = 0, Dimanche = 6
    target.setDate(target.getDate() - dayNr + 3); // Jeudi de cette semaine
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const diff = target.getTime() - firstThursday.getTime();
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return 1 + Math.round(diff / oneWeek);
  }

  // 🔥 MODIFIÉ: Obtenir le lundi de la semaine ISO
  getStartOfWeek(date: Date, weekNumber: number): Date {
    const year = date.getFullYear();
    const jan4 = new Date(year, 0, 4); // 4 janvier est toujours dans la semaine 1
    const jan4Day = (jan4.getDay() + 6) % 7; // Lundi = 0, Dimanche = 6
    const weekOneMonday = new Date(jan4);
    weekOneMonday.setDate(jan4.getDate() - jan4Day);
    
    console.log('🔧 getStartOfWeek - Année:', year, 'Semaine:', weekNumber);
    console.log('   Jan 4:', jan4.toLocaleDateString('fr-FR', { weekday: 'long' }));
    console.log('   Lundi semaine 1:', weekOneMonday.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
    
    // Ajouter le nombre de semaines
    const targetMonday = new Date(weekOneMonday);
    targetMonday.setDate(weekOneMonday.getDate() + (weekNumber - 1) * 7);
    
    console.log('   ✅ Lundi cible:', targetMonday.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
    console.log('   Jour de la semaine (0=Dim, 1=Lun):', targetMonday.getDay());
    
    return targetMonday;
  }

  // Simulation
  // Vérifie si la semaine actuelle a des plannings
  hasPlanningForCurrentWeek(): boolean {
    if (this.planningCells.length === 0) return false;
    
    // Récupérer toutes les dates de la semaine actuelle
    const currentWeekDates = this.getAllDays();
    if (currentWeekDates.length === 0) return false;
    
    // Vérifier si au moins une cellule de planning existe pour cette semaine
    return this.planningCells.some(cell => 
      currentWeekDates.includes(cell.date)
    );
  }

  // Récupère les plannings existants d'autres semaines
  getExistingPlanningsForSimulation(): Promise<any[]> {
    return new Promise((resolve) => {
      // Pour l'instant, on simule en récupérant les plannings de la semaine précédente
      // Dans une vraie implémentation, il faudrait appeler une API
      const previousWeekFilters = {
        ...this.filters,
        semaine: Math.max(1, this.filters.semaine - 1)
      };
      
      console.log('🔍 Recherche de plannings pour la semaine:', previousWeekFilters.semaine);
      
      // Simuler un appel API
      setTimeout(() => {
        // Pour la démo, on retourne un tableau vide
        // Dans la vraie implémentation, il faudrait appeler:
        // this.planificationService.getPlanningData(previousWeekFilters).subscribe(...)
        resolve([]);
      }, 500);
    });
  }

  // Génère une simulation pour la semaine actuelle
  async generateSimulationFromExistingPlannings(): Promise<any[]> {
    // Récupérer les dates de la semaine actuelle
    const currentWeekDates = this.getAllDays();
    if (currentWeekDates.length === 0) {
      console.warn('⚠️ Aucune date trouvée pour la semaine actuelle');
      return [];
    }
    
    console.log('📝 Création d\'une simulation pour', currentWeekDates.length, 'jours');
    console.log('Agents disponibles:', this.agents.length);
    
    // Créer une simulation
    const simulation: any[] = [];
    
    // Pour chaque agent
    this.agents.forEach(agent => {
      // Récupérer le contrat de l'agent
      const contrat = this.userContrats[agent.id];
      
      // Déterminer le code d'activité par défaut
      let defaultCode = 'RH';
      let heureDebut = '08:00';
      let heureFin = '17:00';
      
      if (contrat) {
        defaultCode = this.getDefaultActivityCodeFromContrat(contrat);
        
        // Déterminer les heures de travail basées sur le contrat
        if (contrat.work_days && contrat.work_days.length > 0) {
          const firstWorkDay = contrat.work_days[0];
          heureDebut = firstWorkDay.start_time || '08:00';
          heureFin = firstWorkDay.end_time || '17:00';
        }
      }
      
      // Créer un planning pour chaque jour de la semaine
      currentWeekDates.forEach(date => {
        simulation.push({
          agent_id: agent.id,
          date: date,
          code_activite: defaultCode,
          statut: 'proposé', // Marquer comme proposition
          heureDebut: heureDebut,
          heureFin: heureFin
        });
      });
    });
    
    console.log('✅ Simulation créée:', simulation.length, 'affectations');
    return simulation;
  }

  // Détermine le code d'activité par défaut basé sur le contrat
  getDefaultActivityCodeFromContrat(contrat: Contrat): string {
    if (!contrat || !contrat.work_days) return 'RH';
    
    // Vérifier les heures de travail pour déterminer le type de shift
    // Par défaut, on considère que c'est un travail de jour
    return 'RH';
  }

  simulerAvecContratActuel(): void {
    // Vérifier si la semaine actuelle a déjà des plannings
    if (this.hasPlanningForCurrentWeek()) {
      // Demander confirmation pour remplacer
      this.confirmationService.confirm({
        message: 'Cette semaine a déjà des plannings. Voulez-vous les remplacer par une simulation basée sur les plannings existants ?',
        header: 'Confirmation',
        icon: 'pi pi-exclamation-triangle',
        accept: () => {
          this.executeSimulation();
        },
        reject: () => {
          this.messageService.add({
            severity: 'info',
            summary: 'Annulé',
            detail: 'Simulation annulée'
          });
        }
      });
    } else {
      // La semaine est vide, exécuter directement la simulation
      this.executeSimulation();
    }
  }

  // Exécute la simulation
  async executeSimulation(): Promise<void> {
    this.loading = true;
    this.loadingMessage = 'Génération de la simulation...';
    this.loadingProgress = 50;
    
    console.log('🔄 Génération de simulation pour semaine vide');
    console.log('Semaine actuelle:', this.filters.semaine, 'Année:', this.filters.annee);
    console.log('Nombre d\'agents:', this.agents.length);
    
    // Vérifier qu'il y a des agents
    if (this.agents.length === 0) {
      console.warn('⚠️ Aucun agent trouvé pour générer une simulation');
      this.loading = false;
      this.loadingProgress = 100;
      
      this.messageService.add({
        severity: 'warn',
        summary: 'Aucun agent',
        detail: 'Aucun agent trouvé pour générer une simulation'
      });
      return;
    }
    
    try {
      // Générer la simulation de manière asynchrone
      const simulation = await this.generateSimulationFromExistingPlannings();
      
      if (simulation.length === 0) {
        console.warn('⚠️ Impossible de générer une simulation');
        console.log('Raison possible: getAllDays() retourne un tableau vide');
        this.loading = false;
        this.loadingProgress = 100;
        
        this.messageService.add({
          severity: 'warn',
          summary: 'Impossible de générer',
          detail: 'Impossible de générer une simulation pour cette semaine'
        });
        return;
      }
      
      console.log('✅ Simulation générée:', simulation.length, 'affectations');
      
      // Afficher la simulation
      this.planningCells = simulation;
      this.hasChanges = true;
      this.planningCells = [...this.planningCells];
      this.saveState();
      this.notifySimulationChanges(simulation);
      
      this.loading = false;
      this.loadingProgress = 100;
      
      // Demander confirmation pour valider
      this.confirmationService.confirm({
        message: `Simulation générée avec ${simulation.length} affectations pour ${this.agents.length} agents. Voulez-vous valider cette simulation ?`,
        header: 'Valider la simulation',
        icon: 'pi pi-question-circle',
        accept: () => {
          this.validerSimulation(simulation);
        },
        reject: () => {
          this.annulerSimulation();
        }
      });
    } catch (error) {
      console.error('❌ Erreur lors de la génération de la simulation:', error);
      this.loading = false;
      this.loadingProgress = 100;
      
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Erreur lors de la génération de la simulation'
      });
    }
  }

  // Valide la simulation
  validerSimulation(simulation: any[]): void {
    console.log('✅ Simulation validée');
    this.messageService.add({
      severity: 'success',
      summary: 'Simulation validée',
      detail: 'La simulation a été validée avec succès'
    });
    
    // Ici, vous pourriez sauvegarder la simulation dans la base de données
    // Pour l'instant, on la garde juste en mémoire
  }

  // Annule la simulation
  annulerSimulation(): void {
    console.log('❌ Simulation annulée');
    this.planningCells = [];
    this.planningCells = [...this.planningCells];
    this.hasChanges = false;
    this.saveState();
    
    this.messageService.add({
      severity: 'info',
      summary: 'Simulation annulée',
      detail: 'La simulation a été annulée'
    });
  }

  simulerAvecContratPersonnalise(): void {
    // Méthode supprimée - utiliser simulerAvecContratActuel à la place
  }

  simulerAvecContratPersonnaliseConfirm(): void {
    // Méthode supprimée - utiliser simulerAvecContratActuel à la place
  }

  // --- MENU PLAN ---

  /** Références : génère un cycle vierge (toutes les cellules vides) */
  openReferences(): void {
    this.showPlanMenu = false;
    this.confirmationService.confirm({
      message: 'Cela va effacer le planning affiché et générer un cycle vierge. Continuer ?',
      header: 'Références – Cycle vierge',
      icon: 'pi pi-file',
      accept: () => {
        this.planningCells = [];
        this.hasChanges = true;
        this.saveState();
        this.messageService.add({ severity: 'info', summary: 'Cycle vierge', detail: 'Planning réinitialisé en cycle vierge' });
      }
    });
  }

  /** Simulation : simuler avec un service moins important (moins d\'agents) */
  openSimulation(): void {
      this.showPlanMenu = false;
      // Pré-sélectionner tous les agents
      this.selectedAgentsForSim = new Set(this.agents.map(a => String(a.id)));
      this.showSimulationModal = true;
    }

    selectAllAgents(): void {
      this.selectedAgentsForSim = new Set(this.agents.map(a => String(a.id)));
    }

    deselectAllAgents(): void {
      this.selectedAgentsForSim = new Set();
    }

    toggleAgentForSim(agentId: string): void {
      const id = String(agentId);
      if (this.selectedAgentsForSim.has(id)) {
        this.selectedAgentsForSim.delete(id);
      } else {
        this.selectedAgentsForSim.add(id);
      }
      this.selectedAgentsForSim = new Set(this.selectedAgentsForSim);
    }

    lancerSimulationServiceReduit(): void {
      this.showSimulationModal = false;
      const allDays = this.getAllDays();
      if (allDays.length === 0) {
        this.messageService.add({ severity: 'warn', summary: 'Attention', detail: 'Aucune date affichée' });
        return;
      }

      // Vider les cellules de la semaine affichée
      this.planningCells = this.planningCells.filter(c => !allDays.includes(c.date));

      const selectedIds = this.selectedAgentsForSim;
      let count = 0;

      // Construire la liste des agents sélectionnés (infirmiers uniquement pour la distribution)
      const selectedAgents = this.agents.filter(agent => selectedIds.has(String(agent.id)));

      // Pour chaque jour, distribuer les agents selon les besoins de la semaine type
      allDays.forEach(dateStr => {
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();

        // Récupérer les besoins pour ce jour
        const need = this.weeklyNeedsData.find(n => n.day_of_week === dayOfWeek);
        const needJ02 = need?.needs?.J02 ?? 0;
        const needJ1  = need?.needs?.J1  ?? 0;
        const needJB  = need?.needs?.JB  ?? 0;

        // Agents disponibles ce jour (ceux dont le contrat inclut ce jour OU sans contrat défini)
        const agentsForDay = selectedAgents.filter(agent => {
          const contrat = this.userContrats[agent.id];
          if (!contrat?.work_days?.length) return true; // pas de contrat → on l'inclut
          return contrat.work_days.some(
            (wd: any) => this.getDayOfWeekIndexFromName(wd.day) === dayOfWeek
          );
        });

        // Séparer infirmiers et autres rôles
        const nurses = agentsForDay.filter(agent => {
          const speciality = this.specialities.find(s => s.value === agent.speciality_id);
          return speciality
            ? speciality.label.toLowerCase().includes('infirm')
            : (agent.role === 'nurse' || agent.role === 'infirmier');
        });
        const others = agentsForDay.filter(agent => !nurses.includes(agent));

        // Distribuer les infirmiers selon les besoins : d'abord J02, puis J1, puis JB, reste RH
        let nurseIndex = 0;
        const shiftSlots: { code: string; count: number }[] = [
          { code: 'J02', count: needJ02 },
          { code: 'J1',  count: needJ1  },
          { code: 'JB',  count: needJB  },
        ];

        shiftSlots.forEach(slot => {
          for (let i = 0; i < slot.count && nurseIndex < nurses.length; i++, nurseIndex++) {
            this.planningCells.push({
              agent_id: nurses[nurseIndex].id,
              date: dateStr,
              code_activite: slot.code,
              statut: 'proposé'
            });
            count++;
          }
        });

        // Infirmiers restants (au-delà des besoins) → RH
        while (nurseIndex < nurses.length) {
          this.planningCells.push({
            agent_id: nurses[nurseIndex].id,
            date: dateStr,
            code_activite: 'RH',
            statut: 'proposé'
          });
          count++;
          nurseIndex++;
        }

        // Autres rôles → RH
        others.forEach(agent => {
          this.planningCells.push({
            agent_id: agent.id,
            date: dateStr,
            code_activite: 'RH',
            statut: 'proposé'
          });
          count++;
        });
      });

      this.planningCells = [...this.planningCells];
      this.hasChanges = true;
      this.saveState();

      this.messageService.add({
        severity: 'success',
        summary: 'Simulation générée',
        detail: `${count} affectation(s) pour ${selectedIds.size} agent(s).`
      });
    }

  private getBestShiftCodeForDay(dayOfWeek: number): string {
    const need = this.weeklyNeedsData.find(n => n.day_of_week === dayOfWeek);
    if (!need) return 'RH';
    const { J02 = 0, J1 = 0, JB = 0 } = need.needs;
    if (J02 >= J1 && J02 >= JB && J02 > 0) return 'J02';
    if (J1 >= J02 && J1 >= JB && J1 > 0) return 'J1';
    if (JB > 0) return 'JB';
    return 'RH';
  }

  /** Retourne le label de métier d'un agent, ou son rôle en fallback */
  getAgentSpecialityLabel(agent: any): string {
    if (agent.speciality_id) {
      const s = this.specialities.find(sp => sp.value === agent.speciality_id);
      if (s) return s.label;
    }
    return agent.role || 'Agent';
  }


  /** Déclarer : activer/désactiver le mode édition manuelle */
  openDeclarer(): void {
    this.showPlanMenu = false;
    // Petit délai pour laisser le menu se fermer avant le toggle
    setTimeout(() => this.toggleEditMode(), 50);
  }

  /** Planificateur : simuler avec les plannings existants */
  openPlanificateur(): void {
    this.showPlanMenu = false;
    this.simulerAvecContratActuel();
  }

  validerPlanning(): void {
    // Utiliser publishPlanning() avec save=true et notify=false pour la validation
    // Cela unifie la logique : on utilise toujours publishPlanning()
    // Envoyer les cellules à sauvegarder ET les suppressions
    this.planificationService.publishPlanning(this.planningCells, false, true, this.deletedCells)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Vider les suppressions après validation réussie
          this.deletedCells = [];
          this.hasChanges = false;
          this.saveState(); // Sauvegarder l'état (hasChanges = false après validation)
          
          // Notifier tous les changements validés pour une synchronisation immédiate
          const validatedCells = this.planningCells.filter(cell => 
            cell.statut === 'validé' && cell.code_activite && cell.code_activite.trim() !== ''
          );
          
          validatedCells.forEach(cell => {
            this.calendarSyncService.notifyPlanningValidated(
              cell.agent_id,
              this.loggedInUser?.service_id || '',
              cell.date,
              {
                activity_code: cell.code_activite,
                plage_horaire: '08:00-17:00',
                is_validated: true // Indique que c'est validé et sauvegardé
              }
            );
          });
          
          // Forcer un rafraîchissement global après validation
          this.calendarSyncService.forceRefresh();
          
          const deleted = response.deleted_count || 0;
          const message = deleted > 0 
            ? `Planning validé et sauvegardé - ${deleted} activité(s) supprimée(s) - Visible en temps réel sur tous les calendriers`
            : 'Planning validé et sauvegardé - Visible en temps réel sur tous les calendriers';
          
          this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: message
          });
          
          // Ne pas recharger la page de simulation - les modifications restent visibles
          // Les autres calendriers se rafraîchiront automatiquement via les notifications
        },
        error: (error) => {
          console.error('Erreur lors de la validation:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de sauvegarder le planning'
          });
        }
      });
  }

  // Publication du planning aux agents avec notifications
  publierAuxAgents(): void {
    // Collecter TOUTES les cellules modifiées localement (validées ou créées manuellement)
    const cellsToPublish = this.planningCells.filter(cell => 
      cell.statut === 'validé' && 
      cell.code_activite && 
      cell.code_activite.trim() !== '' &&
      // S'assurer que la cellule est dans la période affichée
      this.isCellInCurrentPeriod(cell.date)
    );

    // Filtrer les suppressions pour ne garder que celles dans la période affichée
    const deletedInPeriod = this.deletedCells.filter(deleted => 
      this.isCellInCurrentPeriod(deleted.date)
    );

    if (cellsToPublish.length === 0 && deletedInPeriod.length === 0 && !this.hasChanges) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Avertissement',
        detail: 'Aucune modification à publier. Veuillez d\'abord modifier le planning.'
      });
      return;
    }

    if (cellsToPublish.length === 0 && deletedInPeriod.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Avertissement',
        detail: 'Aucune cellule validée ou supprimée à publier. Veuillez valider vos modifications.'
      });
      return;
    }

    this.loading = true;
    
    // Publier les cellules validées ET les suppressions
    this.planificationService.publishPlanning(cellsToPublish, true, true, deletedInPeriod)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Retirer les suppressions publiées de la liste
          deletedInPeriod.forEach(deleted => {
            const index = this.deletedCells.findIndex(
              d => d.agent_id === deleted.agent_id && d.date === deleted.date
            );
            if (index > -1) {
              this.deletedCells.splice(index, 1);
            }
          });
          
          const published = response.published_count || 0;
          const updated = response.updated_count || 0;
          const deleted = response.deleted_count || 0;
          const notifications = response.notifications_sent || 0;
          
          // Notifier tous les changements publiés pour une synchronisation immédiate
          cellsToPublish.forEach(cell => {
            this.calendarSyncService.notifyPlanningPublished(
              cell.agent_id,
              this.loggedInUser?.service_id || '',
              {
                date: cell.date,
                activity_code: cell.code_activite,
                is_validated: true // Indique que c'est validé et sauvegardé
              }
            );
          });
          
          // Forcer un rafraîchissement global après publication
          this.calendarSyncService.forceRefresh();
          
          const detailMessage = deleted > 0
            ? `Planning publié: ${published} créé(s), ${updated} modifié(s), ${deleted} supprimé(s). ${notifications} notification(s) envoyée(s) aux agents. Visible en temps réel sur tous les calendriers.`
            : `Planning publié: ${published} créé(s), ${updated} modifié(s). ${notifications} notification(s) envoyée(s) aux agents. Visible en temps réel sur tous les calendriers.`;
          
          this.messageService.add({
            severity: 'success',
            summary: 'Publication réussie',
            detail: detailMessage
          });
          
          // Réinitialiser l'état des modifications
          this.hasChanges = false;
          this.editMode = false;
          this.showPublishOptions = false;
          this.saveState(); // Sauvegarder l'état (hasChanges = false après publication)
          
          // Ne pas recharger la page de simulation - les modifications restent visibles
          // Les autres calendriers se rafraîchiront automatiquement via les notifications
          this.loading = false;
        },
        error: (error) => {
          this.loading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: error.error?.detail || 'Impossible de publier le planning'
          });
        }
      });
  }

  // Vérifier si une date est dans la période actuellement affichée
  private isCellInCurrentPeriod(date: string): boolean {
    const allDays = this.getAllDays();
    return allDays.includes(date);
  }

  // Recharger toutes les données de manière synchrone
  private reloadAllData(): void {
    this.loading = true;
    
    // Recharger le planning depuis le serveur (données persistées)
    this.planificationService.getPlanningData(this.filters, this.viewMode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          console.log('Données reçues du serveur après validation:', data.length, 'cellules');
          
          // Remplacer les cellules locales par les données du serveur (données persistées)
          this.planningCells = data || [];
          
          // Recharger les disponibilités (cela va aussi traiter les propositions)
          this.planificationService.getAvailabilities(this.filters)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (availabilities) => {
                this.processAvailabilities(availabilities);
                
                // Régénérer le planning par défaut basé sur les contrats
                // (cela remplira les cellules vides avec le planning par défaut)
                if (this.planningWeeks.length > 0 && this.agents.length > 0) {
                  this.generateDefaultPlanningFromContrats();
                }
                
                this.loading = false;
                
                // Forcer la détection de changements pour mettre à jour l'affichage immédiatement
                setTimeout(() => {
                  console.log('Planning complètement rechargé et synchronisé:', this.planningCells.length, 'cellules');
                  // Forcer la détection de changements Angular avec une nouvelle référence
                  this.planningCells = [...this.planningCells];
                  
                  // S'assurer que hasChanges est à false après rechargement
                  this.hasChanges = false;
                }, 100);
              },
              error: (error) => {
                console.error('Erreur lors du rechargement des disponibilités:', error);
                // Continuer même en cas d'erreur
                if (this.planningWeeks.length > 0 && this.agents.length > 0) {
                  this.generateDefaultPlanningFromContrats();
                }
                this.loading = false;
                // Forcer la mise à jour même en cas d'erreur
                this.planningCells = [...this.planningCells];
              }
            });
        },
        error: (error) => {
          console.error('Erreur lors du rechargement du planning:', error);
          this.handleError(error, 'rechargement du planning');
          this.loading = false;
          // Même en cas d'erreur, essayer de régénérer le planning par défaut
          if (this.planningWeeks.length > 0 && this.agents.length > 0) {
            this.generateDefaultPlanningFromContrats();
          }
          // Forcer la mise à jour même en cas d'erreur
          this.planningCells = [...this.planningCells];
        }
      });
  }

  // Notifier les agents sans sauvegarder
  notifierAgents(): void {
    if (!this.hasChanges && this.planningCells.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Avertissement',
        detail: 'Aucune modification à notifier'
      });
      return;
    }

    this.loading = true;
    // Envoyer uniquement des notifications sans sauvegarder
    this.planificationService.publishPlanning(this.planningCells, true, false)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.loading = false;
          const notifications = response.notifications_sent || 0;
          
          this.messageService.add({
            severity: 'success',
            summary: 'Notification envoyée',
            detail: `${notifications} notification(s) envoyée(s) aux agents concernés (modifications non sauvegardées).`
          });
        },
        error: (error) => {
          this.loading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: error.error?.detail || 'Impossible d\'envoyer les notifications'
          });
        }
      });
  }

  // Annuler les modifications non sauvegardées
  annulerPublication(): void {
    if (!this.hasChanges) {
      this.messageService.add({
        severity: 'info',
        summary: 'Information',
        detail: 'Aucune modification à annuler'
      });
      return;
    }

    // Recharger les données depuis le serveur pour annuler les modifications locales
    this.loading = true;
    this.loadPlanningData(true); // Forcer le rechargement pour annuler
    this.loadAvailabilities();
    
    // Réinitialiser l'état
    this.hasChanges = false;
    this.editMode = false;
    
    // Effacer l'état sauvegardé puisqu'on annule
    this.planificationStateService.clearCells();
    
    // Forcer la mise à jour de l'affichage
    this.planningCells = [...this.planningCells];
    
    this.messageService.add({
      severity: 'info',
      summary: 'Modifications annulées',
      detail: 'Les modifications non sauvegardées ont été annulées'
    });
  }

  // Méthodes utilitaires
  getCellTooltip(agentId: string, date: string): string {
    const cell = this.planningCells.find(c => 
      c.agent_id === agentId && c.date === date
    );
    
    if (!cell) {
      return this.editMode ? 'Cliquer pour ajouter une activité' : '';
    }
    
    const agent = this.agents.find(a => a.id === agentId);
    const agentName = agent ? `${agent.prenom} ${agent.nom}` : 'Agent';
    
    switch (cell.statut) {
      case 'proposé':
        const timeRange = cell.heureDebut && cell.heureFin ? ` de ${cell.heureDebut} à ${cell.heureFin}` : '';
        return `${agentName} - Proposition de disponibilité${timeRange} (${cell.date})`;
      case 'validé':
        return `${agentName} - Activité validée: ${cell.code_activite}`;
      case 'refusé':
        return `${agentName} - Proposition refusée`;
      default:
        return `${agentName} - ${cell.code_activite}`;
    }
  }

  // Export vers Excel
  exportToExcel(): void {
    if (this.agents.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Avertissement',
        detail: 'Aucun agent à exporter'
      });
      return;
    }

    try {
      // Obtenir toutes les dates uniques de la période affichée
      const allDays = this.getAllDays();
      if (allDays.length === 0) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Avertissement',
          detail: 'Aucune date à exporter'
        });
        return;
      }

      // Créer un Set des IDs d'agents pour une recherche rapide
      const agentIds = new Set(this.agents.map(a => String(a.id)));
      
      // Filtrer les cellules pour ne garder que celles correspondant aux agents et dates affichés
      const relevantCells = this.planningCells.filter(cell => {
        const agentIdStr = String(cell.agent_id);
        const dateStr = String(cell.date);
        return agentIds.has(agentIdStr) && allDays.includes(dateStr);
      });

      // Créer le tableau de données pour Excel
      const excelData: any[] = [];

      // En-tête : Nom, Prénom, Contrat hebdo, puis toutes les dates
      const header = ['Nom', 'Prénom', 'Contrat hebdo (h)'];
      allDays.forEach(date => {
        const dateObj = new Date(date);
        const dayName = this.getDayName(date);
        const dayNumber = this.getDayNumber(date);
        header.push(`${dayName} ${dayNumber}/${dateObj.getMonth() + 1}`);
      });
      excelData.push(header);

      // Pour chaque agent, créer une ligne
      this.agents.forEach(agent => {
        const row: any[] = [
          agent.nom,
          agent.prenom,
          this.formatContractHours(agent.contrat_hebdo)
        ];

        // Pour chaque date, récupérer le code d'activité
        allDays.forEach(date => {
          // Rechercher la cellule correspondante en normalisant les IDs
          const cell = relevantCells.find(c => {
            const cellAgentId = String(c.agent_id);
            const agentId = String(agent.id);
            const cellDate = String(c.date);
            const targetDate = String(date);
            return cellAgentId === agentId && cellDate === targetDate;
          });
          
          if (cell && cell.code_activite && cell.code_activite.trim() !== '') {
            // Ajouter le statut entre parenthèses si c'est une proposition
            const code = cell.statut === 'proposé' 
              ? `${cell.code_activite} (proposé)`
              : cell.code_activite;
            row.push(code);
          } else {
            row.push('');
          }
        });

        excelData.push(row);
      });

      // Créer le workbook et la feuille
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Ajuster la largeur des colonnes
      const colWidths = [
        { wch: 15 }, // Nom
        { wch: 15 }, // Prénom
        { wch: 18 }  // Contrat hebdo
      ];
      // Largeur pour chaque date
      allDays.forEach(() => {
        colWidths.push({ wch: 12 });
      });
      ws['!cols'] = colWidths;

      // Créer le workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Planning');

      // Générer le nom du fichier avec la date et les filtres
      const monthName = this.mois.find(m => m.value === this.filters.mois)?.label || '';
      const fileName = `Planning_${monthName}_${this.filters.annee}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Télécharger le fichier
      XLSX.writeFile(wb, fileName);

      this.messageService.add({
        severity: 'success',
        summary: 'Export réussi',
        detail: `Le fichier Excel a été téléchargé: ${fileName}`
      });
    } catch (error) {
      console.error('Erreur lors de l\'export Excel:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Impossible d\'exporter le planning en Excel'
      });
    }
  }

  // Impression du planning
  imprimerPlanning(): void {
    const allDays = this.getAllDays();
    const monthName = this.mois.find(m => m.value === this.filters.mois)?.label || '';
    const semaine = this.filters.semaine;
    const annee = this.filters.annee;
    const serviceName = this.currentServiceName || '';

    // Construire les en-têtes de colonnes
    const headerCols = allDays.map(d => {
      const dateObj = new Date(d);
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      return `<th>${dayNames[dateObj.getDay()]}<br><span>${dateObj.getDate()}/${dateObj.getMonth()+1}</span></th>`;
    }).join('');

    // Construire les lignes agents
    const agentRows = this.agents.map(agent => {
      const cells = allDays.map(day => {
        const code = this.getCellCode(agent.id, day);
        const color = code ? this.getActivityColor(code) : '';
        const style = color ? `style="background:${color};color:white;"` : '';
        return `<td ${style}>${code || ''}</td>`;
      }).join('');
      return `<tr>
        <td class="agent-nom">${agent.nom}</td>
        <td class="agent-prenom">${agent.prenom}</td>
        <td class="agent-contrat">${this.formatContractHours(agent.contrat_hebdo)}</td>
        ${cells}
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Planning – Sem. ${semaine} ${monthName} ${annee}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #1e293b; padding: 12px; }
    .print-header { margin-bottom: 12px; }
    .print-header h1 { font-size: 14px; font-weight: bold; }
    .print-header p { font-size: 11px; color: #64748b; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 5px; text-align: center; white-space: nowrap; }
    th { background: #1e40af !important; color: white !important; font-size: 9px; }
    th span { font-weight: normal; font-size: 8px; }
    .agent-nom { text-align: left; font-weight: 600; min-width: 80px; }
    .agent-prenom { text-align: left; min-width: 70px; }
    .agent-contrat { color: #64748b; min-width: 50px; }
    tr:nth-child(even) td { background: #f8fafc !important; }
    td[style] { font-weight: 600; font-size: 9px; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { padding: 0; }
      @page { size: landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>Planning – Semaine ${semaine} · ${monthName} ${annee}</h1>
    <p>${serviceName}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Nom</th>
        <th>Prénom</th>
        <th>Contrat</th>
        ${headerCols}
      </tr>
    </thead>
    <tbody>
      ${agentRows}
    </tbody>
  </table>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=1200,height=700');
    if (!win) {
      this.messageService.add({ severity: 'warn', summary: 'Bloqué', detail: 'Autorisez les popups pour imprimer' });
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  }

  // Télécharger le modèle Excel vide au format attendu
  downloadExcelTemplate(): void {
    const allDays = this.getAllDays();
    const moisMap: { [k: number]: string } = {
      1:'janvier',2:'février',3:'mars',4:'avril',5:'mai',6:'juin',
      7:'juillet',8:'août',9:'septembre',10:'octobre',11:'novembre',12:'décembre'
    };
    const dayNames = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];

    // Construire les 3 lignes d'en-tête + 1 ligne vide
    const row1: any[] = ['', '', 'Nom', 'Prénom', 'Matricule', 'Plan'];
    const row2: any[] = ['', '', '',    '',        '',          ''];
    const row3: any[] = ['', '', '',    '',        '',          ''];

    allDays.forEach(dateStr => {
      const d = new Date(dateStr);
      const month = moisMap[d.getMonth() + 1] + ' ' + d.getFullYear();
      const weekNum = this.getWeekNumber(d);
      const dayLabel = dayNames[d.getDay()] + '\n' + d.getDate();

      // Colonne code + colonne vide intercalée (format fusionné)
      row1.push(month, '');
      row2.push('Sem.' + weekNum, '');
      row3.push(dayLabel, '');
    });

    const row4: any[] = new Array(row1.length).fill('');

    // Lignes agents vides (une par agent du service)
    const agentRows = this.agents.map(agent => {
      const row: any[] = ['', '', agent.nom, agent.prenom, '', 'PPL'];
      allDays.forEach(() => row.push('', ''));
      return row;
    });

    // Si pas d'agents, mettre 3 lignes vides exemple
    const dataRows = agentRows.length > 0 ? agentRows : [
      ['', '', 'NOM', 'Prénom', 'Matricule', 'PPL', ...allDays.flatMap(() => ['', ''])],
    ];

    const wsData = [row1, row2, row3, row4, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Largeurs colonnes
    ws['!cols'] = [
      {wch:3},{wch:3},{wch:20},{wch:15},{wch:12},{wch:6},
      ...allDays.flatMap(() => [{wch:8},{wch:2}])
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planning');

    const monthName = this.mois.find(m => m.value === this.filters.mois)?.label || 'Planning';
    XLSX.writeFile(wb, `Modele_Planning_${monthName}_${this.filters.annee}.xlsx`);

    this.messageService.add({
      severity: 'success',
      summary: 'Modèle téléchargé',
      detail: 'Remplissez les codes d\'activité dans les colonnes de dates puis importez le fichier'
    });
  }

  // Import depuis Excel
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Lire la première feuille
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        
        if (jsonData.length < 2) {
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Le fichier Excel est vide ou invalide'
          });
          return;
        }

        // Parser les données
        this.parseExcelData(jsonData);
        
      } catch (error) {
        console.error('Erreur lors de la lecture du fichier:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Impossible de lire le fichier Excel'
        });
      }
    };
    
    reader.readAsArrayBuffer(file);
    // Réinitialiser l'input pour permettre de sélectionner le même fichier
    event.target.value = '';
  }

  private parseExcelData(data: any[][]): void {
    if (!data || data.length < 2) return;

    // --- Détection du format ---
    // Format "Infirmières" : col 2 = NOM, col 3 = Prénom, ligne 1 = mois, ligne 3 = "jour\nNuméro"
    // Format simple export app : col 0 = Nom, col 1 = Prénom, col 2 = Contrat, col 3+ = "Lun 01/03"
    const isNativeFormat = String(data[0][2] || '').trim() === 'Nom' ||
      (String(data[0][2] || '') !== '' && String(data[0][0] || '') === '');

    let dateColumns: { date: string; colIndex: number }[] = [];
    let dataStartRow = 0;
    let nomCol = 0;
    let prenomCol = 1;

    if (isNativeFormat) {
      // ── Format réel Excel (Infirmières) ──────────────────────────────
      // Ligne 1 (index 0) : mois par paires de colonnes à partir de col 6
      // Ligne 3 (index 2) : "dim.\n1", "lun.\n2" ... en colonnes paires (6,8,10...)
      // Données à partir de la ligne 5 (index 4)
      nomCol = 2;
      prenomCol = 3;
      dataStartRow = 4;

      const monthRow = data[0];   // mois
      const dayRow   = data[2];   // jour + numéro

      // Mapping mois français → numéro
      const moisMap: { [k: string]: number } = {
        'janvier':1,'février':2,'mars':3,'avril':4,'mai':5,'juin':6,
        'juillet':7,'août':8,'septembre':9,'octobre':10,'novembre':11,'décembre':12
      };

      // Parcourir les colonnes de données (paires à partir de 6)
      let currentMonth = 0;
      let currentYear = this.filters.annee;

      for (let col = 6; col < dayRow.length; col += 2) {
        // Mettre à jour le mois courant si la cellule mois n'est pas vide
        const monthCell = String(monthRow[col] || '').toLowerCase().trim();
        if (monthCell) {
          // Peut contenir "mars 2026" ou juste "mars"
          for (const [name, num] of Object.entries(moisMap)) {
            if (monthCell.includes(name)) {
              currentMonth = num;
              const yearMatch = monthCell.match(/\d{4}/);
              if (yearMatch) currentYear = parseInt(yearMatch[0]);
              break;
            }
          }
        }

        const dayCell = String(dayRow[col] || '').trim();
        if (!dayCell || !currentMonth) continue;

        // Extraire le numéro du jour : "lun.\r\n2" → 2
        const dayMatch = dayCell.match(/(\d+)/);
        if (!dayMatch) continue;
        const dayNum = parseInt(dayMatch[1]);

        const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
        dateColumns.push({ date: dateStr, colIndex: col });
      }
    } else {
      // ── Format export de l'app : col 0=Nom, 1=Prénom, 2=Contrat, 3+=dates ──
      nomCol = 0;
      prenomCol = 1;
      dataStartRow = 1;
      const header = data[0];

      for (let i = 3; i < header.length; i++) {
        const cellValue = String(header[i] || '').trim();
        if (!cellValue) continue;
        const match = cellValue.match(/(\d{1,2})\/(\d{1,2})/);
        if (match) {
          const day   = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          dateColumns.push({ date: `${this.filters.annee}-${month}-${day}`, colIndex: i });
        }
      }
    }

    if (dateColumns.length === 0) {
      this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Aucune date trouvée dans le fichier Excel' });
      return;
    }

    // Garder uniquement les dates visibles dans la semaine affichée
    const visibleDays = new Set(this.getAllDays());
    const relevantCols = dateColumns.filter(d => visibleDays.has(d.date));

    if (relevantCols.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Aucune correspondance',
        detail: 'Les dates du fichier ne correspondent pas à la semaine affichée. Naviguez vers la bonne semaine.'
      });
      return;
    }

    let importedCount = 0;
    let notFoundCount = 0;
    const ignoredPrefixes = ['Total', 'Ecarts', 'SMR', 'SSR'];

    const rows = data.slice(dataStartRow);
    rows.forEach(row => {
      if (!row || row.length < 4) return;

      const nom    = String(row[nomCol]    || '').trim();
      const prenom = String(row[prenomCol] || '').trim();
      if (!nom || !prenom) return;
      if (ignoredPrefixes.some(p => nom.toUpperCase().startsWith(p))) return;

      // Chercher l'agent par nom+prénom (insensible à la casse)
      const agent = this.agents.find(a =>
        a.nom.toLowerCase()    === nom.toLowerCase() &&
        a.prenom.toLowerCase() === prenom.toLowerCase()
      );

      if (!agent) {
        console.warn(`⚠️ Agent non trouvé: ${prenom} ${nom}`);
        notFoundCount++;
        return;
      }

      relevantCols.forEach(({ date, colIndex }) => {
        const raw = String(row[colIndex] || '').trim();
        if (!raw || raw === '-') return; // "-" = pas de code dans ce format

        // Nettoyer : extraire juste le code alphanumérique (ex: "J02", "RH", "CA")
        let code = raw.replace(/\s*\(proposé\)\s*/i, '').trim();
        const codeMatch = code.match(/^([A-Za-zÀ-ÿ0-9\-]+)/);
        if (codeMatch) code = codeMatch[1];
        if (!code) return;

        const idx = this.planningCells.findIndex(c =>
          String(c.agent_id) === String(agent.id) && c.date === date
        );
        if (idx >= 0) {
          this.planningCells[idx].code_activite = code;
          this.planningCells[idx].statut = 'validé';
        } else {
          this.planningCells.push({ agent_id: agent.id, date, code_activite: code, statut: 'validé' });
        }
        importedCount++;
      });
    });

    this.planningCells = [...this.planningCells];
    this.hasChanges = true;
    this.saveState();

    if (importedCount > 0) {
      this.messageService.add({
        severity: 'success',
        summary: 'Import réussi',
        detail: `${importedCount} affectation(s) importée(s)${notFoundCount > 0 ? ` — ${notFoundCount} agent(s) non trouvé(s)` : ''}`
      });
    } else {
      this.messageService.add({
        severity: 'warn',
        summary: 'Aucune donnée importée',
        detail: 'Vérifiez le format du fichier Excel et que les dates correspondent à la semaine affichée'
      });
    }
  }

  // Amélioration de la gestion des erreurs
  private handleError(error: any, context: string): void {
    console.error(`Erreur ${context}:`, error);
    
    let message = 'Une erreur est survenue';
    if (error.error?.detail) {
      message = error.error.detail;
    } else if (error.message) {
      message = error.message;
    }
    
    this.messageService.add({
      severity: 'error',
      summary: 'Erreur',
      detail: message
    });
  }

  private getNumberOfWeeks(year: number): number {
    // Utiliser le 28 décembre qui est toujours dans la dernière semaine de l'année
    const date = new Date(year, 11, 28);
    return this.getWeekNumber(date);
  }

  private getMonthForWeek(year: number, week: number): number {
    const dateForYear = new Date(year, 0, 1);
    const startOfWeekDate = this.getStartOfWeek(dateForYear, week);
    // Utiliser le milieu de la semaine (Jeudi) pour déterminer le mois de la semaine
    const middleOfWeekDate = new Date(startOfWeekDate);
    middleOfWeekDate.setDate(startOfWeekDate.getDate() + 3);
    return middleOfWeekDate.getMonth() + 1;
  }

  // ============================================================
  // MÉTHODES BESOINS / ÉCARTS (lignes bas de tableau)
  // ============================================================

  /** Charge les besoins au démarrage pour affichage dans le tableau */
  loadWeeklyNeedsForDisplay(): void {
    if (!this.loggedInUser?.service_id) return;
    const specialityId = this.selectedSpecialityId || undefined;
    this.weeklyNeedsService.getWeeklyNeeds(this.loggedInUser.service_id, specialityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (needs) => {
          this.weeklyNeedsData = needs.map(n => ({
            ...n,
            needs: { J02: n.needs.J02 || 0, J1: n.needs.J1 || 0, JB: n.needs.JB || 0 }
          }));
        },
        error: () => {}
      });
    // Charger aussi les exceptions ponctuelles
    this.weeklyNeedsService.getDailyOverrides(this.loggedInUser.service_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (overrides) => { this.dailyNeedsOverrides = overrides; },
        error: () => {}
      });
  }

  /** Retourne le besoin pour un créneau et une date donnée (override prioritaire) */
  getNeedForDay(date: string, shift: 'J02' | 'J1' | 'JB'): number {
    // Vérifier d'abord s'il y a une exception pour cette date
    const override = this.dailyNeedsOverrides.find(o => o.date === date);
    if (override && override.needs[shift] !== undefined) {
      return override.needs[shift]!;
    }
    // Sinon utiliser la semaine type
    const dayOfWeek = new Date(date).getDay();
    const need = this.weeklyNeedsData.find(n => n.day_of_week === dayOfWeek);
    return need?.needs[shift] ?? 0;
  }

  /** Met à jour planningCells et force le recalcul du suivi des effectifs */
  private refreshPlanningCells(): void {
    this.planningCells = [...this.planningCells];
    this.cdr.detectChanges();
  }

  /** Compte les agents présents sur un créneau pour une date */
  getCountForDay(date: string, shift: 'J02' | 'J1' | 'JB'): number {
    return this.planningCells.filter(c => c.date === date && c.code_activite === shift).length;
  }

  /** Retourne l'écart (présents - besoins) */
  getEcartForDay(date: string, shift: 'J02' | 'J1' | 'JB'): number {
    return this.getCountForDay(date, shift) - this.getNeedForDay(date, shift);
  }

  // ============================================================
  // MÉTHODES POUR SEMAINE TYPE
  // ============================================================

  /**
   * Ouvre la modal d'import/modification de la semaine type
   */
  openImportWeeklyNeedsModal(): void {
    this.showImportWeeklyNeedsModal = true;
    this.weeklyNeedsLoaded = false;
    this.loadWeeklyNeeds();
  }

  /**
   * Charge la semaine type pour le service/pôle actuel
   */
  loadWeeklyNeeds(): void {
    if (!this.loggedInUser?.service_id) {
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Impossible de déterminer le service. Veuillez vous reconnecter.'
      });
      return;
    }

    // Utiliser service_id comme identifiant du pôle
    this.weeklyNeedsService.getWeeklyNeeds(this.loggedInUser.service_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (needs) => {
          // Si pas de données, créer structure vide pour 7 jours
          if (needs.length === 0) {
            this.weeklyNeedsData = [];
            for (let i = 0; i < 7; i++) {
              this.weeklyNeedsData.push({
                pole_id: this.loggedInUser.service_id, // Utiliser service_id comme pole_id
                day_of_week: i,
                needs: { J02: 0, J1: 0, JB: 0 }
              });
            }
          } else {
            // Remplir les jours manquants
            const existingDays = new Set(needs.map(n => n.day_of_week));
            this.weeklyNeedsData = needs.map(n => ({
              ...n,
              needs: {
                J02: n.needs.J02 || 0,
                J1: n.needs.J1 || 0,
                JB: n.needs.JB || 0
              }
            }));
            
            for (let i = 0; i < 7; i++) {
              if (!existingDays.has(i)) {
                this.weeklyNeedsData.push({
                  pole_id: this.loggedInUser.pole_id,
                  day_of_week: i,
                  needs: { J02: 0, J1: 0, JB: 0 }
                });
              }
            }
            
            // Trier par jour de semaine
            this.weeklyNeedsData.sort((a, b) => a.day_of_week - b.day_of_week);
          }
          this.weeklyNeedsLoaded = true;
        },
        error: (err) => {
          console.error('Erreur chargement semaine type:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de charger la semaine type'
          });
        }
      });
  }

  /**
   * Sauvegarde la semaine type
   */
  saveWeeklyNeeds(): void {
    if (!this.loggedInUser?.service_id) {
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Impossible de déterminer le service. Veuillez vous reconnecter.'
      });
      return;
    }

    this.savingWeeklyNeeds = true;
    
    // Utiliser service_id comme pole_id
    const saveRequests = this.weeklyNeedsData.map(need => 
      this.weeklyNeedsService.createOrUpdateWeeklyNeed({
        pole_id: this.loggedInUser.service_id, // Utiliser service_id comme pole_id
        service_id: this.loggedInUser.service_id,
        day_of_week: need.day_of_week,
        needs: need.needs
      }, this.loggedInUser._id || 'system')
    );

    forkJoin(saveRequests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: 'Semaine type sauvegardée avec succès'
          });
          this.savingWeeklyNeeds = false;
          this.showImportWeeklyNeedsModal = false;
        },
        error: (err) => {
          console.error('Erreur sauvegarde semaine type:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de sauvegarder la semaine type: ' + (err.error?.detail || err.message)
          });
          this.savingWeeklyNeeds = false;
        }
      });
  }

  /**
   * Retourne le nom du jour à partir de l'index
   */
  getDayNameFromIndex(index: number): string {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[index] || '';
  }

  // ============================================================
  // MÉTHODES POUR OPTIMISATION
  // ============================================================

  /**
   * Vérifie si on peut générer un planning optimisé
   */
  canGeneratePlanning(): boolean {
    // 1. Vérifier rôle cadre
    if (this.loggedInUser?.role !== 'cadre') {
      this.generationErrorMessage = 'Seuls les cadres peuvent générer un planning optimisé';
      return false;
    }

    // 2. Vérifier qu'il y a des agents
    if (this.agents.length === 0) {
      this.generationErrorMessage = 'Aucun agent trouvé pour générer le planning';
      return false;
    }

    // 3. Vérifier même service (qui correspond au pôle dans notre cas)
    const serviceIds = new Set(this.agents.map(a => a.service_id).filter(id => id));
    if (serviceIds.size === 0) {
      this.generationErrorMessage = 'Aucun agent n\'a de service assigné';
      return false;
    }
    if (serviceIds.size > 1) {
      this.generationErrorMessage = 'Les agents doivent tous appartenir au même service/pôle';
      return false;
    }

    // 4. Vérifier qu'il y a des besoins dans le planning actuel
    const weeklyNeeds = this.extractWeeklyNeedsFromPlanning();
    const hasNeeds = Object.values(weeklyNeeds).some(day => 
      day.J02 > 0 || day.J1 > 0 || day.JB > 0
    );
    if (!hasNeeds) {
      this.generationErrorMessage = 'Aucun besoin (J02, J1, JB) détecté dans le planning actuel. Définissez d\'abord des besoins dans la simulation.';
      return false;
    }

    this.generationErrorMessage = '';
    return true;
  }

  /**
   * Ouvre la modal de génération de planning
   */
  openGeneratePlanningModal(): void {
    if (!this.canGeneratePlanning()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Génération impossible',
        detail: this.generationErrorMessage
      });
      return;
    }

    // Définir la date de début à aujourd'hui par défaut
    this.optimizationStartDate = new Date();

    this.showGeneratePlanningModal = true;
  }

  /**
   * Extrait les besoins quotidiens depuis les cellules de planning affichées
   * pour créer automatiquement une semaine type
   */
  extractWeeklyNeedsFromPlanning(): { [dayOfWeek: number]: { J02: number, J1: number, JB: number } } {
    const needsByDay: { [dayOfWeek: number]: { J02: number, J1: number, JB: number } } = {};
    
    // Initialiser tous les jours de la semaine
    for (let i = 0; i < 7; i++) {
      needsByDay[i] = { J02: 0, J1: 0, JB: 0 };
    }

    // Analyser les cellules de planning pour chaque jour
    const allDays = this.getAllDays();
    allDays.forEach(dateStr => {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi
      
      // Compter les cellules par type de shift pour ce jour
      const dayCells = this.planningCells.filter(cell => cell.date === dateStr);
      
      dayCells.forEach(cell => {
        const shift = cell.code_activite;
        if (shift === 'J02' || shift === 'J1' || shift === 'JB') {
          needsByDay[dayOfWeek][shift as 'J02' | 'J1' | 'JB']++;
        }
      });
    });

    return needsByDay;
  }

  /**
   * Génère le planning optimisé
   */
  generateOptimizedPlanning(): void {
    if (!this.loggedInUser?.service_id) {
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Impossible de déterminer le service. Veuillez vous reconnecter.'
      });
      return;
    }

    // Vérifier qu'il y a des agents
    if (this.agents.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Avertissement',
        detail: 'Aucun agent trouvé pour générer le planning'
      });
      return;
    }

    // Extraire les besoins depuis le planning actuel
    const weeklyNeeds = this.extractWeeklyNeedsFromPlanning();
    
    // Vérifier qu'il y a des besoins définis
    const hasNeeds = Object.values(weeklyNeeds).some(day => 
      day.J02 > 0 || day.J1 > 0 || day.JB > 0
    );
    
    if (!hasNeeds) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Avertissement',
        detail: 'Aucun besoin (J02, J1, JB) détecté dans le planning actuel. Veuillez définir des besoins dans la simulation avant de générer.'
      });
      return;
    }

    this.generatingPlanning = true;
    const startDateStr = this.optimizationStartDate.toISOString().split('T')[0];

    // Utiliser service_id comme pole_id (le backend devra gérer cette correspondance)
    const poleId = this.agents.length > 0 ? this.agents[0].service_id : this.loggedInUser.service_id;

    // Sauvegarder d'abord la semaine type extraite
    this.saveWeeklyNeedsFromExtraction(weeklyNeeds, poleId).then(() => {
      const request: OptimizationRequest = {
        start_date: startDateStr,
        num_weeks: 8,
        pole_id: poleId || this.loggedInUser.service_id
      };

      this.planningOptimizationService.optimizePlanning(request)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success && response.planning) {
              // Convertir les résultats en PlanningCell
              const newCells: PlanningCell[] = response.planning.map(assignment => ({
                agent_id: assignment.employee_id,
                date: assignment.date,
                code_activite: assignment.shift,
                statut: 'validé',
                heureDebut: assignment.start_time,
                heureFin: assignment.end_time
              }));

              // Remplacer les cellules existantes pour la période générée
              const generatedDates = new Set(newCells.map(c => c.date));
              this.planningCells = this.planningCells.filter(c => !generatedDates.has(c.date));
              this.planningCells.push(...newCells);
            this.planningCells = [...this.planningCells];

            this.hasChanges = true;
            this.saveState();

            // Afficher statistiques
            if (response.statistics) {
              const stats = response.statistics;
              this.messageService.add({
                severity: 'success',
                summary: 'Planning généré avec succès',
                detail: `Planning optimisé généré pour ${stats.total_assignments} assignations. Temps de résolution: ${stats.solver_time.toFixed(2)}s`
              });
            } else {
              this.messageService.add({
                severity: 'success',
                summary: 'Planning généré',
                detail: 'Planning optimisé généré avec succès'
              });
            }

            this.showGeneratePlanningModal = false;
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'Échec de la génération',
              detail: response.error || 'Impossible de générer un planning satisfaisant'
            });
          }
          this.generatingPlanning = false;
        },
        error: (err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: err.error?.detail || 'Erreur lors de la génération du planning'
          });
            this.generatingPlanning = false;
          }
        });
    }).catch((error) => {
      console.error('Erreur lors de la sauvegarde de la semaine type:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Impossible de sauvegarder la semaine type extraite'
      });
      this.generatingPlanning = false;
    });
  }

  /**
   * Sauvegarde la semaine type extraite depuis le planning actuel
   */
  private saveWeeklyNeedsFromExtraction(
    weeklyNeeds: { [dayOfWeek: number]: { J02: number, J1: number, JB: number } },
    poleId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const savePromises: Promise<any>[] = [];
      
      // Sauvegarder chaque jour de la semaine
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const needs = weeklyNeeds[dayOfWeek];
        const weeklyNeed: WeeklyNeed = {
          pole_id: poleId,
          day_of_week: dayOfWeek,
          needs: {
            J02: needs.J02,
            J1: needs.J1,
            JB: needs.JB
          }
        };
        
        savePromises.push(
          this.weeklyNeedsService.createOrUpdateWeeklyNeed(weeklyNeed, this.loggedInUser?._id || 'system').toPromise()
        );
      }
      
      Promise.all(savePromises)
        .then(() => {
          console.log('✅ Semaine type sauvegardée depuis le planning actuel');
          resolve();
        })
        .catch((error) => {
          console.error('❌ Erreur lors de la sauvegarde de la semaine type:', error);
          reject(error);
        });
    });
  }
}
