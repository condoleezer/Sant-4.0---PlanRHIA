import { Injectable } from '@angular/core';
import { Planning } from '../../models/planning';
import { Availability } from '../../models/availability';
import { CalendarEvent } from '../../shared/components/custom-calendar/custom-calendar.component';

/**
 * Service pour gérer la priorité des événements calendrier
 * 
 * Hiérarchie de priorité :
 * 1. Planning validé par cadre (priorité MAX)
 * 2. Disponibilité validée
 * 3. Disponibilité proposée
 * 4. Planning par défaut (contrat)
 */
@Injectable({
  providedIn: 'root'
})
export class PlanningPriorityService {

  constructor() {}

  /**
   * Détermine quel événement afficher selon la priorité
   * @param plannings Liste des plannings
   * @param availabilities Liste des disponibilités
   * @param date Date à vérifier (format YYYY-MM-DD)
   * @returns L'événement à afficher ou null
   */
  getDisplayEvent(
    plannings: Planning[],
    availabilities: Availability[],
    date: string
  ): CalendarEvent | null {
    // Filtrer par date - normaliser les dates pour la comparaison
    const datePlannings = plannings.filter(p => {
      // Normaliser la date du planning
      let planningDate = p.date;
      if (typeof planningDate === 'object' && planningDate !== null) {
        // Si c'est un objet Date
        const d = new Date(planningDate);
        planningDate = d.toISOString().split('T')[0];
      } else if (typeof planningDate === 'string') {
        // Si c'est déjà une string, s'assurer qu'elle est au bon format
        planningDate = planningDate.split('T')[0];
      }
      return planningDate === date;
    });
    
    const dateAvailabilities = availabilities.filter(a => {
      let availDate = a.date;
      if (typeof availDate === 'object' && availDate !== null) {
        const d = new Date(availDate);
        availDate = d.toISOString().split('T')[0];
      } else if (typeof availDate === 'string') {
        availDate = availDate.split('T')[0];
      }
      return availDate === date;
    });

    // 1. Planning validé par cadre (priorité MAX)
    const validatedPlanning = datePlannings.find(p => 
      ((p as any).status === 'validé' || (p as any).validated_by) &&
      (p as any).status !== 'en_attente' &&
      (p as any).status !== 'refusé'
    );
    
    if (validatedPlanning) {
      return this.mapPlanningToEvent(validatedPlanning);
    }

    // 1.5. Planning en attente de validation (afficher avec statut spécial)
    const pendingPlanning = datePlannings.find(p => (p as any).status === 'en_attente');
    if (pendingPlanning) {
      return this.mapPlanningToEvent(pendingPlanning, 'en_attente');
    }

    // 2. Disponibilité validée
    const validatedAvailability = dateAvailabilities.find(a => a.status === 'validé');
    if (validatedAvailability) {
      return this.mapAvailabilityToEvent(validatedAvailability);
    }

    // 3. Disponibilité proposée
    const proposedAvailability = dateAvailabilities.find(a => a.status === 'proposé');
    if (proposedAvailability) {
      return this.mapAvailabilityToEvent(proposedAvailability);
    }

    // 4. Disponibilité refusée (ne pas afficher)
    // Si seulement des disponibilités refusées, ne rien afficher

    return null;
  }

  /**
   * Vérifie si une disponibilité peut être affichée (pas de planning validé)
   * @param plannings Liste des plannings
   * @param date Date à vérifier
   * @returns true si la disponibilité peut être affichée
   */
  canShowAvailability(plannings: Planning[], date: string): boolean {
    const datePlannings = plannings.filter(p => p.date === date);
    // Si un planning validé existe, ne pas afficher la disponibilité
    return !datePlannings.some(p => 
      (p as any).validated_by || 
      (p as any).status === 'validé' ||
      p.activity_code
    );
  }

  /**
   * Mappe un Planning vers un CalendarEvent
   */
  private mapPlanningToEvent(planning: Planning | any, overrideStatus?: string): CalendarEvent {
    const eventDate = this.parseDate(planning.date);
    const planningAny = planning as any;
    const status = overrideStatus || planningAny.status || 'validé';
    
    // Titre différent selon le statut
    let title = `${planning.activity_code || 'Planning'}`;
    if (status === 'en_attente') {
      title = `${planning.activity_code} (En attente)`;
    }
    
    const color = this.getActivityColor(planning.activity_code || 'RH');
    
    // Log pour debug
    if (status === 'en_attente') {
      console.log(`🎨 Planning en attente - Code: ${planning.activity_code}, Couleur: ${color}`);
    }
    
    return {
      id: planningAny._id || planningAny.id || '',
      title,
      date: eventDate,
      type: 'planning',
      status: status as any,
      timeRange: planning.plage_horaire || '08:00-17:00',
      color: color
    };
  }

  /**
   * Mappe une Availability vers un CalendarEvent
   */
  private mapAvailabilityToEvent(availability: Availability | any): CalendarEvent {
    const eventDate = this.parseDate(availability.date);
    const availabilityAny = availability as any;
    
    return {
      id: availabilityAny._id || availabilityAny.id || '',
      title: `Disponibilité (${availability.status})`,
      date: eventDate,
      type: 'availability',
      status: availability.status,
      timeRange: `${availability.start_time}-${availability.end_time}`,
      color: this.getStatusColor(availability.status)
    };
  }

  /**
   * Parse une date vers un Date object (gère string, Date, et autres formats)
   */
  private parseDate(dateInput: any): Date {
    if (!dateInput) {
      return new Date();
    }
    
    // Si c'est déjà un objet Date
    if (dateInput instanceof Date) {
      const date = new Date(dateInput);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    
    // Si c'est un string
    if (typeof dateInput === 'string') {
      const dateStr = dateInput.split('T')[0]; // Enlever la partie heure si présente
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    
    // Si c'est un objet avec des propriétés (format MongoDB)
    if (typeof dateInput === 'object' && dateInput !== null) {
      const date = new Date(dateInput);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    
    // Fallback
    return new Date();
  }

  /**
   * Retourne la couleur selon le code d'activité
   */
  private getActivityColor(activityCode: string): string {
    switch (activityCode) {
      // Codes jour
      case 'J02': return '#3b82f6'; // Bleu
      case 'J1': return '#10b981'; // Vert
      case 'JB': return '#f59e0b'; // Orange
      // Codes matin
      case 'M06': return '#fbbf24'; // Jaune
      case 'M13': return '#f97316'; // Orange foncé
      case 'M15': return '#fb923c'; // Orange clair
      // Codes soir/nuit
      case 'S07': return '#8b5cf6'; // Violet
      case 'Nsr': return '#6366f1'; // Indigo
      case 'Nsr3': return '#818cf8'; // Indigo clair
      case 'Nld': return '#4f46e5'; // Indigo foncé
      // Repos et congés
      case 'RH': return '#6b7280'; // Gris
      case 'RJF': return '#9ca3af'; // Gris clair
      case 'CA': return '#10b981'; // Vert
      case 'RTT': return '#14b8a6'; // Teal
      // Heures et formations
      case 'HS-1': return '#06b6d4'; // Cyan
      case 'H-': return '#ef4444'; // Rouge
      case 'FCJ': return '#ec4899'; // Rose
      case 'TP': return '#a855f7'; // Violet clair
      // Autres
      case '?': return '#94a3b8'; // Gris bleu
      default: return '#6b7280';
    }
  }

  /**
   * Retourne la couleur selon le statut
   */
  private getStatusColor(status: string): string {
    switch (status) {
      case 'validé': return '#10b981'; // Vert
      case 'proposé': return '#f59e0b'; // Orange
      case 'refusé': return '#ef4444'; // Rouge
      default: return '#6b7280'; // Gris
    }
  }
}

