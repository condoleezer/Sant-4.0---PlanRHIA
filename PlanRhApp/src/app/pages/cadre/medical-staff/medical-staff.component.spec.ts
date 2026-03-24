import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MedicalStaffComponent } from './medical-staff.component';

describe('MedicalStaffComponent', () => {
  let component: MedicalStaffComponent;
  let fixture: ComponentFixture<MedicalStaffComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MedicalStaffComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MedicalStaffComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
