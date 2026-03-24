import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SideBarDropComponent } from './side-bar-drop.component';

describe('SideBarDropComponent', () => {
  let component: SideBarDropComponent;
  let fixture: ComponentFixture<SideBarDropComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SideBarDropComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SideBarDropComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
