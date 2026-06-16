import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { DocentesService } from '../../../service/docentes.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { Docente } from '../../../Interface/InterfaceUsuario';

@Component({
  selector: 'app-edit-docente',
  standalone: true,
  imports: [Toast, ReactiveFormsModule, RouterLink],
  templateUrl: './edit-docente.html',
  styleUrl: './edit-docente.css',
  providers: [MessageService]
})
export class EditDocente {
  private docentesSvc = inject(DocentesService);
  private usuariosSvc = inject(UsuariosService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messageService = inject(MessageService);

  form: FormGroup;

  docenteId = 0;
  usuarioId = 0;

  constructor() {
    this.form = this.fb.group({
      // Usuario
      nombre: ['', Validators.required],
      apellidoPaterno: ['', Validators.required],
      apellidoMaterno: [''],
      correoInstitucional: ['', [Validators.required, Validators.email]],
      // Docente
      RFC: [''],
      Telefono: ['']
    });
  }

  ngOnInit() {
    // Igual que estudiantes: paramMap id y queryParamMap idUsuario
    this.docenteId = Number(this.route.snapshot.paramMap.get('id'));
    this.usuarioId = Number(this.route.snapshot.queryParamMap.get('idUsuario'));

    this.loadDocente();
  }

  private S(v: any): string {
    return (v === null || v === undefined) ? '' : String(v).trim();
  }

  loadDocente() {
    this.docentesSvc.getById(this.docenteId).pipe(
      switchMap(docente => {
        // Primero docente, luego usuario (igual que estudiantes)
        return this.usuariosSvc.getById(this.usuarioId).pipe(
          switchMap(usuario => {
            // Patch de formulario (con mapeos como en estudiantes)
            this.form.patchValue({
              // backend usa "ApellidoMatterno" → aquí lo traemos como apellidoMaterno
              apellidoMaterno: this.S((usuario as any)?.apellidoMatterno),
              correoInstitucional: this.S(usuario?.correo),

              RFC: this.S((docente as any)?.RFC ?? (docente as any)?.rfc),
              Telefono: this.S((docente as any)?.Telefono ?? (docente as any)?.telefono)
            });
            return [];
          })
        );
      })
    ).subscribe({
      error: err => {
        console.error('Error al cargar docente/usuario:', err);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el docente' });
        this.router.navigate(['/docentes']);
      }
    });
  }

  onSubmit() {
    if (this.form.invalid) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Formulario inválido' });
      return;
    }

    

    const docentePayload: Docente = {
      idDocente: this.docenteId,
      idUsuario: this.usuarioId,
      RFC: this.S(this.form.value.RFC),
      Telefono: this.S(this.form.value.Telefono)
    } as any;

    
  }

}
