import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Candidadatos } from './candidadatos';

describe('Candidadatos', () => {
  let component: Candidadatos;
  let fixture: ComponentFixture<Candidadatos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Candidadatos]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Candidadatos);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
