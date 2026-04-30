import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DropdownModule } from 'primeng/dropdown';
import { MessageService } from 'primeng/api';
import { TimeAccountService } from '../../../services/time-account/time-account.service';
import { AlertsRttService, MyRttSummary } from '../../../services/alerts-rtt/alerts-rtt.service';
import { AuthService } from '../../../services/auth/auth.service';
import { TimeAccount } from '../../../models/time-account';

@Component({
  selector: 'app-time-accounts',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    CalendarModule,
    ToastModule,
    ProgressSpinnerModule,
    DropdownModule
  ],
  templateUrl: './time-accounts.component.html',
  styleUrls: ['./time-accounts.component.css'],
  providers: [MessageService]
})
export class TimeAccountsComponent implements OnInit {
  timeAccount: TimeAccount | null = null;
  hourlyBalance: any = null;
  loading = false;
  referenceDate: Date = new Date();
  maxDate: Date = new Date();
  currentUserId: string = '';

  // Synthèse annuelle RTT
  rttSummary: MyRttSummary | null = null;
  rttLoading = false;
  rttError = false;
  selectedRttYear: number = new Date().getFullYear();
  availableYears: { label: string; value: number }[] = [];

  constructor(
    private timeAccountService: TimeAccountService,
    private alertsRttService: AlertsRttService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.buildYearOptions();
    this.loadCurrentUser();
  }

  buildYearOptions(): void {
    const current = new Date().getFullYear();
    this.availableYears = [current - 1, current].map(y => ({ label: String(y), value: y }));
  }

  loadCurrentUser(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: any) => {
        this.currentUserId = user._id || user.id;
        this.loadTimeAccounts();
        this.loadHourlyBalance();
        this.loadRttSummary();
      },
      error: () => this.showError('Impossible de charger les informations utilisateur')
    });
  }

  loadHourlyBalance(): void {
    if (!this.currentUserId) return;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    this.timeAccountService.getHourlyBalance(this.currentUserId, today.getFullYear(), dateStr).subscribe({
      next: (data) => { this.hourlyBalance = data; },
      error: () => {}
    });
  }

  getSemiDash(value: number, max: number): string {
    const arcLength = 157;
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    return `${pct * arcLength} ${arcLength}`;
  }

  getAbsBalance(): number {
    return this.hourlyBalance ? Math.abs(this.hourlyBalance.balance) : 0;
  }

  loadRttSummary(): void {
    if (!this.currentUserId) return;
    this.rttLoading = true;
    this.rttError = false;
    this.rttSummary = null;
    this.alertsRttService.getMyRttSummary(this.currentUserId, this.selectedRttYear).subscribe({
      next: (data) => {
        this.rttSummary = data;
        this.rttLoading = false;
      },
      error: (err) => {
        console.error('[RTT] Erreur chargement synthèse annuelle:', err);
        this.rttLoading = false;
        this.rttError = true;
      }
    });
  }

  onRttYearChange(): void {
    this.loadRttSummary();
  }

  getBarWidth(hours: number, threshold: number): string {
    const max = Math.max(threshold * 1.5, hours);
    return `${Math.min((hours / max) * 100, 100)}%`;
  }

  getBarColor(item: any): string {
    if (!item.has_data) return '#e2e8f0';
    if (item.alert) return '#ef4444';
    if (item.overtime_hours > 0) return '#f59e0b';
    return '#10b981';
  }

  getThresholdLeft(threshold: number, hours: number): string {
    const max = Math.max(threshold * 1.5, hours);
    return `${Math.min((threshold / max) * 100, 100)}%`;
  }

  loadTimeAccounts(): void {
    if (!this.currentUserId) return;
    this.loading = true;
    const dateStr = this.formatDate(this.referenceDate);
    this.timeAccountService.getTimeAccounts(this.currentUserId, dateStr).subscribe({
      next: (data) => { this.timeAccount = data; this.loading = false; },
      error: (error) => {
        if (error.status === 404) {
          this.calculateTimeAccounts();
        } else {
          this.loading = false;
          this.showError(error.error?.detail || 'Impossible de charger les comptes de temps');
        }
      }
    });
  }

  calculateTimeAccounts(): void {
    if (!this.currentUserId) return;
    this.loading = true;
    const dateStr = this.formatDate(this.referenceDate);
    this.timeAccountService.calculateTimeAccounts(this.currentUserId, dateStr).subscribe({
      next: (data) => { this.timeAccount = data; this.loading = false; },
      error: (error) => {
        this.loading = false;
        this.showError(error.error?.detail || 'Impossible de calculer les comptes de temps');
      }
    });
  }

  onDateChange(): void {
    this.loadTimeAccounts();
  }

  onRefresh(): void {
    this.calculateTimeAccounts();
    this.loadRttSummary();
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDays(days: number): string {
    if (days === 0) return '0j';
    const wholeDays = Math.floor(days);
    const hours = Math.round((days - wholeDays) * 8);
    if (hours === 0) return `${wholeDays}j`;
    return `${wholeDays}j${hours}h`;
  }

  formatHours(hours: number): string {
    if (!hours || hours === 0) return '0h';
    return `${hours}h`;
  }

  getRttSuggested(totalHours: number): number {
    return Math.max(1, Math.floor(totalHours / 7));
  }

  showSuccess(message: string): void {
    this.messageService.add({ severity: 'success', summary: 'Succès', detail: message });
  }

  showError(message: string): void {
    this.messageService.add({ severity: 'error', summary: 'Erreur', detail: message });
  }
}
