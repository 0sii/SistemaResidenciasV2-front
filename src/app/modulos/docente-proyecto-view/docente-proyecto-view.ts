import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ProgressSpinner } from 'primeng/progressspinner';
import { Tag } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { DividerModule } from 'primeng/divider';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { EstadosPagedResponse, EstadosService } from '../../service/estado.service';
import { catchError, map, switchMap } from 'rxjs/operators';
import { InputNumberModule } from 'primeng/inputnumber';
import { AccordionModule } from 'primeng/accordion';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';

import { ProyectoDocentesService } from '../../service/proyecto-docentes.service';
import { AuthService } from '../../service/auth.service';
import { ProyectoDocenteViewResponse } from '../../Interface/InterfaceDocenteProyecto';
import { ProyectosService } from '../../service/proyectos.service';
import { EntregablesService, EntregableDetalleDto } from '../../service/entregables.service';
import { Proyecto } from '../../Interface/InterfaceProyecto';
import { EmailService } from '../../service/email.service';
import { DocumentosService, EstadoRevisionDocumento  } from '../../service/documentos.service';
import { FechaEsPipe } from '../../pipe/fecha-es.pipe';

type Dictamen = 'REVISADO' | 'ACEPTADO' | 'RECHAZADO';
type DictamenApi = 'CAMBIOS' | 'APROBADO' | 'RECHAZADO';
type DictamenUI = 'REVISADO' | 'ACEPTADO' | 'RECHAZADO';
type EstadoVisible = 'POR_REVISAR' | 'REVISADO' | 'ACEPTADO' | 'RECHAZADO';


interface AnteproyectoRow {
  idVersion: number;
  idEntregable: number;
  numeroVersion: number;
  fechaSubida: string;
  nombreOriginal: string;
  tamanoBytes: number;

  totalRevisiones: number;
  subidoPor?: string | null;
  idEstudianteSubio?: number | null;

  // ✅ ahora por ID (NO string)
  idEstadoEntregable?: number | null;

  // ✅ visibles por versión
  ultimoDictamen?: string | null;
  ultimaObservacion?: string | null;
  fechaUltimaRevision?: string | null;
  estadoVisible?: EstadoVisible;
}


@Component({
  selector: 'app-docente-proyecto-view',
  imports: [
    CommonModule,
    FormsModule,
    ProgressSpinner,
    Tag,
    TableModule,
    DividerModule,
    ButtonModule,
    DialogModule,
    AccordionModule,
    TextareaModule,
    ToastModule,
    TooltipModule,
    InputNumberModule,
    NgxExtendedPdfViewerModule,
    FechaEsPipe
  ],
  templateUrl: './docente-proyecto-view.html',
  styleUrl: './docente-proyecto-view.css',
  providers: [MessageService]
})
export class DocenteProyectoView {
  private svc = inject(ProyectoDocentesService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private entregablesSvc = inject(EntregablesService);
  private toast = inject(MessageService);
  private proyectosSvc = inject(ProyectosService);
  private estadosSvc = inject(EstadosService);
  private emailSvc = inject(EmailService);
private documentoSvc = inject (DocumentosService)
  private estadosMap = new Map<number, string>();
private cdr = inject(ChangeDetectorRef);
  

  loading = false;
  error = '';

  idUsuario = 0;
  idProyecto = 0;

  // ✅ rol activo (override por URL ?rol=)
  rolOverrideId: number | null = null;

  data: ProyectoDocenteViewResponse | null = null;

  // ✅ Anteproyecto
  anteLoading = false;
  anteError = '';
  documentos: AnteproyectoRow[] = [];
  private readonly TIPO_ANTEPROYECTO = 1;
  private readonly TIPO_REPORTE_PARCIAL_1 = 2;
  private readonly TIPO_REPORTE_PARCIAL_2 = 3;
  private readonly TIPO_REPORTE_FINAL = 4;

  // ✅ Reporte parcial 1 (Etapa 2)
  rp1Loading = false;
  rp1Error = '';
  rp1Docs: AnteproyectoRow[] = [];
  rp1EntregableIdEstado: number | null = null;
  rp1EntregableEstadoDescripcion: string | null = null;

  rp1EntregableId: number | null = null;

  // ✅ Reporte parcial 2 (Etapa 3)
  rp2Loading = false;
  rp2Error = '';
  rp2Docs: AnteproyectoRow[] = [];
  rp2EntregableIdEstado: number | null = null;
  rp2EntregableEstadoDescripcion: string | null = null;

  rp2EntregableId: number | null = null;

  // ✅ Reporte final (Etapa 4)
  rfLoading = false;
  rfError = '';
  rfDocs: AnteproyectoRow[] = [];
  rfEntregableIdEstado: number | null = null;
  rfEntregableEstadoDescripcion: string | null = null;

  rfEntregableId: number | null = null;

  // ✅ Estados Entregable (IDs reales)
  private readonly EST_ENT_PENDIENTE = 1;
  private readonly EST_ENT_EN_REVISION = 2;
  private readonly EST_ENT_CAMBIOS = 3;
  private readonly EST_ENT_APROBADO = 4;
  private readonly EST_ENT_RECHAZADO = 5;
  private readonly EST_ENT_CANCELADO = 6;

  // ✅ Estados del PROYECTO (según tu seed)
  private readonly EST_PROY_ESPERA_REVISION_ANTEPROYECTO = 4;
  private readonly EST_PROY_ANTEPROYECTO_REVISADO = 5; // ⭐ NUEVO
  private readonly EST_PROY_CANCELADO = 9;             // ⭐ CORRECTO (antes lo tenías como 8)

  private readonly EST_PROY_ASIGNAR_ASESOR_INTERNO = 6; // <-- CAMBIA por el ID real


  // ✅ Revisión dialog
  observaciones = '';
  showRevisarDialog = false;
  revisandoRow: AnteproyectoRow | null = null;
  guardandoRevision = false;

  // ✅ Revisión Reporte parcial 1
  rp1Observaciones = '';
  showRp1RevisarDialog = false;
  revisandoRp1Row: AnteproyectoRow | null = null;
  guardandoRp1Revision = false;
  rp1DocenteArchivoSeleccionado: File | null = null;

  // ✅ Revisión Reporte parcial 2
  rp2Observaciones = '';
  showRp2RevisarDialog = false;
  revisandoRp2Row: AnteproyectoRow | null = null;
  guardandoRp2Revision = false;
  rp2DocenteArchivoSeleccionado: File | null = null;

  // ✅ Revisión Reporte final
  rfObservaciones = '';
  showRfRevisarDialog = false;
  revisandoRfRow: AnteproyectoRow | null = null;
  guardandoRfRevision = false;
  rfDocenteArchivoSeleccionado: File | null = null;


  // ✅ Estados visibles
  anteEntregableIdEstado: number | null = null;
  anteEntregableEstadoDescripcion: string | null = null; // opcional para UI

  proyectoAceptando = false;
  proyectoCancelando = false;

  // ✅ Para banner de cancelación (heurística por texto)
  proyectoEstadoLabel: string = '';
  proyectoCancelado: boolean = false;

  displayDialog: boolean = false;  // Controla la visibilidad del diálogo
  pdfUrl: string | null = null;

  // ✅ Para saber si existe cabecera de anteproyecto
anteEntregableId: number | null = null;

// ✅ Accordion: SOLO 1 abierto (multiple=false en HTML)
accordionValue: '0' | '1' | '2' | '3' | '4' = '0';
private _accSyncPending = false;

// ✅ Loading por reporte (no compartido)
cambiandoEstadoReporte: Record<'rp1' | 'rp2' | 'rf', boolean> = { rp1: false, rp2: false, rf: false };

private readonly TIPO_ACTA = 12;
actaMap: Record<number, any> = {};
actasLoading = false;

  ngOnInit(): void {
    const user = this.auth.getUser();
    this.idUsuario = Number((user as any)?.id ?? 0);
    this.idProyecto = Number(this.route.snapshot.paramMap.get('idProyecto') ?? 0);

    this.rolOverrideId = Number(this.route.snapshot.queryParamMap.get('rol') ?? 0) || null;

    if (!this.idUsuario || !this.idProyecto) {
      this.error = 'Parámetros inválidos (idUsuario / idProyecto).';
      return;
    }

    this.cargarEstadosProyecto();

    this.cargar();
    this.cargarAnteproyecto();
  }

  readonly EstadoRevisionDocumento = EstadoRevisionDocumento;

private getActaEstadoRevision(acta: any): number {
  const n = Number(
    acta?.estadoRevision ??
    acta?.EstadoRevision ??
    acta?.idEstadoRevision ??
    acta?.IdEstadoRevision ??
    NaN
  );

  if (Number.isFinite(n)) return n;

  const txt = String(
    acta?.estadoRevisionTexto ??
    acta?.EstadoRevisionTexto ??
    acta?.revisionEstado ??
    acta?.RevisionEstado ??
    ''
  ).trim().toUpperCase();

  if (txt.includes('ACEPT')) return EstadoRevisionDocumento.Aceptado;
  if (txt.includes('RECHAZ')) return EstadoRevisionDocumento.Rechazado;

  return EstadoRevisionDocumento.EnRevision;
}

private normalizarActaRow(row: any): any {
  const estadoRevisionTexto = String(
    row?.estadoRevisionTexto ??
    row?.EstadoRevisionTexto ??
    row?.revisionEstado ??
    row?.RevisionEstado ??
    ''
  ).trim();

  const estadoRevisionNum = Number(
    row?.estadoRevision ??
    row?.EstadoRevision ??
    row?.idEstadoRevision ??
    row?.IdEstadoRevision ??
    NaN
  );

  let estadoRevision = Number.isFinite(estadoRevisionNum)
    ? estadoRevisionNum
    : EstadoRevisionDocumento.EnRevision;

  if (!Number.isFinite(estadoRevisionNum)) {
    const txt = estadoRevisionTexto.toUpperCase();

    if (txt.includes('ACEPT')) {
      estadoRevision = EstadoRevisionDocumento.Aceptado;
    } else if (txt.includes('RECHAZ')) {
      estadoRevision = EstadoRevisionDocumento.Rechazado;
    } else {
      estadoRevision = EstadoRevisionDocumento.EnRevision;
    }
  }

  return {
    ...row,
    id: Number(
      row?.id ??
      row?.Id ??
      row?.idDocumento ??
      row?.IdDocumento ??
      0
    ),

    idDocumento: Number(
      row?.idDocumento ??
      row?.IdDocumento ??
      row?.id ??
      row?.Id ??
      0
    ),

    idEstudiante: Number(
      row?.idEstudiante ??
      row?.IdEstudiante ??
      row?.idAlumno ??
      row?.IdAlumno ??
      row?.estudianteId ??
      row?.EstudianteId ??
      0
    ),

    nombreOriginal: String(
      row?.nombreOriginal ??
      row?.NombreOriginal ??
      row?.archivo ??
      row?.Archivo ??
      ''
    ).trim(),

    contentType: String(
      row?.contentType ??
      row?.ContentType ??
      'application/pdf'
    ).trim(),

    tamanoBytes: Number(row?.tamanoBytes ?? row?.TamanoBytes ?? 0),

    estadoRevision,
    estadoRevisionTexto,
    comentarioRevision: String(
      row?.comentarioRevision ??
      row?.ComentarioRevision ??
      row?.observacionesRevision ??
      row?.ObservacionesRevision ??
      ''
    ).trim(),

    fechaRevision:
      row?.fechaRevision ??
      row?.FechaRevision ??
      null,

    revisadoPorUsuarioId: Number(
      row?.revisadoPorUsuarioId ??
      row?.RevisadoPorUsuarioId ??
      0
    ) || null,

    fechaSubida:
      row?.fechaSubida ??
      row?.FechaSubida ??
      null
  };
}

isActaAceptada(acta: any): boolean {
  return this.getActaEstadoRevision(acta) === EstadoRevisionDocumento.Aceptado;
}

isActaRechazada(acta: any): boolean {
  return this.getActaEstadoRevision(acta) === EstadoRevisionDocumento.Rechazado;
}

isActaEnRevision(acta: any): boolean {
  return !!acta && this.getActaEstadoRevision(acta) === EstadoRevisionDocumento.EnRevision;
}

actaEstadoTexto(acta: any): string {
  if (!acta) return 'Pendiente';

  const estado = this.getActaEstadoRevision(acta);

  switch (estado) {
    case EstadoRevisionDocumento.Aceptado:
      return 'Aceptado ✅';
    case EstadoRevisionDocumento.Rechazado:
      return 'Rechazado ❌';
    default:
      return 'En revisión ⏳';
  }
}

actaEstadoClase(acta: any): string {
  if (!acta) return 'px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-700';

  const estado = this.getActaEstadoRevision(acta);

  switch (estado) {
    case EstadoRevisionDocumento.Aceptado:
      return 'px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700';
    case EstadoRevisionDocumento.Rechazado:
      return 'px-2 py-1 rounded-full text-xs bg-red-100 text-red-700';
    default:
      return 'px-2 py-1 rounded-full text-xs bg-sky-100 text-sky-700';
  }
}

puedeReemplazarActa(e: any): boolean {
  if (!this.puedeGestionarActasResidencia) return false;

  const acta = this.actaMap[this.estId(e)];

  // si no existe, se puede subir
  if (!acta) return true;

  // solo si fue rechazada se puede reemplazar
  return this.isActaRechazada(acta);
}

  clickActaInput(e: any): void {
  const id = this.estId(e);
  const el = document.getElementById(`actaInput-${id}`) as HTMLInputElement;
  el?.click();
}

onActaSelected(e: any, event: Event): void {
  const idEstudiante = this.estId(e);
  const input = event.target as HTMLInputElement;
  const file = input?.files?.[0] ?? null;
  if (input) input.value = '';
  if (!file) return;

  const name = (file.name ?? '').toLowerCase();
  if (!name.endsWith('.pdf')) {
    this.toast.add({ severity: 'warn', summary: 'Solo PDF', detail: 'Selecciona un archivo .pdf', life: 7000 });
    return;
  }

  this.documentoSvc.subirActaResidencia(this.idProyecto, idEstudiante, file).subscribe({
    next: () => {
      this.toast.add({ severity: 'success', summary: 'Listo', detail: 'Acta actualizada.', life: 7000 });
      this.cargarActas();
    },
    error: (err) => {
      console.error(err);
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo subir el acta.', life: 8000 });
    }
  });
}

verActa(e: any): void {
  const idEstudiante = this.estId(e);
  this.liberarPdfUrl();
  this.documentoSvc.descargarExpedienteByEstudiante(idEstudiante, this.TIPO_ACTA).subscribe({
    next: (blob: Blob) => {
      if (blob.type !== 'application/pdf') return;
      this.pdfUrl = URL.createObjectURL(blob);
      this.displayDialog = true;
    },
    error: (err) => {
      console.error(err);
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo abrir el acta.', life: 8000 });
    }
  });
}

descargarActa(e: any): void {
  const idEstudiante = this.estId(e);
  this.documentoSvc.descargarExpedienteByEstudiante(idEstudiante, this.TIPO_ACTA).subscribe({
    next: (blob: Blob) => {
      const nombre = this.actaMap?.[idEstudiante]?.nombreOriginal || 'acta.pdf';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    error: (err) => {
      console.error(err);
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar el acta.', life: 8000 });
    }
  });
}


get estudiantesProyecto(): any[] {
  return Array.isArray(this.data?.estudiantes) ? this.data!.estudiantes : [];
}

get puedeGestionarActasResidencia(): boolean {
  return this.isAsesorInterno()
    && !this.proyectoCancelado
    && Number(this.rfEntregableIdEstado ?? 0) === this.EST_ENT_APROBADO;
}

get totalActasCargadas(): number {
  return this.estudiantesProyecto.filter(e => !!this.actaMap[this.estId(e)]).length;
}

get totalActasPendientes(): number {
  return Math.max(this.estudiantesProyecto.length - this.totalActasCargadas, 0);
}

get todasActasCargadas(): boolean {
  return this.estudiantesProyecto.length > 0 && this.totalActasPendientes === 0;
}

get mensajeActaResidencia(): string {
  if (this.proyectoCancelado) {
    return 'El proyecto está cancelado.';
  }

  if (Number(this.rfEntregableIdEstado ?? 0) !== this.EST_ENT_APROBADO) {
    return 'Esta etapa se habilita cuando el reporte final haya sido aprobado.';
  }

  if (this.todasActasCargadas) {
    return 'Todas las actas ya fueron cargadas. El cierre final lo realiza Jefatura de Vinculación al aceptar el expediente completo.';
  }

  return 'Sube el acta de residencia profesional por cada alumno. Después, Jefatura de Vinculación validará el expediente final para cerrar el proyecto.';
}

  estId(e: any): number {
  return Number(e?.id ?? e?.Id ?? 0);
}

private cargarActas(): void {
  if (!this.isAsesorInterno()) return;

  this.actasLoading = true;

  this.documentoSvc.getActasResidenciaByProyecto(this.idProyecto)
    .pipe(finalize(() => (this.actasLoading = false)))
    .subscribe({
      next: (rows: any[]) => {
        const map: Record<number, any> = {};

        for (const raw of (rows ?? [])) {
          const acta = this.normalizarActaRow(raw);

          const idEst = Number(
            acta?.idEstudiante ??
            acta?.IdEstudiante ??
            0
          );

          if (!idEst) continue;

          map[idEst] = acta;
        }

        this.actaMap = { ...map };
        this.cdr.detectChanges();
        this.scheduleAccordionSync();
      },
      error: (e) => {
        console.error(e);
        this.actaMap = {};
        this.toast.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar las actas.',
          life: 8000
        });
        this.cdr.detectChanges();
        this.scheduleAccordionSync();
      }
    });
}

  private scheduleAccordionSync(): void {
  if (this._accSyncPending) return;
  this._accSyncPending = true;

  queueMicrotask(() => {
    this._accSyncPending = false;
    this.accordionValue = this.computeAccordionValue();
  });
}

private computeAccordionValue(): '0' | '1' | '2' | '3' | '4' {
  // Etapa 1
  if (!this.isEntregableCerrado(this.anteEntregableIdEstado)) return '0';

  // Etapas 2, 3 y 4
  if (this.canVerEtapasPosteriores() && !this.isEntregableCerrado(this.rp1EntregableIdEstado)) return '1';
  if (this.canVerEtapasPosteriores() && !this.isEntregableCerrado(this.rp2EntregableIdEstado)) return '2';
  if (this.canVerEtapasPosteriores() && !this.isEntregableCerrado(this.rfEntregableIdEstado)) return '3';

  // Actas
  if (this.isAsesorInterno() && Number(this.rfEntregableIdEstado ?? 0) === this.EST_ENT_APROBADO) {
    return '4';
  }

  // fallback
  return this.canVerEtapasPosteriores() ? '3' : '0';
}

onAccordionClose(_: any): void {
  // si intentan cerrar el activo, lo recalculamos y lo reabrimos
  this.scheduleAccordionSync();
}

isAccordionOpen(value: '0' | '1' | '2' | '3' | '4'): boolean {
  return this.accordionValue === value;
}

accordionHeaderClass(value: '0' | '1' | '2' | '3' | '4'): string {
  const open = this.isAccordionOpen(value);

  return open
    ? 'flex-1 min-w-0 flex items-center justify-between gap-3 rounded-2xl border border-sky-200 dark:border-sky-700 bg-white dark:bg-slate-800 px-5 py-4 shadow-sm'
    : 'flex-1 min-w-0 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4 shadow-sm transition-all duration-200 hover:border-sky-200 dark:hover:border-sky-700 hover:shadow-md';
}

// ================================
// Accordion (PrimeNG value API)
// ================================

// banderas para inicializar UNA sola vez cuando ya cargaron estados
private accInitDone = false;
private accLoaded = { ante: false, rp1: false, rp2: false, rf: false };

private panelActivo(): '0' | '1' | '2' | '3' {
  const isActivo = (s: number | null) => s === this.EST_ENT_EN_REVISION || s === this.EST_ENT_CAMBIOS;

  // ✅ solo uno debe estar “en revisión/cambios”; elegimos el primero por orden
  if (isActivo(this.anteEntregableIdEstado)) return '0';
  if (isActivo(this.rp1EntregableIdEstado)) return '1';
  if (isActivo(this.rp2EntregableIdEstado)) return '2';
  if (isActivo(this.rfEntregableIdEstado)) return '3';

  // fallback: si ninguno está en revisión, abre el primero pendiente
  const isPend = (s: number | null) => s === this.EST_ENT_PENDIENTE;
  if (isPend(this.anteEntregableIdEstado)) return '0';
  if (isPend(this.rp1EntregableIdEstado)) return '1';
  if (isPend(this.rp2EntregableIdEstado)) return '2';
  if (isPend(this.rfEntregableIdEstado)) return '3';

  return '0';
}

private tryInitAccordion(force = false): void {
  const listo = this.canVerEtapasPosteriores()
    ? (this.accLoaded.ante && this.accLoaded.rp1 && this.accLoaded.rp2 && this.accLoaded.rf)
    : this.accLoaded.ante;

  if (!force && (this.accInitDone || !listo)) return;

  // 🔥 AQUÍ está la clave: NO acumular, reemplazar.
  this.accInitDone = true;
}

private markLoaded(k: keyof typeof this.accLoaded): void {
  this.accLoaded[k] = true;
  this.tryInitAccordion(false);
}

  // =========================================
// ✅ ACCORDION ETAPAS (PrimeNG nuevo API value)
// - multiple: permite dejar varios abiertos
// - etapa activa: siempre debe quedar abierta
// =========================================
private accordionInitDone = false;

private isEntregableCerrado(idEstado: number | null): boolean {
  const id = Number(idEstado ?? NaN);
  return id === this.EST_ENT_APROBADO || id === this.EST_ENT_RECHAZADO || id === this.EST_ENT_CANCELADO;
}

/** Determina la etapa “activa” por el primer entregable NO cerrado. */
private etapaActivaPanel(): '0' | '1' | '2' | '3' {
  // Si anteproyecto no está cerrado (o ni existe estado aún), es la etapa activa
  if (!this.isEntregableCerrado(this.anteEntregableIdEstado)) return '0';

  // Si RP1 no está cerrado, es la etapa activa
  if (!this.isEntregableCerrado(this.rp1EntregableIdEstado)) return '1';

  // Si RP2 no está cerrado, es la etapa activa
  if (!this.isEntregableCerrado(this.rp2EntregableIdEstado)) return '2';

  // Si nada de lo anterior, final
  return '3';
}


// imports: agrega AccordionModule en @Component.imports

accordionOpenIndexes: number[] = [];
private accordionInit = false;

private etapaActivaIndex(): number {
  // Regla simple por entregables (ajústala si tu negocio usa idEstado del proyecto)
  if (this.anteEntregableIdEstado !== this.EST_ENT_APROBADO) return 0; // Anteproyecto
  if (this.rp1EntregableIdEstado !== this.EST_ENT_APROBADO) return 1;  // RP1
  if (this.rp2EntregableIdEstado !== this.EST_ENT_APROBADO) return 2;  // RP2
  return 3; // Final
}

private ensureEtapaActivaAbierta(): void {
  const idx = this.etapaActivaIndex();

  if (!this.accordionInit) {
    this.accordionOpenIndexes = [idx];
    this.accordionInit = true;
    return;
  }

  if (!this.accordionOpenIndexes.includes(idx)) {
    this.accordionOpenIndexes = [...this.accordionOpenIndexes, idx];
  }
}


  /**
 * ✅ NO dispara toast (para evitar mensajes duplicados).
 * Devuelve información para que el flujo principal muestre UN solo mensaje.
 */
  private actualizarNoResidentesSiAplica(): Promise<{ updated: boolean; changed: boolean; nuevo: number } | null> {
    const actual = this.getNoResidentesActualProyecto();
    const nuevo = Number(this.nuevoNoResidentes ?? NaN);

    this.noResidentesError = null;

    if (!Number.isFinite(nuevo) || nuevo < this.minNoResidentesPermitido) {
      this.noResidentesError = `Debe ser >= ${this.minNoResidentesPermitido}.`;
      return Promise.resolve(null);
    }
    if (nuevo > 20) {
      this.noResidentesError = 'Máximo permitido: 20.';
      return Promise.resolve(null);
    }

    // si no cambió, no hacemos nada
    if (nuevo === actual) {
      return Promise.resolve({ updated: true, changed: false, nuevo });
    }

    return new Promise((resolve) => {
      this.proyectosSvc.getById(this.idProyecto).pipe(
        map((p: Proyecto) => ({ ...p, noResidentes: nuevo } as any)),
        switchMap((payload: any) =>
          this.proyectosSvc.update(this.idProyecto, payload).pipe(map(() => payload))
        )
      ).subscribe({
        next: () => resolve({ updated: true, changed: true, nuevo }),
        error: (e) => {
          console.error(e);
          resolve({ updated: false, changed: true, nuevo });
        }
      });
    });
  }



  // ✅ Cambio de integrantes (solo al aprobar)
  nuevoNoResidentes: number = 1;
  noResidentesError: string | null = null;

  get minNoResidentesPermitido(): number {
    const n = Number((this.data as any)?.estudiantes?.length ?? 1);
    return Math.max(1, n); // mínimo: no menos que los alumnos ya asignados
  }

  private getNoResidentesActualProyecto(): number {
    const p: any = (this.data as any)?.proyecto ?? null;
    const n = Number(p?.noResidentes ?? p?.NoResidentes ?? NaN);
    return Number.isFinite(n) && n > 0 ? n : this.minNoResidentesPermitido;
  }


  // ✅ nuevo
  docenteArchivoSeleccionado: File | null = null;

  onDocenteFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = (input?.files && input.files.length) ? input.files[0] : null;
    this.docenteArchivoSeleccionado = file;
  }

  limpiarArchivoDocente(): void {
    this.docenteArchivoSeleccionado = null;
  }

  onRp1DocenteFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = (input?.files && input.files.length) ? input.files[0] : null;
    this.rp1DocenteArchivoSeleccionado = file;
  }

  limpiarArchivoRp1Docente(): void {
    this.rp1DocenteArchivoSeleccionado = null;
  }




  

onRp2DocenteFileSelected(evt: any): void {
  const f = evt?.target?.files?.[0] ?? null;
  this.rp2DocenteArchivoSeleccionado = f ? (f as File) : null;
}

limpiarArchivoRp2Docente(): void {
  this.rp2DocenteArchivoSeleccionado = null;
}

onRfDocenteFileSelected(evt: any): void {
  const f = evt?.target?.files?.[0] ?? null;
  this.rfDocenteArchivoSeleccionado = f ? (f as File) : null;
}

limpiarArchivoRfDocente(): void {
  this.rfDocenteArchivoSeleccionado = null;
}private actualizarEstadoProyectoPorDictamen(dictamenUI: DictamenUI): void {
    if (this.proyectoCancelado) return;

    const idEstadoActual = Number(
      (this.data as any)?.proyecto?.idEstado ??
      (this.data as any)?.proyecto?.IdEstado ??
      0
    );

    const estadosValidos = [
      this.EST_PROY_ESPERA_REVISION_ANTEPROYECTO, // 4
      this.EST_PROY_ANTEPROYECTO_REVISADO        // 5
    ];

    if (!estadosValidos.includes(idEstadoActual)) return;

    let nuevoEstado: number;

    if (dictamenUI === 'ACEPTADO') {
      nuevoEstado = this.EST_PROY_ASIGNAR_ASESOR_INTERNO; // 6
    } else if (dictamenUI === 'RECHAZADO') {
      nuevoEstado = this.EST_PROY_CANCELADO; // 9
    } else {
      return;
    }

    this.proyectosSvc.getById(this.idProyecto).pipe(
      map((p: Proyecto) => ({ ...p, idEstado: nuevoEstado })),
      switchMap((payload: Proyecto) =>
        this.proyectosSvc.update(this.idProyecto, payload)
      )
    ).subscribe({
      next: () => {
        // 🔥 actualización LOCAL inmediata
        if (this.data?.proyecto) {
          (this.data.proyecto as any).idEstado = nuevoEstado;
          this.proyectoEstadoLabel = this.getEstadoProyectoLabel(nuevoEstado);
        }

        this.cargar(); // respaldo
      },
      error: (e) => console.error('No se pudo actualizar estado del proyecto', e)
    });
  }



  private cargarEstadosProyecto(): void {
    this.estadosSvc.getAll()
      .pipe(
        map((resp: EstadosPagedResponse) => resp.items ?? []) // ajusta "rows"
      )
      .subscribe({
        next: (rows: any[]) => {
          this.estadosMap.clear();
          for (const r of rows) {
            const id = Number(r?.id ?? r?.Id ?? NaN);
            const desc = String(r?.descripcion ?? r?.Descripcion ?? '').trim();
            if (Number.isFinite(id) && desc) this.estadosMap.set(id, desc);
          }
        },
        error: (e) => console.error('No se pudieron cargar estados', e),
      });
  }

  private getEstadoProyectoLabel(idEstado: number): string {
    return this.estadosMap.get(Number(idEstado)) ?? `Estado #${idEstado}`;
  }

  cargar(): void {
    this.loading = true;
    this.error = '';

    this.svc.proyectoDocenteView(this.idUsuario, this.idProyecto)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.data = res;

          // dentro de next: res => { ... }
if (this.isAsesorInterno()) {
  this.cargarActas();
}
          // ✅ estado del proyecto visible (si existe descripción úsala)
          const desc = String((res as any)?.proyecto?.estadoDescripcion ?? (res as any)?.proyecto?.EstadoDescripcion ?? '').trim();
          const idEstado = Number((res as any)?.proyecto?.idEstado ?? (res as any)?.proyecto?.IdEstado ?? 0);

          this.proyectoEstadoLabel = desc || (idEstado ? this.getEstadoProyectoLabel(idEstado) : 'Estado no disponible');

          this.proyectoCancelado =
            this.norm(this.proyectoEstadoLabel).includes('CANCEL') ||
            idEstado === this.EST_PROY_CANCELADO;

          // ✅ Si este docente puede ver etapas 2-4, cargamos RP1/RP2/Final (solo lectura si es revisor anteproyecto)
          if (this.canVerEtapasPosteriores()) {
            this.cargarReporteParcial1();
            this.cargarReporteParcial2();
            this.cargarReporteFinal();
          }

        },
        error: err => {
          console.error(err);
          this.error = 'No tienes acceso a este proyecto o ocurrió un error al cargar.';
        }
      });
  }




// =========================================
// ✅ Revisión Reporte parcial 2 (Etapa 3)
// =========================================
canRevisarRp2Row(row: AnteproyectoRow): boolean {
  if (!this.canRevisarReporteParcial2()) return false;
  return Number(row?.totalRevisiones ?? 0) === 0;
}

abrirRevisionRp2(row: AnteproyectoRow): void {
  if (!this.canRevisarRp2Row(row)) {
    this.toast.add({
      severity: 'warn',
      summary: 'No permitido',
      detail: 'Este archivo ya fue dictaminado o no tienes el rol para revisarlo.',
      life: 10000
    });
    return;
  }

  this.revisandoRp2Row = row;
  this.rp2Observaciones = '';
  this.rp2DocenteArchivoSeleccionado = null;
  this.showRp2RevisarDialog = true;
}

guardarRevisionRp2(dictamenUI: DictamenUI): void {
  if (!this.revisandoRp2Row) return;

  if (!this.isAsesorInterno()) {
    dictamenUI = 'REVISADO';
  }

  if (Number(this.revisandoRp2Row.totalRevisiones ?? 0) > 0) {
    this.toast.add({ severity: 'warn', summary: 'Ya dictaminado', detail: 'Este archivo ya tiene dictamen.', life: 10000 });
    return;
  }

  const idVersion = Number(this.revisandoRp2Row.idVersion ?? 0);
  if (!idVersion) return;

  const obs = (this.rp2Observaciones || '').trim();

  if (dictamenUI === 'REVISADO' && obs.length < 3) {
    this.toast.add({ severity: 'warn', summary: 'Falta observación', detail: 'Escribe qué debe corregir el alumno.', life: 10000 });
    return;
  }

  this.guardandoRp2Revision = true;

  const payload = {
    dictamen: this.mapDictamenUiToApi(dictamenUI),
    observaciones: obs,
    archivo: this.rp2DocenteArchivoSeleccionado
  };

  this.entregablesSvc.createRevisionWithFile(idVersion, payload).pipe(
    finalize(() => (this.guardandoRp2Revision = false))
  ).subscribe({
    next: () => {
      this.toast.add({
        severity: 'success',
        summary: 'Dictamen guardado',
        detail: 'Se guardó la revisión del Reporte parcial 2.',
        life: 10000
      });

      this.showRp2RevisarDialog = false;
      this.revisandoRp2Row = null;
      this.rp2Observaciones = '';
      this.rp2DocenteArchivoSeleccionado = null;

      this.cargarReporteParcial2();
    },
    error: (e) => {
      console.error(e);
      this.toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo guardar el dictamen.',
        life: 10000
      });
    }
  });
}

// =========================================
// ✅ Revisión Reporte final (Etapa 4)
// =========================================
canRevisarRfRow(row: AnteproyectoRow): boolean {
  if (!this.canRevisarReporteFinal()) return false;
  return Number(row?.totalRevisiones ?? 0) === 0;
}

abrirRevisionRf(row: AnteproyectoRow): void {
  if (!this.canRevisarRfRow(row)) {
    this.toast.add({
      severity: 'warn',
      summary: 'No permitido',
      detail: 'Este archivo ya fue dictaminado o no tienes el rol para revisarlo.',
      life: 10000
    });
    return;
  }

  this.revisandoRfRow = row;
  this.rfObservaciones = '';
  this.rfDocenteArchivoSeleccionado = null;
  this.showRfRevisarDialog = true;
}

guardarRevisionRf(dictamenUI: DictamenUI): void {
  if (!this.revisandoRfRow) return;

  if (!this.isAsesorInterno()) {
    dictamenUI = 'REVISADO';
  }

  if (Number(this.revisandoRfRow.totalRevisiones ?? 0) > 0) {
    this.toast.add({ severity: 'warn', summary: 'Ya dictaminado', detail: 'Este archivo ya tiene dictamen.', life: 10000 });
    return;
  }

  const idVersion = Number(this.revisandoRfRow.idVersion ?? 0);
  if (!idVersion) return;

  const obs = (this.rfObservaciones || '').trim();

  if (dictamenUI === 'REVISADO' && obs.length < 3) {
    this.toast.add({ severity: 'warn', summary: 'Falta observación', detail: 'Escribe qué debe corregir el alumno.', life: 10000 });
    return;
  }

  this.guardandoRfRevision = true;

  const payload = {
    dictamen: this.mapDictamenUiToApi(dictamenUI),
    observaciones: obs,
    archivo: this.rfDocenteArchivoSeleccionado
  };

  this.entregablesSvc.createRevisionWithFile(idVersion, payload).pipe(
    finalize(() => (this.guardandoRfRevision = false))
  ).subscribe({
    next: () => {
      this.toast.add({
        severity: 'success',
        summary: 'Dictamen guardado',
        detail: 'Se guardó la revisión del Reporte final.',
        life: 10000
      });

      this.showRfRevisarDialog = false;
      this.revisandoRfRow = null;
      this.rfObservaciones = '';
      this.rfDocenteArchivoSeleccionado = null;

      this.cargarReporteFinal();
    },
    error: (e) => {
      console.error(e);
      this.toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo guardar el dictamen.',
        life: 10000
      });
    }
  });
}
  private marcarProyectoComoAnteproyectoRevisado(): void {
    if (this.proyectoCancelado) return;

    // ✅ regla: solo cambiar si está en estado 4 (Espera Revisión Anteproyecto)
    const idEstadoActual = Number((this.data as any)?.proyecto?.idEstado ?? (this.data as any)?.proyecto?.IdEstado ?? 0);
    if (idEstadoActual !== this.EST_PROY_ESPERA_REVISION_ANTEPROYECTO) return;

    this.proyectosSvc.getById(this.idProyecto).pipe(
      map((p: Proyecto) => ({ ...p, idEstado: this.EST_PROY_ANTEPROYECTO_REVISADO })),
      switchMap((payload: Proyecto) =>
        this.proyectosSvc.update(this.idProyecto, payload).pipe(
          map(() => payload)
        )
      )
    ).subscribe({
      next: () => {
        // ✅ refresca para que el badge y label se actualicen
        this.toast.add({
          severity: 'info',
          summary: 'Estado del proyecto actualizado',
          detail: 'Proyecto marcado como "Anteproyecto Revisado".', life: 10000
        });
        this.cargar(); // recarga data + estado visible
      },
      error: (e) => {
        console.error(e);
        this.toast.add({
          severity: 'warn',
          summary: 'Aviso',
          detail: 'Se guardó el dictamen, pero no se pudo actualizar el estado del proyecto a "Anteproyecto Revisado".', life: 10000
        });
      }
    });
  }


  private setProyectoEstadoAnteproyectoRevisado(): void {
    // ✅ solo si ya cargamos data.proyecto
    const proyectoActual: any = (this.data as any)?.proyecto;
    if (!proyectoActual) return;

    const idEstadoActual = Number(proyectoActual?.idEstado ?? proyectoActual?.IdEstado ?? 0);

    // ✅ regla sugerida: solo cambiar si está en "Espera Revisión Anteproyecto" (4)
    // Si quieres que lo haga SIEMPRE, quita este if.
    if (idEstadoActual !== this.EST_PROY_ESPERA_REVISION_ANTEPROYECTO) return;

    // ✅ payload: conservamos lo que ya venía, solo cambiamos idEstado
    const payload = {
      ...proyectoActual,
      idEstado: this.EST_PROY_ANTEPROYECTO_REVISADO
    };

    // ⚠️ No sé cuál método exacto tiene tu ProyectosService aquí (update / patch / etc).
    // Para no romper compilación si cambia, lo llamo de forma tolerante:
    const svcAny = this.proyectosSvc as any;

    const req =
      (svcAny.update?.(this.idProyecto, payload)) ??
      (svcAny.updateEstado?.(this.idProyecto, this.EST_PROY_ANTEPROYECTO_REVISADO)) ??
      (svcAny.cambiarEstado?.(this.idProyecto, this.EST_PROY_ANTEPROYECTO_REVISADO));

    if (!req?.subscribe) {
      // Si entras aquí, significa que tu service no tiene ninguno de esos métodos.
      console.warn('No hay método update/updateEstado/cambiarEstado en ProyectosService');
      return;
    }

    req.subscribe({
      next: () => {
        // ✅ actualiza UI local
        proyectoActual.idEstado = this.EST_PROY_ANTEPROYECTO_REVISADO;
        this.proyectoEstadoLabel = this.getEstadoProyectoLabel(this.EST_PROY_ANTEPROYECTO_REVISADO);

        this.toast.add({
          severity: 'info',
          summary: 'Estado actualizado',
          detail: 'Proyecto marcado como "Anteproyecto Revisado".', life: 10000
        });

        // refresca datos por si backend agrega descripción u otra cosa
        this.cargar();
      },
      error: (e: any) => {
        console.error(e);
        this.toast.add({
          severity: 'warn',
          summary: 'Aviso',
          detail: 'Se guardó el dictamen, pero no se pudo actualizar el estado del proyecto a "Anteproyecto Revisado".', life: 10000
        });
      }
    });
  }


  volver(): void {
    this.router.navigate(['/docente/proyectos']);
  }

  cargarAnteproyecto(): void {
  this.anteLoading = true;
  this.anteError = '';
  this.documentos = [];

  this.entregablesSvc.getByProyecto(this.idProyecto).subscribe({
    next: (entregables) => {
      const ante = (entregables ?? []).find((e: any) =>
        Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === this.TIPO_ANTEPROYECTO
      );

      if (!ante) {
        this.anteEntregableId = null;
        this.anteEntregableIdEstado = null;
        this.anteEntregableEstadoDescripcion = null;
        this.anteLoading = false;
        this.scheduleAccordionSync();
        return;
      }

      const idEntregable = Number(ante?.id ?? ante?.id ?? 0);
      if (!idEntregable) {
        this.anteEntregableId = null;
        this.anteEntregableIdEstado = null;
        this.anteEntregableEstadoDescripcion = null;
        this.anteLoading = false;
        this.scheduleAccordionSync();
        return;
      }

      // ✅ marca existencia
      this.anteEntregableId = idEntregable;

      this.entregablesSvc.getDetalle(idEntregable).subscribe({
        next: (det: EntregableDetalleDto) => {
          const cab = (det as any)?.entregable ?? null;

          const idEstadoCab = Number(cab?.idEstadoEntregable ?? cab?.IdEstadoEntregable ?? NaN);
          const descCab = String(cab?.estadoDescripcion ?? cab?.EstadoDescripcion ?? '').trim();

          this.anteEntregableIdEstado = Number.isFinite(idEstadoCab) ? idEstadoCab : null;
          this.anteEntregableEstadoDescripcion = descCab || null;

          const versiones: any[] = (det as any)?.versiones ?? [];
          const revisiones: any[] = (det as any)?.revisiones ?? [];

          this.documentos = versiones
            .slice()
            .sort((a, b) =>
              Number(b?.numeroVersion ?? b?.NumeroVersion ?? 0) -
              Number(a?.numeroVersion ?? a?.NumeroVersion ?? 0)
            )
            .map((v) => {
              const idVer = Number(v?.id ?? v?.Id ?? 0);

              const revsDeVersion = (revisiones ?? [])
                .filter(r => Number(r?.idEntregableVersion ?? r?.IdEntregableVersion) === idVer)
                .slice()
                .sort((a, b) =>
                  Number(b?.numeroRevision ?? b?.NumeroRevision ?? 0) -
                  Number(a?.numeroRevision ?? a?.NumeroRevision ?? 0)
                );

              const last = revsDeVersion.length ? revsDeVersion[0] : null;
              const ultimoDictamen = last ? String(last?.dictamen ?? last?.Dictamen ?? '').trim().toUpperCase() : null;

              const lastRevisionId = last ? Number(last?.id ?? last?.Id ?? 0) : null;
              const lastTieneArchivo = last ? !!(last?.tieneArchivo ?? last?.TieneArchivo) : false;

              return {
                idVersion: idVer,
                idEntregable: Number(v?.idEntregable ?? v?.IdEntregable ?? idEntregable),
                numeroVersion: Number(v?.numeroVersion ?? v?.NumeroVersion ?? 0),
                fechaSubida: v?.fechaSubida ?? v?.FechaSubida,
                nombreOriginal: v?.nombreOriginal ?? v?.NombreOriginal,
                tamanoBytes: Number(v?.tamanoBytes ?? v?.TamanoBytes ?? 0),

                idEstadoEntregable: this.anteEntregableIdEstado,

                totalRevisiones: revsDeVersion.length,
                idEstudianteSubio: v?.idEstudianteSubio ?? v?.IdEstudianteSubio ?? null,
                subidoPor: v?.subidoPor ?? v?.SubidoPor ?? null,

                lastRevisionId,
                lastTieneArchivo,

                ultimoDictamen,
                ultimaObservacion: last ? String(last?.observaciones ?? last?.Observaciones ?? '').trim() : null,
                fechaUltimaRevision: last ? (last?.fechaRevision ?? last?.FechaRevision ?? null) : null,
                estadoVisible: this.estadoVisiblePorVersion({ totalRevisiones: revsDeVersion.length, ultimoDictamen }),
              } as AnteproyectoRow;
            });

          this.anteLoading = false;
          this.scheduleAccordionSync();
        },
        error: (e) => {
          console.error(e);
          this.documentos = [];
          this.anteLoading = false;
          this.anteError = 'No se pudo cargar el detalle del anteproyecto.';
          this.scheduleAccordionSync();
        }
      });
    },
    error: (e) => {
      console.error(e);
      this.documentos = [];
      this.anteLoading = false;
      this.anteError = 'No se pudieron consultar entregables del proyecto.';
      this.scheduleAccordionSync();
    }
  });
}
  // =========================================
  // ✅ CARGA Reporte parcial 1 (tipo 2)
  // =========================================
 cargarReporteParcial1(): void {
  this.rp1Loading = true;
  this.rp1Error = '';
  this.rp1Docs = [];

  this.entregablesSvc.getByProyecto(this.idProyecto).subscribe({
    next: (entregables) => {
      const ent = (entregables ?? []).find((e: any) =>
        Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === this.TIPO_REPORTE_PARCIAL_1
      );

      if (!ent) {
        this.rp1EntregableId = null;
        this.rp1EntregableIdEstado = null;
        this.rp1EntregableEstadoDescripcion = null;
        this.rp1Loading = false;
        this.scheduleAccordionSync();
        return;
      }
      const idEntregable = Number(ent?.id ?? ent?.id ?? 0);
      if (!idEntregable) {
        this.rp1EntregableId = null;
        this.rp1EntregableIdEstado = null;
        this.rp1EntregableEstadoDescripcion = null;
        this.rp1Loading = false;
        this.scheduleAccordionSync();
        return;
      }

      this.rp1EntregableId = idEntregable;

      this.entregablesSvc.getDetalle(idEntregable).subscribe({
        next: (det: EntregableDetalleDto) => {
          const cab = (det as any)?.entregable ?? null;

          const idEstadoCab = Number(cab?.idEstadoEntregable ?? cab?.IdEstadoEntregable ?? NaN);
          const descCab = String(cab?.estadoDescripcion ?? cab?.EstadoDescripcion ?? '').trim();

          this.rp1EntregableIdEstado = Number.isFinite(idEstadoCab) ? idEstadoCab : null;
          this.rp1EntregableEstadoDescripcion = descCab || null;

          const versiones: any[] = (det as any)?.versiones ?? [];
          const revisiones: any[] = (det as any)?.revisiones ?? [];

          this.rp1Docs = versiones
            .slice()
            .sort((a, b) =>
              Number(b?.numeroVersion ?? b?.NumeroVersion ?? 0) -
              Number(a?.numeroVersion ?? a?.NumeroVersion ?? 0)
            )
            .map((v) => {
              const idVer = Number(v?.id ?? v?.Id ?? 0);

              const revsDeVersion = (revisiones ?? [])
                .filter(r => Number(r?.idEntregableVersion ?? r?.IdEntregableVersion) === idVer)
                .slice()
                .sort((a, b) =>
                  Number(b?.numeroRevision ?? b?.NumeroRevision ?? 0) -
                  Number(a?.numeroRevision ?? a?.NumeroRevision ?? 0)
                );

              const last = revsDeVersion.length ? revsDeVersion[0] : null;
              const ultimoDictamen = last ? String(last?.dictamen ?? last?.Dictamen ?? '').trim().toUpperCase() : null;

              const lastRevisionId = last ? Number(last?.id ?? last?.Id ?? 0) : null;
              const lastTieneArchivo = last ? !!(last?.tieneArchivo ?? last?.TieneArchivo) : false;

              return {
                idVersion: idVer,
                idEntregable: Number(v?.idEntregable ?? v?.IdEntregable ?? idEntregable),
                numeroVersion: Number(v?.numeroVersion ?? v?.NumeroVersion ?? 0),
                fechaSubida: v?.fechaSubida ?? v?.FechaSubida,
                nombreOriginal: v?.nombreOriginal ?? v?.NombreOriginal,
                tamanoBytes: Number(v?.tamanoBytes ?? v?.TamanoBytes ?? 0),

                idEstadoEntregable: this.rp1EntregableIdEstado,

                totalRevisiones: revsDeVersion.length,
                idEstudianteSubio: v?.idEstudianteSubio ?? v?.IdEstudianteSubio ?? null,
                subidoPor: v?.subidoPor ?? v?.SubidoPor ?? null,

                lastRevisionId,
                lastTieneArchivo,

                ultimoDictamen,
                ultimaObservacion: last ? String(last?.observaciones ?? last?.Observaciones ?? '').trim() : null,
                fechaUltimaRevision: last ? (last?.fechaRevision ?? last?.FechaRevision) : null,
                estadoVisible: this.estadoVisiblePorVersion({ totalRevisiones: revsDeVersion.length, ultimoDictamen }),
              } as any;
            });

          this.rp1Loading = false;
          this.scheduleAccordionSync();
        },
        error: (e) => {
          console.error(e);
          this.rp1Loading = false;
          this.rp1Error = 'No se pudo cargar el detalle del Reporte parcial 1.';
          this.scheduleAccordionSync();
        }
      });
    },
    error: (e) => {
      console.error(e);
      this.rp1Loading = false;
      this.rp1Error = 'No se pudieron consultar entregables del proyecto.';
      this.scheduleAccordionSync();
    }
  });
}

  // =========================================
  // ✅ CARGA Reporte parcial 2 (tipo 3)
  // =========================================
  cargarReporteParcial2(): void {
    this.cargarReporteGenerico(this.TIPO_REPORTE_PARCIAL_2, 'rp2');
  }

  // =========================================
  // ✅ CARGA Reporte final (tipo 4)
  // =========================================
  cargarReporteFinal(): void {
    this.cargarReporteGenerico(this.TIPO_REPORTE_FINAL, 'rf');
  }

  /**
   * Carga genérica para RP2 y Final (reusa la misma estructura de detalle/versiones/revisiones).
   * prefix: 'rp2' usa rp2Loading/rp2Error/rp2Docs/rp2EntregableIdEstado/rp2EntregableEstadoDescripcion
   * prefix: 'rf'  usa rfLoading/rfError/rfDocs/rfEntregableIdEstado/rfEntregableEstadoDescripcion
   */
private cargarReporteGenerico(tipo: number, prefix: 'rp2' | 'rf'): void {
  (this as any)[`${prefix}Loading`] = true;
  (this as any)[`${prefix}Error`] = '';
  (this as any)[`${prefix}Docs`] = [];

  this.entregablesSvc.getByProyecto(this.idProyecto).subscribe({
    next: (entregables) => {
      const ent = (entregables ?? []).find((e: any) =>
        Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === Number(tipo)
      );

      if (!ent) {
        (this as any)[`${prefix}EntregableId`] = null;
        (this as any)[`${prefix}EntregableIdEstado`] = null;
        (this as any)[`${prefix}EntregableEstadoDescripcion`] = null;
        (this as any)[`${prefix}Loading`] = false;
        this.scheduleAccordionSync();
        return;
      }

      const idEntregable = Number(ent?.id ?? ent?.id ?? 0);
      if (!idEntregable) {
        (this as any)[`${prefix}EntregableId`] = null;
        (this as any)[`${prefix}EntregableIdEstado`] = null;
        (this as any)[`${prefix}EntregableEstadoDescripcion`] = null;
        (this as any)[`${prefix}Loading`] = false;
        this.scheduleAccordionSync();
        return;
      }

      // ✅ CLAVE: asignar el ID (antes no lo hacías)
      (this as any)[`${prefix}EntregableId`] = idEntregable;

      this.entregablesSvc.getDetalle(idEntregable).subscribe({
        next: (det: EntregableDetalleDto) => {
          const cab = (det as any)?.entregable ?? null;

          const idEstadoCab = Number(cab?.idEstadoEntregable ?? cab?.IdEstadoEntregable ?? NaN);
          const descCab = String(cab?.estadoDescripcion ?? cab?.EstadoDescripcion ?? '').trim();

          (this as any)[`${prefix}EntregableIdEstado`] = Number.isFinite(idEstadoCab) ? idEstadoCab : null;
          (this as any)[`${prefix}EntregableEstadoDescripcion`] = descCab || null;

          const versiones: any[] = (det as any)?.versiones ?? [];
          const revisiones: any[] = (det as any)?.revisiones ?? [];

          const estadoId = (this as any)[`${prefix}EntregableIdEstado`] as number | null;

          (this as any)[`${prefix}Docs`] = versiones
            .slice()
            .sort((a, b) =>
              Number(b?.numeroVersion ?? b?.NumeroVersion ?? 0) -
              Number(a?.numeroVersion ?? a?.NumeroVersion ?? 0)
            )
            .map((v) => {
              const idVer = Number(v?.id ?? v?.Id ?? 0);

              const revsDeVersion = (revisiones ?? [])
                .filter(r => Number(r?.idEntregableVersion ?? r?.IdEntregableVersion) === idVer)
                .slice()
                .sort((a, b) =>
                  Number(b?.numeroRevision ?? b?.NumeroRevision ?? 0) -
                  Number(a?.numeroRevision ?? a?.NumeroRevision ?? 0)
                );

              const last = revsDeVersion.length ? revsDeVersion[0] : null;
              const ultimoDictamen = last ? String(last?.dictamen ?? last?.Dictamen ?? '').trim().toUpperCase() : null;

              const lastRevisionId = last ? Number(last?.id ?? last?.Id ?? 0) : null;
              const lastTieneArchivo = last ? !!(last?.tieneArchivo ?? last?.TieneArchivo) : false;

              return {
                idVersion: idVer,
                idEntregable: Number(v?.idEntregable ?? v?.IdEntregable ?? idEntregable),
                numeroVersion: Number(v?.numeroVersion ?? v?.NumeroVersion ?? 0),
                fechaSubida: v?.fechaSubida ?? v?.FechaSubida,
                nombreOriginal: v?.nombreOriginal ?? v?.NombreOriginal,
                tamanoBytes: Number(v?.tamanoBytes ?? v?.TamanoBytes ?? 0),

                idEstadoEntregable: estadoId,

                totalRevisiones: revsDeVersion.length,
                idEstudianteSubio: v?.idEstudianteSubio ?? v?.IdEstudianteSubio ?? null,
                subidoPor: v?.subidoPor ?? v?.SubidoPor ?? null,

                lastRevisionId,
                lastTieneArchivo,

                ultimoDictamen,
                ultimaObservacion: last ? String(last?.observaciones ?? last?.Observaciones ?? '').trim() : null,
                fechaUltimaRevision: last ? (last?.fechaRevision ?? last?.FechaRevision) : null,
                estadoVisible: this.estadoVisiblePorVersion({ totalRevisiones: revsDeVersion.length, ultimoDictamen }),
              } as any;
            });

          (this as any)[`${prefix}Loading`] = false;
          this.scheduleAccordionSync();
        },
        error: (e) => {
          console.error(e);
          (this as any)[`${prefix}Loading`] = false;
          (this as any)[`${prefix}Error`] = `No se pudo cargar el detalle del ${prefix === 'rp2' ? 'Reporte parcial 2' : 'Reporte final'}.`;
          this.scheduleAccordionSync();
        }
      });
    },
    error: (e) => {
      console.error(e);
      (this as any)[`${prefix}Loading`] = false;
      (this as any)[`${prefix}Error`] = 'No se pudieron consultar entregables del proyecto.';
      this.scheduleAccordionSync();
    }
  });
}

  // =========================================
  // ✅ ESTADO MAESTRO DEL REPORTE (cabecera)
  // - En reportes (2/3/4): SOLO asesor interno puede marcar APROBADO/CAMBIOS/EN_REVISION.
  // - Esto es independiente de dictaminar archivos individuales.
  // =========================================

  aprobarReporteParcial1(): void {
    this.actualizarEstadoReporte('rp1', 'APROBADO');
  }
  marcarCambiosReporteParcial1(): void {
    this.actualizarEstadoReporte('rp1', 'CAMBIOS');
  }
  aprobarReporteParcial2(): void {
    this.actualizarEstadoReporte('rp2', 'APROBADO');
  }
  marcarCambiosReporteParcial2(): void {
    this.actualizarEstadoReporte('rp2', 'CAMBIOS');
  }
  aprobarReporteFinal(): void {
    this.actualizarEstadoReporte('rf', 'APROBADO');
  }
  marcarCambiosReporteFinal(): void {
    this.actualizarEstadoReporte('rf', 'CAMBIOS');
  }




  private actualizarEstadoReporte(prefix: 'rp1' | 'rp2' | 'rf', estadoClave: 'EN_REVISION' | 'CAMBIOS' | 'APROBADO'): void {
  if (!this.isAsesorInterno()) {
    this.toast.add({ severity: 'warn', summary: 'No permitido', detail: 'Solo el asesor interno puede cambiar el estado del reporte.', life: 10000 });
    return;
  }
  if (this.proyectoCancelado) {
    this.toast.add({ severity: 'warn', summary: 'Proyecto cancelado', detail: 'No se puede modificar el estado.', life: 10000 });
    return;
  }

  const idEntregable =
    prefix === 'rp1' ? Number(this.rp1EntregableId ?? 0) :
    prefix === 'rp2' ? Number(this.rp2EntregableId ?? 0) :
    Number(this.rfEntregableId ?? 0);

  if (!idEntregable) {
    this.toast.add({ severity: 'warn', summary: 'Sin entregable', detail: 'Aún no existe cabecera para este reporte (no hay archivos subidos).', life: 10000 });
    return;
  }

  this.cambiandoEstadoReporte[prefix] = true;

  this.entregablesSvc.updateEstadoEntregable(idEntregable, estadoClave).pipe(
    finalize(() => (this.cambiandoEstadoReporte[prefix] = false))
  ).subscribe({
    next: () => {
      this.toast.add({ severity: 'success', summary: 'Listo', detail: `Estado del reporte actualizado a: ${estadoClave}.`, life: 10000 });

      // refresca datos (cada carga re-sincroniza el accordion)
      if (prefix === 'rp1') this.cargarReporteParcial1();
      else if (prefix === 'rp2') this.cargarReporteParcial2();
      else this.cargarReporteFinal();
    },
    error: (e) => {
      console.error(e);
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el estado del reporte.', life: 10000 });
    }
  });
}


  viewExpediente(row: AnteproyectoRow): void {
    const idVersion = Number(row?.idVersion ?? 0);
    if (!idVersion) return;

    this.pdfUrl = null;  // Resetear el PDF antes de cargar uno nuevo

    // Obtener el archivo del servidor (esto es lo mismo que haces para descargar)
    this.entregablesSvc.downloadVersion(idVersion).subscribe({
      next: (blob: Blob | null) => {
        if (!blob) return;
        if (blob.type !== 'application/pdf') {
          console.error("El archivo recibido no es un PDF:", blob.type);
          return;
        }

        const fileSizeInMB = blob.size / (1024 * 1024);
        if (fileSizeInMB > 5) {
          alert("El archivo es demasiado grande para visualizarlo en línea.");
          return;
        }

        // Liberar la URL anterior si existe
        if (this.pdfUrl) {
          URL.revokeObjectURL(this.pdfUrl);
        }

        // Crear la URL del Blob
        this.pdfUrl = URL.createObjectURL(blob);
        // Mostrar el diálogo
        this.displayDialog = true;
      },
      error: (error) => {
        console.error("Error al cargar el PDF:", error);
      }
    });
  }

  abrirArchivo(row: AnteproyectoRow): void {
    const nombre = String(row?.nombreOriginal ?? '').toLowerCase();
    if (nombre.endsWith('.pdf')) {
      this.viewExpediente(row);
    } else {
      this.descargar(row);
    }
  }




  descargar(row: AnteproyectoRow): void {
    const idVersion = Number(row?.idVersion ?? 0);
    if (!idVersion) return;

    this.entregablesSvc.downloadVersion(idVersion).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        console.log(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = row.nombreOriginal || 'anteproyecto.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar.', life: 10000 });
      }
    });
  }

  // =========================================
  // ✅ Revisión / Dictamen
  // =========================================
  abrirRevision(row: AnteproyectoRow): void {
    if (!this.canRevisarRow(row)) {
      this.toast.add({
        severity: 'warn',
        summary: 'No permitido',
        detail: this.revisarDisabledReason(row), life: 10000
      });
      return;
    }

    this.revisandoRow = row;
    this.observaciones = '';
    this.noResidentesError = null;

    // ✅ precargar el valor actual del proyecto en el input
    this.nuevoNoResidentes = this.getNoResidentesActualProyecto();

    this.showRevisarDialog = true;
  }

  private mapDictamenUiToApi(d: DictamenUI): DictamenApi {
    if (d === 'REVISADO') return 'CAMBIOS';
    if (d === 'ACEPTADO') return 'APROBADO';
    return 'RECHAZADO';
  }



  verRespuestaDocente(row: any): void {
    const idRevision = Number(row?.lastRevisionId ?? 0);
    if (!idRevision) return;

    // reset para que el viewer recargue bien
    this.liberarPdfUrl();
    this.pdfUrl = null;

    this.entregablesSvc.downloadRevisionFile(idRevision).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;

        // Validación: el backend debe mandar application/pdf
        if (blob.type !== 'application/pdf') {
          console.error('El archivo recibido no es un PDF:', blob.type);
          this.toast.add({
            severity: 'error',
            summary: 'Archivo inválido',
            detail: 'El archivo recibido no es un PDF.', life: 10000
          });
          return;
        }

        // (Opcional) límite de tamaño para no “matar” el navegador
        const fileSizeInMB = blob.size / (1024 * 1024);
        if (fileSizeInMB > 15) { // ajusta el límite si quieres
          this.toast.add({
            severity: 'warn',
            summary: 'Archivo grande',
            detail: 'El PDF es demasiado grande para visualizarlo en línea.', life: 10000
          });
          return;
        }

        this.pdfUrl = URL.createObjectURL(blob);
        this.displayDialog = true;
      },
      error: (e) => {
        console.error(e);
        this.toast.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cargar la respuesta del docente.', life: 10000
        });
      }
    });
  }

  liberarPdfUrl(): void {
    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
  }


  descargarRespuestaDocente(row: any): void {
    const idRevision = Number(row?.lastRevisionId ?? 0);
    if (!idRevision) return;

    this.entregablesSvc.downloadRevisionFile(idRevision).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'respuesta_docente';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar la respuesta del docente.', life: 10000 });
      }
    });
  }


  guardarRevision(dictamenUI: DictamenUI): void {
    if (!this.revisandoRow) return;

    if (Number(this.revisandoRow.totalRevisiones ?? 0) > 0) {
      this.toast.add({ severity: 'warn', summary: 'Ya dictaminado', detail: 'Esta versión ya tiene dictamen. El alumno debe subir una nueva versión.', life: 10000 });
      return;
    }

    const idVersion = Number(this.revisandoRow.idVersion ?? 0);
    if (!idVersion) return;

    const obs = (this.observaciones || '').trim();

    if (dictamenUI === 'REVISADO' && obs.length < 3) {
      this.toast.add({ severity: 'warn', summary: 'Falta observación', detail: 'Escribe qué debe corregir el alumno.', life: 10000 });
      return;
    }

    const dictamenApi = this.mapDictamenUiToApi(dictamenUI);

    this.guardandoRevision = true;

    this.entregablesSvc.createRevisionWithFile(idVersion, {
      dictamen: dictamenApi,
      observaciones: obs,
      archivo: this.docenteArchivoSeleccionado
    })
      .pipe(finalize(() => (this.guardandoRevision = false)))
      .subscribe({
        next: async () => {
          const numVer = Number(this.revisandoRow?.numeroVersion ?? 0);

          // ✅ si aprueba, intenta actualizar noResidentes (sin toasts)
          const upd = (dictamenUI === 'ACEPTADO')
            ? await this.actualizarNoResidentesSiAplica()
            : null;

          // ✅ envía correos (sin toasts)
          const mail = await this.enviarCorreosADestinatarios(dictamenUI, numVer, obs);

          this.showRevisarDialog = false;
          this.revisandoRow = null;
          this.observaciones = '';
          this.docenteArchivoSeleccionado = null;

          this.cargarAnteproyecto();

          if (dictamenUI === 'ACEPTADO' || dictamenUI === 'RECHAZADO') {
            this.actualizarEstadoProyectoPorDictamen(dictamenUI);
          }

          // ✅ refresca proyecto para que se vea el nuevo cupo si lo muestras en UI
          this.cargar();

          // ✅ UN solo mensaje por operación
          let detalle = `Dictamen guardado: ${dictamenUI}.`;

          if (dictamenUI === 'ACEPTADO') {
            if (upd === null) {
              detalle += ' Integrantes no actualizados (revisa el valor).';
            } else if (upd.changed && !upd.updated) {
              detalle += ' Se guardó el dictamen, pero no se pudo actualizar el número de integrantes.';
            } else if (upd.changed && upd.updated) {
              detalle += ` Integrantes actualizados a ${upd.nuevo}.`;
            }
          }

          if (!mail.skipped && mail.total > 0 && mail.fallidos > 0) {
            detalle += ` Notificación enviada parcialmente (${mail.enviados}/${mail.total}).`;
          }
          if (mail.skipped) {
            detalle += ' No fue posible notificar por correo (sin correos registrados).';
          }

          this.toast.add({
            severity: 'success',
            summary: 'Listo',
            detail: detalle,
            life: 10000
          });
        },


        error: (e) => {
          console.error(e);
          this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar la revisión.', life: 10000 });
        }
      });
  }

  // =========================================
  // ✅ Revisión Reporte parcial 1 (Etapa 2)
  // =========================================
  canRevisarRp1Row(row: AnteproyectoRow): boolean {
    if (!this.canRevisarReporteParcial1()) return false;
    // Permite dictaminar archivos que aún no tengan revisión
    return Number(row?.totalRevisiones ?? 0) === 0;
  }

  abrirRevisionRp1(row: AnteproyectoRow): void {
    if (!this.canRevisarRp1Row(row)) {
      this.toast.add({
        severity: 'warn',
        summary: 'No permitido',
        detail: 'Este archivo ya fue dictaminado o no tienes el rol para revisarlo.',
        life: 10000
      });
      return;
    }

    this.revisandoRp1Row = row;
    this.rp1Observaciones = '';
    this.rp1DocenteArchivoSeleccionado = null;
    this.showRp1RevisarDialog = true;
  }

  guardarRevisionRp1(dictamenUI: DictamenUI): void {
    if (!this.revisandoRp1Row) return;

    // Revisores NO pueden aprobar/rechazar: solo observaciones (CAMBIOS)
    if (!this.isAsesorInterno()) {
      dictamenUI = 'REVISADO';
    }

    if (Number(this.revisandoRp1Row.totalRevisiones ?? 0) > 0) {
      this.toast.add({ severity: 'warn', summary: 'Ya dictaminado', detail: 'Este archivo ya tiene dictamen.', life: 10000 });
      return;
    }

    const idVersion = Number(this.revisandoRp1Row.idVersion ?? 0);
    if (!idVersion) return;

    const obs = (this.rp1Observaciones || '').trim();

    if (dictamenUI === 'REVISADO' && obs.length < 3) {
      this.toast.add({ severity: 'warn', summary: 'Falta observación', detail: 'Escribe qué debe corregir el alumno.', life: 10000 });
      return;
    }

    this.guardandoRp1Revision = true;

    const payload = {
      dictamen: this.mapDictamenUiToApi(dictamenUI),
      observaciones: obs,
      archivo: this.rp1DocenteArchivoSeleccionado
    };

    this.entregablesSvc.createRevisionWithFile(idVersion, payload).pipe(
      finalize(() => (this.guardandoRp1Revision = false))
    ).subscribe({
      next: () => {
        this.toast.add({
          severity: 'success',
          summary: 'Dictamen guardado',
          detail: 'Se guardó la revisión del Reporte parcial 1.',
          life: 10000
        });

        this.showRp1RevisarDialog = false;
        this.revisandoRp1Row = null;
        this.rp1Observaciones = '';
        this.rp1DocenteArchivoSeleccionado = null;

        this.cargarReporteParcial1();
      },
      error: (e) => {
        console.error(e);
        this.toast.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo guardar el dictamen.',
          life: 10000
        });
      }
    });
  }




  // ✅ Aceptar proyecto (sólo si anteproyecto APROBADO y proyecto en estado correcto)
  canAceptarProyecto(): boolean {
    const estadoProyecto = Number((this.data as any)?.proyecto?.idEstado ?? (this.data as any)?.proyecto?.IdEstado ?? 0);

    const anteAprobado = Number(this.anteEntregableIdEstado ?? 0) === this.EST_ENT_APROBADO;

    return this.canRevisarAnteproyecto()
      && estadoProyecto === 4 // ✅ tu regla actual
      && anteAprobado
      && !this.proyectoCancelado;
  }


  aceptarProyecto(): void {
    if (!this.canAceptarProyecto()) {
      this.toast.add({ severity: 'warn', summary: 'No permitido', detail: 'Aún no cumple condiciones para aceptar.', life: 10000 });
      return;
    }

    this.proyectoAceptando = true;

    this.proyectosSvc.aceptarProyecto(this.idProyecto)
      .pipe(finalize(() => (this.proyectoAceptando = false)))
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Proyecto aceptado', detail: 'Pasó a “Espera asignando asesor”.', life: 10000 });
          this.cargar();
        },
        error: (e) => {
          console.error(e);
          this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo aceptar el proyecto.', life: 10000 });
        }
      });
  }

  cancelarProyecto(): void {
    this.proyectoCancelando = true;

    this.proyectosSvc.cancelarProyecto(this.idProyecto)
      .pipe(finalize(() => (this.proyectoCancelando = false)))
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Proyecto cancelado', detail: 'Estado cambiado a cancelado.', life: 10000 });
          this.cargar();
        },
        error: (e) => {
          console.error(e);
          this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cancelar el proyecto.', life: 10000 });
        }
      });
  }

  // =========================================
  // ✅ helpers UI
  // =========================================

  get anteproyectoCerrado(): boolean {
    const id = Number(this.anteEntregableIdEstado ?? NaN);
    return id === this.EST_ENT_APROBADO || id === this.EST_ENT_RECHAZADO;
  }




  fmtBytes(n: number): string {
    if (n === null || n === undefined) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }

  
private rolClaveActivo(): string {
  // Prioriza override por URL (?rol=)
  const rolId = Number(this.rolOverrideId ?? 0);
  if (rolId > 0) {
    if (rolId === 1) return 'REVISOR_ANTEPROYECTO';
    if (rolId === 2) return 'ASESOR_INTERNO';
    if (rolId === 3) return 'REVISOR_RESIDENCIA';
    if (rolId === 4) return 'REVISOR_PROYECTO';
  }
  return String(this.data?.relacion?.tipoRelacionClave ?? '').trim().toUpperCase();
}

isRevisorAnteproyecto(): boolean {
  return this.rolClaveActivo() === 'REVISOR_ANTEPROYECTO';
}

canRevisarAnteproyecto(): boolean {
  // Solo el revisor de anteproyecto dicta anteproyecto.
  return this.isRevisorAnteproyecto();
}

// =========================
// ✅ Roles para etapas 2/3/4
// =========================
isAsesorInterno(): boolean {
  return this.rolClaveActivo() === 'ASESOR_INTERNO';
}

isRevisorResidencia(): boolean {
  return this.rolClaveActivo() === 'REVISOR_RESIDENCIA';
}

isRevisorProyecto(): boolean {
  return this.rolClaveActivo() === 'REVISOR_PROYECTO';
}

/** Puede VER etapas 2-4 (solo lectura si es revisor anteproyecto). */
canVerEtapasPosteriores(): boolean {
  const c = this.rolClaveActivo();
  return c === 'ASESOR_INTERNO' || c === 'REVISOR_RESIDENCIA' || c === 'REVISOR_PROYECTO' || c === 'REVISOR_ANTEPROYECTO';
}

/** Puede INTERACTUAR (dictaminar/comentar) etapas 2-4. Revisor anteproyecto = solo lectura. */
private canInteractEtapasPosteriores(): boolean {
  const c = this.rolClaveActivo();
  return c === 'ASESOR_INTERNO' || c === 'REVISOR_RESIDENCIA' || c === 'REVISOR_PROYECTO';
}

canRevisarReporteParcial1(): boolean {
  if (!this.canInteractEtapasPosteriores()) return false;
  if (this.proyectoCancelado) return false;

  const id = Number(this.rp1EntregableIdEstado ?? NaN);
  if (id === this.EST_ENT_APROBADO || id === this.EST_ENT_RECHAZADO || id === this.EST_ENT_CANCELADO) return false;

  return true;
}

canRevisarReporteParcial2(): boolean {
  if (!this.canInteractEtapasPosteriores()) return false;
  if (this.proyectoCancelado) return false;

  const id = Number(this.rp2EntregableIdEstado ?? NaN);
  if (id === this.EST_ENT_APROBADO || id === this.EST_ENT_RECHAZADO || id === this.EST_ENT_CANCELADO) return false;

  return true;
}

canRevisarReporteFinal(): boolean {
  if (!this.canInteractEtapasPosteriores()) return false;
  if (this.proyectoCancelado) return false;

  const id = Number(this.rfEntregableIdEstado ?? NaN);
  if (id === this.EST_ENT_APROBADO || id === this.EST_ENT_RECHAZADO || id === this.EST_ENT_CANCELADO) return false;

  return true;
}

private maxNumeroVersion(): number {
    if (!this.documentos?.length) return 0;
    return Math.max(...this.documentos.map(d => Number(d?.numeroVersion ?? 0)));
  }

  /** ✅ Regla: solo se revisa la ÚLTIMA versión y solo si aún NO tiene revisión */
  canRevisarRow(row: AnteproyectoRow): boolean {
    if (!this.canRevisarAnteproyecto()) return false;
    if (this.proyectoCancelado) return false;
    if (this.anteproyectoCerrado) return false;

    const isUltima = Number(row?.numeroVersion ?? 0) === this.maxNumeroVersion();
    const sinRevision = Number(row?.totalRevisiones ?? 0) === 0;

    return isUltima && sinRevision;
  }

  revisarDisabledReason(row: AnteproyectoRow): string {
    if (this.proyectoCancelado) return 'Proyecto cancelado.';
    if (this.anteproyectoCerrado) return 'Anteproyecto cerrado (aprobado).';
    if (!this.canRevisarAnteproyecto()) return 'No tienes rol de revisor.';
    const isUltima = Number(row?.numeroVersion ?? 0) === this.maxNumeroVersion();
    if (!isUltima) return 'Solo se revisa la última versión.';
    const revs = Number(row?.totalRevisiones ?? 0);
    if (revs > 0) return 'Esta versión ya fue dictaminada. El alumno debe subir una nueva versión.';
    return 'No disponible por flujo.';
  }


  norm(v: any): string {
    return String(v ?? '').trim().toUpperCase();
  }

  tagSeverityByEstado(entEstado: string | null): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    const s = this.norm(entEstado);
    if (s === 'APROBADO') return 'success';
    if (s === 'RECHAZADO') return 'danger';
    if (s === 'EN_REVISION') return 'info';
    if (s === 'PENDIENTE') return 'warn';
    return 'secondary';
  }

  tagSeverityByDictamen(dict: string | null): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    const s = this.norm(dict);
    if (s === 'APROBADO') return 'success';
    if (s === 'RECHAZADO') return 'danger';
    if (s === 'CAMBIOS') return 'warn';
    return 'secondary';
  }

  estadoEntregableLabelById(id: number | null | undefined): string {
    const n = Number(id ?? NaN);
    if (!Number.isFinite(n)) return 'Pendiente';

    switch (n) {
      case this.EST_ENT_APROBADO: return 'Aprobado';
      case this.EST_ENT_RECHAZADO: return 'Rechazado';
      case this.EST_ENT_EN_REVISION: return 'En revisión';
      case this.EST_ENT_CAMBIOS: return 'Cambios solicitados';
      case this.EST_ENT_CANCELADO: return 'Cancelado';
      default: return 'Pendiente';
    }
  }

  estadoEntregableSeverityById(id: number | null | undefined): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    const n = Number(id ?? NaN);
    if (!Number.isFinite(n)) return 'secondary';

    if (n === this.EST_ENT_APROBADO) return 'success';
    if (n === this.EST_ENT_RECHAZADO) return 'danger';
    if (n === this.EST_ENT_CAMBIOS) return 'warn';
    if (n === this.EST_ENT_EN_REVISION) return 'info';
    if (n === this.EST_ENT_CANCELADO) return 'danger';
    return 'secondary';
  }



  shortObs(v: string | null, max = 80): string {
    const t = String(v ?? '').trim();
    if (!t) return '—';
    return t.length > max ? (t.slice(0, max) + '…') : t;
  }

  private estadoVisiblePorVersion(row: { totalRevisiones?: number; ultimoDictamen?: string | null }): EstadoVisible {
    const revs = Number(row?.totalRevisiones ?? 0);

    // ✅ Subido y todavía sin dictamen
    if (revs === 0) return 'POR_REVISAR';

    const d = this.norm(row?.ultimoDictamen);
    if (d === 'CAMBIOS') return 'REVISADO';
    if (d === 'APROBADO') return 'ACEPTADO';
    if (d === 'RECHAZADO') return 'RECHAZADO';

    // si por alguna razón vino raro, mejor no mentir:
    return 'POR_REVISAR';
  }

  private pickStudentEmail(e: any): string | null {
    const email =
      e?.correoInstitucional ??
      e?.correo_institucional ??
      e?.correo ??
      e?.correoPersonal ??
      null;

    const s = String(email ?? '').trim();
    return s.length ? s : null;
  }

  private getDestinatariosEstudiantes(): Array<{ email: string; nombre: string; noControl?: string | null }> {
    const ests: any[] = (this.data as any)?.estudiantes ?? [];

    const list = ests
      .map((e: any) => {
        const email = this.pickStudentEmail(e);
        const nombre = `${e?.nombre ?? ''} ${e?.apellidoPaterno ?? ''} ${e?.apellidoMaterno ?? ''}`.trim();
        const noControl = e?.noControl ?? e?.numeroControl ?? null;

        return {
          email,
          nombre: nombre || 'Estudiante',
          noControl: String(noControl ?? '').trim() || null
        };
      })
      .filter(x => !!x.email) as Array<{ email: string; nombre: string; noControl?: string | null }>;

    // ✅ evitar duplicados por email
    const seen = new Set<string>();
    const unique: Array<{ email: string; nombre: string; noControl?: string | null }> = [];
    for (const x of list) {
      const key = x.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(x);
    }

    return unique;
  }



  private camposFaltantesMensaje(): string {
    // ✅ lista basada en tu modelo Estudiantes (lo que dijiste que debe estar lleno)
    return [
      '- Carrera (idcarrera)',
      '- Domicilio',
      '- Ciudad',
      '- Estado (idestado)',
      '- Municipio (idmunicipio)',
      '- No. Control',
      '- Correo personal',
      '- No. Seguro Social',
      '- Dependencia médica (idDependenciaMedica)',
      '- Teléfono celular',
      '- Contacto de emergencia (idContactoEmergencia)'
    ].join('\n');
  }

  private buildCorreoAnteproyecto(dictamenUI: DictamenUI, proyectoTitulo: string, numeroVersion: number, obs: string): { tema: string; cuerpo: string } {
    const ahora = new Date();
    const fechaStr = this.formatFechaMx(ahora);

    const base = `Proyecto: ${proyectoTitulo}\nVersión: v${numeroVersion}\nFecha: ${fechaStr}\n\n`;

    if (dictamenUI === 'ACEPTADO') {
      const tema = `Anteproyecto APROBADO – ${proyectoTitulo}`;
      const cuerpo =
        `Hola.\n\n` +
        base +
        `Tu anteproyecto fue APROBADO.\n\n` +
        `Para continuar con el procedimiento, es necesario que completes toda tu información de estudiante.\n\n` +
        `Campos requeridos:\n` +
        `${this.camposFaltantesMensaje()}\n\n` +
        `Por favor ingresa al sistema y completa tu perfil lo antes posible.\n\n` +
        `Gracias.`;
      return { tema, cuerpo };
    }

    if (dictamenUI === 'RECHAZADO') {
      const tema = `Anteproyecto RECHAZADO – ${proyectoTitulo}`;
      const cuerpo =
        `Hola.\n\n` +
        base +
        `Tu anteproyecto fue RECHAZADO.\n\n` +
        (obs?.trim()
          ? `Observaciones del revisor:\n${obs.trim()}\n\n`
          : ``) +
        `Revisa las observaciones y, si el sistema lo permite, prepara una nueva versión corrigiendo lo indicado.\n\n` +
        `Gracias.`;
      return { tema, cuerpo };
    }

    // dictamenUI === 'REVISADO' (CAMBIOS)
    const tema = `Anteproyecto revisado (CAMBIOS) – ${proyectoTitulo}`;
    const cuerpo =
      `Hola.\n\n` +
      base +
      `Tu anteproyecto fue revisado y se solicitaron CAMBIOS.\n\n` +
      `Observaciones del revisor:\n${(obs?.trim() ? obs.trim() : '(Sin observaciones registradas)')}\n\n` +
      `Por favor realiza las correcciones y sube una nueva versión.\n\n` +
      `Gracias.`;

    return { tema, cuerpo };
  }

  private buildCorreoAnteproyectoBase(
  dictamenUI: DictamenUI,
  proyectoTitulo: string,
  numeroVersion: number,
  obs: string,
  camposRequeridos: string
): { tema: string; cuerpo: string } {
  const fechaStr = this.formatFechaMx(new Date());
  const observaciones = obs?.trim();
  const titulo = proyectoTitulo?.trim() || `Proyecto #${this.idProyecto}`;

  const encabezado =
    `Hola,\n\n` +
    `Te informamos el resultado de la revisión de tu anteproyecto.\n\n` +
    `Proyecto: ${titulo}\n` +
    `Versión: v${numeroVersion}\n` +
    `Fecha: ${fechaStr}\n\n`;

  const cierre =
    `Si tienes dudas, consulta el sistema para dar seguimiento a tu proyecto.\n\n` +
    `Atentamente,\n` +
    `Sistema de Vinculación`;

  if (dictamenUI === 'ACEPTADO') {
    return {
      tema: `✅ Anteproyecto aceptado – ${titulo}`,
      cuerpo:
        encabezado +
        `Tu anteproyecto ha sido ACEPTADO.\n\n` +
        `Para continuar con el proceso, es necesario que completes tu información como estudiante en el sistema.\n\n` +
        `Te pedimos ingresar al sistema y actualizar tu información a la brevedad.\n\n` +
        cierre
    };
  }

  if (dictamenUI === 'RECHAZADO') {
    return {
      tema: `⛔ Anteproyecto rechazado – ${titulo}`,
      cuerpo:
        encabezado +
        `Tu anteproyecto ha sido RECHAZADO.\n\n` +
        (observaciones
          ? `Observaciones del revisor:\n${observaciones}\n\n`
          : `No se registraron observaciones adicionales.\n\n`) +
        `Te recomendamos revisar cuidadosamente los comentarios realizados. Si el sistema lo permite, podrás subir una nueva versión atendiendo los puntos señalados.\n\n` +
        cierre
    };
  }

  // dictamenUI === 'REVISADO'
  return {
    tema: `Anteproyecto con cambios solicitados – ${titulo}`,
    cuerpo:
      encabezado +
      `Tu anteproyecto fue revisado y requiere CAMBIOS antes de continuar.\n\n` +
      `Observaciones del revisor:\n${observaciones || '(Sin observaciones registradas)'}\n\n` +
      `Por favor realiza las correcciones correspondientes y sube una nueva versión en el sistema.\n\n` +
      cierre
  };
}

  private enviarCorreosAnteproyecto(dictamenUI: DictamenUI, numeroVersion: number, obs: string): void {
    const destinatarios = this.getDestinatariosEstudiantes();
    if (!destinatarios.length) {
      this.toast.add({
        severity: 'warn',
        summary: 'Aviso',
        detail: 'No hay correos de estudiantes para notificar (revisa que el endpoint devuelva correo institucional/personal).', life: 10000
      });
      return;
    }

    const titulo = String((this.data as any)?.proyecto?.titulo ?? '').trim() || `Proyecto #${this.idProyecto}`;
    const { tema, cuerpo } = this.buildCorreoAnteproyecto(dictamenUI, titulo, numeroVersion, obs);

    const reqs = destinatarios.map(d =>
      this.emailSvc.sendEmail(d.email, tema, cuerpo).pipe(
        catchError((e) => {
          console.error('Fallo email a:', d.email, e);
          return of({ ok: false, email: d.email });
        })
      )
    );

    forkJoin(reqs).subscribe({
      next: (results: any[]) => {
        const fallidos = (results ?? []).filter(r => r?.ok === false).length;
        const ok = destinatarios.length - fallidos;

        if (ok > 0) {
          this.toast.add({
            severity: 'success',
            summary: 'Correos enviados',
            detail: `Notificación enviada a ${ok} estudiante(s).` + (fallidos ? ` (${fallidos} fallaron)` : ''), life: 10000
          });
        } else {
          this.toast.add({
            severity: 'warn',
            summary: 'No se enviaron correos',
            detail: 'Todos los envíos fallaron. Revisa el endpoint /emails y logs del backend.', life: 10000
          });
        }
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron enviar correos.', life: 10000 });
      }
    });
  }

  private getStudentEmails(): string[] {
    const ests: any[] = (this.data as any)?.estudiantes ?? [];
    const emails = ests
      .map(e => String(e?.correo ?? '').trim())
      .filter(s => s.length > 0);


    // ✅ quitar duplicados
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const em of emails) {
      const key = em.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(em);
    }
    return unique;
  }

  private formatFechaMx(dt: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  private camposRequeridosMsg(): string {
    // basado en tu modelo Estudiantes (lo que dijiste que debe ir lleno)
    return [
      '- Carrera',
      '- Domicilio',
      '- Ciudad',
      '- Estado',
      '- Municipio',
      '- No. Control',
      '- Correo personal',
      '- No. Seguro Social',
      '- Dependencia médica',
      '- Teléfono celular',
      '- Contacto de emergencia'
    ].join('\n');
  }

  private buildMail(dictamenUI: DictamenUI, numVersion: number, obs: string): { tema: string; cuerpo: string } {
    const titulo = String((this.data as any)?.proyecto?.titulo ?? '').trim() || `Proyecto #${this.idProyecto}`;
    const fecha = this.formatFechaMx(new Date());
    const base = `Proyecto: ${titulo}\nVersión: v${numVersion}\nFecha: ${fecha}\n\n`;

    if (dictamenUI === 'ACEPTADO') {
      return {
        tema: `Anteproyecto APROBADO – ${titulo}`,
        cuerpo:
          `Hola.\n\n` +
          base +
          `Tu anteproyecto fue APROBADO.\n\n` +
          `Para continuar con el procedimiento, debes completar toda tu información de estudiante.\n\n` +
          `Campos requeridos:\n${this.camposRequeridosMsg()}\n\n` +
          `Ingresa al sistema y completa tu perfil.\n\n` +
          `Gracias.`
      };
    }

    if (dictamenUI === 'RECHAZADO') {
      return {
        tema: `Anteproyecto RECHAZADO – ${titulo}`,
        cuerpo:
          `Hola.\n\n` +
          base +
          `Tu anteproyecto fue RECHAZADO.\n\n` +
          (obs?.trim() ? `Observaciones del revisor:\n${obs.trim()}\n\n` : '') +
          `Revisa lo indicado y, si el sistema lo permite, sube una nueva versión corrigiendo los puntos señalados.\n\n` +
          `Gracias.`
      };
    }

    // dictamenUI === 'REVISADO' (CAMBIOS)
    return {
      tema: `Anteproyecto revisado (CAMBIOS) – ${titulo}`,
      cuerpo:
        `Hola.\n\n` +
        base +
        `Tu anteproyecto fue revisado y se solicitaron CAMBIOS.\n\n` +
        `Observaciones del revisor:\n${(obs?.trim() ? obs.trim() : '(Sin observaciones registradas)')}\n\n` +
        `Por favor corrige y sube una nueva versión.\n\n` +
        `Gracias.`
    };
  }

  /**
 * ✅ NO dispara toast (para evitar mensajes duplicados).
 * Devuelve un resumen para que el flujo principal decida si avisar o no.
 */
  private enviarCorreosADestinatarios(
    dictamenUI: DictamenUI,
    numVersion: number,
    obs: string
  ): Promise<{ total: number; enviados: number; fallidos: number; skipped: boolean }> {

    const emails = this.getStudentEmails();
    console.log(emails)
    if (!emails.length) {
      return Promise.resolve({ total: 0, enviados: 0, fallidos: 0, skipped: true });
    }

    const mail = this.buildMail(dictamenUI, numVersion, obs);

    const reqs = emails.map(em =>
      this.emailSvc.sendEmail(em, mail.tema, mail.cuerpo).pipe(
        catchError(err => {
          console.error('Falló envío a:', em, err);
          return of({ ok: false, email: em });
        })
      )
    );

    return new Promise((resolve) => {
      forkJoin(reqs).subscribe({
        next: (results: any[]) => {
          const fallidos = (results ?? []).filter(r => r?.ok === false).length;
          const ok = emails.length - fallidos;
          resolve({ total: emails.length, enviados: ok, fallidos, skipped: false });
        },
        error: (e) => {
          console.error(e);
          resolve({ total: emails.length, enviados: 0, fallidos: emails.length, skipped: false });
        }
      });
    });
  }







}
