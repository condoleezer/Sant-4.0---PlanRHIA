import { Component, OnInit } from '@angular/core';
import { NavItem } from '../../../core/utils/interfaces/NavItem';
import { SideBarItemComponent } from '../side-bar-item/side-bar-item.component';
import { PrimeIcons } from 'primeng/api';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-side-bar',
  standalone: true,
  imports: [SideBarItemComponent],
  templateUrl: './side-bar.component.html',
  styleUrls: ['./side-bar.component.css']
})
export class SideBarComponent implements OnInit {
  items: NavItem[] = [];

  adminItems: NavItem[] = [
    { title: 'Accueil', link: '/admin', icon: PrimeIcons.HOME },
    { title: 'Utilisateurs', link: '/admin/users', icon: PrimeIcons.USER },
    { title: 'Services', link: '/admin/services', icon: PrimeIcons.USERS },
    { title: 'Horaires', link: '/admin/hours', icon: PrimeIcons.CLOCK },
  ];

  cadreItems: NavItem[] = [
    { title: 'Accueil', link: '/cadre', icon: PrimeIcons.HOME },
    { title: 'Personnel Paramédical', link: '/cadre/medical-staff', icon: PrimeIcons.CLIPBOARD },
    { title: 'Calendrier', link: '/cadre/calendar', icon: PrimeIcons.CALENDAR },
    { title: 'Absences', link: '/cadre/absence', icon: PrimeIcons.INFO_CIRCLE },
  ];

  nurseItems: NavItem[] = [
    { title: 'Accueil', link: '/sec', icon: PrimeIcons.HOME },
    { title: 'Personnel Paramédical', link: '/sec/medical-staff', icon: PrimeIcons.BARS },
    { title: 'Calendrier', link: '/sec/calendar', icon: PrimeIcons.CALENDAR },
    { title: 'Signaler', link: '/sec/report-absence', icon: PrimeIcons.INFO_CIRCLE },
    { title: 'Mes demandes', link: '/sec/asks', icon: PrimeIcons.CLIPBOARD },
  ];

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.authService.getUserInfo().subscribe(user => {
      switch (user?.role) {
        case 'admin':
          this.items = this.adminItems;
          break;
        case 'cadre':
          this.items = this.cadreItems;
          break;
        case 'nurse':
          this.items = this.nurseItems;
          break;
        default:
          this.items = [];
      }
    });
  }
}