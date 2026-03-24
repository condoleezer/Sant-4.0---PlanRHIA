import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SecretaireLayoutComponent } from './secretaire-layout.component';

describe('SecretaireLayoutComponent', () => {
  let component: SecretaireLayoutComponent;
  let fixture: ComponentFixture<SecretaireLayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecretaireLayoutComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SecretaireLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
