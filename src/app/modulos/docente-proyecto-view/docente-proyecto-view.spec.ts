import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocenteProyectoView } from './docente-proyecto-view';

describe('DocenteProyectoView', () => {
  let component: DocenteProyectoView;
  let fixture: ComponentFixture<DocenteProyectoView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocenteProyectoView]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DocenteProyectoView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
