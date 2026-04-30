import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { MenuModule } from 'primeng/menu';
import { DialogModule } from 'primeng/dialog';
import { MenuItem } from 'primeng/api';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth/auth.service';
import { ServiceService } from '../../../services/service/service.service';
import { UserService } from '../../../services/user/user.service';
import { User } from '../../../models/User';
import { Service } from '../../../models/services';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { Notification } from '../../../services/notifications/notification.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [AvatarModule, MenuModule, DialogModule, CommonModule, FormsModule, NotificationBellComponent],
  providers: [AuthService, ServiceService],
  templateUrl: './top-bar.component.html',
  styleUrls: ['./top-bar.component.css'],
})
export class TopBarComponent implements OnInit {
  userRole: string | null = null;
  userName: string | null = null;
  name: string | null = null;
  managerName: string | null = null;
  userId: string = '';
  menuItems: MenuItem[] = [];
  displayProfileModal: boolean = false;
  user: User | null = null;
  today: Date = new Date();

  // Edit mode
  editMode = false;
  savingProfile = false;
  editError = '';
  editSuccess = '';
  showNewPassword = false;
  showConfirmPassword = false;
  editForm = {
    first_name: '',
    last_name: '',
    email: '',
    phoneNumber: '',
    matricule: '',
    new_password: '',
    confirm_password: ''
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    private serviceService: ServiceService,
    private userService: UserService
  ) {}

  ngOnInit() {
    // Check if user data is already available
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.setUserData(currentUser);
      this.loadServiceHead(currentUser);
    }

    // Subscribe to user changes
    this.authService.getUserInfo().subscribe({
      next: (user: User | null) => {
        console.log('User info received in TopBar:', user);
        if (user) {
          this.setUserData(user);
        } else {
          console.log('No user data available');
          this.user = null;
          this.userRole = null;
          this.userName = null;
          this.name = null;
          this.managerName = null;
          this.menuItems = [];
          this.router.navigate(['/']); // Redirect to login if no user data
        }
      },
      error: (err) => {
        console.error('Error fetching user info in TopBar:', err);
        this.user = null;
        this.userRole = null;
        this.userName = null;
        this.name = null;
        this.managerName = null;
        this.menuItems = [];
        this.router.navigate(['/']);
      }
    });
  }

  private loadServiceHead(user: User) {
    if (user.service_id) {
      this.serviceService.findServiceById(user.service_id).subscribe({
        next: (response) => {
          const service: Service = response.data;
          this.managerName = service.head || 'N/A'; // Set the manager name from the service head
          console.log('Service head loaded:', this.managerName);
        },
        error: (err) => {
          console.error('Error fetching service:', err);
          this.managerName = 'N/A'; // Fallback if service fetch fails
        }
      });
    } else {
      this.managerName = 'N/A'; // No service assigned to the user
    }
  }

  private setUserData(user: User) {
    this.user = user;
    this.userId = user._id || '';
    switch (user.role) {
      case 'admin':
        this.userRole = 'A';
        break;
      case 'cadre':
        this.userRole = 'M';
        break;
      case 'nurse':
        this.userRole = 'C';
        break;
      default:
        this.userRole = 'U';
    }
    this.userName = user.first_name && user.last_name
      ? `${user.first_name.charAt(0).toUpperCase()}${user.last_name.charAt(0).toUpperCase()}`
      : 'N/A';

    this.name = user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : 'N/A';

    this.menuItems = [
      { label: 'Profil', icon: 'pi pi-user', command: () => this.showProfile() },
      { label: 'Déconnexion', icon: 'pi pi-sign-out', command: () => this.logout() }
    ];
  }

  logout() {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['']);
      },
      error: (err) => {
        console.error('Erreur lors de la déconnexion', err);
        this.router.navigate(['']);
      }
    });
  }

  showProfile() {
    this.displayProfileModal = true;
    this.editMode = false;
    this.editError = '';
    this.editSuccess = '';
  }

  closeProfileModal() {
    this.displayProfileModal = false;
    this.cancelEdit();
  }

  toggleEdit() {
    if (this.editMode) {
      this.cancelEdit();
    } else {
      this.editMode = true;
      this.editError = '';
      this.editSuccess = '';
      this.editForm = {
        first_name: this.user?.first_name || '',
        last_name: this.user?.last_name || '',
        email: this.user?.email || '',
        phoneNumber: (String(this.user?.phoneNumber || '') === String(this.user?.matricule || ''))
          ? ''
          : String(this.user?.phoneNumber || ''),
        matricule: this.user?.matricule || '',
        new_password: '',
        confirm_password: ''
      };
    }
  }

  cancelEdit() {
    this.editMode = false;
    this.editError = '';
    this.editSuccess = '';
    this.showNewPassword = false;
    this.showConfirmPassword = false;
    this.editForm = { first_name: '', last_name: '', email: '', phoneNumber: '', matricule: '', new_password: '', confirm_password: '' };
  }

  saveProfile() {
    if (!this.user?._id) return;

    if (this.editForm.new_password && this.editForm.new_password !== this.editForm.confirm_password) {
      this.editError = 'Les mots de passe ne correspondent pas';
      return;
    }

    this.savingProfile = true;
    this.editError = '';
    this.editSuccess = '';

    // Si l'utilisateur n'est pas admin, il ne peut changer que son mot de passe
    if (this.user.role !== 'admin') {
      if (this.editForm.new_password) {
        this.userService.changePassword(this.user._id, { new_password: this.editForm.new_password }).subscribe({
          next: () => {
            this.savingProfile = false;
            this.editSuccess = 'Mot de passe mis à jour avec succès';
            setTimeout(() => this.cancelEdit(), 1500);
          },
          error: (err) => {
            this.savingProfile = false;
            this.editError = 'Erreur lors de la mise à jour du mot de passe : ' + (err.error?.detail || err.message);
          }
        });
      } else {
        this.savingProfile = false;
        this.editError = 'Vous ne pouvez modifier que votre mot de passe';
      }
      return;
    }

    // Admin peut tout modifier
    const updateData: any = {
      first_name: this.editForm.first_name,
      last_name: this.editForm.last_name,
      email: this.editForm.email,
      phoneNumber: this.editForm.phoneNumber,
      matricule: this.editForm.matricule
    };

    // Mise à jour des infos de base
    this.userService.updateUser(this.user._id, updateData).subscribe({
      next: () => {
        if (this.user) {
          const updated: User = { ...this.user, ...updateData };
          this.user = updated;
          this.authService.updateCurrentUser(updated);
          this.setUserData(updated);
        }

        if (this.editForm.new_password) {
          this.userService.changePassword(this.user!._id, { new_password: this.editForm.new_password }).subscribe({
            next: () => {
              this.savingProfile = false;
              this.editSuccess = 'Profil et mot de passe mis à jour';
              setTimeout(() => this.cancelEdit(), 1500);
            },
            error: (err) => {
              this.savingProfile = false;
              this.editError = 'Profil mis à jour mais erreur mot de passe : ' + (err.error?.detail || err.message);
            }
          });
        } else {
          this.savingProfile = false;
          this.editSuccess = 'Profil mis à jour avec succès';
          setTimeout(() => this.cancelEdit(), 1500);
        }
      },
      error: (err) => {
        this.savingProfile = false;
        this.editError = 'Erreur : ' + (err.error?.detail || err.message);
      }
    });
  }

  getRoleLabel(): string {
    switch (this.user?.role) {
      case 'admin': return 'Administrateur';
      case 'cadre': return 'Cadre de santé';
      case 'nurse': return 'Agent de santé';
      default: return this.user?.role || 'Utilisateur';
    }
  }

  onNotificationClick(notification: Notification): void {
    if (notification.action_url) {
      const extras: any = { queryParams: {} };
      const n = notification as any;
      if (n.planning_id) extras.queryParams['planning_id'] = n.planning_id;
      if (n.planning_date) extras.queryParams['date'] = n.planning_date;
      if (n.planning_user_id) extras.queryParams['user_id'] = n.planning_user_id;
      this.router.navigate([notification.action_url], extras);
    } else {
      switch (notification.category) {
        case 'alert':
          this.router.navigate(['/sec/alerts']);
          break;
        case 'anomaly':
          this.router.navigate(['/cadre/anomalies']);
          break;
        case 'event':
          this.router.navigate(['/sec/calendar']);
          break;
        default:
          console.log('Notification clicked:', notification);
      }
    }
  }
}

