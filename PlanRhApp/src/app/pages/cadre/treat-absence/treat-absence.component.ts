import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { AbsenceService } from '../../../services/absence/absence.service';
import { UserService } from '../../../services/user/user.service';
import { ServiceService } from '../../../services/service/service.service';
import { Absence } from '../../../models/absence';
import { User } from '../../../models/User';
import { Service } from '../../../models/services';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { forkJoin } from 'rxjs';
import { BadgeModule } from 'primeng/badge';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextarea } from 'primeng/inputtextarea';
import { ReplacementAIService, ReplacementSuggestion, ChatMessage } from '../../../services/replacement-ai/replacement-ai.service';
import { ExchangeReciprocityService, ReciprocityEntry } from '../../../services/exchange-reciprocity/exchange-reciprocity.service';
import { CalendarSyncService } from '../../../services/calendar-sync/calendar-sync.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DialogModule } from 'primeng/dialog';

interface City {
  name: string;
  code: string;
  isBlocked?: boolean;
}

@Component({
  selector: 'app-treat-absence',
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, ToastModule, BadgeModule, CardModule, InputTextModule, InputTextarea, ProgressSpinnerModule, DialogModule],
  providers: [MessageService],
  standalone: true,
  templateUrl: './treat-absence.component.html',
  styleUrls: ['./treat-absence.component.css']
})
export class TreatAbsenceComponent implements OnInit {
  absence: Absence | null = null;
  staff: User | null = null;
  replacement: User | null = null;
  service: Service | null = null;
  users: City[] = [];
  allUsersCache: User[] = [];
  selectedUser: City | undefined;

  // Propriétés pour l'IA
  aiSuggestions: ReplacementSuggestion[] = [];
  aiExplanations: string[] = [];
  aiBlockedReasons: any[] = [];
  hasAISuggestions = false;
  loadingSuggestions = false;
  noAvailabilityFound = false;

  // Propriétés pour l'agent sélectionné
  selectedUserEvaluation: any = null;
  selectedUserRank: number = 0;

  // NOUVEAU : état agent bloqué sélectionné
  selectedUserBlocked: { name: string; reason: string; rule: string; topSuggestion: any | null } | null = null;

  // NOUVEAU : état agent disponible mais pas optimal
  selectedUserIsNotOptimal: { rank: number; total: number; topSuggestion: any | null } | null = null;

  // Réciprocité
  replacementReciprocity: ReciprocityEntry | null = null; // dette du remplaçant envers l'absent

  // Chatbot
  chatMessages: ChatMessage[] = [];
  chatInput = '';
  showChatbot = false;
  
  // Questions pré-remplies
  quickQuestions: string[] = [
    "Pourquoi ce candidat est-il en première position ?",
    "Quelles sont les règles de la charte ?",
    "Comment est calculé le score ?",
    "Pourquoi cet agent est-il bloqué ?",
    "Quelles sont les limites d'heures supplémentaires ?",
    "Comment fonctionne la gestion des repos ?"
  ];

  // Hublo
  showHubloDialog = false;
  hubloUrl: SafeResourceUrl;

  // Demande intérimaire (email)
  showInterimDialog = false;
  interimAgency = 'ADECCO MEDICAL';
  interimAgencyAddress = '128 Allée des Champs Elysées\n91000 EVRY';
  interimAgencyPhone = '01.60.91.49.70';
  interimEmail = 'evry@adeccomedical.fr';
  interimName = '';
  interimQualification = '';
  interimDiplomaDate = '';
  interimSchedule = '';
  interimNeed = '';
  interimMailSubject = 'CONFIRMATION DE MISSION';
  interimMailBody = '';

  constructor(
    private absenceService: AbsenceService,
    private userService: UserService,
    private serviceService: ServiceService,
    private route: ActivatedRoute,
    private router: Router,
    private messageService: MessageService,
    private replacementAIService: ReplacementAIService,
    private sanitizer: DomSanitizer,
    private reciprocityService: ExchangeReciprocityService,
    private calendarSyncService: CalendarSyncService
  ) {
    this.hubloUrl = this.sanitizer.bypassSecurityTrustResourceUrl('https://ng.hublo.com/admin/login');
  }

  ngOnInit(): void {
    const absenceId = this.route.snapshot.paramMap.get('id');
    console.log('TreatAbsenceComponent: Retrieved absenceId from route:', absenceId);
    if (absenceId) {
      this.loadAbsenceDetails(absenceId);
      setTimeout(() => {
        this.loadAISuggestionsForDropdown(absenceId);
      }, 1500);
    } else {
      console.error('TreatAbsenceComponent: No absenceId provided');
      this.showError("ID de l'absence non fourni");
      this.router.navigate(['/cadre/absence']);
    }
  }

  loadAbsenceDetails(absenceId: string): void {
    console.log('Loading absence details for ID:', absenceId);
    forkJoin([
      this.absenceService.findAbsenceById(absenceId),
      this.userService.getNurses(),
      this.serviceService.findAllServices()
    ]).subscribe({
      next: ([absenceResponse, usersResponse, servicesResponse]) => {
        this.absence = absenceResponse.data || null;
        const allUsers = usersResponse.data || [];
        const allServices = servicesResponse.data || [];

        if (this.absence && (this.absence._id || this.absence.id)) {
          const absenceId = this.absence._id || this.absence.id!;
          this.staff = allUsers.find(user => user._id === this.absence!.staff_id) || null;
          this.replacement = allUsers.find(user => user._id === this.absence!.replacement_id) || null;
          this.service = allServices.find(service => service.id === this.absence!.service_id) || null;

          this.allUsersCache = allUsers;
          console.log('✅ allUsersCache rempli avec', this.allUsersCache.length, 'utilisateurs');

          const absenceServiceId = this.absence.service_id;
          const staffSpecialityId = this.staff?.speciality_id;

          this.users = allUsers
            .filter(user => {
              const hasValidId = !!user._id;
              const isSameService = user.service_id === absenceServiceId;
              const isSameSpeciality = user.speciality_id === staffSpecialityId;
              const isNotStaff = user._id !== this.absence!.staff_id;
              return hasValidId && isSameService && isSameSpeciality && isNotStaff;
            })
            .map(user => ({
              name: `${user.first_name} ${user.last_name}`,
              code: user._id!
            }));

          console.log('Total users available for replacement:', this.users.length);
        } else {
          console.error('No valid absence or missing ID:', this.absence);
          this.showError('Absence non trouvée ou ID manquant');
        }
      },
      error: (err) => {
        console.error('API error for absence ID:', absenceId, err);
        this.showError('Échec du chargement des détails de l\'absence: ' + err.message);
      }
    });
  }

  updateUsersList(): void {
    if (!this.absence || !this.staff || !this.allUsersCache) return;

    console.log('Updating users list for service_id:', this.absence.service_id, 'and speciality_id:', this.staff?.speciality_id);
    console.log('aiBlockedReasons:', this.aiBlockedReasons);

    const absenceServiceId = this.absence.service_id;
    const staffSpecialityId = this.staff?.speciality_id;

    this.users = this.allUsersCache
      .filter(user => {
        const hasValidId = !!user._id;
        const isSameService = user.service_id === absenceServiceId;
        const isSameSpeciality = user.speciality_id === staffSpecialityId;
        const isNotStaff = user._id !== this.absence!.staff_id;
        return hasValidId && isSameService && isSameSpeciality && isNotStaff;
      })
      .map(user => {
        const userId = String(user._id || '').trim().toLowerCase();
        const isBlocked = this.aiBlockedReasons.some(
          (b: any) => String(b.user_id || '').trim().toLowerCase() === userId
        );
        
        console.log(`User ${user.first_name} ${user.last_name} (${user._id}): isBlocked=${isBlocked}`);
        
        return {
          name: isBlocked
            ? `${user.first_name} ${user.last_name} (indisponible)`
            : `${user.first_name} ${user.last_name}`,
          code: user._id!,
          isBlocked: isBlocked
        };
      })
      .sort((a, b) => {
        // Put unavailable agents at the end, sorted alphabetically
        if (a.isBlocked && !b.isBlocked) return 1;
        if (!a.isBlocked && b.isBlocked) return -1;
        return a.name.localeCompare(b.name);
      });

    console.log('Total users available for replacement:', this.users.length);
    console.log('Users with INDISPONIBLE:', this.users.filter(u => u.isBlocked).length);
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? dateString : date.toLocaleDateString('fr-FR');
  }

  getAbsenceDuration(): number {
    // Calculer la durée en heures entre start_hour et end_hour
    if (!this.absence?.start_hour || !this.absence?.end_hour) return 0;
    
    const [startHours, startMinutes] = this.absence.start_hour.split(':').map(Number);
    const [endHours, endMinutes] = this.absence.end_hour.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    const durationMinutes = endTotalMinutes - startTotalMinutes;
    const durationHours = durationMinutes / 60;
    
    return Math.round(durationHours * 10) / 10; // Arrondi à 1 décimale
  }

  getTimeRange(): string {
    // Retourner la plage horaire formatée
    if (!this.absence?.start_hour || !this.absence?.end_hour) return 'N/A';
    return `${this.absence.start_hour} - ${this.absence.end_hour}`;
  }

  approveAbsence(): void {
    if (!this.absence || !(this.absence._id || this.absence.id)) {
      this.showError('Aucune absence sélectionnée ou ID manquant');
      return;
    }

    const absenceId = this.absence._id || this.absence.id!;
    const status = 'Validé par le cadre';
    const replacementId = this.selectedUser ? this.selectedUser.code : this.absence.replacement_id || null;

    this.absenceService.updateAbsence(absenceId, status, replacementId).subscribe({
      next: () => {
        this.showSuccess('Absence approuvée');
        this.calendarSyncService.forceRefresh();
        this.loadAbsenceDetails(absenceId);
      },
      error: (err) => {
        console.error('Erreur lors de l\'approbation:', err);
        this.showError('Échec de l\'approbation de l\'absence');
      }
    });
  }

  refuseAbsence(): void {
    if (!this.absence || !(this.absence._id || this.absence.id)) {
      this.showError('Aucune absence sélectionnée ou ID manquant');
      return;
    }

    const absenceId = this.absence._id || this.absence.id!;
    const status = 'Refusé par le cadre';
    const replacementId = this.selectedUser ? this.selectedUser.code : this.absence.replacement_id || null;

    this.absenceService.updateAbsence(absenceId, status, replacementId).subscribe({
      next: () => {
        this.showSuccess('Absence refusée');
        this.calendarSyncService.forceRefresh();
        this.loadAbsenceDetails(absenceId);
      },
      error: (err) => {
        console.error('Erreur lors du refus:', err);
        this.showError('Échec du refus de l\'absence');
      }
    });
  }

  checkAvailability(): void {
    if (this.absence && (this.absence._id || this.absence.id)) {
      const absenceId = this.absence._id || this.absence.id!;

      if (this.selectedUser) {
        // Vérifier si l'agent est déjà connu comme indisponible
        const selectedId = String(this.selectedUser.code || '').trim().toLowerCase();
        const isKnownBlocked = this.aiBlockedReasons.some(
          (b: any) => String(b.user_id || '').trim().toLowerCase() === selectedId
        );

        if (isKnownBlocked) {
          // Afficher directement les infos de blocage sans rappeler l'API
          const blockedInfo = this.aiBlockedReasons.find(
            (b: any) => String(b.user_id || '').trim().toLowerCase() === selectedId
          );
          this.selectedUserEvaluation = null;
          this.selectedUserIsNotOptimal = null;
          this.selectedUserBlocked = {
            name: this.selectedUser.name.replace(' (indisponible)', ''),
            reason: blockedInfo?.reason || 'Non disponible',
            rule: blockedInfo?.rule || 'unknown',
            topSuggestion: this.aiSuggestions.length > 0 ? this.aiSuggestions[0] : null
          };
          this.showChatbot = true;
          return;
        }

        this.showInfo(`Vérification de la disponibilité de ${this.selectedUser.name}...`);
        this.checkSpecificUserAvailability(absenceId, this.selectedUser.code, this.selectedUser.name);
      } else {
        this.showInfo('Recherche de disponibilités en cours...');
        this.loadAISuggestions(absenceId);
      }

      this.showChatbot = true;
    } else {
      this.showError('Veuillez attendre le chargement des données de l\'absence');
    }
  }

  onUserSelected(event: any): void {
    console.log('Utilisateur sélectionné:', this.selectedUser?.name);
  }

  checkSpecificUserAvailability(absenceId: string, userId: string, userName: string): void {
    this.loadingSuggestions = true;

    // Reset complet de tous les états d'affichage
    this.selectedUserEvaluation = null;
    this.selectedUserBlocked = null;
    this.selectedUserIsNotOptimal = null;
    this.chatMessages = [];
    this.hasAISuggestions = false;

    const cleanUserName = userName.replace(' (indisponible)', '').replace(' - INDISPONIBLE', '');
    console.log('Vérification de disponibilité pour:', cleanUserName, 'userId:', userId);

    this.replacementAIService.evaluateSpecificUser(absenceId, userId).subscribe({
      next: (response) => {
        console.log('Réponse API évaluation utilisateur:', response);
        const data = response.data;
        const userEvaluation = data.user_evaluation;
        const context = data.context;
        const allEvaluations = context.all_evaluations || [];
        const availableSuggestions = context.suggestions || [];

        this.aiSuggestions = availableSuggestions;
        this.aiExplanations = context.explanations || [];

        // FUSION : ne pas écraser aiBlockedReasons existants, ajouter les nouveaux
        const newBlocked: any[] = context.blocked_reasons || [];
        newBlocked.forEach((newEntry: any) => {
          const exists = this.aiBlockedReasons.some(
            (b: any) => String(b.user_id).trim().toLowerCase() === String(newEntry.user_id).trim().toLowerCase()
          );
          if (!exists) this.aiBlockedReasons.push(newEntry);
        });

        this.loadingSuggestions = false;

        if (!userEvaluation.found) {
          this.showError('Utilisateur non trouvé');
          return;
        }

        // Calculer le classement dans le contexte global
        let userRank = allEvaluations.findIndex((e: any) => e.user_id === userId) + 1;
        if (userRank === 0) {
          allEvaluations.push(userEvaluation);
          allEvaluations.sort((a: any, b: any) => b.score - a.score);
          userRank = allEvaluations.findIndex((e: any) => e.user_id === userId) + 1;
        }

        const topSuggestion = availableSuggestions.length > 0 ? availableSuggestions[0] : null;
        const isTopSuggestion = topSuggestion?.user_id === userId;

        console.log('=== DEBUG checkSpecificUserAvailability ===');
        console.log('userEvaluation.is_blocked:', userEvaluation.is_blocked);
        console.log('userRank:', userRank, '/ isTopSuggestion:', isTopSuggestion);

        // Les repos simples (RTT, RH, RJF...) ne sont PAS bloquants - juste un avertissement
        const softBlockRules = ['no_planned_rest'];
        const isSoftBlock = softBlockRules.includes(userEvaluation.blocking_rule);
        const isReallyBlocked = userEvaluation.is_blocked && !isSoftBlock;

        if (isReallyBlocked) {
          // ❌ CAS 1 : Agent BLOQUÉ (règle légale stricte) → bloc rouge dans suggestion IA
          this.selectedUserBlocked = {
            name: cleanUserName,
            reason: userEvaluation.warnings?.[0] || 'Non disponible',
            rule: userEvaluation.blocking_rule || 'unknown',
            topSuggestion: topSuggestion
          };

          // Enrichir aiBlockedReasons si cet agent n'y était pas encore
          const alreadyInBlocked = this.aiBlockedReasons.some(
            (b: any) => String(b.user_id || '').trim().toLowerCase() === String(userId).trim().toLowerCase()
          );
          if (!alreadyInBlocked) {
            this.aiBlockedReasons.push({
              user_id: userId,
              name: cleanUserName,
              reason: userEvaluation.warnings?.[0] || 'Non disponible',
              rule: userEvaluation.blocking_rule || 'unknown',
              score: -1000,
              is_blocked: true
            });
          }

          this.showInfo(`${cleanUserName} n'est pas disponible`);

        } else {
          // ✅ Agent DISPONIBLE (ou repos simple = soft block) → afficher score/classement
          // Si soft block (repos RTT/RH/RJF), ajouter l'avertissement aux warnings
          const warnings = [...(userEvaluation.warnings || [])];
          if (isSoftBlock && userEvaluation.blocking_rule === 'no_planned_rest') {
            const restMsg = warnings.length > 0 ? warnings[0] : 'Repos planifié sur cette période';
            if (!warnings.includes(restMsg)) warnings.unshift(restMsg);
          }

          this.selectedUserEvaluation = {
            user_id: userId,
            name: cleanUserName,
            score: userEvaluation.score,
            reasons: userEvaluation.reasons || [],
            warnings: warnings,
            availability_match: userEvaluation.availability_match || false,
            date_compatibility: userEvaluation.date_compatibility || 0,
            full_coverage: userEvaluation.full_coverage || false
          };
          this.selectedUserRank = userRank;

          // Avertissement si pas le #1
          if (!isTopSuggestion && topSuggestion) {
            this.selectedUserIsNotOptimal = {
              rank: userRank,
              total: allEvaluations.length,
              topSuggestion: topSuggestion
            };
          } else {
            this.selectedUserIsNotOptimal = null;
          }

          if (isSoftBlock) {
            this.showInfo(`${cleanUserName} a un repos planifié — peut quand même être assigné`);
          } else if (!isTopSuggestion && topSuggestion) {
            this.showSuccess(`${cleanUserName} est disponible (Classement: #${userRank}/${allEvaluations.length})`);
          } else {
            this.showSuccess(`${cleanUserName} est la meilleure suggestion (Score: ${userEvaluation.score}/100)`);
          }
        }

        this.updateUsersList();
      },
      error: (error) => {
        console.error('Erreur lors de la vérification:', error);
        this.loadingSuggestions = false;
        this.showError('Erreur lors de la vérification: ' + (error.error?.detail || error.message));
      }
    });
  }

  loadAISuggestionsForDropdown(absenceId: string): void {
    const serviceId = this.absence?.service_id;
    if (!serviceId) return;

    console.log('Chargement des suggestions IA pour marquer les indisponibles...');

    this.replacementAIService.getSuggestions(absenceId, serviceId).subscribe({
      next: (response) => {
        const data = response.data;
        this.aiSuggestions = data.suggestions || [];
        this.aiExplanations = data.explanations || [];
        this.aiBlockedReasons = data.blocked_reasons || [];
        this.hasAISuggestions = data.has_available || false;
        this.noAvailabilityFound = !data.has_available;

        console.log('Suggestions IA chargées pour le dropdown:', {
          suggestions: this.aiSuggestions.length,
          blocked: this.aiBlockedReasons.length
        });

        this.updateUsersList();
      },
      error: (error) => {
        console.error('Erreur lors du chargement des suggestions pour le dropdown:', error);
      }
    });
  }

  loadAISuggestions(absenceId: string): void {
    this.loadingSuggestions = true;
    this.hasAISuggestions = false;
    this.noAvailabilityFound = false;
    this.selectedUserEvaluation = null;
    this.selectedUserBlocked = null;
    this.selectedUserIsNotOptimal = null;
    const serviceId = this.absence?.service_id;

    console.log('Chargement des suggestions IA pour absence:', absenceId, 'service:', serviceId);

    this.replacementAIService.getSuggestions(absenceId, serviceId).subscribe({
      next: (response) => {
        console.log('Réponse API suggestions:', response);
        const data = response.data;
        const allEvaluations = data.all_evaluations || [];
        this.aiSuggestions = data.suggestions || [];
        this.aiExplanations = data.explanations || [];
        this.aiBlockedReasons = data.blocked_reasons || [];
        this.hasAISuggestions = data.has_available || false;
        this.noAvailabilityFound = !data.has_available;
        this.loadingSuggestions = false;

        const summary = data.summary || '';
        const recommendations = data.recommendations || [];
        const totalEvaluated = data.total_evaluated || allEvaluations.length;
        const totalAvailable = data.total_candidates || this.aiSuggestions.length;
        const totalBlocked = data.total_blocked || 0;

        let initialMessage = summary;

        if (this.aiSuggestions.length > 0) {
          initialMessage += `\n\n**Résultat de l'évaluation:**`;
          initialMessage += `\n• ${totalEvaluated} agent(s) évalué(s) au total`;
          initialMessage += `\n• ${totalAvailable} agent(s) disponible(s)`;
          initialMessage += `\n• ${totalBlocked} agent(s) bloqué(s) (conflits avec la charte)`;

          initialMessage += '\n\n**Top 3 des suggestions:**';
          for (let i = 0; i < Math.min(3, this.aiSuggestions.length); i++) {
            const suggestion = this.aiSuggestions[i];
            const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            initialMessage += `\n${emoji} #${i+1} - ${suggestion.name} (Score: ${suggestion.score}/100)`;
          }

          if (this.aiBlockedReasons.length > 0) {
            initialMessage += '\n\n**Agents non disponibles (bloqués par la charte):**';
            for (let i = 0; i < Math.min(5, this.aiBlockedReasons.length); i++) {
              const blocked = this.aiBlockedReasons[i];
              initialMessage += `\n❌ ${blocked.name}: ${blocked.reason}`;
            }
            if (this.aiBlockedReasons.length > 5) {
              initialMessage += `\n... et ${this.aiBlockedReasons.length - 5} autre(s) agent(s) bloqué(s)`;
            }
          }

          initialMessage += '\n\n**Critères d\'évaluation utilisés:**';
          initialMessage += '\n• Disponibilités déclarées par les agents (poids: 50)';
          initialMessage += '\n• Plannings existants - codes réels importés';
          initialMessage += '\n• Règles légales de la charte CHA:';
          initialMessage += '\n  - Repos quotidien 12h minimum (p.20)';
          initialMessage += '\n  - Durée max 48h/semaine (p.19)';
          initialMessage += '\n  - Limites heures sup: 240h/an, 20h/mois (p.21)';
          initialMessage += '\n• Même service (poids: 30)';
          initialMessage += '\n• Métier compatible (poids: 25)';
          initialMessage += '\n• Droits à congés disponibles (poids: 20)';
          initialMessage += '\n• Aucun repos planifié (poids: 20)';
          initialMessage += '\n• Équité des remplacements (poids: 15)';
          initialMessage += '\n• Charge de travail équilibrée (poids: 15)';

          if (recommendations.length > 0) {
            initialMessage += '\n\n**Recommandations:**\n' + recommendations.map((r: string) => `• ${r}`).join('\n');
          }

          this.showSuccess(`${this.aiSuggestions.length} suggestion(s) trouvée(s)`);
        } else {
          initialMessage += `\n\n**${totalBlocked} agent(s) ne peuvent pas remplacer** en raison de conflits avec:`;
          initialMessage += '\n• Plannings existants (déjà en service)';
          initialMessage += '\n• Règles de repos (12h quotidien, 48h/semaine)';
          initialMessage += '\n• Congés/repos planifiés (CA, RTT, RH...)';
          initialMessage += '\n• Limites d\'heures supplémentaires atteintes';

          if (recommendations.length > 0) {
            initialMessage += '\n\n**Solutions alternatives:**\n' + recommendations.map((r: string) => `• ${r}`).join('\n');
          }

          this.showInfo('Aucune disponibilité directe trouvée');
        }

        this.chatMessages = [{
          role: 'assistant',
          content: initialMessage,
          timestamp: new Date()
        }];

        this.updateUsersList();
      },
      error: (error) => {
        console.error('Erreur lors du chargement des suggestions:', error);
        this.loadingSuggestions = false;
        this.noAvailabilityFound = true;
        this.showError('Erreur lors du chargement des suggestions IA: ' + (error.error?.detail || error.message));

        this.chatMessages = [{
          role: 'assistant',
          content: 'Désolé, une erreur s\'est produite lors de la recherche de disponibilités. Veuillez réessayer ou utiliser les alternatives (intérimaire/Hublo).',
          timestamp: new Date()
        }];
      }
    });
  }

  selectUserEvaluation(): void {
    if (this.selectedUserEvaluation) {
      this.selectedUser = {
        name: this.selectedUserEvaluation.name,
        code: this.selectedUserEvaluation.user_id
      };

      const fullUser = this.allUsersCache.find(u => u._id === this.selectedUserEvaluation.user_id);
      if (fullUser) {
        this.replacement = fullUser;
      }

      this.showSuccess(`Agent sélectionné : ${this.selectedUserEvaluation.name}`);
    }
  }

  selectAISuggestion(suggestion: ReplacementSuggestion): void {
    if (!suggestion) return;
    console.log('=== DEBUG selectAISuggestion ===');
    console.log('Suggestion reçue:', suggestion);

    const fullUser = this.allUsersCache.find(u => u._id === suggestion.user_id);

    this.selectedUser = {
      name: suggestion.name,
      code: suggestion.user_id
    };

    if (fullUser) {
      this.replacement = fullUser;
    } else {
      console.error('❌ Utilisateur NON TROUVÉ dans allUsersCache pour user_id:', suggestion.user_id);
    }

    // Reset des états de vérification pour afficher proprement la suggestion sélectionnée
    this.selectedUserBlocked = null;
    this.selectedUserIsNotOptimal = null;
    this.selectedUserEvaluation = null;

    // Vérifier si le remplaçant a une dette de réciprocité envers l'absent
    this.replacementReciprocity = null;
    if (this.staff?._id && suggestion.user_id) {
      this.reciprocityService.checkReciprocity(suggestion.user_id, this.staff._id).subscribe({
        next: (res) => {
          if (res.has_debt) {
            // Le remplaçant doit déjà des heures à l'absent → signaler
            this.replacementReciprocity = {
              id: res.reciprocity_id || '',
              exchange_id: '',
              creditor_id: this.staff!._id!,
              debtor_id: suggestion.user_id,
              hours_owed: res.hours_remaining || 0,
              hours_repaid: 0,
              hours_remaining: res.hours_remaining || 0,
              status: 'pending',
              expires_at: res.expires_at || '',
              repayment_exchanges: [],
            };
          }
        },
        error: () => {}
      });
    }

    this.showSuccess(`Suggestion sélectionnée : ${suggestion.name}`);
  }

  // ============================================================
  // HELPERS pour affichage dans le template HTML
  // ============================================================

  getRuleExplanation(rule: string): string {
    const ruleExplanations: { [key: string]: string } = {
      'no_conflict': 'Conflit de planning — L\'agent est déjà planifié ou absent pendant cette période',
      'daily_rest_compliance': 'Repos quotidien insuffisant — La Charte impose 12h de repos minimum entre deux services (p.20)',
      'weekly_hours_compliance': 'Durée hebdomadaire dépassée — La Charte impose un maximum de 48h sur 7 jours consécutifs (p.19)',
      'overtime_limits': 'Limite d\'heures supplémentaires atteinte — Maximum 240h/an et 20h/mois (Charte p.21)',
      'no_planned_rest': 'Repos planifié (CA ou absence syndicale) — Validation DRH obligatoire (Charte p.19)'
    };
    return ruleExplanations[rule] || 'Règle non respectée';
  }

  getRuleSeverityClass(rule: string): string {
    switch (rule) {
      case 'daily_rest_compliance':
      case 'weekly_hours_compliance':
      case 'overtime_limits':
        return 'rule-legal';
      case 'no_conflict':
        return 'rule-conflict';
      case 'no_planned_rest':
        return 'rule-rest';
      default:
        return 'rule-other';
    }
  }

  getRuleLabel(rule: string): string {
    switch (rule) {
      case 'daily_rest_compliance':
        return 'Repos quotidien (12h)';
      case 'weekly_hours_compliance':
        return 'Durée hebdomadaire (48h max)';
      case 'overtime_limits':
        return 'Limite heures sup';
      case 'no_conflict':
        return 'Conflit planning';
      case 'no_planned_rest':
        return 'Repos planifié';
      default:
        return 'Autre règle';
    }
  }

  // Chatbot
  askQuickQuestion(question: string): void {
    this.chatInput = question;
    this.sendChatMessage();
  }

  sendChatMessage(): void {
    if (!this.chatInput.trim() || !this.absence || !(this.absence._id || this.absence.id)) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: this.chatInput,
      timestamp: new Date()
    };

    this.chatMessages.push(userMessage);
    const message = this.chatInput;
    this.chatInput = '';

    const absenceId = this.absence._id || this.absence.id!;
    this.replacementAIService.chatWithAI(absenceId, message).subscribe({
      next: (response) => {
        const aiMessage: ChatMessage = {
          role: 'assistant',
          content: response.data.response,
          timestamp: new Date()
        };
        this.chatMessages.push(aiMessage);
      },
      error: (error) => {
        console.error('Erreur chat IA:', error);
        this.showError('Erreur de communication avec l\'IA');
      }
    });
  }

  requestInterim(): void {
    if (!this.interimNeed) {
      this.interimNeed = this.computeDefaultInterimNeed();
    }
    if (!this.interimSchedule) {
      this.interimSchedule = this.computeDefaultSchedule();
    }
    this.buildInterimEmail();
    this.showInterimDialog = true;
  }

  requestHublo(): void {
    this.showHubloDialog = true;
  }

  goBack(): void {
    this.router.navigate(['/cadre/absence']);
  }

  private computeDefaultInterimNeed(): string {
    const serviceName = this.service?.name || 'Service à préciser';
    const motif = this.absence?.reason || 'Motif à préciser';
    return `Besoin d'intérimaire pour ${serviceName} (${motif})`;
  }

  private computeDefaultSchedule(): string {
    if (!this.absence) return 'Dates/horaires à préciser';
    return `${this.formatDate(this.absence.start_date)} ${this.absence.start_hour || ''} - ${this.formatDate(this.absence.end_date)} ${this.absence.end_hour || ''}`.trim();
  }

  buildInterimEmail(): void {
    const establishment = 'CH ARPAJON';
    const serviceName = this.service?.name || 'Service à préciser';
    const motif = this.absence?.reason || 'Motif à préciser';
    const name = this.interimName || 'Nom à confirmer';
    const qualif = this.interimQualification || 'Qualification à confirmer';
    const diploma = this.interimDiplomaDate || 'Date de diplôme à confirmer';
    const schedule = this.interimSchedule || 'Dates et horaires à confirmer';

    this.interimMailSubject = `CONFIRMATION DE MISSION - ${serviceName}`;

    const header = [
      this.interimAgency,
      this.interimAgencyAddress,
      `Tél: ${this.interimAgencyPhone}`,
      this.interimEmail,
      'CONFIRMATION DE MISSION',
      ''
    ].join('\n');

    const legal =
      'Conformément à nos Conditions Générales de Prestations, l\'annulation par l\'entreprise utilisatrice d\'une commande servie (le nom de l\'intérimaire étant annoncé) moins de 72h avant le début de la mission ouvre droit à facturation de frais d\'annulation forfaitaires d\'un montant unitaire de 50 euros par mission.';

    const body = [
      'Bonjour,',
      '',
      `Besoin communiqué : ${this.interimNeed || 'À préciser'}`,
      '',
      `Voici le nom des intérimaires qui interviendront dans votre établissement ${establishment} pour le service "${serviceName}" sur le motif "${motif}" :`,
      '',
      'Intérimaire\tQualification\tDate diplôme\tDates et Horaires',
      `${name}\t${qualif}\t${diploma}\t${schedule}`,
      '',
      'Nous restons à votre disposition pour tout complément d\'information.',
      '',
      'Bonne réception,',
      '',
      'Cordialement,',
      '',
      'Votre Agence Adecco Médical',
      '',
      'CERTIFIE ISO 9001-2015'
    ].join('\n');

    this.interimMailBody = [header, legal, '', body].join('\n\n');
  }

  openInterimMail(): void {
    if (!this.interimEmail || !this.interimNeed) {
      this.showInfo('Merci de renseigner une adresse email et le besoin.');
      return;
    }
    this.buildInterimEmail();
    const subject = encodeURIComponent(this.interimMailSubject);
    const body = encodeURIComponent(this.interimMailBody.replace(/\n/g, '\r\n'));
    window.open(`mailto:${this.interimEmail}?subject=${subject}&body=${body}`, '_blank');
  }

  private showSuccess(message: string): void {
    this.messageService.add({ severity: 'success', summary: 'Succès', detail: message });
  }

  private showError(message: string): void {
    this.messageService.add({ severity: 'error', summary: 'Erreur', detail: message });
  }

  private showInfo(message: string): void {
    this.messageService.add({ severity: 'info', summary: 'Information', detail: message });
  }

  getBadgeSeverity(status: string): 'success' | 'info' | 'danger' | 'secondary' | 'warn' {
    switch (status.toLowerCase()) {
      case 'accepté par le remplaçant':
        return 'warn';
      case 'validé par le cadre':
        return 'success';
      case 'en cours':
        return 'info';
      case 'refusé par le remplaçant':
      case 'refusé par le cadre':
        return 'danger';
      default:
        return 'secondary';
    }
  }
}