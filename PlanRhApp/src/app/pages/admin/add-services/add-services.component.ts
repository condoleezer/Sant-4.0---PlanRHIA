import { Component } from '@angular/core';
import {Select} from 'primeng/select';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {Breadcrumb} from 'primeng/breadcrumb';
import {MultiSelect} from 'primeng/multiselect';
import {MenuItem} from 'primeng/api';
import { MultiSelectModule } from 'primeng/multiselect';
import {User} from '../../../models/User';

class BaseEntity {
}

@Component({
  selector: 'app-add-services',
  imports: [
    Select,
    Button,
    InputText,
    FormsModule,
    Breadcrumb,
    ReactiveFormsModule,
    MultiSelect,
    MultiSelectModule
  ],
  standalone : true,
  templateUrl: './add-services.component.html',
  styleUrl: './add-services.component.css'
})
export class AddServicesComponent {
  users!: User[];

  selectedUsers!: User[];

  items: MenuItem[] | undefined;

  adminForm!: FormGroup;

  constructor(private fb: FormBuilder) {

  }

  ngOnInit() {

    this.items = [
      { label: 'Service' },
      { label: 'Créer un service' },
    ];
    this.adminForm = this.fb.group({
      name: ['', Validators.required],
      head: new FormControl<BaseEntity | null>(this.users[0], Validators.required),
      members: new FormControl<BaseEntity | null>(this.selectedUsers[0], Validators.required),
    });
  }

  submit() {}
}
