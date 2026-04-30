import { Component, OnInit, OnDestroy } from '@angular/core';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import multiMonthPlugin from '@fullcalendar/multimonth';
import { UserService } from '../../../services/user/user.service';
import { PlanningService } from '../../../services/planning/planning.service';
import { ServiceService } from '../../../services/service/service.service';
import { AuthService } from '../../../services/auth/auth.service';
import { CalendarSyncService, PlanningChange } from '../../../services/calendar-sync/calendar-sync.service';
import { ContratService, Contrat, WorkDay } from '../../../services/contrat/contrat.service';
import { User } from '../../../models/User';
import { Service } from '../../../models/services';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

interface DayPlanning {
  code: string;
  hours: string;
  color: string;
}

interface WeekPlanning {
  user: User;
  monday: DayPlanning;
  tuesday: DayPlanning;
  wednesday: DayPlanning;
  thursday: DayPlanning;
  friday: DayPlanning;
  saturday: DayPlanning;
  sunday: DayPlanning;
  totalHours: number;
}

@Component({
  selector: 'app-sec-calendar',
  imports: [FullCalendarModule, CommonModule, ToastModule, ButtonModule, CardModule, FormsModule],
  providers: [MessageService, AuthService],
  standalone: true,
  templateUrl: './sec-calendar.component.html',
  styleUrl: './sec-calendar.component.css',
})
export class SecCalendarComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Vue actuelle: 'calendar' ou 'table'
  currentView: 'calendar' | 'table' = 'calendar';

  // Données pour la vue calendrier
  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, multiMonthPlugin],
    initialView: 'dayGridMonth',
    events: [],
    eventContent: this.customEventContent.bind(this),
    navLinks: false,
    dayMaxEvents: 3,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridWeek,dayGridMonth,multiMonthYear'
    },
    buttonText: {
      today: 'today',
      month: 'month',
      week: 'week',
      multiMonthYear: 'year'
    },
    dayHeaderContent: (args) => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[args.date.getUTCDay()];
    },
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    // Configuration pour commencer la semaine le lundi
    firstDay: 1, // 0 = dimanche, 1 = lundi
    weekNumberCalculation: 'ISO', // Utiliser la norme ISO pour les numéros de semaine
    views: {
      multiMonthYear: {
        type: 'multiMonth',
        duration: { months: 12 },
        multiMonthMaxColumns: 3,
        fixedWeekCount: false
      }
    },
    datesSet: (dateInfo) => {
      // Quand on passe en vue annuelle, naviguer vers janvier
      if (dateInfo.view.type === 'multiMonthYear') {
        const currentYear = new Date().getFullYear();
        const startDate = dateInfo.start;
        // Si on n'est pas déjà en janvier, naviguer vers janvier
        if (startDate.getMonth() !== 0 || startDate.getFullYear() !== currentYear) {
          setTimeout(() => {
            const calendarApi = dateInfo.view.calendar;
            calendarApi.gotoDate(new Date(currentYear, 0, 1));
          }, 0);
        }
      }
    }
  };

  // Données pour la vue tableau
  weekPlannings: WeekPlanning[] = [];
  selectedWeekStart: Date = new Date();
  totalWeekHours: number = 0;
  averageHours: number = 0;

  // Codes de service
  serviceCodes: { [key: string]: { hours: string, duration: number, color: string } } = {
    // Codes jour
    'J02': { hours: '6:45 - 18:45', duration: 12, color: '#3b82f6' },
    'J1': { hours: '7:15 - 19:45', duration: 12.5, color: '#10b981' },
    'JB': { hours: '8:00 - 20:00', duration: 12, color: '#f59e0b' },
    // Codes matin
    'M06': { hours: '6:00 - 13:30', duration: 7.5, color: '#fbbf24' },
    'M13': { hours: '13:00 - 20:30', duration: 7.5, color: '#f97316' },
    'M15': { hours: '15:00 - 22:30', duration: 7.5, color: '#fb923c' },
    // Codes soir/nuit
    'S07': { hours: '7:00 - 19:30', duration: 12.5, color: '#8b5cf6' },
    'Nsr': { hours: '20:00 - 8:00', duration: 12, color: '#6366f1' },
    'Nsr3': { hours: '20:00 - 8:00', duration: 12, color: '#818cf8' },
    'Nld': { hours: '20:00 - 8:00', duration: 12, color: '#4f46e5' },
    // Repos et congés
    'RH': { hours: 'Repos', duration: 0, color: '#6b7280' },
    'RJF': { hours: 'Repos férié', duration: 0, color: '#9ca3af' },
    'CA': { hours: 'Congé', duration: 0, color: '#10b981' },
    'RTT': { hours: 'RTT', duration: 0, color: '#14b8a6' },
    // Heures et formations
    'HS-1': { hours: 'Heures sup', duration: 0, color: '#06b6d4' },
    'H-': { hours: 'Heures -', duration: 0, color: '#ef4444' },
    'FCJ': { hours: 'Formation', duration: 7, color: '#ec4899' },
    'TP': { hours: 'Temps partiel', duration: 0, color: '#a855f7' },
    // Autres
    '?': { hours: 'Non défini', duration: 0, color: '#94a3b8' }
  };

  loggedInUser: User | null = null;
  users: User[] = [];
  userPlannings: { [userId: string]: any[] } = {};
  userContrats: { [userId: string]: Contrat | null } = {};
  allServices: Service[] = [];
  currentUserSpecialityId: string | null = null;

  constructor(
    private userService: UserService,
    private planningService: PlanningService,
    private serviceService: ServiceService,
    private authService: AuthService,
    private messageService: MessageService,
    private calendarSyncService: CalendarSyncService,
    private contratService: ContratService
  ) {
    this.selectedWeekStart = this.getMonday(new Date());
  }

  ngOnInit() {
    this.loadUserAndData();
    this.subscribeToPlanningChanges();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  subscribeToPlanningChanges(): void {
    // S'abonner aux changements de planning en temps réel
    this.calendarSyncService.planningChanges$
      .pipe(takeUntil(this.destroy$))
      .subscribe((change: PlanningChange) => {
        // Si le changement concerne le service de l'utilisateur
        if (this.loggedInUser && (
          change.service_id === this.loggedInUser.service_id ||
          change.type === 'force_refresh'
        )) {
          console.log('Changement de planning détecté dans calendrier secrétaire, rechargement...', change);
          
          // Pour les prévisualisations (simulation), recharger immédiatement
          // Pour les changements sauvegardés, attendre un peu pour laisser le backend se mettre à jour
          const delay = change.data?.is_preview ? 100 : 500;
          
          setTimeout(() => {
            this.loadPlanningsForUsers();
          }, delay);
        }
      });
  }

  startAutoRefresh(): void {
    // Utiliser le service centralisé pour le rafraîchissement automatique (30 secondes)
    this.calendarSyncService.autoRefresh$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.loggedInUser?.service_id) {
          console.log('Rafraîchissement automatique calendrier secrétaire (30s)');
          this.loadPlanningsForUsers();
        }
      });
  }

  loadUserAndData(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: User | null) => {
        if (user?._id) {
          this.loggedInUser = user;
          this.currentUserSpecialityId = user.speciality_id || null;
          console.log('Current user speciality:', this.currentUserSpecialityId);
          this.loadAllData();
        } else {
          this.showError('Impossible de charger les informations utilisateur');
        }
      },
      error: () => {
        this.showError('Échec de la connexion au serveur');
      }
    });
  }

  loadAllData(): void {
    forkJoin([
      this.userService.findAllUsers(),
      this.serviceService.findAllServices()
    ]).subscribe({
      next: ([usersResponse, servicesResponse]) => {
        this.users = usersResponse.data || [];
        this.allServices = servicesResponse.data || [];
        this.loadContratsForUsers();
        this.loadPlanningsForUsers();
      },
      error: () => {
        this.showError('Échec du chargement des données');
  }
    });
  }

  loadContratsForUsers(): void {
    if (!this.loggedInUser?.service_id) {
      return;
    }

    // Filtrer les utilisateurs par service_id ET speciality_id (exclure les vacataires pour les contrats)
    const filteredUsers = this.users.filter(user => {
      const sameService = user.service_id === this.loggedInUser?.service_id;
      const sameSpeciality = user.speciality_id === this.currentUserSpecialityId;
      return sameService && sameSpeciality && user.role !== 'vacataire';
    });

    // Optimisation: Charger par lots de 5 utilisateurs pour éviter de surcharger le serveur
    const batchSize = 5;
    const batches = [];
    
    for (let i = 0; i < filteredUsers.length; i += batchSize) {
      const batch = filteredUsers.slice(i, i + batchSize);
      batches.push(batch);
    }

    batches.forEach((batch, batchIndex) => {
      setTimeout(() => {
        const contratRequests = batch.map(user => {
          const userId = user.id || user._id;
          if (!userId) return null;
          return this.contratService.getContratByUserId(userId).pipe(
            takeUntil(this.destroy$)
          );
        }).filter(req => req !== null);

        if (contratRequests.length === 0) return;

        forkJoin(contratRequests).subscribe({
          next: (responses) => {
            responses.forEach((contrat, index) => {
              const user = batch[index];
              const userId = user.id || user._id;
              if (userId) {
                this.userContrats[userId] = contrat && contrat.data ? contrat.data : null;
              }
            });
            this.updateCalendarEvents();
          },
          error: () => {
            batch.forEach(user => {
              const userId = user.id || user._id;
              if (userId) {
                this.userContrats[userId] = null;
              }
            });
            this.updateCalendarEvents();
          }
        });
      }, batchIndex * 500); // Délai de 500ms entre chaque lot
    });
  }

  loadPlanningsForUsers(): void {
    if (!this.loggedInUser?.service_id) {
      return;
    }

    // Filtrer les utilisateurs par service_id ET speciality_id (inclure les vacataires du service avec même spécialité)
    const filteredUsers = this.users.filter(user => {
      const sameService = user.service_id === this.loggedInUser?.service_id;
      const sameSpeciality = user.speciality_id === this.currentUserSpecialityId;
      return sameService && sameSpeciality;
    });

    // Optimisation: Charger par lots de 5 utilisateurs pour éviter de surcharger le serveur
    const batchSize = 5;
    const batches = [];
    
    for (let i = 0; i < filteredUsers.length; i += batchSize) {
      const batch = filteredUsers.slice(i, i + batchSize);
      batches.push(batch);
    }

    batches.forEach((batch, batchIndex) => {
      setTimeout(() => {
        const planningRequests = batch.map(user => {
          const userId = user.id || user._id;
          if (userId) {
            return this.planningService.getPlanningsByUser(userId).pipe(
              takeUntil(this.destroy$)
            );
          }
          return null;
        }).filter(req => req !== null);

        if (planningRequests.length === 0) return;

        // Charger les plannings en parallèle pour ce lot
        forkJoin(planningRequests).subscribe({
          next: (responses: any[]) => {
            // Mettre à jour les plannings pour chaque utilisateur
            batch.forEach((user, index) => {
              const userId = user.id || user._id;
              if (userId && responses[index]) {
                const plannings = responses[index].data || [];
                this.userPlannings[userId] = plannings;
              }
            });
            // Mettre à jour le calendrier une seule fois après tous les chargements
            this.updateCalendarEvents();
          },
          error: () => {
            // En cas d'erreur, mettre à jour quand même le calendrier
            this.updateCalendarEvents();
          }
        });
      }, batchIndex * 500); // Délai de 500ms entre chaque lot
    });
  }

  updateCalendarEvents(): void {
    const events: EventInput[] = [];
    const currentYear = new Date().getFullYear();
    const planningEventsMap = new Map<string, EventInput>();

    // Filtrer les utilisateurs par service_id ET speciality_id (inclure les vacataires)
    const filteredUsers = this.users.filter(user => {
      const sameService = user.service_id === this.loggedInUser?.service_id;
      const sameSpeciality = user.speciality_id === this.currentUserSpecialityId;
      return sameService && sameSpeciality;
    });

    // PRIORITÉ 1 : Charger les plannings publiés avec codes de service
    filteredUsers.forEach(user => {
      const userId = user.id || user._id;
      if (!userId) return;

      const plannings = this.userPlannings[userId] || [];
      plannings.forEach((planning: any) => {
        const planningDate = new Date(planning.date);
        if (planningDate.getFullYear() === currentYear) {
          // Déterminer le code de service et les horaires
          let serviceCode = planning.activity_code || 'RH';
          let startTime = '08:00';
          let endTime = '17:00';
          
          // Mapper les codes d'activité aux codes de service
          if (this.serviceCodes[serviceCode]) {
            const codeInfo = this.serviceCodes[serviceCode];
            if (codeInfo.hours !== 'Repos') {
              const timeMatch = codeInfo.hours.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
              if (timeMatch) {
                startTime = timeMatch[1];
                endTime = timeMatch[2];
              }
            }
          } else if (planning.plage_horaire) {
            const timeMatch = planning.plage_horaire.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
            if (timeMatch) {
              startTime = timeMatch[1];
              endTime = timeMatch[2];
            }
          }

          const startDate = new Date(planningDate);
          const [startHours, startMinutes] = startTime.split(':').map(Number);
          startDate.setHours(startHours, startMinutes, 0, 0);

          const endDate = new Date(planningDate);
          const [endHours, endMinutes] = endTime.split(':').map(Number);
          endDate.setHours(endHours, endMinutes, 0, 0);

          const userLabel = user.role === 'vacataire' 
            ? `${user.first_name} ${user.last_name} (V)`
            : `${user.first_name} ${user.last_name}`;

          const eventKey = `${planning.date}_${userId}`;
          
          planningEventsMap.set(eventKey, {
            title: `${serviceCode} - ${userLabel}`,
            start: startDate,
            end: endDate,
            allDay: false,
            extendedProps: {
              user: userLabel,
              hours: serviceCode === 'RH' ? 'Repos' : `${startTime} - ${endTime}`,
              serviceCode: serviceCode,
              isPlanning: true,
              isVacataire: user.role === 'vacataire'
            },
            backgroundColor: this.getServiceCodeColor(serviceCode),
            borderColor: this.getServiceCodeColor(serviceCode)
          });
        }
      });
    });

    // PRIORITÉ 2 : Ajouter les événements basés sur les contrats
    filteredUsers.forEach(user => {
      const userId = user.id || user._id;
      if (!userId || user.role === 'vacataire' || !this.userContrats[userId]?.work_days) return;

      const contrat = this.userContrats[userId];
      contrat?.work_days.forEach((workDay: WorkDay) => {
        const dayOfWeek = this.getDayOfWeekIndex(workDay.day);
        if (dayOfWeek === -1) return;

        for (let month = 0; month < 12; month++) {
          const date = new Date(currentYear, month, 1);
          while (date.getMonth() === month) {
            if (date.getDay() === dayOfWeek) {
              const dateStr = date.toISOString().split('T')[0];
              const eventKey = `${dateStr}_${userId}`;
              
              if (!planningEventsMap.has(eventKey)) {
                const startDate = new Date(date);
                const [startHours, startMinutes] = workDay.start_time.split(':').map(Number);
                startDate.setHours(startHours, startMinutes, 0, 0);

                const endDate = new Date(date);
                const [endHours, endMinutes] = workDay.end_time.split(':').map(Number);
                endDate.setHours(endHours, endMinutes, 0, 0);

                // Déterminer le code de service basé sur les horaires du contrat
                const serviceCode = this.determineServiceCode(workDay.start_time, workDay.end_time);

                events.push({
                  title: `${serviceCode} - ${user.first_name} ${user.last_name}`,
                  start: startDate,
                  end: endDate,
                  allDay: false,
                  extendedProps: {
                    user: `${user.first_name} ${user.last_name}`,
                    hours: `${workDay.start_time} - ${workDay.end_time}`,
                    serviceCode: serviceCode,
                    isPlanning: false
                  },
                  backgroundColor: this.getServiceCodeColor(serviceCode),
                  borderColor: this.getServiceCodeColor(serviceCode)
                });
              }
            }
            date.setDate(date.getDate() + 1);
          }
        }
      });
    });

    planningEventsMap.forEach(event => {
      events.push(event);
    });

    this.calendarOptions = { ...this.calendarOptions, events: events };
  }

  // Nouvelle méthode pour déterminer le code de service basé sur les horaires
  private determineServiceCode(startTime: string, endTime: string): string {
    const start = startTime.replace(':', '');
    const end = endTime.replace(':', '');
    
    // J02: 6:45-18:45
    if (start === '0645' && end === '1845') return 'J02';
    // J1: 7:15-19:45
    if (start === '0715' && end === '1945') return 'J1';
    // JB: 8:00-20:00
    if (start === '0800' && end === '2000') return 'JB';
    
    // Par défaut, retourner J02 pour les horaires de travail
    return 'J02';
  }

  // Nouvelle méthode pour obtenir la couleur du code de service
  private getServiceCodeColor(serviceCode: string): string {
    const color = this.serviceCodes[serviceCode]?.color || '#065594';
    console.log(`getServiceCodeColor(${serviceCode}) => ${color}`);
    return color;
  }

  getDayOfWeekIndex(dayName: string): number {
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

  getActivityColor(activityCode: string): string {
    const colorMap: { [key: string]: string } = {
      // Codes jour
      'J02': '#3b82f6',  // Bleu
      'J1': '#10b981',   // Vert
      'JB': '#f59e0b',   // Orange
      // Codes matin
      'M06': '#fbbf24',  // Jaune
      'M13': '#f97316',  // Orange foncé
      'M15': '#fb923c',  // Orange clair
      // Codes soir/nuit
      'S07': '#8b5cf6',  // Violet
      'Nsr': '#6366f1',  // Indigo
      'Nsr3': '#818cf8', // Indigo clair
      'Nld': '#4f46e5',  // Indigo foncé
      // Repos et congés
      'RH': '#6b7280',   // Gris
      'RJF': '#9ca3af',  // Gris clair
      'CA': '#10b981',   // Vert
      'RTT': '#14b8a6',  // Teal
      // Heures et formations
      'HS-1': '#06b6d4', // Cyan
      'H-': '#ef4444',   // Rouge
      'FCJ': '#ec4899',  // Rose
      'TP': '#a855f7',   // Violet clair
      // Autres
      '?': '#94a3b8'     // Gris bleu
    };
    return colorMap[activityCode] || '#065594';
  }

  customEventContent(arg: any) {
    const user = arg.event.extendedProps.user;
    const hours = arg.event.extendedProps.hours;
    const serviceCode = arg.event.extendedProps.serviceCode || 'RH';
    const isVacataire = arg.event.extendedProps.isVacataire;

    // Nettoyer le code de service pour enlever les horaires s'ils sont présents
    let cleanCode = serviceCode || '';
    if (cleanCode.includes(' - ')) {
      cleanCode = cleanCode.split(' - ')[0].trim();
    } else if (cleanCode.includes(' ')) {
      cleanCode = cleanCode.split(' ')[0].trim();
    }

    const displayText = cleanCode 
      ? `${cleanCode} - ${user}`
      : `${hours} ${user}`;

    return {
      html: `
        <div class="fc-event-content" title="${displayText}" style="
          width: 100%; 
          padding: 0; 
          margin: 0;
          display: block;
        ">
          <span style="
            background-color: ${arg.event.backgroundColor || '#065594'}; 
            color: #ffffff; 
            padding: 6px 10px; 
            border-radius: 4px; 
            display: block;
            width: 100%;
            font-size: 0.875rem;
            font-weight: 500;
            line-height: 1.5;
            word-wrap: break-word;
            white-space: normal;
            overflow: visible;
            box-sizing: border-box;
          ">${displayText}</span>
        </div>
      `
    };
  }

  private showError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erreur',
      detail: message
    });
  }

  // ============================================================================
  // MÉTHODES POUR LA VUE TABLEAU HEBDOMADAIRE
  // ============================================================================

  switchView(view: 'calendar' | 'table') {
    this.currentView = view;
    if (view === 'table') {
      this.loadWeekPlannings();
    }
  }

  loadWeekPlannings() {
    this.weekPlannings = [];
    this.totalWeekHours = 0;

    const filteredUsers = this.users.filter(user => {
      const sameService = user.service_id === this.loggedInUser?.service_id;
      const sameSpeciality = user.speciality_id === this.currentUserSpecialityId;
      const isNurse = user.role === 'nurse' || user.role === 'agent de santé';
      return sameService && sameSpeciality && isNurse;
    });

    filteredUsers.forEach((user, index) => {
      const userId = user.id || user._id;
      if (!userId) return;

      const plannings = this.userPlannings[userId] || [];
      const weekPlanning = this.buildWeekPlanning(user, plannings, index);
      this.weekPlannings.push(weekPlanning);
      this.totalWeekHours += weekPlanning.totalHours;
    });

    if (this.weekPlannings.length > 0) {
      this.averageHours = this.totalWeekHours / this.weekPlannings.length;
    }
  }

  buildWeekPlanning(user: User, plannings: any[], userIndex: number): WeekPlanning {
    const weekDays = this.getWeekDays(this.selectedWeekStart);
    let totalHours = 0;

    const getDayPlanning = (date: Date): DayPlanning => {
      const dateStr = date.toISOString().split('T')[0];
      const planning = plannings.find(p => p.date === dateStr);

      if (planning && planning.activity_code) {
        const serviceCode = this.serviceCodes[planning.activity_code];
        if (serviceCode) {
          totalHours += serviceCode.duration;
          return {
            code: planning.activity_code,
            hours: serviceCode.hours,
            color: serviceCode.color
          };
        }
      }

      return this.generateDefaultPlanning(userIndex, date.getDay());
    };

    const weekPlanning: WeekPlanning = {
      user,
      monday: getDayPlanning(weekDays[0]),
      tuesday: getDayPlanning(weekDays[1]),
      wednesday: getDayPlanning(weekDays[2]),
      thursday: getDayPlanning(weekDays[3]),
      friday: getDayPlanning(weekDays[4]),
      saturday: getDayPlanning(weekDays[5]),
      sunday: getDayPlanning(weekDays[6]),
      totalHours
    };

    if (totalHours === 0) {
      weekPlanning.totalHours = this.calculateTotalHours(weekPlanning);
    }

    return weekPlanning;
  }

  generateDefaultPlanning(userIndex: number, dayOfWeek: number): DayPlanning {
    const patterns = [
      [1, 1, 1, 1, 0, 1, 1],
      [0, 0, 1, 1, 0, 0, 0],
      [2, 2, 0, 0, 1, 0, 0],
      [2, 0, 0, 0, 2, 2, 2],
      [0, 2, 2, 0, 2, 0, 0],
      [1, 1, 1, 0, 1, 0, 0],
      [2, 2, 2, 0, 3, 3, 3],
      [0, 0, 1, 1, 0, 0, 0]
    ];

    const pattern = patterns[userIndex % patterns.length];
    const codeIndex = pattern[dayOfWeek];
    const codes = ['RH', 'J02', 'JB', 'J1'];
    const code = codes[codeIndex];
    const serviceCode = this.serviceCodes[code];

    return {
      code,
      hours: serviceCode.hours,
      color: serviceCode.color
    };
  }

  calculateTotalHours(weekPlanning: WeekPlanning): number {
    let total = 0;
    const days = [
      weekPlanning.monday,
      weekPlanning.tuesday,
      weekPlanning.wednesday,
      weekPlanning.thursday,
      weekPlanning.friday,
      weekPlanning.saturday,
      weekPlanning.sunday
    ];

    days.forEach(day => {
      const serviceCode = this.serviceCodes[day.code];
      if (serviceCode) {
        total += serviceCode.duration;
      }
    });

    return total;
  }

  getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  getWeekDays(monday: Date): Date[] {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    return days;
  }

  previousWeek() {
    const newDate = new Date(this.selectedWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    this.selectedWeekStart = newDate;
    this.loadWeekPlannings();
  }

  nextWeek() {
    const newDate = new Date(this.selectedWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    this.selectedWeekStart = newDate;
    this.loadWeekPlannings();
  }

  currentWeek() {
    this.selectedWeekStart = this.getMonday(new Date());
    this.loadWeekPlannings();
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  formatHours(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  }
}

