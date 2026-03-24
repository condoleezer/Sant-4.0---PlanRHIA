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
    SelectModule
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

  constructor(
    private absenceService: AbsenceService,
    private userService: UserService,
    private serviceService: ServiceService,
    private codeService: CodeService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadUserAndAbsences();
  }

  loadUserAndAbsences(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: User | null) => {
        if (user?._id) {
          this.loggedInUserId = user._id;
          this.loadAllData();
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
    if (this.requests.length === 0) {
      this.showInfo('Aucune demande reçue');
    }
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
    if (this.requests2.length === 0) {
      this.showInfo('Aucune demande envoyée');
    }
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
    if (this.requests3.length === 0) {
      this.showInfo('Aucune demande envoyée');
    }
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