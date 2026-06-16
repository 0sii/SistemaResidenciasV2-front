import { ChangeDetectorRef, Component, ElementRef, OnInit, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AbstractControl, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { FileUpload } from 'primeng/fileupload';
import { CarouselModule } from 'primeng/carousel';
import { TagModule } from 'primeng/tag';
import { ESTADO_PROYECTO_UI } from '../../utils/estado-proyecto.constants';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DialogModule } from 'primeng/dialog';
import { DocumentosService, DocumentoUploadResultDto } from '../../service/documentos.service';
import { ProyectosService } from '../../service/proyectos.service';
import { EstudiantesService } from '../../service/estudiantes.service';
import { AuthService } from '../../service/auth.service';
import { catchError, concatMap, debounceTime, distinctUntilChanged, filter, finalize, forkJoin, map, Observable, of, Subject, switchMap, tap } from 'rxjs';
import { from } from 'rxjs';
import { EntregableDetalleDto, EntregablesService } from '../../service/entregables.service';
import { EstadosPagedResponse, EstadosService } from '../../service/estado.service';
import { Proyecto } from '../../Interface/InterfaceProyecto';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { CatalogosService } from '../../service/catalogos.service';
import { EmpresasService } from '../../service/empresa.service';
import { PeriodosAcademicosService } from '../../service/periodoAcademico.service';
import { Empresa } from '../../Interface/InterfaceEmpresa';
import { PeriodoAcademicoDto } from '../../service/periodoAcademico.service';
import { ContactoEmergenciaService } from '../../service/contactoEmergencia.service';

import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { EmailService } from '../../service/email.service';
import { FechaEsPipe } from '../../pipe/fecha-es.pipe';

type ResultadoAnteproyecto = 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO';
type EstadoVisible = 'POR_REVISAR' | 'REVISADO' | 'ACEPTADO' | 'RECHAZADO';




interface RevisionAnteproyecto {
  idRevision: number;
  fecha: string;
  observacion: string;
  tieneArchivo: boolean;
  nombreArchivo?: string | null;
}

export interface RevisionAnteproyectoUi {
  fecha: string;
  observacion: string;
  tieneArchivo?: boolean;
  idRevision?: number;
}


interface AnteproyectoRow {
  idVersion: number;
  idEntregable: number;
  numeroVersion: number;
  fechaSubida: string;
  nombreOriginal: string;
  tamanoBytes: number;
  totalRevisiones: number;

  // ✅ el bueno
  idEstudianteSubio?: number | null;
  subidoPor?: string | null;
  // ✅ estado global del entregable
  idEstadoEntregable?: number | null;

  estadoEntregable?: string | null;
  ultimoDictamen?: string | null;
  ultimaObs?: string | null;
  fechaUltimaRevision?: string | null;
  estadoVisible?: EstadoVisible;

}

type EtapaEstado = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADA' | 'BLOQUEADA' | 'RECHAZADA';

interface Etapa {
  clave: string;
  titulo: string;
  descripcion: string;
  estado: EtapaEstado;

  extra?: {
    revisorNombre?: string | null;
    versionActual?: number | null;
    fechaUltimaSubida?: string | null;

    // ✅ ahora por ID (numérico)
    idEstadoEntregable?: number | null;

    // (opcional) si quieres mostrar texto
    estadoEntregableTexto?: string | null;
  };
}


type EntregableEstadoUI = {
  idEstadoEntregable: number;
  estadoClave: string;
  estadoDescripcion: string;
};

type EntregableEstado = 'PENDIENTE' | 'EN_REVISION' | 'APROBADO' | 'RECHAZADO';

interface EtapaUI {
  etapa: number;
  idTipoEntregable: number;
  titulo: string;

  idEntregable?: number | null;

  idEstadoEntregable?: number | null; // ✅ nuevo
  versionActual?: number | null;

  locked: boolean;
}

type GateKey = 'perfil' | 'contactoEmergencia' | 'documentos' | 'proyecto';

interface GateStatus {
  ok: boolean;
  faltantes: string[];
}

interface GateSummary {
  perfil: GateStatus;
  contactoEmergencia: GateStatus;
  documentos: GateStatus;
  proyecto: GateStatus;

  get allOk(): boolean;
}

type ViewState = 'loading' | 'ok' | 'forbidden' | 'error';

@Component({
  selector: 'app-seguimiento',
  standalone: true,
  imports: [CommonModule,
    TableModule,
    ButtonModule,
    ToastModule,
    FormsModule,
    DialogModule,
    CarouselModule,
    TagModule,
    ReactiveFormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    CommonModule,
    TableModule,
    ButtonModule,
    ToastModule,
    NgxExtendedPdfViewerModule,
    CarouselModule,
    TagModule,
    InputTextModule,
    InputNumberModule,
    ProgressSpinnerModule,
    FechaEsPipe
  ],
  templateUrl: './seguimiento.html',
  styleUrl: './seguimiento.css',
  providers: [MessageService]
})
export class Seguimiento implements OnInit {
  private docsSvc = inject(DocumentosService);
  private proyectosSvc = inject(ProyectosService);
  private toast = inject(MessageService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(AuthService);
  public router = inject(Router);
  private estudiantesSvc = inject(EstudiantesService);
  private entregablesSvc = inject(EntregablesService);
  private estadosSvc = inject(EstadosService);
  private catalogosSvc = inject(CatalogosService);
  private empresasSvc = inject(EmpresasService);
  private periodosSvc = inject(PeriodosAcademicosService);
  private estadosMap = new Map<number, string>();
  private documentosSvc = inject(DocumentosService);
  private contactoEmergenciaSvc = inject(ContactoEmergenciaService);
  private emailSvc = inject(EmailService);

  @ViewChild('fuEtapa') fuEtapa?: FileUpload;
  @ViewChild('stageViewport') stageViewport?: ElementRef<HTMLElement>;
  @ViewChildren('stageBtn') stageBtns?: QueryList<ElementRef<HTMLButtonElement>>;

  private currentEntregableRequest = 0;
  private stageRestorePending: number | null = null;
  // ============================
  // 🧭 Etapas / “Carrusel”
  // ============================
  stages = [
    { index: 0, key: 1, label: 'Anteproyecto' },
    { index: 1, key: 2, label: 'Reporte parcial 1' },
    { index: 2, key: 3, label: 'Reporte parcial 2' },
    { index: 3, key: 4, label: 'Reporte final' },
    { index: 4, key: 5, label: 'Cierre documental' },
  ];

  // ✅ Identidad del alumno logueado (para saber si es líder)
  miIdEstudiante: number | null = null;

  // ✅ Etapa 2: se usa para mostrar pantalla de faltantes SIN dialogs
  get stage2TieneFaltantes(): boolean {
    return (this.gatePerfil?.faltantes?.length ?? 0) > 0
      || (this.gateContacto?.faltantes?.length ?? 0) > 0
      || (this.gateProyecto?.faltantes?.length ?? 0) > 0;
  }

  get totalIntegrantesProyecto(): number {
    return Array.isArray(this.equipo) ? this.equipo.length : 0;
  }

  get diferenciaCupoProyecto(): number {
    const cupo = Number(this.cupoProyecto ?? 0);
    if (!Number.isFinite(cupo) || cupo <= 0) return 0;
    return this.totalIntegrantesProyecto - cupo;
  }

  get equipoCumpleCupoExacto(): boolean {
    const cupo = Number(this.cupoProyecto ?? 0);
    if (!Number.isFinite(cupo) || cupo <= 0) return true;
    return this.totalIntegrantesProyecto === cupo;
  }

  get mensajeCupoProyecto(): string | null {
    const cupo = Number(this.cupoProyecto ?? 0);
    if (!Number.isFinite(cupo) || cupo <= 0) return null;

    const total = this.totalIntegrantesProyecto;
    if (total < cupo) {
      const faltan = cupo - total;
      return `Faltan ${faltan} integrante(s) para completar el cupo del proyecto (${total}/${cupo}).`;
    }

    if (total > cupo) {
      const sobran = total - cupo;
      return `Sobran ${sobran} integrante(s); el cupo del proyecto es ${cupo} y actualmente hay ${total}. Debe salir alguien del equipo para continuar.`;
    }

    return null;
  }

  get puedeSalirseDelProyecto(): boolean {
    if (this.esDocente) return false;
    if (!this.esIntegrante) return false;
    if (this.esLider) return false;
    if (this.proyectoCancelado) return false;
    if (this.activeStageIndex !== 0) return false;

    const estado = Number(this.proyectoIdEstado ?? 0);
    return Number.isFinite(estado) && estado > 0 && estado < this.ESTADO_DESDE_EXIGIR_DATOS;
  }

  // ============================
  // ✅ GATES ETAPA 2 (perfil + contacto + docs + proyecto)
  // ============================
  entregablesLoaded = false;
  proyectoLoaded = false;

  stage2Ready = false;
  // ✅ Gates (requisitos) para etapas 2-4
  integrantesFaltantes: string[] = [];


  gatePerfil = { ok: false, faltantes: [] as string[] };
  gateContacto = { ok: false, faltantes: [] as string[] };
  gateDocs = { ok: false, faltantes: [] as string[] };
  gateProyecto = { ok: false, faltantes: [] as string[] };

  // helper para tu UI actual (si ya usas estos)
  perfilIncompleto = false;
  proyectoIncompleto = false;
  perfilFaltantes: string[] = [];
  proyectoFaltantes: string[] = [];

  // evita loops al recargar


  activeStageIndex = 0;

  // Estado por tipo entregable (lo trae tu API)

  // Revisor etapa 1 (lo trae tu endpoint Docentes/Relacion)
  revisorAnteproyectoNombre: string | null = null;
  get revisorAnteproyectoAsignado(): boolean {
    return !!(this.revisorAnteproyectoNombre && this.revisorAnteproyectoNombre.trim().length > 0);
  }

  // ✅ Etapas 2-4: asesor interno y revisores (residencia/proyecto)
  asesorInternoNombre: string | null = null;
  revisorResidenciaNombre: string | null = null;
  revisorProyectoNombre: string | null = null;


  anteEntregableId?: number | null;

  private entregableEstadoByTipo = new Map<number, EntregableEstadoUI>();

  anteEntregableEstado?: EntregableEstadoUI | null;

  proyectoEstadoLabel: string = '';
  proyectoCancelado: boolean = false;

  private autoRejectInvApplied = false;


  etapas: Etapa[] = [];
  etapaActivaIndex = 0;

  private readonly ETAPAS_BASE = [
    { etapa: 1, idTipoEntregable: 1, titulo: 'Anteproyecto' },
    { etapa: 2, idTipoEntregable: 2, titulo: 'Reporte parcial 1' },
    { etapa: 3, idTipoEntregable: 3, titulo: 'Reporte parcial 2' },
    { etapa: 4, idTipoEntregable: 4, titulo: 'Reporte final' },
  ] as const;

  etapasUI: EtapaUI[] = [];
  selectedTipoEntregable: number = 1; // por defecto: Anteproyecto
  selectedEtapaTitulo: string = 'Anteproyecto';
  proyectoActual: Proyecto | null = null;

  // Si en tu sistema "Revisor anteproyecto" es una relación:
  // (ya lo usas en backend: REVISOR_ANTEPROYECTO)
  private readonly CLAVE_REVISOR_ANTEPROYECTO = 'REVISOR_ANTEPROYECTO';

  // Estados que YA tienes en tu controller (los uso igual)
  private readonly ESTADO_PUBLICADO_ID = 2;
  private readonly ESTADO_ESPERA_ASIGNANDO_REVISOR = 3;
  private readonly ESTADO_ESPERA_REVISION_ANTEPROYECTO = 4;

  private readonly EST_ENT_PENDIENTE = 1;
  private readonly EST_ENT_EN_REVISION = 2;
  private readonly EST_ENT_CAMBIOS = 3;
  private readonly EST_ENT_APROBADO = 4;
  private readonly EST_ENT_RECHAZADO = 5;
  private readonly EST_ENT_CANCELADO = 6;

  private readonly ESTADO_DESDE_EXIGIR_PERFIL = 6;

  // ✅ Reglas reales según tu tabla de estados
  private readonly ESTADO_DESDE_EXIGIR_DATOS = 6;  // "Espera Asignando Asesor"

  // Ya lo tienes:
  private readonly TIPO_ANTEPROYECTO = 1;

  private readonly ESTADO_CANCELADO = 9;             // "Cancelado"

  // ✅ control de carga y errores del proyecto
  proyectoLoadError: string | null = null;
  proyectoLoadedOk = false;

  // 🔒 Cargando validaciones/gates (perfil/proyecto/integrantes)
  loadingGate: boolean = false;

  // Helper: convierte GateStatus a tus flags actuales (para no reescribir mucho HTML)


  // ✅ Maps para labels (empresa / periodo)
  private empresasMap = new Map<number, string>();
  private periodosMap = new Map<number, string>();


  @ViewChild('fu') fu?: FileUpload;

  loading = false;

  // 🔝 Proyecto
  idProyecto: number | null = null;
  tituloProyecto = 'Cargando proyecto...';

  // 📄 Entregables (separados por etapa/tipo)
  // Tipos: 1=Anteproyecto, 2=Reporte Parcial 1, 3=Reporte Parcial 2, 4=Reporte Final
  entregablesEtapa1: AnteproyectoRow[] = [];
  entregablesEtapa2: AnteproyectoRow[] = [];
  entregablesEtapa3: AnteproyectoRow[] = [];
  entregablesEtapa4: AnteproyectoRow[] = [];

  // "documentos" se queda como alias del arreglo de la etapa actual (para no romper visor/obs)
  documentos: AnteproyectoRow[] = [];

  private setEntregablesPorTipo(tipo: number, rows: AnteproyectoRow[]): void {
    switch (Number(tipo)) {
      case 1: this.entregablesEtapa1 = rows; break;
      case 2: this.entregablesEtapa2 = rows; break;
      case 3: this.entregablesEtapa3 = rows; break;
      case 4: this.entregablesEtapa4 = rows; break;
    }
  }

  private getEntregablesPorTipo(tipo: number): AnteproyectoRow[] {
    switch (Number(tipo)) {
      case 1: return this.entregablesEtapa1;
      case 2: return this.entregablesEtapa2;
      case 3: return this.entregablesEtapa3;
      case 4: return this.entregablesEtapa4;
      default: return [];
    }
  }

  selectedFile: File | null = null;
  selectedFilesEtapa: File[] = [];


  // 👥 Equipo
  equipo: any[] = [];
  noControlNuevo = '';
  agregando = false;
  leavingProject = false;
  cupoProyecto: number | null = null;


  // 📝 Revisiones (placeholder para futuro)
  revisiones: RevisionAnteproyecto[] = [];
  resultadoFinal: ResultadoAnteproyecto = 'PENDIENTE';
  fechaResultadoFinal: string | null = null;

  // ✅ Invitaciones (seguimiento)
  loadingInv = false;
  noControlInvitar = '';

  invitaciones: any[] = [];
  invPendientes: any[] = [];
  invAceptadas: any[] = [];
  invRechazadas: any[] = [];

  // ✅ Evita que el auto-salto corra varias veces
  private autoStageApplied = false;


  showObsDialog = false;
  obsLoading = false;
  obsDoc: any = null;
  obsRevisiones: RevisionAnteproyecto[] = [];

  // ===== lookup invitación =====
  invLookupLoading = false;
  invLookupError: string | null = null;
  invLookupEst: any | null = null;
  private invNoControl$ = new Subject<string>();

  showProyectoIncompletoDialog = false;
  public idEstudianteCreador: number | null = null;


  private fb = inject(FormBuilder);

  showProyectoDialog = false;
  savingProyecto = false;
  proyectoFormError: string | null = null;

  modalidadesOptions: { label: string; value: number | null }[] = [];
  especializacionesOptions: { label: string; value: number }[] = [];

  // Labels readonly (opcional, para mostrar nombre y no el ID)
  empresaLabelActual: string | null = null;
  periodoLabelActual: string | null = null;

  // ============================
  // 🗓️ Cronograma (fechas sugeridas)
  // ============================
  private periodosById = new Map<number, PeriodoAcademicoDto>();
  periodoActualDto: PeriodoAcademicoDto | null = null;

  fechaAnteproyectoAprobado: Date | null = null;
  fechaProgramadaRp1: Date | null = null;
  fechaProgramadaRp2: Date | null = null;
  fechaFinPeriodoAcademico: Date | null = null;

  proyectoForm: FormGroup = this.fb.group(
    {
      // ✅ ÚNICO obligatorio para guardar cambios básicos
      titulo: ['', [Validators.required, Validators.maxLength(200)]],

      // ✅ Opcionales (permiten guardar aunque estén vacíos)
      descripcion: ['', [Validators.maxLength(1200)]],
      objetivo: ['', [Validators.maxLength(1200)]],

      // ✅ Opcional (si lo dejas vacío, lo manda como null/'' según tu nz())
      // si quieres que siempre exista un número, déjalo con default 1 y solo min(1)
      noResidentes: [1, [Validators.min(1)]],

      // ✅ Horarios opcionales (el validador ya ignora si falta uno)
      horarioInicio: [''],
      horarioFin: [''],

      // ✅ Opcionales en edición (se pueden quedar null)
      idPeriodoAcademico: [null],
      idEmpresa: [null],
      idEspecializcion: [null],
      idModalidad: [null],
    },
    { validators: [timeRangeValidator('horarioInicio', 'horarioFin')] }
  );



  get pf() {
    return this.proyectoForm.controls;
  }


  pdfUrl: string | null = null;
  displayDialog: boolean = false;
  pdfFileName: string | null = null;

  viewState: 'loading' | 'ok' | 'forbidden' | 'error' = 'loading';

  reemplazandoIdVersion: number | null = null;

  revisorAnteproyectoEmail: string | null = null;

  stage2ReadyAll = false;


  ngOnInit(): void {
  this.route.queryParamMap.subscribe(q => {
    const rawProyecto = q.get('idProyecto');
    const idProyecto = rawProyecto ? Number(rawProyecto) : NaN;

    if (Number.isFinite(idProyecto) && idProyecto > 0) {
      const sameProject = this.idProyecto === idProyecto;

      this.idProyecto = idProyecto;

      // ✅ En recarga queremos respetar el flujo real,
      // no una etapa vieja persistida en URL
      this.stageRestorePending = null;

      if (!sameProject || !this.proyectoLoadedOk) {
        this.autoStageApplied = false;
        this.currentEntregableRequest = 0;

        // estado base temporal mientras carga proyecto/entregables
        this.activeStageIndex = 0;
        this.selectedTipoEntregable = 1;
        this.selectedEtapaTitulo = this.stages[0]?.label ?? 'Anteproyecto';

        this.cargarProyecto(idProyecto);
      }

      return;
    }

    this.resolverIdProyectoDesdeUsuario();
  });

  this.cargarMiContextoUsuario();
  this.cargarEstadosProyecto();
  this.loadModalidadesYEspecializaciones();

  this.invNoControl$
    .pipe(
      debounceTime(350),
      distinctUntilChanged(),
      tap(() => {
        this.invLookupLoading = true;
        this.invLookupError = null;
        this.invLookupEst = null;
        this.cdr.markForCheck();
      }),
      switchMap((nc) => {
        const clean = String(nc || '').trim().toUpperCase();
        if (clean.length < 5) return of(null);
        return this.estudiantesSvc.getByNoControl(clean).pipe(
          catchError(() => of(false))
        );
      })
    )
    .subscribe((est: any) => {
      this.invLookupLoading = false;

      if (!est || est === false || !est?.id) {
        this.invLookupEst = null;
        this.invLookupError = 'No encontrado';
        this.cdr.markForCheck();
        return;
      }

      const idActual = Number(est?.idProyecto ?? 0);
      if (idActual > 0) {
        this.invLookupEst = est;
        this.invLookupError = 'Ya tiene proyecto asignado';
        this.cdr.markForCheck();
        return;
      }

      this.invLookupEst = est;
      this.invLookupError = null;
      this.cdr.markForCheck();
    });

  this.router.events
    .pipe(filter(ev => ev instanceof NavigationEnd))
    .subscribe(() => {
      if (this.activeStageIndex === 1 && this.debeExigirPerfilYProyecto()) {
        this.validarDatosYContinuar(1);
      }
    });
}

  private normalizeStageIndexFromQuery(raw: string | null): number | null {
    const stageParam = Number(raw ?? NaN);
    if (!Number.isFinite(stageParam)) return null;

    const idx = stageParam - 1; // URL 1-based -> array 0-based
    return idx >= 0 && idx < this.stages.length ? idx : null;
  }

  private persistStageInUrl(stageIndex: number): void {
    const stageParam = stageIndex + 1;
    const current = Number(this.route.snapshot.queryParamMap.get('stage') ?? NaN);

    if (current === stageParam) return;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { stage: stageParam },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private focusCurrentStage(scroll = true): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const btn = this.stageBtns?.get(this.activeStageIndex)?.nativeElement;
        btn?.focus?.({ preventScroll: true });

        if (scroll) {
          this.stageViewport?.nativeElement?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  private normStr(v: any): string {
    return String(v ?? '').trim().toUpperCase();
  }

  /** Regla opcional: Dictamen comité académico */
  private esTipoOpcional(t: any): boolean {
    const clave = this.normStr(t?.clave ?? t?.Clave ?? t?.key ?? t?.Key);
    const descRaw = String(t?.descripcion ?? t?.Descripcion ?? '').trim();

    // 1) Por claves típicas (ajusta si ya conoces la real)
    const clavesOpcionales = new Set([
      'DICTAMEN_AUTORIZACION_COMITE_ACADEMICO',
      'DICTAMEN_COMITE_ACADEMICO',
      'DICTAMEN_COMITE',
      'DICTAMEN_AUTORIZACION'
    ]);
    if (clave && clavesOpcionales.has(clave)) return true;

    // 2) Por descripción (más resistente cuando no sabes la clave exacta)
    const desc = descRaw.toLowerCase();
    if (desc.includes('dictamen') && desc.includes('comit') && desc.includes('acad')) return true;

    return false;
  }



  public validarDatosYContinuar(targetStageIndex: number): void {
    const isStage2 = targetStageIndex === 1;

    // reset UI
    this.perfilFaltantes = [];
    this.proyectoFaltantes = [];
    this.perfilIncompleto = false;
    this.proyectoIncompleto = false;
    this.evaluarRequisitosEtapas24();


    this.gatePerfil = { ok: true, faltantes: [] };
    this.gateContacto = { ok: true, faltantes: [] };
    this.gateDocs = { ok: true, faltantes: [] };
    this.gateProyecto = { ok: true, faltantes: [] };


    if (!this.idProyecto) {
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se detectó el proyecto.', life: 10000 });
      return;
    }

    const u: any = this.auth.getUser();
    const idUsuario = Number(u?.id ?? u?.userId ?? u?.sub ?? NaN);
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo identificar tu usuario.', life: 10000 });
      return;
    }

    this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(
      catchError(() => of(false)),
      switchMap((est: any) => {
        if (!est || est === false) return of(false);

        const idCE = Number(est?.idContactoEmergencia ?? est?.IdContactoEmergencia ?? 0);

        const contacto$ = (idCE > 0)
          ? this.contactoEmergenciaSvc.getById(idCE).pipe(catchError(() => of(null)))
          : of(null);

        const docs$ = forkJoin({
          tipos: this.documentosSvc.getTiposExpediente().pipe(catchError(() => of([]))),
          docs: this.documentosSvc.getMisExpediente().pipe(catchError(() => of([])))
        });

        const proy$ = this.proyectosSvc.getById(this.idProyecto!).pipe(
          catchError(() => of(false))
        );

        return forkJoin({
          est: of(est),
          contacto: contacto$,
          docsPack: docs$,
          proyecto: proy$
        });
      })
    ).subscribe((pack: any) => {
      if (!pack || pack === false) {
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar tu perfil.', life: 10000 });
        return;
      }

      const est = pack.est;
      const contacto = pack.contacto;
      const tipos = (pack.docsPack?.tipos ?? []) as any[];
      const docs = (pack.docsPack?.docs ?? []) as any[];
      const proyecto = pack.proyecto;

      // PERFIL
      const rPerfil = this.validarPerfilCompleto(est);
      this.gatePerfil = { ok: !!rPerfil.ok, faltantes: rPerfil.faltantes ?? [] };

      // CONTACTO
      this.gateContacto = this.validarContactoEmergenciaCompleto(contacto, est);

      // DOCS
      this.gateDocs = this.validarExpedienteCompleto(tipos, docs);

      // PROYECTO (solo si es propuesta alumno)
      // ✅ PROYECTO: SIEMPRE se valida para poder pasar a etapa 2/3/4
      if (!proyecto || proyecto === false) {
        this.gateProyecto = { ok: false, faltantes: ['No se pudo cargar el proyecto (error).'] };
      } else {
        const rProy = this.validarProyectoCompleto(proyecto);
        this.gateProyecto = { ok: !!rProy.ok, faltantes: rProy.faltantes ?? [] };
      }


      // ✅ flags legacy (para bloquear pantalla)
      const faltantesPerfilTotal = [
        ...(this.gatePerfil.faltantes ?? []),
        ...(this.gateContacto.faltantes ?? [])
      ].filter(Boolean);

      this.perfilFaltantes = faltantesPerfilTotal;
      this.perfilIncompleto = faltantesPerfilTotal.length > 0;



      this.proyectoFaltantes = [...(this.gateProyecto.faltantes ?? [])];
      this.proyectoIncompleto = this.propuestaAlumno && !this.gateProyecto.ok;
      this.evaluarRequisitosEtapas24();


      // ✅ SIN dialogs: en etapa 2 solo mostramos pantalla de faltantes
      if (isStage2) {
        // Asegura equipo actualizado antes de evaluar
        this.estudiantesSvc.getByProyecto(this.idProyecto!).pipe(
          catchError(() => of([])),
          switchMap((equipo: any) => {
            this.equipo = this.asArray<any>(equipo);
            return this.evaluarStage2All$(this.equipo);
          })
        ).subscribe({
          next: () => {
            // solo pinta, NO forces entrada; se queda en etapa 2 mostrando requisitos
            this.cdr.markForCheck();
          },
          error: () => {
            this.stage2ReadyAll = false;
            this.stage2Ready = false;
            this.cdr.markForCheck();
          }
        });

        return;
      }

      // ✅ Recalcular gates globales (incluye integrantes)
      this.evaluarStage2All(); // usa perfilFaltantes/proyectoIncompleto/equipo

      // ✅ Si el flujo exige datos completos y es etapa 2/3/4, entonces bloquea entrada
      const esEtapa24 = targetStageIndex >= 1;

      if (esEtapa24 && this.debeExigirPerfilYProyecto()) {
        this.stage2Ready = this.stage2ReadyAll;

        if (!this.stage2ReadyAll) {
          // No entrar, solo dejar visible la pantalla de requisitos
          this.activeStageIndex = 1; // mantiene etapa 2 visible para mostrar requisitos
          this.cdr.markForCheck();
          return;
        }
      }

      // ✅ si no es etapa 2, entra normal
      this.entrarAEtapa(targetStageIndex);
    });
  }

  verArchivoRevision(r: RevisionAnteproyecto): void {
    const idRevision = Number(r?.idRevision ?? 0);
    if (!idRevision) return;

    // Nombre base (sin inventar extensión)
    const base = (r?.nombreArchivo && String(r.nombreArchivo).trim().length)
      ? String(r.nombreArchivo).trim()
      : 'archivo_docente';

    this.liberarPdfUrl();
    this.pdfFileName = base;

    this.entregablesSvc.downloadRevisionFile(idRevision).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;

        // Si es PDF => abrir viewer
        if (blob.type === 'application/pdf') {
          const fileSizeInMB = blob.size / (1024 * 1024);
          if (fileSizeInMB > 15) {
            this.toast.add({ severity: 'warn', summary: 'Archivo grande', detail: 'El PDF es demasiado grande para visualizarlo en línea.', life: 10000 });
            return;
          }

          this.pdfUrl = URL.createObjectURL(blob);
          this.displayDialog = true;
          return;
        }

        // Si NO es PDF => fallback a descarga (correcto, porque puede ser docx)
        this.toast.add({
          severity: 'info',
          summary: 'Descarga',
          detail: 'El archivo no es PDF, se descargará.', life: 10000
        });
        this.descargarBlob(blob, base);
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo obtener el archivo del docente.', life: 10000 });
      }
    });
  }

  verEntregable(row: any): void {
    const idVersion = Number(row?.idVersion ?? NaN);
    if (!Number.isFinite(idVersion) || idVersion <= 0) return;

    const fileName = row?.nombreOriginal || 'entregable.pdf';

    this.liberarPdfUrl();
    this.pdfFileName = fileName;

    this.entregablesSvc.downloadVersion(idVersion).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;

        if (blob.type !== 'application/pdf') {
          console.error('El archivo recibido no es un PDF:', blob.type);
          this.toast.add({ severity: 'error', summary: 'Archivo inválido', detail: 'El archivo recibido no es un PDF.', life: 10000 });
          return;
        }

        const fileSizeInMB = blob.size / (1024 * 1024);
        if (fileSizeInMB > 15) {
          this.toast.add({ severity: 'warn', summary: 'Archivo grande', detail: 'El PDF es demasiado grande para visualizarlo en línea.', life: 10000 });
          return;
        }

        this.pdfUrl = URL.createObjectURL(blob);
        this.displayDialog = true;
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el PDF.', life: 10000 });
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

  private descargarBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }


  descargarArchivoRevision(r: RevisionAnteproyecto): void {
    const idRevision = Number(r?.idRevision ?? 0);
    if (!idRevision) return;

    this.entregablesSvc.downloadRevisionFile(idRevision).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const base = (r?.nombreArchivo && String(r.nombreArchivo).trim().length)
          ? String(r.nombreArchivo).trim()
          : 'respuesta_docente';

        // si no trae extensión, no invento (backend podría enviar docx/pdf)
        a.download = base;

        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar el archivo del docente.', life: 10000 });
      }
    });
  }


  private setupLookupInvitaciones(): void {
    this.invNoControl$
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        tap(() => {
          this.invLookupLoading = true;
          this.invLookupError = null;
          this.invLookupEst = null;
          this.cdr.markForCheck();
        }),
        switchMap((nc) => {
          const clean = String(nc || '').trim().toUpperCase();
          if (clean.length < 5) return of(null);
          return this.estudiantesSvc.getByNoControl(clean).pipe(catchError(() => of(false)));
        })
      )
      .subscribe((est: any) => {
        this.invLookupLoading = false;
        if (!est || est === false || !est?.id) {
          this.invLookupEst = null;
          this.invLookupError = 'No encontrado';
          this.cdr.markForCheck();
          return;
        }
        const idActual = Number(est?.idProyecto ?? 0);
        if (idActual > 0) {
          this.invLookupEst = est;
          this.invLookupError = 'Ya tiene proyecto asignado';
          this.cdr.markForCheck();
          return;
        }
        this.invLookupEst = est;
        this.invLookupError = null;
        this.cdr.markForCheck();
      });
  }


  proyectoEdit: Proyecto | null = null;

  // Opciones dropdown (rellénalas con tus catálogos)
  periodosOptions: { label: string; value: number }[] = [];
  empresasOptions: { label: string; value: number }[] = [];

  onOpenProyectoDialog() {
    this.proyectoFormError = null;

    if (!this.idProyecto) {
      this.proyectoFormError = 'No se detectó idProyecto.';
      return;
    }

    // ✅ siempre trae la versión más reciente del backend
    this.proyectosSvc.getById(this.idProyecto).pipe(
      catchError(() => of(false))
    ).subscribe((p: any) => {
      if (!p || p === false) {
        this.proyectoFormError = 'No se pudo cargar el proyecto.';
        return;
      }

      const pNorm = this.normalizeProyecto(p);
      this.proyectoActual = pNorm;

      // ✅ clonado defensivo
      this.proyectoEdit = JSON.parse(JSON.stringify(pNorm));
      this.cdr.markForCheck();
    });
  }

  private validarProyectoAntesDeGuardar(p: Proyecto): string[] {
    const faltan: string[] = [];

    if (!p.titulo || !p.titulo.trim()) faltan.push('Título');
    if (!p.descripcion || !p.descripcion.trim()) faltan.push('Descripción');
    if (!p.objetivo || !p.objetivo.trim()) faltan.push('Objetivo');

    if (!p.noResidentes || p.noResidentes <= 0) faltan.push('No. de residentes');

    if (!p.idPeriodoAcademico || p.idPeriodoAcademico <= 0) faltan.push('Periodo académico');
    if (!p.idEspecializcion || p.idEspecializcion <= 0) faltan.push('Especialización');
    if (!p.idEmpresa || p.idEmpresa <= 0) faltan.push('Empresa');

    // ✅ ahora sí obligatoria
    if (!p.idModalidad || p.idModalidad <= 0) faltan.push('Modalidad');

    return faltan;
  }

  guardarProyectoDesdeDialog() {
    this.proyectoFormError = null;

    if (this.isProyectoSoloVista || !this.canEditProyecto) {
      this.toast.add({ severity: 'warn', summary: 'Sin permiso', detail: 'No puedes guardar en este estado.', life: 10000 });
      return;
    }
    if (!this.proyectoEdit) {
      this.proyectoFormError = 'No hay datos para guardar.';
      return;
    }

    const faltan = this.validarProyectoAntesDeGuardar(this.proyectoEdit);
    if (faltan.length) {
      this.proyectoFormError = `Faltan campos obligatorios: ${faltan.join(', ')}`;
      return;
    }

    if (!this.proyectoActual) {
      return;
    }

    // 🧠 Evita pisar estado / flags que el alumno no debe cambiar
    // (Ajusta si tu UI sí permite cambiarlos)
    this.proyectoEdit.idEstado = this.proyectoActual.idEstado;
    this.proyectoEdit.propuestaAlumno = this.proyectoActual.propuestaAlumno;
    this.proyectoEdit.fechaRegistor = this.proyectoActual.fechaRegistor;

    this.savingProyecto = true;
    this.syncProyectoFormDisabledState();

    this.proyectosSvc

      .update(this.proyectoEdit.id, this.proyectoEdit).subscribe({
        next: () => {
          this.savingProyecto = false;
          this.syncProyectoFormDisabledState();

          // refresca del backend para quedarnos con la verdad
          this.proyectosSvc.getById(this.proyectoEdit!.id).subscribe(p => {
            this.proyectoActual = p; // usa el nombre real de tu variable
            this.showProyectoIncompletoDialog = false;

            // ✅ revalida y desbloquea etapas si ya está completo
            this.validarDatosYContinuar(this.activeStageIndex);
          });
        },
        error: (err) => {
          this.savingProyecto = false;
          this.syncProyectoFormDisabledState();

          // ✅ sin mensajes del backend
          this.proyectoFormError = 'No se pudo guardar el proyecto. Verifica los campos e intenta nuevamente.';

        }
      });
  }


  private cargarEstadosProyecto(): void {
    this.estadosSvc.getAll()
      .pipe(
        map((resp: EstadosPagedResponse) => resp.items ?? [])
      )
      .subscribe({
        next: (rows: any[]) => {
          this.estadosMap.clear();

          for (const r of rows) {
            const id = Number(r?.id ?? r?.Id ?? NaN);
            const desc = String(r?.descripcion ?? r?.Descripcion ?? '').trim();
            if (Number.isFinite(id) && desc) this.estadosMap.set(id, desc);
          }

          // ✅ RE-FIJAR label si ya tenemos idEstado del proyecto
          if (this.proyectoIdEstado != null && Number.isFinite(this.proyectoIdEstado as any)) {
            this.proyectoEstadoLabel = this.getEstadoProyectoLabel(this.proyectoIdEstado);
            this.cdr.markForCheck();
          }
        },
        error: (e) => console.error('No se pudieron cargar estados', e),
      });
  }


  private getEstadoProyectoLabel(idEstado: number): string {
    return this.estadosMap.get(Number(idEstado)) ?? `Estado #${idEstado}`;
  }

  private normNc(v: any): string {
    return String(v ?? '').trim().toUpperCase();
  }


  private getNcFromEst(est: any): string {
    return this.normNc(
      est?.noControl ??
      est?.NoControl ??
      est?.no_control ??
      est?.nocontrol ??
      est?.numeroControl
    );
  }


  onNoControlInvitarInput(): void {
    const nc = String(this.noControlInvitar || '').trim().toUpperCase();
    this.invNoControl$.next(nc);
  }
  // seguimiento.ts
  esLider = false;
  propuestaAlumno = false; // del proyecto



  private detectarRolDocente(): void {
    const u: any = this.auth.getUser();
    const rol = String(u?.rol ?? u?.role ?? u?.tipo ?? '').toUpperCase();
    this.esDocente = rol.includes('DOCENTE') || rol.includes('PROF') || rol.includes('MAESTRO');
  }



  get puedeInvitar(): boolean {
    return this.propuestaAlumno && this.esLider && !this.proyectoCancelado;
  }


  get estaEnEquipo(): boolean {
    const nc = String(this.miNoControl ?? '').trim().toUpperCase();
    if (!nc) return false;
    return (this.equipo ?? []).some(e => String(e?.noControl ?? '').trim().toUpperCase() === nc);
  }

  esDocente = false;
  miNoControl: string | null = null;

  get esIntegrante(): boolean {
    if (!this.miNoControl) return false;
    const up = this.miNoControl.trim().toUpperCase();

    return (this.equipo ?? []).some(e => {
      const nc = String(
        e?.noControl ?? e?.NoControl ?? e?.no_control ?? e?.nocontrol ?? ''
      ).trim().toUpperCase();
      return nc === up;
    });
  }


  get puedeSubirAnteproyecto(): boolean {
    // ✅ cualquiera del equipo puede subir, excepto docente
    return !this.esDocente && this.esIntegrante;
  }



  private resolverIdProyectoDesdeUsuario(): void {
    const u: any = this.auth.getUser();
    const idUsuario = Number(u?.id ?? u?.userId ?? u?.sub ?? NaN);

    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      this.tituloProyecto = 'Seguimiento';
      return;
    }

    this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(
      catchError(() => of(false))
    ).subscribe((est: any) => {
      const idProy = Number(est?.idProyecto ?? NaN);
      this.miNoControl = String(est?.noControl ?? '').trim() || null;

      // 👇 AJUSTA ESTA PARTE según tu auth real.
      // idea: que docencia tenga rol/claims
      const u: any = this.auth.getUser();
      const rol = String(u?.rol ?? u?.role ?? u?.tipo ?? '').toLowerCase();
      this.esDocente = rol.includes('docente') || rol.includes('prof');

      if (Number.isFinite(idProy) && idProy > 0) {
        this.idProyecto = idProy;

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { idProyecto: idProy },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });

        this.cargarProyecto(idProy);
      } else {
        this.tituloProyecto = 'Sin proyecto asignado';
      }
    });
  }

  proyectoIdEstado: number | null = null;
  showPerfilIncompletoDialog = false;


  private cargarProyecto(idProyecto: number): void {
    this.proyectoLoaded = false;
    this.proyectoLoadedOk = false;
    this.proyectoLoadError = null;

    this.proyectosSvc.getById(idProyecto).pipe(
    ).subscribe({
      next: (p: any) => {
        console.log(p)
        if (!p || p === false) {
          this.proyectoLoaded = false;
          this.proyectoLoadedOk = false;
          this.proyectoLoadError = 'No se pudo cargar el proyecto.';
          this.tituloProyecto = 'Seguimiento';
          this.cdr.markForCheck();
          return;
        }

        // ✅ Fuente de verdad para el componente
        const pNorm = this.normalizeProyecto(p);
        this.proyectoActual = pNorm;
        // ✅ líder = estudiante creador
        const idCreador = Number((pNorm as any)?.idEstudianteCreador ?? 0);
        this.esLider = !!(this.miIdEstudiante && idCreador > 0 && this.miIdEstudiante === idCreador);


        // ✅ UI header
        this.tituloProyecto = pNorm.titulo?.trim() ? pNorm.titulo : 'Proyecto';
        this.propuestaAlumno = !!pNorm.propuestaAlumno;
        this.syncLeaderAndInvitations();


        // ✅ estado proyecto
        this.proyectoIdEstado = Number(pNorm.idEstado ?? null);
        this.proyectoCancelado = this.proyectoIdEstado === this.ESTADO_CANCELADO;
        this.syncProyectoFormDisabledState();

        this.autoRechazarInvitacionesPendientesSiCancelado();

        this.proyectoEstadoLabel = p.estadoDescripcion

        // ✅ cupo
        this.cupoProyecto = Number(pNorm.noResidentes ?? null);

        // ✅ flags de carga
        this.proyectoLoaded = true;
        this.proyectoLoadedOk = true;
        this.proyectoLoadError = null;

        // ✅ Cargar todo lo dependiente del proyecto
        this.cargarEquipo(idProyecto);
        this.cargarRevisorAnteproyecto(idProyecto);
        this.cargarDocentesReportes(idProyecto);

        // IMPORTANTÍSIMO: esto habilita auto-etapa y estados reales
        this.cargarEstadosEtapas(idProyecto);

        // si aplica invitaciones
        this.syncLeaderAndInvitations();


        // (opcional) si ocupas labels empresa/periodo en el dialog
        this.cargarCatalogosEmpresaPeriodo();

        this.cdr.markForCheck();
        this.viewState = 'ok';
      },
      error: (e) => {
        if (e?.status === 403) {

          console.log('forbitten')
          this.viewState = 'forbidden';
          return;
        }
        console.log('error')
        this.viewState = 'error';
      }

    });
  }



  private cargarEtapas(idProyecto: number): void {
    // 1) Traer proyecto (para idEstado) + relación de revisor + entregables del proyecto
    this.proyectosSvc.getById(idProyecto).subscribe({
      next: (proy: any) => {
        const idEstado = Number(proy?.idEstado ?? proy?.IdEstado ?? NaN);

        // 2) Relación revisor anteproyecto
        this.proyectosSvc.getDocenteRelacion(idProyecto, this.CLAVE_REVISOR_ANTEPROYECTO).subscribe({
          next: (rel: any) => {
            const revisorNombre = rel?.docenteNombre ?? rel?.DocenteNombre ?? null;

            // 3) Entregables del proyecto
            this.entregablesSvc.getByProyecto(idProyecto).subscribe({
              next: (entregables: any[]) => {
                const ante = (entregables ?? []).find(
                  e => Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === this.TIPO_ANTEPROYECTO
                );

                // Si NO existe entregable de anteproyecto, construimos etapas base
                const idEntregableAnte = Number(ante?.id ?? ante?.Id ?? NaN);
                if (!Number.isFinite(idEntregableAnte) || idEntregableAnte <= 0) {
                  this.etapas = this.buildEtapas({
                    idEstado,
                    revisorNombre
                  });
                  this.cdr.markForCheck();
                  return;
                }

                // 4) Traer detalle del entregable (para versionActual/fechaUltimaSubida/idEstadoEntregable)
                this.entregablesSvc.getDetalle(idEntregableAnte).subscribe({
                  next: (det) => {
                    const versiones = det?.versiones ?? [];
                    const entregable = det?.entregable ?? null;

                    const ultima = versiones.length
                      ? versiones.reduce((acc: any, v: any) =>
                        Number(v?.numeroVersion ?? v?.NumeroVersion) > Number(acc?.numeroVersion ?? acc?.NumeroVersion) ? v : acc
                        , versiones[0])
                      : null;

                    const versionActual = Number(entregable?.versionActual ?? entregable?.versionActual ?? 0) || null;
                    const fechaUltimaSubida = ultima?.fechaSubida ?? ultima?.FechaSubida ?? null;

                    // ✅ ahora el estado del entregable es ID
                    const idEstadoEntregable = Number(
                      entregable?.idEstadoEntregable ?? entregable?.idEstadoEntregable ?? NaN
                    );

                    this.etapas = this.buildEtapas({
                      idEstado,
                      revisorNombre,
                      versionActual,
                      fechaUltimaSubida,
                      idEstadoEntregable: Number.isFinite(idEstadoEntregable) ? idEstadoEntregable : null
                    });

                    this.cdr.markForCheck();
                  },
                  error: () => {
                    // Si falla detalle, igual construimos etapas con lo que sí tenemos
                    this.etapas = this.buildEtapas({ idEstado, revisorNombre });
                    this.cdr.markForCheck();
                  }
                });
              },
              error: () => {
                this.etapas = this.buildEtapas({ idEstado, revisorNombre });
                this.cdr.markForCheck();
              }
            });
          },
          error: () => {
            // sin relación
            this.etapas = this.buildEtapas({ idEstado, revisorNombre: null });
            this.cdr.markForCheck();
          }
        });
      },
      error: () => {
        // si falla proyecto, mostramos etapas mínimas
        this.etapas = this.buildEtapas({ idEstado: NaN, revisorNombre: null });
        this.cdr.markForCheck();
      }
    });
  }



  onEtapaPage(ev: any): void {
    this.etapaActivaIndex = Number(ev?.page ?? 0);
  }

  badgeText(s: EtapaEstado): string {
    switch (s) {
      case 'COMPLETADA': return 'Completada';
      case 'EN_PROCESO': return 'En proceso';
      case 'BLOQUEADA': return 'Bloqueada';
      case 'RECHAZADA': return 'Rechazada';
      default: return 'Pendiente';
    }
  }

  badgeClass(s: EtapaEstado): string {
    // Tailwind classes
    switch (s) {
      case 'COMPLETADA': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200';
      case 'EN_PROCESO': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200';
      case 'BLOQUEADA': return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
      case 'RECHAZADA': return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200';
      default: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200';
    }
  }


  private cargarInvitaciones(idProyecto: number): void {
    // ✅ Si no es propuesta alumno, no hay invitaciones
    if (!this.propuestaAlumno) {
      this.invitaciones = [];
      this.splitInvitaciones();
      return;
    }

    // ✅ Si no soy líder, NO llamamos "Enviadas" (backend normalmente lo bloquea)
    if (!this.esLider) {
      this.invitaciones = [];
      this.splitInvitaciones();
      return;
    }

    this.loadingInv = true;

    this.proyectosSvc.misInvitacionesEnviadas(idProyecto).subscribe({
      next: (rows: any) => {
        this.invitaciones = this.asArray<any>(rows);
        this.splitInvitaciones();
        this.loadingInv = false;
        this.cdr.markForCheck();
      },
      error: (e: any) => {
        console.error('Invitaciones enviadas error:', e);
        this.invitaciones = [];
        this.splitInvitaciones();
        this.loadingInv = false;
        this.cdr.markForCheck();
      }
    });
  }


  private splitInvitaciones(): void {
    const norm = (s: any) => String(s ?? '').trim().toUpperCase();

    const getNcInv = (x: any) => this.normNc(
      x?.noControlInvitado ??
      x?.NoControlInvitado ??
      x?.noControl ??
      x?.NoControl
    );

    this.invPendientes = (this.invitaciones ?? [])
      .filter(x => norm(x?.estado) === 'PENDIENTE');

    this.invAceptadas = (this.invitaciones ?? [])
      .filter(x => {
        const estado = norm(x?.estado);
        if (estado !== 'ACEPTADA' && estado !== 'ACEPTADO') return false;

        // ✅ solo mostrar como aceptada si realmente sigue en el equipo
        return this.equipoYaTiene(getNcInv(x));
      });

    this.invRechazadas = (this.invitaciones ?? [])
      .filter(x => norm(x?.estado) === 'RECHAZADA' || norm(x?.estado) === 'RECHAZADO');
  }
  invitar(): void {
    if (!this.puedeInvitar) {
      this.toast.add({ severity: 'warn', summary: 'Sin permiso', detail: 'Solo el líder puede invitar.', life: 10000 });
      return;
    }

    const nc = this.normNc(this.noControlInvitar);
    if (!nc || !this.idProyecto) return;

    if (!this.invLookupEst || this.getNcFromEst(this.invLookupEst) !== nc) {
      this.toast.add({
        severity: 'warn',
        summary: 'Verifica',
        detail: 'Confirma el No. de control (no encontré al alumno).',
        life: 10000
      });
      return;
    }

    if (this.cupoLleno()) {
      this.toast.add({ severity: 'warn', summary: 'Cupo lleno', detail: 'Ya no hay espacios en el proyecto.', life: 10000 });
      return;
    }

    if (this.equipoYaTiene(nc)) {
      this.toast.add({ severity: 'info', summary: 'Ya está', detail: 'Ese alumno ya está en el equipo.', life: 10000 });
      return;
    }

    if (this.invYaExiste(nc)) {
      this.toast.add({ severity: 'info', summary: 'Ya invitado', detail: 'Ya existe una invitación para ese alumno.', life: 10000 });
      return;
    }

    const est = this.invLookupEst;
    const idActual = Number(est?.idProyecto ?? 0);
    if (idActual > 0) {
      this.toast.add({ severity: 'warn', summary: 'No se puede', detail: 'Ese alumno ya tiene un proyecto asignado.', life: 10000 });
      return;
    }

    this.loadingInv = true;

    const body = [{ idEstudianteInvitado: Number(est.id) }];

    this.proyectosSvc.crearInvitaciones(this.idProyecto, body).pipe(
      concatMap(() => this.enviarCorreoInvitacion$(est)),
      tap((correoOk) => {
        // ✅ UN SOLO MENSAJE FINAL por operación
        if (correoOk) {
          this.toast.add({ severity: 'success', summary: 'Listo', detail: 'Invitación enviada y correo notificado.', life: 10000 });
        } else {
          this.toast.add({ severity: 'warn', summary: 'Listo', detail: 'Invitación enviada, pero el correo no pudo enviarse.', life: 10000 });
        }

        this.noControlInvitar = '';
        this.invLookupEst = null;
        this.invLookupError = null;

        this.cargarInvitaciones(this.idProyecto!);
        this.cargarEquipo(this.idProyecto!);
      }),
      catchError((e: any) => {
        console.error(e);
        const msg = typeof e?.error === 'string'
          ? e.error
          : (e?.error?.message ?? 'No se pudo crear la invitación.');
        this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 10000 });
        return of(null);
      }),
      finalize(() => {
        this.loadingInv = false;
        this.cdr.markForCheck();
      })
    ).subscribe();
  }



  private getValidacionCupoExacto(equipo: any[]): string[] {
    const cupo = Number(this.cupoProyecto ?? 0);
    if (!Number.isFinite(cupo) || cupo <= 0) return [];

    const total = Array.isArray(equipo) ? equipo.length : 0;

    if (total < cupo) {
      const faltan = cupo - total;
      return [`Faltan ${faltan} integrante(s) para completar el cupo del proyecto (${total}/${cupo}).`];
    }

    if (total > cupo) {
      const sobran = total - cupo;
      return [`Sobran ${sobran} integrante(s); el cupo del proyecto es ${cupo} y actualmente hay ${total}. Debe salir alguien del equipo para continuar.`];
    }

    return [];
  }

  private recargarProyectoEquipoYGates(): void {
    if (!this.idProyecto) return;

    this.cargarProyecto(this.idProyecto);

    if (this.activeStageIndex === 1) {
      this.validarDatosEtapa2Silencioso();
      return;
    }

    this.evaluarStage2All();
    this.cdr.markForCheck();
  }

  salirseDelProyecto(): void {
    if (!this.idProyecto) return;

    if (!this.puedeSalirseDelProyecto) {
      this.toast.add({
        severity: 'warn',
        summary: 'No disponible',
        detail: 'Solo puedes salirte del proyecto durante la etapa 1 y si no eres el líder.',
        life: 10000
      });
      return;
    }

    const ok = window.confirm('¿Seguro que deseas salirte de este proyecto?');
    if (!ok) return;

    this.leavingProject = true;

    this.proyectosSvc.salirseDelProyecto(this.idProyecto).pipe(
      finalize(() => {
        this.leavingProject = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: async () => {
        this.toast.add({
          severity: 'success',
          summary: 'Listo',
          detail: 'Saliste del proyecto correctamente.',
          life: 10000
        });

        await this.router.navigateByUrl('/repositorio', { replaceUrl: true });
      },
      error: (e: any) => {
        const detail = typeof e?.error === 'string'
          ? e.error
          : (e?.error?.message ?? 'No fue posible salir del proyecto.');

        this.toast.add({ severity: 'error', summary: 'Error', detail, life: 10000 });
      }
    });
  }

  private cupoLleno(): boolean {
    // Ajusta estos nombres según tu componente:
    const cupo = Number(
      (this as any).cupoProyecto ??
      (this as any).capacidadProyecto ??
      (this as any).proyectoCupo ??
      (this as any).proyecto?.cupo ??
      (this as any).proyecto?.capacidad ??
      0
    );

    // Si no hay cupo definido, no bloquees
    if (!cupo || cupo <= 0) return false;

    // ✅ Solo cuenta integrantes reales del proyecto (equipo)
    const integrantes = Array.isArray((this as any).equipo) ? (this as any).equipo.length : 0;

    return integrantes >= cupo;
  }


  private equipoYaTiene(nc: string): boolean {
    const up = this.normNc(nc);
    return this.equipo.some(e => this.normNc(e?.noControl ?? e?.NoControl ?? e?.no_control) === up);
  }


  private invYaExiste(nc: string): boolean {
    const n = this.normNc(nc);
    if (!n) return false;

    const inv = (this.invitaciones ?? []).find((x: any) => {
      const ncInvitado = this.normNc(
        x?.noControlInvitado ??
        x?.NoControlInvitado ??
        x?.noControl ??
        x?.NoControl
      );
      return ncInvitado === n;
    });

    if (!inv) return false;

    const estado = String(inv?.estado ?? inv?.Estado ?? '').trim().toUpperCase();

    // si fue rechazada/cancelada, sí se puede volver a invitar
    if (
      estado === 'RECHAZADO' ||
      estado === 'RECHAZADA' ||
      estado === 'RECHAZO' ||
      estado === 'CANCELADO' ||
      estado === 'CANCELADA' ||
      estado === 'CANCELACION'
    ) {
      return false;
    }

    // ✅ hotfix para datos viejos:
    // si figura aceptada pero YA NO está en el equipo, no bloquees reinvitación
    if (
      (estado === 'ACEPTADA' || estado === 'ACEPTADO') &&
      !this.equipoYaTiene(n)
    ) {
      return false;
    }

    return true;
  }


 private cargarEquipo(idProyecto: number): void {
  this.estudiantesSvc.getByProyecto(idProyecto).subscribe({
    next: (rows: any) => {
      this.equipo = this.asArray<any>(rows);
      this.splitInvitaciones();
      this.cdr.markForCheck();
    },
    error: (e) => {
      console.error('Equipo API error:', e);
      this.equipo = [];
      this.splitInvitaciones();
      this.cdr.markForCheck();
    }
  });
}



  private asArray<T>(x: any): T[] {
    if (Array.isArray(x)) return x;
    if (Array.isArray(x?.data)) return x.data;
    if (Array.isArray(x?.items)) return x.items;
    return [];
  }


  agregarIntegrante(): void {
    const nc = String(this.noControlNuevo || '').trim();
    if (!nc || !this.idProyecto) return;

    if (this.cupoProyecto && this.equipo.length >= this.cupoProyecto) {
      this.toast.add({ severity: 'warn', summary: 'Cupo lleno', detail: 'Ya no hay espacios en el proyecto.', life: 10000 });
      return;
    }

    // Evita duplicados rápidos
    const yaEnEquipo = this.equipo.some(e => String(e?.noControl ?? '').toUpperCase() === nc.toUpperCase());
    if (yaEnEquipo) {
      this.toast.add({ severity: 'info', summary: 'Ya está', detail: 'Ese No. de control ya está en el equipo.', life: 10000 });
      return;
    }

    this.agregando = true;

    this.estudiantesSvc.getByNoControl(nc).subscribe({
      next: (est: any) => {
        if (!est?.id) {
          this.toast.add({ severity: 'warn', summary: 'No encontrado', detail: 'Ese No. de control no existe en la plataforma.', life: 10000 });
          this.agregando = false;
          return;
        }

        const idProy = this.idProyecto!;
        const idActual = Number(est?.idProyecto ?? 0);
        if (idActual > 0) {
          this.toast.add({ severity: 'warn', summary: 'No se puede', detail: 'Ese alumno ya tiene un proyecto asignado.', life: 10000 });
          this.agregando = false;
          return;
        }

        const payload = this.payloadEstudianteConProyecto(est, idProy);

        this.estudiantesSvc.update(est.id, payload as any).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Listo', detail: 'Integrante agregado.', life: 10000 });
            this.noControlNuevo = '';
            this.cargarEquipo(idProy);
            this.agregando = false;
            this.cdr.markForCheck();
          },
          error: (e: any) => {
            console.error(e);
            this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo asignar el proyecto a ese alumno.', life: 10000 });
            this.agregando = false;
            this.cdr.markForCheck();
          }
        });
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo buscar por No. de control.', life: 10000 });
        this.agregando = false;
        this.cdr.markForCheck();
      }
    });
  }

  private payloadEstudianteConProyecto(est: any, idProyecto: number | null): any {
    return {
      idUsuario: est.idUsuario,
      idProyecto,

      nombre: est.nombre,
      apellidoPaterno: est.apellidoPaterno,
      apellidoMaterno: est.apellidoMaterno,

      idcarrera: est.idcarrera ?? null,
      domicilio: est.domicilio ?? null,
      ciudad: est.ciudad ?? null,
      idmunicipio: est.idmunicipio ?? null,
      noControl: est.noControl ?? null,
      correoPersonal: est.correoPersonal ?? null,
      noSeguroSocial: est.noSeguroSocial ?? null,
      idDependenciaMedica: est.idDependenciaMedica ?? null,
      telefonoCelular: est.telefonoCelular ?? null,
      idContactoEmergencia: est.idContactoEmergencia ?? null
    };
  }

  private normalizeEstado(v: any): EntregableEstado | null {
    const s = String(v ?? '').trim().toUpperCase();
    if (s === 'PENDIENTE' || s === 'EN_REVISION' || s === 'APROBADO' || s === 'RECHAZADO') return s as any;
    return null;
  }

  private buildEtapas(ctx: {
    idEstado: number;
    revisorNombre?: string | null;
    versionActual?: number | null;
    fechaUltimaSubida?: string | null;
    idEstadoEntregable?: number | null;
  }): Etapa[] {

    const idEstado = Number(ctx.idEstado ?? NaN);

    const revisorAsignado = !!(ctx.revisorNombre && String(ctx.revisorNombre).trim().length);
    const hayAnteproyectoSubido = (ctx.versionActual ?? 0) > 0;

    const entId = Number(ctx.idEstadoEntregable ?? NaN);

    // Etapa 1
    const e1: Etapa = {
      clave: 'ETAPA 1',
      titulo: 'Proyecto publicado',
      descripcion: 'El proyecto ya existe y está disponible dentro del flujo de residencia.',
      estado: Number.isFinite(idEstado) ? 'COMPLETADA' : 'EN_PROCESO',
    };

    // Etapa 2
    const e2Estado: EtapaEstado =
      hayAnteproyectoSubido ? 'COMPLETADA' : 'EN_PROCESO';

    const e2: Etapa = {
      clave: 'ETAPA 2',
      titulo: 'Entrega de anteproyecto',
      descripcion: hayAnteproyectoSubido
        ? 'Ya existe al menos una versión subida del anteproyecto.'
        : 'El alumno debe subir primero el anteproyecto para continuar con la asignación del revisor.',
      estado: e2Estado,
      extra: {
        versionActual: ctx.versionActual ?? null,
        fechaUltimaSubida: ctx.fechaUltimaSubida ?? null,
        idEstadoEntregable: Number.isFinite(entId) ? entId : null,
      }
    };

    // Etapa 3
    const e3Estado: EtapaEstado =
      revisorAsignado ? 'COMPLETADA'
        : (hayAnteproyectoSubido ? 'EN_PROCESO' : 'BLOQUEADA');

    const e3: Etapa = {
      clave: 'ETAPA 3',
      titulo: 'Asignación de revisor (Anteproyecto)',
      descripcion: revisorAsignado
        ? 'Ya hay un docente asignado como revisor del anteproyecto.'
        : (hayAnteproyectoSubido
          ? 'El anteproyecto ya fue subido. Ahora el jefe de vinculación puede asignar revisor.'
          : 'Primero debe subirse el anteproyecto.'),
      estado: e3Estado,
      extra: { revisorNombre: ctx.revisorNombre ?? null }
    };

    // Etapa 4
    let e4Estado: EtapaEstado = 'PENDIENTE';
    if (!hayAnteproyectoSubido) e4Estado = 'BLOQUEADA';
    else if (entId === this.EST_ENT_APROBADO) e4Estado = 'COMPLETADA';
    else if (entId === this.EST_ENT_RECHAZADO) e4Estado = 'RECHAZADA';
    else if (entId === this.EST_ENT_EN_REVISION || entId === this.EST_ENT_CAMBIOS) e4Estado = 'EN_PROCESO';
    else e4Estado = 'PENDIENTE';

    const e4: Etapa = {
      clave: 'ETAPA 4',
      titulo: 'Revisión y dictamen del anteproyecto',
      descripcion:
        entId === this.EST_ENT_APROBADO ? 'El anteproyecto fue aprobado.'
          : entId === this.EST_ENT_RECHAZADO ? 'El anteproyecto fue rechazado.'
            : hayAnteproyectoSubido ? 'El anteproyecto está en revisión o pendiente de dictamen.'
              : 'Aún no se ha subido un anteproyecto.',
      estado: e4Estado,
      extra: { idEstadoEntregable: Number.isFinite(entId) ? entId : null }
    };

    return [e1, e2, e3, e4];
  }

  private buildEtapasUI(entregables: any[]): EtapaUI[] {
    const byTipo = new Map<number, any>();
    (entregables ?? []).forEach(e => {
      const tipo = Number(e?.idTipoEntregable ?? e?.IdTipoEntregable ?? NaN);
      if (Number.isFinite(tipo)) byTipo.set(tipo, e);
    });

    const etapas: EtapaUI[] = this.ETAPAS_BASE.map((b) => {
      const ent = byTipo.get(b.idTipoEntregable);

      const idEnt = ent ? Number(ent?.id ?? ent?.Id ?? null) : null;
      const idEstadoEnt = ent ? Number(ent?.idEstadoEntregable ?? ent?.IdEstadoEntregable ?? null) : null;

      return {
        etapa: b.etapa,
        idTipoEntregable: b.idTipoEntregable,
        titulo: b.titulo,
        idEntregable: idEnt,
        idEstadoEntregable: Number.isFinite(idEstadoEnt as any) ? (idEstadoEnt as any) : null,
        versionActual: ent ? Number(ent?.versionActual ?? ent?.VersionActual ?? 0) : 0,
        locked: false
      };
    });

    // gating: etapa N se desbloquea si etapa N-1 está APROBADO (id=4)
    // ✅ Nuevo gating por estado del PROYECTO (>= 5)
    for (let i = 0; i < etapas.length; i++) {
      if (i === 0) { etapas[i].locked = false; continue; }
      etapas[i].locked = !this.anteproyectoPermiteEtapasPosteriores;
    }


    return etapas;
  }



  private refreshEtapasYSeleccion(): void {
    if (!this.idProyecto) return;

    this.entregablesSvc.getByProyecto(this.idProyecto).subscribe({
      next: (ents) => {
        this.etapasUI = this.buildEtapasUI(ents);

        // ✅ seleccionar la etapa "más alta" disponible automáticamente
        // const lastUnlocked = [...this.etapasUI].reverse().find(x => !x.locked) ?? this.etapasUI[0];
        // this.selectEtapa(lastUnlocked, /*silent*/ true);
        // ✅ NO auto-cambiar etapa/tipo; respeta lo que el usuario está viendo
        const tipo = this.stages[this.activeStageIndex]?.key ?? 1;
        this.selectedTipoEntregable = tipo;
        this.selectedEtapaTitulo = this.stages[this.activeStageIndex]?.label ?? 'Anteproyecto';
        this.cargarEntregablePorTipo(tipo);


        this.cdr.markForCheck();
      },
      error: (e) => {
        console.error(e);
        // si falla, al menos muestra etapa 1 seleccionada
        this.etapasUI = this.ETAPAS_BASE.map(b => ({
          etapa: b.etapa,
          idTipoEntregable: b.idTipoEntregable,
          titulo: b.titulo,
          locked: b.etapa !== 1
        }));
        this.selectEtapa(this.etapasUI[0], true);
        this.cdr.markForCheck();
      }
    });
  }

  private aplicarEtapaInicialAutomatica(): void {
  if (this.autoStageApplied) return;
  if (!this.idProyecto) return;
  if (!this.proyectoLoaded) return;
  if (!this.entregablesLoaded) return;

  // evita que corra dos veces mientras termina la validación async
  this.autoStageApplied = true;

  const abrirEtapaActual = () => {
    const targetStage = this.getEtapaActualSegunFlujo();

    this.entrarAEtapa(targetStage, {
      persist: false,
      focus: true,
      showToast: false
    });
  };

  // ✅ importante:
  // primero resuelve gates/perfil/proyecto/equipo
  // y DESPUÉS decide si abre etapa 2, 3, 4 o 5
  if (this.isTipoAprobado(1)) {
    this.validarDatosEtapa2Silencioso(() => {
      abrirEtapaActual();
    });
    return;
  }

  abrirEtapaActual();
}

  selectEtapa(et: EtapaUI, silent: boolean = false): void {
    if (et.locked) {
      if (!silent) {
        this.toast.add({
          severity: 'warn',
          summary: 'Etapa bloqueada',
          detail: `Debes aprobar la etapa anterior antes de continuar.`, life: 10000
        });
      }
      return;
    }

    this.selectedTipoEntregable = et.idTipoEntregable;
    this.selectedEtapaTitulo = et.titulo;

    // ✅ carga tabla de versiones/revisiones de esta etapa
    this.cargarEntregablePorTipo(this.selectedTipoEntregable);
  }



  /** Lee estados reales desde tu API: EntregablesService.getByProyecto */
  private cargarEstadosEtapas(idProyecto: number): void {
    this.entregablesLoaded = false;

    this.entregablesSvc.getByProyecto(idProyecto).pipe(
      catchError(() => of([]))
    ).subscribe({
      next: (rows: any[]) => {
        this.entregablesLoaded = true;
        this.evaluarRequisitosEtapas24();

        this.entregableEstadoByTipo.clear();

        for (const e of (rows ?? [])) {
          const tipo = Number((e as any)?.idTipoEntregable ?? (e as any)?.IdTipoEntregable ?? NaN);

          const idEstadoEnt = Number((e as any)?.idEstadoEntregable ?? (e as any)?.IdEstadoEntregable ?? NaN);
          const estadoClave = String((e as any)?.estadoClave ?? (e as any)?.EstadoClave ?? '').trim();
          const estadoDescripcion = String((e as any)?.estadoDescripcion ?? (e as any)?.EstadoDescripcion ?? '').trim();

          if (Number.isFinite(tipo) && tipo > 0 && Number.isFinite(idEstadoEnt) && idEstadoEnt > 0) {
            this.entregableEstadoByTipo.set(tipo, {
              idEstadoEntregable: idEstadoEnt,
              estadoClave,
              estadoDescripcion
            });
          }
        }

        this.anteEntregableEstado = this.entregableEstadoByTipo.get(this.TIPO_ANTEPROYECTO) ?? null;

        // ✅ recalcula gates globales (por si ya cargaron perfil/proyecto/equipo)
        this.evaluarStage2All();


        // ✅ aplica auto-etapa SOLO cuando ya está todo cargado
        this.aplicarEtapaInicialAutomatica();

        // si está parado en una etapa bloqueada, manda a la primera disponible
        if (!this.canEnterStage(this.activeStageIndex)) {
          this.activeStageIndex = this.firstUnlockedStageIndex();
        }

        this.cdr.markForCheck();
      },
      error: () => {
        this.entregablesLoaded = true;
        this.evaluarRequisitosEtapas24();

        this.entregableEstadoByTipo.clear();
        this.anteEntregableEstado = null;
        this.activeStageIndex = 0;
        this.cdr.markForCheck();
      }
    });
  }



  /** Trae el revisor asignado al anteproyecto desde tu ProyectosService */
  private cargarRevisorAnteproyecto(idProyecto: number): void {
    this.proyectosSvc.getDocenteRelacion(idProyecto, 'REVISOR_ANTEPROYECTO').subscribe({
      next: (r: any) => {
        this.revisorAnteproyectoNombre = r?.docenteNombre ?? r?.DocenteNombre ?? null;

        // intentamos varias llaves comunes
        this.revisorAnteproyectoEmail =
          r?.docenteEmail ??
          r?.DocenteEmail ??
          r?.correo ??
          r?.Correo ??
          r?.email ??
          r?.Email ??
          null;

        // normaliza
        this.revisorAnteproyectoEmail = String(this.revisorAnteproyectoEmail ?? '').trim() || null;

        this.cdr.markForCheck();
      },
      error: () => {
        this.revisorAnteproyectoNombre = null;
        this.revisorAnteproyectoEmail = null;
        this.cdr.markForCheck();
      }
    });
  }


  /**
   * ✅ Etapas 2-4: nombres de asesor interno y revisores.
   * Solo UI; los permisos reales deben validarse en backend.
   */
  private cargarDocentesReportes(idProyecto: number): void {
    forkJoin({
      asesor: this.proyectosSvc.getDocenteRelacion(idProyecto, 'ASESOR_INTERNO').pipe(catchError(() => of(null))),
      revRes: this.proyectosSvc.getDocenteRelacion(idProyecto, 'REVISOR_RESIDENCIA').pipe(catchError(() => of(null))),
      // Puede no existir todavía
      revProy: this.proyectosSvc.getDocenteRelacion(idProyecto, 'REVISOR_PROYECTO').pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ asesor, revRes, revProy }) => {
        this.asesorInternoNombre = asesor?.docenteNombre ?? asesor?.DocenteNombre ?? null;
        this.revisorResidenciaNombre = revRes?.docenteNombre ?? revRes?.DocenteNombre ?? null;
        this.revisorProyectoNombre = revProy?.docenteNombre ?? revProy?.DocenteNombre ?? null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.asesorInternoNombre = null;
        this.revisorResidenciaNombre = null;
        this.revisorProyectoNombre = null;
        this.cdr.markForCheck();
      }
    });
  }


  /** Para mostrar en UI */
  estadoEtapaLabel(tipoEntregable: number): string {
    const s = this.entregableEstadoByTipo.get(tipoEntregable);

    if (!s) return 'Pendiente';

    // Si tienes descripcion, úsala (es lo ideal para UI)
    if (s.estadoDescripcion?.trim()) return s.estadoDescripcion;

    // fallback por ID
    switch (s.idEstadoEntregable) {
      case this.EST_ENT_APROBADO: return 'Aprobado';
      case this.EST_ENT_RECHAZADO: return 'Rechazado';
      case this.EST_ENT_EN_REVISION: return 'En revisión';
      case this.EST_ENT_CAMBIOS: return 'Cambios solicitados';
      case this.EST_ENT_CANCELADO: return 'Cancelado';
      default: return 'Pendiente';
    }
  }

  /** Regla de desbloqueo: etapa N requiere etapa anterior APROBADO */
  isTipoAprobado(tipo: number): boolean {
    const raw: any = this.entregableEstadoByTipo?.get?.(tipo);

    // Si aún no hay estados cargados
    if (!raw) return false;

    // Caso: viene como texto
    if (typeof raw === 'string') {
      const est = raw.trim().toUpperCase();
      return est === 'ACEPTADO' || est === 'APROBADO' || est === 'APROBADA';
    }

    // Caso: viene como número (id de estado)
    if (typeof raw === 'number') {
      return raw === this.EST_ENT_APROBADO; // 4
    }

    // ✅ Caso: viene como objeto (tu caso real)
    // Tu Map guarda: { idEstadoEntregable, estadoClave, estadoDescripcion }
    if (typeof raw === 'object') {
      const idEstado = Number(raw?.idEstadoEntregable ?? raw?.IdEstadoEntregable ?? 0);
      if (idEstado > 0) return idEstado === this.EST_ENT_APROBADO; // 4

      // Fallback por texto si no vino el id
      const clave = String(raw?.estadoClave ?? raw?.EstadoClave ?? '').trim().toUpperCase();
      const desc = String(raw?.estadoDescripcion ?? raw?.EstadoDescripcion ?? '').trim().toUpperCase();
      return clave === 'APROBADO' || clave === 'ACEPTADO' || desc === 'APROBADO' || desc === 'ACEPTADO';
    }

    return false;
  }

  /**
   * ✅ “Cerrado” = ya no se permite subir más archivos.
   * En reportes (2/3/4) normalmente solo aplica cuando el estado maestro está APROBADO.
   */
  isTipoCerrado(tipo: number): boolean {
    const raw: any = this.entregableEstadoByTipo?.get?.(tipo);
    if (!raw) return false;

    const idEstado = Number(raw?.idEstadoEntregable ?? raw?.IdEstadoEntregable ?? 0);
    const clave = String(raw?.estadoClave ?? raw?.EstadoClave ?? '').trim().toUpperCase();
    const desc = String(raw?.estadoDescripcion ?? raw?.EstadoDescripcion ?? '').trim().toUpperCase();

    // IDs típicos: 4=APROBADO. (Si tu catálogo agrega RECHAZADO/CANCELADO, también lo cerramos.)
    if (idEstado === 4) return true;
    if ([5, 6].includes(idEstado)) return true;

    // fallback por texto
    return clave.includes('APROB') || clave.includes('RECHAZ') || clave.includes('CANCEL')
      || desc.includes('APROB') || desc.includes('RECHAZ') || desc.includes('CANCEL');
  }



  canEnterStage(stageIndex: number): boolean {
    if (stageIndex <= 0) return true;
    if (this.proyectoCancelado) return false;

    // Etapa 2: anteproyecto aprobado
    if (stageIndex === 1) {
      return this.isTipoAprobado(1);
    }

    // Etapa 3: RP1 aprobado + gates completos
    if (stageIndex === 2) {
      return this.isTipoAprobado(1) && this.isTipoAprobado(2) && this.stage2ReadyAll;
    }

    // Etapa 4: RP2 aprobado + gates completos
    if (stageIndex === 3) {
      return this.isTipoAprobado(1) && this.isTipoAprobado(2) && this.isTipoAprobado(3) && this.stage2ReadyAll;
    }

    // Etapa 5: Reporte final aprobado
    if (stageIndex === 4) {
      return this.isTipoAprobado(1)
        && this.isTipoAprobado(2)
        && this.isTipoAprobado(3)
        && this.isTipoAprobado(4)
        && this.stage2ReadyAll;
    }

    return false;
  }


  stageLockReason(stageIndex: number): string | null {
    if (stageIndex <= 0) return null;
    if (this.proyectoCancelado) return 'El proyecto está cancelado.';

    const anteOk = this.isTipoAprobado(1);
    const proyectoOk = !this.proyectoIncompleto;
    const perfilOk = (this.perfilFaltantes?.length ?? 0) === 0;
    const integrantesOk = (this.integrantesFaltantes?.length ?? 0) === 0;
    const cupoMsg = this.mensajeCupoProyecto;

    if (stageIndex === 1) {
      if (!anteOk) return 'El anteproyecto aún no está aprobado.';
      if (!proyectoOk) return 'Faltan datos del proyecto para continuar a la Etapa 2.';
      if (!perfilOk) return 'Faltan datos completos en el perfil del estudiante.';
      if (cupoMsg) return cupoMsg;
      if (!integrantesOk) return 'Hay integrantes sin usuario asociado o sin correo institucional.';
      return null;
    }

    if (stageIndex === 2) {
      if (!anteOk) return 'El anteproyecto aún no está aprobado.';
      if (!this.isTipoAprobado(2)) return 'La Etapa 2 aún no está aprobada.';
      if (!proyectoOk) return 'Faltan datos del proyecto.';
      if (!perfilOk) return 'Faltan datos del perfil.';
      if (cupoMsg) return cupoMsg;
      if (!integrantesOk) return 'Hay integrantes con datos incompletos.';
      return null;
    }

    if (stageIndex === 3) {
      if (!anteOk) return 'El anteproyecto aún no está aprobado.';
      if (!this.isTipoAprobado(2)) return 'La Etapa 2 aún no está aprobada.';
      if (!this.isTipoAprobado(3)) return 'La Etapa 3 aún no está aprobada.';
      if (!proyectoOk) return 'Faltan datos del proyecto.';
      if (!perfilOk) return 'Faltan datos del perfil.';
      if (cupoMsg) return cupoMsg;
      if (!integrantesOk) return 'Hay integrantes con datos incompletos.';
      return null;
    }

    if (stageIndex === 4) {
      if (!anteOk) return 'El anteproyecto aún no está aprobado.';
      if (!this.isTipoAprobado(2)) return 'La Etapa 2 aún no está aprobada.';
      if (!this.isTipoAprobado(3)) return 'La Etapa 3 aún no está aprobada.';
      if (!this.isTipoAprobado(4)) return 'El reporte final aún no está aprobado.';
      if (!proyectoOk) return 'Faltan datos del proyecto.';
      if (!perfilOk) return 'Faltan datos del perfil.';
      if (cupoMsg) return cupoMsg;
      if (!integrantesOk) return 'Hay integrantes con datos incompletos.';
      return null;
    }

    return 'Bloqueado.';
  }



  lockedMessageForStage(stageIndex: number): string {
    return this.canEnterStage(stageIndex)
      ? '✅ Etapa disponible.'
      : (this.stageLockReason(stageIndex) ?? 'Bloqueado.');
  }

  private parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();

  // Fechas tipo 2026-03-10 o 2026-03-10T00:00:00Z:
  // las convertimos a fecha local para evitar corrimiento por timezone
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00(?:\.000)?(?:Z)?)$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return new Date(y, mo, d, 12, 0, 0, 0);
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

  private addWeeks(date: Date, weeks: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + (weeks * 7));
    return d;
  }

  private getFechaPrimeraSubidaPorTipo(tipo: number): Date | null {
    const rows = this.getEntregablesPorTipo(tipo) ?? [];
    const fechas = rows
      .map(r => this.parseDate((r as any)?.fechaSubida))
      .filter(Boolean) as Date[];

    if (!fechas.length) return null;

    fechas.sort((a, b) => a.getTime() - b.getTime()); // más antigua primero
    return fechas[0];
  }

  private computeFechaAprobacionPorTipo(tipo: number): Date | null {
  const rows = this.getEntregablesPorTipo(tipo) ?? [];

  const isAceptado = (r: any) => {
    const dict = String(r?.ultimoDictamen ?? '').trim().toUpperCase();
    const vis = String(r?.estadoVisible ?? '').trim().toUpperCase();
    return dict === 'ACEPTADO' || dict === 'APROBADO' || vis === 'ACEPTADO' || vis === 'APROBADO';
  };

  const pickLatest = (arr: any[]): Date | null => {
    const fechas = (arr ?? [])
      .map(r => this.parseDate(r?.fechaUltimaRevision) ?? this.parseDate(r?.fechaSubida))
      .filter(Boolean) as Date[];

    if (!fechas.length) return null;
    fechas.sort((a, b) => b.getTime() - a.getTime());
    return fechas[0];
  };

  const aceptadas = rows.filter(isAceptado);
  return pickLatest(aceptadas) ?? null;
}

private computeFechaAprobacionAnteproyecto(): Date | null {
  return this.computeFechaAprobacionPorTipo(1);
}

  private computeFechaFinPeriodoAcademico(): Date | null {
    const p: any = this.periodoActualDto;
    const raw =
      p?.fechaFin ?? p?.FechaFin ??
      p?.fechaFinPeriodo ?? p?.FechaFinPeriodo ??
      p?.fin ?? p?.Fin ??
      p?.fechaTermino ?? p?.FechaTermino ??
      null;

    return this.parseDate(raw);
  }

  private recalcularFechasEtapas(): void {
  // 1) Anteproyecto aprobado
  this.fechaAnteproyectoAprobado = this.computeFechaAprobacionAnteproyecto();

  // 2) RP1 = 6 semanas después de aprobar anteproyecto
  this.fechaProgramadaRp1 = this.fechaAnteproyectoAprobado
    ? this.addWeeks(this.fechaAnteproyectoAprobado, 6)
    : null;

  // 3) RP2 = 12 semanas después de aprobar anteproyecto
  //    (equivale a 6 semanas después de la fecha programada del RP1)
  this.fechaProgramadaRp2 = this.fechaAnteproyectoAprobado
    ? this.addWeeks(this.fechaAnteproyectoAprobado, 12)
    : null;

  // 4) Reporte final = fin del período académico
  this.fechaFinPeriodoAcademico = this.computeFechaFinPeriodoAcademico();
}


  private firstUnlockedStageIndex(): number {
    for (let i = 0; i < this.stages.length; i++) {
      if (this.canEnterStage(i)) return i;
    }
    return 0;
  }

  private getEtapaActualSegunFlujo(): number {
  // La más alta disponible según el flujo real
  if (this.canEnterStage(4)) return 4; // cierre documental
  if (this.canEnterStage(3)) return 3; // reporte final
  if (this.canEnterStage(2)) return 2; // RP2
  if (this.canEnterStage(1)) return 1; // RP1
  return 0; // anteproyecto
}

  goToStage(i: number): void {
  if (!this.canEnterStage(i)) {
    this.toast.add({
      severity: 'warn',
      summary: 'Etapa bloqueada',
      detail: this.stageLockReason(i) ?? 'No puedes acceder a esta etapa.',
      life: 9000
    });
    return;
  }

  this.entrarAEtapa(i, {
    persist: true,
    focus: true,
    showToast: false
  });
}



  prevStage(): void {
  const target = Math.max(0, this.activeStageIndex - 1);
  this.goToStage(target);
}

nextStage(): void {
  const target = Math.min(this.stages.length - 1, this.activeStageIndex + 1);
  this.goToStage(target);
}


  cargarEntregablePorTipo(idTipoEntregable: number, showToast: boolean = true): void {
  const requestId = ++this.currentEntregableRequest;

  if (!this.idProyecto) {
    this.documentos = [];
    this.recalcularFechasEtapas();
    return;
  }

  this.loading = true;

  this.entregablesSvc.getByProyecto(this.idProyecto).subscribe({
    next: (entregables) => {
      if (requestId !== this.currentEntregableRequest) return;

      const ent = (entregables ?? []).find((e: any) =>
        Number(e?.idTipoEntregable ?? e?.IdTipoEntregable) === Number(idTipoEntregable)
      );

      if (!ent) {
        this.setEntregablesPorTipo(idTipoEntregable, []);

        const tipoActual = this.stages[this.activeStageIndex]?.key ?? 1;
        if (Number(tipoActual) === Number(idTipoEntregable)) {
          this.documentos = [];
        }

        this.loading = false;
        this.recalcularFechasEtapas();
        this.cdr.markForCheck();
        return;
      }

      const idEntregable = Number(ent?.id ?? 0);
      if (!idEntregable) {
        this.setEntregablesPorTipo(idTipoEntregable, []);

        const tipoActual = this.stages[this.activeStageIndex]?.key ?? 1;
        if (Number(tipoActual) === Number(idTipoEntregable)) {
          this.documentos = [];
        }

        this.loading = false;
        this.recalcularFechasEtapas();
        this.cdr.markForCheck();
        return;
      }

      this.entregablesSvc.getDetalle(idEntregable).subscribe({
        next: (det: EntregableDetalleDto) => {
          if (requestId !== this.currentEntregableRequest) return;

          const versiones: any[] = (det as any)?.versiones ?? [];
          const revisiones: any[] = (det as any)?.revisiones ?? [];

          const cab = (det as any)?.entregable;
          const idEstadoEntregable = Number(cab?.idEstadoEntregable ?? cab?.IdEstadoEntregable ?? NaN);

          const estadoClave = String(cab?.estadoClave ?? cab?.EstadoClave ?? '').trim();
          const estadoDescripcion = String(cab?.estadoDescripcion ?? cab?.EstadoDescripcion ?? '').trim();

          this.entregableEstadoByTipo.set(idTipoEntregable, {
            idEstadoEntregable: Number.isFinite(idEstadoEntregable) ? idEstadoEntregable : this.EST_ENT_PENDIENTE,
            estadoClave,
            estadoDescripcion
          });

          this.anteEntregableEstado = this.entregableEstadoByTipo.get(this.TIPO_ANTEPROYECTO) ?? null;
          this.evaluarStage2All();

          const docs: AnteproyectoRow[] = versiones
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

              return {
                idVersion: idVer,
                idEntregable: Number(v?.idEntregable ?? v?.IdEntregable ?? idEntregable),
                numeroVersion: Number(v?.numeroVersion ?? v?.NumeroVersion ?? 0),
                fechaSubida: v?.fechaSubida ?? v?.FechaSubida,
                nombreOriginal: v?.nombreOriginal ?? v?.NombreOriginal,
                tamanoBytes: Number(v?.tamanoBytes ?? v?.TamanoBytes ?? 0),

                idEstudianteSubio: v?.idEstudianteSubio ?? v?.IdEstudianteSubio ?? null,
                subidoPor: (v as any)?.subidoPor ?? (v as any)?.SubidoPor ?? null,

                totalRevisiones: revsV.length,

                ultimoDictamen,
                ultimaObs: last ? String(last?.observaciones ?? last?.Observaciones ?? '').trim() : null,
                fechaUltimaRevision: last ? (last?.fechaRevision ?? last?.FechaRevision ?? null) : null,

                estadoVisible: this.estadoVisiblePorVersion({
                  totalRevisiones: revsV.length,
                  ultimoDictamen
                }),
              } as AnteproyectoRow;
            });

          this.setEntregablesPorTipo(idTipoEntregable, docs);

          const tipoActual = this.stages[this.activeStageIndex]?.key ?? 1;
          if (Number(tipoActual) === Number(idTipoEntregable)) {
            this.selectedTipoEntregable = tipoActual;
            this.selectedEtapaTitulo = this.stages[this.activeStageIndex]?.label ?? 'Etapa';
            this.documentos = docs;
          }

          this.loading = false;
          this.recalcularFechasEtapas();
          this.cdr.markForCheck();
        },
        error: (e) => {
          if (requestId !== this.currentEntregableRequest) return;

          console.error(e);

          this.setEntregablesPorTipo(idTipoEntregable, []);

          const tipoActual = this.stages[this.activeStageIndex]?.key ?? 1;
          if (Number(tipoActual) === Number(idTipoEntregable)) {
            this.documentos = [];
          }

          this.loading = false;

          if (showToast) {
            this.toast.add({
              severity: 'error',
              summary: 'Error',
              detail: 'No se pudo cargar el detalle del entregable.',
              life: 10000
            });
          }

          this.recalcularFechasEtapas();
          this.cdr.markForCheck();
        }
      });
    },
    error: (e) => {
      if (requestId !== this.currentEntregableRequest) return;

      console.error(e);

      this.setEntregablesPorTipo(idTipoEntregable, []);

      const tipoActual = this.stages[this.activeStageIndex]?.key ?? 1;
      if (Number(tipoActual) === Number(idTipoEntregable)) {
        this.documentos = [];
      }

      this.loading = false;

      if (showToast) {
        this.toast.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron consultar entregables del proyecto.',
          life: 10000
        });
      }

      this.recalcularFechasEtapas();
      this.cdr.markForCheck();
    }
  });
}

  private pickFilesFromEvent(event: any): File[] {
    const raw =
      event?.files ??
      event?.currentFiles ??
      event?.originalEvent?.target?.files ??
      [];

    // raw puede ser File[] o FileList
    return Array.isArray(raw) ? raw : Array.from(raw as FileList);
  }

  onSelectFilesEtapa(event: any): void {
    this.selectedFilesEtapa = this.pickFilesFromEvent(event);
    this.cdr.markForCheck();
  }

  onClearFilesEtapa(): void {
    this.selectedFilesEtapa = [];
    this.cdr.markForCheck();
  }

  onSelectFile(event: any): void {
    const file = event?.files?.[0] as File | undefined;
    this.selectedFile = file ?? null;

    if (!this.selectedFile) return;

    const name = (this.selectedFile.name || '').toLowerCase();
    const ok = name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx');

    if (!ok) {
      this.toast.add({
        severity: 'warn',
        summary: 'Formato no permitido',
        detail: 'Solo se permite PDF, DOC o DOCX en esta etapa.',
        life: 10000
      });
      this.selectedFile = null;
      this.fu?.clear();
    }

    this.cdr.markForCheck();
  }

  abrirArchivo(row: any): void {
    const nombre = String(row?.nombreOriginal ?? '').toLowerCase();
    const esPdf = nombre.endsWith('.pdf');

    if (esPdf) {
      this.verEntregable(row); // tu visor PDF actual
    } else {
      this.descargarEntregable(row); // descarga
    }
  }


  descargarEntregable(row: any): void {
    const idVersion = Number(row?.idVersion ?? row?.id ?? NaN);
    if (!Number.isFinite(idVersion) || idVersion <= 0) {
      this.toast.add({ severity: 'warn', summary: 'Error', detail: 'Versión inválida.', life: 8000 });
      return;
    }

    this.entregablesSvc.downloadVersion(idVersion).subscribe({
      next: (blob) => {
        const nombre = String(row?.nombreOriginal ?? row?.NombreOriginal ?? 'archivo').trim() || 'archivo';
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.click();

        setTimeout(() => window.URL.revokeObjectURL(url), 500);
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar el archivo.', life: 10000 });
      }
    });
  }

  private evaluarStage2All(): void {
    const eq = this.asArray<any>(this.equipo);

    this.evaluarStage2All$(eq).subscribe({
      next: () => this.cdr.markForCheck(),
      error: () => {
        this.stage2ReadyAll = false;
        this.stage2Ready = false;
        this.cdr.markForCheck();
      }
    });
  }

  private evaluarStage2All$(equipo: any[]): Observable<boolean> {
    // Reglas para permitir Etapa 2+:
    const anteOk = this.isTipoAprobado(1);

    const perfilOk = !(this.perfilIncompleto || (this.perfilFaltantes?.length ?? 0) > 0);
    const proyectoOk = !(this.proyectoIncompleto || (this.proyectoFaltantes?.length ?? 0) > 0);

    return this.validarIntegrantesProyecto$(equipo).pipe(
      tap((faltantes: string[]) => {
        this.integrantesFaltantes = faltantes;

        const integrantesOk = faltantes.length === 0;

        this.stage2ReadyAll = anteOk && perfilOk && proyectoOk && integrantesOk;
        this.stage2Ready = this.stage2ReadyAll;

        this.cdr.markForCheck();
      }),
      map(() => this.stage2ReadyAll),
      catchError(() => {
        this.integrantesFaltantes = ['Error al validar integrantes.'];
        this.stage2ReadyAll = false;
        this.stage2Ready = false;
        this.cdr.markForCheck();
        return of(false);
      })
    );
  }

  private getMiIdEstudiante$() {
    const u: any = this.auth.getUser();
    const idUsuario = Number(u?.id ?? u?.userId ?? u?.sub ?? NaN);

    if (!Number.isFinite(idUsuario) || idUsuario <= 0) return of(null);

    return this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(
      map((est: any) => Number(est?.id ?? NaN)),
      map(id => (Number.isFinite(id) && id > 0) ? id : null),
      catchError(() => of(null))
    );
  }

  private ensureEntregableId$(idProyecto: number, tipo: number, idEstudiante: number) {
    return this.entregablesSvc.getByProyecto(idProyecto).pipe(
      map((ents: any[]) => (ents ?? []).find(e => Number(e.idTipoEntregable) === Number(tipo))),
      switchMap((ent: any) => {
        if (ent?.id) return of(Number(ent.id));
        return this.entregablesSvc.create({
          idProyecto,
          idTipoEntregable: tipo,
          idEstudianteAutor: idEstudiante
        }).pipe(map((r: any) => Number(r?.id ?? NaN)));
      })
    );
  }

  subirEtapaLote(etapa: 2 | 3 | 4): void {
    if (!this.idProyecto) {
      this.toast.add({ severity: 'warn', summary: 'Sin proyecto', detail: 'No se detectó proyecto.', life: 10000 });
      return;
    }

    // Etapa 2/3/4 requiere desbloqueo
    const stageIndex = etapa - 1; // etapa2->1, etapa3->2, etapa4->3
    if (!this.canEnterStage(stageIndex)) {
      this.toast.add({ severity: 'warn', summary: 'Etapa bloqueada', detail: this.stageLockReason(stageIndex) ?? 'Bloqueado.', life: 10000 });
      return;
    }

    // ── Validación de fecha límite ──────────────────────────────────────────
    if (etapa === 2 || etapa === 3) {
      if (this.esFechaVencidaEtapa(etapa)) {
        const dias = Math.abs(this.diasRestantesEtapa(etapa) ?? 0);
        this.toast.add({
          severity: 'error',
          summary: 'Fecha límite vencida',
          detail: `La fecha límite para subir este reporte venció hace ${dias} día(s). Contacta a tu coordinador.`,
          life: 12000
        });
        return;
      }
    }

    if (!this.selectedFilesEtapa?.length) {
      this.toast.add({ severity: 'warn', summary: 'Faltan archivos', detail: 'Selecciona uno o más archivos.', life: 10000 });
      return;
    }

    // Solo estudiantes suben
    if (this.esDocente) {
      this.toast.add({ severity: 'warn', summary: 'Sin permiso', detail: 'El docente no sube archivos, solo revisa.', life: 10000 });
      return;
    }

    this.evaluarRequisitosEtapas24();
    if (!this.stage2ReadyAll) {
      this.toast.add({
        severity: 'warn',
        summary: 'Requisitos incompletos',
        detail: 'Completa datos del proyecto, del perfil y de los integrantes antes de subir.',
        life: 9000
      });
      return;
    }

    const filesUI = Array.isArray(this.selectedFilesEtapa) ? this.selectedFilesEtapa : [];
    const filesFU = Array.isArray(this.fuEtapa?.files) ? this.fuEtapa!.files : [];
    const files = filesUI.length ? filesUI : filesFU;

    if (!files.length) {
      this.toast.add({ severity: 'warn', summary: 'Faltan archivos', detail: 'Selecciona uno o más archivos.', life: 7000 });
      return;
    }


    const tipoEntregable = etapa; // 2,3,4 coinciden con tu tabla

    this.loading = true;

    this.getMiIdEstudiante$().pipe(
      switchMap((idEst) => {
        if (!idEst) {
          this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo detectar tu ID de estudiante.', life: 10000 });
          return of(null);
        }

        return this.ensureEntregableId$(this.idProyecto!, tipoEntregable, idEst).pipe(
          switchMap((idEntregable) => {
            if (!Number.isFinite(idEntregable) || idEntregable <= 0) {
              this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear/obtener el entregable.', life: 10000 });
              return of(null);
            }

            // Subir uno por uno
            const files = [...this.selectedFilesEtapa];
            return of({ idEst, idEntregable, files });
          })
        );
      }),
      switchMap((ctx: any) => {
        if (!ctx) return of(null);

        const { idEst, idEntregable } = ctx;

        const files: File[] = Array.isArray(this.selectedFilesEtapa)
          ? (this.selectedFilesEtapa as File[])
          : [];

        return from(files).pipe(
          concatMap((f: File) => this.entregablesSvc.uploadVersion(idEntregable, idEst, f))
        );

      }),
      finalize(() => {
        this.loading = false;
        this.selectedFilesEtapa = [];
        this.fuEtapa?.clear();   // <-- importante
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: () => {
        // ⚠️ Ojo: este next se dispara por cada upload; evitamos múltiples toasts con una bandera
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron subir todos los archivos.', life: 10000 });
      },
      complete: () => {
        // ✅ 1 solo toast por operación
        this.toast.add({ severity: 'success', summary: 'OK', detail: 'Archivos subidos correctamente.', life: 10000 });

        // Recargar historial del tipo actual
        this.selectedTipoEntregable = tipoEntregable;
        this.cargarEntregablePorTipo(tipoEntregable, false);
        this.refreshEtapasYSeleccion();

        // ✅ correo al revisor (institucional)
        this.notificarRevisorEtapaSubida(etapa);
      }
    });
  }

  private notificarRevisorEtapaSubida(etapa: number): void {
    const correo = String(this.revisorAnteproyectoEmail ?? '').trim();
    if (!correo) return;

    const titulo = String(this.proyectoActual?.titulo ?? 'Proyecto').trim();
    const tema = `Etapa ${etapa}: archivos subidos`;
    const cuerpo = `
    <div style="font-family: Arial, sans-serif;">
      <p>Hola,</p>
      <p>Se han subido archivos para la <b>Etapa ${etapa}</b> del proyecto:</p>
      <p><b>${titulo}</b></p>
      <p>Ingresa al sistema para revisarlos y emitir dictamen.</p>
      <p style="color:#666;font-size:12px;">Correo automático.</p>
    </div>
  `;

    this.emailSvc.sendEmail(correo, tema, cuerpo).subscribe({
      next: () => { },
      error: (e) => console.error('No se pudo enviar correo al revisor', e)
    });
  }


  subir(): void {
    if (!this.puedeSubirAnteproyecto) {
      this.toast.add({
        severity: 'warn',
        summary: 'Sin permiso',
        detail: this.esDocente
          ? 'El docente no sube documentos, solo revisa.'
          : 'Necesitas estar dentro del equipo para subir.', life: 10000
      });
      return;


    }

    if (!this.proyectoPermiteSubirAnteproyecto) {
      this.toast.add({
        severity: 'info',
        summary: 'No permitido',
        detail: 'El proyecto ya no se encuentra en una etapa válida para subir el anteproyecto.', life: 10000
      });
      return;
    }

    // ✅ El revisor asignado NO bloquea la "subida".
    // Solo bloquea el "reemplazo" (eso ya lo controlas en onSelectFileReemplazo()).
    if (!this.puedeSubirAnteproyectoSegunFlujo) {
      this.toast.add({
        severity: 'warn',
        summary: 'No permitido',
        detail: this.motivoBloqueoSubidaAnte ?? 'No puedes subir anteproyecto en este momento.',
        life: 10000
      });
      return;
    }




    if (!this.selectedFile) {
      this.toast.add({ severity: 'warn', summary: 'Falta archivo', detail: 'Selecciona un archivo primero.', life: 10000 });
      return;
    }

    if (!this.idProyecto) {
      this.toast.add({ severity: 'warn', summary: 'Sin proyecto', detail: 'No se detectó proyecto.', life: 10000 });
      return;
    }

    // Necesitamos idEstudiante (quién sube)
    const u: any = this.auth.getUser();
    const idUsuario = Number(u?.id ?? u?.userId ?? u?.sub ?? NaN);

    this.loading = true;

    // Buscar mi estudiante para obtener idEstudiante
    this.estudiantesSvc.getByIdUsuario(idUsuario).subscribe({
      next: (est: any) => {
        const idEstudiante = Number(est?.id ?? NaN);
        if (!Number.isFinite(idEstudiante) || idEstudiante <= 0) {
          this.loading = false;
          this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo detectar tu ID de estudiante.', life: 10000 });
          this.cdr.markForCheck();
          return;
        }

        // 1) Obtener/crear cabecera Anteproyecto
        this.entregablesSvc.getByProyecto(this.idProyecto!).subscribe({
          next: (ents) => {
            const tipo = this.selectedTipoEntregable;
            const ante = (ents ?? []).find(e => Number(e.idTipoEntregable) === Number(tipo));

            const ensureEntregable$ = ante
              ? of({ id: ante.id })
              : this.entregablesSvc.create({
                idProyecto: this.idProyecto!,
                idTipoEntregable: tipo,
                idEstudianteAutor: idEstudiante
              });

            ensureEntregable$.subscribe({
              next: (createdOrExisting: any) => {
                const idEntregable = Number(createdOrExisting?.id ?? ante?.id ?? NaN);
                if (!Number.isFinite(idEntregable) || idEntregable <= 0) {
                  this.loading = false;
                  this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear/obtener el entregable.', life: 10000 });
                  this.cdr.markForCheck();
                  return;
                }

                // 2) Subir versión
                this.entregablesSvc.uploadVersion(idEntregable, idEstudiante, this.selectedFile!).pipe(
                  switchMap(() => this.notificarRevisorAnteproyecto$(this.selectedFile?.name ?? 'anteproyecto.pdf'))
                ).subscribe({
                  next: (correoEnviado: boolean) => {
                    const detalleSubida = correoEnviado
                      ? 'Versión del anteproyecto subida. Se notificó al revisor.'
                      : (this.revisorAnteproyectoAsignado
                        ? 'Versión del anteproyecto subida. No se pudo notificar al revisor.'
                        : 'Versión del anteproyecto subida. Ahora el jefe de vinculación ya puede asignar revisor.');

                    this.toast.add({
                      severity: 'success',
                      summary: 'OK',
                      detail: detalleSubida,
                      life: 10000
                    });

                    this.selectedFile = null;
                    this.fu?.clear();
                    this.loading = false;

                    // ✅ ya hubo toast de éxito, recarga silenciosa
                    this.cargarEntregablePorTipo(this.selectedTipoEntregable, false);
                    this.refreshEtapasYSeleccion();
                    this.cdr.markForCheck();
                  },
                  error: (e) => {
                    console.error(e);
                    this.loading = false;
                    this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo subir la versión.', life: 10000 });
                    this.cdr.markForCheck();
                  }
                });

              },
              error: (e) => {
                console.error(e);
                this.loading = false;
                this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear el entregable.', life: 10000 });
                this.cdr.markForCheck();
              }
            });
          },
          error: (e) => {
            console.error(e);
            this.loading = false;
            this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron consultar entregables.', life: 10000 });
            this.cdr.markForCheck();
          }
        });
      },
      error: (e: any) => {
        console.error(e);
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo obtener tu estudiante.', life: 10000 });
        this.cdr.markForCheck();
      }
    });
  }
  private cargarMiContextoUsuario(): void {
    const u: any = this.auth.getUser();
    const idUsuario = Number(u?.id ?? u?.userId ?? u?.sub ?? NaN);

    // rol docente
    const rol = String(u?.rol ?? u?.role ?? u?.tipo ?? '').toLowerCase();
    this.esDocente = rol.includes('docente') || rol.includes('prof');

    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      this.miNoControl = null;
      this.miIdEstudiante = null;
      return;
    }

    this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(
      catchError(() => of(false))
    ).subscribe((est: any) => {
      if (!est || est === false) {
        this.miNoControl = null;
        this.miIdEstudiante = null;

        this.syncLeaderAndInvitations();

        this.cdr.markForCheck();
        return;
      }

      this.miNoControl = String(est?.noControl ?? est?.NoControl ?? '').trim() || null;
      this.miIdEstudiante = Number(est?.id ?? est?.Id ?? null) || null;

      // ✅ recalcular líder si ya tenemos proyecto cargado
      if (this.proyectoActual) {
        const idCreador = Number((this.proyectoActual as any)?.idEstudianteCreador ?? 0);
        this.esLider = !!(this.miIdEstudiante && idCreador > 0 && this.miIdEstudiante === idCreador);
      }

      this.cdr.markForCheck();
    });
  }




  verObservaciones(row: any): void {
    this.obsDoc = row;
    this.obsRevisiones = [];
    this.showObsDialog = true;
    this.obsLoading = true;

    const idVersion = Number(row?.idVersion ?? NaN);
    const idEntregable = Number(row?.idEntregable ?? NaN);

    if (!Number.isFinite(idVersion) || !Number.isFinite(idEntregable)) {
      this.obsLoading = false;
      return;
    }

    this.entregablesSvc.getDetalle(idEntregable).subscribe({
      next: (det) => {
        const revs: RevisionAnteproyecto[] = (det?.revisiones ?? [])
          .filter((r: any) => Number(r?.idEntregableVersion ?? r?.IdEntregableVersion) === idVersion)
          .slice()
          .sort((a: any, b: any) => {
            const na = Number(a?.numeroRevision ?? a?.NumeroRevision ?? 0);
            const nb = Number(b?.numeroRevision ?? b?.NumeroRevision ?? 0);
            return na - nb; // asc
          })
          .map((r: any) => {
            const idRevision = Number(r?.idRevision ?? r?.IdRevision ?? r?.id ?? r?.Id ?? 0);

            const fecha = String(r?.fechaRevision ?? r?.FechaRevision ?? '').trim();
            const observacion = String(r?.observaciones ?? r?.Observaciones ?? '').trim();

            const tieneArchivo = !!(r?.tieneArchivo ?? r?.TieneArchivo ?? false);
            const nombreArchivo = (r?.nombreArchivo ?? r?.NombreArchivo ?? null);

            return {
              idRevision: idRevision,
              fecha: fecha || '',
              observacion: observacion || '',
              tieneArchivo: tieneArchivo,
              nombreArchivo: nombreArchivo ? String(nombreArchivo) : null
            } as RevisionAnteproyecto;
          });

        this.obsRevisiones = revs;

        this.obsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.obsRevisiones = [];
        this.obsLoading = false;
        this.cdr.markForCheck();
      }
    });
  }




  descargar(row: any): void {
    const idVersion = Number(row?.idVersion ?? NaN);
    if (!Number.isFinite(idVersion) || idVersion <= 0) return;

    this.entregablesSvc.downloadVersion(idVersion).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = row.nombreOriginal || 'entregable.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (e) => {
        console.error(e);
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar.', life: 10000 });
      }
    });
  }


  badgeTexto(): string {
    if (this.resultadoFinal === 'ACEPTADO') return 'Aceptado';
    if (this.resultadoFinal === 'RECHAZADO') return 'Rechazado';
    return 'En revisión';
  }

  fmtBytes(n: number): string {
    if (n === null || n === undefined) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }

  private validarProyectoCompleto(p: any): { ok: boolean; faltantes: string[] } {
    const faltantes: string[] = [];

    const titulo = String(p?.Titulo ?? p?.titulo ?? '').trim();
    const descripcion = String(p?.Descripcion ?? p?.descripcion ?? '').trim();
    const objetivo = String(p?.Objetivo ?? p?.objetivo ?? '').trim();

    const idEmpresa = Number(p?.IdEmpresa ?? p?.idEmpresa ?? 0);
    const noResidentes = Number(p?.NoResidentes ?? p?.noResidentes ?? 0);

    const idPeriodo = Number(p?.IdPeriodoAcademico ?? p?.idPeriodoAcademico ?? 0);
    const idModalidad = Number(p?.idModalidad ?? p?.IdModalidad ?? 0);

    // Si quieres obligar horario:
    const hIni = p?.HorarioInicio ?? p?.horarioInicio ?? null;
    const hFin = p?.HorarioFinal ?? p?.horarioFinal ?? null;

    if (!titulo) faltantes.push('Título del proyecto');
    if (!descripcion) faltantes.push('Descripción del proyecto');
    if (!objetivo) faltantes.push('Objetivo del proyecto');

    if (!(idEmpresa > 0)) faltantes.push('Empresa (IdEmpresa)');
    if (!(noResidentes > 0)) faltantes.push('Número de residentes (cupo)');

    if (!(idPeriodo > 0)) faltantes.push('Periodo académico');
    if (!(idModalidad > 0)) faltantes.push('Modalidad');

    // ✅ Actívalo solo si tu negocio lo exige
    // if (!hIni) faltantes.push('Horario inicio');
    // if (!hFin) faltantes.push('Horario final');

    return { ok: faltantes.length === 0, faltantes };
  }


  private debeValidarDatosParaEtapa2(targetStageIndex: number): boolean {
    // Solo aplica al entrar a Etapa 2 (stageIndex = 1)
    if (targetStageIndex !== 1) return false;

    // Docente no debería “entrar” con restricciones de alumno
    if (this.esDocente) return false;

    // Debe estar aprobado el anteproyecto (tu regla de flujo)
    if (!this.isTipoAprobado(1)) return false;

    return true;
  }








  private entrarAEtapa(
  stageIndex: number,
  opts: { persist?: boolean; focus?: boolean; showToast?: boolean } = {}
): void {
  this.activeStageIndex = stageIndex;
  this.selectedFilesEtapa = [];
  this.selectedEtapaTitulo = this.stages[stageIndex]?.label ?? 'Etapa';

  if (opts.persist !== false) {
    this.persistStageInUrl(stageIndex);
  }

  if (stageIndex === 4) {
    this.documentos = [];
    this.selectedTipoEntregable = 4;
    this.validarCierreDocumentalSilencioso();
    this.cdr.markForCheck();

    if (opts.focus !== false) {
      this.focusCurrentStage(true);
    }
    return;
  }

  const tipo = this.stages[stageIndex]?.key ?? 1;
  this.selectedTipoEntregable = tipo;
  this.documentos = this.getEntregablesPorTipo(tipo) ?? [];

  if (stageIndex === 1) {
    this.validarDatosEtapa2Silencioso();
  }

  this.cargarEntregablePorTipo(tipo, opts.showToast ?? false);
  this.cdr.markForCheck();

  if (opts.focus !== false) {
    this.focusCurrentStage(true);
  }
}

  get anteproyectoCerrado(): boolean {
    const st = this.entregableEstadoByTipo.get(this.TIPO_ANTEPROYECTO);
    if (!st) return false;

    // aprobado siempre cierra
    if (st.idEstadoEntregable === this.EST_ENT_APROBADO) {
      return true;
    }

    // rechazo SOLO permite corrección si el proyecto está en 3 o 4
    if (
      st.idEstadoEntregable === this.EST_ENT_RECHAZADO &&
      this.proyectoPermiteSubirAnteproyecto
    ) {
      return false;
    }

    // cualquier otro caso → cerrado
    return true;
  }


  get ultimaVersionAnte(): AnteproyectoRow | null {
    return (this.entregablesEtapa1?.length ? this.entregablesEtapa1[0] : null) as any;
  }

  /**
   * ✅ Regla:
   * - Si no hay versiones -> puede subir (si es integrante)
   * - Si hay versión pero aún NO tiene dictamen -> NO puede subir otra (espera revisión)
   * - Si dictamen = CAMBIOS -> SÍ puede subir nueva versión
   * - Si dictamen = APROBADO/RECHAZADO -> NO puede (cerrado)
   */
  // ── Validación de fecha para subir reportes ───────────────────────────────

  /** Fecha límite para subir el reporte de la etapa dada (2=RP1, 3=RP2, 4=Final) */
  getFechaLimiteEtapa(etapa: 2 | 3 | 4): Date | null {
    if (etapa === 2) return this.fechaProgramadaRp1;
    if (etapa === 3) return this.fechaProgramadaRp2;
    if (etapa === 4) return this.fechaFinPeriodoAcademico;
    return null;
  }

  /** Días restantes para la fecha límite de la etapa (negativo = vencido) */
  diasRestantesEtapa(etapa: 2 | 3 | 4): number | null {
    const limite = this.getFechaLimiteEtapa(etapa);
    if (!limite) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fin = new Date(limite);
    fin.setHours(0, 0, 0, 0);
    return Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  }

  /** true = hoy ya pasó la fecha límite (vencido) */
  esFechaVencidaEtapa(etapa: 2 | 3 | 4): boolean {
    const dias = this.diasRestantesEtapa(etapa);
    return dias !== null && dias < 0;
  }

  /** true = faltan 7 días o menos pero aún no vence */
  esFechaProximaEtapa(etapa: 2 | 3 | 4): boolean {
    const dias = this.diasRestantesEtapa(etapa);
    return dias !== null && dias >= 0 && dias <= 7;
  }

  /** Mensaje descriptivo del estado de la fecha */
  mensajeFechaEtapa(etapa: 2 | 3 | 4): string {
    const dias = this.diasRestantesEtapa(etapa);
    if (dias === null) return '';
    if (dias < 0)  return `Fecha límite vencida hace ${Math.abs(dias)} día(s).`;
    if (dias === 0) return 'Hoy es el último día para subir.';
    if (dias <= 7)  return `Quedan ${dias} día(s) para la fecha límite.`;
    return `Fecha límite en ${dias} día(s).`;
  }

  get puedeSubirAnteproyectoSegunFlujo(): boolean {
    // base
    if (!this.puedeSubirAnteproyecto) return false;
    if (!this.idProyecto) return false;
    if (this.proyectoCancelado) return false;

    // estados del proyecto permitidos (ajusta si aplica)
    const estadosPermitidos = [
      this.ESTADO_ESPERA_ASIGNANDO_REVISOR,      // 3
      this.ESTADO_ESPERA_REVISION_ANTEPROYECTO   // 4
    ];

    const estadoProyectoOk =
      this.proyectoIdEstado != null &&
      estadosPermitidos.includes(this.proyectoIdEstado);

    if (!estadoProyectoOk) return false;

    // ✅ Caso A: no hay versiones -> permitir subir v1
    if (!this.hayVersionesAnteproyecto) return true;

    // ✅ Caso B: hay versiones -> SOLO permitir subir nueva versión si la última está REVISADO
    // ❌ si está POR_REVISAR -> no crear otra versión
    // ❌ si está ACEPTADO/RECHAZADO -> bloquear todo
    const est = this.estadoUltimaVersion;

    if (est === 'REVISADO') return true;

    return false;
  }


  puedeReemplazarUltimaVersion(): boolean {
    if (!this.hayVersionesAnteproyecto) return false;

    // solo mientras NO hay revisor asignado
    if (this.revisorAnteproyectoAsignado) return false;

    // solo si la última está pendiente de revisión
    return this.estadoUltimaVersion === 'POR_REVISAR';
  }


  get motivoBloqueoSubidaAnte(): string | null {
    if (!this.puedeSubirAnteproyecto) return 'Necesitas ser integrante del equipo.';
    if (this.proyectoCancelado) return 'Proyecto cancelado.';
    if (this.anteproyectoCerrado) return 'El anteproyecto ya fue cerrado (aprobado o rechazado).';

    const last = this.ultimaVersionAnte;
    if (!last) return null;

    const est = this.estadoVisiblePorVersion(last);
    if (est === 'POR_REVISAR') return 'Ya subiste una versión. Espera el dictamen del revisor.';
    if (est === 'REVISADO') return null; // ✅ puede subir
    return 'No se permiten nuevas versiones en este estado.';
  }

  norm(v: any): string {
    return String(v ?? '').trim().toUpperCase();
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


  /**
   * ⚠️ Este validador NO puede ser “mágico” sin saber tus endpoints reales.
   * Te lo dejo listo para que conectes lo mismo que ya usas en Perfil.
   *
   * Recomendación: que tu backend tenga un endpoint tipo:
   *  - GET /perfil/validacion  -> { ok: boolean, faltantes: string[] }
   * O bien:
   *  - GET /documentos/requeridos/estado?...
   */
  private validarDocumentosRequeridos$(): import('rxjs').Observable<GateStatus> {
    // ✅ Versión “segura”: por defecto NO bloquea si no está implementado.
    // Cambia esto para usar TU método real del perfil.
    return of({ ok: true, faltantes: [] });

    // ✅ Ejemplo (NO lo uses tal cual si no existe tu endpoint):
    // return this.docsSvc.getEstadoDocumentosPerfil().pipe(
    //   map(r => ({ ok: !!r.ok, faltantes: r.faltantes ?? [] })),
    //   catchError(() => of({ ok: false, faltantes: ['No se pudo validar documentos (error)'] }))
    // );
  }


  private validarPerfilCompleto(est: any): { ok: boolean; faltantes: string[] } {
    const faltantes: string[] = [];

    const tel = String(est?.telefonoCelular ?? est?.TelefonoCelular ?? '').trim();
    const correo = String(est?.correoPersonal ?? est?.CorreoPersonal ?? '').trim();
    const domicilio = String(est?.domicilio ?? est?.Domicilio ?? '').trim();
    const ciudad = String(est?.ciudad ?? est?.Ciudad ?? '').trim();

    // ✅ nuevo flujo: CP + idEstado (ya no municipio)
    const cp = String(est?.cp ?? est?.CP ?? '').trim();

    const idDep = Number(est?.idDependenciaMedica ?? est?.IdDependenciaMedica ?? 0);
    const nss = String(est?.noSeguroSocial ?? est?.NoSeguroSocial ?? '').trim();

    const nombre = String(est?.nombre ?? est?.Nombre ?? '').trim();
    const apPat = String(est?.apellidoPaterno ?? est?.ApellidoPaterno ?? '').trim();
    const noControl = String(est?.noControl ?? est?.NoControl ?? '').trim();
    const idCarrera = Number(est?.idcarrera ?? est?.IdCarrera ?? 0);

    if (!nombre) faltantes.push('Nombre');
    if (!apPat) faltantes.push('Apellido paterno');
    if (!noControl) faltantes.push('No. de control');
    if (!(idCarrera > 0)) faltantes.push('Carrera');

    if (!/^\d{10}$/.test(tel)) faltantes.push('Teléfono celular (10 dígitos)');
    if (!correo) faltantes.push('Correo personal');
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) faltantes.push('Correo personal (formato válido)');

    if (!domicilio) faltantes.push('Domicilio');
    if (!ciudad) faltantes.push('Ciudad');

    if (!/^\d{5}$/.test(cp)) faltantes.push('Código Postal (5 dígitos)');

    // NSS condicional (solo si hay dependencia médica)
    if (idDep > 0 && !nss) faltantes.push('No. Seguro Social (NSS)');

    return { ok: faltantes.length === 0, faltantes };
  }



  private debeValidarPerfilParaEtapa2(targetStageIndex: number): boolean {
    // Solo al entrar a Reporte parcial 1 (stageIndex=1)
    if (targetStageIndex !== 1) return false;

    // Debe estar aprobado el anteproyecto
    if (!this.isTipoAprobado(1)) return false;

    // Y proyecto en estado 6 (según tu regla)
    return this.proyectoIdEstado === 6;
  }

  private validarPerfilYContinuar(targetStageIndex: number): void {
    const u: any = this.auth.getUser();
    const idUsuario = Number(u?.id ?? u?.userId ?? u?.sub ?? NaN);

    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo identificar tu usuario.', life: 10000 });
      return;
    }

    this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(
      catchError(() => of(false))
    ).subscribe((est: any) => {
      if (!est || est === false) {
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar tu perfil.', life: 10000 });
        return;
      }

      const r = this.validarPerfilCompleto(est);
      if (r.ok) {
        // ✅ dejar pasar
        this.activeStageIndex = targetStageIndex;

        const tipo = this.stages[targetStageIndex]?.key ?? 1;
        this.selectedTipoEntregable = tipo;
        this.selectedEtapaTitulo = this.stages[targetStageIndex]?.label ?? 'Etapa';

        this.cargarEntregablePorTipo(tipo);
        this.cdr.markForCheck();
        return;
      }

      // ❌ bloquear + mostrar dialog
      this.perfilFaltantes = r.faltantes;
      this.evaluarRequisitosEtapas24();

      this.showPerfilIncompletoDialog = true;
      this.cdr.markForCheck();
    });
  }
  private normalizeProyecto(p: any): Proyecto {
    return {
      id: Number(p?.id ?? p?.Id ?? 0),

      titulo: String(p?.titulo ?? p?.Titulo ?? ''),
      descripcion: String(p?.descripcion ?? p?.Descripcion ?? ''),
      objetivo: String(p?.objetivo ?? p?.Objetivo ?? ''),

      noResidentes: Number(p?.noResidentes ?? p?.NoResidentes ?? 0),

      idModalidad: Number(p?.idModalidad ?? p?.IdModalidad ?? 0) || null,
      idPeriodoAcademico: Number(p?.idPeriodoAcademico ?? p?.IdPeriodoAcademico ?? 0) || null,
      idEspecializcion: Number(p?.idEspecializcion ?? p?.IdEspecializcion ?? 0) || null,
      idEmpresa: Number(p?.idEmpresa ?? p?.IdEmpresa ?? 0) || null,

      horarioInicio: p?.horarioInicio ?? p?.HorarioInicio ?? null,
      horarioFinal: p?.horarioFinal ?? p?.HorarioFinal ?? null,

      idEstado: Number(p?.idEstado ?? p?.IdEstado ?? 0),
      propuestaAlumno: !!(p?.propuestaAlumno ?? p?.PropuestaAlumno),
      fechaRegistor: p?.fechaRegistor ?? p?.FechaRegistor ?? null,

      // ✅ NUEVO: para detectar líder
      idEstudianteCreador: Number(
        p?.idEstudianteCreador ?? p?.IdEstudianteCreador ?? p?.idEstudianteAutor ?? p?.IdEstudianteAutor ?? 0
      ) || null,
    } as any;
  }




  private debeValidarDatosAntesDeEntrar(stageIndex: number): boolean {
    // Solo etapa 2 (por ahora)
    if (stageIndex !== 1) return false;

    // Docente no
    if (this.esDocente) return false;

    // Si anteproyecto no está aprobado, ni llegas aquí (porque canEnterStage ya bloquea)
    if (!this.anteproyectoPermiteEtapasPosteriores) return false;

    // ✅ Siempre valida requisitos al entrar a etapa 2
    return true;
  }




  private debeExigirPerfilYProyecto(): boolean {
    // Docente no debe bloquearse por perfil
    if (this.esDocente) return false;

    // Si no tenemos estado, NO bloqueamos (evita falsos positivos)
    if (!Number.isFinite(this.proyectoIdEstado as any)) return false;

    // Cancelado: no exigir nada
    if (this.proyectoIdEstado === this.ESTADO_CANCELADO) return false;

    // Desde estado 6 en adelante
    return (this.proyectoIdEstado as number) >= this.ESTADO_DESDE_EXIGIR_DATOS;
  }

  get debeExigirPerfilYProyectos(): boolean {
    return this.debeExigirPerfilYProyecto();
  }


  /** ✅ Nueva regla de acceso a Etapa 2+:
 *  - Anteproyecto (tipo 1) debe estar APROBADO (idEstadoEntregable = 4)
 *  - Si proyecto cancelado => nunca
 */
  private get anteproyectoPermiteEtapasPosteriores(): boolean {
    // Cancelado: nunca
    if (this.proyectoCancelado) return false;

    const st = this.entregableEstadoByTipo.get(this.TIPO_ANTEPROYECTO);
    if (!st) return false; // aún no cargan estados / no existe entregable

    return st.idEstadoEntregable === this.EST_ENT_APROBADO; // 4
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

  private nz(v: any): string | null {
    const s = String(v ?? '').trim();
    return s.length ? s : null;
  }
  private loadModalidadesYEspecializaciones(): void {
    // Modalidades
    this.catalogosSvc.getActivasModalidad().pipe(
      catchError(() => of([]))
    ).subscribe((rows: any[]) => {
      this.modalidadesOptions = (rows ?? []).map(m => ({
        label: String(m?.descripcion ?? '').trim(),
        value: Number(m?.id ?? null)
      }));
      console.log(this.modalidadesOptions);
      this.cdr.markForCheck();
    });

    // Especializacioness
    this.catalogosSvc.getActivasEspecializacion().pipe(
      catchError(() => of([]))
    ).subscribe((rows: any[]) => {
      this.especializacionesOptions = (rows ?? []).map(e => ({
        label: String(e?.descripcion ?? '').trim(),
        value: Number(e?.id ?? null)
      }));
      console.log(this.especializacionesOptions);
      this.cdr.markForCheck();
    });
  }

  private cargarCatalogosEmpresaPeriodo(): void {
    forkJoin({
      empresas: this.empresasSvc.getAll().pipe(catchError(() => of([] as Empresa[]))),
      periodos: this.periodosSvc.getActivos().pipe(catchError(() => of([] as PeriodoAcademicoDto[]))),
    }).subscribe(({ empresas, periodos }) => {
      // Mapa empresas (id -> nombre)
      this.empresasMap.clear();
      (empresas ?? []).forEach((e) => {
        const id = Number(e?.id ?? NaN);
        const name = String(e?.nombre ?? '').trim();
        if (Number.isFinite(id) && name) this.empresasMap.set(id, name);
      });

      // Mapa periodos (id -> nombre) + guardar DTO completo
      this.periodosMap.clear();
      this.periodosById.clear();

      (periodos ?? []).forEach((p) => {
        const id = Number((p as any)?.id ?? NaN);
        const label = String((p as any)?.nombre ?? '').trim();

        if (Number.isFinite(id)) {
          if (label) this.periodosMap.set(id, label);
          this.periodosById.set(id, p);
        }
      });

      // refrescar labels si ya hay proyecto
      if (this.proyectoActual) {
        const idEmp = Number((this.proyectoActual as any).idEmpresa ?? 0);
        const idPer = Number((this.proyectoActual as any).idPeriodoAcademico ?? 0);

        this.empresaLabelActual = this.empresasMap.get(idEmp) ?? null;
        this.periodoLabelActual = this.periodosMap.get(idPer) ?? null;

        this.periodoActualDto = this.periodosById.get(idPer) ?? null;
      } else {
        this.periodoActualDto = null;
      }

      // ✅ recalcula cronograma
      this.recalcularFechasEtapas();

      this.cdr.markForCheck();
    });
  }



  abrirDialogProyecto(): void {
    this.proyectoFormError = null;

    if (!this.idProyecto) {
      this.proyectoFormError = 'No se detectó idProyecto.';
      return;
    }

    this.proyectosSvc.getById(this.idProyecto).pipe(
      catchError(() => of(false))
    ).subscribe((p: any) => {
      if (!p || p === false) {
        this.proyectoFormError = 'No se pudo cargar el proyecto.';
        return;
      }

      const pNorm = this.normalizeProyecto(p);
      this.proyectoActual = pNorm;

      // 🔥 carga valores al form (si ya lo haces en otro lado, deja tu lógica)
      this.proyectoForm.patchValue({
        titulo: pNorm.titulo ?? '',
        descripcion: pNorm.descripcion ?? '',
        objetivo: pNorm.objetivo ?? '',
        noResidentes: pNorm.noResidentes ?? 1,
        horarioInicio: pNorm.horarioInicio ?? '',
        horarioFin: pNorm.horarioFinal ?? '',
        idPeriodoAcademico: pNorm.idPeriodoAcademico ?? null,
        idEmpresa: pNorm.idEmpresa ?? null,
        idEspecializcion: pNorm.idEspecializcion ?? null,
        idModalidad: pNorm.idModalidad ?? null,
      }, { emitEvent: false });

      // ✅ Mostrar dialog
      this.syncProyectoFormDisabledState();
      this.showProyectoDialog = true;
      this.cdr.markForCheck();

      // ✅ MODO VISTA si NO es líder o está cancelado
      if (this.proyectoCancelado) {
        this.proyectoForm.disable();
      } else {
        this.proyectoForm.enable();
      }

      this.cdr.markForCheck();
    });
  }


  private resolveEmpresaPeriodoLabels(p: any): void {
    const empresaTxt = String(p?.empresaNombre ?? p?.EmpresaNombre ?? '').trim();
    const periodoTxt = String(p?.periodoDescripcion ?? p?.PeriodoDescripcion ?? '').trim();

    const idEmp = Number(p?.idEmpresa ?? p?.IdEmpresa ?? this.proyectoActual?.idEmpresa ?? 0);
    const idPer = Number(p?.idPeriodoAcademico ?? p?.IdPeriodoAcademico ?? this.proyectoActual?.idPeriodoAcademico ?? 0);

    this.empresaLabelActual =
      empresaTxt || (this.empresasMap.get(idEmp) ?? null);

    this.periodoLabelActual =
      periodoTxt || (this.periodosMap.get(idPer) ?? null);
  }




  onProyectoDialogHide(): void {
    this.proyectoFormError = null;
    // no limpio proyectoActual; solo cierro dialog
  }

  onSubmitProyecto(): void {
    this.proyectoFormError = null;

    if (this.isProyectoSoloVista) {
      this.toast.add({ severity: 'warn', summary: 'Solo vista', detail: 'El proyecto está cancelado.', life: 10000 });
      return;
    }
    if (!this.canEditProyecto) {
      this.toast.add({ severity: 'warn', summary: 'Sin permiso', detail: 'Solo el líder puede editar.', life: 10000 });
      return;
    }

    // ✅ Validación mínima para permitir updates parciales
    const titulo = String(this.proyectoForm.value.titulo || '').trim();

    // Solo título obligatorio
    if (!titulo) {
      this.pf['titulo']?.markAsTouched();
      this.proyectoFormError = 'El título es obligatorio.';
      return;
    }

    // Validación de rango horario (solo si el validator se disparó)
    if (this.proyectoForm.hasError('timeRange')) {
      this.proyectoFormError = 'El horario final debe ser mayor al horario inicial.';
      return;
    }


    if (!this.proyectoActual) {
      this.proyectoFormError = 'No hay proyecto cargado.';
      return;
    }

    // Solo permitimos guardar si es propuesta y líder (tu regla)
    if (!(this.propuestaAlumno && this.esLider)) {
      this.proyectoFormError = 'No tienes permisos para editar este proyecto.';
      return;
    }

    const inicio = this.toTimeSpanString(this.proyectoForm.value.horarioInicio);
    const fin = this.toTimeSpanString(this.proyectoForm.value.horarioFin);

    // ⚠️ construimos payload tomando base del actual para no perder campos
    const payload: Proyecto = {
      ...this.proyectoActual,

      titulo: String(this.proyectoForm.value.titulo || '').trim(),
      descripcion: this.nz(this.proyectoForm.value.descripcion),
      objetivo: this.nz(this.proyectoForm.value.objetivo),

      noResidentes: Number(this.proyectoForm.value.noResidentes || 1),

      horarioInicio: inicio,
      horarioFinal: fin,

      // 🔒 blindaje: el alumno NO cambia esto
      idEstado: this.proyectoActual.idEstado,
      propuestaAlumno: this.proyectoActual.propuestaAlumno,
      fechaRegistor: this.proyectoActual.fechaRegistor,
      idEmpresa: this.proyectoForm.value.idEmpresa ?? this.proyectoActual.idEmpresa,
      idPeriodoAcademico: this.proyectoForm.value.idPeriodoAcademico ?? this.proyectoActual.idPeriodoAcademico,
      idEspecializcion: this.proyectoForm.value.idEspecializcion ?? this.proyectoActual.idEspecializcion,
      idModalidad: this.proyectoForm.value.idModalidad ?? this.proyectoActual.idModalidad,



    };

    this.savingProyecto = true;

    this.proyectosSvc.update(payload.id, payload).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Guardado', detail: 'Datos del proyecto actualizados.', life: 10000 });

        // refrescar backend (fuente de verdad)
        this.proyectosSvc.getById(payload.id).pipe(
          catchError(() => of(false))
        ).subscribe((p: any) => {
          if (p && p !== false) {
            const pNorm = this.normalizeProyecto(p);
            this.proyectoActual = pNorm;

            // refrescar labels empresa/periodo
            this.resolveEmpresaPeriodoLabels(p);
          }

          this.savingProyecto = false;
          this.showProyectoDialog = false;

          // ✅ revalidar para ocultar bloqueo de etapa 2 si ya quedó completo
          if (this.activeStageIndex === 1) {
            this.validarDatosYContinuar(1);
          }

          this.cdr.markForCheck();
        });
      },
      error: (err) => {
        this.savingProyecto = false;
        const msg = typeof err?.error === 'string'
          ? err.error
          : (err?.error?.message ?? 'No se pudo guardar el proyecto.');
        this.proyectoFormError = msg;
        this.cdr.markForCheck();
      }
    });

  }
  get stage2DebeMostrarPantallaCompletar(): boolean {
    // Solo Etapa 2 (index 1)
    if (this.activeStageIndex !== 1) return false;

    // Solo si aplica la regla
    if (!this.debeExigirPerfilYProyectos) return false;

    // Si falta algo, debe bloquearse en pantalla completa
    return (this.perfilIncompleto || this.proyectoIncompleto);
  }

  get canEditProyecto(): boolean {
    return !!(this.propuestaAlumno && this.esLider);
  }

  // ✅ “03 jun 2026 8:00 a. m.”
  formatFechaEsMx(input: string | Date | null | undefined): string {
    if (!input) return '—';

    const d = (input instanceof Date) ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return '—';

    const fmt = new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Ej: "03 jun 2026, 8:00 a. m."
    let s = fmt.format(d);

    // ✅ quitar coma después del año
    s = s.replace(',', '');

    // ✅ normalizar espacios
    s = s.replace(/\s+/g, ' ').trim();

    // ✅ mes en minúsculas constante (por si algún navegador lo cambia)
    // (en es-MX normalmente ya viene en minúsculas)
    s = s.replace(/\b([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,})\b/, (m) => m.toLowerCase());

    return s;
  }
  private validarContactoEmergenciaCompleto(contacto: any, est: any): { ok: boolean; faltantes: string[] } {
    const faltantes: string[] = [];

    const idCE = Number(est?.idContactoEmergencia ?? est?.IdContactoEmergencia ?? 0);
    if (!(idCE > 0)) {
      faltantes.push('Contacto de emergencia');
      return { ok: false, faltantes };
    }

    if (!contacto) {
      faltantes.push('Contacto de emergencia (no se pudo cargar)');
      return { ok: false, faltantes };
    }

    const nombre = String(contacto?.nombre ?? contacto?.Nombre ?? '').trim();
    const parentesco = String(contacto?.parentesco ?? contacto?.Parentesco ?? '').trim();
    const telefono = String(contacto?.telefono ?? contacto?.Telefono ?? '').trim();
    const email = String(contacto?.email ?? contacto?.Email ?? '').trim();

    if (!nombre) faltantes.push('Contacto de emergencia: Nombre');
    if (!parentesco) faltantes.push('Contacto de emergencia: Parentesco');
    if (!/^\d{10}$/.test(telefono)) faltantes.push('Contacto de emergencia: Teléfono (10 dígitos)');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) faltantes.push('Contacto de emergencia: Email (formato)');

    return { ok: faltantes.length === 0, faltantes };
  }

  private validarExpedienteCompleto(tipos: any[], docs: any[]): GateStatus {
    const faltantes: string[] = [];

    const tiposArr = Array.isArray(tipos) ? tipos : [];
    const docsArr = Array.isArray(docs) ? docs : [];

    // ✅ qué tipos son obligatorios
    const obligatorios = tiposArr.filter(t => {
      // si backend manda bandera, úsala
      const requerido = (t?.requerido ?? t?.Requerido ?? t?.obligatorio ?? t?.Obligatorio);
      const esReq = (typeof requerido === 'boolean') ? requerido : true; // si no hay info, asumimos "sí", pero…
      // …excepto si es el dictamen opcional
      if (this.esTipoOpcional(t)) return false;
      return esReq;
    });

    // ✅ índice rápido de docs que tengo
    const idsDocs = new Set<number>(
      docsArr
        .map(d => Number(d?.idTipoDocumento ?? d?.IdTipoDocumento ?? d?.idTipoExpediente ?? d?.IdTipoExpediente ?? NaN))
        .filter(n => Number.isFinite(n) && n > 0)
    );

    for (const t of obligatorios) {
      const idTipo = Number(t?.id ?? t?.Id ?? t?.idTipoDocumento ?? t?.IdTipoDocumento ?? NaN);
      const nombre = String(t?.descripcion ?? t?.Descripcion ?? t?.nombre ?? t?.Nombre ?? 'Documento').trim();

      if (!Number.isFinite(idTipo) || idTipo <= 0) continue;

      if (!idsDocs.has(idTipo)) {
        faltantes.push(nombre);
      }
    }

    return { ok: faltantes.length === 0, faltantes };
  }

  private evaluarRequisitosEtapas24(): void {
    const anteOk = this.isTipoAprobado(1);
    const proyectoOk = !this.proyectoIncompleto;
    const perfilOk = (this.perfilFaltantes?.length ?? 0) === 0;

    const integrantesOk = (this.integrantesFaltantes?.length ?? 0) === 0;
    const cupoMsg = this.mensajeCupoProyecto;

    // ✅ Gate global: todo OK (SIN documentos)
    this.stage2ReadyAll = anteOk && proyectoOk && perfilOk && integrantesOk && !cupoMsg;

    this.cdr.markForCheck();
  }



  public irPerfil(): void {
    this.router.navigate(['/perfil']); // ajusta la ruta si tu app usa otra
  }

  get etapa5TieneFaltantes(): boolean {
    return (this.gateDocs?.faltantes?.length ?? 0) > 0;
  }

  get etapa5DocumentosFaltantes(): string[] {
    return [...(this.gateDocs?.faltantes ?? [])];
  }

  validarCierreDocumentalSilencioso(): void {
    this.loadingGate = true;

    forkJoin({
      tipos: this.documentosSvc.getTiposExpediente().pipe(catchError(() => of([]))),
      docs: this.documentosSvc.getMisExpediente().pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ tipos, docs }: any) => {
        this.gateDocs = this.validarExpedienteCompleto(tipos ?? [], docs ?? []);
        this.loadingGate = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.gateDocs = {
          ok: false,
          faltantes: ['No se pudo validar el expediente.']
        };
        this.loadingGate = false;
        this.cdr.markForCheck();
      }
    });
  }

  private syncLeaderAndInvitations(): void {
    const idCreador = Number((this.proyectoActual as any)?.idEstudianteCreador ?? 0);

    this.esLider = !!(
      this.miIdEstudiante &&
      idCreador > 0 &&
      this.miIdEstudiante === idCreador
    );

    // ✅ en vez de “cargarInvitaciones directo”, usa el helper
    this.refreshInvitacionesSiAplica();

    this.cdr.markForCheck();
  }


  private refreshInvitacionesSiAplica(): void {
    // Si no hay proyecto, nada que hacer
    if (!this.idProyecto) return;

    // Si no es propuesta alumno, no aplica invitaciones
    if (!this.propuestaAlumno) {
      this.invitaciones = [];
      this.splitInvitaciones();
      this.cdr.markForCheck();
      return;
    }

    // Si no soy líder, no llamo al endpoint (backend lo bloquea)
    if (!this.esLider) {
      this.invitaciones = [];
      this.splitInvitaciones();
      this.cdr.markForCheck();
      return;
    }

    // ✅ Aquí ya somos líder y sí aplica
    this.cargarInvitaciones(this.idProyecto);
  }

  // ✅ Bloqueo global del componente cuando el proyecto está cancelado
  // ✅ Ubicar cerca de otras reglas/flags del proyecto (ej. junto a canEditProyecto, proyectoCancelado)
  get isProyectoSoloVista(): boolean {
    return this.savingProyecto || !this.canEditProyecto || this.proyectoCancelado;
  }

  // ✅ Ubicar cerca de proyectoForm / helpers
  private syncProyectoFormDisabledState(): void {
    if (!this.proyectoForm) return;

    if (this.isProyectoSoloVista) {
      this.proyectoForm.disable({ emitEvent: false });
    } else {
      this.proyectoForm.enable({ emitEvent: false });
    }
  }


  // ✅ El dialog del proyecto debe ser solo lectura si:
  // - está cancelado, o
  // - no es líder (en propuesta alumno)
  get isDialogProyectoSoloVista(): boolean {
    return this.isProyectoSoloVista || !this.canEditProyecto;
  }

  private autoRechazarInvitacionesPendientesSiCancelado(): void {
    if (this.autoRejectInvApplied) return;

    // Solo aplica si: cancelado + propuesta alumno + líder
    if (!this.proyectoCancelado) return;
    if (!this.propuestaAlumno) return;
    if (!this.esLider) return;
    if (!this.idProyecto) return;

    // 1) Traer invitaciones enviadas (líder)
    this.proyectosSvc.misInvitacionesEnviadas(this.idProyecto).pipe(
      catchError((e) => {
        console.error('Error trayendo invitaciones enviadas:', e);
        return of([]);
      })
    ).subscribe((rows: any) => {
      const invs = this.asArray<any>(rows);

      const pendientes = invs.filter(x =>
        String(x?.estado ?? '').trim().toUpperCase() === 'PENDIENTE'
      );

      if (!pendientes.length) {
        this.autoRejectInvApplied = true; // ya no hay nada que hacer
        return;
      }

      const calls = pendientes
        .map(x => this.getInvId(x))     // ⚠️ ajusta según tu response real
        .filter(id => id > 0)
        .map(id => this.proyectosSvc.responderInvitacion(id, 'RECHAZAR'));

      if (!calls.length) {
        this.autoRejectInvApplied = true;
        return;
      }

      // 2) Rechazar en paralelo (forkJoin). Si quieres uno-por-uno, te paso versión concatMap.
      forkJoin(calls).pipe(
        catchError((e) => {
          console.error('Auto-rechazo falló:', e);
          return of(null);
        })
      ).subscribe(() => {
        this.autoRejectInvApplied = true;

        // refresca listas
        this.cargarInvitaciones(this.idProyecto!);
        this.cdr.markForCheck();
      });
    });
  }

  /** Intenta encontrar el id de la invitación en diferentes llaves */
  private getInvId(x: any): number {
    const candidates = [
      x?.idInvitacion,
      x?.id,
      x?.Id,
      x?.invId,
      x?.idInv
    ];

    const val = candidates.find(v => v !== undefined && v !== null);
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }

  private get proyectoPermiteSubirAnteproyecto(): boolean {
    return [
      this.ESTADO_ESPERA_ASIGNANDO_REVISOR, // 3
      this.ESTADO_ESPERA_REVISION_ANTEPROYECTO // 4
    ].includes(this.proyectoIdEstado ?? -1);
  }

  get mostrarSubidaAnteproyecto(): boolean {
    const estado = this.proyectoIdEstado ?? -1;

    const estadoPermite =
      estado === this.ESTADO_ESPERA_ASIGNANDO_REVISOR || // 3
      estado === this.ESTADO_ESPERA_REVISION_ANTEPROYECTO; // 4

    if (!estadoPermite) return false;

    // ✅ Subida de NUEVA versión:
    // - si no hay versiones, permite aunque haya revisor
    // - si la última está REVISADO (CAMBIOS), permite aunque haya revisor
    const puedeSubirNueva = this.puedeSubirAnteproyectoSegunFlujo;

    // ✅ Reemplazo:
    // - solo si POR_REVISAR y NO hay revisor asignado
    const puedeReemplazar = this.puedeReemplazarUltimaVersion();

    return puedeSubirNueva || puedeReemplazar;
  }



  get mensajeBloqueoSubidaAnte(): string {
    return 'El proyecto no se encuentra en una etapa válida para subir el anteproyecto.';
  }

  get puedeMostrarSubidaAnteproyecto(): boolean {
    return [
      this.ESTADO_ESPERA_ASIGNANDO_REVISOR, // 3
      this.ESTADO_ESPERA_REVISION_ANTEPROYECTO // 4
    ].includes(this.proyectoIdEstado ?? -1);
  }

  // ===== helpers de la última versión =====
  get ultimaVersionAnteproyecto(): any | null {
    if (!this.documentos || this.documentos.length === 0) return null;
    return [...this.documentos].sort((a, b) => (b.numeroVersion ?? 0) - (a.numeroVersion ?? 0))[0];
  }

  get estadoUltimaVersion(): string {
    return (this.ultimaVersionAnteproyecto?.estadoVisible ?? '').toUpperCase();
  }

  get hayVersionesAnteproyecto(): boolean {
    return (this.documentos?.length ?? 0) > 0;
  }


  get mensajeBloqueoAnteproyecto(): string {
    if (!this.proyectoIdEstado) return 'No se detectó el estado del proyecto.';

    // si no hay versiones, el bloqueo solo podría ser por estado no válido
    if (!this.hayVersionesAnteproyecto) {
      if (this.revisorAnteproyectoAsignado) {
        // opcional, pero normalmente si no hay versiones y hay revisor, puede ser raro
        return 'Hay revisor asignado. Si aún no has subido, sube el anteproyecto.';
      }
      return 'No puedes subir anteproyecto en este estado.';
    }

    const est = this.estadoUltimaVersion;

    if (est === 'POR_REVISAR') {
      if (this.revisorAnteproyectoAsignado) {
        return 'El anteproyecto ya está en revisión. Espera la revisión del docente.';
      }
      return 'Ya existe un anteproyecto. Puedes reemplazar la última versión (mientras no haya revisor asignado).';
    }

    if (est === 'REVISADO') {
      return 'La versión ya fue revisada. Ya puedes subir una nueva versión.';
    }

    if (est === 'ACEPTADO') {
      return 'El anteproyecto fue ACEPTADO. Ya no se permiten nuevas versiones.';
    }

    if (est === 'RECHAZADO') {
      return 'El anteproyecto fue RECHAZADO. Ya no se permiten nuevas versiones.';
    }

    return 'No puedes subir anteproyecto en este momento.';
  }




  getEstadoProyectoUI(idEstado: number) {
    return ESTADO_PROYECTO_UI[idEstado] ?? {
      label: 'Desconocido',
      severity: 'secondary',
      bgClass: 'bg-slate-100',
      textClass: 'text-slate-700'
    };
  }

  onSelectFileReemplazo(event: any, row: any): void {
    const file = event?.files?.[0] as File | undefined;
    if (!file) return;

    if (file.type !== 'application/pdf') {
      this.toast.add({ severity: 'warn', summary: 'Ojo', detail: 'Solo PDF.', life: 8000 });
      return;
    }

    const idVersion = Number(row?.idVersion ?? NaN);
    if (!Number.isFinite(idVersion) || idVersion <= 0) return;

    // idEstudiante actual (ya lo guardas en this.miIdEstudiante)
    const idEstudiante = Number(this.miIdEstudiante ?? NaN);
    if (!Number.isFinite(idEstudiante) || idEstudiante <= 0) {
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se detectó tu ID de estudiante.', life: 8000 });
      return;
    }

    // Gate: solo si NO hay revisor asignado
    if (this.revisorAnteproyectoNombre) {
      this.toast.add({ severity: 'info', summary: 'Bloqueado', detail: 'Ya hay revisor asignado, no puedes reemplazar.', life: 8000 });
      return;
    }

    this.reemplazandoIdVersion = idVersion;

    this.entregablesSvc.reemplazarVersionArchivo(idVersion, idEstudiante, file).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Listo', detail: 'Archivo reemplazado correctamente.', life: 8000 });
        this.reemplazandoIdVersion = null;
        this.cargarEntregablePorTipo(this.selectedTipoEntregable);
        this.refreshEtapasYSeleccion();
        this.cdr.markForCheck();
      },
      error: (e) => {
        console.error(e);
        this.reemplazandoIdVersion = null;

        const msg = e?.error ?? 'No se pudo reemplazar el archivo.';
        this.toast.add({ severity: 'error', summary: 'Error', detail: String(msg), life: 10000 });

        this.cdr.markForCheck();
      }
    });
  }

  onFileReemplazoInput(event: any, row: any): void {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) return;

    // Mostrar nombre en español (opcional)
    row.__fileName = file.name;

    // Reusar tu lógica existente (la que hace el PUT)
    this.confirmarReemplazoDirecto(file, row);
  }

  private confirmarReemplazoDirecto(file: File, row: any): void {
    // Validación de formato
    if (file.type !== 'application/pdf') {
      this.toast.add({
        severity: 'warn',
        summary: 'Formato inválido',
        detail: 'Solo se permite PDF.',
        life: 8000
      });
      return;
    }

    const idVersion = Number(row?.idVersion ?? NaN);
    if (!Number.isFinite(idVersion) || idVersion <= 0) {
      this.toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo identificar la versión a reemplazar.',
        life: 8000
      });
      return;
    }

    // Id del estudiante actual (ya lo guardas en this.miIdEstudiante)
    const idEstudiante = Number(this.miIdEstudiante ?? NaN);
    if (!Number.isFinite(idEstudiante) || idEstudiante <= 0) {
      this.toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se detectó tu ID de estudiante.',
        life: 8000
      });
      return;
    }

    // Gate: solo si NO hay revisor asignado
    if (this.revisorAnteproyectoNombre) {
      this.toast.add({
        severity: 'info',
        summary: 'Bloqueado',
        detail: 'Ya hay revisor asignado, no puedes reemplazar.',
        life: 8000
      });
      return;
    }

    this.reemplazandoIdVersion = idVersion;

    this.entregablesSvc.reemplazarVersionArchivo(idVersion, idEstudiante, file).subscribe({
      next: () => {
        // ✅ Un solo mensaje de confirmación
        this.toast.add({
          severity: 'success',
          summary: 'Listo',
          detail: 'Archivo reemplazado correctamente.',
          life: 8000
        });

        this.reemplazandoIdVersion = null;

        // ✅ Recarga silenciosa (evita segundo toast si falla la recarga)
        this.cargarEntregablePorTipo(this.selectedTipoEntregable, false);

        this.refreshEtapasYSeleccion();
        this.cdr.markForCheck();
      },
      error: (e) => {
        console.error(e);
        this.reemplazandoIdVersion = null;

        // ✅ Sin mensajes del backend
        this.toast.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo reemplazar el archivo. Intenta nuevamente.',
          life: 10000
        });

        this.cdr.markForCheck();
      }
    });
  }


  onSelectFileInput(event: any): void {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      this.toast.add({ severity: 'warn', summary: 'Formato inválido', detail: 'Solo se permite PDF.' });
      return;
    }

    // reutiliza tu lógica actual
    this.selectedFile = file;
  }

  private notificarRevisorAnteproyecto$(nombreArchivo: string): import('rxjs').Observable<boolean> {
    const email = String(this.revisorAnteproyectoEmail ?? '').trim();
    if (!email) return of(false);

    const tema = 'Anteproyecto subido';
    const proyecto = String(this.proyectoActual?.titulo ?? this.proyectoActual?.titulo ?? 'Proyecto').trim();

    const cuerpo = `
    <p>Hola,</p>
    <p>Se ha subido un <b>nuevo anteproyecto</b> para su revisión.</p>
    <p><b>Proyecto:</b> ${proyecto}<br/>
       <b>Archivo:</b> ${nombreArchivo}</p>
    <p>Gracias.</p>
  `;

    return this.emailSvc.sendEmail(email, tema, cuerpo).pipe(
      map(() => true),
      catchError((e) => {
        console.error('No se pudo enviar correo al revisor:', e);
        return of(false);
      })
    );
  }

  private getCorreoFromEst(est: any): string {
    return String(
      est?.correoInstitucional ??
      est?.CorreoInstitucional ??
      est?.correo ??
      est?.email ??
      est?.Email ??
      ''
    ).trim().toLowerCase();
  }

  private enviarCorreoInvitacion$(est: any) {
    const correo = String(
      est?.correoInstitucional ??
      est?.CorreoInstitucional ??
      est?.correo ??
      est?.email ??
      est?.Email ??
      ''
    ).trim().toLowerCase();

    if (!correo) return of(false);

    const nc = this.getNcFromEst(est);

    // ✅ ya no usamos this.proyecto (no existe)
    const proyecto = this.idProyecto ? `Proyecto #${this.idProyecto}` : 'Proyecto de Residencias';

    const urlSistema = `${window.location.origin}/login`;

    const tema = `Invitación al sistema de Residencias - ${proyecto}`;
    const cuerpo = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h3>Invitación a Residencias</h3>
      <p>Hola <b>${String(est?.nombre ?? est?.Nombre ?? '').trim()}</b>,</p>
      <p>Has sido <b>invitado</b> a un proyecto en el sistema de <b>Residencias</b>.</p>
      <ul>
        <li><b>Proyecto:</b> ${proyecto}</li>
        <li><b>No. Control:</b> ${nc || 'N/A'}</li>
        <li><b>Estatus:</b> Invitación pendiente</li>
      </ul>
      <p>Ingresa al sistema para revisar y responder tu invitación:</p>
      <p><a href="${urlSistema}">${urlSistema}</a></p>
      <p style="color:#666;font-size:12px">Este correo fue enviado automáticamente.</p>
    </div>
  `;

    return this.emailSvc.sendEmail(correo, tema, cuerpo).pipe(
      map(() => true),
      catchError((e: any) => {
        console.error('No se pudo enviar el correo de invitación:', e);
        return of(false);
      })
    );
  }

  private autoAbrirEtapa2SiAnteAprobado(): void {
    // Solo estudiantes (si el docente entra aquí, no forzamos etapa)
    if (this.esDocente) return;

    // Si ya está en etapa 2 o más, no tocamos
    if (this.activeStageIndex >= 1) return;

    // Si NO está aprobado, no forzamos
    if (!this.isTipoAprobado(1)) return;

    // ✅ Anteproyecto aprobado => abrir Etapa 2 y evaluar faltantes “en silencio”
    this.activeStageIndex = 1;

    // Esto debe calcular perfil/proyecto/integrantes y setear stage2Ready
    this.validarDatosEtapa2Silencioso();
  }

  private validarDatosEtapa2Silencioso(onDone?: () => void): void {
  this.loadingGate = true;

  this.cargarGatesDePerfilProyectoYEquipo().subscribe({
    next: () => {
      this.stage2Ready = this.stage2ReadyAll;
      this.loadingGate = false;
      this.cdr.markForCheck();

      onDone?.();
    },
    error: () => {
      this.stage2ReadyAll = false;
      this.stage2Ready = false;
      this.loadingGate = false;
      this.cdr.markForCheck();

      onDone?.();
    }
  });
}
  private cargarGatesDePerfilProyectoYEquipo(): Observable<any> {
    const u: any = this.auth.getUser();
    const idUsuario = Number(u?.id ?? 0);

    return forkJoin({
      est: this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(catchError(() => of(null))),
      proy: this.proyectosSvc.getById(this.idProyecto!).pipe(catchError(() => of(null))),

      // Usa el que tú YA usas para equipo (más confiable)
      equipo: this.estudiantesSvc.getByProyecto(this.idProyecto!).pipe(catchError(() => of([])))
    }).pipe(
      switchMap(({ est, proy, equipo }) => {
        // 1) Perfil (usuario actual)
        const rPerfil = this.validarPerfilCompleto(est);
        this.perfilFaltantes = rPerfil.faltantes ?? [];
        this.perfilIncompleto = !rPerfil.ok;

        // 2) Proyecto
        const rProy = this.validarProyectoCompleto(proy);
        this.proyectoFaltantes = rProy.faltantes ?? [];
        this.proyectoIncompleto = !rProy.ok;

        // 3) Equipo
        this.equipo = this.asArray<any>(equipo);

        // 4) Evaluación global (incluye integrantes con estudiante + contacto)
        return this.evaluarStage2All$(this.equipo);
      })
    );
  }
  private validarIntegranteCompleto$(integrante: any) {
    const nombre = `${integrante?.nombre ?? ''} ${integrante?.apellidoPaterno ?? ''}`.trim()
      || (integrante?.noControl ?? 'Integrante');

    const idUsuario = Number(integrante?.idUsuario ?? integrante?.IdUsuario ?? NaN);


    // Si ni siquiera tiene usuario asociado => ya falla
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      return of([`${nombre}: falta usuario asociado`]);
    }

    return this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(
      catchError(() => of(null)),
      switchMap((est: any) => {


        if (!est) {
          return of([`${nombre}: no existe registro de estudiante (por idUsuario)`]);
        }

        const falt: string[] = [];

        // USUARIO (correo institucional): EstudiantesController trae u.Correo en el join
        const correoUsuario = String(
          est?.correo ?? est?.Correo ?? integrante?.correoInstitucional ?? integrante?.CorreoInstitucional ?? ''
        ).trim();

        if (!correoUsuario) {
          falt.push(`${nombre}: Usuario: Correo institucional`);
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoUsuario)) {
          falt.push(`${nombre}: Usuario: Correo institucional (formato válido)`);
        }

        // PERFIL (estudiante)
        const rPerfil = this.validarPerfilCompleto(est);
        if (!rPerfil.ok) {
          // agrega faltantes con prefijo del integrante
          for (const f of (rPerfil.faltantes ?? [])) {
            falt.push(`${nombre}: ${f}`);
          }
        }

        // CONTACTO DE EMERGENCIA (obligatorio para etapa 2)
        const idCE = Number(est?.idContactoEmergencia ?? est?.IdContactoEmergencia ?? 0);

        const contacto$ = (idCE > 0)
          ? this.contactoEmergenciaSvc.getById(idCE).pipe(catchError(() => of(null)))
          : of(null);

        return contacto$.pipe(
          map((contacto: any) => {
            const rCE = this.validarContactoEmergenciaCompleto(contacto, est);
            if (!rCE.ok) {
              for (const f of (rCE.faltantes ?? [])) {
                falt.push(`${nombre}: ${f}`);
              }
            }
            return falt;
          })
        );
      })
    );
  }

  private validarIntegrantesProyecto$(equipo: any[]) {
    const integrantes = Array.isArray(equipo) ? equipo : [];

    const faltantesCupo = this.getValidacionCupoExacto(integrantes);

    if (integrantes.length === 0) {
      return of(faltantesCupo);
    }

    return forkJoin(
      integrantes.map(i => this.validarIntegranteCompleto$(i).pipe(catchError(() => of([`Integrante: error al validar`]))))
    ).pipe(
      map((arr: string[][]) => [...faltantesCupo, ...arr.flat().filter(Boolean)])
    );
  }

  onNativeFileChangeEtapa(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length ? input.files[0] : null;

    this.selectedFilesEtapa = file ? [file] : [];
  }

  limpiarArchivoEtapa(input: HTMLInputElement): void {
    this.selectedFilesEtapa = [];
    input.value = '';
  }

  onNativeAnteproyectoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.selectedFile = null;
      return;
    }

    const name = (file.name || '').toLowerCase();
    const ok = name.endsWith('.pdf');

    if (!ok) {
      this.toast.add({
        severity: 'warn',
        summary: 'Formato inválido',
        detail: 'Solo se permite PDF para el anteproyecto.',
        life: 8000
      });
      this.selectedFile = null;
      input.value = '';
      this.cdr.markForCheck();
      return;
    }

    this.selectedFile = file;
    this.cdr.markForCheck();
  }

  clearNativeAnteproyecto(input: HTMLInputElement): void {
    this.selectedFile = null;
    input.value = '';
    this.cdr.markForCheck();
  }

  onNativeFilesChangeEtapa(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFilesEtapa = Array.from(input.files ?? []);
    this.cdr.markForCheck();
  }

  clearNativeFilesEtapa(input: HTMLInputElement): void {
    this.selectedFilesEtapa = [];
    input.value = '';
    this.cdr.markForCheck();
  }

  removeSelectedFileEtapa(index: number, input: HTMLInputElement): void {
    this.selectedFilesEtapa.splice(index, 1);

    if (!this.selectedFilesEtapa.length) {
      input.value = '';
    }

    this.selectedFilesEtapa = [...this.selectedFilesEtapa];
    this.cdr.markForCheck();
  }

  onNativeReemplazoChange(event: Event, row: any): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) return;

    this.onSelectFileReemplazo({ files: [file] }, row);

    input.value = '';
    this.cdr.markForCheck();
  }

  formatFileSizeMB(size?: number): string {
    const mb = Number(size ?? 0) / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  }

}
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
