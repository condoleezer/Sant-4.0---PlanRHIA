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
import { ChartModule } from 'primeng/chart';
import { Subject, takeUntil, interval } from 'rxjs';

import { AnomaliesService } from '../../../services/anomalies/anomalies.service';
import { Anomaly } from '../../../models/anomaly';

interface AnomalyFilter {
  status: string;
  severity: string;
  type: string;
  dateRange: Date[];
}

@Component({
  selector: 'app-anomalies',
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
    CalendarModule,
    ChartModule
  ],
  providers: [MessageService],
  templateUrl: './anomalies.component.html',
  styleUrls: ['./anomalies.component.css']
})
export class AnomaliesComponent implements OnInit, OnDestroy {
  anomalies: Anomaly[] = [];
  filteredAnomalies: Anomaly[] = [];
  loading = false;
  selectedAnomaly: Anomaly | null = null;
  showAnomalyDialog = false;
  showActionDialog = false;
  actionComment = '';
  actionType: 'resolve' | 'escalate' | 'dismiss' = 'resolve';
  
  // Filtres
  searchText = '';
  filter: AnomalyFilter = {
    status: '',
    severity: '',
    type: '',
    dateRange: []
  };
  
  // Options pour les filtres
  statusOptions = [
    { label: 'Tous les statuts', value: '' },
    { label: 'Détectée', value: 'detected' },
    { label: 'En cours', value: 'in_progress' },
    { label: 'Résolue', value: 'resolved' },
    { label: 'Escaladée', value: 'escalated' },
    { label: 'Ignorée', value: 'dismissed' }
  ];
  
  severityOptions = [
    { label: 'Toutes les sévérités', value: '' },
    { label: 'Critique', value: 'critical' },
    { label: 'Majeure', value: 'major' },
    { label: 'Mineure', value: 'minor' },
    { label: 'Info', value: 'info' }
  ];
  
  typeOptions = [
    { label: 'Tous les types', value: '' },
    { label: 'Heures supplémentaires', value: 'overtime' },
    { label: 'Absence non justifiée', value: 'unjustified_absence' },
    { label: 'Conflit de planning', value: 'schedule_conflict' },
    { label: 'Sous-effectif', value: 'understaffing' },
    { label: 'Sur-effectif', value: 'overstaffing' },
    { label: 'Anomalie de contrat', value: 'contract_anomaly' },
    { label: 'Non-respect des règles', value: 'rule_violation' }
  ];
  
  // Statistiques
  stats = {
    total: 0,
    detected: 0,
    inProgress: 0,
    resolved: 0,
    critical: 0
  };
  
  // Graphiques
  chartData: any;
  chartOptions: any;
  
  private destroy$ = new Subject<void>();
  private refreshInterval = interval(30000);

  constructor(
    private anomaliesService: AnomaliesService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadAnomalies();
    this.startAutoRefresh();
    this.initCharts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAnomalies(): void {
    this.loading = true;
    this.anomaliesService.getAllAnomalies()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.anomalies = response.data || [];
          this.applyFilters();
          this.calculateStats();
          this.updateCharts();
          this.loading = false;
        },
        error: (error) => {
          console.error('Erreur lors du chargement des anomalies:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de charger les anomalies'
          });
          this.loading = false;
        }
      });
  }

  startAutoRefresh(): void {
    this.refreshInterval
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadAnomalies();
      });
  }

  initCharts(): void {
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Répartition des anomalies par type'
        }
      }
    };
  }

  updateCharts(): void {
    const typeCounts = this.anomalies.reduce((acc, anomaly) => {
      acc[anomaly.type] = (acc[anomaly.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    this.chartData = {
      labels: Object.keys(typeCounts).map(type => this.getTypeLabel(type)),
      datasets: [{
        data: Object.values(typeCounts),
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384',
          '#C9CBCF'
        ]
      }]
    };
  }

  applyFilters(): void {
    this.filteredAnomalies = this.anomalies.filter(anomaly => {
      const matchesSearch = !this.searchText || 
        anomaly.title.toLowerCase().includes(this.searchText.toLowerCase()) ||
        anomaly.description.toLowerCase().includes(this.searchText.toLowerCase()) ||
        anomaly.user_name?.toLowerCase().includes(this.searchText.toLowerCase());
      
      const matchesStatus = !this.filter.status || anomaly.status === this.filter.status;
      const matchesSeverity = !this.filter.severity || anomaly.severity === this.filter.severity;
      const matchesType = !this.filter.type || anomaly.type === this.filter.type;
      
      const matchesDate = !this.filter.dateRange.length || 
        (this.filter.dateRange.length === 2 && 
         new Date(anomaly.detected_at) >= this.filter.dateRange[0] && 
         new Date(anomaly.detected_at) <= this.filter.dateRange[1]);
      
      return matchesSearch && matchesStatus && matchesSeverity && matchesType && matchesDate;
    });
  }

  calculateStats(): void {
    this.stats = {
      total: this.anomalies.length,
      detected: this.anomalies.filter(a => a.status === 'detected').length,
      inProgress: this.anomalies.filter(a => a.status === 'in_progress').length,
      resolved: this.anomalies.filter(a => a.status === 'resolved').length,
      critical: this.anomalies.filter(a => a.severity === 'critical').length
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
      severity: '',
      type: '',
      dateRange: []
    };
    this.applyFilters();
  }

  viewAnomaly(anomaly: Anomaly): void {
    this.selectedAnomaly = anomaly;
    this.showAnomalyDialog = true;
  }

  takeAction(anomaly: Anomaly, action: 'resolve' | 'escalate' | 'dismiss'): void {
    this.selectedAnomaly = anomaly;
    this.actionType = action;
    this.actionComment = '';
    this.showActionDialog = true;
  }

  confirmAction(): void {
    if (!this.selectedAnomaly) return;

    const updateData = {
      status: this.actionType === 'resolve' ? 'resolved' : 
              this.actionType === 'escalate' ? 'escalated' : 'dismissed',
      comment: this.actionComment,
      resolved_at: new Date().toISOString(),
      resolved_by: 'current_user_id'
    };

    this.anomaliesService.updateAnomaly(this.selectedAnomaly._id!, updateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: `Anomalie ${this.actionType === 'resolve' ? 'résolue' : 
                     this.actionType === 'escalate' ? 'escaladée' : 'ignorée'} avec succès`
          });
          this.showActionDialog = false;
          this.loadAnomalies();
        },
        error: (error) => {
          console.error('Erreur lors de la mise à jour:', error);
          let errorMessage = 'Impossible de mettre à jour l\'anomalie';
          
          if (error.status === 404) {
            errorMessage = 'Anomalie non trouvée';
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

  getSeverity(severity: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (severity) {
      case 'critical': return 'danger';
      case 'major': return 'warn';
      case 'minor': return 'info';
      case 'info': return 'success';
      default: return 'info';
    }
  }

  getStatusSeverity(status: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (status) {
      case 'detected': return 'info';
      case 'in_progress': return 'warn';
      case 'resolved': return 'success';
      case 'escalated': return 'danger';
      case 'dismissed': return 'secondary';
      default: return 'info';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'detected': return 'Détectée';
      case 'in_progress': return 'En cours';
      case 'resolved': return 'Résolue';
      case 'escalated': return 'Escaladée';
      case 'dismissed': return 'Ignorée';
      default: return status;
    }
  }

  getSeverityLabel(severity: string): string {
    switch (severity) {
      case 'critical': return 'Critique';
      case 'major': return 'Majeure';
      case 'minor': return 'Mineure';
      case 'info': return 'Info';
      default: return severity;
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'overtime': return 'Heures supplémentaires';
      case 'unjustified_absence': return 'Absence non justifiée';
      case 'schedule_conflict': return 'Conflit de planning';
      case 'understaffing': return 'Sous-effectif';
      case 'overstaffing': return 'Sur-effectif';
      case 'contract_anomaly': return 'Anomalie de contrat';
      case 'rule_violation': return 'Non-respect des règles';
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
