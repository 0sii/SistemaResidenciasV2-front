import { Component, inject, signal, ChangeDetectorRef, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ValidatorFn,
  AbstractControl,
  ReactiveFormsModule
} from '@angular/forms';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEsMx from '@angular/common/locales/es-MX';
import { TooltipModule } from 'primeng/tooltip';
import { Table, TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { MessageService, ConfirmationService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { catchError, concatMap, finalize, forkJoin, from, map, Observable, of, tap } from 'rxjs';

import { ProyectoDocumentoMetaDto, ProyectosService } from '../../../service/proyectos.service';
import { EmpresasService } from '../../../service/empresa.service';
import { EstadosPagedResponse, EstadosService } from '../../../service/estado.service';
import { CatalogosService } from '../../../service/catalogos.service';
import { DocentesService, DocenteCargaResumen } from '../../../service/docentes.service';
import { EmailService } from '../../../service/email.service';
import { PeriodosAcademicosService } from '../../../service/periodoAcademico.service';
import { EntregableDto, EntregablesService } from '../../../service/entregables.service';
import { UsuariosService } from '../../../service/usuarios.service';

import { Proyecto } from '../../../Interface/InterfaceProyecto';
import { Empresa } from '../../../Interface/InterfaceEmpresa';
import { Catalogo, DocenteListItem } from '../../../Interface/InterfaceUsuario';
import { ESTADO_PROYECTO_UI, EstadoColor } from '../../../utils/estado-proyecto.constants';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { EstudiantesService } from '../../../service/estudiantes.service';
import { DocumentosService } from '../../../service/documentos.service';
import { TokenService } from '../../../service/token.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FechaEsPipe, FindLabelPipe, FilterIdsPipe } from '../../../pipe/fecha-es.pipe';

registerLocaleData(localeEsMx, 'es-MX');

interface EntregableVersionRow {
  idVersion: number;
  idEntregable: number;
  numeroVersion: number;
  fechaSubida: string;
  nombreOriginal: string;
  tamanoBytes: number;

  idEstudianteSubio?: number | null;
  subidoPor?: string | null;

  totalRevisiones: number;
  ultimoDictamen?: string | null;
  ultimaObs?: string | null;
  fechaUltimaRevision?: string | null;

  // Para UI simple
  estadoVisible?: 'POR_REVISAR' | 'REVISADO' | 'ACEPTADO' | 'RECHAZADO';
}

interface DocenteCargaOption {
  label: string;
  value: number;
  correo: string;

  nombrePlano: string;

  asesorInternoCount: number;
  revisorResidenciaCount: number;
  revisorAnteproyectoCount: number;
  totalActivos: number;
}

@Component({
  selector: 'app-proyectos',
  standalone: true,
  templateUrl: './proyectos.html',
  styleUrls: ['./proyectos.css'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TableModule,
    ToastModule,
    ButtonModule,
    DialogModule,
    SelectModule,
    ConfirmDialogModule,
    MultiSelectModule,
    NgxExtendedPdfViewerModule,
    TooltipModule,
    FechaEsPipe,
    FindLabelPipe,
    FilterIdsPipe
  ],
  providers: [MessageService, ConfirmationService]
})
export class ProyectosComponent implements OnInit {

  private fb = inject(FormBuilder);
  private proyectosSvc = inject(ProyectosService);
  private empresasSvc = inject(EmpresasService);
  private modalidadesSvc = inject(CatalogosService);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(MessageService);
  private estadoSvc = inject(EstadosService);
  private docentesSvc = inject(DocentesService);
  private emailSvc = inject(EmailService);
  private periodosSvc = inject(PeriodosAcademicosService);
  private entregablesSvc = inject(EntregablesService);
  private confirm = inject(ConfirmationService);
  private usuariosSvc = inject(UsuariosService);
  private estudianteSvc = inject(EstudiantesService)
  private router = inject(Router);
  private route= inject(ActivatedRoute);
  private documentosSvc= inject(DocumentosService);
  
  private tokenSvc = inject(TokenService);
  private estadosSvc = inject(EstadosService);


  stagesEntregables = [
    { key: 1, label: 'Anteproyecto' },
    { key: 2, label: 'Reporte parcial 1' },
    { key: 3, label: 'Reporte parcial 2' },
    { key: 4, label: 'Reporte final' },
  ];

  selectedTipoEntregable = 1;
  entregablesLoading = false;

  entregablesEtapa1: EntregableVersionRow[] = [];
  entregablesEtapa2: EntregableVersionRow[] = [];
  entregablesEtapa3: EntregableVersionRow[] = [];
  entregablesEtapa4: EntregableVersionRow[] = [];

  // alias para pintar la tabla actual sin duplicar template
  entregablesActual: EntregableVersionRow[] = [];

  // PDF viewer (MISMO enfoque que Seguimiento)
  pdfUrl: string | null = null;
  displayPdfDialog = false;
  pdfFileName: string | null = null;

  private setEntregablesPorTipo(tipo: number, rows: EntregableVersionRow[]): void {
    switch (Number(tipo)) {
      case 1: this.entregablesEtapa1 = rows; break;
      case 2: this.entregablesEtapa2 = rows; break;
      case 3: this.entregablesEtapa3 = rows; break;
      case 4: this.entregablesEtapa4 = rows; break;
    }
  }

  private getEntregablesPorTipo(tipo: number): EntregableVersionRow[] {
    switch (Number(tipo)) {
      case 1: return this.entregablesEtapa1;
      case 2: return this.entregablesEtapa2;
      case 3: return this.entregablesEtapa3;
      case 4: return this.entregablesEtapa4;
      default: return [];
    }
  }

  private estadoVisiblePorVersion(totalRevisiones: number, ultimoDictamen?: string | null) {
    if (!totalRevisiones) return 'POR_REVISAR';
    const d = String(ultimoDictamen || '').toUpperCase().trim();
    if (d === 'ACEPTADO' || d === 'APROBADO') return 'ACEPTADO';
    if (d === 'RECHAZADO') return 'RECHAZADO';
    return 'REVISADO';
  }

  // 🔎 Anteproyecto (entregable tipo 1)
  private readonly TIPO_ANTEPROYECTO = 1;

  anteproyectoEntregable: EntregableDto | null = null;
  anteproyectoLoading = false;
  anteproyectoError: string | null = null;
  anteproyectoFechaAceptacion: Date | null = null;
  fechaEntregaReporteParcial1: Date | null = null;
  fechaEntregaReporteParcial2: Date | null = null;

  // (si lo usas en alguna parte)
  anteproyecto: EntregableDto | null = null;
  anteproyectoCargando = false;

  asesorInternoCorreo: string | null = null;
  revisorAnteproyectoCorreo: string | null = null;

  // id de estado por defecto para proyectos nuevos
  private readonly ESTADO_NUEVO_ID = 1;
  private readonly ESTADO_PUBLICADO_ID = 2;
  private readonly ESTADO_ESPERA_REVISOR_ID = 3;
  private readonly ESTADO_ESPERA_REVISION_ANTEPROYECTO_ID = 4;

  /**
   * ✅ CAMBIO IMPORTANTE:
   * - Eliminamos el estado 5: "Anteproyecto revisado"
   * - El estado 6 ahora se llama: "Anteproyecto Aceptado - espera asignando asesor"
   *   (ID 6 se mantiene igual)
   */

readonly ESTADO_ESPERA_ASESOR_ID = 6;                  // Espera Asignación Asesor Interno
readonly ESTADO_EN_CURSO_ID = 7;                       // En curso
readonly ESTADO_FINALIZADO_ID = 8;
readonly ESTADO_CANCELADO_ID = 9;


// ✅ IDs reales de estados entregable (AJUSTA si tus IDs son otros)
  private readonly ENT_PENDIENTE = 1;
  private readonly ENT_EN_REVISION = 2;
  private readonly ENT_CAMBIOS = 3;
  private readonly ENT_APROBADO = 4;
  private readonly ENT_RECHAZADO = 5;
  private readonly ENT_CANCELADO = 6;

  // ✅ IDs estados del ENTREGABLE (ajusta a tus IDs reales)
  private readonly ENT_APROBADO_ID = 4;
  private readonly ENT_CANCELADO_ID = 6;

  private readonly ROL_ASESOR_INTERNO = 'ASESOR_INTERNO';
  private readonly ROL_REVISOR_REPORTE = 'REVISOR_RESIDENCIA'; // revisores de parciales y final

  // UI flow
  periodos: any[] = [];
  periodoSeleccionado: number | null = null;

  estadoSeleccionado: number | null = null;

  idPeriodoAcademico?: number;

  showDetallesDialog = false;
  detallesProyecto: Proyecto | null = null;

  asesorInternoNombre: string | null = null;
  // ✅ Para el detalle: revisores con correo

  revisorAnteproyectoNombre: string | null = null;
  revisores: string[] = [];
  revisoresInfo: Array<{ nombre: string; correo: string | null; idDocente: number }> = [];
  integrantes: string[] = [];

  proyectos: Proyecto[] = [];
  empresas: Empresa[] = [];
  modalidades: Catalogo[] = [];
  estados: Catalogo[] = [];
  especializaciones: Catalogo[] = [];

  integrantesInfo: any[] = [];

  isEditing = signal(false);
  currentId: number | null = null;

  form: FormGroup = this.fb.group(
    {
      idEmpresa: [null, Validators.required],
      titulo: ['', Validators.required],
      descripcion: [''],
      objetivo: [''],

      noResidentes: [1, [Validators.required, Validators.min(1)]],

      // strings "HH:mm" para el input type="time"
      horarioInicio: [''],
      horarioFin: [''],

      idEspecializcion: [null, Validators.required],

      idModalidad: [null, Validators.required],
      idEstado: [null, Validators.required],
      idPeriodoAcademico: [null, Validators.required]
    },
    { validators: [timeRangeValidator('horarioInicio', 'horarioFin')] }
  );

  showDialog = false;
  dialogMode: 'add' | 'edit' = 'add';

  searchValue = '';

  showAsignarRevisorDialog = false;
  selectedProyecto: Proyecto | null = null;
  selectedDocenteId: number | null = null;

  docentes: DocenteListItem[] = [];
  docentesOptions: DocenteCargaOption[] = [];
  revisoresMap = new Map<number, { idDocente: number; nombre: string; correo?: string }>();

  showAsignarAsesorRevisoresDialog = false;

  asigLoading = false;
  asigSaving = false;

  selectedAsesorId: number | null = null;
  selectedRevisoresIds: number[] = [];

  revisoresAsignadosNombres: string[] = [];
  revisoresAsignadosIds: number[] = [];

  // --- Documentos / Membretado ---
  membrentadoMeta: { exists: boolean; fileName?: string; contentType?: string; uploadedAt?: string } | null = null;
  membrentadoLoading = false;

  // --- Asesor interno (id + nombre) ---
  asesorInternoId: number | null = null;

  // Locks de generación
  private generandoOficiosAsesor = new Set<string>();

  // ===== Periodo actual =====
  currentPeriodoId: number | null = null;
  currentPeriodoNombre = '';

  // ===== Locks de generación =====
  generandoMasivoAceptacion = false;
  generandoMasivoOficioAsesor = false;

  // Lock por proyecto (evita doble click por fila)
  private generandoPorProyecto = new Set<number>();

  generandoPorProyectoTiene(idProyecto: number): boolean {
    return this.generandoPorProyecto.has(Number(idProyecto));
  }

  // Documento proyecto meta
  docMeta: ProyectoDocumentoMetaDto = { exists: false };
  docLoading = false;
  docUploading = false;
  docDeleting = false;

  docSelectedFile: File | null = null;
  docSelectedFileError = '';

  // Masivo
  showGeneracionMasivaDialog = false;

  masivoPeriodoId: number | null = null;
  masivoIncluyeAceptacion = true;
  masivoIncluyeOficioAsesor = true;
  masivoIncluyeRevisores = false; // placeholder (endpoint faltante)

  masivoItems: Array<{
    key: string;
    tipo: 'ACEPTACION' | 'OFICIO_ASESOR' | 'REVISOR';
    proyectoId: number;
    proyectoTitulo: string;
    selected: boolean;
    label: string;

    // ✅ nuevas
    valid: boolean;
    reason: string;
  }> = [];


  masivoRunning = false;

  get masivoSelectedCount(): number {
    return this.masivoItems.filter(x => x.selected).length;
  }

  showDocsPreviewDialog = false;
  docsPreviewRunning = false;

  docsPreviewTipo: 'ACEPTACION' | 'OFICIO_ASESOR' = 'ACEPTACION';

  docsPreviewItems: Array<{
    selected: boolean;
    valid: boolean;
    reason: string;
    noControl: string;
    displayName: string;
    fileName: string;
    payload: any;
  }> = [];

  get docsPreviewTipoLabel(): string {
    return this.docsPreviewTipo === 'ACEPTACION'
      ? 'Constancias de aceptación'
      : 'Oficios de asignación de asesor interno';
  }

  get docsPreviewSelectedCount(): number {
    return this.docsPreviewItems.filter(x => x.selected && x.valid).length;
  }

  selectAllDocsPreview(v: boolean): void {
    if (v) {
      // solo válidos
      this.docsPreviewItems.forEach(x => x.selected = x.valid);
    } else {
      this.docsPreviewItems.forEach(x => x.selected = false);
    }
  }

  editingOriginal: Proyecto | null = null;

  submitted = false;

  displayDialog: boolean = false;

  showGestionEquipoDialog = false;
  alumnosLibres: any[] = [];
  selectedAlumnoLibreId: number | null = null;
  gestionEquipoLoading = false;

  // ===== Gestión de equipo (misma vista: integrantes + docentes) =====
  gestionEquipoFocus: 'integrantes' | 'docentes' | 'anteproyecto' = 'integrantes';
  gestionEquipoReadOnly = false;

  // Docentes (Asesor interno + Revisores) dentro de Gestionar equipo
  gestionAsesorId: number | null = null;
  gestionRevisoresIds: number[] = [];
  gestionRevisorAnteproyectoId: number | null = null;

  // Snapshot para revertir cambios en el diálogo
  private gestionAsesorIdInicial: number | null = null;
  private gestionRevisoresIdsInicial: number[] = [];
  private gestionRevisorAnteproyectoIdInicial: number | null = null;

  gestionDocentesSaving = false;
  gestionRevisorAnteproyectoSaving = false;

  // ── Sustitución de docentes ──
  showSustitucionDialog = false;
  sustitucionTipoClave: 'ASESOR_INTERNO' | 'REVISOR_RESIDENCIA' = 'ASESOR_INTERNO';
  sustitucionTipoLabel = '';
  sustitucionDocenteSaleId: number | null = null;
  sustitucionDocenteSaleNombre = '';
  sustitucionDocenteEntraId: number | null = null;
  sustitucionMotivo = '';
  sustitucionSaving = false;


  // Cache para bloquear cambio de revisor cuando el anteproyecto ya tiene dictamen final
  private anteproyectoDictamenFinalMap = new Map<number, boolean>();
  private anteproyectoSubidoMap = new Map<number, boolean>();

  get cupoProyectoSeleccionado(): number {
    const p: any = this.detallesProyecto;
    return Number(p?.noResidentes ?? p?.NoResidentes ?? p?.cupo ?? 0) || 0;
  }

  get integrantesActualesCount(): number {
    return (this.integrantesInfo?.length ?? 0);
  }

  get cupoLleno(): boolean {
    const cupo = this.cupoProyectoSeleccionado;
    return cupo > 0 && this.integrantesActualesCount >= cupo;
  }

  /** Verdadero cuando hay más integrantes asignados que el cupo actual del proyecto */
  get excedeCupo(): boolean {
    const cupo = this.cupoProyectoSeleccionado;
    return cupo > 0 && this.integrantesActualesCount > cupo;
  }

  get sobrantesCount(): number {
    const cupo = this.cupoProyectoSeleccionado;
    return Math.max(0, this.integrantesActualesCount - cupo);
  }

  private readonly EXPEDIENTE_REQUIRED_IDS: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

private readonly EXPEDIENTE_LABELS: Record<number, string> = {
  1: 'Dictamen de autorización de comité académico',
  2: 'Solicitud de residencia',
  3: 'Cronograma 100%',
  4: 'Carta de presentación',
  5: 'Carta de aceptación',
  6: 'Reporte parcial 1',
  7: 'Reporte parcial 2',
  8: 'Reporte final',
  9: 'Carta de terminación',
  10: 'Portada con firma de autorización',
  11: 'Proyectos en digital (link Drive)',
  12: 'Acta de calificación'
};

finalizandoProyecto = false;
resumenExpedienteProyecto: Array<{
  idEstudiante: number;
  nombre: string;
  complete: boolean;
  done: number;
  required: number;
  missing: number[];
  pendingReview: number[];
}> = [];

private estadoProyectoFinalizadoId: number | null = null;
private pendingOpenProyectoId: number | null = null;
  

  ngOnInit(): void {
    this.loadEmpresas();
    this.loadProyectos();
    this.loadModalidades();
    this.loadEstados();
    this.loadEspecializaciones();
    this.loadDocentes();
    this.loadPeriodos();
    this.loadPeriodoActual();
    this.cargarEstadosProyectoParaFinalizar();

this.route.queryParamMap.subscribe(params => {
  const id = Number(params.get('openProyecto') ?? 0);
  this.pendingOpenProyectoId = id > 0 ? id : null;

  if (this.pendingOpenProyectoId && this.proyectos?.length) {
    const row = this.proyectos.find(p => Number((p as any)?.id ?? (p as any)?.Id ?? 0) === this.pendingOpenProyectoId);
    if (row) {
      setTimeout(() => this.openDetallesDialog(row), 0);
      this.pendingOpenProyectoId = null;
    }
  }
});
  }

  getExpedienteLabel(id: number): string {
  return this.EXPEDIENTE_LABELS[Number(id)] ?? `Documento ${id}`;
}

joinExpedienteLabels(ids: number[] | null | undefined): string {
  return (ids ?? []).map(id => this.getExpedienteLabel(id)).join(', ');
}

get expedientesCompletosCount(): number {
  return (this.resumenExpedienteProyecto ?? []).filter(r => r.complete).length;
}

get expedientesTotalesCount(): number {
  return (this.resumenExpedienteProyecto ?? []).length;
}


  irAExpedienteAlumno(al: any): void {
  const idEstudiante = Number(al?.id ?? 0);
  const idProyecto = Number(this.detallesProyecto?.id ?? 0);

  if (!idEstudiante) {
    this.showError('No se encontró el estudiante.');
    return;
  }

  this.showDetallesDialog = false;

  this.router.navigate(['/estudiantes'], {
    queryParams: {
      openExpediente: idEstudiante,
      fromProyecto: idProyecto || null
    }
  });
}

  puedeFinalizarProyectoDetalle(): boolean {
  if (!this.detallesProyecto) return false;

  const idEstado = Number(this.detallesProyecto?.idEstado ?? 0);
  if (idEstado !== 7) return false; // En curso

  if (!this.integrantesInfo?.length) return false;

  if (!this.resumenExpedienteProyecto?.length) return false;

  return this.resumenExpedienteProyecto.every(x => x.complete);
}

intentarFinalizarProyectoDetalle(): void {
  const proyectoId = Number(this.detallesProyecto?.id ?? 0);
  if (!proyectoId) return;

  if (this.estadoProyectoFinalizadoId == null) {
    this.showError('No se encontró el estado FINALIZADO.');
    return;
  }

  if (!this.puedeFinalizarProyectoDetalle()) {
    this.showError('No se puede finalizar: faltan expedientes completos o aceptados.');
    return;
  }

  this.finalizandoProyecto = true;

  this.proyectosSvc.finalizarProyecto(proyectoId, this.estadoProyectoFinalizadoId).subscribe({
    next: () => {
      this.finalizandoProyecto = false;
      this.showSuccess('Proyecto finalizado correctamente.');

      // ✅ recarga la tabla y vuelve a abrir el detalle ya actualizado
      this.pendingOpenProyectoId = proyectoId;
      this.loadProyectos();
    },
    error: (err) => {
      console.error(err);
      this.finalizandoProyecto = false;
      this.showError('No se pudo finalizar el proyecto.');
    }
  });
}

  private cargarResumenExpedienteProyecto(idProyecto: number): void {
  const token = this.tokenSvc.getToken();
  if (!token) {
    this.resumenExpedienteProyecto = [];
    return;
  }

  this.proyectosSvc.getIntegrantes(idProyecto).subscribe({
    next: (integrantes: any[]) => {
      const reqs = (integrantes ?? []).map(al =>
        this.documentosSvc.getExpedienteByEstudiante(Number(al?.id ?? 0), token).pipe(
          catchError(() => of([])),
          map((docs: any[]) => {
            const st = this.computeExpedienteStatusFromDocs(docs);
            return {
              idEstudiante: Number(al?.id ?? 0),
              nombre: `${al?.nombre || ''} ${al?.apellidoPaterno || ''} ${al?.apellidoMaterno || ''}`.trim(),
              ...st
            };
          })
        )
      );

      if (!reqs.length) {
        this.resumenExpedienteProyecto = [];
        return;
      }

      forkJoin(reqs).subscribe({
        next: (rows) => {
          this.resumenExpedienteProyecto = rows;
        },
        error: (err) => {
          console.error(err);
          this.resumenExpedienteProyecto = [];
        }
      });
    },
    error: (err) => {
      console.error(err);
      this.resumenExpedienteProyecto = [];
    }
  });
}

  private isDocumentoAceptado(doc: any): boolean {
  return Number(doc?.estadoRevision ?? doc?.EstadoRevision ?? 0) === 1;
}

private computeExpedienteStatusFromDocs(docs: any[]) {
  const present = new Set<number>();
  const accepted = new Set<number>();

  for (const d of (docs ?? [])) {
    const tipo = Number(d?.tipoDocumento ?? d?.TipoDocumento ?? 0);
    if (!tipo || !this.EXPEDIENTE_REQUIRED_IDS.includes(tipo)) continue;

    present.add(tipo);

    if (this.isDocumentoAceptado(d)) {
      accepted.add(tipo);
    }
  }

  const missing = this.EXPEDIENTE_REQUIRED_IDS.filter(id => !present.has(id));
  const pendingReview = this.EXPEDIENTE_REQUIRED_IDS.filter(id => present.has(id) && !accepted.has(id));
  const required = this.EXPEDIENTE_REQUIRED_IDS.length;
  const done = accepted.size;

  return {
    done,
    required,
    complete: missing.length === 0 && pendingReview.length === 0,
    missing,
    pendingReview
  };
}

  private cargarEstadosProyectoParaFinalizar(): void {
  this.estadosSvc.getAll()
    .pipe(map((resp: EstadosPagedResponse) => resp.items ?? []))
    .subscribe({
      next: (rows: any[]) => {
        this.estadoProyectoFinalizadoId = null;

        for (const r of rows) {
          const id = Number(r?.id ?? r?.Id ?? NaN);
          const desc = String(r?.descripcion ?? r?.Descripcion ?? '').trim().toUpperCase();

          if (!Number.isFinite(id) || !desc) continue;

          if (desc.includes('FINALIZ')) {
            this.estadoProyectoFinalizadoId = id;
            break;
          }
        }
      },
      error: (err) => console.error(err)
    });
}

  private buildDocenteNombre(d: any): string {
  return `${d?.nombre ?? ''} ${d?.apellidoPaterno ?? ''} ${d?.apellidoMaterno ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();
}

private buildDocenteCargaLabel(
  nombre: string,
  carga?: Partial<DocenteCargaResumen> | null
): string {
  const asesor = Number(carga?.asesorInternoCount ?? 0);
  const revisor = Number(carga?.revisorResidenciaCount ?? 0);
  const ante = Number(carga?.revisorAnteproyectoCount ?? 0);
  const total = Number(carga?.totalActivos ?? (asesor + revisor + ante));

  return `${nombre} · As:${asesor} · Rev:${revisor} · Ant:${ante} · Tot:${total}`;
}

private mapDocentesOptions(
  docentes: DocenteListItem[],
  cargas: DocenteCargaResumen[]
): DocenteCargaOption[] {
  const cargasMap = new Map<number, DocenteCargaResumen>(
    (cargas ?? []).map(c => [Number(c.idDocente), c])
  );

  return (docentes ?? [])
    .map((d) => {
      const nombrePlano = this.buildDocenteNombre(d);
      const carga = cargasMap.get(Number(d.id));

      const asesorInternoCount = Number(carga?.asesorInternoCount ?? 0);
      const revisorResidenciaCount = Number(carga?.revisorResidenciaCount ?? 0);
      const revisorAnteproyectoCount = Number(carga?.revisorAnteproyectoCount ?? 0);
      const totalActivos = Number(
        carga?.totalActivos ??
        (asesorInternoCount + revisorResidenciaCount + revisorAnteproyectoCount)
      );

      return {
        value: Number(d.id),
        correo: String((d as any)?.correo ?? ''),
        nombrePlano,
        asesorInternoCount,
        revisorResidenciaCount,
        revisorAnteproyectoCount,
        totalActivos,
        label: this.buildDocenteCargaLabel(nombrePlano, carga)
      };
    })
    .sort((a, b) => a.nombrePlano.localeCompare(b.nombrePlano, 'es', { sensitivity: 'base' }));
}

getDocenteCargaTexto(idDocente: number | null | undefined): string {
  const id = Number(idDocente ?? 0);
  if (!id) return '';

  const doc = this.docentesOptions.find(x => Number(x.value) === id);
  if (!doc) return '';

  return `Asesor: ${doc.asesorInternoCount} · Revisor: ${doc.revisorResidenciaCount} · Anteproyecto: ${doc.revisorAnteproyectoCount} · Total: ${doc.totalActivos}`;
}

  private getEstadoId(p: any): number {
  // cubre variaciones comunes del backend/DTO
  return Number(p?.idEstado ?? p?.IdEstado ?? p?.idestado ?? p?.estadoId ?? p?.id_estado ?? 0) || 0;
}

private getProyectoId(p: any): number {
  return Number(p?.id ?? p?.Id ?? p?.idProyecto ?? p?.id_proyecto ?? 0) || 0;
}

getEstadoProyectoLabel(idEstado: number | null | undefined): string {
  if (idEstado == null) return 'Sin estado';

  return this.getEstadoProyectoUI(idEstado)?.shortLabel || `Estado #${idEstado}`;
}

  guardarDocentesResidenciaGestion(): void {
  const p: any = this.detallesProyecto;
  if (!p) return;

  if (this.gestionEquipoReadOnly || !this.puedeGestionarAsesorYRevisores(p)) {
    this.showError('Este proyecto no permite asignar/cambiar asesor y revisores en este estado.');
    return;
  }

  const idProyecto = Number(p?.id ?? 0);
  if (!idProyecto) {
    this.showError('Proyecto inválido (sin id).');
    return;
  }

  const idAsesor = Number(this.gestionAsesorId ?? 0);
  const revisoresIds = (this.gestionRevisoresIds || []).map(x => Number(x)).filter(n => n > 0);

  if (!idAsesor) {
    this.showError('Selecciona un asesor interno.');
    return;
  }
  if (!revisoresIds.length) {
    this.showError('Selecciona al menos 1 revisor.');
    return;
  }
  if (revisoresIds.includes(idAsesor)) {
    this.showError('El asesor interno no puede ser también revisor.');
    return;
  }

  // Diferencias respecto a lo asignado actualmente (snapshot)
  const actuales = (this.gestionRevisoresIdsInicial || []).map(x => Number(x)).filter(n => n > 0);
  const nuevos = revisoresIds.filter(id => !actuales.includes(id));
  const eliminados = actuales.filter(id => !revisoresIds.includes(id));

  this.gestionDocentesSaving = true;

  const setAsesor$ = this.proyectosSvc.asignarDocenteRelacion(idProyecto, {
    idDocente: idAsesor,
    tipoClave: this.ROL_ASESOR_INTERNO
  });

  const addRevisores$ = nuevos.length
    ? forkJoin(
      nuevos.map(idDoc =>
        this.proyectosSvc.asignarDocenteRelacion(idProyecto, {
          idDocente: Number(idDoc),
          tipoClave: this.ROL_REVISOR_REPORTE
        })
      )
    )
    : of([]);

  const delRevisores$ = eliminados.length
    ? forkJoin(
      eliminados.map(idDoc =>
        this.proyectosSvc.quitarDocenteRelacionPorDocente(idProyecto, this.ROL_REVISOR_REPORTE, Number(idDoc))
      )
    )
    : of([]);

  // ✅ Orden seguro + ✅ notificaciones al final
  setAsesor$.pipe(
    concatMap(() => addRevisores$),
    concatMap(() => delRevisores$),
    concatMap(() => this.enviarCorreosAsignacionAsesorYRevisores$(p as Proyecto, idAsesor, revisoresIds)),
    finalize(() => {
      this.gestionDocentesSaving = false;
      this.cdr.detectChanges();
    })
  ).subscribe({
    next: ({ ok, fail }) => {
      if (fail === 0) {
        this.showSuccess('Asesor interno y revisores actualizados. Notificaciones enviadas.');
      } else {
        this.showError(`Asesor interno y revisores actualizados, pero fallaron ${fail} notificaciones (${ok} OK).`);
      }

      // Refrescar snapshot + listas
      this.cargarGestionEquipo(idProyecto);
      this.loadProyectos();
    },
    error: (e) => {
      console.error(e);
      const msg = e?.error ?? e?.message ?? 'No se pudo guardar el comité.';
      this.showError(typeof msg === 'string' ? msg : 'No se pudo guardar el comité.');
    }
  });
}

guardarRevisorAnteproyectoGestion(): void {
  const p: any = this.detallesProyecto;
  if (!p) return;

  if (this.gestionEquipoReadOnly || !this.puedeCambiarRevisorAnteproyecto(p)) {
    this.showError('Este proyecto no permite cambiar el revisor de anteproyecto en este estado.');
    return;
  }

  const idProyecto = Number(p?.id ?? 0);
  const idDoc = Number(this.gestionRevisorAnteproyectoId ?? 0);

  if (!idProyecto || !idDoc) {
    this.showError('Selecciona un revisor de anteproyecto válido.');
    return;
  }

  const dictFinal = this.anteproyectoDictamenFinalMap.get(idProyecto) ?? false;
  if (dictFinal) {
    this.showError('No es posible cambiar el revisor porque el anteproyecto ya tiene dictamen final.');
    return;
  }

  // Datos del revisor (para correo)
  const docente = this.docentes?.find((d: any) => Number(d?.id) === Number(idDoc));
  const nombreDoc = docente
    ? `${(docente as any)?.nombre ?? ''} ${(docente as any)?.apellidoPaterno ?? ''} ${(docente as any)?.apellidoMaterno ?? ''}`.trim()
    : 'Revisor de anteproyecto';
  const correoRevisor = (docente as any)?.correo ?? null;

  const titulo = (p as any)?.titulo ?? `Proyecto #${idProyecto}`;

  this.gestionRevisorAnteproyectoSaving = true;

  this.proyectosSvc.asignarDocenteRelacion(idProyecto, {
    idDocente: idDoc,
    tipoClave: 'REVISOR_ANTEPROYECTO'
  }).pipe(

    // ✅ Notificar a: revisor de anteproyecto + integrantes
    concatMap(() => this.proyectosSvc.getIntegrantes(idProyecto).pipe(
      catchError(() => of([])),
      concatMap((rows: any[]) => {
        const integrantes = Array.isArray(rows) ? rows : [];
        const correosIntegrantes = Array.from(
          new Set(
            integrantes
              .map((x: any) => String(x?.correo ?? '').trim().toLowerCase())
              .filter(Boolean)
          )
        );

        const temaRevisor = `Revisión de anteproyecto: ${titulo}`;
        const cuerpoRevisor = `
          <p>Hola <b>${nombreDoc}</b>.</p>
          <p>Se te asignó un anteproyecto para revisión.</p>
          <p><b>Proyecto:</b> ${titulo}</p>
          <p>Gracias.</p>
        `;

        const temaIntegrantes = `Revisor de anteproyecto asignado/actualizado: ${titulo}`;
        const cuerpoIntegrantes = `
          <p>Hola.</p>
          <p>Se asignó/actualizó el <b>revisor de anteproyecto</b> de su proyecto:</p>
          <p><b>Proyecto:</b> ${titulo}</p>
          <p><b>Revisor:</b> ${nombreDoc}</p>
          <p>Puedes ingresar al sistema para dar seguimiento.</p>
          <p>Gracias.</p>
        `;

        const envios: Observable<boolean>[] = [];

        if (correoRevisor) {
          envios.push(this.sendEmailSafe$(correoRevisor, temaRevisor, cuerpoRevisor));
        }

        correosIntegrantes.forEach(c => {
          envios.push(this.sendEmailSafe$(c, temaIntegrantes, cuerpoIntegrantes));
        });

        if (!envios.length) return of({ ok: 0, fail: 0 });

        return forkJoin(envios).pipe(
          map((res: boolean[]) => {
            const ok = res.filter(x => x).length;
            const fail = res.length - ok;
            return { ok, fail };
          }),
          catchError(() => of({ ok: 0, fail: envios.length }))
        );
      })
    )),

    finalize(() => {
      this.gestionRevisorAnteproyectoSaving = false;
      this.cdr.detectChanges();
    })

  ).subscribe({
    next: ({ ok, fail }) => {
      if (fail === 0) {
        this.showSuccess('Revisor de anteproyecto actualizado. Notificaciones enviadas.');
      } else {
        this.showError(`Revisor de anteproyecto actualizado, pero fallaron ${fail} notificaciones (${ok} OK).`);
      }

      this.cargarGestionEquipo(idProyecto);
      this.loadProyectos();
    },
    error: (e) => {
      console.error(e);
      this.showError(e?.error || e?.message || 'No se pudo guardar el revisor de anteproyecto.');
    }
  });
}

/** Solo la Jefa de Vinculación (permiso "Proyecto-Sustituir") puede usar esta función */
get canSustituirDocente(): boolean {
  return this.usuariosSvc.hasPerm('Proyecto', 'Sustituir') || this.isUsuarioAdmin;
}

/** Llamado desde el panel "Gestionar equipo" para sustituir el asesor */
sustituirAsesorDesdeGestion(): void {
  if (!this.canSustituirDocente) {
    this.showError('Solo la Jefa de Vinculación puede realizar sustituciones de docentes.');
    return;
  }
  if (!this.gestionAsesorId || !this.sustitucionDocenteEntraId) return;

  this.sustitucionTipoClave         = 'ASESOR_INTERNO';
  this.sustitucionTipoLabel         = 'Asesor Interno';
  this.sustitucionDocenteSaleId     = this.gestionAsesorId;
  this.sustitucionDocenteSaleNombre =
    this.docentesOptions.find(d => d.value === this.gestionAsesorId)?.nombrePlano ?? '';

  this.confirmarSustitucion();
}

/** Llamado desde el panel "Gestionar equipo" para sustituir un revisor */
sustituirRevisorDesdeGestion(): void {
  if (!this.canSustituirDocente) {
    this.showError('Solo la Jefa de Vinculación puede realizar sustituciones de docentes.');
    return;
  }
  if (!this.sustitucionDocenteSaleId || !this.sustitucionDocenteEntraId) return;

  this.sustitucionTipoClave     = 'REVISOR_RESIDENCIA';
  this.sustitucionTipoLabel     = 'Revisor';
  this.sustitucionDocenteSaleNombre =
    this.docentesOptions.find(d => d.value === this.sustitucionDocenteSaleId)?.nombrePlano ?? '';

  this.confirmarSustitucion();
}

// ── Sustitución de docentes ──────────────────────────────────────────

abrirSustitucion(tipoClave: 'ASESOR_INTERNO' | 'REVISOR_RESIDENCIA', idDocenteSale: number, nombreSale: string): void {
  if (!this.canSustituirDocente) {
    this.showError('Solo la Jefa de Vinculación puede realizar sustituciones de docentes.');
    return;
  }
  this.sustitucionTipoClave         = tipoClave;
  this.sustitucionTipoLabel         = tipoClave === 'ASESOR_INTERNO' ? 'Asesor Interno' : 'Revisor';
  this.sustitucionDocenteSaleId     = idDocenteSale;
  this.sustitucionDocenteSaleNombre = nombreSale;
  this.sustitucionDocenteEntraId    = null;
  this.sustitucionMotivo            = '';
  this.showSustitucionDialog        = true;
}

confirmarSustitucion(): void {
  const p: any = this.detallesProyecto;
  if (!p) return;

  const idProyecto = Number(p?.id ?? 0);
  if (!idProyecto || !this.sustitucionDocenteSaleId || !this.sustitucionDocenteEntraId) {
    this.showError('Completa todos los campos.');
    return;
  }
  if (this.sustitucionDocenteSaleId === this.sustitucionDocenteEntraId) {
    this.showError('El docente entrante debe ser diferente al saliente.');
    return;
  }

  this.sustitucionSaving = true;

  this.proyectosSvc.sustituirDocente(idProyecto, {
    tipoClave:      this.sustitucionTipoClave,
    idDocenteSale:  this.sustitucionDocenteSaleId,
    idDocenteEntra: this.sustitucionDocenteEntraId,
    motivo:         this.sustitucionMotivo || undefined,
  }).pipe(
    finalize(() => {
      this.sustitucionSaving = false;
      this.cdr.detectChanges();
    })
  ).subscribe({
    next: (res: any) => {
      this.showSuccess(res?.mensaje ?? 'Sustitución realizada.');
      this.showSustitucionDialog = false;
      this.cargarGestionEquipo(idProyecto);
      this.loadProyectos();
    },
    error: (e: any) => {
      const msg = e?.error?.mensaje ?? e?.error ?? e?.message ?? 'No se pudo completar la sustitución.';
      this.showError(typeof msg === 'string' ? msg : 'No se pudo completar la sustitución.');
    }
  });
}

confirmGuardarAsesorYRevisores(): void {
  if (!this.selectedProyecto) return;

  const p = this.selectedProyecto;

  if (!this.puedeAsignarAsesorYRevisores(p)) {
    this.showError('Este proyecto ya no permite asignar asesor y revisores en este estado.');
    return;
  }

  if (!this.selectedAsesorId) {
    this.showError('Selecciona un asesor interno.');
    return;
  }

  if (!this.selectedRevisoresIds?.length) {
    this.showError('Selecciona al menos 1 revisor.');
    return;
  }

  if (this.selectedRevisoresIds.includes(this.selectedAsesorId)) {
    this.showError('El asesor interno no puede ser también revisor (ajústalo si tu regla lo permite).');
    return;
  }

  this.asigSaving = true;

  const idProyecto = p.id;
  const idAsesor = Number(this.selectedAsesorId);
  const revisoresIds = [...this.selectedRevisoresIds].map(x => Number(x)).filter(n => n > 0);

  const nuevos = revisoresIds.filter(id => !this.revisoresAsignadosIds.includes(id));
  const eliminados = this.revisoresAsignadosIds.filter(id => !revisoresIds.includes(id));

  const setAsesor$ = this.proyectosSvc.asignarDocenteRelacion(idProyecto, {
    idDocente: idAsesor,
    tipoClave: this.ROL_ASESOR_INTERNO
  });

  const addRevisores$ = nuevos.length
    ? forkJoin(
      nuevos.map(idDoc =>
        this.proyectosSvc.asignarDocenteRelacion(idProyecto, {
          idDocente: Number(idDoc),
          tipoClave: this.ROL_REVISOR_REPORTE
        })
      )
    )
    : of([]);

  const delRevisores$ = eliminados.length
    ? forkJoin(
      eliminados.map(idDoc =>
        this.proyectosSvc.quitarDocenteRelacionPorDocente(idProyecto, this.ROL_REVISOR_REPORTE, Number(idDoc))
      )
    )
    : of([]);

  setAsesor$.pipe(
    concatMap(() => addRevisores$),
    concatMap(() => delRevisores$),

    // ✅ Notificar a: asesor + revisores + integrantes
    concatMap(() => this.enviarCorreosAsignacionAsesorYRevisores$(p, idAsesor, revisoresIds)),

    finalize(() => {
      this.asigSaving = false; // ✅ (antes estaba mal: gestionDocentesSaving)
      this.cdr.detectChanges();
    })
  ).subscribe({
    next: ({ ok, fail }) => {
      if (fail === 0) {
        this.showSuccess('Asesor interno y revisores actualizados. Notificaciones enviadas.');
      } else {
        this.showError(`Asesor interno y revisores actualizados, pero fallaron ${fail} notificaciones (${ok} OK).`);
      }

      // ✅ Mantener consistente el snapshot del diálogo
      this.revisoresAsignadosIds = [...revisoresIds];
      this.selectedRevisoresIds = [...revisoresIds];

      const asesor = this.docentes?.find((d: any) => Number(d?.id) === Number(idAsesor));
      this.asesorInternoNombre = asesor
        ? `${(asesor as any)?.nombre ?? ''} ${(asesor as any)?.apellidoPaterno ?? ''} ${(asesor as any)?.apellidoMaterno ?? ''}`.trim()
        : this.asesorInternoNombre;

      this.revisoresAsignadosNombres = (this.docentes || [])
        .filter((d: any) => revisoresIds.includes(Number(d?.id)))
        .map((d: any) => `${d?.nombre ?? ''} ${d?.apellidoPaterno ?? ''} ${d?.apellidoMaterno ?? ''}`.trim())
        .filter(Boolean);

      // Refrescar proyectos
      this.loadProyectos();
    },
    error: (e) => {
      console.error(e);
      const msg = e?.error ?? e?.message ?? 'No se pudo guardar el comité.';
      this.showError(typeof msg === 'string' ? msg : 'No se pudo guardar el comité.');
    }
  });
}

  
  openGestionEquipo(p: any, focus: 'integrantes' | 'docentes' | 'anteproyecto' = 'integrantes'): void {
    if (!p) {
      this.showError('Proyecto inválido.');
      return;
    }

    // 🔒 En cancelado (9) / finalizado (8) NO se permite gestionar (ni mostrar el botón)
    const st = Number(p?.idEstado ?? 0);
    if ([this.ESTADO_FINALIZADO_ID, this.ESTADO_CANCELADO_ID].includes(st)) {
      this.showError('Este proyecto está finalizado o cancelado y no permite gestionar integrantes/docentes.');
      return;
    }

    // Modo solo-lectura (por seguridad, si en el futuro agregas otros estados bloqueados)
    this.gestionEquipoReadOnly = !this.puedeEditarProyecto(p);
    this.gestionEquipoFocus = focus;

    // Amarra el diálogo al proyecto correcto
    this.detallesProyecto = p;

    // Limpieza (evita que se “pegue” info de otro proyecto al recargar / reabrir)
    this.selectedAlumnoLibreId = null;
    this.alumnosLibres = [];
    this.integrantesInfo = [];


    // Docentes (reset)
    this.gestionAsesorId = null;
    this.gestionRevisoresIds = [];
    this.gestionRevisorAnteproyectoId = null;
    this.gestionAsesorIdInicial = null;
    this.gestionRevisoresIdsInicial = [];
    this.gestionRevisorAnteproyectoIdInicial = null;
    // Sustitución (reset)
    this.sustitucionDocenteSaleId    = null;
    this.sustitucionDocenteEntraId   = null;
    this.sustitucionMotivo           = '';
    // Abre diálogo y carga data
    this.showGestionEquipoDialog = true;

    const proyectoId = Number(p?.id ?? p?.Id ?? p?.idProyecto ?? 0);
    if (!proyectoId) {
      this.showError('No se pudo identificar el ID del proyecto.');
      return;
    }

    this.cargarGestionEquipo(proyectoId);
  }

  /**
   * Carga TODO lo que necesita el diálogo de gestión de integrantes:
   * - integrantes actuales
   * - alumnos libres
   * - si el anteproyecto ya tiene dictamen final (para bloquear cambio de revisor)
   */
  private cargarGestionEquipo(proyectoId: number): void {
    this.gestionEquipoLoading = true;

    forkJoin({
      integrantes: this.proyectosSvc.getIntegrantes(proyectoId).pipe(catchError(() => of([]))),
      libres: this.estudianteSvc.getLibres().pipe(catchError(() => of([]))),
      dictFinal: this.getAnteproyectoDictamenFinal$(proyectoId).pipe(catchError(() => of(false))),
      anteSubido: this.getAnteproyectoSubido$(proyectoId).pipe(catchError(() => of(false))),
      asesor: this.proyectosSvc.getDocenteRelacion(proyectoId, this.ROL_ASESOR_INTERNO).pipe(catchError(() => of(null))),
      revisores: this.proyectosSvc.getDocentesRelacion(proyectoId, this.ROL_REVISOR_REPORTE).pipe(catchError(() => of([]))),
      revisorAnte: this.proyectosSvc.getDocenteRelacion(proyectoId, 'REVISOR_ANTEPROYECTO').pipe(catchError(() => of(null))),
    }).pipe(
      finalize(() => {
        this.gestionEquipoLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe(({ integrantes, libres, dictFinal, anteSubido, asesor, revisores, revisorAnte }) => {
      this.integrantesInfo = (integrantes ?? []) as any[];
      this.alumnosLibres = (libres ?? []) as any[];
      this.anteproyectoDictamenFinalMap.set(proyectoId, !!dictFinal);
      this.anteproyectoSubidoMap.set(proyectoId, !!anteSubido);

      // --- Docentes asignados (para gestionar en esta misma vista) ---
      const asesorId = Number((asesor as any)?.idDocente ?? (asesor as any)?.iddocente ?? 0) || null;
      this.gestionAsesorId = asesorId;
      this.gestionAsesorIdInicial = asesorId;

      const revList = (revisores ?? []) as any[];
      const revIds = revList
        .map((x: any) => Number(x?.idDocente ?? x?.iddocente ?? 0))
        .filter((n: number) => Number.isFinite(n) && n > 0);

      this.gestionRevisoresIds = [...revIds];
      this.gestionRevisoresIdsInicial = [...revIds];

      const revAnteId = Number((revisorAnte as any)?.idDocente ?? (revisorAnte as any)?.iddocente ?? 0) || null;
      this.gestionRevisorAnteproyectoId = revAnteId;
      this.gestionRevisorAnteproyectoIdInicial = revAnteId;
    });
  }

  private getAnteproyectoDictamenFinal$(idProyecto: number): Observable<boolean> {
    return this.entregablesSvc.getByProyecto(idProyecto).pipe(
      map((entregables: any[]) => {
        const lista = Array.isArray(entregables) ? entregables : [];

        const candidatos = lista
          .filter((e: any) =>
            Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === Number(this.TIPO_ANTEPROYECTO)
          )
          .slice()
          .sort((a: any, b: any) => {
            const da = new Date(a?.fechaCreacion ?? a?.FechaCreacion ?? 0).getTime();
            const db = new Date(b?.fechaCreacion ?? b?.FechaCreacion ?? 0).getTime();
            return db - da;
          });

        const ante = candidatos.length ? candidatos[0] : null;

        const clave = String(ante?.estadoClave ?? ante?.EstadoClave ?? '').toUpperCase().trim();
        const idEstadoEnt = Number(ante?.idEstadoEntregable ?? ante?.IdEstadoEntregable ?? 0);

        const dictFinalPorClave = (clave === 'APROBADO' || clave === 'RECHAZADO');
        const dictFinalPorId = (idEstadoEnt === this.ENT_APROBADO || idEstadoEnt === this.ENT_RECHAZADO);

        return dictFinalPorClave || dictFinalPorId;
      }),
      catchError(() => of(false))
    );
  }


  private getAnteproyectoSubido$(idProyecto: number): Observable<boolean> {
    return this.entregablesSvc.getByProyecto(idProyecto).pipe(
      map((entregables: any[]) => {
        const lista = Array.isArray(entregables) ? entregables : [];

        const candidatos = lista
          .filter((e: any) =>
            Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === Number(this.TIPO_ANTEPROYECTO)
          )
          .slice()
          .sort((a: any, b: any) => {
            const da = new Date(a?.fechaCreacion ?? a?.FechaCreacion ?? 0).getTime();
            const db = new Date(b?.fechaCreacion ?? b?.FechaCreacion ?? 0).getTime();
            return db - da;
          });

        const ante = candidatos.length ? candidatos[0] : null;
        const idEntregable = Number(ante?.id ?? ante?.Id ?? 0);
        return Number.isFinite(idEntregable) && idEntregable > 0 ? idEntregable : 0;
      }),
      concatMap((idEntregable: number) => {
        if (!idEntregable) return of(false);

        return this.entregablesSvc.getDetalle(idEntregable).pipe(
          map((det: any) => Array.isArray(det?.versiones) && det.versiones.length > 0),
          catchError(() => of(false))
        );
      }),
      catchError(() => of(false))
    );
  }

  private loadAnteproyectoSubidos(): void {
    const targets = (this.proyectos ?? [])
      .filter(p => {
        const st = Number(p?.idEstado ?? 0);
        return st === this.ESTADO_ESPERA_REVISOR_ID || st === this.ESTADO_ESPERA_REVISION_ANTEPROYECTO_ID;
      });

    if (!targets.length) {
      this.anteproyectoSubidoMap.clear();
      return;
    }

    forkJoin(
      targets.map(p =>
        this.getAnteproyectoSubido$(Number(p.id)).pipe(
          map((subido) => ({ idProyecto: Number(p.id), subido })),
          catchError(() => of({ idProyecto: Number(p.id), subido: false }))
        )
      )
    ).subscribe((rows) => {
      this.anteproyectoSubidoMap.clear();

      for (const row of (rows ?? [])) {
        const idProyecto = Number(row?.idProyecto ?? 0);
        if (idProyecto > 0) {
          this.anteproyectoSubidoMap.set(idProyecto, !!row?.subido);
        }
      }

      this.cdr.detectChanges();
    });
  }

  tieneAnteproyectoSubido(p: any): boolean {
    const idProyecto = this.getProyectoId(p);
    if (!idProyecto) return false;
    return this.anteproyectoSubidoMap.get(idProyecto) ?? false;
  }

  

  getTooltipAsignarRevisor(p: any): string {
    if (!p) return 'Asignar / cambiar revisor de anteproyecto';

    const st = this.getEstadoId(p);
    if (st !== this.ESTADO_ESPERA_REVISOR_ID) {
      return 'La asignación inicial del revisor se realiza únicamente en estado 3.';
    }

    if (!this.tieneAnteproyectoSubido(p)) {
      return 'Primero debe existir al menos una versión subida del anteproyecto.';
    }

    return 'Asignar / cambiar revisor de anteproyecto';
  }

  private cargarIntegrantesProyecto(idProyecto: number): void {
    this.gestionEquipoLoading = true;

    this.proyectosSvc.getIntegrantes(idProyecto).subscribe({
      next: (rows: any[]) => {
        this.integrantesInfo = (rows ?? []);
        this.gestionEquipoLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.gestionEquipoLoading = false;
        this.showError('No se pudieron cargar los integrantes.');
      }
    });
  }

puedeCambiarRevisorAnteproyecto(p: any): boolean {
  const st = this.getEstadoId(p);

  if (
    st === this.ESTADO_FINALIZADO_ID ||
    st === this.ESTADO_CANCELADO_ID
  ) {
    return false;
  }

  const idProyecto = this.getProyectoId(p);

  return (
    (st === this.ESTADO_ESPERA_REVISOR_ID ||
      st === this.ESTADO_ESPERA_REVISION_ANTEPROYECTO_ID) &&
    (this.anteproyectoSubidoMap?.get(idProyecto) ?? false)
  );
}

  puedeAsignarAsesorYRevisores(p: any): boolean {
    const st = Number(p?.idEstado ?? 0);
    if ([this.ESTADO_CANCELADO_ID, this.ESTADO_FINALIZADO_ID].includes(st)) return false;
    // ✅ Regla nueva: asignación inicial SOLO en estado 6
    return st === this.ESTADO_ESPERA_ASESOR_ID;
  }

  puedeGestionarAsesorYRevisores(p: any): boolean {
  const st = this.getEstadoId(p);

  if (st === this.ESTADO_FINALIZADO_ID || st === this.ESTADO_CANCELADO_ID) return false;

  // ✅ Asignar en 6 / Modificar en 7
  return st === this.ESTADO_ESPERA_ASESOR_ID || st === this.ESTADO_EN_CURSO_ID;
}


  // ===== Gestión de docentes dentro del diálogo "Gestionar equipo" =====
  revertirDocentesResidenciaGestion(): void {
    this.gestionAsesorId = this.gestionAsesorIdInicial;
    this.gestionRevisoresIds = [...(this.gestionRevisoresIdsInicial || [])];
  }

  

  revertirRevisorAnteproyectoGestion(): void {
    this.gestionRevisorAnteproyectoId = this.gestionRevisorAnteproyectoIdInicial;
  }

 



  private cargarAlumnosLibres(): void {
    this.estudianteSvc.getLibres().subscribe({
      next: (rows: any[]) => this.alumnosLibres = (rows ?? []),
      error: (err) => {
        console.error(err);
        this.alumnosLibres = [];
        this.showError('No se pudieron cargar los alumnos libres.');
      }
    });
  }

  agregarIntegranteSeleccionado(): void {
    if (!this.detallesProyecto) return;

    const idProyecto = Number(this.detallesProyecto.id ?? 0);
    const idEstudiante = Number(this.selectedAlumnoLibreId ?? 0);

    if (!idProyecto || !idEstudiante) {
      this.showError('Selecciona un alumno válido.');
      return;
    }


    // ✅ Cupo del proyecto (noResidentes). Si ya se alcanzó, bloquea.
    const cupo = this.cupoProyectoSeleccionado;
    if (cupo > 0 && this.integrantesActualesCount >= cupo) {
      this.showError(`El proyecto ya alcanzó el cupo (${this.integrantesActualesCount}/${cupo}).`);
      return;
    }

    this.proyectosSvc.agregarIntegrante(idProyecto, idEstudiante).subscribe({
      next: () => {
        this.showSuccess('Integrante agregado.');
        this.selectedAlumnoLibreId = null;
        this.cargarIntegrantesProyecto(idProyecto);
        this.cargarAlumnosLibres();
      },
      error: (err) => {
        console.error(err);
        const msg = err?.error ?? err?.message ?? null;
        this.showError(typeof msg === 'string' ? msg : 'No se pudo agregar el integrante.');
      }
    });
  }

  quitarIntegrante(idEstudiante: number): void {
    if (!this.detallesProyecto) return;

    const idProyecto = Number(this.detallesProyecto.id ?? 0);
    if (!idProyecto || !idEstudiante) return;

    // Buscar nombre del estudiante para el mensaje de confirmación
    const est = this.integrantesInfo.find((a: any) => a.id === idEstudiante);
    const nombre = est
      ? `${est.nombre ?? ''} ${est.apellidoPaterno ?? ''}`.trim()
      : 'este estudiante';

    const confirmado = confirm(
      `¿Confirmas quitar a "${nombre}" del proyecto?

Esta acción lo dejará sin proyecto asignado.`
    );
    if (!confirmado) return;

    this.proyectosSvc.quitarIntegrante(idProyecto, idEstudiante).subscribe({
      next: () => {
        this.showSuccess('Integrante removido.');
        this.cargarIntegrantesProyecto(idProyecto);
        this.cargarAlumnosLibres();
      },
      error: (err) => {
        console.error(err);
        const msg = err?.error ?? err?.message ?? null;
        this.showError(typeof msg === 'string' ? msg : 'No se pudo quitar el integrante.');
      }
    });
  }


 puedeEditarProyecto(p: any): boolean {
  const st = this.getEstadoId(p);
  return st !== this.ESTADO_FINALIZADO_ID && st !== this.ESTADO_CANCELADO_ID;
}


  onSelectEtapaEntregables(tipo: number): void {
    this.selectedTipoEntregable = Number(tipo);
    this.entregablesActual = this.getEntregablesPorTipo(this.selectedTipoEntregable);

    // si ya hay cache, no pegamos al back
    if ((this.entregablesActual?.length ?? 0) > 0) return;

    const idProyecto = Number(this.detallesProyecto?.id ?? 0);
    if (!idProyecto) return;

    this.cargarEntregablePorTipo(idProyecto, this.selectedTipoEntregable);
  }

  private cargarEntregablePorTipo(idProyecto: number, idTipoEntregable: number): void {
    this.entregablesLoading = true;

    this.entregablesSvc.getByProyecto(idProyecto).pipe(
      catchError((e) => {
        console.error(e);
        this.entregablesLoading = false;
        this.entregablesActual = [];
        return of([]);
      })
    ).subscribe((entregables: any[]) => {
      const ent = (entregables ?? []).find((e: any) =>
        Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === Number(idTipoEntregable)
      );

      if (!ent) {
        this.setEntregablesPorTipo(idTipoEntregable, []);
        this.entregablesActual = [];
        this.entregablesLoading = false;
        this.cdr.detectChanges();
        return;
      }

      const idEntregable = Number(ent?.id ?? ent?.Id ?? 0);
      if (!idEntregable) {
        this.setEntregablesPorTipo(idTipoEntregable, []);
        this.entregablesActual = [];
        this.entregablesLoading = false;
        this.cdr.detectChanges();
        return;
      }

      this.entregablesSvc.getDetalle(idEntregable).pipe(
        catchError((e) => {
          console.error(e);
          this.entregablesLoading = false;
          this.entregablesActual = [];
          return of(null);
        })
      ).subscribe((det: any) => {
        if (!det) {
          this.setEntregablesPorTipo(idTipoEntregable, []);
          this.entregablesActual = [];
          this.entregablesLoading = false;
          this.cdr.detectChanges();
          return;
        }

        const versiones: any[] = det?.versiones ?? [];
        const revisiones: any[] = det?.revisiones ?? [];

        const rows: EntregableVersionRow[] = versiones
          .slice()
          .sort((a, b) =>
            Number(b?.numeroVersion ?? b?.NumeroVersion ?? 0) -
            Number(a?.numeroVersion ?? a?.NumeroVersion ?? 0)
          )
          .map((v) => {
            const idVer = Number(v?.id ?? v?.Id ?? 0);

            const revsV = (revisiones ?? [])
              .filter(r => Number(r?.idEntregableVersion ?? r?.IdEntregableVersion) === idVer)
              .slice()
              .sort((a, b) => {
                const na = Number(a?.numeroRevision ?? a?.NumeroRevision ?? 0);
                const nb = Number(b?.numeroRevision ?? b?.NumeroRevision ?? 0);
                return nb - na;
              });

            const last = revsV.length ? revsV[0] : null;
            const ultimoDictamen = last
              ? String(last?.dictamen ?? last?.Dictamen ?? '').trim().toUpperCase()
              : null;

            const totalRevisiones = revsV.length;

            return {
              idVersion: idVer,
              idEntregable: Number(v?.idEntregable ?? v?.IdEntregable ?? idEntregable),
              numeroVersion: Number(v?.numeroVersion ?? v?.NumeroVersion ?? 0),
              fechaSubida: v?.fechaSubida ?? v?.FechaSubida,
              nombreOriginal: v?.nombreOriginal ?? v?.NombreOriginal,
              tamanoBytes: Number(v?.tamanoBytes ?? v?.TamanoBytes ?? 0),

              idEstudianteSubio: v?.idEstudianteSubio ?? v?.IdEstudianteSubio ?? null,
              subidoPor: v?.subidoPor ?? v?.SubidoPor ?? null,

              totalRevisiones,
              ultimoDictamen,
              ultimaObs: last ? String(last?.observaciones ?? last?.Observaciones ?? '').trim() : null,
              fechaUltimaRevision: last ? (last?.fechaRevision ?? last?.FechaRevision ?? null) : null,

              estadoVisible: this.estadoVisiblePorVersion(totalRevisiones, ultimoDictamen),
            };
          });

        this.setEntregablesPorTipo(idTipoEntregable, rows);
        this.entregablesActual = this.getEntregablesPorTipo(this.selectedTipoEntregable);

        this.entregablesLoading = false;
        this.cdr.detectChanges();
      });
    });
  }

  verEntregableVersion(row: any): void {
    const idVersion = Number(row?.idVersion ?? 0);
    if (!idVersion) return;

    const fileName = row?.nombreOriginal || 'entregable.pdf';

    this.liberarPdfUrl();
    this.pdfFileName = fileName;

    this.entregablesSvc.downloadVersion(idVersion).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;

        if (blob.type !== 'application/pdf') {
          this.showError('El archivo recibido no es un PDF.');
          return;
        }

        const fileSizeInMB = blob.size / (1024 * 1024);
        if (fileSizeInMB > 15) {
          this.showError('El PDF es demasiado grande para visualizarlo en línea.');
          return;
        }

        this.pdfUrl = URL.createObjectURL(blob);
        this.displayPdfDialog = true;
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error(e);
        this.showError('No se pudo cargar el PDF.');
      }
    });
  }

  liberarPdfUrl(): void {
    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
    this.pdfFileName = null;
  }


  generateDocsZip(): void {
    const p = this.detallesProyecto;
    if (!p) return;

    const periodoId = Number(p.idPeriodoAcademico ?? 0);
    if (!periodoId) {
      this.showError('Proyecto sin período.');
      return;
    }

    const selected = this.docsPreviewItems.filter(x => x.selected && x.valid);
    if (!selected.length) return;

    const safeProject = String(p.titulo ?? `Proyecto_${p.id}`).replace(/[^\w\-]+/g, '_');

    this.docsPreviewRunning = true;

    if (this.docsPreviewTipo === 'ACEPTACION') {
      const body = {
        items: selected.map(x => ({
          fileName: x.fileName,
          payload: x.payload
        }))
      };

      this.periodosSvc.zipConstanciasAceptacionReportePreliminar(periodoId, body).subscribe({
        next: (blob: Blob) => {
          this.periodosSvc.downloadBlob(blob, `ZIP_Constancias_Aceptacion_${safeProject}.zip`);
          this.showSuccess('ZIP generado ✅');
          this.showDocsPreviewDialog = false;
        },
        error: (e) => {
          console.error(e);
          this.showError('No se pudo generar el ZIP. Intenta nuevamente.');

        },
        complete: () => {
          this.docsPreviewRunning = false;
          this.cdr.detectChanges();
        }
      });

      return;
    }

    if (this.docsPreviewTipo === 'OFICIO_ASESOR') {
      const body = {
        items: selected.map(x => ({
          fileName: x.fileName,
          payload: x.payload
        }))
      };

      this.periodosSvc.zipOficiosAsesorInterno(periodoId, body).subscribe({
        next: (blob: Blob) => {
          this.periodosSvc.downloadBlob(blob, `ZIP_Oficios_Asesor_${safeProject}.zip`);
          this.showSuccess('ZIP generado ✅');
          this.showDocsPreviewDialog = false;
        },
        error: (e) => {
          console.error(e);
          this.showError('No se pudo generar el ZIP. Intenta nuevamente.');

        },
        complete: () => {
          this.docsPreviewRunning = false;
          this.cdr.detectChanges();
        }
      });
    }
  }


  async openDocsPreview(tipo: 'ACEPTACION' | 'OFICIO_ASESOR'): Promise<void> {
    // console.log('🟢 [Component] openDocsPreview iniciado');
    // console.log('   📋 Tipo:', tipo);

    const p = this.detallesProyecto;
    if (!p) return;

    if (this.isProyectoCancelado(p)) {
      this.showError('Proyecto cancelado: no se pueden generar documentos.');
      return;
    }


    const idProyecto = Number(p.id ?? 0);
    const periodoId = Number(p.idPeriodoAcademico ?? 0);

    // console.log('   🔑 idProyecto:', idProyecto);
    // console.log('   🔑 periodoId:', periodoId);

    if (!idProyecto || !periodoId) {
      console.error('❌ Proyecto inválido o sin período');
      this.showError('Proyecto inválido o sin período.');
      return;
    }

    // Reglas globales mínimas
    const tieneMem = await this.ensureMembrentado(periodoId);
    if (!tieneMem) {
      this.showError('Este período no tiene membretado.');
      return;
    }

    if (tipo === 'ACEPTACION') {
      const aprobado = await this.getAnteproyectoAprobado(idProyecto);
      if (!aprobado) {
        this.showError('El anteproyecto no está APROBADO.');
        return;
      }
    }

    if (tipo === 'OFICIO_ASESOR') {
      const asesor = await this.getAsesorInternoProyecto(idProyecto);
      if (!asesor?.id) {
        this.showError('Este proyecto no tiene asesor interno asignado.');
        return;
      }
    }

    const integrantes = await this.getIntegrantesProyecto(idProyecto);
    if (!integrantes.length) {
      this.showError('Este proyecto no tiene integrantes.');
      return;
    }

    // Construcción
    this.docsPreviewTipo = tipo;
    this.docsPreviewItems = [];

    const { inicio, fin } = this.getPeriodoFechas(periodoId);
    const periodoTxt = this.periodoRealizacionTexto(periodoId);
    const asesor = await this.getAsesorInternoProyecto(idProyecto);
    const asesorNombre = asesor?.nombre ?? '';

    for (let i = 0; i < integrantes.length; i++) {
      const al = integrantes[i];
      const nombre = `${al?.nombre ?? ''} ${al?.apellidoPaterno ?? ''} ${al?.apellidoMaterno ?? ''}`.trim();
      const noControl = String(al?.noControl ?? al?.numeroControl ?? '').trim();

      // Validación por estudiante (tu misma función)
      const faltantes = this.getCamposFaltantesEstudiante(al);
      const validBase = !!nombre && !!noControl && faltantes.length === 0;

      let payload: any = null;
      let fileName = '';
      let reason = '';

      if (!validBase) {
        reason = !nombre || !noControl
          ? 'Falta nombre o No. Control.'
          : `Faltan datos: ${faltantes.join(', ')}`;
      } else {
        if (tipo === 'ACEPTACION') {
          if (!inicio || !fin) {
            reason = 'No pude obtener fechas de inicio/fin del período.';
          } else {
            const jefeNombre = this.getJefeDepartamentoNombre(periodoId) || 'NOMBRE DEL JEFE(A)';
const comentarioAnteproyecto = await this.getComentarioAnteproyecto(idProyecto);

payload = {
  ciudad: "Oaxaca de Juárez, Oaxaca",
  fecha: new Date().toISOString(),
  oficio: "", // ya no lo necesitas visualmente
  destinatarioNombre: jefeNombre,
  departamentoNombre: "", // el backend ya lo dejará fijo visualmente
  carrera: al?.carreraNombre ?? '',
  noControl,
  estudiante: nombre,
  tituloReporte: p.titulo ?? "",
  fechaInicio: inicio,
  fechaTermino: fin,
  dictamen: "APROBADO",
  comentarios: comentarioAnteproyecto,
  asesorInterno: asesorNombre
};

            fileName = `Constancia_Aceptacion_${noControl}.pdf`;
          }
        }

        if (tipo === 'OFICIO_ASESOR') {
          if (!periodoTxt || periodoTxt === '—') {
            reason = 'No pude construir el texto del período.';
          } else {
            payload = {
              ciudad: 'Oaxaca de Juárez, Oaxaca',
              fecha: new Date().toISOString(),
              oficio: '',
              destinatarioNombre: asesorNombre || 'NOMBRE DEL ASESOR',
              destinatarioCargoLinea1: 'CATEDRÁTICO DEL I.T. DE OAXACA',
              nombreProyecto: p.titulo ?? '',
              empresa: this.getEmpresaNombre(p.idEmpresa),
              carrera: (al?.carreraNombre ?? ''),
              periodoRealizacion: periodoTxt,
              residentes: [`${nombre} (${noControl})`], // ✅ 1 por estudiante
              firmaNombre: '',    // ✅ backend toma del período
              firmaCargoLinea1: '',
              firmaCargoLinea2: ''
            };

            fileName = `Oficio_Asesor_${noControl}.pdf`;
          }
        }
      }

      const valid = validBase && !reason && !!payload;

      this.docsPreviewItems.push({
        selected: valid,          // por defecto marcado si es generable
        valid,
        reason,
        noControl,
        displayName: nombre || '—',
        fileName,
        payload
      });
    }

    this.showDocsPreviewDialog = true;
    this.cdr.detectChanges();
  }


  // ==========================
  // ✅ FORMATO FECHA: "03 Jun 2026 8:00 am" (español)
  // ==========================
  formatFechaMxAmPm(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);

    // es-MX -> mes en español, 12h
    const parts = new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).formatToParts(d);

    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';

    const day = get('day');
    let month = get('month');  // "jun"
    const year = get('year');
    const hour = get('hour');
    const minute = get('minute');
    const dayPeriod = get('dayPeriod'); // "a. m." o "p. m." según engine

    // Capitaliza mes (jun -> Jun)
    month = month ? month.charAt(0).toUpperCase() + month.slice(1) : '';

    // Normaliza AM/PM sin puntos
    const ampm = String(dayPeriod || '')
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s/g, ''); // "am" / "pm"

    // Resultado: "03 Jun 2026 8:00 am"
    return `${day} ${month} ${year} ${hour}:${minute} ${ampm}`.trim();
  }

  // ==========================
  // Generación masiva UI
  // ==========================
  openGeneracionMasivaDialog(): void {
    this.showGeneracionMasivaDialog = true;
    this.masivoPeriodoId = this.currentPeriodoId ?? null;
    this.buildMasivoPreview();
  }

  selectAllMasivo(v: boolean): void {
    if (v) {
      this.masivoItems.forEach(x => x.selected = x.valid);
    } else {
      this.masivoItems.forEach(x => x.selected = false);
    }
  }


  async buildMasivoPreview(): Promise<void> {
  this.masivoItems = [];

  const pid = Number(this.masivoPeriodoId ?? 0);
  if (!pid) return;

  if (!this.masivoIncluyeAceptacion && !this.masivoIncluyeOficioAsesor && !this.masivoIncluyeRevisores) return;

  // ✅ Filtra cancelados para que NI APAREZCAN
  const proyectosPeriodo = (this.proyectos ?? [])
    .filter(p => Number(p.idPeriodoAcademico) === pid)
    .filter(p => !this.isProyectoCancelado(p));

  for (const p of proyectosPeriodo) {
    const proyectoId = Number(p.id ?? 0);
    const titulo = String(p.titulo ?? `Proyecto #${proyectoId}`);

    if (this.masivoIncluyeAceptacion) {
      const v = await this.validarProyectoParaMasivo(p, 'ACEPTACION');
      this.masivoItems.push({
        key: `ACEPTACION_${proyectoId}`,
        tipo: 'ACEPTACION',
        proyectoId,
        proyectoTitulo: titulo,
        label: '📄 Constancias de aceptación (equipo)',
        valid: v.valid,
        reason: v.reason,
        selected: v.valid
      });
    }

    if (this.masivoIncluyeOficioAsesor) {
      const v = await this.validarProyectoParaMasivo(p, 'OFICIO_ASESOR');
      this.masivoItems.push({
        key: `OFICIO_ASESOR_${proyectoId}`,
        tipo: 'OFICIO_ASESOR',
        proyectoId,
        proyectoTitulo: titulo,
        label: '🧾 Oficios de asignación asesor (equipo)',
        valid: v.valid,
        reason: v.reason,
        selected: v.valid
      });
    }

    // ✅ NUEVO: Revisores (se genera 1 PDF agrupando por revisor)
    if (this.masivoIncluyeRevisores) {
      const v = await this.validarProyectoParaMasivo(p, 'REVISOR');
      this.masivoItems.push({
        key: `REVISOR_${proyectoId}`,
        tipo: 'REVISOR',
        proyectoId,
        proyectoTitulo: titulo,
        label: '📝 Documento para revisores (agrupa por revisor)',
        valid: v.valid,
        reason: v.reason,
        selected: v.valid
      });
    }
  }

  this.cdr.detectChanges();
}


  async runMasivo(): Promise<void> {
  if (!this.masivoPeriodoId) return;

  const seleccionados = this.masivoItems.filter(x => x.selected);
  if (!seleccionados.length) return;

  this.masivoRunning = true;

  try {
    const itemsAceptacion = seleccionados.filter(x => x.tipo === 'ACEPTACION');
    const itemsOficio = seleccionados.filter(x => x.tipo === 'OFICIO_ASESOR');
    const itemsRevisor = seleccionados.filter(x => x.tipo === 'REVISOR');

    // ==========================
    // ZIP Constancias Aceptación
    // ==========================
    if (itemsAceptacion.length) {
      console.log('🔵 Generando ZIP de constancias de aceptación...');

      const bodyAceptacion: any[] = [];

      for (const it of itemsAceptacion) {
        const proyecto = this.proyectos.find(p => Number(p.id) === it.proyectoId);
        if (!proyecto) continue;

        const validacion = await this.validarProyectoParaMasivo(proyecto, 'ACEPTACION' as any);
        if (validacion?.valid === false) continue;

        const periodoId = Number(proyecto.idPeriodoAcademico);
        const tieneMem = await this.ensureMembrentado(periodoId);
        if (!tieneMem) continue;

        const integrantes = await this.getIntegrantesProyecto(it.proyectoId);
        if (!integrantes.length) continue;

        const { inicio, fin } = this.getPeriodoFechas(periodoId);
        if (!inicio || !fin) continue;

        const asesor = await this.getAsesorInternoProyecto(it.proyectoId);
        const asesorNombre = asesor?.nombre ?? '';

        for (const al of integrantes) {
          const nombre = `${al?.nombre ?? ''} ${al?.apellidoPaterno ?? ''} ${al?.apellidoMaterno ?? ''}`.trim();
          const noControl = String(al?.noControl ?? al?.numeroControl ?? '').trim();

          const jefeNombre = this.getJefeDepartamentoNombre(periodoId) || 'NOMBRE DEL JEFE(A)';
const comentarioAnteproyecto = await this.getComentarioAnteproyecto(it.proyectoId);

const payload = {
  ciudad: "Oaxaca de Juárez, Oaxaca",
  fecha: new Date().toISOString(),
  oficio: "",
  destinatarioNombre: jefeNombre,
  departamentoNombre: "",
  carrera: al?.carreraNombre ?? '',
  noControl,
  estudiante: nombre,
  tituloReporte: proyecto.titulo ?? "",
  fechaInicio: inicio,
  fechaTermino: fin,
  dictamen: "APROBADO",
  comentarios: comentarioAnteproyecto,
  asesorInterno: asesorNombre
};

          bodyAceptacion.push({
            fileName: `Constancia_Aceptacion_${noControl}.pdf`,
            payload
          });
        }
      }

      if (bodyAceptacion.length) {
        const zipBody = { items: bodyAceptacion };

        const blob = await this.periodosSvc
          .zipConstanciasAceptacionReportePreliminar(this.masivoPeriodoId, zipBody)
          .toPromise();

        if (blob) {
          this.periodosSvc.downloadBlob(blob, `ZIP_Constancias_Aceptacion_Periodo_${this.masivoPeriodoId}.zip`);
          console.log('   ✅ ZIP descargado');
        }
      }
    }

    // ==========================
    // ZIP Oficios Asesor
    // ==========================
    if (itemsOficio.length) {
      console.log('🟡 Generando ZIP de oficios de asesor...');

      const bodyOficio: any[] = [];

      for (const it of itemsOficio) {
        const proyecto = this.proyectos.find(p => Number(p.id) === it.proyectoId);
        if (!proyecto) continue;

        const validacion = await this.validarProyectoParaMasivo(proyecto, 'OFICIO_ASESOR' as any);
        if (validacion?.valid === false) continue;

        const periodoId = Number(proyecto.idPeriodoAcademico);
        const tieneMem = await this.ensureMembrentado(periodoId);
        if (!tieneMem) continue;

        const asesor = await this.getAsesorInternoProyecto(it.proyectoId);
        if (!asesor?.id) continue;

        const integrantes = await this.getIntegrantesProyecto(it.proyectoId);
        if (!integrantes.length) continue;

        const periodoTxt = this.periodoRealizacionTexto(periodoId);

        for (const al of integrantes) {
          const nombre = `${al?.nombre ?? ''} ${al?.apellidoPaterno ?? ''} ${al?.apellidoMaterno ?? ''}`.trim();
          const noControl = String(al?.noControl ?? al?.numeroControl ?? '').trim();

          const payload = {
            ciudad: 'Oaxaca de Juárez, Oaxaca',
            fecha: new Date().toISOString(),
            oficio: 'JV-XXX/2026',
            destinatarioNombre: asesor.nombre ?? 'NOMBRE DEL ASESOR',
            destinatarioCargoLinea1: 'CATEDRÁTICO DEL I.T. DE OAXACA',
            nombreProyecto: proyecto.titulo ?? '',
            empresa: this.getEmpresaNombre(proyecto.idEmpresa),
            carrera: al?.carreraNombre ?? '',
            periodoRealizacion: periodoTxt,
            residentes: [`${nombre} (${noControl})`],
            firmaNombre: 'NOMBRE DE QUIEN FIRMA',
            firmaCargoLinea1: 'JEFA(E) DEL DEPARTAMENTO',
            firmaCargoLinea2: 'DE SISTEMAS Y COMPUTACIÓN'
          };

          bodyOficio.push({
            fileName: `Oficio_Asesor_${noControl}.pdf`,
            payload
          });
        }
      }

      if (bodyOficio.length) {
        const zipBody = { items: bodyOficio };

        const blob = await this.periodosSvc
          .zipOficiosAsesorInterno(this.masivoPeriodoId, zipBody)
          .toPromise();

        if (blob) {
          this.periodosSvc.downloadBlob(blob, `ZIP_Oficios_Asesor_Periodo_${this.masivoPeriodoId}.zip`);
          console.log('   ✅ ZIP descargado');
        }
      }
    }

    // ==========================
    // ✅ ZIP Oficios Revisores
    // (1 PDF por revisor -> 1 página)
    // ==========================
    if (itemsRevisor.length) {
      console.log('🟣 Generando ZIP de oficios de revisores...');

      const tieneMem = await this.ensureMembrentado(this.masivoPeriodoId);
      if (!tieneMem) {
        this.showError('El período no tiene membretado. No se puede generar revisores.');
      } else {
        const safe = (s: string) => {
          const base = (s ?? '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 60);
          return base || 'Revisor';
        };

        // Map: idDocente -> { nombre, rows[] }
        const mapa = new Map<number, { nombre: string; rows: any[] }>();

        for (const it of itemsRevisor) {
          const proyecto = this.proyectos.find(p => Number(p.id) === it.proyectoId);
          if (!proyecto) continue;

          // Si ya quitaste validaciones, puedes comentar estas 2 líneas:
          // const validacion = await this.validarProyectoParaMasivo(proyecto, 'REVISOR' as any);
          // if (validacion?.valid === false) continue;

          const idProyecto = Number(proyecto.id);

          const revisores = await this.proyectosSvc
            .getDocentesRelacion(idProyecto, this.ROL_REVISOR_REPORTE)
            .toPromise()
            .catch(() => []) as any[];

          if (!Array.isArray(revisores) || !revisores.length) continue;

          const asesor = await this.getAsesorInternoProyecto(idProyecto);
          const asesorNombre = (asesor?.nombre ?? '—').trim() || '—';

          const integrantes = await this.getIntegrantesProyecto(idProyecto);
          if (!integrantes.length) continue;

          for (const r of revisores) {
            const idDoc = Number(r?.idDocente ?? r?.iddocente ?? r?.id ?? 0);
            if (!idDoc) continue;

            const opt = this.docentesOptions?.find(x => Number(x.value) === idDoc);
            const nombreBase = (opt?.label ?? String(r?.docenteNombre ?? r?.nombre ?? '')).trim();
            const revisorNombre = nombreBase || `Docente #${idDoc}`;

            if (!mapa.has(idDoc)) {
              mapa.set(idDoc, { nombre: revisorNombre, rows: [] });
            }

            const bucket = mapa.get(idDoc)!;

            for (const al of integrantes) {
              const nombreAl = `${al?.nombre ?? ''} ${al?.apellidoPaterno ?? ''} ${al?.apellidoMaterno ?? ''}`.trim();
              const noControl = String(al?.noControl ?? al?.numeroControl ?? '').trim();

              bucket.rows.push({
                noControl,
                estudiante: nombreAl,
                proyecto: String(proyecto.titulo ?? ''),
                asesor: asesorNombre
              });
            }
          }
        }

        // Construye items del ZIP: 1 payload por revisor (solo 1 revisor en "revisores")
        const zipItems: any[] = [];

        for (const [, v] of mapa.entries()) {
          const rows = (v.rows ?? [])
            .filter((x: any) => String(x?.noControl ?? '').trim() || String(x?.estudiante ?? '').trim());

          if (!rows.length) continue;

          const payload = {
            ciudad: 'Oaxaca de Juárez, Oaxaca',
            fecha: new Date().toISOString(),
            oficio: '',         // ✅ backend consecutivo por revisor
            asunto: 'Revisor de Residencia Profesional',
            revisores: [
              {
                revisorNombre: v.nombre,
                revisorCargoLinea1: 'DOCENTE DEL DEPARTAMENTO DE SISTEMAS Y COMPUTACIÓN',
                rows
              }
            ],
firmaNombre: '',    // ✅ backend toma del período
firmaCargoLinea1: ''
          };

          zipItems.push({
            fileName: `Oficio_Revisor_${safe(v.nombre)}.pdf`,
            payload
          });
        }

        if (!zipItems.length) {
          this.showError('No se encontraron revisores para generar ZIP.');
        } else {
          const zipBody = { items: zipItems };

          const blob = await this.periodosSvc
            .zipOficiosRevisores(this.masivoPeriodoId, zipBody)
            .toPromise();

          if (blob) {
            this.periodosSvc.downloadBlob(blob, `ZIP_Oficios_Revisores_Periodo_${this.masivoPeriodoId}.zip`);
            console.log('   ✅ ZIP descargado');
          }
        }
      }
    }

    this.showSuccess('Generación masiva completada ✅');
  } catch (e: any) {
    console.error('❌ Error en generación masiva:', e);
    this.showError(e?.message || 'Falló la generación masiva.');
  } finally {
    this.masivoRunning = false;
    this.cdr.detectChanges();
  }
}

  // ==========================
  // Documento del proyecto
  // ==========================
  private resetDocState(): void {
    this.docMeta = { exists: false };
    this.docLoading = false;
    this.docUploading = false;
    this.docDeleting = false;
    this.docSelectedFile = null;
    this.docSelectedFileError = '';
  }

  private initDocumentoProyectoFor(idProyecto: number | null): void {
    this.resetDocState();
    if (idProyecto && idProyecto > 0) {
      this.loadProyectoDocumentoMeta(idProyecto);
    }
  }

  onDocumentoFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input?.files?.[0] ?? null;

    this.docSelectedFileError = '';
    this.docSelectedFile = null;

    if (!file) return;

    const maxMb = 15;
    const maxBytes = maxMb * 1024 * 1024;

    if (file.size > maxBytes) {
      this.docSelectedFileError = `El archivo excede ${maxMb} MB.`;
      return;
    }

    this.docSelectedFile = file;
  }

  uploadDocumentoProyecto(idProyecto?: number): void {
    const pid = Number(idProyecto ?? this.currentId ?? 0);

    if (!pid) {
      this.showError('Primero guarda el proyecto para poder subir el documento.');
      return;
    }
    if (!this.docSelectedFile) {
      this.showError('Selecciona un archivo primero.');
      return;
    }
    if (this.docSelectedFileError) {
      this.showError(this.docSelectedFileError);
      return;
    }

    this.docUploading = true;

    this.proyectosSvc.uploadDocumento(pid, this.docSelectedFile).subscribe({
      next: () => {
        this.showSuccess('Documento subido ✅');
        this.docSelectedFile = null;
        this.docSelectedFileError = '';
        this.loadProyectoDocumentoMeta(pid);
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error(e);
        this.showError('No se pudo subir el documento. Intenta nuevamente.');

      },
      complete: () => {
        this.docUploading = false;
        this.cdr.detectChanges();
      }
    });
  }



  verDocumentoProyecto(idProyecto?: number): void {
    const pid = Number(idProyecto ?? this.currentId ?? 0);
    if (!pid) return;

    // Reset para evitar que se quede el PDF anterior
    this.liberarPdfUrl();
    this.pdfUrl = null;

    this.proyectosSvc.downloadDocumento(pid).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;

        // Validación: debe ser PDF
        if (blob.type !== 'application/pdf') {
          console.error('El archivo recibido no es un PDF:', blob.type);
          this.showError('El archivo recibido no es un PDF.');
          return;
        }

        // (Opcional) límite de tamaño
        const fileSizeInMB = blob.size / (1024 * 1024);
        if (fileSizeInMB > 15) {
          this.showError('El PDF es demasiado grande para visualizarlo en línea.');
          return;
        }

        // Crear URL del blob y abrir el dialog
        this.pdfUrl = URL.createObjectURL(blob);
        this.displayDialog = true;
      },
      error: (e) => {
        console.error(e);
        this.showError('No se pudo cargar el documento. Intenta nuevamente.');

      }
    });
  }


  downloadDocumentoProyecto(idProyecto?: number): void {
    const pid = Number(idProyecto ?? this.currentId ?? 0);
    if (!pid) return;

    this.proyectosSvc.downloadDocumento(pid).subscribe({
      next: (blob: Blob) => {
        const fileName = this.docMeta?.nombreOriginal?.trim() || `Documento_Proyecto_${pid}.pdf`;

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);

        this.showSuccess('Descarga iniciada 📥');
      },
      error: (e) => {
        console.error(e);
        this.showError('No se pudo descargar el documento. Intenta nuevamente.');

      }
    });
  }

  deleteDocumentoProyecto(idProyecto?: number): void {
    const pid = Number(idProyecto ?? this.currentId ?? 0);
    if (!pid) return;

    this.confirm.confirm({
      header: 'Confirmar',
      message: '¿Eliminar el documento del proyecto?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'No',
      accept: () => {
        this.docDeleting = true;

        this.proyectosSvc.deleteDocumento(pid).subscribe({
          next: () => {
            this.showSuccess('Documento eliminado 🗑️');
            this.loadProyectoDocumentoMeta(pid);
          },
          error: (e) => {
            console.error(e);
            this.showError('No se pudo eliminar el documento. Intenta nuevamente.');

          },
          complete: () => {
            this.docDeleting = false;
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  loadProyectoDocumentoMeta(idProyecto: number) {
    if (!idProyecto) return;

    this.docLoading = true;
    this.proyectosSvc.getDocumentoMeta(idProyecto).subscribe({
      next: (m) => {
        this.docMeta = m ?? { exists: false };
        this.docLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.docMeta = { exists: false };
        this.docLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ==========================
  // Cargas catálogos/listas
  // ==========================
  loadEspecializaciones(): void {
    this.modalidadesSvc.getActivasEspecializacion().subscribe({
      next: (rows) => {
        this.especializaciones = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: (e) => console.error('Load especializaciones error', e),
    });
  }

  loadDocentes(): void {
  forkJoin({
    docentes: this.docentesSvc.getAll().pipe(catchError(() => of([]))),
    cargas: this.docentesSvc.getCargasResumen().pipe(catchError(() => of([])))
  }).subscribe({
    next: ({ docentes, cargas }) => {
      this.docentes = (docentes ?? []) as DocenteListItem[];
      this.docentesOptions = this.mapDocentesOptions(
        this.docentes,
        (cargas ?? []) as DocenteCargaResumen[]
      );

      queueMicrotask(() => this.cdr.detectChanges());
    },
    error: (e) => {
      console.error('Load docentes error', e);
      this.docentes = [];
      this.docentesOptions = [];
      queueMicrotask(() => this.cdr.detectChanges());
    }
  });
}

 loadProyectos(): void {
  this.proyectosSvc.getAll().subscribe({
    next: (rows) => {
      this.proyectos = rows ?? [];
      this.loadRevisoresAsignados();
      this.loadAnteproyectoSubidos();

      // ✅ si venimos navegando desde expediente o acabamos de finalizar,
      // reabrimos automáticamente el proyecto
      if (this.pendingOpenProyectoId) {
        const row = (this.proyectos ?? []).find(
          (p: any) => Number(p?.id ?? p?.Id ?? 0) === this.pendingOpenProyectoId
        );

        if (row) {
          setTimeout(() => this.openDetallesDialog(row), 0);
          this.pendingOpenProyectoId = null;
        }
      }

      queueMicrotask(() => this.cdr.detectChanges());
    },
    error: (e) => console.error('Load proyectos error', e),
  });
}
  loadEmpresas(): void {
    this.empresasSvc.getAll().subscribe({
      next: (rows) => {
        this.empresas = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: (e) => console.error('Load empresas (para proyectos) error', e),
    });
  }

  loadModalidades(): void {
    this.modalidadesSvc.getActivasModalidad().subscribe({
      next: (rows) => {
        this.modalidades = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: (e) => console.error('Load modalidades error', e),
    });
  }

  loadEstados(): void {
    this.estadoSvc.getActivos().subscribe({
      next: (rows) => {
        this.estados = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: (e) => console.error('Load estados error', e),
    });
  }

  loadPeriodos(): void {
    this.periodosSvc.getAll().subscribe({
      next: (rows) => {
        this.periodos = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: (e) => console.error('Load periodos error', e),
    });
  }

  private loadPeriodoActual(): void {
    this.periodosSvc.getPeriodoActual().subscribe({
      next: (p: any) => {
        const id = Number(p?.idPeriodoAcademico ?? p?.id ?? 0);
        if (!id) {
          this.currentPeriodoId = null;
          this.currentPeriodoNombre = '';
          this.showError('No se pudo determinar el periodo actual.');
          return;
        }
        this.currentPeriodoId = id;
        this.currentPeriodoNombre = String(p?.periodoNombre ?? p?.nombre ?? `Periodo #${id}`);
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error(e);
        this.currentPeriodoId = null;
        this.currentPeriodoNombre = '';
        this.showError('No se pudo cargar el periodo actual.');
      }
    });
  }

  // ==========================
  // Revisores asignados (map)
  // ==========================
  loadRevisoresAsignados(): void {
    const targets = (this.proyectos ?? [])
      .filter(p => (p.idEstado ?? 0) === 3 || (p.idEstado ?? 0) === 4);

    if (!targets.length) {
      this.revisoresMap.clear();
      return;
    }

    forkJoin(
      targets.map(p =>
        this.proyectosSvc.getDocenteRelacion(p.id, 'REVISOR_ANTEPROYECTO')
          .pipe(catchError(() => of(null)))
      )
    ).subscribe((rows: any[]) => {
      this.revisoresMap.clear();

      for (const r of rows) {
        if (!r) continue;

        const idProyecto = Number(r.idProyecto ?? r.idproyecto);
        const idDocente = Number(r.idDocente ?? r.iddocente);

        const opt = this.docentesOptions.find(x => Number(x.value) === idDocente);

        const nombre = (opt?.label ?? String(r.docenteNombre ?? '').trim());
        const correo = (opt?.correo ?? null);

        if (idProyecto > 0 && idDocente > 0) {
          this.revisoresMap.set(idProyecto, { idDocente, nombre, correo: correo ?? undefined });
        }
      }

      this.cdr.detectChanges();
    });
  }

  getRevisorNombre(idProyecto: number): string {
    return this.revisoresMap.get(Number(idProyecto))?.nombre ?? '';
  }

  // ==========================
  // Formularios - Dialog
  // ==========================
  get f() {
    return this.form.controls;
  }

  openAddDialog(): void {
    this.dialogMode = 'add';
    this.submitted = false;

    this.setCreateValidators(); // ✅ ACTIVA required SOLO en CREATE

    this.reset();
    this.initDocumentoProyectoFor(null);

    this.form.patchValue({ idEstado: this.ESTADO_PUBLICADO_ID }, { emitEvent: false });
    this.showDialog = true;
  }

  openEditDialog(row: Proyecto): void {
    this.dialogMode = 'edit';
    this.submitted = false;

    this.setEditValidatorsAsIs(); // ✅ EDIT se queda como estaba

    this.editar(row);
    this.initDocumentoProyectoFor(this.currentId);
    this.showDialog = true;
  }


  onDialogHide(): void {
    this.submitted = false;

    this.setEditValidatorsAsIs(); // ✅ deja limpio (como estaba por defecto)

    this.reset();
    this.resetDocState();
    this.dialogMode = 'add';
  }



  // ==========================
  // Submit
  // ==========================
  onSubmit(): void {
    // ✅ ADD: obligatorio + mensajes visibles
    if (this.dialogMode === 'add') {
      this.submitted = true;

      if (this.form.invalid) {
        this.form.markAllAsTouched();

        const faltantes = this.getCamposObligatoriosFaltantes();
        const msg = faltantes.length
          ? `Te falta completar: ${faltantes.join(', ')}.`
          : 'Formulario inválido. Revisa los campos marcados en rojo.';

        this.showError(msg);

        // Opcional: lleva al primer campo inválido
        this.scrollToFirstInvalidControl();

        return;
      }
    }

    // ✅ EDIT: puedes conservar tu lógica actual (si quieres permitir parciales)
    if (this.dialogMode === 'edit' && this.form.invalid) {
      // si quieres AVISAR en edición:
      const faltantes = this.getCamposObligatoriosFaltantes();
      if (faltantes.length) {
        this.toast.add({
          severity: 'warn',
          summary: 'Edición con datos faltantes',
          detail: `Faltan: ${faltantes.join(', ')}.`
          , life: 10000
        });
      }
      // aquí no retornas porque tu flujo permite parciales
    }

    // ... lo demás sigue igual (tu payload, create/update, etc.)


    // ... tu validación ADD/EDIT se queda igual arriba

    const inicioTimeSpan = this.toTimeSpanString(this.form.value.horarioInicio);
    const finTimeSpan = this.toTimeSpanString(this.form.value.horarioFin);

    const estadoFinal = Number(
      this.form.value.idEstado ??
      (this.isEditing() ? this.ESTADO_PUBLICADO_ID : this.ESTADO_PUBLICADO_ID)
    );

    // ✅ snapshot original SOLO en edit (ya lo guardas en editar())
    const original = this.editingOriginal;

    // 🧠 Helper: en EDIT conserva el valor anterior si viene null/''/0
    // 🧠 Helper: en EDIT conserva el valor anterior si viene vacío.
    // Si NO hay anterior, manda null (no 0).
    const pickIdNullable = (formVal: any, prevVal: any): number | null => {
      // si el form trae algo válido (>0), úsalo
      const n = Number(formVal);
      if (Number.isFinite(n) && n > 0) return n;

      // si no, intenta conservar el anterior
      const p = Number(prevVal);
      if (Number.isFinite(p) && p > 0) return p;

      // si no hay nada, manda null (API acepta null)
      return null;
    };



    const payload: any = {
      id: this.currentId ?? 0,

      // ✅ IDs: null si no hay valor (en vez de 0)
      idEmpresa: pickIdNullable(this.form.value.idEmpresa, original?.idEmpresa),
      idEspecializcion: pickIdNullable(this.form.value.idEspecializcion, original?.idEspecializcion),
      idPeriodoAcademico: pickIdNullable(this.form.value.idPeriodoAcademico, original?.idPeriodoAcademico),
      idModalidad: pickIdNullable(this.form.value.idModalidad, original?.idModalidad),

      // ✅ strings: tu lógica igual
      titulo: String(this.form.value.titulo || original?.titulo || '').trim(),
      descripcion: this.nz(this.form.value.descripcion) ?? original?.descripcion ?? null,
      objetivo: this.nz(this.form.value.objetivo) ?? original?.objetivo ?? null,

      fechaRegistor: new Date().toISOString(),
      noResidentes: Number(this.form.value.noResidentes || original?.noResidentes || 1),

      horarioInicio: inicioTimeSpan ?? original?.horarioInicio ?? null,
      horarioFinal: finTimeSpan ?? original?.horarioFinal ?? null,

      idEstado: estadoFinal,
      propuestaAlumno: false,
    };



    // ====== TU FLUJO EXISTENTE ======
    // ... dentro de onSubmit(), justo antes del confirm.cancel ...

    const estadoPrevio = Number(original?.idEstado ?? 0);

    // ✅ Solo cancela si ANTES no estaba cancelado y AHORA sí
    const vaACancelar = (estadoFinal === this.ESTADO_CANCELADO_ID) && (estadoPrevio !== this.ESTADO_CANCELADO_ID);

    if (this.isEditing()) {
      if (vaACancelar) {
        this.confirm.confirm({
          header: 'Confirmar',
          message: '¿Cancelar proyecto?',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'Sí, cancelar',
          rejectLabel: 'No',
          accept: () => {
            this.proyectosSvc.cancelarProyecto(this.currentId!).subscribe({
              next: () => {
                this.showSuccess('Proyecto cancelado.');
                this.reset();
                this.loadProyectos();
                this.showDialog = false;
                this.cdr.detectChanges();
              },
              error: (e) => {
                console.error(e);
                this.showError('No se pudo cancelar el proyecto. Intenta nuevamente.');

              }
            });
          }
        });
        return;
      }

      // ✅ Si ya está cancelado (o no está cancelando), sí pasa por update normal:
      this.proyectosSvc.update(this.currentId!, payload).subscribe({
        next: () => {
          if (this.currentId && this.docSelectedFile && !this.docSelectedFileError) {
            this.uploadDocumentoProyecto(this.currentId);
          }
          this.showSuccess('Proyecto actualizado.');
          this.reset();
          this.loadProyectos();
          this.showDialog = false;
        },
        error: (e) => {
          console.error('Update proyecto error', e);
          this.showError('No se pudo actualizar el proyecto. Verifica los datos e intenta nuevamente.');

        },
      });

      return;
    }
    else {
      this.proyectosSvc.create(payload).subscribe({
        next: (created: any) => {
          const newId = Number(created?.id ?? created?.Id ?? created?.proyecto?.id ?? 0);

          this.showSuccess('Proyecto creado.');

          if (newId > 0 && this.docSelectedFile) {
            this.uploadDocumentoProyecto(newId);
          }

          this.reset();
          this.loadProyectos();
          this.showDialog = false;
        },
        error: (e) => {
          console.error('Create proyecto error', e);
          this.showError('No se pudo crear el proyecto. Verifica los datos e intenta nuevamente.');

        },
      });
    }
  }


  private scrollToFirstInvalidControl(): void {
    setTimeout(() => {
      const firstInvalid: HTMLElement | null =
        document.querySelector('form .ng-invalid[formControlName]') ||
        document.querySelector('form .p-invalid') ||
        document.querySelector('form .ng-invalid');

      firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // intenta focus si es input
      (firstInvalid as any)?.focus?.();
    }, 0);
  }


  private getCamposObligatoriosFaltantes(): string[] {
    const faltantes: string[] = [];
    const v = this.form.getRawValue();

    if (!v.idEmpresa) faltantes.push('Empresa');
    if (!String(v.titulo || '').trim()) faltantes.push('Título');
    if (!v.idEspecializcion) faltantes.push('Especialización');
    if (!v.idModalidad) faltantes.push('Modalidad');
    if (!v.idPeriodoAcademico) faltantes.push('Periodo');

    if (this.dialogMode === 'add') {
      if (!String(v.descripcion || '').trim()) faltantes.push('Descripción');
      if (!String(v.objetivo || '').trim()) faltantes.push('Objetivo');
      if (!String(v.horarioInicio || '').trim()) faltantes.push('Horario inicio');
      if (!String(v.horarioFin || '').trim()) faltantes.push('Horario fin');
    }

    if (this.dialogMode === 'edit' && !v.idEstado) faltantes.push('Estado');

    // rango horario (aplica si ambos existen y es inválido)
    if (this.form.errors?.['timeRange']) faltantes.push('Horario (fin debe ser mayor)');

    return faltantes;
  }



  editar(row: Proyecto): void {
    this.isEditing.set(true);
    this.currentId = row.id ?? null;

    this.editingOriginal = { ...row }; // ✅ guardar snapshot original

    this.form.patchValue({
      idEmpresa: row.idEmpresa,
      titulo: row.titulo ?? '',
      descripcion: row.descripcion ?? '',
      objetivo: row.objetivo ?? '',
      noResidentes: row.noResidentes ?? 1,
      horarioInicio: this.toTimeInput(row.horarioInicio),
      horarioFin: this.toTimeInput(row.horarioFinal),
      idEspecializcion: row.idEspecializcion,
      idModalidad: row.idModalidad ?? null,
      idPeriodoAcademico: row.idPeriodoAcademico ?? null,
      idEstado: row.idEstado ?? this.ESTADO_PUBLICADO_ID
    });

    setTimeout(() => {
      const el = document.querySelector('form');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }


  cancelarEdicion(): void {
    this.reset();
    this.showSuccess('Edición cancelada. Formulario limpio.');
  }

  reset(): void {
    this.form.reset({
      idEmpresa: null,
      titulo: '',
      descripcion: '',
      objetivo: '',
      noResidentes: 1,
      horarioInicio: '',
      horarioFin: '',
      idEspecializcion: null,
      idModalidad: null,
      idPeriodoAcademico: null,
      idEstado: null,
    });

    this.isEditing.set(false);
    this.currentId = null;
    this.editingOriginal = null; // ✅
  }


  // ==========================
  // Helpers UI
  // ==========================
  getEmpresaNombre(idEmpresa: string | number | null | undefined): string {
    if (idEmpresa === null || idEmpresa === undefined || idEmpresa === '') return '';
    const idNum = Number(idEmpresa);
    const e = this.empresas.find((x) => Number((x as any).id) === idNum);
    return e?.nombre ?? '';
  }

  getModalidadDescripcion(idModalidad: number | null | undefined): string {
    if (idModalidad == null) return '';
    const m = this.modalidades.find((x) => x.id === idModalidad);
    return m?.descripcion ?? '';
  }

  getEstadoDescripcion(idEstado: number | null | undefined): string {
    if (idEstado == null) return '';
    const est = this.estados.find(e => e.id === idEstado);
    return est?.descripcion ?? `Estado ${idEstado}`;
  }

  getPeriodoNombre(idPeriodo: number | null | undefined): string {
    if (!idPeriodo) return '—';
    const p = this.periodos.find(x => x.id === idPeriodo);
    return p?.nombre ?? '—';
  }

  getEspecializacionDescripcion(id: number | null | undefined): string {
    if (!id) return '';
    const e = this.especializaciones.find(x => x.id === id);
    return e?.descripcion ?? '';
  }

  private nz(v: any): string | null {
    const s = String(v ?? '').trim();
    return s.length ? s : null;
  }

  private toTimeSpanString(value: string | null | undefined): string | null {
    if (!value) return null;

    const parts = value.split(':');
    if (parts.length === 2) {
      const [hh, mm] = parts;
      return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`;
    }
    if (parts.length >= 3) {
      const [hh, mm, ss] = parts;
      return `${(hh ?? '00').padStart(2, '0')}:${(mm ?? '00').padStart(2, '0')}:${(ss ?? '00').padStart(2, '0')}`;
    }
    return null;
  }

  private toTimeInput(value: string | null | undefined): string {
    if (!value) return '';
    const main = value.split('.')[0];
    const parts = main.split(':');
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
    return value;
  }

  showSuccess(msg: string): void {
    // ✅ 1 solo toast visible
    this.toast.clear();
    this.toast.add({ severity: 'success', summary: 'Listo', detail: msg, life: 10000 });
  }

  showError(msg: string): void {
    // ✅ 1 solo toast visible
    this.toast.clear();
    this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 10000 });
  }


  clear(table: Table): void {
    table.clear();
    this.searchValue = '';
    this.periodoSeleccionado = null;
    this.estadoSeleccionado = null;
  }

  // ==========================
  // Badge estados proyecto
  // ==========================
  getEstadoBadgeClass(idEstado: number | null | undefined): string {
    const base = 'inline-flex items-center px-2 py-1 rounded text-xs font-semibold border';

    switch (idEstado ?? 0) {
      case 1: return `${base} bg-sky-100 text-sky-800 border-sky-300`;
      case 2: return `${base} bg-amber-100 text-amber-800 border-amber-300`;
      case 3: return `${base} bg-violet-100 text-violet-800 border-violet-300`;
      case 4: return `${base} bg-lime-100 text-lime-800 border-lime-300`;
      // 🚫 caso 5 eliminado
      case 6: return `${base} bg-indigo-100 text-indigo-800 border-indigo-300`;
      case 7: return `${base} bg-slate-200 text-slate-800 border-slate-400`;
      case 8: return `${base} bg-rose-100 text-rose-800 border-rose-300`;
      default: return `${base} bg-gray-200 text-gray-800 border-gray-300`;
    }
  }

  // ==========================
  // Cambio estado proyecto
  // ==========================
  onEstadoChange(row: Proyecto, nuevoEstadoId: number | null): void {
    if (!nuevoEstadoId || nuevoEstadoId === row.idEstado) return;

    // ✅ Si cambia a cancelado → endpoint cancelar
    if (nuevoEstadoId === this.ESTADO_CANCELADO_ID) {
      this.confirm.confirm({
        header: 'Confirmar',
        message: '¿Cancelar proyecto?',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Sí, cancelar',
        rejectLabel: 'No',
        accept: () => {
          this.proyectosSvc.cancelarProyecto(row.id).subscribe({
            next: () => {
              row.idEstado = this.ESTADO_CANCELADO_ID;
              this.showSuccess('Proyecto cancelado.');
              this.loadProyectos();
              this.cdr.detectChanges();
            },
            error: (e) => {
              console.error(e);
              this.showError('No se pudo cancelar el proyecto. Intenta nuevamente.');

            }
          });
        }
      });
      return;
    }

    // ✅ Caso normal: update
    const payload: Proyecto = { ...row, idEstado: nuevoEstadoId };

    this.proyectosSvc.update(row.id, payload).subscribe({
      next: () => {
        row.idEstado = nuevoEstadoId;
        this.showSuccess('Estado del proyecto actualizado.');
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error('Error al actualizar el estado del proyecto', e);
        this.showError('No se pudo actualizar el estado del proyecto. Intenta nuevamente.');

      },
    });
  }


  // ==========================
  // Asignar revisor anteproyecto
  // ==========================
  openAsignarRevisor(row: Proyecto): void {
    if (!row) return;

    // No se puede si el proyecto ya está cancelado/finalizado
    // if (this.isProyectoCancelado(row) || Number(row.idEstado ?? 0) === this.ESTADO_FINALIZADO_ID) {
    //   this.showError('Este proyecto no permite cambiar el revisor (cancelado o finalizado).');
    //   return;
    // }

    // ✅ Regla nueva: asignación inicial SOLO en estado 3
    // const st = Number(row.idEstado ?? 0);
    // if (st !== this.ESTADO_ESPERA_REVISOR_ID) {
    //   this.showError("Solo puedes asignar revisor de anteproyecto cuando el proyecto está en 'En Espera de Asignación de Revisor de Anteproyecto' (3). En estado 4 el cambio se hace desde 'Gestionar integrantes'.");
    //   return;
    // }

    const idProyecto = Number((row as any)?.id ?? (row as any)?.Id ?? 0);
    if (!idProyecto) {
      this.showError('Proyecto inválido (sin id).');
      return;
    }

    forkJoin({
      dictFinal: this.getAnteproyectoDictamenFinal$(idProyecto).pipe(catchError(() => of(false))),
      anteSubido: this.getAnteproyectoSubido$(idProyecto).pipe(catchError(() => of(false)))
    }).subscribe(({ dictFinal, anteSubido }) => {
      this.anteproyectoDictamenFinalMap.set(idProyecto, !!dictFinal);
      this.anteproyectoSubidoMap.set(idProyecto, !!anteSubido);

      if (!anteSubido) {
        this.showError('Primero el alumno debe subir el anteproyecto para poder asignar revisor.');
        return;
      }

      if (dictFinal) {
        this.showError('No es posible cambiar el revisor porque el anteproyecto ya tiene dictamen final.');
        return;
      }

      this.selectedProyecto = row;
      this.selectedDocenteId = this.revisoresMap.get(row.id)?.idDocente ?? null;
      this.showAsignarRevisorDialog = true;
      this.cdr.detectChanges();
    });
  }

  closeAsignarRevisor(): void {
    this.showAsignarRevisorDialog = false;
    this.selectedProyecto = null;
    this.selectedDocenteId = null;
  }

  confirmAsignarRevisor(): void {
    if (!this.selectedProyecto || !this.selectedDocenteId) return;

    const p = this.selectedProyecto;
    const idDoc = Number(this.selectedDocenteId);

    const st = Number(p.idEstado ?? 0);
    if (st !== this.ESTADO_ESPERA_REVISOR_ID) {
      this.showError('No se pudo completar la operación. El proyecto ya no está en la etapa de asignación del revisor de anteproyecto (estado 3).');
      return;
    }

    const anteSubido = this.anteproyectoSubidoMap.get(Number(p.id)) ?? false;
    if (!anteSubido) {
      this.showError('Primero debe existir un anteproyecto subido para asignar revisor.');
      return;
    }

    const dictFinal = this.anteproyectoDictamenFinalMap.get(Number(p.id)) ?? false;
    if (dictFinal) {
      this.showError('No es posible cambiar el revisor porque el anteproyecto ya tiene dictamen final.');
      return;
    }

    const docente = this.docentes.find(d => d.id === idDoc);
    const nombreDoc = docente
      ? `${docente.nombre} ${docente.apellidoPaterno} ${docente.apellidoMaterno}`.trim()
      : 'Docente';
    const correoRevisor = (docente as any)?.correo ?? null;

    // 1) Asignar relación revisor
    this.proyectosSvc.asignarDocenteRelacion(p.id, {
      idDocente: idDoc,
      tipoClave: 'REVISOR_ANTEPROYECTO'
    }).pipe(

      // 2) Ajustar estado del proyecto (si el back no lo manda)
      concatMap((resp: any) => {
        const estadoNuevo = Number(resp?.estadoNuevo ?? 0);

        if (estadoNuevo > 0) {
          return of(estadoNuevo);
        }

        const payloadUpd: Proyecto = { ...(p as any), idEstado: this.ESTADO_ESPERA_REVISION_ANTEPROYECTO_ID };
        return this.proyectosSvc.update(p.id, payloadUpd).pipe(
          map(() => this.ESTADO_ESPERA_REVISION_ANTEPROYECTO_ID),
          catchError(() => of(null)) // no tronamos la operación por el estado
        );
      }),

      // 3) Enviar correos (revisor + integrantes)
      concatMap((estadoAplicado: number | null) => {
        // actualiza UI (aunque el estado no se haya podido actualizar)
        this.revisoresMap.set(p.id, { idDocente: idDoc, nombre: nombreDoc });
        if (estadoAplicado && estadoAplicado > 0) p.idEstado = estadoAplicado;

        const asuntoRevisor = `Revisión de anteproyecto: ${p.titulo ?? ('Proyecto #' + p.id)}`;
        const cuerpoRevisor =
          `Hola ${nombreDoc}.\n\n` +
          `Se te asignó un anteproyecto para revisión.\n` +
          `Proyecto: ${p.titulo ?? ('#' + p.id)}\n\n` +
          `Gracias.`;

        // Traemos integrantes desde el API para sacar correos (más confiable)
        return this.proyectosSvc.getIntegrantes(p.id).pipe(
          catchError(() => of([])),
          concatMap((rows: any[]) => {
            const integrantes = Array.isArray(rows) ? rows : [];

            // correos de integrantes (intentamos varios campos por si cambia el DTO)
            const correosIntegrantes = Array.from(
              new Set(
                integrantes
                  .map((x: any) => String(x?.correo ?? '').trim().toLowerCase()) // ✅ correo institucional
                  .filter(Boolean)
              )
            );


            const asuntoIntegrantes = `Tu anteproyecto ya tiene revisor asignado`;
            const cuerpoIntegrantes =
              `Hola.\n\n` +
              `Se asignó el revisor de anteproyecto para su proyecto:\n` +
              `Proyecto: ${p.titulo ?? ('#' + p.id)}\n` +
              `Revisor: ${nombreDoc}\n\n` +
              `Puedes ingresar al sistema para dar seguimiento.\n\n` +
              `Gracias.`;

            // Armamos TODOS los envíos como boolean (true/false) y NO reventamos el flujo
            const envios: Observable<boolean>[] = [];

            // Revisor
            if (correoRevisor) {
              envios.push(
                this.emailSvc.sendEmail(correoRevisor, asuntoRevisor, cuerpoRevisor).pipe(
                  map(() => true),
                  catchError(() => of(false))
                )
              );
            }

            // Integrantes (uno por alumno)
            correosIntegrantes.forEach(c => {
              envios.push(
                this.emailSvc.sendEmail(c, asuntoIntegrantes, cuerpoIntegrantes).pipe(
                  map(() => true),
                  catchError(() => of(false))
                )
              );
            });

            if (!envios.length) return of(true);

            return forkJoin(envios).pipe(
              map((res: boolean[]) => res.every(x => x === true)),
              catchError(() => of(false))
            );
          })
        );
      }),

      /* 4) Si algo falla arriba, solo regresamos false para el correo (pero si la asignación tronó, caerá al error final) */
      catchError((e) => {
        // Si tronó aquí, fue por asignación/actualización de estado
        console.error(e);
        return of('__ERROR__' as any);
      })

    ).subscribe({
      next: (correoOk: any) => {
        if (correoOk === '__ERROR__') {
          this.showError('No se pudo asignar el revisor.');
          return;
        }

        // ✅ UN SOLO MENSAJE FINAL
        if (correoOk) {
          this.showSuccess('Revisor asignado y notificaciones enviadas.');
        } else {
          this.showError('Revisor asignado, pero no se pudieron enviar todas las notificaciones.');
        }

        this.closeAsignarRevisor();
        this.cdr.detectChanges();
      },
      error: () => {
        this.showError('No se pudo asignar el revisor.');
      }
    });
  }




  // ==========================
  // Filtros tabla
  // ==========================
  filtrarPorPeriodo(table: Table): void {
    if (!this.periodoSeleccionado) {
      table.filter(null, 'idPeriodoAcademico', 'equals');
      return;
    }
    table.filter(this.periodoSeleccionado, 'idPeriodoAcademico', 'equals');
  }

  filtrarPorEstado(table: Table): void {
    if (!this.estadoSeleccionado) {
      table.filter(null, 'idEstado', 'equals');
      return;
    }
    table.filter(this.estadoSeleccionado, 'idEstado', 'equals');
  }

  // ==========================
  // Detalles dialog
  // ==========================
  openDetallesDialog(row: Proyecto): void {
    this.detallesProyecto = row;

    const idProyecto = Number((row as any)?.id ?? (row as any)?.Id ?? 0);
    if (!idProyecto) {
      this.showError('Proyecto inválido (sin id).');
      return;
    }

    this.asesorInternoNombre = null;
    this.revisorAnteproyectoNombre = null;



    // ✅ Cambiamos revisores string[] por una lista con correo
    this.revisoresInfo = [];
    this.integrantes = [];



    this.anteproyecto = null;
    this.anteproyectoCargando = true;
    this.anteproyectoError = null;
    this.anteproyectoFechaAceptacion = null;
    this.fechaEntregaReporteParcial1 = null;
    this.fechaEntregaReporteParcial2 = null;

    // Asesor interno
    this.proyectosSvc.getDocenteRelacion(idProyecto, 'ASESOR_INTERNO').subscribe({
      next: (r) => {
        if (r) {
          this.asesorInternoNombre = r.docenteNombre ?? null;
          this.asesorInternoId = Number(r.idDocente ?? r.iddocente ?? null) || null;

          const opt = this.docentesOptions.find(x => x.value === this.asesorInternoId);
          this.asesorInternoCorreo = opt?.correo ?? null;
        } else {
          this.asesorInternoNombre = null;
          this.asesorInternoId = null;
          this.asesorInternoCorreo = null;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.asesorInternoNombre = null;
        this.asesorInternoId = null;
        this.asesorInternoCorreo = null;
      }
    });

    // Revisor anteproyecto
    this.proyectosSvc.getDocenteRelacion(idProyecto, 'REVISOR_ANTEPROYECTO').subscribe({
      next: (r) => {
        if (r) {
          this.revisorAnteproyectoNombre = r.docenteNombre ?? null;
          const idDoc = Number(r.idDocente ?? r.iddocente ?? 0) || null;
          const opt = this.docentesOptions.find(x => x.value === idDoc);
          this.revisorAnteproyectoCorreo = opt?.correo ?? null;
        } else {
          this.revisorAnteproyectoNombre = null;
          this.revisorAnteproyectoCorreo = null;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.revisorAnteproyectoNombre = null;
        this.revisorAnteproyectoCorreo = null;
      }
    });

    // Membretado meta
    this.membrentadoMeta = null;
    this.membrentadoLoading = false;

    if (row.idPeriodoAcademico) {
      this.membrentadoLoading = true;
      this.periodosSvc.getMembrentadoMeta(row.idPeriodoAcademico).subscribe({
        next: (meta) => {
          this.membrentadoMeta = meta ?? { exists: false };
          this.membrentadoLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.membrentadoMeta = { exists: false };
          this.membrentadoLoading = false;
          this.cdr.detectChanges();
        }
      });
    }

    // Revisores (lista) parciales/final (con correo)
    this.proyectosSvc.getDocentesRelacion(idProyecto, this.ROL_REVISOR_REPORTE).subscribe({
      next: (rows: any[]) => {
        const list = (rows ?? []) as any[];

        this.revisoresInfo = list
          .map((x) => {
            const idDoc = Number(x.idDocente ?? x.iddocente ?? 0) || 0;
            const nombre = String(x.docenteNombre ?? '').trim();

            const opt = this.docentesOptions.find(o => Number(o.value) === idDoc);
            const correo = opt?.correo ?? null;

            return { nombre, correo, idDocente: idDoc };
          })
          .filter(r => !!r.nombre);

        this.cdr.detectChanges();
      },
      error: () => {
        this.revisoresInfo = [];
        this.cdr.detectChanges();
      }
    });


    // Integrantes
    this.proyectosSvc.getIntegrantes(idProyecto).subscribe({
      next: (rows) => {
        this.integrantesInfo = rows ?? [];
        this.cargarResumenExpedienteProyecto(Number(row?.id ?? 0));
        this.integrantes = this.integrantesInfo.map(
          (a: any) => `${a.nombre} ${a.apellidoPaterno} ${a.apellidoMaterno}`
        );
      }
    });

    // Estado del anteproyecto (entregable tipo 1)
    this.anteproyectoEntregable = null;
    this.anteproyectoError = null;
    this.anteproyectoLoading = true;

    this.entregablesSvc.getByProyecto(row.id).pipe(
      catchError((e) => {
        this.anteproyectoError = e?.error?.message || e?.message || 'No se pudo cargar el anteproyecto.';
        return of([] as EntregableDto[]);
      })
    ).subscribe((entregables) => {
      const lista = entregables ?? [];
      const candidatos = lista.filter(e => Number(e.idTipoEntregable) === this.TIPO_ANTEPROYECTO);

      candidatos.sort((a, b) => {
        const da = new Date(a.fechaCreacion).getTime();
        const db = new Date(b.fechaCreacion).getTime();
        return db - da;
      });

      this.anteproyectoEntregable = candidatos.length ? candidatos[0] : null;

      const ante = this.anteproyectoEntregable as any;
      const idEntregableAnte = Number(ante?.id ?? ante?.Id ?? 0);

      if (idEntregableAnte > 0) {
        this.cargarFechasClaveAnteproyecto(idEntregableAnte, ante);
      } else {
        this.anteproyectoFechaAceptacion = null;
        this.fechaEntregaReporteParcial1 = null;
        this.fechaEntregaReporteParcial2 = null;
      }

      this.anteproyectoLoading = false;
      this.cdr.detectChanges();
    });

    // ==============================
    // 📄 Entregables (por etapa) - default etapa 1
    // ==============================
    this.selectedTipoEntregable = 1;
    this.entregablesActual = this.getEntregablesPorTipo(1);
    this.cargarEntregablePorTipo(row.id, 1);

    this.showDetallesDialog = true;
  }

  // ==========================
  // Condiciones habilitación docs
  // ==========================

  private buildRevisoresInfoFromNames(
    revisoresNombres: string[],
    docentes: Array<{ nombre?: string; nombreCompleto?: string; correo?: string; email?: string }>
  ): Array<{ nombre: string; correo?: string | null }> {

    const norm = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

    return (revisoresNombres || []).map((nombre) => {
      const n = norm(nombre);

      const d = (docentes || []).find(x => {
        const full = norm(String(x?.nombreCompleto ?? x?.nombre ?? ''));
        return full === n;
      });

      const correo = d?.correo ?? d?.email ?? null;

      return { nombre, correo };
    });
  }


  private parseFechaFlexible(value: any): Date | null {
    if (!value) return null;

    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private addDays(base: Date, days: number): Date {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }

  private isDictamenAprobatorio(dictamen: any): boolean {
    const d = String(dictamen ?? '').trim().toUpperCase();
    return d === 'APROBADO' || d === 'ACEPTADO';
  }

  private extraerFechaAceptacionAnteproyecto(det: any, ante?: any): Date | null {
    const revisiones = Array.isArray(det?.revisiones) ? det.revisiones : [];

    const fechasAprobadas = revisiones
      .filter((r: any) => this.isDictamenAprobatorio(r?.dictamen ?? r?.Dictamen))
      .map((r: any) => this.parseFechaFlexible(r?.fechaRevision ?? r?.FechaRevision ?? r?.fecha ?? r?.Fecha))
      .filter((x: Date | null): x is Date => !!x)
      .sort((a: Date, b: Date) => b.getTime() - a.getTime());

    if (fechasAprobadas.length) {
      return fechasAprobadas[0];
    }

    const clave = String(ante?.estadoClave ?? ante?.EstadoClave ?? '').trim().toUpperCase();
    const idEstadoEnt = Number(ante?.idEstadoEntregable ?? ante?.IdEstadoEntregable ?? 0);
    const estaAprobado = clave === 'APROBADO' || clave === 'ACEPTADO' || idEstadoEnt === this.ENT_APROBADO_ID;

    if (!estaAprobado) return null;

    return this.parseFechaFlexible(
      ante?.fechaActualizacion ??
      ante?.FechaActualizacion ??
      ante?.fechaCreacion ??
      ante?.FechaCreacion ??
      null
    );
  }

  private cargarFechasClaveAnteproyecto(idEntregable: number, ante?: any): void {
    this.anteproyectoFechaAceptacion = null;
    this.fechaEntregaReporteParcial1 = null;
    this.fechaEntregaReporteParcial2 = null;

    if (!idEntregable) return;

    this.entregablesSvc.getDetalle(idEntregable).pipe(
      catchError((e) => {
        console.error(e);
        return of(null);
      })
    ).subscribe((det: any) => {
      const fechaAceptacion = this.extraerFechaAceptacionAnteproyecto(det, ante);

      if (!fechaAceptacion) {
        this.cdr.detectChanges();
        return;
      }

      this.anteproyectoFechaAceptacion = fechaAceptacion;
      this.fechaEntregaReporteParcial1 = this.addDays(fechaAceptacion, 42);
      this.fechaEntregaReporteParcial2 = this.addDays(fechaAceptacion, 84);
      this.cdr.detectChanges();
    });
  }

  formatFechaDetalleSolo(value: any): string {
    const d = this.parseFechaFlexible(value);
    if (!d) return '—';

    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(d);
  }

  get proyectoEsPropuestaAlumno(): boolean {
    const p: any = this.detallesProyecto;
    return !!(p?.propuestaAlumno ?? p?.PropuestaAlumno ?? false);
  }

  get proyectoOrigenLabel(): string {
    return this.proyectoEsPropuestaAlumno ? 'Propuesta de alumno' : 'Banco de proyectos';
  }


  private proyectoEstadoActual(): number {
    return Number(this.detallesProyecto?.idEstado ?? 0);
  }

  private anteproyectoYaFueRevisado(): boolean {
    const clave = String(this.anteproyectoEntregable?.estadoClave ?? '').toUpperCase();
    return ['CAMBIOS', 'APROBADO', 'RECHAZADO', 'CANCELADO'].includes(clave);
  }

  /**
   * ✅ Antes usabas estado 5 como "anteproyecto revisado"
   * Ahora: esa etapa desaparece, así que la decisión sale de:
   * - estado 4 (espera revisión)
   * - y que el entregable ya tenga dictamen (cambios/aprobado/rechazado/cancelado)
   */
  get mostrarAccionesAnteproyecto(): boolean {
    const st = this.proyectoEstadoActual();
    if (!st) return false;

    // Solo mientras el proyecto está en espera de revisión del anteproyecto (4)
    // y el entregable ya fue dictaminado por el revisor
    return (st === this.ESTADO_ESPERA_REVISION_ANTEPROYECTO_ID) && this.anteproyectoYaFueRevisado();
  }

  get mostrarConstanciaAceptacionPreliminar(): boolean {
    const st = this.proyectoEstadoActual();
    return [this.ESTADO_ESPERA_ASESOR_ID, this.ESTADO_EN_CURSO_ID, this.ESTADO_FINALIZADO_ID].includes(st);
  }

  // ==========================
  // Aceptar/Cancelar proyecto
  // ==========================
  onAceptarProyectoConfirm(): void {
    const p = this.detallesProyecto;
    if (!p) return;

    this.confirm.confirm({
      header: 'Confirmar',
      message: '¿Aceptar proyecto?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, aceptar',
      rejectLabel: 'No',
      accept: () => this.onAceptarProyecto()
    });
  }

  onCancelarProyectoConfirm(): void {
    const p = this.detallesProyecto;
    if (!p) return;

    this.confirm.confirm({
      header: 'Confirmar',
      message: '¿Cancelar proyecto?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'No',
      accept: () => this.onCancelarProyecto()
    });
  }

  onAceptarProyecto(): void {
    const p = this.detallesProyecto;
    if (!p) return;

    this.proyectosSvc.aceptarProyecto(p.id).subscribe({
      next: () => {
        this.showSuccess('Proyecto aceptado.');
        if (this.detallesProyecto) this.detallesProyecto.idEstado = this.ESTADO_ESPERA_ASESOR_ID; // 6
        this.loadProyectos();
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error(e);
        this.showError(e?.error || e?.message || 'No se pudo aceptar el proyecto.');
      }
    });
  }

  onCancelarProyecto(): void {
    const p = this.detallesProyecto;
    if (!p) return;

    this.proyectosSvc.cancelarProyecto(p.id).subscribe({
      next: () => {
        this.showSuccess('Proyecto cancelado.');
        if (this.detallesProyecto) this.detallesProyecto.idEstado = this.ESTADO_CANCELADO_ID;
        this.loadProyectos();
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error(e);
        this.showError(e?.error || e?.message || 'No se pudo cancelar.');
      }
    });
  }



  // ==========================
  // Generación docs (tu lógica existente)
  // ==========================
  async generarConstanciasAceptacionEquipo(p: Proyecto): Promise<void> {
    const idProyecto = Number(p?.id ?? 0);
    const periodoId = Number(p?.idPeriodoAcademico ?? 0);

    if (!idProyecto || !periodoId) {
      this.showError('Proyecto inválido o sin período.');
      return;
    }
    if (this.generandoPorProyecto.has(idProyecto)) return;

    this.generandoPorProyecto.add(idProyecto);

    try {
      const tieneMem = await this.ensureMembrentado(periodoId);
      if (!tieneMem) {
        this.showError('Este período no tiene membretado.');
        return;
      }

      const aprobado = await this.getAnteproyectoAprobado(idProyecto);
      if (!aprobado) {
        this.showError('El anteproyecto no está APROBADO.');
        return;
      }

      const integrantes = await this.getIntegrantesProyecto(idProyecto);
      if (!integrantes.length) {
        this.showError('Este proyecto no tiene integrantes.');
        return;
      }

      const { inicio, fin } = this.getPeriodoFechas(periodoId);
      if (!inicio || !fin) {
        this.showError('No pude obtener fechas del período (inicio/fin).');
        return;
      }

      const asesor = await this.getAsesorInternoProyecto(idProyecto);
      const asesorNombre = asesor?.nombre ?? '';

      let ok = 0;
      let omitidos = 0;

      for (let i = 0; i < integrantes.length; i++) {
        const al = integrantes[i];

        const faltantes = this.getCamposFaltantesEstudiante(al);
        if (faltantes.length) {
          omitidos++;
          continue;
        }

        const estudianteNombre =
          `${al?.nombre ?? ''} ${al?.apellidoPaterno ?? ''} ${al?.apellidoMaterno ?? ''}`.trim();
        const noControl = String(al?.noControl ?? al?.numeroControl ?? '').trim();

        const payload = {
          ciudad: "Oaxaca de Juárez, Oaxaca",
          fecha: new Date().toISOString(),
          oficio: "ITO/XXX/2026",

          destinatarioNombre: "NOMBRE DEL JEFE(A)",
          destinatarioCargoLinea1: "JEFE(A) DEL DEPTO. DE GESTIÓN TECNOLÓGICA Y VINCULACIÓN",
          destinatarioCargoLinea2: "DIV. DE ESTUDIOS PROFESIONALES",

          carrera: al?.carreraNombre ?? '',
          noControl,
          estudiante: estudianteNombre,
          tituloReporte: p.titulo ?? "",

          fechaInicio: inicio,
          fechaTermino: fin,

          dictamen: "APROBADO",
          comentarios: "",
          asesorInterno: asesorNombre
        };

        const blob = await this.periodosSvc
          .generateConstanciaAceptacionReportePreliminar(periodoId, payload)
          .toPromise();

        const safe = (noControl || estudianteNombre || `integrante_${i + 1}`).replace(/[^\w\-]+/g, '_');
        this.periodosSvc.downloadBlob(blob as Blob, `Constancia_Aceptacion_${safe}.pdf`);
        ok++;
      }

      this.showSuccess(`Aceptación (equipo) ✅ Generadas: ${ok} · Omitidas: ${omitidos}`);
    } catch (e: any) {
      console.error(e);
      this.showError(e?.message || 'No se pudo generar aceptación del equipo.');
    } finally {
      this.generandoPorProyecto.delete(idProyecto);
      this.cdr.detectChanges();
    }
  }

  async generarOficioAsesorEquipo(p: Proyecto): Promise<void> {
    const idProyecto = Number(p?.id ?? 0);
    const periodoId = Number(p?.idPeriodoAcademico ?? 0);

    if (!idProyecto || !periodoId) {
      this.showError('Proyecto inválido o sin período.');
      return;
    }
    if (this.generandoPorProyecto.has(idProyecto)) return;

    this.generandoPorProyecto.add(idProyecto);

    try {
      const tieneMem = await this.ensureMembrentado(periodoId);
      if (!tieneMem) {
        this.showError('Este período no tiene membretado.');
        return;
      }

      const asesor = await this.getAsesorInternoProyecto(idProyecto);
      if (!asesor?.id) {
        this.showError('Este proyecto no tiene asesor interno asignado.');
        return;
      }

      const integrantes = await this.getIntegrantesProyecto(idProyecto);
      if (!integrantes.length) {
        this.showError('Este proyecto no tiene integrantes.');
        return;
      }

      const residentes = integrantes
        .map((al: any) => {
          const nombre = `${al?.nombre ?? ''} ${al?.apellidoPaterno ?? ''} ${al?.apellidoMaterno ?? ''}`.trim();
          const noControl = String(al?.noControl ?? al?.numeroControl ?? '').trim();
          if (!nombre || !noControl) return null;
          return `${nombre} (${noControl})`;
        })
        .filter(Boolean) as string[];

      if (!residentes.length) {
        this.showError('No hay residentes válidos (faltan nombre o noControl).');
        return;
      }

      const payload = {
        ciudad: 'Oaxaca de Juárez, Oaxaca',
        fecha: new Date().toISOString(),
        oficio: 'JV-XXX/2026',

        destinatarioNombre: asesor.nombre ?? 'NOMBRE DEL ASESOR',
        destinatarioCargoLinea1: 'CATEDRÁTICO DEL I.T. DE OAXACA',

        nombreProyecto: p.titulo ?? '',
        empresa: this.getEmpresaNombre(p.idEmpresa),
        carrera: (integrantes[0]?.carreraNombre ?? ''),
        periodoRealizacion: this.periodoRealizacionTexto(periodoId),

        residentes,

        firmaNombre: 'NOMBRE DE QUIEN FIRMA',
        firmaCargoLinea1: 'JEFA(E) DEL DEPARTAMENTO',
        firmaCargoLinea2: 'DE SISTEMAS Y COMPUTACIÓN'
      };

      const blob = await this.periodosSvc.oficioAsesorInterno(periodoId, payload).toPromise();
      const safe = String(p?.titulo ?? `Proyecto_${idProyecto}`).replace(/[^\w\-]+/g, '_');
      this.periodosSvc.downloadBlob(blob as Blob, `Oficio_Asesor_Equipo_${safe}.pdf`);

      this.showSuccess('Oficio asesor (equipo) ✅ Generado.');
    } catch (e: any) {
      console.error(e);
      this.showError(e?.message || 'No se pudo generar el oficio del equipo.');
    } finally {
      this.generandoPorProyecto.delete(idProyecto);
      this.cdr.detectChanges();
    }
  }

  // ==========================
  // Helpers de períodos y validación estudiante
  // ==========================
  private formatDateDMY(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);

    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private getPeriodoFechas(idPeriodo: number | null | undefined): { inicio: string; fin: string } {
    if (!idPeriodo) return { inicio: '', fin: '' };
    const per: any = this.periodos.find(p => Number(p.id) === Number(idPeriodo));
    if (!per) return { inicio: '', fin: '' };

    const rawInicio = per.fechaInicio ?? per.inicio ?? per.startDate ?? per.fecha_inicio;
    const rawFin = per.fechaFin ?? per.fin ?? per.endDate ?? per.fecha_fin;

    return {
      inicio: this.formatDateDMY(rawInicio),
      fin: this.formatDateDMY(rawFin),
    };
  }

  private isFilledString(v: any): boolean {
    return typeof v === 'string' && v.trim().length > 0;
  }

  private isValidEmail(v: any): boolean {
    if (!this.isFilledString(v)) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
  }

  private isPositiveId(v: any): boolean {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }

  getCamposFaltantesEstudiante(al: any): string[] {
    const faltantes: string[] = [];

    if (!this.isPositiveId(al?.idcarrera ?? al?.idCarrera ?? al?.carreraId)) faltantes.push('Carrera');

    if (!this.isPositiveId(al?.idDependenciaMedica ?? al?.iddependenciamedica)) faltantes.push('Dependencia médica');
    if (!this.isPositiveId(al?.idContactoEmergencia ?? al?.idcontactoemergencia)) faltantes.push('Contacto de emergencia');

    if (!this.isFilledString(al?.domicilio)) faltantes.push('Domicilio');
    if (!this.isFilledString(al?.ciudad)) faltantes.push('Ciudad');

    if (!this.isFilledString(al?.noControl ?? al?.numeroControl)) faltantes.push('No. control');

    const correoPersonal = al?.correoPersonal;
    if (!this.isValidEmail(correoPersonal)) faltantes.push('Correo personal');

    if (!this.isFilledString(al?.noSeguroSocial)) faltantes.push('No. seguro social');
    if (!this.isFilledString(al?.telefonoCelular)) faltantes.push('Teléfono celular');

    return faltantes;
  }

  private periodoRealizacionTexto(idPeriodo: number): string {
    const per: any = this.periodos.find(p => Number(p.id) === Number(idPeriodo));
    if (!per) return '—';

    const rawInicio = per.fechaInicio ?? per.inicio ?? per.startDate ?? per.fecha_inicio;
    const rawFin = per.fechaFin ?? per.fin ?? per.endDate ?? per.fecha_fin;

    const di = new Date(rawInicio);
    const df = new Date(rawFin);
    if (isNaN(di.getTime()) || isNaN(df.getTime())) return '—';

    const esMx = new Intl.DateTimeFormat('es-MX', { month: 'long' });
    const mi = esMx.format(di).toUpperCase();
    const mf = esMx.format(df).toUpperCase();
    const y = df.getFullYear();

    return `${mi} - ${mf} ${y}`;
  }

  private async ensureMembrentado(periodoId: number): Promise<boolean> {
    try {
      const meta = await this.periodosSvc.getMembrentadoMeta(periodoId).toPromise();
      return !!meta?.exists;
    } catch {
      return false;
    }
  }

  private async getAnteproyectoAprobado(idProyecto: number): Promise<boolean> {
    try {
      const entregables = await this.entregablesSvc.getByProyecto(idProyecto).toPromise();
      const lista = (entregables ?? []) as EntregableDto[];

      const candidatos = lista
        .filter(e => Number(e.idTipoEntregable) === this.TIPO_ANTEPROYECTO)
        .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime());

      const ante = candidatos.length ? candidatos[0] : null;
      const clave = String(ante?.estadoClave ?? '').toUpperCase();
      const idEstado = Number(ante?.idEstadoEntregable ?? 0);

      return clave === 'APROBADO' || idEstado === this.ENT_APROBADO_ID;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  private async getIntegrantesProyecto(idProyecto: number): Promise<any[]> {
    try {
      const rows = await this.proyectosSvc.getIntegrantes(idProyecto).toPromise();
      console.log(rows)
      return (rows ?? []) as any[];
    } catch {
      return [];
    }
  }

  private async getAsesorInternoProyecto(idProyecto: number): Promise<{ id: number | null, nombre: string | null }> {
    try {
      const r = await this.proyectosSvc.getDocenteRelacion(idProyecto, 'ASESOR_INTERNO').toPromise();
      const id = Number(r?.idDocente ?? r?.iddocente ?? 0) || null;
      const nombre = (r?.docenteNombre ? String(r.docenteNombre) : null);
      return { id, nombre };
    } catch {
      return { id: null, nombre: null };
    }
  }

  // ==========================
  // ROLES / permisos
  // ==========================
  get activeRoleDesc(): string {
    const r = this.usuariosSvc.getActiveRoleSync();
    return String(r?.descripcion ?? '').toUpperCase().trim();
  }

  get isUsuarioAdmin(): boolean {
    return this.activeRoleDesc.includes('USUARIO') || this.activeRoleDesc.includes('ADMIN') || this.activeRoleDesc.includes('ROOT');
  }

  get isDocente(): boolean {
    return this.activeRoleDesc.includes('DOCENTE');
  }

  get isEstudiante(): boolean {
    return this.activeRoleDesc.includes('ESTUDIANTE');
  }

  get canEditProyecto(): boolean {
    return this.usuariosSvc.hasPerm('Proyecto', 'Update') || this.isUsuarioAdmin;
  }

  get canCreateProyecto(): boolean {
    return this.usuariosSvc.hasPerm('Proyecto', 'Create') || this.isUsuarioAdmin;
  }

  get canExpedirDocs(): boolean {
    return this.isUsuarioAdmin;
  }

  // ==========================
  // Asignar asesor y revisores (tu lógica)
  // ==========================
  openAsignarAsesorYRevisores(row: Proyecto): void {
    if (!this.puedeAsignarAsesorYRevisores(row)) {
      this.showError("Solo puedes asignar asesor interno y revisores cuando el proyecto está en 'Espera de Asignación de Asesor Interno' (6).");
      return;
    }

    this.selectedProyecto = row;
    this.showAsignarAsesorRevisoresDialog = true;

    this.selectedAsesorId = null;
    this.selectedRevisoresIds = [];
    this.revisoresAsignadosNombres = [];
    this.revisoresAsignadosIds = [];

    this.asigLoading = true;

    const asesor$ = this.proyectosSvc.getDocenteRelacion(row.id, this.ROL_ASESOR_INTERNO).pipe(
      catchError(() => of(null))
    );

    const revisores$ = this.proyectosSvc.getDocentesRelacion(row.id, this.ROL_REVISOR_REPORTE).pipe(
      catchError(() => of([]))
    );

    forkJoin({ asesor: asesor$, revisores: revisores$ }).subscribe({
      next: ({ asesor, revisores }: any) => {
        if (asesor) {
          this.asesorInternoNombre = asesor.docenteNombre ?? null;
          this.selectedAsesorId = Number(asesor.idDocente ?? asesor.iddocente ?? null);
        } else {
          this.asesorInternoNombre = null;
        }

        const list = (revisores ?? []) as any[];
        this.revisoresAsignadosIds = list
          .map(x => Number(x.idDocente ?? x.iddocente))
          .filter(n => Number.isFinite(n) && n > 0);

        this.revisoresAsignadosNombres = list
          .map(x => String(x.docenteNombre ?? '').trim())
          .filter(Boolean);

        this.selectedRevisoresIds = [...this.revisoresAsignadosIds];

        this.asigLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.asigLoading = false;
        this.showError('No se pudieron cargar las asignaciones.');
      }
    });
  }

  closeAsignarAsesorYRevisores(): void {
    this.showAsignarAsesorRevisoresDialog = false;
    this.selectedProyecto = null;
    this.selectedAsesorId = null;
    this.selectedRevisoresIds = [];
    this.revisoresAsignadosIds = [];
    this.revisoresAsignadosNombres = [];
  }

  
  private sendEmailSafe$(email: string, tema: string, cuerpoHtml: string) {
    const to = String(email || '').trim().toLowerCase();
    if (!to) return of(false);

    return this.emailSvc.sendEmail(to, tema, cuerpoHtml).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  private enviarCorreosAsignacionAsesorYRevisores$(
    proyecto: Proyecto,
    idAsesor: number,
    revisoresIds: number[]
  ): Observable<{ ok: number; fail: number }> {

    const titulo = proyecto?.titulo ?? `Proyecto #${proyecto?.id}`;

    // ====== Docentes (salen de la lista ya cargada en el componente)
    const asesor = this.docentes?.find((d: any) => Number(d.id) === Number(idAsesor));
    const asesorNombre = asesor
      ? `${asesor.nombre ?? ''} ${asesor.apellidoPaterno ?? ''} ${asesor.apellidoMaterno ?? ''}`.trim()
      : 'Asesor interno';

    const revisores = (this.docentes || [])
      .filter((d: any) => revisoresIds.includes(Number(d.id)))
      .map((d: any) => ({
        correo: d.correo,
        nombre: `${d.nombre ?? ''} ${d.apellidoPaterno ?? ''} ${d.apellidoMaterno ?? ''}`.trim()
      }));

    const revisoresNombres = revisores.map(r => r.nombre).filter(Boolean);

    // ====== Integrantes (alumnos): usar correo institucional que viene en `correo`
    return this.proyectosSvc.getIntegrantes(Number(proyecto.id)).pipe(
      concatMap((integrantes: any[]) => {

        const alumnos = (integrantes || []).map(i => ({
          correo: i?.correo,
          nombre: `${i?.nombre ?? ''} ${i?.apellidoPaterno ?? ''} ${i?.apellidoMaterno ?? ''}`.trim(),
          noControl: i?.noControl
        }));

        const listaAlumnosHtml = alumnos.length
          ? `<ul>${alumnos.map(a => `<li>${a.noControl ?? ''} - ${a.nombre}</li>`).join('')}</ul>`
          : `<p>(Sin integrantes)</p>`;

        // ====== Correos
        const temaDocente = `Asignación de residencia: ${titulo}`;
        const temaAlumnos = `Asesor y revisores asignados: ${titulo}`;

        const cuerpoAsesor = `
        <p>Hola <b>${asesorNombre}</b>.</p>
        <p>Se te asignó como <b>Asesor Interno</b> del proyecto:</p>
        <p><b>${titulo}</b></p>
        <p><b>Integrantes:</b></p>
        ${listaAlumnosHtml}
        <p>Gracias.</p>
      `;

        const cuerpoRevisor = (nombreRevisor: string) => `
        <p>Hola <b>${nombreRevisor}</b>.</p>
        <p>Se te asignó como <b>Revisor</b> del proyecto:</p>
        <p><b>${titulo}</b></p>
        <p><b>Asesor Interno:</b> ${asesorNombre}</p>
        <p><b>Integrantes:</b></p>
        ${listaAlumnosHtml}
        <p>Gracias.</p>
      `;

        const cuerpoAlumnos = `
        <p>Hola.</p>
        <p>Ya se asignaron los responsables de tu proyecto de residencia:</p>
        <p><b>${titulo}</b></p>
        <p><b>Asesor Interno:</b> ${asesorNombre}</p>
        <p><b>Revisores:</b> ${revisoresNombres.length ? revisoresNombres.join(', ') : '(Sin revisores)'}</p>
        <p>Favor de estar atentos a las indicaciones dentro del sistema.</p>
        <p>Gracias.</p>
      `;

        const envios: Observable<boolean>[] = [];

        // 1) Asesor
        if (asesor?.correo) {
          envios.push(this.sendEmailSafe$(asesor.correo, temaDocente, cuerpoAsesor));
        }

        // 2) Revisores (uno por uno)
        revisores.forEach(r => {
          if (r.correo) {
            envios.push(this.sendEmailSafe$(r.correo, temaDocente, cuerpoRevisor(r.nombre || 'Revisor')));
          }
        });

        // 3) Alumnos (uno por alumno)
        alumnos.forEach(a => {
          if (a.correo) {
            envios.push(this.sendEmailSafe$(a.correo, temaAlumnos, cuerpoAlumnos));
          }
        });

        if (!envios.length) {
          return of({ ok: 0, fail: 0 });
        }

        return forkJoin(envios).pipe(
          map((res: boolean[]) => {
            const ok = res.filter(x => x).length;
            const fail = res.length - ok;
            return { ok, fail };
          })
        );
      }),
      catchError(() => of({ ok: 0, fail: 1 })) // si trona getIntegrantes o algo inesperado
    );
  }



  getEstadoEntregableBadgeClass(estadoClave?: string | null): string {
    const k = (estadoClave ?? '').trim().toUpperCase();

    switch (k) {
      case 'APROBADO':
      case 'APROBADA':
        return 'bg-emerald-100 text-emerald-700';

      case 'RECHAZADO':
      case 'RECHAZADA':
        return 'bg-red-100 text-red-700';

      case 'PENDIENTE':
        return 'bg-amber-100 text-amber-700';

      case 'EN_REVISION':
      case 'EN REVISIÓN':
        return 'bg-blue-100 text-blue-700';

      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  // Exponer el mapa de estados al HTML
  ESTADO_PROYECTO_UI = ESTADO_PROYECTO_UI;

  // Helper seguro para el template
    getEstadoProyectoUI(idEstado: number): EstadoColor | null {
      return ESTADO_PROYECTO_UI[idEstado] ?? null;
    }

  // ==========================
  // ✅ Validadores dinámicos (CREATE vs EDIT)
  // ==========================
  private setCreateValidators(): void {
    // CREATE: estos deben ser obligatorios
    this.f['descripcion'].setValidators([Validators.required]);
    this.f['objetivo'].setValidators([Validators.required]);
    this.f['horarioInicio'].setValidators([Validators.required]);
    this.f['horarioFin'].setValidators([Validators.required]);

    // refresca estado
    this.f['descripcion'].updateValueAndValidity({ emitEvent: false });
    this.f['objetivo'].updateValueAndValidity({ emitEvent: false });
    this.f['horarioInicio'].updateValueAndValidity({ emitEvent: false });
    this.f['horarioFin'].updateValueAndValidity({ emitEvent: false });

    // mantiene tu validador de rango
    this.form.updateValueAndValidity({ emitEvent: false });
  }

  private setEditValidatorsAsIs(): void {
    // EDIT: regresa a como estaba (NO required)
    this.f['descripcion'].clearValidators();
    this.f['objetivo'].clearValidators();
    this.f['horarioInicio'].clearValidators();
    this.f['horarioFin'].clearValidators();

    this.f['descripcion'].updateValueAndValidity({ emitEvent: false });
    this.f['objetivo'].updateValueAndValidity({ emitEvent: false });
    this.f['horarioInicio'].updateValueAndValidity({ emitEvent: false });
    this.f['horarioFin'].updateValueAndValidity({ emitEvent: false });

    this.form.updateValueAndValidity({ emitEvent: false });
  }


  isProyectoCancelado(p: Proyecto | null | undefined): boolean {
    return Number(p?.idEstado ?? 0) === this.ESTADO_CANCELADO_ID;
  }


  private getCamposFaltantesProyecto(p: Proyecto): string[] {
    const faltantes: string[] = [];

    if (!this.isPositiveId(p?.idEmpresa)) faltantes.push('Empresa');
    if (!this.isFilledString(p?.titulo)) faltantes.push('Título');
    if (!this.isPositiveId(p?.idPeriodoAcademico)) faltantes.push('Período');
    if (!this.isPositiveId(p?.idModalidad)) faltantes.push('Modalidad');
    if (!this.isPositiveId((p as any)?.idEspecializcion)) faltantes.push('Especialización');

    // Si también quieres exigir descripción/objetivo en generación:
    // if (!this.isFilledString(p?.descripcion)) faltantes.push('Descripción');
    // if (!this.isFilledString((p as any)?.objetivo)) faltantes.push('Objetivo');

    return faltantes;
  }

  private async validarProyectoParaMasivo(
  p: Proyecto,
  tipo: 'ACEPTACION' | 'OFICIO_ASESOR' | 'REVISOR'
): Promise<{ valid: boolean; reason: string }> {

  // 1) Cancelado
  if (this.isProyectoCancelado(p)) {
    return { valid: false, reason: 'Proyecto cancelado.' };
  }

  // 2) Datos del proyecto
  const faltProyecto = this.getCamposFaltantesProyecto(p);
  if (faltProyecto.length) {
    return { valid: false, reason: `Faltan datos del proyecto: ${faltProyecto.join(', ')}` };
  }

  const idProyecto = Number(p.id ?? 0);
  const periodoId = Number(p.idPeriodoAcademico ?? 0);

  // 3) Membretado
  const tieneMem = await this.ensureMembrentado(periodoId);
  if (!tieneMem) return { valid: false, reason: 'El período no tiene membretado.' };

  // 4) Reglas por tipo
  if (tipo === 'ACEPTACION') {
    const aprobado = await this.getAnteproyectoAprobado(idProyecto);
    if (!aprobado) return { valid: false, reason: 'Anteproyecto no APROBADO.' };

    const { inicio, fin } = this.getPeriodoFechas(periodoId);
    if (!inicio || !fin) return { valid: false, reason: 'No se pudieron obtener fechas del período.' };
  }

  if (tipo === 'OFICIO_ASESOR') {
    const asesor = await this.getAsesorInternoProyecto(idProyecto);
    if (!asesor?.id) return { valid: false, reason: 'No tiene asesor interno asignado.' };

    const periodoTxt = this.periodoRealizacionTexto(periodoId);
    if (!periodoTxt || periodoTxt === '—') return { valid: false, reason: 'No se pudo construir el texto del período.' };
  }

  if (tipo === 'REVISOR') {
    // requiere asesor (para columna Asesor del documento)
    const asesor = await this.getAsesorInternoProyecto(idProyecto);
    if (!asesor?.id) return { valid: false, reason: 'No tiene asesor interno asignado.' };

    // requiere al menos 1 revisor asignado
    try {
      const revisores = await this.proyectosSvc.getDocentesRelacion(idProyecto, this.ROL_REVISOR_REPORTE).toPromise();
      if (!Array.isArray(revisores) || !revisores.length) {
        return { valid: false, reason: 'No tiene revisores asignados.' };
      }
    } catch {
      return { valid: false, reason: 'No se pudieron obtener revisores del proyecto.' };
    }
  }

  // 5) Integrantes (si UNO falla → falla todo el proyecto)
  const integrantes = await this.getIntegrantesProyecto(idProyecto);
  if (!integrantes.length) return { valid: false, reason: 'El proyecto no tiene integrantes.' };

  const invalidos = integrantes
    .map(al => this.getCamposFaltantesEstudiante(al))
    .filter(arr => arr.length > 0);

  if (invalidos.length) {
    return { valid: false, reason: 'Hay integrantes con datos incompletos (bloquea a todo el proyecto).' };
  }

  return { valid: true, reason: '' };
}
  private enviarCorreosAsignacion$(
    proyecto: any,
    asesor: { nombre: string; correo: string } | null,
    revisores: Array<{ nombre: string; correo: string }>,
    alumnos: Array<{ nombre: string; correo: string }>
  ) {
    // 1) correo a asesor (si existe)
    const correoAsesor$ = asesor?.correo
      ? this.emailSvc.sendEmail(
        asesor.correo,
        `Asignación como asesor interno | ${proyecto.titulo ?? 'Proyecto'}`,
        this.buildCuerpoDocenteAsesor(proyecto, asesor, revisores)
      ).pipe(
        map(() => true),
        catchError(() => of(false))
      )
      : of(true); // si no hay asesor, no falla

    // 2) correo a cada revisor
    const correosRevisores$ = (revisores ?? []).length
      ? forkJoin(
        revisores.map(r =>
          this.emailSvc.sendEmail(
            r.correo,
            `Asignación como revisor | ${proyecto.titulo ?? 'Proyecto'}`,
            this.buildCuerpoDocenteRevisor(proyecto, r, asesor)
          ).pipe(
            map(() => true),
            catchError(() => of(false))
          )
        )
      ).pipe(map(arr => arr.every(x => x === true)))
      : of(true);

    // 3) correo a cada alumno (consolidado)
    const correosAlumnos$ = (alumnos ?? []).length
      ? forkJoin(
        alumnos.map(a =>
          this.emailSvc.sendEmail(
            a.correo,
            `Comité asignado | ${proyecto.titulo ?? 'Proyecto'}`,
            this.buildCuerpoAlumnoConsolidado(proyecto, a, asesor, revisores)
          ).pipe(
            map(() => true),
            catchError(() => of(false))
          )
        )
      ).pipe(map(arr => arr.every(x => x === true)))
      : of(true);

    // Resultado final: si TODOS ok -> true, si alguno falla -> false
    return forkJoin({ correoAsesorOk: correoAsesor$, correosRevisoresOk: correosRevisores$, correosAlumnosOk: correosAlumnos$ }).pipe(
      map(r => r.correoAsesorOk && r.correosRevisoresOk && r.correosAlumnosOk)
    );
  }

  private buildCuerpoAlumnoConsolidado(
    proyecto: any,
    alumno: { nombre: string },
    asesor: { nombre: string } | null,
    revisores: Array<{ nombre: string }>
  ) {
    const listaRev = (revisores ?? []).map(x => `• ${x.nombre}`).join('\n') || '• (No asignados)';
    const nomAsesor = asesor?.nombre ? asesor.nombre : '(No asignado)';

    return `
Hola ${alumno.nombre}.

Ya se asignó el comité de tu proyecto de residencia.

Proyecto: ${proyecto.titulo ?? ('#' + proyecto.id)}

Asesor interno:
• ${nomAsesor}

Revisores:
${listaRev}

Ya puedes ingresar al sistema y revisar los detalles del proyecto.

Saludos.
`.trim();
  }

  private buildCuerpoDocenteRevisor(
    proyecto: any,
    revisor: { nombre: string },
    asesor: { nombre: string } | null
  ) {
    return `
Hola ${revisor.nombre}.

Se te asignó como REVISOR del anteproyecto.

Proyecto: ${proyecto.titulo ?? ('#' + proyecto.id)}
Asesor interno: ${asesor?.nombre ?? '(No asignado)'}

Por favor ingresa al sistema para revisar el anteproyecto.

Saludos.
`.trim();
  }

  private buildCuerpoDocenteAsesor(
    proyecto: any,
    asesor: { nombre: string },
    revisores: Array<{ nombre: string }>
  ) {
    const listaRev = (revisores ?? []).map(x => `• ${x.nombre}`).join('\n') || '• (No asignados)';

    return `
Hola ${asesor.nombre}.

Se te asignó como ASESOR INTERNO del proyecto.

Proyecto: ${proyecto.titulo ?? ('#' + proyecto.id)}

Revisores:
${listaRev}

Por favor ingresa al sistema para dar seguimiento.

Saludos.
`.trim();
  }

private getJefeDepartamentoNombre(periodoId: number): string {
  const p = (this.periodos ?? []).find(x => Number((x as any)?.id) === Number(periodoId));
  return String((p as any)?.jefeDepartamentoNombre ?? '').trim();
}

private async getComentarioAnteproyecto(idProyecto: number): Promise<string> {
  // 1) si ya está cacheado en etapa 1, úsalo
  const cached = (this.entregablesEtapa1 ?? [])
    .map(x => String(x?.ultimaObs ?? '').trim())
    .find(x => !!x);

  if (cached) return cached;

  // 2) si no, vuelve a consultar el anteproyecto
  try {
    const entregables: any[] = await this.entregablesSvc.getByProyecto(idProyecto).toPromise() ?? [];
    const ent = (entregables ?? []).find((e: any) =>
      Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === Number(this.TIPO_ANTEPROYECTO)
    );

    const idEntregable = Number(ent?.id ?? ent?.Id ?? 0);
    if (!idEntregable) return '';

    const det: any = await this.entregablesSvc.getDetalle(idEntregable).toPromise();
    const revisiones: any[] = det?.revisiones ?? [];

    const last = revisiones
      .slice()
      .sort((a, b) =>
        Number(b?.numeroRevision ?? b?.NumeroRevision ?? 0) -
        Number(a?.numeroRevision ?? a?.NumeroRevision ?? 0)
      )[0];

    return String(last?.observaciones ?? last?.Observaciones ?? '').trim();
  } catch {
    return '';
  }
}

}

// ══════════════════════════════════════════════════════════
// PARCHE para proyectos.ts — Sustitución de docentes
// Agregar estas propiedades y métodos a la clase ProyectosComponent
// ══════════════════════════════════════════════════════════

// ── Propiedades (agregar junto a las demás de la clase) ──
/** Validador: si ambos tiempos existen, fin debe ser mayor que inicio */
export function timeRangeValidator(startKey: string, endKey: string): ValidatorFn {
  return (group: AbstractControl) => {
    const start = group.get(startKey)?.value as string | null;
    const end = group.get(endKey)?.value as string | null;

    if (!start || !end) {
      const endCtrl = group.get(endKey);
      if (endCtrl?.hasError('timeRange')) {
        const { timeRange, ...rest } = endCtrl.errors ?? {};
        endCtrl.setErrors(Object.keys(rest).length ? rest : null);
      }
      return null;
    }

    const s = start.split(':').map(Number);
    const e = end.split(':').map(Number);
    const startMin = (s[0] ?? 0) * 60 + (s[1] ?? 0);
    const endMin = (e[0] ?? 0) * 60 + (e[1] ?? 0);

    if (endMin <= startMin) {
      group.get(endKey)?.setErrors({ ...(group.get(endKey)?.errors ?? {}), timeRange: true });
      return { timeRange: true };
    } else {
      const endCtrl = group.get(endKey);
      if (endCtrl?.errors) {
        const { timeRange, ...rest } = endCtrl.errors;
        endCtrl.setErrors(Object.keys(rest).length ? rest : null);
      }
      return null;
    }
  };

}
