import { Component } from '@angular/core';
import {NavItem} from '../../../core/utils/interfaces/NavItem';
import {PrimeIcons} from 'primeng/api';
import {SideBarItemComponent} from '../side-bar-item/side-bar-item.component';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { SideBarDropComponent } from '../side-bar-drop/side-bar-drop.component';

@Component({
  selector: 'app-sec-side-bar',
  imports: [SideBarItemComponent, MenuModule, SideBarDropComponent],
  standalone : true,
  templateUrl: './sec-side-bar.component.html',
  styleUrl: './sec-side-bar.component.css'
})
export class SecSideBarComponent {
  items: NavItem[] = [
    {title: 'Accueil', link: '/sec', icon: PrimeIcons.HOME},
    {title: 'Mon Agenda', link: '/sec/mon-agenda', icon: PrimeIcons.CALENDAR_PLUS},
    {title: 'Personnel Paramédical', link: '/sec/medical-staff', icon: PrimeIcons.BARS},
    {title: 'Calendrier équipe', link: '/sec/calendar', icon: PrimeIcons.CALENDAR},
    {title: 'Demander un Remplacement ou une Absence', link: '/sec/report-absence', icon: PrimeIcons.INFO_CIRCLE},
    {title: 'Mes demandes', link: '/sec/asks', icon: PrimeIcons.CLIPBOARD},
    {title: 'Mes alertes', link: '/sec/alerts', icon: PrimeIcons.BELL},
    {
      title: 'Mes comptes de temps / Synthèse des droits',
      icon: PrimeIcons.CLOCK,
      children: [
        { title: 'Mes comptes de temps', link: '/sec/time-accounts' },
        { title: 'Synthèse des droits', link: '/sec/leave-rights' }
      ]
    },
  ];

  others: NavItem[] = [
    { title: 'Accéder à l\'aide', link: '/sec/aide', icon: PrimeIcons.QUESTION_CIRCLE },
    { title: 'Déconnexion', link: '/logout', icon: PrimeIcons.SIGN_OUT },
    { title: 'Politique de confidentialité', link: '/sec/politique', icon: PrimeIcons.SHIELD }
  ];
}
