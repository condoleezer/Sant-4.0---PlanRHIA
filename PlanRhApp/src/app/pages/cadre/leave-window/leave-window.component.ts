import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../../services/auth/auth.service';
import { environment } from '../../../environment/environment';

export interface LeaveWindow {
  _id?: string;
  service_id: string;
  label: string;
  deposit_start: string;   // début de la période de dépôt
  deposit_end: string;     // fin de la période de dépôt
  leave_period_start: string; // début de la période de congés visée
  leave_period_end: string;   // fin de la période de congés visée
  allowed_codes: string[];    // codes autorisés (CA, RTT, RH, RJF, TP...)
  is_open: boolean;
  created_by?: string;
  created_at?: string;
}

@Component({
  selector: 'app-leave-window',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastModule, ButtonModule, CalendarModule, TagModule, DialogModule, TooltipModule],
  templateUrl: './leave-window.component.html',
  styleUrls: ['./leave-window.component.css'],
  providers: [MessageService]
})
export class LeaveWindowComponent implements OnInit {
  private apiUrl = environment.apiUrl;

  windows: LeaveWindow[] = [];
  loading = false;
  showForm = false;
  editingId: string | null = null;
  loggedInUser: any = null;

  // Codes liés aux congés/repos
  availableCodes = [
    { label: 'CA — Congé annuel', value: 'CA' },
    { label: 'RTT — Réduction temps travail', value: 'RTT' },
    { label: 'RH — Repos hebdomadaire', value: 'RH' },
    { label: 'RJF — Repos jour férié', value: 'RJF' },
    { label: 'TP — Temps partiel', value: 'TP' },
    { label: 'CSF — Congé sans solde', value: 'CSF' },
    { label: 'FCJ — Formation continue jour', value: 'FCJ' },
  ];

  form: {
    label: string;
    deposit_start: Date | null;
    deposit_end: Date | null;
    leave_period_start: Date | null;
    leave_period_end: Date | null;
    allowed_codes: string[];
  } = this.emptyForm();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.authService.getUserInfo().subscribe({
      next: (user: any) => {
        this.loggedInUser = user;
        this.loadWindows();
      }
    });
  }

  emptyForm() {
    return {
      label: '',
      deposit_start: null as Date | null,
      deposit_end: null as Date | null,
      leave_period_start: null as Date | null,
      leave_period_end: null as Date | null,
      allowed_codes: ['CA'] as string[]
    };
  }

  loadWindows(): void {
    this.loading = true;
    const serviceId = this.loggedInUser?.service_id || '';
    this.http.get<any>(`${this.apiUrl}/leave-windows?service_id=${serviceId}`).subscribe({
      next: (res) => {
        this.windows = res.data || [];
        this.loading = false;
        this.checkAndSendReminders();
      },
      error: () => { this.loading = false; }
    });
  }

  checkAndSendReminders(): void {
    const today = new Date().toISOString().split('T')[0];
    for (const win of this.windows) {
      if (!win.is_open || !win._id) continue;
      const end = new Date(win.deposit_end);
      const daysLeft = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= 7) {
        // N'envoyer qu'une fois par jour par fenêtre
        const key = `reminder_sent_${win._id}_${today}`;
        if (!localStorage.getItem(key)) {
          this.http.post<any>(`${this.apiUrl}/leave-windows/${win._id}/remind`, {}).subscribe({
            next: () => localStorage.setItem(key, '1')
          });
        }
      }
    }
  }

  openForm(win?: LeaveWindow): void {
    if (win) {
      this.editingId = win._id || null;
      this.form = {
        label: win.label,
        deposit_start: new Date(win.deposit_start),
        deposit_end: new Date(win.deposit_end),
        leave_period_start: new Date(win.leave_period_start),
        leave_period_end: new Date(win.leave_period_end),
        allowed_codes: [...win.allowed_codes]
      };
    } else {
      this.editingId = null;
      this.form = this.emptyForm();
    }
    this.showForm = true;
  }

  toggleCode(code: string): void {
    const idx = this.form.allowed_codes.indexOf(code);
    if (idx >= 0) {
      this.form.allowed_codes.splice(idx, 1);
    } else {
      this.form.allowed_codes.push(code);
    }
  }

  isCodeSelected(code: string): boolean {
    return this.form.allowed_codes.includes(code);
  }

  fmt(d: Date | null): string {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  save(): void {
    if (!this.form.label || !this.form.deposit_start || !this.form.deposit_end) {
      this.messageService.add({ severity: 'warn', summary: 'Attention', detail: 'Tous les champs sont requis' });
      return;
    }
    if (this.form.allowed_codes.length === 0) {
      this.messageService.add({ severity: 'warn', summary: 'Attention', detail: 'Sélectionnez au moins un code' });
      return;
    }

    const payload: LeaveWindow = {
      service_id: this.loggedInUser?.service_id || '',
      label: this.form.label,
      deposit_start: this.fmt(this.form.deposit_start),
      deposit_end: this.fmt(this.form.deposit_end),
      leave_period_start: this.fmt(this.form.deposit_start),
      leave_period_end: this.fmt(this.form.deposit_end),
      allowed_codes: this.form.allowed_codes,
      is_open: true,
      created_by: this.loggedInUser?._id
    };

    const req = this.editingId
      ? this.http.put<any>(`${this.apiUrl}/leave-windows/${this.editingId}`, payload)
      : this.http.post<any>(`${this.apiUrl}/leave-windows`, payload);

    req.subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Succès', detail: this.editingId ? 'Fenêtre mise à jour' : 'Fenêtre créée' });
        this.showForm = false;
        this.loadWindows();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: err?.error?.detail || 'Erreur lors de la sauvegarde' });
      }
    });
  }

  toggleOpen(win: LeaveWindow): void {
    this.http.put<any>(`${this.apiUrl}/leave-windows/${win._id}`, { ...win, is_open: !win.is_open }).subscribe({
      next: () => {
        win.is_open = !win.is_open;
        this.messageService.add({
          severity: win.is_open ? 'success' : 'warn',
          summary: win.is_open ? 'Ouverte' : 'Fermée',
          detail: `Fenêtre "${win.label}" ${win.is_open ? 'ouverte' : 'fermée'}`
        });
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de modifier le statut' })
    });
  }

  extendDeposit(win: LeaveWindow): void {
    // Étendre la date de fin de dépôt de 7 jours
    const current = new Date(win.deposit_end);
    current.setDate(current.getDate() + 7);
    const newEnd = this.fmt(current);
    this.http.put<any>(`${this.apiUrl}/leave-windows/${win._id}`, { ...win, deposit_end: newEnd }).subscribe({
      next: () => {
        win.deposit_end = newEnd;
        this.messageService.add({ severity: 'success', summary: 'Étendue', detail: `Dépôt prolongé jusqu'au ${this.formatDate(newEnd)}` });
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible d\'étendre' })
    });
  }

  deleteWindow(win: LeaveWindow): void {
    if (!confirm(`Supprimer la fenêtre "${win.label}" ?`)) return;
    this.http.delete<any>(`${this.apiUrl}/leave-windows/${win._id}`).subscribe({
      next: () => {
        this.windows = this.windows.filter(w => w._id !== win._id);
        this.messageService.add({ severity: 'success', summary: 'Supprimée', detail: 'Fenêtre supprimée' });
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de supprimer' })
    });
  }

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('fr-FR');
  }

  getStatusSeverity(win: LeaveWindow): 'success' | 'warn' | 'secondary' {
    if (!win.is_open) return 'secondary';
    const today = new Date().toISOString().split('T')[0];
    if (today >= win.deposit_start && today <= win.deposit_end) return 'success';
    return 'warn';
  }

  getStatusLabel(win: LeaveWindow): string {
    if (!win.is_open) return 'Fermée';
    const today = new Date().toISOString().split('T')[0];
    if (today < win.deposit_start) return 'À venir';
    if (today > win.deposit_end) return 'Expirée';
    return 'Ouverte';
  }
}
