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
    CommonModule, FormsModule, RouterModule, ToastModule, TableModule,
    ButtonModule, InputTextModule, DropdownModule, TagModule, CardModule,
    BadgeModule, DialogModule, TextareaModule, CalendarModule
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

  searchText = '';
  filter: AlertFilter = { status: '', priority: '', type: '', dateRange: [] };

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

  stats = { total: 0, new: 0, inProgress: 0, resolved: 0, critical: 0 };

  private destroy$ = new Subject<void>();
  private refreshInterval = interval(30000);

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
    this.alertsService.getAllAlerts().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.alerts = response.data || [];
        this.applyFilters();
        this.calculateStats();
        this.loading = false;
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger les alertes' });
        this.loading = false;
      }
    });
  }

  startAutoRefresh(): void {
    this.refreshInterval.pipe(takeUntil(this.destroy$)).subscribe(() => this.loadAlerts());
  }

  applyFilters(): void {
    this.filteredAlerts = this.alerts.filter(alert => {
      const matchesSearch = !this.searchText ||
        alert.title.toLowerCase().includes(this.searchText.toLowerCase()) ||
        alert.description.toLowerCase().includes(this.searchText.toLowerCase()) ||
        alert.user_name?.toLowerCase().includes(this.searchText.toLowerCase());
      const matchesStatus   = !this.filter.status   || alert.status   === this.filter.status;
      const matchesPriority = !this.filter.priority || alert.priority === this.filter.priority;
      const matchesType     = !this.filter.type     || alert.type     === this.filter.type;
      const matchesDate = !this.filter.dateRange.length ||
        (this.filter.dateRange.length === 2 &&
         new Date(alert.created_at) >= this.filter.dateRange[0] &&
         new Date(alert.created_at) <= this.filter.dateRange[1]);
      return matchesSearch && matchesStatus && matchesPriority && matchesType && matchesDate;
    });
  }

  calculateStats(): void {
    this.stats = {
      total:      this.alerts.length,
      new:        this.alerts.filter(a => a.status === 'new').length,
      inProgress: this.alerts.filter(a => a.status === 'in_progress').length,
      resolved:   this.alerts.filter(a => a.status === 'resolved').length,
      critical:   this.alerts.filter(a => a.priority === 'critical').length
    };
  }

  onSearchChange(): void { this.applyFilters(); }
  onFilterChange(): void { this.applyFilters(); }

  clearFilters(): void {
    this.searchText = '';
    this.filter = { status: '', priority: '', type: '', dateRange: [] };
    this.applyFilters();
  }

  viewAlert(alert: Alert): void { this.selectedAlert = alert; this.showAlertDialog = true; }

  takeAction(alert: Alert, action: 'resolve' | 'escalate' | 'dismiss'): void {
    this.selectedAlert = alert;
    this.actionType = action;
    this.actionComment = '';
    this.showActionDialog = true;
  }

  confirmAction(): void {
    if (!this.selectedAlert) return;
    const updateData = {
      status: this.actionType === 'resolve' ? 'resolved' : this.actionType === 'escalate' ? 'escalated' : 'dismissed',
      comment: this.actionComment,
      resolved_at: new Date().toISOString()
    };
    this.alertsService.updateAlert(this.selectedAlert._id!, updateData).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Alerte mise à jour' });
        this.showActionDialog = false;
        this.loadAlerts();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de mettre à jour' })
    });
  }

  getSeverity(priority: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (priority) {
      case 'critical': return 'danger';
      case 'high':     return 'warn';
      case 'medium':   return 'info';
      case 'low':      return 'success';
      default:         return 'info';
    }
  }

  getStatusSeverity(status: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (status) {
      case 'new':        return 'info';
      case 'in_progress':return 'warn';
      case 'resolved':   return 'success';
      case 'escalated':  return 'danger';
      case 'dismissed':  return 'secondary';
      default:           return 'info';
    }
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = { new: 'Nouveau', in_progress: 'En cours', resolved: 'Résolu', escalated: 'Escaladé', dismissed: 'Ignoré' };
    return map[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const map: Record<string, string> = { critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Basse' };
    return map[priority] || priority;
  }

  getTypeLabel(type: string): string {
    const map: Record<string, string> = {
      unjustified_absence: 'Absence non justifiée', overtime: 'Heures supplémentaires',
      schedule_conflict: 'Conflit de planning', insufficient_resources: 'Ressources insuffisantes',
      contract_anomaly: 'Anomalie de contrat'
    };
    return map[type] || type;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
}
