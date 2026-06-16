import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Docentes } from './docentes';

describe('Docentes', () => {
  let component: Docentes;
  let fixture: ComponentFixture<Docentes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Docentes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Docentes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
