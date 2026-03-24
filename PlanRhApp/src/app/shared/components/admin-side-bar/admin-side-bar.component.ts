import { Component } from '@angular/core';
import { NavItem } from '../../../core/utils/interfaces/NavItem';
import { PrimeIcons } from 'primeng/api';
import { SideBarItemComponent } from '../side-bar-item/side-bar-item.component';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { SideBarDropComponent } from '../side-bar-drop/side-bar-drop.component';

@Component({
  selector: 'app-admin-side-bar',
  standalone: true,
  imports: [SideBarItemComponent, MenuModule, SideBarDropComponent],
  templateUrl: './admin-side-bar.component.html',
  styleUrls: ['./admin-side-bar.component.css'],
})
export class AdminSideBarComponent {
  aItems: NavItem[] = [
    { title: 'Accueil', link: '/admin', icon: PrimeIcons.HOME },
    { title: 'Tableau de bord', link: '/admin/dashboard', icon: PrimeIcons.CHART_BAR },
    { title: 'Utilisateurs', link: '/admin/users', icon: PrimeIcons.USERS },
    { 
      title: 'Configuration', 
      icon: PrimeIcons.COG,
      children: [
        { title: 'Service', link: '/admin/service' },
        { title: 'Pôle', link: '/admin/pole' },
        { title: 'Code-absence', link: '/admin/code-absences' },
        { title: 'Compétence', link: '/admin/specialité' }
      ]
    },
  ];
  
  others: NavItem[] = [
    { title: 'Accéder à l\'aide', link: '/admin/aide', icon: PrimeIcons.QUESTION_CIRCLE },
    { title: 'Déconnexion', link: '/logout', icon: PrimeIcons.SIGN_OUT },
    { title: 'Politique de confidentialité', link: '/admin/politique', icon: PrimeIcons.SHIELD }
  ];
}