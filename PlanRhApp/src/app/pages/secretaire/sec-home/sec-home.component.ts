import { Component, OnInit, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ChartModule } from 'primeng/chart';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AbsenceService } from '../../../services/absence/absence.service';
import { AuthService } from '../../../services/auth/auth.service';
import { UserService } from '../../../services/user/user.service';
import { ContratService } from '../../../services/contrat/contrat.service';
import { ServiceService } from '../../../services/service/service.service';
import { AlertsService } from '../../../services/alerts/alerts.service';
import { AnomaliesService } from '../../../services/anomalies/anomalies.service';
import { EventsService } from '../../../services/events/events.service';
// import { MonitoringService } from '../../../services/monitoring/monitoring.service'; // Supprimé car non utilisé
import { Alert } from '../../../models/alert';
import { Anomaly } from '../../../models/anomaly';
import { PendingEvent } from '../../../models/pendingEvent';
import { Absence } from '../../../models/absence';
import { Service } from '../../../models/services';
import { User } from '../../../models/User';
import { Contrat } from '../../../models/contrat';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CustomCalendarComponent } from '../../../shared/components/custom-calendar/custom-calendar.component';
import { SimpleCalendarComponent } from '../../../shared/components/simple-calendar/simple-calendar.component';

@Component({
  selector: 'app-sec-home',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    TableModule,
    ChartModule,
    TagModule,
    ButtonModule,
    DialogModule,
    FormsModule,
    ToastModule,
    TooltipModule,
    SimpleCalendarComponent
  ],
  templateUrl: './sec-home.component.html',
  styleUrl: './sec-home.component.css',
  providers: [MessageService, AuthService]
})
export class SecHomeComponent implements OnInit {
  stats = {
    plannedAbsences: 0,
    workedDays: 0,
    remainingDaysOff: 0,
    nextDayOff: 'Aucun',
    totalWorkedDays: 0, // New: Total days worked since Jan 1
    totalWorkedHours: 0 // New: Total hours worked since Jan 1
  };

  chartData: any;
  chartOptions: any;

  absences: Absence[] = [];
  upcomingAbsences: any[] = [];
  loggedInUser: User | null = null;
  displayRequestDialog: WritableSignal<boolean> = signal(false);
  userContract: Contrat | null = null;
  currentMonthWorkedDays: number = 0;
  currentMonthDaysOff: number = 0;
  workSchedule: {date: Date, isWorking: boolean, isAbsent: boolean}[] = [];
  contractWorkDays: string[] = [];
  allUsers: User[] = [];
  allServices: Service[] = [];

  absenceRequest = {
    startDate: new Date(),
    endDate: new Date(),
    reason: '',
    replacementId: ''
  };

  replacements: User[] = [];
  readonly HOURS_PER_WORKDAY: number = 8; // Assumption: 8 hours per workday

  // New properties for SAPHIR portal
  alerts: Alert[] = [];
  anomalies: Anomaly[] = [];
  pendingEvents: PendingEvent[] = [];
  upcomingEvents: PendingEvent[] = [];
  anomaliesCount: number = 0;
  pendingEventsCount: number = 0;
  currentDate: string = '';
  
  // Specific anomaly counters
  errorsCount: number = 0;
  unjustifiedAbsencesCount: number = 0;
  overtimeCount: number = 0;
  
  // Specific event counters  
  teamRequestsCount: number = 0;
  
  // Current alert message
  currentAlertMessage: string = '';
  
  // Nearest HR event
  nearestHREvent: any = null;
  selectedCalendarDate: Date | null = null;
  
  // Filtered properties for template
  activeAlerts: Alert[] = [];
  filteredUpcomingEvents: PendingEvent[] = [];
  unresolvedAlertsCount: number = 0;

  constructor(
    private absenceService: AbsenceService,
    private authService: AuthService,
    private userService: UserService,
    private serviceService: ServiceService,
    private contratService: ContratService,
    private alertsService: AlertsService,
    private anomaliesService: AnomaliesService,
    private eventsService: EventsService,
    // private monitoringService: MonitoringService, // Supprimé car non utilisé
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadUserData();
    this.initChart();
    this.setCurrentDate();
    // this.startMonitoring(); // DÉSACTIVÉ - Surveillance automatique désactivée pour éviter la surcharge d'alertes
  }

  setCurrentDate(): void {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    this.currentDate = today.toLocaleDateString('fr-FR', options);
  }

  loadUserData(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: User | null) => {
        if (user?._id) {
          this.loggedInUser = user;
          this.loadDashboardData();
        } else {
          this.showError('Impossible de charger vos informations');
        }
      },
      error: () => {
        this.showError('Échec de la connexion au serveur');
      }
    });
  }

  loadDashboardData(): void {
    if (!this.loggedInUser?._id) return;

    forkJoin([
      this.contratService.getContratByUserId(this.loggedInUser._id),
      this.absenceService.findAllAbsences(),
      this.userService.findAllUsers(),
      this.userService.findAllNurse(),
      this.serviceService.findAllServices(),
      this.alertsService.getAlertsByUser(this.loggedInUser._id).pipe(
        catchError(() => of({ data: [] }))
      ),
      this.anomaliesService.getAnomaliesByUser(this.loggedInUser._id).pipe(
        catchError(() => of({ data: [] }))
      ),
      this.eventsService.getEventsByUser(this.loggedInUser._id).pipe(
        catchError(() => of({ data: [] }))
      ),
      this.eventsService.getUpcomingEvents().pipe(
        catchError(() => of({ data: [] }))
      )
    ]).subscribe({
      next: ([contratResponse, absencesResponse, usersResponse, nursesResponse, servicesResponse, alertsResponse, anomaliesResponse, eventsResponse, upcomingEventsResponse]) => {
        if (contratResponse?.data) {
          this.userContract = contratResponse.data;
          this.contractWorkDays = this.userContract.work_days?.map(w => w.day) || [];
        }

        this.absences = absencesResponse?.data?.filter((a: Absence) => a.staff_id === this.loggedInUser?._id) || [];
        this.allUsers = usersResponse?.data || [];
        this.replacements = nursesResponse?.data || [];
        this.allServices = servicesResponse?.data || [];

        // Load new SAPHIR portal data
        this.alerts = alertsResponse?.data || [];
        this.anomalies = anomaliesResponse?.data || [];
        this.pendingEvents = eventsResponse?.data || [];
        this.upcomingEvents = upcomingEventsResponse?.data || [];
        
        // Update filtered properties
        this.updateFilteredData();
        
        // Calculate specific counts
        this.calculateSpecificCounts();
        
        // Set current alert message
        this.setCurrentAlertMessage();
        
        // Find nearest HR event
        this.findNearestHREvent();

        this.generateMonthlySchedule();
        this.calculateStats();
        this.calculateTotalWorkedDaysAndHours();
        this.prepareUpcomingAbsences();
        this.updateChart();
      },
      error: (err) => {
        console.error('Error loading dashboard data:', err);
        this.showError('Erreur lors du chargement des données');
      }
    });
  }

  calculateTotalWorkedDaysAndHours(): void {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1); // January 1st
    let totalWorkedDays = 0;
    let totalWorkedHours = 0;

    for (let date = new Date(startOfYear); date <= today; date.setDate(date.getDate() + 1)) {
      const dayName = this.getDayName(date);
      const isWorkingDay = this.contractWorkDays.includes(dayName);
      const isAbsent = this.isAbsentDay(date);

      if (isWorkingDay && !isAbsent) {
        totalWorkedDays++;
        totalWorkedHours += this.HOURS_PER_WORKDAY;
      }
    }

    this.stats.totalWorkedDays = totalWorkedDays;
    this.stats.totalWorkedHours = totalWorkedHours;
  }

  generateMonthlySchedule(): void {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    this.workSchedule = [];
    this.currentMonthWorkedDays = 0;
    this.currentMonthDaysOff = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayName = this.getDayName(date);
      const isWorkingDay = this.contractWorkDays.includes(dayName);
      const isAbsent = this.isAbsentDay(date);
      
      this.workSchedule.push({
        date,
        isWorking: isWorkingDay && !isAbsent,
        isAbsent
      });

      if (day <= today.getDate()) {
        if (isWorkingDay && !isAbsent) {
          this.currentMonthWorkedDays++;
        } else {
          this.currentMonthDaysOff++;
        }
      }
    }
  }

  getDayName(date: Date): string {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[date.getDay()];
  }

  isAbsentDay(date: Date): boolean {
    if (!this.absences) return false;
    
    return this.absences.some(a => {
      if (a.status !== 'Validé par le cadre') return false;
      
      const start = new Date(a.start_date);
      const end = new Date(a.end_date);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      date.setHours(0, 0, 0, 0);
      
      return date >= start && date <= end;
    });
  }

  calculateStats(): void {
    const today = new Date();
    const remainingWorkDays = this.calculateRemainingWorkDays(today);
    
    this.stats = {
      ...this.stats, // Preserve totalWorkedDays and totalWorkedHours
      plannedAbsences: this.absences.filter(a => 
        new Date(a.end_date) >= today && a.status !== 'Refusé par le cadre'
      ).length,
      workedDays: this.currentMonthWorkedDays,
      remainingDaysOff: remainingWorkDays,
      nextDayOff: this.getNextDayOff()
    };
  }

  calculateRemainingWorkDays(today: Date): number {
    if (!this.userContract) return 0;
    
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let remainingWorkDays = 0;

    for (let day = today.getDate() + 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayName = this.getDayName(date);
      if (this.contractWorkDays.includes(dayName) && !this.isAbsentDay(date)) {
        remainingWorkDays++;
      }
    }

    return remainingWorkDays;
  }

  getNextDayOff(): string {
    const today = new Date();
    const nextDayOff = this.workSchedule.find(day => 
      !day.isWorking && day.date > today && !day.isAbsent
    );
    
    return nextDayOff ? this.formatDate(nextDayOff.date) : 'Aucun';
  }

  updateChart(): void {
    const today = new Date();
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    
    const labels = [];
    const workedDaysData = [];
    const daysOffData = [];
    const absenceDaysData = [];
    
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      
      labels.push(monthNames[month]);
      
      const stats = this.calculateMonthlyStats(year, month);
      workedDaysData.push(stats.workedDays);
      daysOffData.push(stats.daysOff);
      absenceDaysData.push(stats.absenceDays);
    }
    
    const documentStyle = getComputedStyle(document.documentElement);
    
    this.chartData = {
      labels,
      datasets: [
        {
          label: 'Jours travaillés',
          data: workedDaysData,
          backgroundColor: documentStyle.getPropertyValue('--blue-500'),
          borderColor: documentStyle.getPropertyValue('--blue-500'),
          tension: 0.4
        },
        {
          label: 'Jours de repos',
          data: daysOffData,
          backgroundColor: documentStyle.getPropertyValue('--green-500'),
          borderColor: documentStyle.getPropertyValue('--green-500'),
          tension: 0.4
        },
        {
          label: 'Jours d\'absence',
          data: absenceDaysData,
          backgroundColor: documentStyle.getPropertyValue('--red-500'),
          borderColor: documentStyle.getPropertyValue('--red-500'),
          tension: 0.4
        }
      ]
    };
  }

  calculateMonthlyStats(year: number, month: number): { workedDays: number, daysOff: number, absenceDays: number } {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let workedDays = 0;
    let daysOff = 0;
    let absenceDays = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayName = this.getDayName(date);
      const isWorkingDay = this.contractWorkDays.includes(dayName);
      const isAbsent = this.isAbsentDay(date);
      
      if (isAbsent) {
        absenceDays++;
      } else if (isWorkingDay) {
        workedDays++;
      } else {
        daysOff++;
      }
    }

    return { workedDays, daysOff, absenceDays };
  }

  prepareUpcomingAbsences(): void {
        this.upcomingAbsences = this.absences
      .filter(a => new Date(a.end_date) >= new Date())
      .map(a => ({
        id: a._id,
        startDate: this.formatDate(a.start_date),
        endDate: this.formatDate(a.end_date),
        status: a.status,
        reason: a.reason,
        created_at: a.created_at,
      }))
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
  }

  initChart(): void {
    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
    const surfaceBorder = documentStyle.getPropertyValue('--surface-border');

    this.chartOptions = {
      maintainAspectRatio: false,
      aspectRatio: 0.8,
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: {
              size: 14
            }
          },
          position: 'bottom'
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context: any) {
              return `${context.dataset.label}: ${context.raw} jours`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColorSecondary,
            font: {
              weight: 500
            }
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false
          }
        },
        y: {
          min: 0,
          ticks: {
            color: textColorSecondary,
            stepSize: 5,
            callback: function(value: any) {
              return value + ' j';
            }
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    };
  }

  showRequestDialog(): void {
    this.displayRequestDialog.set(true);
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

  private formatDate(dateString: string | Date): string {
    const date = new Date(dateString);
    return isNaN(date.getTime()) 
      ? 'N/A' 
      : date.toLocaleDateString('fr-FR');
  }

  private showError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erreur',
      detail: message
    });
  }

  calculateSpecificCounts(): void {
    // Calculate specific anomaly counts
    this.errorsCount = this.anomalies.filter(a => 
      a.type === 'rule_violation' && (a.status === 'detected' || a.status === 'in_progress')
    ).length;
    
    this.unjustifiedAbsencesCount = this.anomalies.filter(a => 
      a.type === 'unjustified_absence' && 
      (a.status === 'detected' || a.status === 'in_progress')
    ).length;
    
    this.overtimeCount = this.anomalies.filter(a => 
      a.type === 'overtime' && 
      (a.status === 'detected' || a.status === 'in_progress')
    ).length;
    
    // Calculate total anomalies
    this.anomaliesCount = this.errorsCount + this.unjustifiedAbsencesCount + this.overtimeCount;
    
    // Calculate team requests count
    this.teamRequestsCount = this.pendingEvents.filter(e => 
      e.type === 'approval' && e.status === 'pending' && 
      e.related_entity_type === 'absence'
    ).length;
    
    // Calculate total pending events
    this.pendingEventsCount = this.teamRequestsCount + this.pendingEvents.filter(e => 
      e.type !== 'approval' && e.status === 'pending'
    ).length;
  }

  setCurrentAlertMessage(): void {
    if (this.alerts.length === 0) {
      this.currentAlertMessage = 'Aucune alerte en cours.';
    } else {
      // Get the most recent unresolved alert
      const unresolvedAlerts = this.alerts.filter(a => a.status !== 'resolved');
      if (unresolvedAlerts.length > 0) {
        const latestAlert = unresolvedAlerts.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        this.currentAlertMessage = latestAlert.description;
      } else {
        this.currentAlertMessage = 'Aucune alerte en cours.';
      }
    }
  }

  findNearestHREvent(): void {
    if (this.upcomingEvents.length === 0) {
      this.nearestHREvent = null;
      return;
    }
    
    const today = new Date();
    const futureEvents = this.upcomingEvents.filter(e => 
      e.due_date && new Date(e.due_date) >= today
    );
    
    if (futureEvents.length > 0) {
      this.nearestHREvent = futureEvents.sort((a, b) => 
        new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
      )[0];
    } else {
      this.nearestHREvent = null;
    }
  }

  formatEventDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
  }

  // Note: Méthodes de surveillance SAPHIR supprimées car elles ne faisaient que simuler des données

  showSuccess(message: string) {
    this.messageService.add({ severity: 'success', summary: 'Succès', detail: message });
  }

  showInfo(message: string) {
    this.messageService.add({ severity: 'info', summary: 'Information', detail: message });
  }

  onCalendarDateSelect(date: Date): void {
    this.selectedCalendarDate = date;
    console.log('Date sélectionnée:', date);
    // Ici vous pouvez ajouter la logique pour réagir à la sélection de date
  }

  // New methods for improved alerts
  updateFilteredData(): void {
    // Update active alerts (unresolved, max 3)
    this.activeAlerts = this.alerts
      .filter(a => a.status !== 'resolved')
      .slice(0, 3);
    
    // Update unresolved alerts count
    this.unresolvedAlertsCount = this.alerts.filter(a => a.status !== 'resolved').length;
    
    // Update upcoming events (max 3)
    this.filteredUpcomingEvents = this.upcomingEvents.slice(0, 3);
  }

  getAlertIcon(type: string): string {
    const iconMap: { [key: string]: string } = {
      'unjustified_absence': 'pi pi-exclamation-circle',
      'overtime': 'pi pi-clock',
      'schedule_conflict': 'pi pi-calendar-times',
      'insufficient_resources': 'pi pi-users',
      'contract_anomaly': 'pi pi-alert'
    };
    return iconMap[type] || 'pi pi-bell';
  }

  getAlertTypeLabel(type: string): string {
    const labelMap: { [key: string]: string } = {
      'unjustified_absence': 'Absence non justifiée',
      'overtime': 'Dépassement heures',
      'schedule_conflict': 'Planning',
      'insufficient_resources': 'Ressources insuffisantes',
      'contract_anomaly': 'Anomalie contrat'
    };
    return labelMap[type] || type;
  }

  viewAlertDetails(alert: Alert): void {
    this.messageService.add({
      severity: 'info',
      summary: alert.title,
      detail: alert.description,
      life: 5000
    });
  }

  resolveAlert(alert: Alert): void {
    this.alertsService.updateAlert(alert._id || '', { status: 'resolved' }).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Succès',
          detail: 'Alerte résolue'
        });
        this.loadDashboardData();
      },
      error: () => {
        this.showError('Erreur lors de la résolution de l\'alerte');
      }
    });
  }

  formatDatePublic(dateString: string): string {
    return this.formatDate(dateString);
  }

  // Méthode getDetectionRules supprimée car le monitoring n'est plus utilisé
}
