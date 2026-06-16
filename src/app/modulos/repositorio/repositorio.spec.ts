import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Repositorio } from './repositorio';

describe('Repositorio', () => {
  let component: Repositorio;
  let fixture: ComponentFixture<Repositorio>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Repositorio]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Repositorio);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
