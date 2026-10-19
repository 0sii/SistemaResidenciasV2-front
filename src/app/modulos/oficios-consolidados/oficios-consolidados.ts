import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { ProyectosService } from '../../service/proyectos.service';

type TipoRelacionOficio = 'REVISOR_ANTEPROYECTO' | 'ASESOR_INTERNO' | 'REVISOR_RESIDENCIA';
type RolSeleccion = TipoRelacionOficio | 'ACEPTACION';

interface ProyectoAceptacion {
  idProyecto: number;
  titulo: string;
  integrantes: string;
}

interface DocenteConAsignacion {
  idDocente: number;
  nombre: string;
  numProyectos: number;
}

@Component({
  selector: 'app-oficios-consolidados',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    SelectModule,
    ButtonModule,
    ProgressSpinner,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './oficios-consolidados.html',
  styleUrl: './oficios-consolidados.css'
})
export class OficiosConsolidados {

  private proyectosService = inject(ProyectosService);
  private toast            = inject(MessageService);
  private cdr              = inject(ChangeDetectorRef);

  roles: Array<{ label: string; value: RolSeleccion }> = [
    { label: 'Asesor interno (un oficio por alumno)',                     value: 'ASESOR_INTERNO' },
    { label: 'Revisor de reporte preliminar (un oficio por proyecto)',    value: 'REVISOR_ANTEPROYECTO' },
    { label: 'Revisor de residencia (todos los proyectos del docente)',   value: 'REVISOR_RESIDENCIA' },
    { label: 'Aceptación de reporte preliminar (una por proyecto)',       value: 'ACEPTACION' },
  ];

  rolSeleccionado: RolSeleccion | null = null;

  proyectosAceptacion: ProyectoAceptacion[] = [];
  generandoAceptacion = new Set<number>();

  loading   = false;
  docentes: DocenteConAsignacion[] = [];

  generandoPorDocente = new Set<number>();

  onRolChange(): void {
    this.docentes = [];
    this.proyectosAceptacion = [];
    if (!this.rolSeleccionado) return;
    this.cargar();
  }

  cargar(): void {
    if (!this.rolSeleccionado) return;
    this.loading = true;

    if (this.rolSeleccionado === 'ACEPTACION') {
      this.proyectosService.proyectosConAceptacion()
        .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
        .subscribe({
          next: (data) => { this.proyectosAceptacion = data ?? []; },
          error: () => {
            this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la lista de proyectos.', life: 8000 });
          }
        });
      return;
    }

    this.proyectosService.docentesConAsignacion(this.rolSeleccionado)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (data) => { this.docentes = data ?? []; },
        error: () => {
          this.toast.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudo cargar la lista de docentes.',
            life: 8000
          });
        }
      });
  }

  estaGenerando(idDocente: number): boolean {
    return this.generandoPorDocente.has(idDocente);
  }

  private descargarPdf(blob: Blob, nombreArchivo: string): void {
    if (!blob || blob.size === 0) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = nombreArchivo;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  estaGenerandoAceptacion(idProyecto: number): boolean {
    return this.generandoAceptacion.has(idProyecto);
  }

  generarAceptacion(p: ProyectoAceptacion): void {
    this.generandoAceptacion.add(p.idProyecto);
    this.cdr.markForCheck();

    this.proyectosService.descargarAceptacionAnteproyecto(p.idProyecto)
      .pipe(finalize(() => {
        this.generandoAceptacion.delete(p.idProyecto);
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (blob: Blob) => {
          if (blob && blob.size > 0) {
            this.descargarPdf(blob, `Aceptacion_Reporte_Preliminar_${p.idProyecto}.pdf`);
            this.toast.add({ severity: 'success', summary: 'Documento generado', detail: 'Se descargó la aceptación del reporte preliminar.', life: 5000 });
          }
        },
        error: (err: any) => {
          const msg = typeof err?.error === 'string' ? err.error : 'No se pudo generar la aceptación.';
          this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 8000 });
        }
      });
  }

  generarOficio(docente: DocenteConAsignacion): void {
    if (!this.rolSeleccionado || this.rolSeleccionado === 'ACEPTACION') return;

    this.generandoPorDocente.add(docente.idDocente);
    this.cdr.markForCheck();

    this.proyectosService.regenerarOficioConsolidadoDeDocente(this.rolSeleccionado, docente.idDocente)
      .pipe(finalize(() => {
        this.generandoPorDocente.delete(docente.idDocente);
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (res: HttpResponse<Blob>) => {
          if (res.body instanceof Blob && res.body.size > 0) {
            const cd    = res.headers?.get('Content-Disposition') ?? '';
            const match = cd.match(/filename[^;=\n]*=(['"]?)([^'";\n]*)\1/);
            const nombreArchivo = match?.[2]?.trim() || `Oficio_${docente.nombre}.pdf`;
            this.descargarPdf(res.body, nombreArchivo);

            this.toast.add({
              severity: 'success',
              summary: 'Oficio generado',
              detail: `Se generó el oficio consolidado de ${docente.nombre}.`,
              life: 5000
            });
          }
        },
        error: (err: any) => {
          if (err?.error instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
              let msg = 'No se pudo generar el oficio.';
              try {
                const json = JSON.parse(reader.result as string);
                msg = json?.message ?? json ?? msg;
              } catch {
                msg = (reader.result as string) || msg;
              }
              this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 8000 });
              this.cdr.markForCheck();
            };
            reader.readAsText(err.error);
            return;
          }
          const msg = err?.error?.message ?? err?.message ?? 'No se pudo generar el oficio.';
          this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 8000 });
        }
      });
  }
}
