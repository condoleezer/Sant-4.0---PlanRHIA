import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MonAgendaComponent } from './mon-agenda.component';

describe('MonAgendaComponent', () => {
  let component: MonAgendaComponent;
  let fixture: ComponentFixture<MonAgendaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonAgendaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MonAgendaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});








