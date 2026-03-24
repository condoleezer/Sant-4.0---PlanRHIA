import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TopBarComponent } from '../../../shared/components/top-bar/top-bar.component';
import { AuthService } from '../../../services/auth/auth.service';
import { CommonModule } from '@angular/common';
import {CadreSideBarComponent} from '../../../shared/components/cadre-side-bar/cadre-side-bar.component';

@Component({
  selector: 'app-cadre-layout',
  imports: [TopBarComponent, CadreSideBarComponent, RouterOutlet, CommonModule],
  standalone : true,
  providers: [AuthService],
  templateUrl: './cadre-layout.component.html',
  styleUrl: './cadre-layout.component.css'
})
export class CadreLayoutComponent implements OnInit {
  isCadre: boolean = false;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.authService.getUserInfo().subscribe({
      next: (user) => {
        console.log('User info in AdminLayout:', user);
        this.isCadre = user?.role === 'cadre';
        if (!this.isCadre && this.authService.isAuthenticated()) {
          // Redirige vers la bonne page si authentifié mais pas admin
          switch (user?.role) {
            case 'admin':
              this.router.navigate(['/admin']);
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
        this.router.navigate(['']);
      }
    });
  }
}
