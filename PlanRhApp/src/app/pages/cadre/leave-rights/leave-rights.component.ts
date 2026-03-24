import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { TimeAccountService } from '../../../services/time-account/time-account.service';
import { AuthService } from '../../../services/auth/auth.service';
import { LeaveRightsSummary } from '../../../models/time-account';

interface RightsRow {
  label: string;
  remaining: string;
  taken: string;
  isSubRow?: boolean;
}

@Component({
  selector: 'app-leave-rights',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    CalendarModule,
    TableModule,
    ToastModule,
    ProgressSpinnerModule
  ],
  templateUrl: './leave-rights.component.html',
  styleUrls: ['./leave-rights.component.css'],
  providers: [MessageService]
})
export class LeaveRightsComponent implements OnInit {
  leaveRights: LeaveRightsSummary | null = null;
  loading = false;
  referenceDate: Date = new Date();
  maxDate: Date = new Date();
  currentUserId: string = '';
  rightsRows: RightsRow[] = [];

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
        this.loadLeaveRights();
      },
      error: (error) => {
        console.error('Erreur lors du chargement de l\'utilisateur:', error);
        this.showError('Impossible de charger les informations utilisateur');
      }
    });
  }

  loadLeaveRights(): void {
    if (!this.currentUserId) {
      return;
    }

    this.loading = true;
    const dateStr = this.formatDate(this.referenceDate);

    // Timeout de 30 secondes
    const timeout = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.showError('Le chargement prend trop de temps. Veuillez réessayer.');
      }
    }, 30000);

    this.timeAccountService.getLeaveRightsSummary(this.currentUserId, dateStr).subscribe({
      next: (data) => {
        clearTimeout(timeout);
        this.leaveRights = data;
        this.buildRightsRows();
        this.loading = false;
      },
      error: (error) => {
        clearTimeout(timeout);
        console.error('Erreur lors du chargement de la synthèse des droits:', error);
        // Si 404, essayer de calculer
        if (error.status === 404) {
          this.calculateLeaveRights();
        } else {
          this.loading = false;
          const errorMessage = error.error?.detail || error.message || 'Impossible de charger la synthèse des droits';
          this.showError(`Erreur: ${errorMessage}`);
        }
      }
    });
  }

  calculateLeaveRights(): void {
    if (!this.currentUserId) {
      return;
    }

    this.loading = true;
    const dateStr = this.formatDate(this.referenceDate);

    // Timeout de 60 secondes pour le calcul
    const timeout = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.showError('Le calcul prend trop de temps. Cela peut être dû à un grand nombre de données. Veuillez réessayer.');
      }
    }, 60000);

    this.timeAccountService.calculateLeaveRights(this.currentUserId, dateStr).subscribe({
      next: (data) => {
        clearTimeout(timeout);
        this.leaveRights = data;
        this.buildRightsRows();
        this.loading = false;
        this.showSuccess('Synthèse des droits calculée avec succès');
      },
      error: (error) => {
        clearTimeout(timeout);
        console.error('Erreur lors du calcul de la synthèse des droits:', error);
        this.loading = false;
        const errorMessage = error.error?.detail || error.message || 'Impossible de calculer la synthèse des droits';
        this.showError(`Erreur lors du calcul: ${errorMessage}`);
      }
    });
  }

  buildRightsRows(): void {
    if (!this.leaveRights) {
      return;
    }

    this.rightsRows = [];

    const rights = this.leaveRights.rights;

    // Congés Annuels (CA)
    this.rightsRows.push({
      label: 'Congés Annuels (CA)',
      remaining: this.formatDays(rights.annual_leave.remaining_before_dec31),
      taken: this.formatDays(rights.annual_leave.taken_days)
    });

    // Solde CA à consommer avant le 15/05
    this.rightsRows.push({
      label: 'Solde CA à consommer avant le 15/05 de l\'année en cours',
      remaining: this.formatDays(rights.annual_leave.remaining_before_may15),
      taken: '',
      isSubRow: true
    });

    // Solde CA à consommer avant le 31/12
    this.rightsRows.push({
      label: 'Solde CA à consommer avant le 31/12 de l\'année en cours, avec possibilité d\'en reporter 5 jusqu\'au 15/05 de l\'année suivante',
      remaining: this.formatDays(rights.annual_leave.remaining_before_dec31),
      taken: this.formatDays(rights.annual_leave.carryover_days),
      isSubRow: true
    });

    // RTT
    this.rightsRows.push({
      label: 'RTT',
      remaining: this.formatDays(rights.rtt.remaining_days),
      taken: this.formatDays(rights.rtt.taken_days)
    });

    // Jours locaux exceptionnels
    if (rights.local_exceptional_days.jm_days > 0 || rights.local_exceptional_days.jfo_days > 0) {
      this.rightsRows.push({
        label: 'Jours locaux exceptionnels',
        remaining: '',
        taken: ''
      });

      if (rights.local_exceptional_days.jm_days > 0) {
        this.rightsRows.push({
          label: 'JM (≥6 mois de présence)',
          remaining: this.formatDays(rights.local_exceptional_days.jm_days),
          taken: '',
          isSubRow: true
        });
      }

      if (rights.local_exceptional_days.jfo_days > 0) {
        this.rightsRows.push({
          label: 'JFo (présence en septembre)',
          remaining: this.formatDays(rights.local_exceptional_days.jfo_days),
          taken: '',
          isSubRow: true
        });
      }
    }

    // Repos compensateurs
    if (rights.compensatory_rest.total_days > 0) {
      this.rightsRows.push({
        label: 'Repos compensateurs (≥20 dimanches/fériés travaillés)',
        remaining: this.formatDays(rights.compensatory_rest.remaining_days),
        taken: this.formatDays(rights.compensatory_rest.taken_days)
      });
    }
  }

  onDateChange(): void {
    this.loadLeaveRights();
  }

  onRefresh(): void {
    this.calculateLeaveRights();
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDays(days: number): string {
    if (days === 0) {
      return '0j00';
    }
    const wholeDays = Math.floor(days);
    const hours = Math.round((days - wholeDays) * 8);
    return `${wholeDays}j${String(hours).padStart(2, '0')}`;
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

