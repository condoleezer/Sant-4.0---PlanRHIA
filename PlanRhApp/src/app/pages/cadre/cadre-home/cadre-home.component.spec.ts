import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CadreHomeComponent } from './cadre-home.component';

describe('CadreHomeComponent', () => {
  let component: CadreHomeComponent;
  let fixture: ComponentFixture<CadreHomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CadreHomeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CadreHomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
