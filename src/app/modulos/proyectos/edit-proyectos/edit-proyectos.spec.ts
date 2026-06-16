import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditProyectos } from './edit-proyectos';

describe('EditProyectos', () => {
  let component: EditProyectos;
  let fixture: ComponentFixture<EditProyectos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditProyectos]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditProyectos);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
