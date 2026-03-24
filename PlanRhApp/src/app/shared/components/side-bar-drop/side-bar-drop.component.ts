import { Component, Input } from '@angular/core';
import { NavItem } from '../../../core/utils/interfaces/NavItem';
import { Router, RouterModule } from "@angular/router";
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-side-bar-drop',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './side-bar-drop.component.html',
  styleUrl: './side-bar-drop.component.css'
})
export class SideBarDropComponent {
  @Input() item!: NavItem;
  isOpen = false;

  constructor(private router: Router) {}

  toggleDropdown() {
    this.isOpen = !this.isOpen;
  }

  isActive(link: string): boolean {
    return this.router.url === link;
  }
}
