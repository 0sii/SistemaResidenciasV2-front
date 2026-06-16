import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PeriodoAcademico } from './periodo-academico';

describe('PeriodoAcademico', () => {
  let component: PeriodoAcademico;
  let fixture: ComponentFixture<PeriodoAcademico>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeriodoAcademico]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PeriodoAcademico);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
