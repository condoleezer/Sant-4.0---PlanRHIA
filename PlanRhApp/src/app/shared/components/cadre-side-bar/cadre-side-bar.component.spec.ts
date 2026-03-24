import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CadreSideBarComponent } from './cadre-side-bar.component';

describe('CadreSideBarComponent', () => {
  let component: CadreSideBarComponent;
  let fixture: ComponentFixture<CadreSideBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CadreSideBarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CadreSideBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
