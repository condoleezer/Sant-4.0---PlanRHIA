import { Component, signal, WritableSignal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { User } from '../../../models/User';
import { UserService } from '../../../services/user/user.service';
import { RoleService } from '../../../services/role/role.service';
import { ServiceService } from '../../../services/service/service.service';
import { SpecialityService } from '../../../services/speciality/speciality.service';
import { AuthService } from '../../../services/auth/auth.service';
import { CreateUserRequest } from '../../../dtos/request/CreateUserRequest';
import { MessageService, ConfirmationService, SelectItem } from 'primeng/api';
import { Role } from '../../../models/role';
import { Service } from '../../../models/services';
import { Speciality } from '../../../models/services';
import { CommonModule } from '@angular/common';
import { Button } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { IftaLabel } from 'primeng/iftalabel';
import { Password } from 'primeng/password';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DropdownModule } from 'primeng/dropdown';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    Button,
    TableModule,
    FormsModule,
    Drawer,
    InputText,
    Select,
    IftaLabel,
    Password,
    ConfirmDialogModule,
    ToastModule,
    DropdownModule
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css'],
  providers: [ConfirmationService, MessageService, AuthService]
})
export class UsersComponent {
  users: User[] = [];
  filteredUsers: User[] = [];
  roles: SelectItem[] = [];
  services: Service[] = [];
  speciality: Speciality[] = [];
  selectedUser: User | null = null;
  loading = signal(false);
  searchTerm: string = '';
  selectedRole: string = '';
  roleOptions: SelectItem[] = [
    { label: 'Tous', value: '' },
    { label: 'Administrateur', value: 'admin' },
    { label: 'Cadre de santé', value: 'cadre' },
    { label: 'Agent de santé', value: 'nurse' },
    { label: 'Vacataire', value: 'vacataire' }
  ];

  userForm: FormGroup;
  drawerVisible: WritableSignal<boolean> = signal(false);
  isEditMode: boolean = false;

  first: number = 0;
  rows: number = 10;
  totalRecords: number = 0;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private roleService: RoleService,
    private serviceService: ServiceService,
    private specialityService: SpecialityService,
    private fb: FormBuilder,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {
    this.userForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(3)]],
      last_name: ['', [Validators.required, Validators.minLength(3)]],
      tel: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      email: ['', [Validators.required, Validators.email]],
      role: ['', Validators.required],
      service: [''],
      speciality: [''],
      matricule: [''],
      password: ['', [Validators.minLength(8)]]
    });
  }

  ngOnInit() {
    this.loadRoles();
    this.loadServices().then(() => {
      this.loadUsers();
    });
    this.loadSpecialities().then(() => {
      this.loadUsers();
    });
  }

  loadUsers() {
    this.userService.findAllUsers().subscribe({
      next: (response) => {
        console.log('Raw users response:', response);
        console.log('Services available:', this.services);
        console.log('Specialities available:', this.speciality);
        
        this.users = response.data.map(user => {
          const serviceName = this.services.find(s => s.id === user.service_id)?.name || 'Aucun';
          const specialityName = this.speciality.find(s => s.id === user.speciality_id)?.name || user.competence || 'Aucune';
          const displayRole = this.getDisplayRole(user.role);
          
          return {
            ...user,
            serviceName,
            specialityName,
            displayRole
          };
        })
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
          const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        
        this.filteredUsers = [...this.users];
        this.applyFilter();
        console.log('Users loaded and processed:', this.users.length);
      },
      error: (err) => {
        console.error('Error loading users:', err);
        this.showError('Erreur lors du chargement des utilisateurs');
      }
    });
  }

  loadServices(): Promise<void> {
    return new Promise((resolve) => {
      this.serviceService.findAllServices().subscribe({
        next: (response) => {
          this.services = response.data;
          console.log('Services loaded:', this.services);
          resolve();
        },
        error: () => {
          this.showError('Erreur lors du chargement des services');
          resolve();
        }
      });
    });
  }

  loadSpecialities(): Promise<void> {
    return new Promise((resolve) => {
      this.specialityService.findAllSpecialities().subscribe({
        next: (response) => {
          this.speciality = response.data;
          console.log('Competences loaded:', this.speciality);
          resolve();
        },
        error: () => {
          this.showError('Erreur lors du chargement des services');
          resolve();
        }
      });
    });
  }

  loadRoles() {
    this.roleService.findAllRoles().subscribe({
      next: (response) => {
        this.roles = response.data.map(role => ({
          label: this.getDisplayRole(role.name),
          value: role.name
        }));
        
        // Ajouter le rôle "vacataire" s'il n'existe pas déjà dans la liste
        const vacataireExists = this.roles.some(role => role.value === 'vacataire');
        if (!vacataireExists) {
          this.roles.push({
            label: 'Vacataire',
            value: 'vacataire'
          });
        }
        
        console.log('Roles loaded:', this.roles);
      },
      error: () => this.showError('Erreur lors du chargement des rôles')
    });
  }

  getDisplayRole(role: string): string {
    switch (role) {
      case 'admin': return 'Administrateur';
      case 'cadre': return 'Cadre de santé';
      case 'nurse': return 'Agent de santé';
      case 'vacataire': return 'Vacataire';
      default: return role;
    }
  }

  applyFilter() {
    const term = (this.searchTerm || '').toLowerCase();
    this.filteredUsers = this.users.filter(user => {
      const firstName = (user.first_name || '').toLowerCase();
      const lastName = (user.last_name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const role = (user.role || '').toLowerCase();
      const serviceName = (user.serviceName || '').toLowerCase();
      const matchesSearch =
        term === '' ||
        firstName.includes(term) ||
        lastName.includes(term) ||
        email.includes(term) ||
        this.getDisplayRole(role).toLowerCase().includes(term) ||
        serviceName.includes(term);
      const matchesRole = !this.selectedRole || user.role === this.selectedRole;
      return matchesSearch && matchesRole;
    });
    this.updatePagination();
  }

  updatePagination() {
    this.totalRecords = this.filteredUsers.length;
    this.first = 0; // Reset to first page
  }

  onRoleFilterChange() {
    this.applyFilter();
  }

  openCreateUser() {
    this.isEditMode = false;
    this.selectedUser = null;
    this.userForm.reset();
    // Ajouter les validateurs requis pour la création
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
    this.userForm.get('password')?.updateValueAndValidity();
    // S'assurer que le rôle est réinitialisé
    this.userForm.get('role')?.setValue('');
    this.drawerVisible.set(true);
  }

  editUser(user: User) {
    console.log('editUser called with:', user);
    this.isEditMode = true;
    this.selectedUser = { ...user };
    this.userForm.patchValue({
      first_name: user.first_name,
      last_name: user.last_name,
      tel: user.phoneNumber,
      email: user.email,
      role: user.role,
      service: user.service_id || '',
      speciality: user.speciality_id || '',
      matricule: user.matricule || '',
      password: ''
    });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
    this.drawerVisible.set(true);
    console.log('Drawer should be visible now');
    console.log('selectedUser:', this.selectedUser);
  }

  onSubmit() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const values = this.userForm.value;
    console.log('Form values:', values);
    console.log('isEditMode:', this.isEditMode, 'selectedUser:', this.selectedUser);

    if (this.isEditMode && (this.selectedUser?.id || this.selectedUser?._id)) {
      const userId = this.selectedUser.id || this.selectedUser._id;
      const updatedUser = {
        first_name: values.first_name,
        last_name: values.last_name,
        phoneNumber: values.tel,
        email: values.email,
        role: values.role,
        service_id: values.service || null,
        speciality_id: values.speciality || null,
        matricule: values.matricule || undefined
      };
      console.log('Updating user with:', updatedUser);
      this.userService.updateUser(userId!, updatedUser).subscribe({
        next: (response) => {
          console.log('Update success:', response);
          this.showSuccess('Utilisateur mis à jour avec succès');
          this.loadUsers();
          this.closeDrawer();
        },
        error: (err) => {
          console.error('Update error:', err);
          this.showError(err.error?.message || 'Erreur lors de la mise à jour');
          this.loading.set(false);
        },
        complete: () => this.loading.set(false)
      });
    } else {
      // Validation supplémentaire pour le rôle vacataire
      if (values.role === 'vacataire' && !values.service) {
        this.showError('Un service est requis pour un vacataire');
        this.loading.set(false);
        return;
      }

      const createUserRequest: CreateUserRequest = {
        first_name: values.first_name,
        last_name: values.last_name,
        phoneNumber: values.tel,
        email: values.email,
        password: values.password,
        role: values.role,
        service_id: values.service || null,
        speciality_id: values.speciality || null,
        matricule: values.matricule || undefined
      };
      
      console.log('Creating user with:', createUserRequest);
      console.log('Role selected:', values.role);
      console.log('Available roles:', this.roles);
      
      this.authService.createUser(createUserRequest).subscribe({
        next: (response) => {
          console.log('Create success:', response);
          this.showSuccess('Utilisateur créé avec succès');
          this.closeDrawer();
          // Recharger les utilisateurs après un court délai pour s'assurer que le backend a terminé
          setTimeout(() => {
            this.loadUsers();
          }, 500);
        },
        error: (err) => {
          console.error('Create error:', err);
          console.error('Error details:', {
            status: err.status,
            statusText: err.statusText,
            error: err.error,
            message: err.error?.message || err.message
          });
          const errorMessage = err.error?.detail || err.error?.message || err.message || 'Erreur lors de la création';
          this.showError(errorMessage);
          this.loading.set(false);
        },
        complete: () => {
          console.log('Create user request completed');
          this.loading.set(false);
        }
      });
    }
  }

  closeDrawer() {
    console.log('Closing drawer');
    this.drawerVisible.set(false);
    this.userForm.reset();
    this.selectedUser = null;
    this.isEditMode = false;
    // Réinitialiser les validateurs
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
  }

  confirmDelete(user: User) {
    console.log('confirmDelete called with:', user);
    const userId = user.id || user._id;
    if (!userId) {
      this.showError('ID utilisateur invalide');
      return;
    }
    console.log('Calling confirmationService.confirm');
    this.confirmationService.confirm({
      message: `Êtes-vous sûr de vouloir supprimer ${user.first_name} ${user.last_name} ?`,
      header: 'Confirmation de suppression',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer',
      acceptIcon: 'pi pi-check',
      acceptButtonStyleClass: 'p-button-danger',
      rejectLabel: 'Annuler',
      rejectIcon: 'pi pi-times',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => {
        console.log('Accept clicked');
        this.deleteUser(userId);
      },
      reject: () => {
        console.log('Reject clicked');
      }
    });
  }

  deleteUser(userId: string) {
    this.loading.set(true);
    this.userService.deleteUser(userId).subscribe({
      next: (response) => {
        console.log('Delete success:', response);
        this.showSuccess('Utilisateur supprimé avec succès');
        this.loadUsers();
      },
      error: (err) => {
        console.error('Delete error:', err);
        this.showError(err.error?.message || 'Erreur lors de la suppression');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false)
    });
  }

  showSuccess(message: string) {
    this.messageService.add({ severity: 'success', summary: 'Succès', detail: message });
  }

  showError(message: string) {
    this.messageService.add({ severity: 'error', summary: 'Erreur', detail: message });
  }

  onPageChange(event: PaginatorState) {
    this.first = event.first ?? 0;
    this.rows = event.rows ?? 10;
  }
}