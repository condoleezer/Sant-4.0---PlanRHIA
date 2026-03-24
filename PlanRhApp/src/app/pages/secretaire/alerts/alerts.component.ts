import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';
import { BadgeModule } from 'primeng/badge';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { CalendarModule } from 'primeng/calendar';
import { Subject, takeUntil, interval } from 'rxjs';

import { AlertsService } from '../../../services/alerts/alerts.service';
import { Alert } from '../../../models/alert';

interface AlertFilter {
  status: string;
  priority: string;
  type: string;
  dateRange: Date[];
}

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ToastModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    TagModule,
    CardModule,
    BadgeModule,
    DialogModule,
    TextareaModule,
    CalendarModule
  ],
  providers: [MessageService],
  templateUrl: './alerts.component.html',
  styleUrls: ['./alerts.component.css']
})
export class AlertsComponent implements OnInit, OnDestroy {
  alerts: Alert[] = [];
  filteredAlerts: Alert[] = [];
  loading = false;
  selectedAlert: Alert | null = null;
  showAlertDialog = false;
  showActionDialog = false;
  actionComment = '';
  actionType: 'resolve' | 'escalate' | 'dismiss' = 'resolve';
  
  // Filtres
  searchText = '';
  filter: AlertFilter = {
    status: '',
    priority: '',
    type: '',
    dateRange: []
  };
  
  // Options pour les filtres
  statusOptions = [
    { label: 'Tous les statuts', value: '' },
    { label: 'Nouveau', value: 'new' },
    { label: 'En cours', value: 'in_progress' },
    { label: 'Résolu', value: 'resolved' },
    { label: 'Escaladé', value: 'escalated' },
    { label: 'Ignoré', value: 'dismissed' }
  ];
  
  priorityOptions = [
    { label: 'Toutes les priorités', value: '' },
    { label: 'Critique', value: 'critical' },
    { label: 'Haute', value: 'high' },
    { label: 'Moyenne', value: 'medium' },
    { label: 'Basse', value: 'low' }
  ];
  
  typeOptions = [
    { label: 'Tous les types', value: '' },
    { label: 'Absence non justifiée', value: 'unjustified_absence' },
    { label: 'Heures supplémentaires', value: 'overtime' },
    { label: 'Conflit de planning', value: 'schedule_conflict' },
    { label: 'Ressources insuffisantes', value: 'insufficient_resources' },
    { label: 'Anomalie de contrat', value: 'contract_anomaly' }
  ];
  
  // Statistiques
  stats = {
    total: 0,
    new: 0,
    inProgress: 0,
    resolved: 0,
    critical: 0
  };
  
  private destroy$ = new Subject<void>();
  private refreshInterval = interval(30000); // Actualisation toutes les 30 secondes

  constructor(
    private alertsService: AlertsService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadAlerts();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAlerts(): void {
    this.loading = true;
    this.alertsService.getAllAlerts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.alerts = response.data || [];
          this.applyFilters();
          this.calculateStats();
          this.loading = false;
        },
        error: (error) => {
          console.error('Erreur lors du chargement des alertes:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de charger les alertes'
          });
          this.loading = false;
        }
      });
  }

  startAutoRefresh(): void {
    this.refreshInterval
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadAlerts();
      });
  }

  applyFilters(): void {
    this.filteredAlerts = this.alerts.filter(alert => {
      const matchesSearch = !this.searchText || 
        alert.title.toLowerCase().includes(this.searchText.toLowerCase()) ||
        alert.description.toLowerCase().includes(this.searchText.toLowerCase()) ||
        alert.user_name?.toLowerCase().includes(this.searchText.toLowerCase());
      
      const matchesStatus = !this.filter.status || alert.status === this.filter.status;
      const matchesPriority = !this.filter.priority || alert.priority === this.filter.priority;
      const matchesType = !this.filter.type || alert.type === this.filter.type;
      
      const matchesDate = !this.filter.dateRange.length || 
        (this.filter.dateRange.length === 2 && 
         new Date(alert.created_at) >= this.filter.dateRange[0] && 
         new Date(alert.created_at) <= this.filter.dateRange[1]);
      
      return matchesSearch && matchesStatus && matchesPriority && matchesType && matchesDate;
    });
  }

  calculateStats(): void {
    this.stats = {
      total: this.alerts.length,
      new: this.alerts.filter(a => a.status === 'new').length,
      inProgress: this.alerts.filter(a => a.status === 'in_progress').length,
      resolved: this.alerts.filter(a => a.status === 'resolved').length,
      critical: this.alerts.filter(a => a.priority === 'critical').length
    };
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchText = '';
    this.filter = {
      status: '',
      priority: '',
      type: '',
      dateRange: []
    };
    this.applyFilters();
  }

  viewAlert(alert: Alert): void {
    this.selectedAlert = alert;
    this.showAlertDialog = true;
  }

  takeAction(alert: Alert, action: 'resolve' | 'escalate' | 'dismiss'): void {
    this.selectedAlert = alert;
    this.actionType = action;
    this.actionComment = '';
    this.showActionDialog = true;
  }

  confirmAction(): void {
    if (!this.selectedAlert) return;

    const updateData = {
      status: this.actionType === 'resolve' ? 'resolved' : 
              this.actionType === 'escalate' ? 'escalated' : 'dismissed',
      comment: this.actionComment,
      resolved_at: new Date().toISOString(),
      resolved_by: 'current_user_id' // À remplacer par l'ID de l'utilisateur connecté
    };

    this.alertsService.updateAlert(this.selectedAlert._id!, updateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: `Alerte ${this.actionType === 'resolve' ? 'résolue' : 
                     this.actionType === 'escalate' ? 'escaladée' : 'ignorée'} avec succès`
          });
          this.showActionDialog = false;
          this.loadAlerts();
        },
        error: (error) => {
          console.error('Erreur lors de la mise à jour:', error);
          let errorMessage = 'Impossible de mettre à jour l\'alerte';
          
          if (error.status === 404) {
            errorMessage = 'Alerte non trouvée';
          } else if (error.status === 500) {
            errorMessage = 'Erreur serveur lors de la mise à jour';
          } else if (error.status === 0) {
            errorMessage = 'Impossible de se connecter au serveur';
          }
          
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: errorMessage
          });
        }
      });
  }

  getSeverity(priority: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (priority) {
      case 'critical': return 'danger';
      case 'high': return 'warn';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'info';
    }
  }

  getStatusSeverity(status: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (status) {
      case 'new': return 'info';
      case 'in_progress': return 'warn';
      case 'resolved': return 'success';
      case 'escalated': return 'danger';
      case 'dismissed': return 'secondary';
      default: return 'info';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'new': return 'Nouveau';
      case 'in_progress': return 'En cours';
      case 'resolved': return 'Résolu';
      case 'escalated': return 'Escaladé';
      case 'dismissed': return 'Ignoré';
      default: return status;
    }
  }

  getPriorityLabel(priority: string): string {
    switch (priority) {
      case 'critical': return 'Critique';
      case 'high': return 'Haute';
      case 'medium': return 'Moyenne';
      case 'low': return 'Basse';
      default: return priority;
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'unjustified_absence': return 'Absence non justifiée';
      case 'overtime': return 'Heures supplémentaires';
      case 'schedule_conflict': return 'Conflit de planning';
      case 'insufficient_resources': return 'Ressources insuffisantes';
      case 'contract_anomaly': return 'Anomalie de contrat';
      default: return type;
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
