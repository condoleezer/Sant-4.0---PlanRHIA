import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SecCalendarComponent } from './sec-calendar.component';

describe('SecCalendarComponent', () => {
  let component: SecCalendarComponent;
  let fixture: ComponentFixture<SecCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecCalendarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SecCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
