import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolitiqueComponent } from './politique.component';

describe('PolitiqueComponent', () => {
  let component: PolitiqueComponent;
  let fixture: ComponentFixture<PolitiqueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolitiqueComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolitiqueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
