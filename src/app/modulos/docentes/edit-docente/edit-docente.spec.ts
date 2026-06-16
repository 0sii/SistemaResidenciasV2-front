import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditDocente } from './edit-docente';

describe('EditDocente', () => {
  let component: EditDocente;
  let fixture: ComponentFixture<EditDocente>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditDocente]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditDocente);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
