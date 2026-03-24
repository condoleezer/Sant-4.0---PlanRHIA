import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil, forkJoin } from 'rxjs';

// PrimeNG Modules
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';

// Custom Calendar Component
import { CustomCalendarComponent, CalendarEvent } from '../../../shared/components/custom-calendar/custom-calendar.component';

// Interfaces locales pour le composant mon-agenda
interface CalendarDay {
  date: Date;
  events: CalendarEvent[];
  isToday: boolean;
  isSelected: boolean;
}

interface CalendarView {
  type: string;
  date: Date;
}

// Services
import { AvailabilityService } from '../../../services/availability/availability.service';
import { PlanningService } from '../../../services/planning/planning.service';
import { AuthService } from '../../../services/auth/auth.service';
import { CalendarSyncService, PlanningChange } from '../../../services/calendar-sync/calendar-sync.service';
import { PlanningPriorityService } from '../../../services/planning-priority/planning-priority.service';
import { ContratService, Contrat, WorkDay } from '../../../services/contrat/contrat.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environment/environment';

// Models
import { Availability } from '../../../models/availability';
import { Planning } from '../../../models/planning';

// Les interfaces CalendarEvent et CalendarDay sont maintenant importées du composant custom-calendar

@Component({
  selector: 'app-mon-agenda',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CustomCalendarComponent,
    DialogModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    TextareaModule,
    ToastModule,
    CardModule,
    TagModule,
    BadgeModule
  ],
  providers: [MessageService],
  templateUrl: './mon-agenda.component.html',
  styleUrls: ['./mon-agenda.component.css']
})
export class MonAgendaComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();

  // Calendar properties
  selectedDate: Date = new Date();
  events: CalendarEvent[] = [];
  loading = false;
  
  // Données brutes pour la logique de priorité
  allPlannings: any[] = [];
  allAvailabilities: any[] = [];
  userContrat: Contrat | null = null; // Contrat de l'utilisateur actuel

  // Modal properties
  showAvailabilityModal = false;
  showPlanningModal = false;
  showEditPlanningModal = false;
  selectedDay: any = null;

  // Form data
  availabilityForm = {
    start_time: '',
    end_time: '',
    commentaire: ''
  };

  planningForm = {
    activity_code: '',
    plage_horaire: '',
    commentaire: ''
  };

  // Modification directe du planning
  editPlanningForm = {
    activity_code: '',
    commentaire: ''
  };
  editPlanningExistingId: string | null = null; // ID du planning existant si mise à jour

  // Options - Codes d'activité unifiés avec codes de service
  activityCodes = [
    // Codes de service jour
    { label: 'J02 - Service 6:45-18:45 (12h)', value: 'J02' },
    { label: 'J1 - Service 7:15-19:45 (12.5h)', value: 'J1' },
    { label: 'JB - Service 8:00-20:00 (12h)', value: 'JB' },
    // Codes de service matin
    { label: 'M06 - Matin 6:00-13:30', value: 'M06' },
    { label: 'M13 - Matin 13:00-20:30', value: 'M13' },
    { label: 'M15 - Matin 15:00-22:30', value: 'M15' },
    // Codes de service soir/nuit
    { label: 'S07 - Soir 7:00-19:30', value: 'S07' },
    { label: 'Nsr - Nuit standard', value: 'Nsr' },
    { label: 'Nsr3 - Nuit standard 3', value: 'Nsr3' },
    { label: 'Nld - Nuit longue durée', value: 'Nld' },
    // Repos et congés
    { label: 'RH - Repos hebdomadaire', value: 'RH' },
    { label: 'RJF - Repos jour férié', value: 'RJF' },
    { label: 'CA - Congé annuel', value: 'CA' },
    { label: 'RTT - Réduction temps travail', value: 'RTT' },
    // Heures et formations
    { label: 'HS-1 - Heures supplémentaires -1', value: 'HS-1' },
    { label: 'H- - Heures négatives', value: 'H-' },
    { label: 'FCJ - Formation continue jour', value: 'FCJ' },
    { label: 'TP - Temps partiel', value: 'TP' },
    // Autres
    { label: '? - Non défini', value: '?' }
  ];

  // Codes de service avec leurs horaires
  serviceCodes: { [key: string]: { hours: string, duration: number } } = {
    'J02': { hours: '6:45-18:45', duration: 12 },
    'J1': { hours: '7:15-19:45', duration: 12.5 },
    'JB': { hours: '8:00-20:00', duration: 12 },
    'M06': { hours: '6:00-13:30', duration: 7.5 },
    'M13': { hours: '13:00-20:30', duration: 7.5 },
    'M15': { hours: '15:00-22:30', duration: 7.5 },
    'S07': { hours: '7:00-19:30', duration: 12.5 },
    'Nsr': { hours: '20:00-8:00', duration: 12 },
    'Nsr3': { hours: '20:00-8:00', duration: 12 },
    'Nld': { hours: '20:00-8:00', duration: 12 },
    'RH': { hours: 'Repos', duration: 0 },
    'RJF': { hours: 'Repos férié', duration: 0 },
    'CA': { hours: 'Congé', duration: 0 },
    'RTT': { hours: 'RTT', duration: 0 },
    'HS-1': { hours: 'Heures sup', duration: 0 },
    'H-': { hours: 'Heures -', duration: 0 },
    'FCJ': { hours: 'Formation', duration: 7 },
    'TP': { hours: 'Temps partiel', duration: 0 },
    '?': { hours: 'Non défini', duration: 0 }
  };

  timeSlots = [
    { label: 'Matin (08:00-12:00)', value: '08:00-12:00' },
    { label: 'Après-midi (13:00-17:00)', value: '13:00-17:00' },
    { label: 'Soir (18:00-22:00)', value: '18:00-22:00' },
    { label: 'Journée complète (08:00-17:00)', value: '08:00-17:00' },
    { label: 'Nuit (20:00-08:00)', value: '20:00-08:00' }
  ];

  // User info
  currentUser: any = null;

  // Fenêtre de dépôt active (définie par le cadre)
  activeLeaveWindow: any = null;

  // ViewChild pour accéder au calendrier
  // @ViewChild('calendar') calendarRef!: ElementRef; // Plus nécessaire avec le calendrier personnalisé

  // Les styles du calendrier sont maintenant gérés par le composant custom-calendar

  // La locale française est maintenant gérée par le composant custom-calendar

  constructor(
    private availabilityService: AvailabilityService,
    private planningService: PlanningService,
    private authService: AuthService,
    private messageService: MessageService,
    private calendarSyncService: CalendarSyncService,
    private planningPriorityService: PlanningPriorityService,
    private contratService: ContratService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadUserAndData();
    // S'abonner aux changements de planning
    this.subscribeToPlanningChanges();
    // Démarrer le rafraîchissement automatique via CalendarSyncService
    this.startAutoRefresh();
  }

  ngAfterViewInit(): void {
    // Plus besoin de forcer la taille du calendrier avec le composant personnalisé
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
        // Si le changement concerne l'utilisateur actuel ou son service
        if (this.currentUser && (
          change.user_id === this.currentUser._id ||
          change.service_id === this.currentUser.service_id ||
          change.type === 'force_refresh'
        )) {
          console.log('Changement de planning détecté, rechargement...', change);
          
          // Si c'est une prévisualisation (simulation), ajouter directement l'événement
          if (change.data?.is_preview && change.date && change.user_id === this.currentUser._id) {
            this.addPreviewEvent(change);
          } else {
            // Pour les changements sauvegardés, recharger les données
            setTimeout(() => {
              this.loadCalendarData();
            }, 500);
          }
        }
      });
  }

  /**
   * Ajoute un événement de prévisualisation directement au calendrier (temps réel)
   */
  addPreviewEvent(change: PlanningChange): void {
    if (!change.date || !change.data?.activity_code) return;

    const [year, month, day] = change.date.split('-').map(Number);
    const eventDate = new Date(year, month - 1, day);
    eventDate.setHours(0, 0, 0, 0);

    const previewEvent: CalendarEvent = {
      id: `preview_${change.user_id}_${change.date}`,
      title: `${change.data.activity_code} (Prévisualisation)`,
      date: eventDate,
      type: 'planning',
      status: 'validé',
      timeRange: change.data.plage_horaire || '08:00-17:00',
      color: this.getActivityColor(change.data.activity_code)
    };

    // Remplacer ou ajouter l'événement dans la liste
    const existingIndex = this.events.findIndex(e => e.id === previewEvent.id);
    if (existingIndex >= 0) {
      this.events[existingIndex] = previewEvent;
    } else {
      this.events.push(previewEvent);
    }

    // Forcer la mise à jour de l'affichage
    this.events = [...this.events];
    
    console.log('Événement de prévisualisation ajouté en temps réel:', previewEvent);
  }

  startAutoRefresh(): void {
    // Utiliser le service centralisé pour le rafraîchissement automatique (30 secondes)
    this.calendarSyncService.autoRefresh$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.currentUser?._id && !this.loading) {
          console.log('Rafraîchissement automatique (30s)');
          this.loadCalendarData();
        }
      });
  }

  loadUserAndData(): void {
    this.authService.getUserInfo()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user: any) => {
          this.currentUser = user;
          this.loadCalendarData();
          this.loadActiveLeaveWindow();
          console.log('Utilisateur chargé:', user.first_name, user.last_name, 'Service:', user.service_id);
        },
        error: (error: any) => {
          console.error('Erreur lors du chargement de l\'utilisateur:', error);
        }
      });
  }

  loadActiveLeaveWindow(): void {
    if (!this.currentUser?.service_id) return;
    this.http.get<any>(`${environment.apiUrl}/leave-windows/active?service_id=${this.currentUser.service_id}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.activeLeaveWindow = res.is_open ? res.data : null;
          console.log('activeLeaveWindow:', this.activeLeaveWindow);
        },
        error: () => { this.activeLeaveWindow = null; }
      });
  }

  isCodeAllowed(code: string): boolean {
    if (!this.activeLeaveWindow) return false;
    return this.activeLeaveWindow.allowed_codes?.includes(code) ?? false;
  }

  isLeaveRelatedCode(code: string): boolean {
    const leaveCodes = ['CA', 'RTT', 'RH', 'RJF', 'TP', 'CSF', 'FCJ'];
    return leaveCodes.includes(code);
  }

  canSubmitCode(code: string): boolean {
    // La fenêtre contrôle TOUS les codes — si fermée, aucune modification possible
    return !!this.activeLeaveWindow;
  }

  loadCalendarData(): void {
    if (!this.currentUser?._id) return;

    this.loading = true;
    
    // Réinitialiser les événements et données brutes
    this.events = [];
    this.allPlannings = [];
    this.allAvailabilities = [];
    this.userContrat = null;
    
    // Charger les disponibilités, plannings et contrat en parallèle
    const availabilityRequest = this.availabilityService.getAvailabilitiesByUser(this.currentUser._id)
      .pipe(takeUntil(this.destroy$));
    
    const planningRequest = this.planningService.getPlanningsByUser(this.currentUser._id)
      .pipe(takeUntil(this.destroy$));

    const contratRequest = this.contratService.getContratByUserId(this.currentUser._id)
      .pipe(takeUntil(this.destroy$));

    // Utiliser forkJoin pour charger les trois en parallèle
    forkJoin([availabilityRequest, planningRequest, contratRequest] as const).subscribe({
      next: ([availabilityResponse, planningResponse, contratResponse]: [any, any, any]) => {
        this.allAvailabilities = availabilityResponse.data || [];
        this.allPlannings = planningResponse.data || [];
        this.userContrat = contratResponse?.data || null;
        
        console.log(`📥 Données chargées - Plannings: ${this.allPlannings.length}, Disponibilités: ${this.allAvailabilities.length}, Contrat: ${this.userContrat ? 'Oui' : 'Non'}`);
        
        // Log des plannings en_attente pour debug
        const pendingPlannings = this.allPlannings.filter((p: any) => p.status === 'en_attente');
        console.log(`📥 Plannings en attente: ${pendingPlannings.length}`);
        if (pendingPlannings.length > 0) {
          console.log('📥 Détails plannings en attente:', pendingPlannings);
          pendingPlannings.forEach((p: any) => {
            console.log(`🔍 EN ATTENTE → date: ${p.date}, activity_code: "${p.activity_code}", status: "${p.status}"`);
          });
        }
        
        // Log des plannings d'avril pour debug
        if (this.allPlannings.length > 0) {
          const aprilPlannings = this.allPlannings.filter((p: any) => {
            const dateStr = typeof p.date === 'string' ? p.date : new Date(p.date).toISOString().split('T')[0];
            return dateStr.startsWith('2026-04');
          });
          console.log(`📥 Plannings d'avril chargés: ${aprilPlannings.length}`);
          if (aprilPlannings.length > 0) {
            console.log('📥 Échantillon:', aprilPlannings.slice(0, 3).map((p: any) => ({
              date: p.date,
              code: p.activity_code,
              status: p.status
            })));
          }
        }
        
        // Appliquer la logique de priorité pour générer les événements
        this.applyPriorityLogic();
        
          this.loading = false;
        },
      error: (error) => {
        console.error('Erreur lors du chargement des données:', error);
        // Même en cas d'erreur, essayer de charger les données disponibles
        this.applyPriorityLogic();
          this.loading = false;
        }
      });
  }

  /**
   * Applique la logique de priorité pour déterminer quels événements afficher
   * Priorité: Planning validé > Contrat (jours de travail) > Disponibilité validée > Disponibilité proposée
   */
  applyPriorityLogic(): void {
    // Créer un Map pour stocker les événements par date (éviter les doublons)
    const eventsMap = new Map<string, CalendarEvent>();
    
    // Trouver la plage de dates couverte par les plannings
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    
    this.allPlannings.forEach(p => {
      const planningDate = new Date(p.date);
      if (!minDate || planningDate < minDate) minDate = planningDate;
      if (!maxDate || planningDate > maxDate) maxDate = planningDate;
    });
    
    // Si pas de plannings, utiliser le mois courant
    if (!minDate || !maxDate) {
      minDate = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1);
      maxDate = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + 1, 0);
    }
    
    // Étendre la plage pour couvrir les mois complets
    const startDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const endDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
    
    console.log(`Génération d'événements du ${startDate.toISOString().split('T')[0]} au ${endDate.toISOString().split('T')[0]}`);
    
    // Générer les événements basés sur le contrat (jours de travail)
    const contractEvents = this.generateContractEvents(startDate, endDate);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // PRIORITÉ 1 : Planning validé (priorité maximale)
      const planningEvent = this.planningPriorityService.getDisplayEvent(
        this.allPlannings,
        this.allAvailabilities,
        dateStr
      );
      
      if (planningEvent) {
        eventsMap.set(dateStr, planningEvent);
        continue; // Planning validé a la priorité, on passe à la date suivante
      }
      
      // PRIORITÉ 2 : Événement basé sur le contrat (jours de travail)
      const contractEvent = contractEvents.get(dateStr);
      if (contractEvent) {
        eventsMap.set(dateStr, contractEvent);
        continue; // Contrat a la priorité sur les disponibilités
      }
      
      // PRIORITÉ 3 : Disponibilité (validée ou proposée)
      // Le service de priorité gère déjà cela, mais on l'a déjà vérifié plus haut
      // Si on arrive ici, c'est qu'il n'y a ni planning ni contrat pour cette date
    }
    
    // Convertir le Map en tableau
    this.events = Array.from(eventsMap.values());
    
    // Log des événements en attente pour debug
    const pendingEvents = this.events.filter(e => e.status === 'en_attente');
    if (pendingEvents.length > 0) {
      console.log('🎨 ÉVÉNEMENTS EN ATTENTE:', pendingEvents.map(e => ({
        date: e.date.toISOString().split('T')[0],
        title: e.title,
        color: e.color,
        status: e.status
      })));
    }
    
    console.log(`Événements générés avec priorité: ${this.events.length} (Plannings: ${this.allPlannings.length}, Contrat: ${contractEvents.size}, Disponibilités: ${this.allAvailabilities.length})`);
    
    // Log des événements d'avril pour debug
    const aprilEvents = this.events.filter(e => {
      const eventDate = new Date(e.date);
      return eventDate.getMonth() === 3 && eventDate.getFullYear() === 2026;
    });
    console.log(`Événements d'avril 2026: ${aprilEvents.length}`);
    if (aprilEvents.length > 0) {
      console.log('Premiers événements d\'avril:', aprilEvents.slice(0, 5).map(e => ({
        date: e.date.toISOString().split('T')[0],
        title: e.title
      })));
    }
  }

  /**
   * Génère les événements basés sur le contrat (jours de travail) pour TOUTE L'ANNÉE
   * Exclut les vacataires car ils sont des remplacements temporaires
   */
  generateContractEvents(startDate: Date, endDate: Date): Map<string, CalendarEvent> {
    const contractEventsMap = new Map<string, CalendarEvent>();
    
    // Ne pas générer d'événements de contrat pour les vacataires (remplacements temporaires)
    if (this.currentUser?.role === 'vacataire') {
      return contractEventsMap;
    }
    
    if (!this.userContrat || !this.userContrat.work_days || this.userContrat.work_days.length === 0) {
      return contractEventsMap;
    }
    
    // Générer les événements pour TOUTE L'ANNÉE (pas seulement le mois courant)
    const currentYear = new Date().getFullYear();
    
    // Parcourir tous les mois de l'année
    for (let month = 0; month < 12; month++) {
      const date = new Date(currentYear, month, 1);
      
      // Parcourir tous les jours du mois
      while (date.getMonth() === month) {
        const dateStr = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
        const dayOfWeek = date.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
        
        // Vérifier si ce jour correspond à un jour de travail dans le contrat
        this.userContrat.work_days.forEach((workDay: WorkDay) => {
          const contractDayIndex = this.getDayOfWeekIndexFromName(workDay.day);
          
          if (contractDayIndex === dayOfWeek) {
            // Vérifier qu'il n'y a pas déjà un planning pour cette date
            const hasPlanning = this.allPlannings.some(p => {
              const planningDate = new Date(p.date);
              return planningDate.toISOString().split('T')[0] === dateStr;
            });
            
            // Ne créer un événement de contrat que s'il n'y a pas de planning
            if (!hasPlanning) {
              const eventDate = new Date(date);
              eventDate.setHours(0, 0, 0, 0);
              
              // Déterminer le code de service basé sur les horaires
              const serviceCode = this.determineServiceCode(workDay.start_time, workDay.end_time);
              
              contractEventsMap.set(dateStr, {
                id: `contract_${dateStr}`,
                title: `${serviceCode}`,
                date: eventDate,
                type: 'planning',
                status: 'validé',
                timeRange: `${workDay.start_time}-${workDay.end_time}`,
                color: this.getActivityColor(serviceCode)
              });
            }
          }
        });
        
        // Passer au jour suivant
        date.setDate(date.getDate() + 1);
      }
    }
    
    return contractEventsMap;
  }
  
  /**
   * Détermine le code de service basé sur les horaires
   */
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
      
  /**
   * Convertit un nom de jour français en index JavaScript (0=Dimanche, 1=Lundi, etc.)
   */
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

  // Les méthodes processAvailabilities et processPlannings ne sont plus utilisées
  // La logique est maintenant dans applyPriorityLogic()

  getStatusColor(status: string): string {
    switch (status) {
      case 'validé': return '#10b981'; // Vert
      case 'proposé': return '#f59e0b'; // Orange
      case 'refusé': return '#ef4444'; // Rouge
      default: return '#6b7280'; // Gris
    }
  }

  getActivityColor(activityCode: string): string {
    // Codes de service jour (bleus/verts)
    switch (activityCode) {
      case 'J02': return '#3b82f6'; // Bleu
      case 'J1': return '#10b981'; // Vert
      case 'JB': return '#f59e0b'; // Orange
      // Codes matin (jaunes/oranges)
      case 'M06': return '#fbbf24'; // Jaune
      case 'M13': return '#f97316'; // Orange foncé
      case 'M15': return '#fb923c'; // Orange clair
      // Codes soir/nuit (violets/indigos)
      case 'S07': return '#8b5cf6'; // Violet
      case 'Nsr': return '#6366f1'; // Indigo
      case 'Nsr3': return '#818cf8'; // Indigo clair
      case 'Nld': return '#4f46e5'; // Indigo foncé
      // Repos et congés (gris/verts)
      case 'RH': return '#6b7280'; // Gris
      case 'RJF': return '#9ca3af'; // Gris clair
      case 'CA': return '#10b981'; // Vert
      case 'RTT': return '#14b8a6'; // Teal
      // Heures et formations (cyans/roses)
      case 'HS-1': return '#06b6d4'; // Cyan
      case 'H-': return '#ef4444'; // Rouge
      case 'FCJ': return '#ec4899'; // Rose
      case 'TP': return '#a855f7'; // Violet clair
      // Autres
      case '?': return '#94a3b8'; // Gris bleu
      // Anciens codes pour compatibilité
      case 'J\'': return '#f59e0b';
      case 'EX': return '#8b5cf6';
      case 'CSF': return '#ef4444';
      case 'F': return '#06b6d4';
      case 'DISP': return '#84cc16';
      case 'SOIN': return '#3b82f6';
      case 'CONGÉ': return '#8b5cf6';
      case 'REPOS': return '#06b6d4';
      case 'FORMATION': return '#f59e0b';
      case 'ADMINISTRATIF': return '#6b7280';
      default: return '#065594';
    }
  }

  onDateSelect(date: Date): void {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    this.selectedDate = normalizedDate;
    this.selectedDay = normalizedDate;
    this.openEditPlanningModal(normalizedDate);
  }

  onProposalClick(date: Date): void {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    this.selectedDate = normalizedDate;
    this.selectedDay = normalizedDate;
    this.openEditPlanningModal(normalizedDate);
  }

  /**
   * Ouvre le modal de modification directe du planning pour une date donnée.
   * Pré-remplit avec le code existant si un planning existe déjà.
   */
  openEditPlanningModal(date: Date): void {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const existing = this.allPlannings.find(p => {
      const d = typeof p.date === 'string' ? p.date : new Date(p.date).toISOString().split('T')[0];
      return d === dateStr;
    });
    this.editPlanningExistingId = existing ? existing._id : null;
    this.editPlanningForm = {
      activity_code: existing?.activity_code || '',
      commentaire: existing?.commentaire || ''
    };
    this.showEditPlanningModal = true;
  }

  onMonthChange(newDate: Date): void {
    console.log('Changement de mois détecté:', newDate);
    // Pas besoin de recharger les données, les événements sont déjà générés pour toute l'année
    // Le calendrier filtre automatiquement les événements par mois
  }

  /**
   * Vérifie si une date correspond à un jour de travail selon le contrat
   */
  isWorkDay(date: Date): boolean {
    // Les vacataires peuvent créer des disponibilités (remplacements temporaires)
    if (this.currentUser?.role === 'vacataire') {
      return true;
    }
    
    // Si pas de contrat, autoriser (cas où le contrat n'est pas encore défini)
    if (!this.userContrat || !this.userContrat.work_days || this.userContrat.work_days.length === 0) {
      return true;
    }
    
    const dayOfWeek = date.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
    
    // Vérifier si ce jour correspond à un jour de travail dans le contrat
    return this.userContrat.work_days.some((workDay: WorkDay) => {
      const contractDayIndex = this.getDayOfWeekIndexFromName(workDay.day);
      return contractDayIndex === dayOfWeek;
    });
  }

  resetForms(): void {
    this.availabilityForm = {
      start_time: '',
      end_time: '',
      commentaire: ''
    };
    this.planningForm = {
      activity_code: '',
      plage_horaire: '',
      commentaire: ''
    };
  }

  setQuickTime(type: 'start' | 'end', time: string): void {
    if (type === 'start') {
      this.availabilityForm.start_time = time;
    } else {
      this.availabilityForm.end_time = time;
    }
  }

  openPlanningModal(): void {
    this.showAvailabilityModal = false;
    this.showPlanningModal = true;
  }

  closeModals(): void {
    this.showAvailabilityModal = false;
    this.showPlanningModal = false;
    this.showEditPlanningModal = false;
    this.selectedDay = null;
  }

  /**
   * Sauvegarde la modification directe du planning (soumise au cadre pour validation).
   */
  submitEditPlanning(): void {
    if (!this.currentUser?._id || !this.selectedDay || !this.editPlanningForm.activity_code) {
      this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Veuillez sélectionner un code activité' });
      return;
    }

    const date = this.selectedDay instanceof Date ? this.selectedDay : new Date(this.selectedDay);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const code = this.editPlanningForm.activity_code;

    // Vérifier si la fenêtre de dépôt est active
    if (!this.canSubmitCode(code)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Modifications fermées',
        detail: 'Les modifications de planning ne sont pas ouvertes actuellement. Contactez votre cadre.'
      });
      return;
    }

    const plage = this.serviceCodes[code]?.hours || '08:00-17:00';

    // Toujours soumettre comme demande en attente de validation cadre
    this.planningService.agentPlanningRequest({
      user_id: this.currentUser._id,
      date: dateStr,
      activity_code: code,
      plage_horaire: plage,
      commentaire: this.editPlanningForm.commentaire
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        this.messageService.add({
          severity: 'info',
          summary: 'Demande envoyée',
          detail: 'Votre modification est en attente de validation par votre cadre'
        });
        this.closeModals();

        // Mise à jour optimiste : ajouter/remplacer l'événement localement immédiatement
        const eventDate = new Date(date);
        eventDate.setHours(0, 0, 0, 0);
        const pendingEvent: CalendarEvent = {
          id: response?.planning_id || `pending_${dateStr}`,
          title: code,
          date: eventDate,
          type: 'planning',
          status: 'en_attente',
          timeRange: plage,
          color: this.getActivityColor(code)
        };

        // Ajouter dans allPlannings pour que la logique de priorité fonctionne
        const existingIndex = this.allPlannings.findIndex((p: any) => {
          const d = typeof p.date === 'string' ? p.date : new Date(p.date).toISOString().split('T')[0];
          return d === dateStr && p.status === 'en_attente';
        });
        const pendingPlanning = {
          _id: response?.planning_id || `pending_${dateStr}`,
          user_id: this.currentUser._id,
          date: dateStr,
          activity_code: code,
          plage_horaire: plage,
          status: 'en_attente',
          commentaire: this.editPlanningForm.commentaire
        };
        if (existingIndex >= 0) {
          this.allPlannings[existingIndex] = pendingPlanning;
        } else {
          this.allPlannings.push(pendingPlanning);
        }

        // Remplacer l'événement dans la liste des événements affichés
        const evtIndex = this.events.findIndex(e => {
          const evtDate = new Date(e.date);
          evtDate.setHours(0, 0, 0, 0);
          return evtDate.getTime() === eventDate.getTime();
        });
        if (evtIndex >= 0) {
          this.events[evtIndex] = pendingEvent;
        } else {
          this.events.push(pendingEvent);
        }
        this.events = [...this.events];
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la soumission' })
    });
  }

  submitAvailability(): void {
    console.log('Tentative de soumission de disponibilité...');
    console.log('Utilisateur:', this.currentUser);
    console.log('Jour sélectionné:', this.selectedDay);
    console.log('Formulaire:', this.availabilityForm);
    
    if (!this.currentUser?._id || !this.selectedDay) {
      console.error('Données manquantes pour la soumission');
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Données manquantes pour la soumission'
      });
      return;
    }

    // Vérifier si c'est un jour de travail selon le contrat
    const selectedDate = this.selectedDay instanceof Date 
      ? this.selectedDay 
      : new Date(this.selectedDay.year, this.selectedDay.month, this.selectedDay.day);
    
    if (!this.isWorkDay(selectedDate)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Jour non travaillé',
        detail: 'Vous ne pouvez pas créer de disponibilité pour un jour où vous ne travaillez pas selon votre contrat.'
      });
      return;
    }

    // Validation des champs d'heure
    if (!this.availabilityForm.start_time || !this.availabilityForm.end_time) {
      console.error('Heures de début et fin requises');
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Veuillez renseigner l\'heure de début et l\'heure de fin'
      });
      return;
    }

    // Validation de la cohérence des heures
    if (this.availabilityForm.start_time >= this.availabilityForm.end_time) {
      console.error('L\'heure de fin doit être postérieure à l\'heure de début');
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'L\'heure de fin doit être postérieure à l\'heure de début'
      });
      return;
    }

    // Convertir selectedDay en format YYYY-MM-DD (sans conversion UTC pour éviter le décalage d'un jour)
    let dateString = '';
    if (this.selectedDay instanceof Date) {
      const year = this.selectedDay.getFullYear();
      const month = String(this.selectedDay.getMonth() + 1).padStart(2, '0');
      const day = String(this.selectedDay.getDate()).padStart(2, '0');
      dateString = `${year}-${month}-${day}`;
    } else if (this.selectedDay.year && this.selectedDay.month !== undefined && this.selectedDay.day) {
      const year = this.selectedDay.year;
      const month = String(this.selectedDay.month + 1).padStart(2, '0');
      const day = String(this.selectedDay.day).padStart(2, '0');
      dateString = `${year}-${month}-${day}`;
    }

    const availabilityData = {
      user_id: this.currentUser._id,
      date: dateString,
      start_time: this.availabilityForm.start_time,
      end_time: this.availabilityForm.end_time,
      status: 'proposé' as const,
      commentaire: this.availabilityForm.commentaire
    };

    console.log('Données à envoyer:', availabilityData);

    this.availabilityService.proposeAvailability(availabilityData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          console.log('Réponse du serveur:', response);
          this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: 'Disponibilité proposée avec succès'
          });
          this.closeModals();
          this.loadCalendarData();
        },
        error: (error: any) => {
          console.error('Erreur lors de la création:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Erreur lors de la création de la disponibilité'
          });
        }
      });
  }

  submitPlanning(): void {
    if (!this.currentUser?._id || !this.selectedDay) return;

    // Convertir selectedDay en format YYYY-MM-DD (sans conversion UTC pour éviter le décalage d'un jour)
    let planningDateString = '';
    if (this.selectedDay instanceof Date) {
      const year = this.selectedDay.getFullYear();
      const month = String(this.selectedDay.getMonth() + 1).padStart(2, '0');
      const day = String(this.selectedDay.getDate()).padStart(2, '0');
      planningDateString = `${year}-${month}-${day}`;
    } else if (this.selectedDay.year && this.selectedDay.month !== undefined && this.selectedDay.day) {
      const year = this.selectedDay.year;
      const month = String(this.selectedDay.month + 1).padStart(2, '0');
      const day = String(this.selectedDay.day).padStart(2, '0');
      planningDateString = `${year}-${month}-${day}`;
    }

    const planningData: Planning = {
      user_id: this.currentUser._id,
      date: planningDateString,
      activity_code: this.planningForm.activity_code, // Accepte tous les codes unifiés
      plage_horaire: this.planningForm.plage_horaire,
      commentaire: this.planningForm.commentaire
    };

    this.planningService.createPlanning(planningData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: 'Planning créé avec succès'
          });
          this.closeModals();
          this.loadCalendarData();
        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Erreur lors de la création du planning'
          });
        }
      });
  }

  // Ces méthodes sont maintenant gérées par le composant custom-calendar

  formatDateStr(dateStr: string): string {
    if (!dateStr) return '';
    // Gère YYYY-MM-DD et ISO string
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  formatDate(date: any): string {
    if (!date) return '';
    
    // Si c'est déjà un objet Date
    if (date instanceof Date) {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
    
    // Si c'est un objet avec year, month, day (format PrimeNG)
    if (date.year && date.month !== undefined && date.day) {
      const dateObj = new Date(date.year, date.month, date.day);
      return dateObj.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    
    return '';
  }

  // Les méthodes de navigation sont maintenant gérées par le composant custom-calendar

  // La méthode forceCalendarSize n'est plus nécessaire avec le calendrier personnalisé
}
