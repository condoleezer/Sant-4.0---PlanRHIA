import { Component, OnInit, OnDestroy } from '@angular/core';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import multiMonthPlugin from '@fullcalendar/multimonth';
import { UserService } from '../../../services/user/user.service';
import { ContratService } from '../../../services/contrat/contrat.service';
import { PlanningService } from '../../../services/planning/planning.service';
import { ServiceService } from '../../../services/service/service.service';
import { AuthService } from '../../../services/auth/auth.service';
import { User } from '../../../models/User';
import { Contrat, WorkDay } from '../../../services/contrat/contrat.service';
import { Service } from '../../../models/services';
import { CommonModule } from '@angular/common';
import { forkJoin, interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-calendar',
  imports: [FullCalendarModule, CommonModule, ToastModule],
  providers: [MessageService, AuthService],
  standalone: true,
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private refreshInterval$ = interval(30000); // Rafraîchissement toutes les 30 secondes

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, multiMonthPlugin],
    initialView: 'dayGridMonth',
    events: [],
    eventContent: this.customEventContent.bind(this),
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,dayGridWeek,multiMonthYear'
    },
    buttonText: {
      month: 'month',
      week: 'week',
      multiMonthYear: 'year'
    },
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
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
  loggedInUser: User | null = null;
  users: User[] = [];
  userContrats: { [userId: string]: Contrat | null } = {};
  userPlannings: { [userId: string]: any[] } = {}; // Stocker les plannings par utilisateur
  allServices: Service[] = [];

  constructor(
    private userService: UserService,
    private contratService: ContratService,
    private planningService: PlanningService,
    private serviceService: ServiceService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadUserAndData();
    // Démarrer le rafraîchissement automatique
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  startAutoRefresh(): void {
    // Rafraîchir automatiquement toutes les 30 secondes pour voir les plannings publiés
    this.refreshInterval$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.loggedInUser?.service_id) {
          // Recharger uniquement les plannings (plus léger que tout recharger)
          this.loadPlanningsForUsers();
        }
      });
  }

  loadUserAndData(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: User | null) => {
        console.log('=== Utilisateur connecté ===');
        console.log('User complet:', user);
        console.log('User ID:', user?._id);
        console.log('User service_id:', user?.service_id);
        console.log('User role:', user?.role);
        
        if (user?._id) {
          this.loggedInUser = user;
          
          if (!user.service_id) {
            this.showError('Votre compte n\'a pas de service attribué. Contactez l\'administrateur.');
            return;
          }
          
          this.loadAllData();
        } else {
          this.showError('Impossible de charger les informations utilisateur');
        }
      },
      error: (error) => {
        console.error('Erreur getUserInfo:', error);
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
        
        console.log('=== Données chargées ===');
        console.log('Total utilisateurs:', this.users.length);
        console.log('Service du cadre:', this.loggedInUser?.service_id);
        
        // Filtrer les utilisateurs du service
        const serviceUsers = this.users.filter(
          user => user.service_id === this.loggedInUser?.service_id
        );
        console.log('Utilisateurs du service:', serviceUsers.length, serviceUsers);
        
        this.loadContratsForUsers();
        this.loadPlanningsForUsers(); // Charger les plannings publiés
      },
      error: (error) => {
        console.error('Erreur lors du chargement des données:', error);
        this.showError('Échec du chargement des données');
      }
    });
  }

  loadContratsForUsers(): void {
    if (!this.loggedInUser?.service_id) {
      this.showError('Service de l\'utilisateur non défini');
      return;
    }

    // Filtrer les utilisateurs par service_id
    const filteredUsers = this.users.filter(
      user => user.service_id === this.loggedInUser?.service_id
    );

    console.log('=== Chargement des contrats ===');
    console.log('Utilisateurs filtrés pour contrats:', filteredUsers.length);

    if (filteredUsers.length === 0) {
      this.showInfo('Aucun utilisateur trouvé pour votre service');
      this.calendarOptions.events = [];
      return;
    }

    // Charger les contrats pour les utilisateurs filtrés
    filteredUsers.forEach(user => {
      const userId = user.id || user._id;
      if (userId) {
        this.contratService.getContratByUserId(userId).subscribe({
          next: (contrat) => {
            this.userContrats[userId] = contrat && contrat.data ? contrat.data : null;
            console.log(`Contrat chargé pour ${user.first_name} ${user.last_name}:`, this.userContrats[userId] ? 'Oui' : 'Non');
            this.updateCalendarEvents();
          },
          error: (error) => {
            console.error(`Erreur chargement contrat pour ${user.first_name}:`, error);
            this.userContrats[userId] = null;
            this.updateCalendarEvents();
          }
        });
      }
    });
  }

  loadPlanningsForUsers(): void {
    if (!this.loggedInUser?.service_id) {
      return;
    }

    // Charger tous les plannings du service en une seule requête
    // Récupérer les plannings de l'année en cours
    const currentYear = new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;
    const dateRange = `${startDate},${endDate}`;

    this.planningService.getPlanningsByService(this.loggedInUser.service_id, dateRange)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          console.log('Plannings chargés pour le service:', response);
          const plannings = response.data || [];
          
          // Réinitialiser les plannings
          this.userPlannings = {};
          
          // Grouper les plannings par utilisateur
          plannings.forEach((planning: any) => {
            const userId = planning.user_id;
            if (!this.userPlannings[userId]) {
              this.userPlannings[userId] = [];
            }
            this.userPlannings[userId].push(planning);
          });
          
          console.log('Plannings groupés par utilisateur:', this.userPlannings);
          
          // Mettre à jour le calendrier
          this.updateCalendarEvents();
        },
        error: (error: any) => {
          console.error('Erreur lors du chargement des plannings:', error);
          this.showError('Échec du chargement des plannings');
          // Mettre à jour quand même le calendrier avec les contrats
          this.updateCalendarEvents();
        }
      });
  }

  updateCalendarEvents(): void {
    const events: EventInput[] = [];
    const currentYear = new Date().getFullYear();
    const planningEventsMap = new Map<string, EventInput>(); // Map pour stocker les événements de planning par clé date-user

    // Filtrer à nouveau les utilisateurs par service_id pour plus de sécurité
    const filteredUsers = this.users.filter(
      user => user.service_id === this.loggedInUser?.service_id
    );

    console.log('=== Mise à jour du calendrier ===');
    console.log('Utilisateurs filtrés:', filteredUsers.length);
    console.log('Service du cadre:', this.loggedInUser?.service_id);
    console.log('Plannings disponibles:', Object.keys(this.userPlannings).length);

    // PRIORITÉ 1 : Charger les plannings publiés (priorité sur les contrats)
    filteredUsers.forEach(user => {
      const userId = user.id || user._id;
      if (!userId) return;

      const plannings = this.userPlannings[userId] || [];
      console.log(`Plannings pour ${user.first_name} ${user.last_name} (${userId}):`, plannings.length);
      
      plannings.forEach((planning: any) => {
        const planningDate = new Date(planning.date);
        if (planningDate.getFullYear() === currentYear) {
          // Parser la plage horaire ou utiliser les heures par défaut
          let startTime = '08:00';
          let endTime = '17:00';
          
          if (planning.plage_horaire) {
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

          // Clé unique pour identifier cet événement (date + userId)
          const eventKey = `${planning.date}_${userId}`;
          
          planningEventsMap.set(eventKey, {
            title: `${user.first_name} ${user.last_name} - ${planning.activity_code}`,
            start: startDate,
            end: endDate,
            allDay: false,
            extendedProps: {
              user: `${user.first_name} ${user.last_name}`,
              hours: `${startTime} - ${endTime}`,
              activityCode: planning.activity_code,
              isPlanning: true // Indicateur que c'est un planning publié
            },
            backgroundColor: this.getActivityColor(planning.activity_code),
            borderColor: this.getActivityColor(planning.activity_code)
          });
        }
      });
    });

    console.log('Événements de planning créés:', planningEventsMap.size);

    // PRIORITÉ 2 : Ajouter les événements basés sur les contrats (seulement si pas de planning pour cette date)
    filteredUsers.forEach(user => {
      const userId = user.id || user._id;
      if (!userId || !this.userContrats[userId]?.work_days) return;

      const contrat = this.userContrats[userId];
      contrat?.work_days.forEach((workDay: WorkDay) => {
        const dayOfWeek = this.getDayOfWeekIndex(workDay.day);
        if (dayOfWeek === -1) return;

        // Générer des événements pour chaque semaine de l'année en cours
        for (let month = 0; month < 12; month++) {
          const date = new Date(currentYear, month, 1);
          while (date.getMonth() === month) {
            if (date.getDay() === dayOfWeek) {
              const dateStr = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
              const eventKey = `${dateStr}_${userId}`;
              
              // Ne créer un événement de contrat que s'il n'y a pas déjà un planning pour cette date
              if (!planningEventsMap.has(eventKey)) {
                const startDate = new Date(date);
                const [startHours, startMinutes] = workDay.start_time.split(':').map(Number);
                startDate.setHours(startHours, startMinutes, 0, 0);

                const endDate = new Date(date);
                const [endHours, endMinutes] = workDay.end_time.split(':').map(Number);
                endDate.setHours(endHours, endMinutes, 0, 0);

                events.push({
                  title: `${user.first_name} ${user.last_name}`,
                  start: startDate,
                  end: endDate,
                  allDay: false,
                  extendedProps: {
                    user: `${user.first_name} ${user.last_name}`,
                    hours: `${workDay.start_time} - ${workDay.end_time}`,
                    isPlanning: false // Indicateur que c'est basé sur le contrat
                  }
                });
              }
            }
            date.setDate(date.getDate() + 1);
          }
        }
      });
    });

    // Ajouter tous les événements de planning à la liste finale
    planningEventsMap.forEach(event => {
      events.push(event);
    });

    console.log('Total événements (plannings + contrats):', events.length);
    console.log('Événements:', events);

    this.calendarOptions.events = events;
  }

  getActivityColor(activityCode: string): string {
    // Codes d'activité avec couleurs
    const colorMap: { [key: string]: string } = {
      // Codes jour
      'J02': '#3b82f6',      // Bleu
      'J1': '#10b981',       // Vert
      'JB': '#f59e0b',       // Orange
      // Codes matin
      'M06': '#fbbf24',      // Jaune
      'M13': '#f97316',      // Orange foncé
      'M15': '#fb923c',      // Orange clair
      // Codes soir/nuit
      'S07': '#8b5cf6',      // Violet
      'Nsr': '#6366f1',      // Indigo
      'Nsr3': '#818cf8',     // Indigo clair
      'Nld': '#4f46e5',      // Indigo foncé
      // Repos et congés
      'RH': '#6b7280',       // Gris
      'RJF': '#9ca3af',      // Gris clair
      'CA': '#10b981',       // Vert
      'RTT': '#14b8a6',      // Teal
      // Heures et formations
      'HS-1': '#06b6d4',     // Cyan
      'H-': '#ef4444',       // Rouge
      'FCJ': '#ec4899',      // Rose
      'TP': '#a855f7',       // Violet clair
      // Autres
      '?': '#94a3b8'         // Gris bleu
    };
    const color = colorMap[activityCode] || '#065594';
    console.log(`getActivityColor(${activityCode}) => ${color}`);
    return color;
  }

  getDayOfWeekIndex(dayName: string): number {
    const daysMap: { [key: string]: number } = {
      'Lundi': 1,
      'Mardi': 2,
      'Mercredi': 3,
      'Jeudi': 4,
      'Vendredi': 5,
      'Samedi': 6,
      'Dimanche': 0
    };
    return daysMap[dayName] ?? -1;
  }

  customEventContent(arg: any) {
    const user = arg.event.extendedProps.user;
    const hours = arg.event.extendedProps.hours;
    const activityCode = arg.event.extendedProps.activityCode;
    const isPlanning = arg.event.extendedProps.isPlanning;

    // Nettoyer le code d'activité pour enlever les horaires s'ils sont présents
    let cleanCode = activityCode || '';
    if (cleanCode.includes(' - ')) {
      cleanCode = cleanCode.split(' - ')[0].trim();
    } else if (cleanCode.includes(' ')) {
      cleanCode = cleanCode.split(' ')[0].trim();
    }

    // Si c'est un planning publié, afficher le code d'activité avec le nom de l'utilisateur (sans les horaires)
    const displayText = isPlanning && cleanCode 
      ? `${cleanCode} - ${user}`
      : `${hours} ${user}`;

    // Texte complet pour le tooltip
    const fullText = displayText;

    return {
      html: `
        <div class="fc-event-content" title="${fullText}" style="
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

  private showInfo(message: string): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Information',
      detail: message
    });
  }
}