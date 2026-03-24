import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';
import { InputText } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, InputText, CheckboxModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService
  ) {
    this.loginForm = this.fb.group({
      matricule: ['', Validators.required],
      password: ['', Validators.required],
      rememberMe: [false]
    });
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      console.log('User already authenticated, staying on login page');
    }
  }

  connect(): void {
    if (this.loginForm.valid) {
      const { matricule, password } = this.loginForm.value;
      this.authService.login(matricule, password).subscribe({
        next: (response) => {
          console.log('Connexion réussie', response);
          // Use response data directly instead of getCurrentUser() to avoid timing issues
          const user = response.data || this.authService.getCurrentUser();
          if (user && user.role) {
            console.log('User role:', user.role);
            switch (user.role) {
              case 'admin':
                this.router.navigate(['/admin']);
                break;
              case 'cadre':
                console.log('Navigating to cadre dashboard');
                this.router.navigate(['/cadre']);
                break;
              case 'nurse':
                this.router.navigate(['/sec']);
                break;
              default:
                console.error('Rôle non reconnu:', user.role);
                alert('Rôle non reconnu: ' + user.role);
                this.authService.logout().subscribe({
                  next: () => this.router.navigate(['']),
                });
            }
          } else {
            console.error('Rôle non trouvé dans les données utilisateur', { user, response });
            alert('Erreur: Rôle non défini');
            this.authService.logout().subscribe({
              next: () => this.router.navigate(['']),
            });
          }
        },
        error: (err) => {
          console.error('Erreur de connexion', err);
          alert('Identifiants incorrects');
          this.loginForm.reset();
        },
      });
    } else {
      alert('Veuillez remplir tous les champs');
    }
  }

  forgot(): void {
    this.router.navigate(['/forgot']);
  }
}