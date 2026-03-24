import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportAbsenceComponent } from './report-absence.component';

describe('ReportAbsenceComponent', () => {
  let component: ReportAbsenceComponent;
  let fixture: ComponentFixture<ReportAbsenceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportAbsenceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportAbsenceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
