import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { TimeAccountService } from '../../../services/time-account/time-account.service';
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
    ProgressSpinnerModule
  ],
  templateUrl: './time-accounts.component.html',
  styleUrls: ['./time-accounts.component.css'],
  providers: [MessageService]
})
export class TimeAccountsComponent implements OnInit {
  timeAccount: TimeAccount | null = null;
  loading = false;
  referenceDate: Date = new Date();
  maxDate: Date = new Date();
  currentUserId: string = '';

  constructor(
    private timeAccountService: TimeAccountService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  loadCurrentUser(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: any) => {
        this.currentUserId = user._id || user.id;
        this.loadTimeAccounts();
      },
      error: (error) => {
        console.error('Erreur lors du chargement de l\'utilisateur:', error);
        this.showError('Impossible de charger les informations utilisateur');
      }
    });
  }

  loadTimeAccounts(): void {
    if (!this.currentUserId) {
      return;
    }

    this.loading = true;
    const dateStr = this.formatDate(this.referenceDate);

    // Timeout de 30 secondes pour éviter que ça rame indéfiniment
    const timeout = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.showError('Le calcul prend trop de temps. Veuillez réessayer ou contacter le support.');
      }
    }, 30000);

    this.timeAccountService.getTimeAccounts(this.currentUserId, dateStr).subscribe({
      next: (data) => {
        clearTimeout(timeout);
        this.timeAccount = data;
        this.loading = false;
      },
      error: (error) => {
        clearTimeout(timeout);
        console.error('Erreur lors du chargement des comptes de temps:', error);
        // Si 404, essayer de calculer
        if (error.status === 404) {
          this.calculateTimeAccounts();
        } else {
          this.loading = false;
          const errorMessage = error.error?.detail || error.message || 'Impossible de charger les comptes de temps';
          this.showError(`Erreur: ${errorMessage}`);
        }
      }
    });
  }

  calculateTimeAccounts(): void {
    if (!this.currentUserId) {
      return;
    }

    this.loading = true;
    const dateStr = this.formatDate(this.referenceDate);

    // Timeout de 60 secondes pour le calcul (plus long car c'est un calcul)
    const timeout = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.showError('Le calcul prend trop de temps. Cela peut être dû à un grand nombre de données. Veuillez réessayer.');
      }
    }, 60000);

    this.timeAccountService.calculateTimeAccounts(this.currentUserId, dateStr).subscribe({
      next: (data) => {
        clearTimeout(timeout);
        this.timeAccount = data;
        this.loading = false;
        this.showSuccess('Comptes de temps calculés avec succès');
      },
      error: (error) => {
        clearTimeout(timeout);
        console.error('Erreur lors du calcul des comptes de temps:', error);
        this.loading = false;
        const errorMessage = error.error?.detail || error.message || 'Impossible de calculer les comptes de temps';
        this.showError(`Erreur lors du calcul: ${errorMessage}`);
      }
    });
  }

  onDateChange(): void {
    this.loadTimeAccounts();
  }

  onRefresh(): void {
    this.calculateTimeAccounts();
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDays(days: number): string {
    if (days === 0) {
      return '0j';
    }
    const wholeDays = Math.floor(days);
    const hours = Math.round((days - wholeDays) * 8);
    if (hours === 0) {
      return `${wholeDays}j`;
    }
    return `${wholeDays}j${hours}h`;
  }

  showSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Succès',
      detail: message
    });
  }

  showError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erreur',
      detail: message
    });
  }
}

