import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SimpleCalendarComponent } from './simple-calendar.component';

describe('SimpleCalendarComponent', () => {
  let component: SimpleCalendarComponent;
  let fixture: ComponentFixture<SimpleCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimpleCalendarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SimpleCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});













































