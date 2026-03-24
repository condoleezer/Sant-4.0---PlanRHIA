import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TopBarComponent } from '../../../shared/components/top-bar/top-bar.component';
import { AdminSideBarComponent } from '../../../shared/components/admin-side-bar/admin-side-bar.component';
import { AuthService } from '../../../services/auth/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, TopBarComponent, AdminSideBarComponent, CommonModule],
  providers: [AuthService],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.css'],
})
export class AdminLayoutComponent implements OnInit {
  isAdmin: boolean = false;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.authService.getUserInfo().subscribe({
      next: (user) => {
        this.isAdmin = user?.role === 'admin';
        if (!this.isAdmin && this.authService.isAuthenticated()) {
          // Redirige vers la bonne page si authentifié mais pas admin
          switch (user?.role) {
            case 'cadre':
              this.router.navigate(['/cadre']);
              break;
            case 'nurse':
              this.router.navigate(['/sec']);
              break;
            default:
              this.router.navigate(['/']);
          }
        }
      },
      error: (err) => {
        console.error('Erreur lors de la récupération des données utilisateur', err);
        this.router.navigate(['/login']);
      }
    });
  }
}