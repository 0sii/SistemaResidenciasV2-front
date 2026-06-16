import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocenteProyectoDashboard } from './docente-proyecto-dashboard';

describe('DocenteProyectoDashboard', () => {
  let component: DocenteProyectoDashboard;
  let fixture: ComponentFixture<DocenteProyectoDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocenteProyectoDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DocenteProyectoDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
