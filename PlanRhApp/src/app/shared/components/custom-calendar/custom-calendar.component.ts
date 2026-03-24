import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: 'availability' | 'planning';
  status: string;
  color: string;
  timeRange: string;
}

@Component({
  selector: 'app-custom-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './custom-calendar.component.html',
  styleUrls: ['./custom-calendar.component.css']
})
export class CustomCalendarComponent implements OnInit {
  @Input() selectedDate: Date | null = null;
  @Input() showWeekNumbers: boolean = true;
  @Input() showButtonBar: boolean = false;
  @Input() events: CalendarEvent[] = [];
  @Output() dateSelect = new EventEmitter<Date>();
  @Output() proposalClick = new EventEmitter<Date>();
  @Output() monthChange = new EventEmitter<Date>();

  currentDate = new Date();
  calendarDays: Date[] = [];
  weekDays = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  
  // Options d'affichage (conservé pour compatibilité)
  displayMode: 'monthly' | 'weekly' | 'daily' = 'monthly';
  monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  ngOnInit() {
    this.generateCalendarDays();
  }

  get currentMonth(): string {
    return `${this.monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
  }

  generateCalendarDays() {
    this.calendarDays = [];
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    // Premier jour du mois
    const firstDay = new Date(year, month, 1);
    // Dernier jour du mois
    const lastDay = new Date(year, month + 1, 0);
    
    // Commencer au lundi de la semaine du premier jour
    const startDate = new Date(firstDay);
    const dayOfWeek = firstDay.getDay(); // 0 = dimanche, 1 = lundi, etc.
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Ajuster pour commencer au lundi
    startDate.setDate(firstDay.getDate() + mondayOffset);
    
    // Générer 42 jours (6 semaines)
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      this.calendarDays.push(date);
    }
  }

  getWeeks(): Date[][] {
    const weeks: Date[][] = [];
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    // Premier jour du mois
    const firstDay = new Date(year, month, 1);
    firstDay.setHours(0, 0, 0, 0); // Normaliser à minuit
    
    // Commencer au lundi de la semaine du premier jour
    const startDate = new Date(firstDay);
    const dayOfWeek = firstDay.getDay(); // 0 = dimanche, 1 = lundi, etc.
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Ajuster pour commencer le lundi
    startDate.setDate(startDate.getDate() + mondayOffset);
    startDate.setHours(0, 0, 0, 0); // Normaliser à minuit
    
    // Générer 6 semaines
    for (let week = 0; week < 6; week++) {
      const weekDates: Date[] = [];
      for (let day = 0; day < 7; day++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + (week * 7) + day);
        date.setHours(0, 0, 0, 0); // Normaliser à minuit
        weekDates.push(date);
      }
      weeks.push(weekDates);
    }
    
    return weeks;
  }

  previousMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendarDays();
    this.monthChange.emit(this.currentDate);
  }

  nextMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendarDays();
    this.monthChange.emit(this.currentDate);
  }

  selectDate(date: Date | null) {
    this.selectedDate = date;
    if (date) {
      this.dateSelect.emit(date);
    }
  }

  clearSelection() {
    this.selectedDate = null;
  }

  selectToday() {
    this.selectDate(new Date());
  }

  isSelected(date: Date): boolean {
    if (!this.selectedDate) return false;
    // Normaliser les dates à minuit pour la comparaison
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    const normalizedSelected = new Date(this.selectedDate);
    normalizedSelected.setHours(0, 0, 0, 0);
    return normalizedDate.getTime() === normalizedSelected.getTime();
  }

  isToday(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    return normalizedDate.getTime() === today.getTime();
  }

  isCurrentMonth(date: Date): boolean {
    return date.getMonth() === this.currentDate.getMonth();
  }

  getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  // Méthodes pour gérer les événements
  getEventsForDate(date: Date): CalendarEvent[] {
    // Normaliser la date à minuit pour la comparaison
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    
    return this.getFilteredEvents().filter(event => {
      // Normaliser la date de l'événement à minuit
      const normalizedEventDate = new Date(event.date);
      normalizedEventDate.setHours(0, 0, 0, 0);
      
      // Comparer les dates normalisées
      return normalizedEventDate.getTime() === normalizedDate.getTime();
    });
  }

  hasEvents(date: Date): boolean {
    return this.getEventsForDate(date).length > 0;
  }

  getEventColor(date: Date): string {
    const events = this.getEventsForDate(date);
    if (events.length === 0) return '';
    return events[0].color;
  }

  getEventTooltip(date: Date): string {
    const events = this.getEventsForDate(date);
    if (events.length === 0) return '';
    
    return events.map(event => `${event.title}`).join('\n');
  }

  // Méthodes pour les propositions de disponibilité
  canProposeAvailability(date: Date): boolean {
    // Ne pas proposer pour les jours passés ou les jours avec événements déjà validés
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Normaliser la date passée en paramètre
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    
    if (normalizedDate < today) return false;
    if (!this.isCurrentMonth(normalizedDate)) return false;
    
    const events = this.getEventsForDate(normalizedDate);
    const hasValidatedEvent = events.some(event => event.status === 'validé');
    
    return !hasValidatedEvent;
  }

  hasProposal(date: Date): boolean {
    const events = this.getEventsForDate(date);
    return events.some(event => event.status === 'proposé');
  }

  hasPendingRequest(date: Date): boolean {
    const events = this.getEventsForDate(date);
    return events.some(event => event.status === 'en_attente');
  }

  getPendingActivityCode(date: Date): string {
    const events = this.getEventsForDate(date);
    const pending = events.find(event => event.status === 'en_attente');
    return pending ? (pending.title.split(' ')[0]) : '';
  }

  getPendingColor(date: Date): string {
    const events = this.getEventsForDate(date);
    const pending = events.find(event => event.status === 'en_attente');
    return pending ? pending.color : '';
  }

  proposeAvailability(date: Date, event: Event): void {
    event.stopPropagation();
    this.proposalClick.emit(date);
  }

  getFilteredEvents(): CalendarEvent[] {
    return this.events;
  }

  getActivityCode(date: Date): string {
    const events = this.getEventsForDate(date);
    if (events.length === 0) return '';
    
    // Extraire le code d'activité du titre (format: "CODE - horaires")
    const title = events[0].title;
    const codePart = title.split(' - ')[0];
    return codePart || '';
  }
}