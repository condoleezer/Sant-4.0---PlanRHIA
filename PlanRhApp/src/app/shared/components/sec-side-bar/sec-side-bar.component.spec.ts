import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SecSideBarComponent } from './sec-side-bar.component';

describe('SecSideBarComponent', () => {
  let component: SecSideBarComponent;
  let fixture: ComponentFixture<SecSideBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecSideBarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SecSideBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
