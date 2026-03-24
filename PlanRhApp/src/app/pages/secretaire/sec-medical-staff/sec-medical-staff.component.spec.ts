import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SecMedicalStaffComponent } from './sec-medical-staff.component';

describe('SecMedicalStaffComponent', () => {
  let component: SecMedicalStaffComponent;
  let fixture: ComponentFixture<SecMedicalStaffComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecMedicalStaffComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SecMedicalStaffComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
