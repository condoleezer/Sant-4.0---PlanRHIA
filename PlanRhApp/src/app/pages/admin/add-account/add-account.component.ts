import { Component, OnInit, OnDestroy } from '@angular/core';
import {FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors} from '@angular/forms';
import {MenuItem, MessageService, SelectItem} from 'primeng/api';
import {Breadcrumb} from 'primeng/breadcrumb';
import {Select} from 'primeng/select';
import {Password} from 'primeng/password';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {ToastModule} from 'primeng/toast';
import {CommonModule} from '@angular/common';
import {Subject, takeUntil} from 'rxjs';
import {AuthService} from '../../../services/auth/auth.service';
import {CreateUserRequest} from '../../../dtos/request/CreateUserRequest';

interface RoleOption {
  name: string;
  id: string;
}

@Component({
  selector: 'app-add-account',
  imports: [
    CommonModule,
    Breadcrumb,
    ReactiveFormsModule,
    Select,
    Password,
    Button,
    InputText,
    ToastModule
  ],
  standalone : true,
  providers: [MessageService],
  templateUrl: './add-account.component.html',
  styleUrl: './add-account.component.css'
})
export class AddAccountComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  items: MenuItem[] | undefined;
  adminForm!: FormGroup;
  roles: RoleOption[] = [];
  currentUser: any = null;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    // Vérifier que l'utilisateur est un cadre
    this.loadCurrentUser();
    
    this.items = [
      { label: 'Compte' },
      { label: 'Créer un compte' },
    ];
    
    // Initialiser les rôles disponibles pour les cadres (agent de santé et vacataire uniquement)
    this.roles = [
      { name: 'Agent de santé', id: 'nurse' },
      { name: 'Vacataire', id: 'vacataire' }
    ];
    
    // Initialiser le formulaire
    this.adminForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      tel: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      email: ['', [Validators.required, Validators.email]],
      role: [this.roles[0]?.id || '', Validators.required],
      password: ['', [Validators.required, Validators.minLength(8)]],
      re_password: ['', [Validators.required, this.passwordMatchValidator.bind(this)]],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Charge l'utilisateur connecté et vérifie qu'il est un cadre
   */
  loadCurrentUser(): void {
    this.authService.getUserInfo()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (user: any) => {
          if (!user) {
            this.showError('Vous devez être connecté pour créer un compte');
            return;
          }
          
          if (user.role !== 'cadre') {
            this.showError('Seuls les cadres peuvent créer des comptes depuis cette page');
            return;
          }
          
          if (!user.service_id) {
            this.showError('Votre compte n\'est associé à aucun service. Contactez un administrateur.');
            return;
          }
          
          this.currentUser = user;
          console.log('Utilisateur cadre chargé:', user);
        },
        error: (error) => {
          console.error('Erreur lors du chargement de l\'utilisateur:', error);
          this.showError('Erreur lors du chargement de vos informations');
        }
      });
  }

  /**
   * Validateur personnalisé pour vérifier que les mots de passe correspondent
   */
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    if (!this.adminForm) {
      return null;
    }
    const password = this.adminForm.get('password')?.value;
    const rePassword = control.value;
    
    if (password && rePassword && password !== rePassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  /**
   * Soumet le formulaire pour créer un nouvel utilisateur
   */
  submit(): void {
    if (this.adminForm.invalid) {
      // Marquer tous les champs comme touchés pour afficher les erreurs
      Object.keys(this.adminForm.controls).forEach(key => {
        this.adminForm.get(key)?.markAsTouched();
      });
      this.showError('Veuillez remplir tous les champs correctement');
      return;
    }

    if (!this.currentUser || this.currentUser.role !== 'cadre') {
      this.showError('Vous devez être un cadre pour créer un compte');
      return;
    }

    if (!this.currentUser.service_id) {
      this.showError('Votre compte n\'est associé à aucun service');
      return;
    }

    const formValues = this.adminForm.value;
    
    // Vérifier que le rôle sélectionné est autorisé (nurse ou vacataire)
    if (formValues.role !== 'nurse' && formValues.role !== 'vacataire') {
      this.showError('Vous ne pouvez créer que des comptes pour les rôles "Agent de santé" ou "Vacataire"');
      return;
    }

    // Vérifier que les mots de passe correspondent
    if (formValues.password !== formValues.re_password) {
      this.showError('Les mots de passe ne correspondent pas');
      return;
    }

    this.loading = true;

    // Créer la requête de création d'utilisateur
    const createUserRequest: CreateUserRequest = {
      first_name: formValues.first_name.trim(),
      last_name: formValues.last_name.trim(),
      phoneNumber: formValues.tel,
      email: formValues.email.trim(),
      password: formValues.password,
      role: formValues.role,
      service_id: this.currentUser.service_id, // Utiliser le service du cadre
      speciality_id: undefined // Peut être ajouté plus tard si nécessaire
    };

    console.log('Création d\'utilisateur:', createUserRequest);

    this.authService.createUser(createUserRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('Utilisateur créé avec succès:', response);
          this.showSuccess('Utilisateur créé avec succès');
          // Réinitialiser le formulaire
          this.adminForm.reset();
          this.adminForm.patchValue({
            role: this.roles[0]?.id || ''
          });
          this.loading = false;
        },
        error: (error) => {
          console.error('Erreur lors de la création:', error);
          const errorMessage = error.error?.detail || error.error?.message || error.message || 'Erreur lors de la création de l\'utilisateur';
          this.showError(errorMessage);
          this.loading = false;
        }
      });
  }

  /**
   * Affiche un message de succès
   */
  showSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Succès',
      detail: message
    });
  }

  /**
   * Affiche un message d'erreur
   */
  showError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erreur',
      detail: message
    });
  }

  /**
   * Vérifie si un champ du formulaire est invalide et a été touché
   */
  isFieldInvalid(fieldName: string): boolean {
    const field = this.adminForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /**
   * Récupère le message d'erreur pour un champ
   */
  getFieldError(fieldName: string): string {
    const field = this.adminForm.get(fieldName);
    if (!field || !field.errors) {
      return '';
    }

    if (field.errors['required']) {
      return 'Ce champ est requis';
    }
    if (field.errors['email']) {
      return 'Email invalide';
  }
    if (field.errors['minlength']) {
      return `Minimum ${field.errors['minlength'].requiredLength} caractères`;
    }
    if (field.errors['pattern']) {
      if (fieldName === 'tel') {
        return 'Le numéro de téléphone doit contenir 10 chiffres';
      }
      return 'Format invalide';
    }
    if (field.errors['passwordMismatch']) {
      return 'Les mots de passe ne correspondent pas';
    }

    return 'Valeur invalide';
  }
}
