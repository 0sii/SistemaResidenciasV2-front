import { Component, inject, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { AuthService } from '../../service/auth.service';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { TableModule } from 'primeng/table';
import { ProgressSpinner } from 'primeng/progressspinner';
import { SelectModule } from 'primeng/select';
import { Tag } from 'primeng/tag';

import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocentesService } from '../../service/docentes.service';

import {
  DocenteProyectoDashboardItem,
  ProyectosService
} from '../../service/proyectos.service';

import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';

interface DisponiblesParaAsignacionResponse {
  limiteRevisor: number;
  limiteAsesor: number;
  limitePorDocente: number;
  misRevisiones: number;
  misAsesorias: number;
  limiteRevisorAlcanzado: boolean;
  limiteAsesorAlcanzado: boolean;
  yaAlcanceLimite: boolean;
  rolElegido: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO' | null;
  proyectoElegidoId: number | null;
  totalDocentes: number;
  proyectos: any[];
}

type FiltroRol = {
  label: string;
  value: number | null;
};

@Component({
  selector: 'app-docente-proyecto-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ProgressSpinner,
    Tag,

    TableModule,
    SelectModule,
    ButtonModule,
    CommonModule,
    FormsModule,
    ToastModule,
    DialogModule,
  ],
  providers: [MessageService],
  templateUrl: './docente-proyecto-dashboard.html',
  styleUrl: './docente-proyecto-dashboard.css'
})
export class DocenteProyectoDashboard implements OnInit {

  private proyectosService = inject(ProyectosService);
  private auth             = inject(AuthService);
  private router           = inject(Router);
  private docenteService   = inject(DocentesService);
  private toast            = inject(MessageService);
  private cdr              = inject(ChangeDetectorRef);

  loading   = false;
  error     = '';
  idDocente = 0;

  filtroRol: FiltroRol[] = [
    { label: 'Todos',                   value: null },
    { label: 'Revisor de anteproyecto', value: 1 },
    { label: 'Asesor interno',          value: 2 },
    { label: 'Revisor de residencia',   value: 3 },
    { label: 'Revisor de proyecto',     value: 4 }
  ];

  rolSeleccionado: number | null = null;

  proyectosAll: DocenteProyectoDashboardItem[] = [];
  proyectos:    DocenteProyectoDashboardItem[] = [];

  activeTab: 'asignados' | 'disponibles' = 'asignados';

  disponiblesData: DisponiblesParaAsignacionResponse | null = null;

  loadingDisponibles     = false;
  showConfirmDialog      = false;
  proyectoSeleccionado: any = null;
  rolSeleccionadoAutoAsign: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO' | null = null;
  asignando              = false;

  disponibles: any[]     = [];
  yaAlcanceLimite        = false;
  rolYaElegido: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO' | null = null;
  proyectoYaElegidoId: number | null = null;
  limitePorDocente       = 1;

  // ── Init ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const user: any = this.auth.getUser();

    if (!user?.id) {
      this.error = 'No se pudo identificar la sesión.';
      return;
    }

    this.docenteService.getByIdUsuario(user.id).subscribe({
      next: (data) => {
        this.idDocente = Number(data?.id ?? 0);

        if (!this.idDocente) {
          this.error = 'No se pudo identificar al docente.';
          return;
        }

        this.cargar();
      },
      error: () => {
        this.error = 'No se pudo cargar la información del docente.';
      }
    });
  }

  // ── Mis proyectos ─────────────────────────────────────────────────────
  cargar(): void {
    this.loading = true;
    this.error   = '';

    this.proyectosService
      .misProyectosDashboard(this.idDocente)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next:  (data) => { this.proyectosAll = data ?? []; this.aplicarFiltroLocal(); },
        error: () => { this.error = 'No se pudieron cargar tus proyectos.'; }
      });
  }

  onRolChange(): void { this.aplicarFiltroLocal(); }

  private aplicarFiltroLocal(): void {
    this.proyectos = this.rolSeleccionado == null
      ? [...this.proyectosAll]
      : this.proyectosAll.filter(p => p.idTipoRelacion === this.rolSeleccionado);
    this.cdr.markForCheck();
  }

  // ── Disponibles ───────────────────────────────────────────────────────
  cargarDisponibles(): void {
    this.loadingDisponibles = true;

    this.proyectosService
      .getProyectosDisponiblesParaAsignacion()
      .pipe(finalize(() => { this.loadingDisponibles = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (data: any) => {
          this.disponiblesData = data;
          this._actualizarEstadoDisponibles();
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudieron cargar los proyectos disponibles.',
            life: 8000
          });
        }
      });
  }

  private _actualizarEstadoDisponibles(): void {
    const d = this.disponiblesData;

    if (!d) {
      this.disponibles         = [];
      this.yaAlcanceLimite     = false;
      this.rolYaElegido        = null;
      this.proyectoYaElegidoId = null;
      this.limitePorDocente    = 1;
      return;
    }

    this.disponibles      = d.proyectos ?? [];
    this.limitePorDocente = Math.max(d.limitePorDocente ?? 1, 1);
    this.yaAlcanceLimite  = d.yaAlcanceLimite ?? false;

    // Mapear el rol y proyecto ya elegido que devuelve la API
    this.rolYaElegido        = d.rolElegido        ?? null;
    this.proyectoYaElegidoId = d.proyectoElegidoId ?? null;
  }

  // ── Tabs ──────────────────────────────────────────────────────────────
  cambiarTab(tab: 'asignados' | 'disponibles'): void {
    this.activeTab = tab;

    if (tab === 'disponibles') {
      this.cargarDisponibles();
    }

    this.cdr.markForCheck();
  }

  // ── Confirm dialog ────────────────────────────────────────────────────
  abrirConfirm(proyecto: any, rol: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO'): void {
    this.proyectoSeleccionado    = proyecto;
    this.rolSeleccionadoAutoAsign = rol;
    this.showConfirmDialog        = true;
    this.cdr.markForCheck();
  }

  private descargarPdfOficio(blob: Blob, nombreArchivo: string): void {
    if (!blob || blob.size === 0) {
      console.warn('PDF de oficio vacío o no disponible.');
      return;
    }

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

  confirmarAutoAsignacion(): void {
    if (!this.proyectoSeleccionado || !this.rolSeleccionadoAutoAsign) return;

    this.asignando = true;

    this.proyectosService
      .autoAsignarme(this.proyectoSeleccionado.id, this.rolSeleccionadoAutoAsign)
      .pipe(finalize(() => { this.asignando = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (res: any) => {
          this.showConfirmDialog = false;

          if (res?.body instanceof Blob && res.body.size > 0) {
            const cd    = res.headers?.get('Content-Disposition') ?? '';
            const match = cd.match(/filename[^;=\n]*=(['"]?)([^'";\n]*)\1/);
            const nombreArchivo = match?.[2]?.trim() || `Oficio_${this.rolSeleccionadoAutoAsign}.pdf`;

            this.descargarPdfOficio(res.body, nombreArchivo);
          }

          this.toast.add({
            severity: 'success',
            summary: 'Asignación realizada',
            detail: 'Te has asignado correctamente.',
            life: 5000
          });

          this.cargar();
          this.cargarDisponibles();
        },
        error: (err: any) => {
          // Manejo de errores con body Blob (p.ej. respuesta PDF con error)
          if (err?.error instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
              let msg = 'No se pudo completar la asignación.';
              try {
                const json = JSON.parse(reader.result as string);
                msg = json?.message ?? json ?? msg;
              } catch {
                msg = (reader.result as string) || msg;
              }
              this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 10000 });
              this.cdr.markForCheck();
            };
            reader.readAsText(err.error);
            return;
          }

          const msg = err?.error?.message ?? err?.message ?? 'No se pudo realizar la asignación.';
          this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 8000 });
        }
      });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  verProyecto(row: DocenteProyectoDashboardItem): void {
    this.router.navigate(['/docente/proyectos', row.idProyecto], {
      queryParams: { rol: row.idTipoRelacion }
    });
  }

  rolLabel(rol: string): string {
    switch (rol) {
      case 'REVISOR_ANTEPROYECTO': return 'Revisor de anteproyecto';
      case 'ASESOR_INTERNO':       return 'Asesor interno';
      default:                     return rol;
    }
  }

  rolSeverityById(id: number): 'secondary' | 'success' | 'info' | 'warn' | 'danger' | 'contrast' | null | undefined {
    switch (id) {
      case 1:  return 'info';
      case 2:  return 'success';
      case 3:  return 'warn';
      case 4:  return 'danger';
      default: return 'secondary';
    }
  }

  rolClassById(id: number): string {
    switch (id) {
      case 1:  return 'tag-revisor';
      case 2:  return 'tag-asesor';
      default: return '';
    }
  }

  estadoSeverityById(id: number): 'secondary' | 'success' | 'info' | 'warn' | 'danger' | 'contrast' | null | undefined {
    switch (id) {
      case 3:  return 'warn';
      case 4:  return 'warn';
      case 5:  return 'success';
      case 6:  return 'info';
      case 9:  return 'danger';
      default: return 'secondary';
    }
  }

  estadoClassById(id: number): string {
    switch (id) {
      case 3:  return 'estado-pendiente';
      case 4:  return 'estado-revision';
      case 5:  return 'estado-aprobado';
      default: return '';
    }
  }
  toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

}
