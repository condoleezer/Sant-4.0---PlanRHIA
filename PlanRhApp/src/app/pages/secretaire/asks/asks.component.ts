import { Component, OnInit } from '@angular/core';
import { TableModule } from 'primeng/table';
import { CommonModule } from '@angular/common';
import { TabViewModule } from 'primeng/tabview';
import { AbsenceService } from '../../../services/absence/absence.service';
import { UserService } from '../../../services/user/user.service';
import { ServiceService } from '../../../services/service/service.service';
import { Absence } from '../../../models/absence';
import { User } from '../../../models/User';
import { Service } from '../../../models/services';
import { forkJoin } from 'rxjs';
import { MessageService, SelectItem } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../../services/auth/auth.service';
import { BadgeModule } from 'primeng/badge';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { CodeService } from '../../../services/code/code.service';
import { Code } from '../../../models/services';
import { PlanningExchangeService } from '../../../services/planning-exchange/planning-exchange.service';
import { CalendarSyncService } from '../../../services/calendar-sync/calendar-sync.service';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-asks',
  imports: [
    TableModule,
    CommonModule,
    TabViewModule,
    ToastModule,
    BadgeModule,
    FormsModule,
    DropdownModule,
    InputTextModule,
    PaginatorModule,
    SelectModule,
    ButtonModule,
    CalendarModule,
    DialogModule
  ],
  providers: [MessageService, AuthService],
  standalone: true,
  templateUrl: './asks.component.html',
  styleUrls: ['./asks.component.css']
})
export class AsksComponent implements OnInit {
  cols: string[] = [
    'Code absence',
    'Demandeur',
    'Date début',
    'Date fin',
    'Heure',
    'Service',
    'Actions'
  ];

  cols1: string[] = [
    'Code absence',
    'Demandeur',
    'Date début',
    'Date fin',
    'Heure',
    'Service',
    'Status'
  ];

  cols2: string[] = [
    'Code absence',
    'Nom remplaçant',
    'Date demande',
    'Date début',
    'Date fin',
    'Service',
    'Status'
  ];

  requests: any[] = [];
  filteredRequests: any[] = [];
  requests2: any[] = [];
  filteredRequests2: any[] = [];
  requests3: any[] = [];
  filteredRequests3: any[] = [];
  loggedInUserId: string | null = null;
  allAbsences: Absence[] = [];
  allUsers: User[] = [];
  allServices: Service[] = [];
  allCodeAbsences: Code[] = [];

  searchTerm1: string = '';
  searchTerm2: string = '';
  searchTerm3: string = '';
  selectedStatus1: string = '';
  selectedStatus2: string = '';
  selectedStatus3: string = '';
  statusOptions: SelectItem[] = [
    { label: 'Tous', value: '' },
    { label: 'En cours', value: 'En cours' },
    { label: 'Accepté par le remplaçant', value: 'Accepté par le remplaçant' },
    { label: 'Refusé par le remplaçant', value: 'Refusé par le remplaçant' },
    { label: 'Validé par le cadre', value: 'Validé par le cadre' },
    { label: 'Refusé par le cadre', value: 'Refusé par le cadre' }
  ];

  activeTabIndex: number = 0;
  first1: number = 0;
  rows1: number = 10;
  totalRecords1: number = 0;
  first2: number = 0;
  rows2: number = 10;
  totalRecords2: number = 0;
  first3: number = 0;
  rows3: number = 10;
  totalRecords3: number = 0;

  // Échanges de planning
  pendingExchanges: any[] = [];   // reçus en attente (B doit répondre)
  sentExchanges: any[] = [];      // envoyés par l'agent
  historyExchanges: any[] = [];   // tous les échanges traités (historique)
  loadingExchanges = false;

  // Modal récupération pour les échanges reçus
  showRecoveryModal = false;
  pendingExchangeId = '';
  requesterPlannings: any[] = [];
  selectedRecoveryDate: string | null = null;
  selectedRecoveryPlanningId: string | null = null;   // planning de repos de A (peut être null si non programmé)
  selectedRecoveryBPlanningId: string | null = null;  // planning de travail de B sur la date de récupération
  loadingRequesterPlannings = false;
  today: Date = new Date();
  proposedByRequester = false;  // true si A a proposé des dates spécifiques
  overtimeQuotaReached = false; // true si B a atteint son quota heures sup

  constructor(
    private absenceService: AbsenceService,
    private userService: UserService,
    private serviceService: ServiceService,
    private codeService: CodeService,
    private authService: AuthService,
    private messageService: MessageService,
    private planningExchangeService: PlanningExchangeService,
    private calendarSyncService: CalendarSyncService
  ) {}

  ngOnInit(): void {
    this.loadUserAndAbsences();
  }

  loadExchanges(): void {
    if (!this.loggedInUserId) return;
    this.loadingExchanges = true;
    this.planningExchangeService.getExchanges(this.loggedInUserId).subscribe({
      next: (res: any) => {
        const all = res.data || [];
        // Reçus en attente : target = moi, statut en_attente
        this.pendingExchanges = all.filter((e: any) =>
          e.target_id === this.loggedInUserId && e.status === 'en_attente'
        );
        // Envoyés : requester = moi, statut en_attente
        this.sentExchanges = all.filter((e: any) =>
          e.requester_id === this.loggedInUserId && e.status === 'en_attente'
        );
        // Historique : tous les échanges traités (pas en_attente)
        this.historyExchanges = all.filter((e: any) =>
          e.status !== 'en_attente'
        );
        this.loadingExchanges = false;
      },
      error: () => { this.loadingExchanges = false; }
    });
  }

  openRecoveryModal(exchange: any): void {
    this.pendingExchangeId = exchange._id;
    this.selectedRecoveryDate = null;
    this.selectedRecoveryPlanningId = null;
    this.selectedRecoveryBPlanningId = null;
    this.proposedByRequester = false;
    this.overtimeQuotaReached = false;
    this.loadingRequesterPlannings = true;
    this.showRecoveryModal = true;

    this.planningExchangeService.getRequesterPlannings(exchange._id).subscribe({
      next: (res: any) => {
        this.requesterPlannings = res.data || [];
        this.proposedByRequester = res.proposed_by_requester === true;
        this.loadingRequesterPlannings = false;
      },
      error: () => { this.requesterPlannings = []; this.loadingRequesterPlannings = false; }
    });

    // Vérifier le quota heures sup de B
    if (this.loggedInUserId) {
      this.planningExchangeService.checkOvertimeQuota(this.loggedInUserId).subscribe({
        next: (res: any) => { this.overtimeQuotaReached = res.quota_reached === true; },
        error: () => { this.overtimeQuotaReached = false; }
      });
    }
  }

  selectRecoveryDate(day: any): void {
    if (this.selectedRecoveryDate === day.date) {
      this.selectedRecoveryDate = null;
      this.selectedRecoveryPlanningId = null;
      this.selectedRecoveryBPlanningId = null;
    } else {
      this.selectedRecoveryDate = day.date;
      this.selectedRecoveryPlanningId = day.planning_id;
      this.selectedRecoveryBPlanningId = day.b_planning_id || null;
    }
  }

  getRecoveryCode(): string {
    return this.requesterPlannings.find((p: any) => p.date === this.selectedRecoveryDate)?.activity_code || '';
  }

  confirmExchangeResponse(withRecovery: boolean): void {
    const recoveryDate = withRecovery ? this.selectedRecoveryDate || undefined : undefined;
    const targetPlanningId = withRecovery ? this.selectedRecoveryPlanningId || undefined : undefined;
    const bPlanningId = withRecovery ? this.selectedRecoveryBPlanningId || undefined : undefined;
    this.showRecoveryModal = false;
    this.planningExchangeService.respondToExchange(this.pendingExchangeId, 'accepté', undefined, recoveryDate, targetPlanningId, bPlanningId)
      .subscribe({
        next: (res: any) => {
          let detail = 'Échange accepté et appliqué.';
          if (!withRecovery && res.hours_sup_credited > 0) detail += ` ${res.hours_sup_credited}h créditées en heures sup.`;
          if (withRecovery) detail += ' Récupération enregistrée.';
          this.messageService.add({ severity: 'success', summary: 'Échange effectué ✅', detail, life: 8000 });
          this.calendarSyncService.forceRefresh();
          this.loadExchanges();
        },
        error: (err: any) => {
          const d = err.error?.detail;
          this.messageService.add({ severity: 'error', summary: 'Erreur', detail: typeof d === 'string' ? d : 'Erreur lors de la réponse' });
        }
      });
  }

  refuseExchange(exchangeId: string): void {
    this.planningExchangeService.respondToExchange(exchangeId, 'refusé').subscribe({
      next: () => {
        this.messageService.add({ severity: 'info', summary: 'Refusé', detail: 'Échange refusé.' });
        this.loadExchanges();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de refuser' })
    });
  }

  getExchangeStatusSeverity(status: string): 'success' | 'info' | 'danger' | 'secondary' | 'warn' {
    switch (status) {
      case 'validé_auto': return 'success';
      case 'en_attente': return 'warn';
      case 'refusé': case 'refusé_charte': return 'danger';
      default: return 'secondary';
    }
  }

  loadUserAndAbsences(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: User | null) => {
        if (user?._id) {
          this.loggedInUserId = user._id;
          this.loadAllData();
          this.loadExchanges();
        } else {
          this.loggedInUserId = null;
          this.showError('Impossible de charger les informations utilisateur');
        }
      },
      error: (err) => {
        this.loggedInUserId = null;
        this.showError('Échec de la connexion au serveur');
      }
    });
  }

  loadAllData(): void {
    // D'abord synchroniser les codes depuis les plannings
    this.codeService.syncCodesFromPlannings().subscribe({
      next: () => {
        // Ensuite charger toutes les données
        forkJoin([
          this.absenceService.findAllAbsences(),
          this.userService.findAllUsers(),
          this.serviceService.findAllServices(),
          this.codeService.findAllCodes()
        ]).subscribe({
          next: ([absencesResponse, usersResponse, servicesResponse, codeResponse]) => {
            this.allAbsences = absencesResponse.data || [];
            this.allUsers = usersResponse.data || [];
            this.allServices = servicesResponse.data || [];
            this.allCodeAbsences = codeResponse.data || [];
            
            this.loadReceivedRequests();
            this.loadSentRequests();
            this.loadSentRequests2();
          },
          error: (err) => {
            console.error('Error loading data:', err);
            this.showError('Échec du chargement des données');
          }
        });
      },
      error: () => {
        // En cas d'erreur de synchronisation, charger quand même les données
        forkJoin([
          this.absenceService.findAllAbsences(),
          this.userService.findAllUsers(),
          this.serviceService.findAllServices(),
          this.codeService.findAllCodes()
        ]).subscribe({
          next: ([absencesResponse, usersResponse, servicesResponse, codeResponse]) => {
            this.allAbsences = absencesResponse.data || [];
            this.allUsers = usersResponse.data || [];
            this.allServices = servicesResponse.data || [];
            this.allCodeAbsences = codeResponse.data || [];
            
            this.loadReceivedRequests();
            this.loadSentRequests();
            this.loadSentRequests2();
          },
          error: (err) => {
            console.error('Error loading data:', err);
            this.showError('Échec du chargement des données');
          }
        });
      }
    });
  }

  loadReceivedRequests(): void {
    if (!this.loggedInUserId) return;
    
    const receivedAbsences = this.allAbsences.filter(
      absence => absence.replacement_id === this.loggedInUserId
    );

    this.requests = receivedAbsences.map(absence => {
      const staffUser = this.allUsers.find(user => user._id === absence.staff_id);
      const service = this.allServices.find(s => s.id === absence.service_id);
      const code = this.allCodeAbsences.find(s => s.id === absence.absence_code_id);

      return {
        id: absence.id || absence._id, // Support both id and _id
        nom: staffUser ? `${staffUser.first_name} ${staffUser.last_name}` : 'Inconnu',
        dateDebut: this.formatDate(absence.start_date),
        dateFin: this.formatDate(absence.end_date),
        heure: `${absence.start_hour}H - ${absence.end_hour}H`,
        service: service?.name || 'Non attribué',
        code: code?.name_abrege || 'Non attribué',
        status: absence.status,
        replacementId: absence.replacement_id || 'Non attribué',
      };
    });

    this.filteredRequests = [...this.requests];
    this.applyFilter();
  }

  loadSentRequests(): void {
    if (!this.loggedInUserId) return;
    
    const sentAbsences = this.allAbsences.filter(
      absence => absence.staff_id === this.loggedInUserId && ['En cours', 'Accepté par le remplaçant', 'Refusé par le remplaçant'].includes(absence.status)
    );

    this.requests2 = sentAbsences.map(absence => {
      const replacementUser = absence.replacement_id 
        ? this.allUsers.find(user => user._id === absence.replacement_id)
        : null;
      const service = this.allServices.find(s => s.id === absence.service_id);
      const code = this.allCodeAbsences.find(s => s.id === absence.absence_code_id);
      
      return {
        id: absence.id || absence._id,
        nom: replacementUser ? `${replacementUser.first_name} ${replacementUser.last_name}` : 'Non spécifié',
        dateDemande: this.formatDate(absence.start_date),
        dateDebut: this.formatDate(absence.start_date),
        dateFin: this.formatDate(absence.end_date),
        service: service?.name || 'Non attribué',
        status: absence.status,
        code: code?.name_abrege || 'Non attribué',
        replacementId: absence.replacement_id || 'Non attribué',
      };
    });

    this.filteredRequests2 = [...this.requests2];
    this.applyFilter();
  }

  loadSentRequests2(): void {
    if (!this.loggedInUserId) return;
    
    const sentAbsences = this.allAbsences.filter(
      absence => absence.staff_id === this.loggedInUserId && ['Validé par le cadre', 'Refusé par le cadre'].includes(absence.status)
    );

    this.requests3 = sentAbsences.map(absence => {
      const replacementUser = absence.replacement_id 
        ? this.allUsers.find(user => user._id === absence.replacement_id)
        : null;
      const service = this.allServices.find(s => s.id === absence.service_id);
      const code = this.allCodeAbsences.find(s => s.id === absence.absence_code_id);
      
      return {
        id: absence.id || absence._id,
        nom: replacementUser ? `${replacementUser.first_name} ${replacementUser.last_name}` : 'Non spécifié',
        dateDemande: this.formatDate(absence.start_date),
        dateDebut: this.formatDate(absence.start_date),
        dateFin: this.formatDate(absence.end_date),
        heure: `${absence.start_hour}H - ${absence.end_hour}H`,
        service: service?.name || 'Non attribué',
        code: code?.name_abrege || 'Non attribué',
        status: absence.status,
        replacementId: absence.replacement_id || 'Non attribué',
      };
    });

    this.filteredRequests3 = [...this.requests3];
    this.applyFilter();
  }

  applyFilter(): void {
    if (this.activeTabIndex === 0) {
      const term = (this.searchTerm1 || '').toLowerCase();
      this.filteredRequests = this.requests.filter(request => {
        const nom = (request.nom || '').toLowerCase();
        const dateDebut = (request.dateDebut || '').toLowerCase();
        const dateFin = (request.dateFin || '').toLowerCase();
        const heure = (request.heure || '').toLowerCase();
        const service = (request.service || '').toLowerCase();
        const status = (request.status || '').toLowerCase();
        const matchesSearch =
          term === '' ||
          nom.includes(term) ||
          dateDebut.includes(term) ||
          dateFin.includes(term) ||
          heure.includes(term) ||
          service.includes(term) ||
          status.includes(term);
        const matchesStatus = !this.selectedStatus1 || request.status === this.selectedStatus1;
        return matchesSearch && matchesStatus;
      });
      this.updatePagination();
    } else if (this.activeTabIndex === 1) {
      const term = (this.searchTerm3 || '').toLowerCase();
      this.filteredRequests3 = this.requests3.filter(request => {
        const nom = (request.nom || '').toLowerCase();
        const dateDebut = (request.dateDebut || '').toLowerCase();
        const dateFin = (request.dateFin || '').toLowerCase();
        const heure = (request.heure || '').toLowerCase();
        const service = (request.service || '').toLowerCase();
        const status = (request.status || '').toLowerCase();
        const matchesSearch =
          term === '' ||
          nom.includes(term) ||
          dateDebut.includes(term) ||
          dateFin.includes(term) ||
          heure.includes(term) ||
          service.includes(term) ||
          status.includes(term);
        const matchesStatus = !this.selectedStatus3 || request.status === this.selectedStatus3;
        return matchesSearch && matchesStatus;
      });
      this.updatePagination();
    } else if (this.activeTabIndex === 2) {
      const term = (this.searchTerm2 || '').toLowerCase();
      this.filteredRequests2 = this.requests2.filter(request => {
        const nom = (request.nom || '').toLowerCase();
        const dateDemande = (request.dateDemande || '').toLowerCase();
        const dateDebut = (request.dateDebut || '').toLowerCase();
        const dateFin = (request.dateFin || '').toLowerCase();
        const service = (request.service || '').toLowerCase();
        const status = (request.status || '').toLowerCase();
        const matchesSearch =
          term === '' ||
          nom.includes(term) ||
          dateDemande.includes(term) ||
          dateDebut.includes(term) ||
          dateFin.includes(term) ||
          service.includes(term) ||
          status.includes(term);
        const matchesStatus = !this.selectedStatus2 || request.status === this.selectedStatus2;
        return matchesSearch && matchesStatus;
      });
      this.updatePagination();
    }
  }

  updatePagination(): void {
    if (this.activeTabIndex === 0) {
      this.totalRecords1 = this.filteredRequests.length;
      this.first1 = 0;
    } else if (this.activeTabIndex === 1) {
      this.totalRecords3 = this.filteredRequests3.length;
      this.first3 = 0;
    } else if (this.activeTabIndex === 2) {
      this.totalRecords2 = this.filteredRequests2.length;
      this.first2 = 0;
    }
  }

  onTabChange(event: any): void {
    this.activeTabIndex = event.index;
    this.applyFilter();
  }

  onPageChange1(event: PaginatorState): void {
    this.first1 = event.first ?? 0;
    this.rows1 = event.rows ?? 10;
  }

  onPageChange2(event: PaginatorState): void {
    this.first2 = event.first ?? 0;
    this.rows2 = event.rows ?? 10;
  }

  onPageChange3(event: PaginatorState): void {
    this.first3 = event.first ?? 0;
    this.rows3 = event.rows ?? 10;
  }

  private formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return isNaN(date.getTime()) 
      ? dateString 
      : date.toLocaleDateString('fr-FR');
  }

  private showError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erreur',
      detail: message
    });
  }

  private showInfo(message: string): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Information',
      detail: message
    });
  }

  acceptRequest(absenceId: string, replacementId: string | null): void {
    // Pour les demandes reçues, l'absence a déjà le bon replacement_id (le soignant qui accepte)
    // On ne passe pas de replacementId car il ne doit pas être modifié
    this.absenceService.updateAbsence(
      absenceId,
      'Accepté par le remplaçant',
      null  // Ne pas modifier le replacement_id existant
    ).subscribe({
      next: () => {
        this.loadAllData();
        this.showSuccess('Demande de remplacement acceptée');
      },
      error: (err) => {
        console.error('Error accepting request:', err);
        this.showError(err.error?.detail || 'Échec de l\'acceptation');
      }
    });
  }
  
  refuseRequest(absenceId: string, replacementId: string | null): void {
    // Pour les demandes reçues, l'absence a déjà le bon replacement_id (le soignant qui refuse)
    // On ne passe pas de replacementId car il ne doit pas être modifié
    this.absenceService.updateAbsence(
      absenceId,
      'Refusé par le remplaçant',
      null  // Ne pas modifier le replacement_id existant
    ).subscribe({
      next: () => {
        this.loadAllData();
        this.showSuccess('Demande remplacement refusée');
      },
      error: (err) => {
        console.error('Error refusing request:', err);
        this.showError(err.error?.detail || 'Échec du refus');
      }
    });
  }

  private showSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Succès',
      detail: message
    });
  }

  getBadgeSeverity(status: string): 'success' | 'info' | 'danger' | 'secondary' | 'warn' {
    switch (status.toLowerCase()) {
      case 'accepté par le remplaçant':
        return 'warn';
      case 'validé par le cadre':
        return 'success';
      case 'en cours':
        return 'info';
      case 'refusé':
      case 'refusé par le remplaçant':
      case 'refusé par le cadre':
        return 'danger';
      default:
        return 'secondary';
    }
  }
}