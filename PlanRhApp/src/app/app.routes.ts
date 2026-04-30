import { Routes } from '@angular/router';
import { LoginComponent } from './pages/auth/login/login.component';
import { ForgotPasswordComponent } from './pages/auth/forgot-password/forgot-password.component';
import { SecretaireLayoutComponent } from './core/layout/secretaire-layout/secretaire-layout.component';
import { AdminLayoutComponent } from './core/layout/admin-layout/admin-layout.component';
import { CadreLayoutComponent } from './core/layout/cadre-layout/cadre-layout.component';
import { HomeComponent } from './pages/admin/home/home.component';
import { UsersComponent } from './pages/admin/users/users.component';
import { ServicesComponent } from './pages/admin/services/services.component';
import { PoleComponent } from './pages/admin/pole/pole.component';
import { CodeComponent } from './pages/admin/code/code.component';
import { SpecialityComponent } from './pages/admin/speciality/speciality.component';
import { CalendarComponent } from './pages/cadre/calendar/calendar.component';
import { MedicalStaffComponent } from './pages/cadre/medical-staff/medical-staff.component';
import { TreatAbsenceComponent } from './pages/cadre/treat-absence/treat-absence.component';
import { AbsencesComponent } from './pages/cadre/absences/absences.component';
import { CadreHomeComponent } from './pages/cadre/cadre-home/cadre-home.component';
import { SecHomeComponent } from './pages/secretaire/sec-home/sec-home.component';
import { SecCalendarComponent } from './pages/secretaire/sec-calendar/sec-calendar.component';
import { SecMedicalStaffComponent } from './pages/secretaire/sec-medical-staff/sec-medical-staff.component';
import { ReportAbsenceComponent } from './pages/secretaire/report-absence/report-absence.component';
import { AsksComponent } from './pages/secretaire/asks/asks.component';
import { MonAgendaComponent } from './pages/secretaire/mon-agenda/mon-agenda.component';
import { AlertsComponent } from './pages/secretaire/alerts/alerts.component';
import { AnomaliesComponent } from './pages/cadre/anomalies/anomalies.component';
import { PlanificationComponent } from './pages/cadre/planification/planification.component';
import { AdvancedDashboardComponent } from './pages/admin/advanced-dashboard/advanced-dashboard.component';
import { AddAccountComponent } from './pages/admin/add-account/add-account.component';
import { TimeAccountsComponent } from './pages/cadre/time-accounts/time-accounts.component';
import { LeaveRightsComponent } from './pages/cadre/leave-rights/leave-rights.component';
import { LeaveWindowComponent } from './pages/cadre/leave-window/leave-window.component';
import { AuthGuard, CheckAuth } from './guards/authGuard/auth-guard.service';
import { AideComponent } from './shared/components/aide/aide.component';
import { PolitiqueComponent } from './shared/components/politique/politique.component';

export const routes: Routes = [
  { path: '', component: LoginComponent, canActivate: [CheckAuth] },
  { path: 'forgot', component: ForgotPasswordComponent },
  {
    path: 'sec',
    component: SecretaireLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', component: SecHomeComponent },
      { path: 'calendar', component: SecCalendarComponent },
      { path: 'mon-agenda', component: MonAgendaComponent },
      { path: 'asks', component: AsksComponent },
      { path: 'alerts', component: AlertsComponent },
      { path: 'medical-staff', component: SecMedicalStaffComponent },
      { path: 'report-absence', component: ReportAbsenceComponent },
      { path: 'time-accounts', component: TimeAccountsComponent },
      { path: 'leave-rights', component: LeaveRightsComponent },
      { path: 'aide', component: AideComponent },
      { path: 'politique', component: PolitiqueComponent },
    ],
  },
  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', component: HomeComponent },
      { path: 'service', component: ServicesComponent },
      { path: 'pole', component: PoleComponent },
      { path: 'specialité', component: SpecialityComponent },
      { path: 'code-absences', component: CodeComponent },
      { path: 'users', component: UsersComponent },
      { path: 'dashboard', component: AdvancedDashboardComponent },
      { path: 'aide', component: AideComponent },
      { path: 'politique', component: PolitiqueComponent },
    ],
  },
  {
    path: 'cadre',
    component: CadreLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', component: CadreHomeComponent },
      { path: 'mon-agenda', component: MonAgendaComponent },
      { path: 'calendar', component: CalendarComponent },
      { path: 'planification', component: PlanificationComponent },
      { path: 'leave-window', component: LeaveWindowComponent },
      { path: 'absence', component: AbsencesComponent },
      { path: 'anomalies', component: AnomaliesComponent },
      { path: 'medical-staff', component: MedicalStaffComponent },
      { path: 'treat-absence/:id', component: TreatAbsenceComponent },
      { path: 'add-account', component: AddAccountComponent },
      { path: 'time-accounts', component: TimeAccountsComponent },
      { path: 'leave-rights', component: LeaveRightsComponent },
      { path: 'aide', component: AideComponent },
      { path: 'politique', component: PolitiqueComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];