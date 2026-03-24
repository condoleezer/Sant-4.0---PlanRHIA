import {Component, Input, signal} from '@angular/core';
import { NavItem } from '../../../core/utils/interfaces/NavItem';
import {Router, RouterModule} from "@angular/router";

@Component({
  selector: 'app-side-bar-item',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './side-bar-item.component.html',
  styleUrl: './side-bar-item.component.css',
})
export class SideBarItemComponent {
  @Input() item!: NavItem;
  @Input() isPolicy: boolean = false;
  isSelected = signal(false);
  currentRoute = signal('/');

  constructor(private router: Router) {
  }

  ngOnInit() {
    this.currentRoute.set(this.router.url);
    this.isSelected.set(`${this.currentRoute()}` === this.item.link);
  }
}
