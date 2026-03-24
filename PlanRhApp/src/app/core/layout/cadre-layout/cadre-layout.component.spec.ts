import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CadreLayoutComponent } from './cadre-layout.component';

describe('CadreLayoutComponent', () => {
  let component: CadreLayoutComponent;
  let fixture: ComponentFixture<CadreLayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CadreLayoutComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CadreLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
