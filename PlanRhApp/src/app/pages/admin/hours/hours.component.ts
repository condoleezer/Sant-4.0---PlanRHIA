import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { UserService } from '../../../services/user/user.service';
import { User } from '../../../models/User';
import { ContratService, Contrat } from '../../../services/contrat/contrat.service';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-hours',
  imports: [
    CommonModule,
    TableModule,
    PaginatorModule,
    ButtonModule,
    TooltipModule,
    ToastModule
  ],
  standalone: true,
  templateUrl: './hours.component.html',
  styleUrls: ['./hours.component.css'],
  providers: [MessageService]
})
export class HoursComponent implements OnInit {
  cols: any[] = [
    { field: 'id', header: 'ID User' },
    { field: 'name', header: 'Nom employé' },
    { field: 'email', header: 'Email' },
    { field: 'phone', header: 'Numéro Tel' },
    { field: 'totalHours', header: 'Total Heures' }
  ];

  first: number = 0;
  rows: number = 10;
  users: User[] = [];
  userContracts: { [userId: string]: Contrat | null } = {};
  loading: boolean = false;

  constructor(
    private userService: UserService,
    private contratService: ContratService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadUsersWithHours();
  }

  loadUsersWithHours() {
    this.loading = true;
    this.userService.findAllUsers().subscribe({
      next: (response) => {
        this.users = response.data || [];
        this.loadContractsForUsers();
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Échec du chargement des utilisateurs'
        });
        this.loading = false;
      }
    });
  }

  loadContractsForUsers() {
    const requests = this.users.map(user => 
      this.contratService.getContratByUserId(user.id || user._id!)
    );

    forkJoin(requests).subscribe({
      next: (responses) => {
        responses.forEach((response, index) => {
          const userId = this.users[index].id || this.users[index]._id!;
          this.userContracts[userId] = response?.data || null;
        });
        this.calculateTotalHours();
        this.loading = false;
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Échec du chargement des contrats'
        });
        this.loading = false;
      }
    });
  }

  calculateTotalHours() {
    this.users = this.users.map(user => {
      const userId = user.id || user._id!;
      const contrat = this.userContracts[userId];
      let totalHours = 0;

      if (contrat && contrat.work_days) {
        // Convertir contrat_hours en number si nécessaire
        const contratHours = typeof contrat.contrat_hour_week === 'string' 
          ? parseFloat(contrat.contrat_hour_week) 
          : contrat.contrat_hour_week;

        contrat.work_days.forEach(day => {
          const start = this.timeToMinutes(day.start_time);
          const end = this.timeToMinutes(day.end_time);
          totalHours += (end - start) / 60;
        });

        // Normalisation pour temps plein (35h)
        if (contratHours) {
          totalHours *= contratHours / 35;
        }
      }

      return {
        ...user,
        totalHours : contrat?.contrat_hour_week + 'h' || 'N/A'
        //totalHours: totalHours > 0 ? totalHours.toFixed(2) + 'h' : 'N/A'
      };
    });
  }

  timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  onPageChange(event: PaginatorState) {
    this.first = event.first ?? 0;
    this.rows = event.rows ?? 10;
  }

  viewContractDetails(user: User) {
    const userId = user.id || user._id!;
    const contrat = this.userContracts[userId];
    if (contrat) {
      this.messageService.add({
        severity: 'info',
        summary: 'Détails du contrat',
        detail: `Type: ${contrat.contrat_type}, period: ${contrat.working_period}, Heures/semaine: ${contrat.contrat_hour_week}`
      });
    } else {
      this.messageService.add({
        severity: 'warn',
        summary: 'Aucun contrat',
        detail: `${user.first_name} ${user.last_name} n'a pas de contrat enregistré`
      });
    }
  }
}