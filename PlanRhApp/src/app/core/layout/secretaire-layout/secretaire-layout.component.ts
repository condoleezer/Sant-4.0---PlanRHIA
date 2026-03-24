import { Component, OnInit } from '@angular/core';
import {Router, RouterOutlet} from "@angular/router";
import {TopBarComponent} from '../../../shared/components/top-bar/top-bar.component';
import {SecSideBarComponent} from '../../../shared/components/sec-side-bar/sec-side-bar.component';
import { AuthService } from '../../../services/auth/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-secretaire-layout',
  imports: [TopBarComponent, SecSideBarComponent, RouterOutlet, CommonModule],
  standalone : true,
  providers: [AuthService],
  templateUrl: './secretaire-layout.component.html',
  styleUrl: './secretaire-layout.component.css'
})
export class SecretaireLayoutComponent implements OnInit {
  isSec: boolean = false;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.authService.getUserInfo().subscribe({
      next: (user) => {
        this.isSec = user?.role === 'nurse';
        if (!this.isSec && this.authService.isAuthenticated()) {
          // Redirige vers la bonne page si authentifié mais pas admin
          switch (user?.role) {
            case 'cadre':
              this.router.navigate(['/cadre']);
              break;
            case 'admin':
              this.router.navigate(['/admin']);
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
