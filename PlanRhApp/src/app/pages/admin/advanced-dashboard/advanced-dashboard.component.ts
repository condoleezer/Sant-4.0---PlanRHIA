import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { CalendarModule } from 'primeng/calendar';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';

import { AlertsService } from '../../../services/alerts/alerts.service';
import { AnomaliesService } from '../../../services/anomalies/anomalies.service';
import { EventsService } from '../../../services/events/events.service';
import { UserService } from '../../../services/user/user.service';
import { ServiceService } from '../../../services/service/service.service';

interface DashboardData {
  alerts: any[];
  anomalies: any[];
  events: any[];
  users: any[];
  services: any[];
}

interface ChartData {
  labels: string[];
  datasets: any[];
}

@Component({
  selector: 'app-advanced-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChartModule,
    CardModule,
    TableModule,
    TagModule,
    ButtonModule,
    DropdownModule,
    CalendarModule,
    ProgressBarModule,
    SkeletonModule
  ],
  templateUrl: './advanced-dashboard.component.html',
  styleUrls: ['./advanced-dashboard.component.css']
})
export class AdvancedDashboardComponent implements OnInit, OnDestroy {
  // Données
  dashboardData: DashboardData = {
    alerts: [],
    anomalies: [],
    events: [],
    users: [],
    services: []
  };
  
  loading = true;
  
  // Filtres
  selectedPeriod: string = 'week';
  selectedService: string = '';
  dateRange: Date[] = [];
  
  // Options de filtres
  periodOptions = [
    { label: 'Cette semaine', value: 'week' },
    { label: 'Ce mois', value: 'month' },
    { label: 'Ce trimestre', value: 'quarter' },
    { label: 'Cette année', value: 'year' }
  ];
  
  serviceOptions: any[] = [];
  
  // Statistiques générales
  stats = {
    totalAlerts: 0,
    totalAnomalies: 0,
    totalEvents: 0,
    activeUsers: 0,
    criticalIssues: 0,
    resolvedIssues: 0
  };
  
  // Graphiques
  alertsChartData: ChartData = { labels: [], datasets: [] };
  anomaliesChartData: ChartData = { labels: [], datasets: [] };
  eventsChartData: ChartData = { labels: [], datasets: [] };
  serviceDistributionData: ChartData = { labels: [], datasets: [] };
  
  chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: ''
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };
  
  // Tableaux de données
  topServices: any[] = [];
  recentAlerts: any[] = [];
  recentAnomalies: any[] = [];
  
  private destroy$ = new Subject<void>();

  constructor(
    private alertsService: AlertsService,
    private anomaliesService: AnomaliesService,
    private eventsService: EventsService,
    private userService: UserService,
    private serviceService: ServiceService
  ) {}

  ngOnInit(): void {
    this.loadServices();
    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadServices(): void {
    this.serviceService.findAllServices()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.serviceOptions = [
            { label: 'Tous les services', value: '' },
            ...(response.data || []).map((service: any) => ({
              label: service.name,
              value: service._id
            }))
          ];
        },
        error: (error: any) => {
          console.error('Erreur lors du chargement des services:', error);
        }
      });
  }

  loadDashboardData(): void {
    this.loading = true;
    
    const requests = [
      this.alertsService.getAllAlerts(),
      this.anomaliesService.getAllAnomalies(),
      this.eventsService.getAllEvents(),
      this.userService.findAllUsers()
    ];

    forkJoin(requests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (responses: any[]) => {
          const [alertsRes, anomaliesRes, eventsRes, usersRes] = responses;
          this.dashboardData = {
            alerts: alertsRes.data || [],
            anomalies: anomaliesRes?.data || [],
            events: eventsRes?.data || [],
            users: usersRes?.data || [],
            services: []
          };
          
          this.calculateStats();
          this.updateCharts();
          this.updateTables();
          this.loading = false;
        },
        error: (error) => {
          console.error('Erreur lors du chargement des données:', error);
          this.loading = false;
        }
      });
  }

  calculateStats(): void {
    const { alerts, anomalies, events, users } = this.dashboardData;
    
    this.stats = {
      totalAlerts: alerts.length,
      totalAnomalies: anomalies.length,
      totalEvents: events.length,
      activeUsers: users.filter((u: any) => u.logged_in).length,
      criticalIssues: [...alerts, ...anomalies].filter((item: any) => 
        item.priority === 'critical' || item.severity === 'critical'
      ).length,
      resolvedIssues: [...alerts, ...anomalies].filter((item: any) => 
        item.status === 'resolved'
      ).length
    };
  }

  updateCharts(): void {
    this.updateAlertsChart();
    this.updateAnomaliesChart();
    this.updateEventsChart();
    this.updateServiceDistributionChart();
  }

  updateAlertsChart(): void {
    const alerts = this.dashboardData.alerts;
    const statusCounts = alerts.reduce((acc: any, alert: any) => {
      acc[alert.status] = (acc[alert.status] || 0) + 1;
      return acc;
    }, {});

    this.alertsChartData = {
      labels: Object.keys(statusCounts).map(status => this.getStatusLabel(status)),
      datasets: [{
        label: 'Alertes par statut',
        data: Object.values(statusCounts),
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF'
        ]
      }]
    };
  }

  updateAnomaliesChart(): void {
    const anomalies = this.dashboardData.anomalies;
    const severityCounts = anomalies.reduce((acc: any, anomaly: any) => {
      acc[anomaly.severity] = (acc[anomaly.severity] || 0) + 1;
      return acc;
    }, {});

    this.anomaliesChartData = {
      labels: Object.keys(severityCounts).map(severity => this.getSeverityLabel(severity)),
      datasets: [{
        label: 'Anomalies par sévérité',
        data: Object.values(severityCounts),
        backgroundColor: [
          '#DC3545',
          '#FFC107',
          '#17A2B8',
          '#28A745'
        ]
      }]
    };
  }

  updateEventsChart(): void {
    const events = this.dashboardData.events;
    const typeCounts = events.reduce((acc: any, event: any) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});

    this.eventsChartData = {
      labels: Object.keys(typeCounts).map(type => this.getEventTypeLabel(type)),
      datasets: [{
        label: 'Événements par type',
        data: Object.values(typeCounts),
        backgroundColor: [
          '#007BFF',
          '#28A745',
          '#FFC107',
          '#DC3545',
          '#6F42C1'
        ]
      }]
    };
  }

  updateServiceDistributionChart(): void {
    const users = this.dashboardData.users;
    const serviceCounts = users.reduce((acc: any, user: any) => {
      const serviceId = user.service_id;
      acc[serviceId] = (acc[serviceId] || 0) + 1;
      return acc;
    }, {});

    // Récupérer les noms des services
    this.serviceService.findAllServices()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          const services = response.data || [];
          const serviceNames = Object.keys(serviceCounts).map(serviceId => {
            const service = services.find((s: any) => s._id === serviceId);
            return service ? service.name : `Service ${serviceId}`;
          });

          this.serviceDistributionData = {
            labels: serviceNames,
            datasets: [{
              label: 'Utilisateurs par service',
              data: Object.values(serviceCounts),
              backgroundColor: [
                '#FF6384',
                '#36A2EB',
                '#FFCE56',
                '#4BC0C0',
                '#9966FF',
                '#FF9F40',
                '#C9CBCF',
                '#4BC0C0'
              ]
            }]
          };
        }
      });
  }

  updateTables(): void {
    this.updateTopServices();
    this.updateRecentAlerts();
    this.updateRecentAnomalies();
  }

  updateTopServices(): void {
    const users = this.dashboardData.users;
    const serviceCounts = users.reduce((acc: any, user: any) => {
      const serviceId = user.service_id;
      if (serviceId) {
        acc[serviceId] = (acc[serviceId] || 0) + 1;
      }
      return acc;
    }, {});

    this.topServices = Object.entries(serviceCounts)
      .map(([serviceId, count]) => ({ serviceId, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  updateRecentAlerts(): void {
    this.recentAlerts = this.dashboardData.alerts
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }

  updateRecentAnomalies(): void {
    this.recentAnomalies = this.dashboardData.anomalies
      .sort((a: any, b: any) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())
      .slice(0, 5);
  }

  onFilterChange(): void {
    this.loadDashboardData();
  }

  // Méthodes utilitaires
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

  getSeverityLabel(severity: string): string {
    switch (severity) {
      case 'critical': return 'Critique';
      case 'major': return 'Majeure';
      case 'minor': return 'Mineure';
      case 'info': return 'Info';
      default: return severity;
    }
  }

  getEventTypeLabel(type: string): string {
    switch (type) {
      case 'meeting': return 'Réunion';
      case 'training': return 'Formation';
      case 'maintenance': return 'Maintenance';
      case 'emergency': return 'Urgence';
      case 'other': return 'Autre';
      default: return type;
    }
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

  getPriority(priority: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (priority) {
      case 'critical': return 'danger';
      case 'high': return 'warn';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'info';
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

  getResolutionRate(): number {
    const total = this.stats.totalAlerts + this.stats.totalAnomalies;
    return total > 0 ? Math.round((this.stats.resolvedIssues / total) * 100) : 0;
  }

  round(value: number): number {
    return Math.round(value);
  }
}
