import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-profile-selection',
  standalone: true,
  imports: [NgClass],
  templateUrl: './profile-selection.component.html',
  styleUrls: ['./profile-selection.component.css']
})
export class ProfileSelectionComponent {
  isAdminSelected = signal(false);
  isCadreSelected = signal(false);
  isSecSelected = signal(false);
  selectedRole: string | null = null;

  constructor(private router: Router) {}

  toggleAdminSelection(): void {
    this.isAdminSelected.set(true);
    this.isCadreSelected.set(false);
    this.isSecSelected.set(false);
    this.selectedRole = 'admin';
  }

  toggleCadreSelection(): void {
    this.isAdminSelected.set(false);
    this.isCadreSelected.set(true);
    this.isSecSelected.set(false);
    this.selectedRole = 'cadre';
  }

  toggleSecSelection(): void {
    this.isAdminSelected.set(false);
    this.isCadreSelected.set(false);
    this.isSecSelected.set(true);
    this.selectedRole = 'nurse';
  }

  continue(): void {
    if (this.selectedRole) {
      this.router.navigate(['/login'], { queryParams: { role: this.selectedRole } });
    }
  }
}