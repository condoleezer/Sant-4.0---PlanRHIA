import { Component } from '@angular/core';
import {SideBarComponent} from "../../../shared/components/side-bar/side-bar.component";
import {RouterOutlet} from "@angular/router";
import {TopBarComponent} from "../../../shared/components/top-bar/top-bar.component";

@Component({
  selector: 'app-home-layout',
  standalone: true,
  imports: [
    SideBarComponent,
    RouterOutlet,
    TopBarComponent
  ],
  templateUrl: './home-layout.component.html',
  styleUrl: './home-layout.component.css'
})
export class HomeLayoutComponent {

}
