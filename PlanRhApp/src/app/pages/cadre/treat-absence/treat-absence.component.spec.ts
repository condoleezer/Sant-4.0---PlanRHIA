import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TreatAbsenceComponent } from './treat-absence.component';

describe('TreatAbsenceComponent', () => {
  let component: TreatAbsenceComponent;
  let fixture: ComponentFixture<TreatAbsenceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreatAbsenceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TreatAbsenceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
