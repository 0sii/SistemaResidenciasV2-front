import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild, inject, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';

import { of, forkJoin } from 'rxjs';
import { catchError, concatMap, map, tap } from 'rxjs/operators';

import { EstudiantesService } from '../../../service/estudiantes.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { TokenService } from '../../../service/token.service';
import { DipomexService } from '../../../service/dipomex.service';
import { CatalogosService } from '../../../service/catalogos.service';
import { ContactoEmergenciaService } from '../../../service/contactoEmergencia.service';

import { Catalogo, Docente, DocenteCreate, EstudianteCreate, EstudianteDetail, UserUpdateRequest, Usuario } from '../../../Interface/InterfaceUsuario';
import { ContactoEmergencia } from '../../../Interface/InterfaceContactoEmergencia';
import { EstadoItem, MunicipioItem, CodigoPostalResponse } from '../../../service/dipomex.service';
import { Router } from '@angular/router';
import { DocentesService,  } from '../../../service/docentes.service';
import { DocumentosService,EstadoRevisionDocumento } from '../../../service/documentos.service';
import { HttpHeaders } from '@angular/common/http';
import { BrowserModule } from "@angular/platform-browser";
import { PdfJsViewerModule } from "ng2-pdfjs-viewer";
import { isPlatformBrowser } from '@angular/common';  // Importa la utilidad de Angular
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { FechaEsPipe } from '../../../pipe/fecha-es.pipe';

export type ActiveProfileType = 'usuario' | 'estudiante' | 'docente';

export interface ActiveProfile {
  type: ActiveProfileType;
  idUsuario: number;
  // opcional: snapshots cacheados para pintar rápido
  usuario?: any;
  estudiante?: any;
  docente?: any;
}

// ===== EXPEDIENTE =====
interface TipoExpedienteItem {
  id: number;
  descripcion: string;
}

interface DocumentoExpedienteItem {
  id: number;
  tipoDocumento: number;
  fechaSubida: string;
  nombreOriginal: string;
  contentType: string;
  tamanoBytes: number;
  urlExterna?: string | null;

  estadoRevision?: number;
  estadoRevisionTexto?: string;
  comentarioRevision?: string | null;
  fechaRevision?: string | null;
  revisadoPorUsuarioId?: number | null;
}

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ToastModule,
    DialogModule,
    SelectModule,
    InputTextModule,
    PdfJsViewerModule,
    NgxExtendedPdfViewerModule,
    FechaEsPipe
  ],
  templateUrl: './perfil.html',
  styleUrls: ['./perfil.css'],
  providers: [MessageService]
})
export class Perfil implements OnInit {
  pdfArrayBuffer: ArrayBuffer | null = null;
  pdfDialogVisible: boolean = false;
  selectedExpediente: any = null; // Aquí almacenas el expediente seleccionado
  expedienteMap: any = {};  // Este es tu mapa de expedientes
  downloadingTipo: number | null = null;  // Tipo de expediente que se está descargando
  uploadingTipo: number | null = null;  // Tipo de expediente que se está subiendo

  // ── Check masivo de expediente ───────────────────────────────────────────
  seleccionadosTipos: Set<number> = new Set();
  generandoPdfConsolidado = false;

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  private estudiantesSvc = inject(EstudiantesService);
  private usuariosSvc = inject(UsuariosService);
  private tokenSvc = inject(TokenService);
  private dipomexSvc = inject(DipomexService);
  private catalogosSvc = inject(CatalogosService);
  private contactoEmergenciaSvc = inject(ContactoEmergenciaService);
  private router = inject(Router);
  private documentosSvc = inject(DocumentosService);
  private toast = inject(MessageService);
  private tokenService = inject(TokenService);

  // ===== Permisos =====
  get canReadPerfil(): boolean {
    return this.usuariosSvc.hasPermission('Perfil-Read');
  }
  get canEditPerfil(): boolean {
    return this.usuariosSvc.hasPermission('Perfil-Edit');
  }

  // ===== Estado UI =====
  loading = true;
  editMode = false;

  loadingEstados = false;
  loadingMunicipios = false;

  estudiante: EstudianteDetail | null = null;

  carreras: Catalogo[] = [];
  dependenciaMedica: Catalogo[] = [];

  estados: EstadoItem[] = [];
  municipios: MunicipioItem[] = [];
  cpLookupLoading = false;
  cpLookupError = '';
  cpInfo: CodigoPostalResponse['codigo_postal'] | null = null;


  // 🔒 Este NO depende del form (para que no cambie mientras editas)
  correoInstitucionalHeader = '';


  // Para setear selects desde BD
  private pendingEstadoId: string | null = null;     // "01"
  private pendingMunicipioId: string | null = null;  // "001"

  // respaldo cancelar
  private backupRaw: any = null;



  // ===== Parentescos =====
  parentescos: string[] = [
    'Madre',
    'Padre',
    'Hermano(a)',
    'Tío(a)',
    'Abuelo(a)',
    'Tutor',
    'Otro'
  ];

  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private readonly rfcRegex =
    /^([A-Z&Ñ]{3,4})\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/i;

  // ===== Form Perfil =====
  form: FormGroup = this.fb.group({
    // No editables (solo vista)
    nombre: [{ value: '', disabled: true }],
    apellidoPaterno: [{ value: '', disabled: true }],
    apellidoMaterno: [{ value: '', disabled: true }],
    correoInstitucional: [{ value: '', disabled: true }, [Validators.required, Validators.pattern(this.emailRegex)]],

    noControl: [{ value: '', disabled: true }],
    carrera: [{ value: null, disabled: true }],


    // En tu form group agrega:
    rfc: ['', [Validators.pattern(this.rfcRegex)]],

    telefono: ['', [Validators.pattern(/^\d{10}$/)]],


    // Editables
    correoPersonal: ['', [Validators.pattern(this.emailRegex)]],
    telefonoCelular: ['', [Validators.pattern(/^\d{10}$/)]],
    domicilio: [''],
    ciudad: [''],
    cp: ['', [Validators.pattern(/^\d{5}$/)]],  // ✅ nuevo: CP 5 dígitos


    dependenciaMedica: [null], // number
    noSeguroSocial: [{ value: '', disabled: true }], // se habilita según dependencia

    // Contacto Emergencia
    idContactoEmergencia: [null],
    nombreContacto: [''],
    parentesco: [''],
    domicilioContacto: [''],
    telefonoContacto: ['', [Validators.pattern(/^\d{10}$/)]],
    emailContacto: ['', [Validators.pattern(this.emailRegex)]]
  });

  private docentesSvc = inject(DocentesService);

  docente: Docente | null = null;

  perfilTipo: 'estudiante' | 'docente' | 'usuario' = 'usuario';

  get isEstudiante(): boolean { return this.perfilTipo === 'estudiante'; }
  get isDocente(): boolean { return this.perfilTipo === 'docente'; }
  get isSoloUsuario(): boolean { return this.perfilTipo === 'usuario'; }

  tiposExpediente: TipoExpedienteItem[] = [];

  loadingExpediente = false;

    // ===================== EXPEDIENTE (CATÁLOGO COMPLETO FALLBACK) =====================
  // Si tu API no regresa todos los tipos, este catálogo asegura que el listado SIEMPRE esté completo.
  // IMPORTANTE: estos IDs deben coincidir con tu backend/BD. Si tu BD tiene IDs distintos, ajusta aquí.
  private readonly EXPEDIENTE_TIPOS_DEFAULT: TipoExpedienteItem[] = [
  { id: 1, descripcion: 'DICTAMEN DE AUTORIZACIÓN DE COMITÉ ACADÉMICO (CUANDO SEA NECESARIO)' },
  { id: 2, descripcion: 'SOLICITUD DE RESIDENCIA SELLADA POR LA DIVISIÓN DE ESTUDIOS PROFESIONALES' },
  { id: 3, descripcion: 'CRONOGRAMA REQUISITADO AL 100%' },
  { id: 4, descripcion: 'CARTA DE PRESENTACIÓN, CON SELLO DE LA EMPRESA, INSTITUCIÓN U ORGANIZACIÓN' },
  { id: 5, descripcion: 'CARTA DE ACEPTACIÓN SELLADA POR LA DIVISIÓN DE ESTUDIOS PROFESIONALES' },
  {
    id: 6,
    descripcion:
      'REPORTE PARCIAL No. 1 SELLADO POR LA DIV. DE EST. PROFESIONALES ACOMPAÑADO DE LA HOJA DE REVISORES FIRMANDO ASESOR INTERNO Y REV1 (SEMANA 6 DESPUÉS DEL INICIO)'
  },
  {
    id: 7,
    descripcion:
      'REPORTE PARCIAL No. 2 SELLADO POR LA DIV. DE EST. PROFESIONALES ACOMPAÑADO DE LA HOJA DE REVISORES FIRMANDO ASESOR INTERNO Y REV1 (SEMANA 12 DESPUÉS DEL INICIO)'
  },
  {
    id: 8,
    descripcion:
      'REPORTE FINAL SELLADO POR LA DIV. DE EST. PROFESIONALES ACOMPAÑADO DE LA HOJA DE REVISORES FIRMANDO ASESOR INTERNO Y REV1 (AL FINALIZAR LA RESIDENCIA)'
  },
  { id: 9, descripcion: 'CARTA DE TERMINACIÓN SELLADA POR LA DIVISIÓN DE ESTUDIOS PROFESIONALES' },
  { id: 10, descripcion: 'PORTADA CON FIRMA DE AUTORIZACIÓN' },
  {
    id: 11,
    descripcion:
      'ADJUNTAR EN CARPETA LOS PROYECTOS EN DIGITAL (SOFTWARE, MANUALES E INFORME TÉCNICO FINAL)'
  },
  { id: 12, descripcion: 'ACTA DE CALIFICACIÓN (ASESOR INTERNO)' },
];

  /** Normaliza un tipo que venga del backend (id/Id, descripcion/Descripcion, etc.) */
  private normalizeTipoExpediente(x: any): TipoExpedienteItem | null {
    const id = Number(x?.id ?? x?.Id);
    if (!Number.isFinite(id) || id <= 0) return null;

    const descripcion = String(x?.descripcion ?? x?.Descripcion ?? '').trim();
    return { id, descripcion };
  }

  /**
   * Mezcla lo que venga del backend con el catálogo default:
   * - Si API trae algunos => se respetan (y si descripcion viene vacía, usamos la del default).
   * - Si API no trae otros => se completan con default.
   * - Si API trae extras => también se agregan.
   */
  private buildTiposExpediente(apiTipos: any[]): TipoExpedienteItem[] {
    const map = new Map<number, TipoExpedienteItem>();

    // 1) Base: default completo
    for (const d of this.EXPEDIENTE_TIPOS_DEFAULT) {
      map.set(Number(d.id), { id: Number(d.id), descripcion: String(d.descripcion).trim() });
    }

    // 2) Overlay: lo de API
    for (const raw of (apiTipos ?? [])) {
      const n = this.normalizeTipoExpediente(raw);
      if (!n) continue;

      const prev = map.get(n.id);
      // Si API trae descripcion, úsala; si no, conserva la del default
      const descFinal = n.descripcion.length ? n.descripcion : (prev?.descripcion ?? '');
      map.set(n.id, { id: n.id, descripcion: descFinal });
    }

    // 3) Orden por ID
    return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
  }

  // validación front extra
  private readonly maxPdfBytes = 15 * 1024 * 1024; // 15MB (ajústalo si tu back permite más)

  private readonly TIPO_CD_ZIP = 11;
private readonly TIPO_ACTA = 12;

private readonly maxZipBytes = 300 * 1024 * 1024; // 300MB (ajusta)

  displayDialog: boolean = false;  // Controla la visibilidad del diálogo
  pdfUrl: string | null = null;

  @ViewChild('fileInput') fileInput: ElementRef | undefined;  // Aquí se define la propiedad 'fileInput'
  public isBrowser: boolean = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object, private sanitizer: DomSanitizer) {
    this.isBrowser = isPlatformBrowser(platformId);
  }


  async ngOnInit(): Promise<void> {

    if (this.isBrowser) {
      // Importar dinámicamente el módulo solo en el navegador
      const { PdfViewerModule } = await import('ng2-pdf-viewer');
    }
    if (!this.canReadPerfil) {
      this.loading = false;
      this.toast.add({ severity: 'error', summary: 'Sin acceso', detail: 'No tienes permisos para ver el perfil.', life: 10000 });
      return;
    }

    // Municipio arranca deshabilitado
    this.form.get('municipio')?.disable({ emitEvent: false });

    // Carga inicial de los catálogos
    this.cargarCatalogosBase();

    // NSS se habilita solo si eliges dependencia médica
    this.form.get('dependenciaMedica')?.valueChanges.subscribe(depId => {
      const noSS = this.form.get('noSeguroSocial');
      if (depId) noSS?.enable({ emitEvent: false });
      else {
        noSS?.reset('', { emitEvent: false });
        noSS?.disable({ emitEvent: false });
      }
    });

    // Cargar el perfil basado en el rol
    this.perfilTipo = this.resolvePerfilTipoFromActiveRole();
    this.initLoadPerfilByRole();
  }



  readonly EstadoRevisionDocumento = EstadoRevisionDocumento;

revisionDialogVisible = false;
revisionDialogTitulo = 'Observaciones del documento';
revisionDialogMensaje = '';

getEstadoRevision(doc: any): number {
  return Number(doc?.estadoRevision ?? doc?.EstadoRevision ?? 0);
}

getEstadoRevisionTexto(doc: any): string {
  const estado = this.getEstadoRevision(doc);

  switch (estado) {
    case EstadoRevisionDocumento.Aceptado:
      return 'Aceptado';
    case EstadoRevisionDocumento.Rechazado:
      return 'Rechazado';
    default:
      return 'En revisión';
  }
}

getEstadoRevisionClase(doc: any): string {
  const estado = this.getEstadoRevision(doc);

  switch (estado) {
    case EstadoRevisionDocumento.Aceptado:
      return 'bg-emerald-100 text-emerald-700';
    case EstadoRevisionDocumento.Rechazado:
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-amber-100 text-amber-700';
  }
}

isDocumentoAceptado(doc: any): boolean {
  return this.getEstadoRevision(doc) === EstadoRevisionDocumento.Aceptado;
}

isDocumentoRechazado(doc: any): boolean {
  return this.getEstadoRevision(doc) === EstadoRevisionDocumento.Rechazado;
}

isDocumentoEnRevision(doc: any): boolean {
  return this.getEstadoRevision(doc) === EstadoRevisionDocumento.EnRevision;
}

puedeEditarDocumento(tipo: number): boolean {
  if (!this.canEditPerfil) return false;
  if (Number(tipo) === this.TIPO_ACTA) return false;

  const doc = this.expedienteMap?.[tipo];
  if (!doc) return true;

  // Solo se puede reemplazar si está rechazado
  return this.isDocumentoRechazado(doc);
}

puedeVerMotivo(tipo: number): boolean {
  const doc = this.expedienteMap?.[tipo];
  return !!doc && this.isDocumentoRechazado(doc) && !!String(doc?.comentarioRevision ?? '').trim();
}

abrirDialogoRevision(doc: any): void {
  this.revisionDialogTitulo = 'Motivo del rechazo';
  this.revisionDialogMensaje = String(doc?.comentarioRevision ?? '').trim() || 'Sin observaciones.';
  this.revisionDialogVisible = true;
}

cerrarDialogoRevision(): void {
  this.revisionDialogVisible = false;
  this.revisionDialogTitulo = 'Observaciones del documento';
  this.revisionDialogMensaje = '';
}

private mapDocumentoExpediente(d: any, tipo: number): DocumentoExpedienteItem {
  return {
    id: Number(d?.id ?? d?.Id),
    tipoDocumento: tipo,
    fechaSubida: String(d?.fechaSubida ?? d?.FechaSubida ?? ''),
    nombreOriginal: String(d?.nombreOriginal ?? d?.NombreOriginal ?? ''),
    contentType: String(d?.contentType ?? d?.ContentType ?? 'application/pdf'),
    tamanoBytes: Number(d?.tamanoBytes ?? d?.TamanoBytes ?? 0),
    urlExterna: String(d?.urlExterna ?? d?.UrlExterna ?? '').trim() || null,

    estadoRevision: Number(d?.estadoRevision ?? d?.EstadoRevision ?? 0),
    estadoRevisionTexto: String(d?.estadoRevisionTexto ?? d?.EstadoRevisionTexto ?? ''),
    comentarioRevision: String(d?.comentarioRevision ?? d?.ComentarioRevision ?? '').trim() || null,
    fechaRevision: String(d?.fechaRevision ?? d?.FechaRevision ?? '').trim() || null,
    revisadoPorUsuarioId: d?.revisadoPorUsuarioId != null
      ? Number(d?.revisadoPorUsuarioId)
      : (d?.RevisadoPorUsuarioId != null ? Number(d?.RevisadoPorUsuarioId) : null)
  };
}

  getAcceptForTipo(tipo: number): string {
  if (Number(tipo) === this.TIPO_CD_ZIP) return '.zip,.rar,application/zip,application/vnd.rar';
  return 'application/pdf,.pdf';
}


  // ── Check masivo de expediente ───────────────────────────────────────────

  get todosMarcados(): boolean {
    const ids = this.tiposExpediente.filter(t => t.id !== 12 && this.expedienteMap[t.id]).map(t => t.id);
    return ids.length > 0 && ids.every(id => this.seleccionadosTipos.has(id));
  }

  get algunoMarcado(): boolean { return this.seleccionadosTipos.size > 0; }

  toggleSeleccion(tipoId: number): void {
    if (this.seleccionadosTipos.has(tipoId)) this.seleccionadosTipos.delete(tipoId);
    else this.seleccionadosTipos.add(tipoId);
    this.seleccionadosTipos = new Set(this.seleccionadosTipos);
  }

  toggleSeleccionTodos(): void {
    const ids = this.tiposExpediente.filter(t => t.id !== 12 && this.expedienteMap[t.id]).map(t => t.id);
    this.seleccionadosTipos = this.todosMarcados ? new Set() : new Set(ids);
  }

  generarPDFConsolidado(): void {
    if (!this.algunoMarcado) return;
    this.generandoPdfConsolidado = true;
    this.documentosSvc.descargarExpedienteSeleccionados(Array.from(this.seleccionadosTipos)).subscribe({
      next: (blob: Blob) => {
        this.generandoPdfConsolidado = false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Expediente_Seleccionado_${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: any) => {
        this.generandoPdfConsolidado = false;
        console.error('Error generando PDF:', err);
      }
    });
  }

canSubirExpediente(tipo: number): boolean {
  // tipo 13 lo sube el asesor interno
  return Number(tipo) !== this.TIPO_ACTA;
}

canPreviewPdf(tipo: number): boolean {
  if (Number(tipo) === this.TIPO_CD_ZIP) return false;
  const ct = String(this.expedienteMap?.[tipo]?.contentType ?? '').toLowerCase();
  return ct.includes('pdf') || Number(tipo) !== this.TIPO_CD_ZIP;
}

  // ✅ Solo 1 toast para fallas de carga inicial (catálogos/perfil)
  private initToastShown = false;

  private showInitLoadErrorOnce(): void {
    if (this.initToastShown) return;
    this.initToastShown = true;

    this.toast.add({
      severity: 'warn',
      summary: 'Carga incompleta',
      detail: 'No se pudieron cargar algunos datos del perfil. Recarga la página o intenta más tarde.',
      life: 8000
    });
  }

  // Cargar catálogos base (Carreras, Dependencias Médicas, Estados)
  private cargarCatalogosBase(): void {
    // Cargar carreras
    this.catalogosSvc.getAll().subscribe({
      next: (res: any) => {
        this.carreras = (res ?? []).filter((x: any) => x?.activo !== false);
        this.cdr.markForCheck();
      },
      error: (e) => {
        console.error('Error carreras', e);
        this.showInitLoadErrorOnce();

      }
    });

    // Cargar dependencia médica
    this.catalogosSvc.getActivasDependenciaMedica().subscribe({
      next: (res: any) => {
        this.dependenciaMedica = res ?? [];
        this.cdr.markForCheck();
      },
      error: (e) => {
        console.error('Error dependencia médica', e);
        this.showInitLoadErrorOnce();
      }
    });

    // Cargar estados (Dipomex)
    this.loadingEstados = true;
    this.dipomexSvc.getEstados().subscribe({
      next: (res: any) => {
        this.loadingEstados = false;
        if (res?.error) {
          this.showInitLoadErrorOnce();
          return;
        }

        this.estados = res.estados ?? [];
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.loadingEstados = false;
        console.error('Error estados', e);
        this.showInitLoadErrorOnce();
      }
    });
  }

  // Cargar el perfil dependiendo del rol (Estudiante o Docente)
  private initLoadPerfilByRole(): void {
  this.loading = true;

  // ✅ Usuario fresco: primero localStorage (lo que tú actualizas en guardar),
  // y si no existe, cae a tokenSvc
  const sessionUser = this.getSessionUserFresh();
  const idUsuario = Number(sessionUser?.id ?? NaN);

  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    this.loading = false;
    this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo identificar tu usuario.', life: 10000 });
    return;
  }

  // Patch base usuario (siempre)
  this.correoInstitucionalHeader = sessionUser?.correo ?? '';

  this.form.patchValue({
    nombre: sessionUser?.nombre ?? '',
    apellidoPaterno: sessionUser?.apellidoPaterno ?? '',
    apellidoMaterno: sessionUser?.apellidoMaterno ?? '',
    correoInstitucional: sessionUser?.correo ?? '',
  }, { emitEvent: false });

  if (this.perfilTipo === 'estudiante') {
    this.loadAsEstudiante(idUsuario);
    return;
  }

  if (this.perfilTipo === 'docente') {
    this.loadAsDocente(idUsuario);
    return;
  }

  this.disableStudentControls();
  this.disableDocenteControls();
  this.loading = false;
  this.cdr.markForCheck();
}

/** ✅ helper: lee auth_user directo de localStorage para evitar cache del tokenSvc */
private getSessionUserFresh(): any {
  try {
    if (typeof window !== 'undefined' && window?.sessionStorage) {
      const raw = sessionStorage.getItem('auth_user');
      if (raw) return JSON.parse(raw);
    }
  } catch {}

  return this.tokenSvc.getUser();
}

  estadoTexto(): string {
    if (this.cpInfo?.estado) return this.cpInfo.estado;
    return '-';
  }

  municipioTexto(): string {
    if (this.cpInfo?.municipio) return this.cpInfo.municipio;
    return '-';
  }



    private loadAsEstudiante(idUsuario: number): void {
    this.enableStudentControlsReadOnly();

    this.loadingExpediente = true; // Empieza junto con el perfil

    forkJoin({
      estudiante: this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(catchError(() => of(null))),
      carreras: this.catalogosSvc.getAll().pipe(catchError(() => of([]))),
      depMed: this.catalogosSvc.getActivasDependenciaMedica().pipe(catchError(() => of([]))),
      estadosRes: this.dipomexSvc.getEstados().pipe(catchError(() => of({ error: true, estados: [] }))),
      tiposExp: this.documentosSvc.getTiposExpediente().pipe(catchError(() => of([]))),
      docsExp: this.documentosSvc.getMisExpediente().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ estudiante, carreras, depMed, estadosRes, tiposExp, docsExp }: any) => {
        // Si no hay estudiante, mostrar datos de usuario
        if (!estudiante) {
          this.perfilTipo = 'usuario';
          this.estudiante = null;
          this.disableStudentControls();
          this.loading = false;
          this.loadingExpediente = false;
          this.cdr.markForCheck();

          this.toast.add({
            severity: 'warn',
            summary: 'Sin registro',
            detail: 'Este rol es Estudiante, pero no hay registro de estudiante. Mostrando datos de usuario.',
            life: 10000
          });
          return;
        }

        this.estudiante = estudiante as any;

        // Cargar catálogos
        this.carreras = (carreras ?? []).filter((x: any) => x?.activo !== false);
        this.dependenciaMedica = depMed ?? [];

        // Cargar estados
        this.estados = estadosRes?.error ? [] : (estadosRes.estados ?? []);

        // ✅ Nuevo flujo basado en CP
        const cpDb = String((this.estudiante as any)?.cp ?? '').trim();
        if (cpDb) {
          this.form.patchValue({ cp: cpDb }, { emitEvent: false });
          if (typeof (this as any).onCpInput === 'function') (this as any).onCpInput();
        }

        this.form.patchValue({
          noControl: (this.estudiante as any).noControl ?? '',
          carrera: (this.estudiante as any).idcarrera ?? null,
          correoPersonal: (this.estudiante as any).correoPersonal ?? '',
          telefonoCelular: (this.estudiante as any).telefonoCelular ?? '',
          domicilio: (this.estudiante as any).domicilio ?? '',
          ciudad: (this.estudiante as any).ciudad ?? '',
          cp: (this.estudiante as any).cp ?? '',
          dependenciaMedica: (this.estudiante as any).idDependenciaMedica ?? null,
          noSeguroSocial: (this.estudiante as any).noSeguroSocial ?? '',
          idContactoEmergencia: (this.estudiante as any).idContactoEmergencia ?? null
        }, { emitEvent: false });

        const cp = String((this.estudiante as any).cp ?? '').trim();
        if (cp) {
          this.form.patchValue({ cp }, { emitEvent: false });
          this.onCpInput();
        }

        // ✅ Cargar contacto de emergencia
        const idContacto = Number((this.estudiante as any).idContactoEmergencia ?? NaN);
        if (Number.isFinite(idContacto) && idContacto > 0) {
          this.contactoEmergenciaSvc.getById(idContacto).subscribe({
            next: (c: any) => {
              const id = Number(c?.id ?? c?.Id ?? idContacto);

              this.form.patchValue({
                idContactoEmergencia: id,
                nombreContacto: String(c?.nombre ?? c?.Nombre ?? '').trim(),
                parentesco: String(c?.parentesco ?? c?.Parentesco ?? '').trim(),
                domicilioContacto: String(c?.domicilio ?? c?.Domicilio ?? '').trim(),
                telefonoContacto: String(c?.telefono ?? c?.Telefono ?? '').trim(),
                emailContacto: String(c?.email ?? c?.Email ?? '').trim(),
              }, { emitEvent: false });

              this.cdr.markForCheck();
            },
            error: (e) => console.error('Error contacto emergencia', e)
          });
        }

        // ===================== EXPEDIENTE (AQUÍ SE COMPLETA LISTADO) =====================
        // Antes: this.tiposExpediente = (tiposExp ?? []) as any[];
        // Ahora: mezclamos con el catálogo completo (13 docs)
       this.tiposExpediente = this.buildTiposExpediente(tiposExp ?? []);
this.tiposExpediente = (this.tiposExpediente ?? []).filter(t => Number(t.id) !== 12);

const map: Record<number, DocumentoExpedienteItem | null> = {};
for (const t of this.tiposExpediente) {
  map[Number(t.id)] = null;
}

for (const d of (docsExp ?? []) as any[]) {
  const tipo = Number(d?.tipoDocumento ?? d?.TipoDocumento);
  if (!Number.isFinite(tipo)) continue;

  map[tipo] = this.mapDocumentoExpediente(d, tipo);
}

this.expedienteMap = { ...map };
this.loadingExpediente = false;
this.loading = false;
this.cdr.detectChanges();

        this.expedienteMap = map;
        this.loadingExpediente = false;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.loadingExpediente = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar perfil estudiante.', life: 10000 });
        this.cdr.markForCheck();
      }
    });
  }







  //////////////////////////////////////////////////////////////////////////////

  reloadExpediente(): void {
    if (!this.isEstudiante) return;
    this.loadExpediente();
  }

  private loadExpediente(): void {
  this.loadingExpediente = true;

  forkJoin({
    tipos: this.documentosSvc.getTiposExpediente().pipe(catchError(() => of([]))),
    docs: this.documentosSvc.getMisExpediente().pipe(catchError(() => of([])))
  }).subscribe({
    next: ({ tipos, docs }: any) => {
      this.tiposExpediente = this.buildTiposExpediente(tipos ?? []);
      this.tiposExpediente = (this.tiposExpediente ?? []).filter(t => Number(t.id) !== 13);

      const map: Record<number, DocumentoExpedienteItem | null> = {};
      for (const t of this.tiposExpediente) {
        map[Number(t.id)] = null;
      }

      for (const d of (docs ?? []) as DocumentoExpedienteItem[]) {
        const tipo = Number((d as any).tipoDocumento ?? (d as any).TipoDocumento);
        if (!Number.isFinite(tipo)) continue;

        map[tipo] = this.mapDocumentoExpediente(d, tipo);
      }

      this.expedienteMap = { ...map };
      this.loadingExpediente = false;
      this.cdr.detectChanges();
    },
    error: () => {
      this.loadingExpediente = false;
      this.toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo cargar el expediente.',
        life: 10000
      });
      this.cdr.detectChanges();
    }
  });
}




  isInvalid(ctrlName: string): boolean {
    const c = this.form.get(ctrlName);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  isValidTyped(ctrlName: string): boolean {
    const c = this.form.get(ctrlName);
    return !!(c && c.valid && (c.dirty || c.touched) && String(c.value ?? '').trim().length > 0);
  }


  private loadAsDocente(idUsuario: number): void {
    this.enableDocenteControlsReadOnly();
    this.disableStudentControls(); // limpia/inhabilita alumno

    this.docentesSvc.getByIdUsuario(idUsuario).pipe(

      catchError(() => of(null))
    ).subscribe({
      next: (doc: any) => {
        if (!doc) {
          // si rol dice docente pero no hay registro, caemos a usuario
          this.perfilTipo = 'usuario';
          this.docente = null;
          this.disableDocenteControls();
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }

        this.docente = doc as any;

        this.form.patchValue({
          rfc: (this.docente as any).rfc ?? (this.docente as any).RFC ?? '',
          telefono: (this.docente as any).telefono ?? (this.docente as any).Telefono ?? ''
        }, { emitEvent: false });

        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar perfil docente.', life: 10000 });
        this.cdr.markForCheck();
      }
    });
  }



  private resolvePerfilTipoFromActiveRole(): 'usuario' | 'estudiante' | 'docente' {
    // fuente de verdad: rol activo guardado por sidebar
    const rol = this.usuariosSvc.getActiveRoleSync(); // Catalogo | null
    const desc = String(rol?.descripcion ?? '').trim().toLowerCase();

    // Regla simple y robusta
    if (desc.includes('estudiante') || desc.includes('alumno')) return 'estudiante';
    if (desc.includes('docente') || desc.includes('profesor')) return 'docente';
    return 'usuario';
  }




  // ========================= Texto Vista =========================
  fullName(): string {
    if (!this.estudiante) return '';
    return `${this.estudiante.nombre} ${this.estudiante.apellidoPaterno} ${this.estudiante.apellidoMaterno}`.trim();
  }

  carreraTexto(): string {
    const id = this.form.get('carrera')?.value;
    if (!id) return '-';
    const c = this.carreras.find(x => Number(x.id) === Number(id));
    return c?.descripcion ?? `Carrera #${id}`;
  }

  dependenciaTexto(): string {
    const id = this.form.get('dependenciaMedica')?.value;
    if (!id) return '-';
    const d = this.dependenciaMedica.find(x => Number(x.id) === Number(id));
    return d?.descripcion ?? `Dependencia #${id}`;
  }


  // ========================= Edición =========================
  entrarModoEdicion(): void {
    if (!this.canEditPerfil) {
      this.toast.add({ severity: 'error', summary: 'Sin permiso', detail: 'No tienes permisos para editar el perfil.', life: 10000 });
      return;
    }

    this.backupRaw = this.form.getRawValue();
    this.editMode = true;

    // ✅ generales editables
    this.form.get('nombre')?.enable({ emitEvent: false });
    this.form.get('apellidoPaterno')?.enable({ emitEvent: false });
    this.form.get('apellidoMaterno')?.enable({ emitEvent: false });

    // ✅ si vas a permitir editar correo institucional:
    this.form.get('correoInstitucional')?.enable({ emitEvent: false });

    if (this.isEstudiante) {
      this.form.get('carrera')?.enable({ emitEvent: false });
      ['correoPersonal', 'telefonoCelular', 'domicilio', 'ciudad', 'cp', 'dependenciaMedica',
        'nombreContacto', 'parentesco', 'domicilioContacto', 'telefonoContacto', 'emailContacto'
      ].forEach(k => this.form.get(k)?.enable({ emitEvent: false }));


    }

    if (this.isDocente) {
      ['rfc', 'telefono'].forEach(k => this.form.get(k)?.enable({ emitEvent: false }));
    }

    this.cdr.markForCheck();
  }


  onCpInput(): void {
    const ctrl = this.form.get('cp');
    if (!ctrl) return;

    // solo dígitos y max 5
    let v = String(ctrl.value ?? '').replace(/\D/g, '').slice(0, 5);
    if (v !== ctrl.value) ctrl.setValue(v, { emitEvent: false });

    // reset visual si está incompleto
    if (v.length !== 5) {
      this.cpInfo = null;
      this.cpLookupError = v.length === 0 ? '' : 'El CP debe tener 5 dígitos.';
      this.cdr.markForCheck();
      return;
    }

    // buscar
    this.cpLookupLoading = true;
    this.cpLookupError = '';
    this.cpInfo = null;

    this.dipomexSvc.getCodigoPostal(v).subscribe({
      next: (res) => {
        this.cpLookupLoading = false;

        if (!res || (res as any).error) {
          this.cpInfo = null;
          this.cpLookupError = (res as any)?.message || 'No se encontró información para el CP.';
          this.cdr.markForCheck();
          return;
        }

        this.cpInfo = res.codigo_postal;
        this.cpLookupError = '';
        this.cdr.markForCheck();
      },
      error: () => {
        this.cpLookupLoading = false;
        this.cpInfo = null;
        this.cpLookupError = 'Error consultando Dipomex.';
        this.cdr.markForCheck();
      }
    });
  }


  cancelarEdicion(): void {
    if (this.backupRaw) {
      this.form.patchValue(this.backupRaw, { emitEvent: false });
    }

    this.editMode = false;
    this.backupRaw = null;

    // regreso a read-only
    ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'correoInstitucional', 'carrera', 'correoPersonal', 'telefonoCelular',
      'domicilio', 'ciudad', 'estado', 'municipio', 'dependenciaMedica', 'noSeguroSocial',
      'nombreContacto', 'parentesco', 'domicilioContacto', 'telefonoContacto', 'emailContacto',
      'rfc', 'telefono'
    ].forEach(k => this.form.get(k)?.disable({ emitEvent: false }));

    this.cdr.markForCheck();
  }



  guardar(): void {
    if (!this.canEditPerfil) {
      this.toast.add({ severity: 'error', summary: 'Sin permiso', detail: 'No tienes permisos para editar el perfil.', life: 10000 });
      return;
    }

    const raw = this.form.getRawValue();

    // Validación correo institucional (si lo vas a permitir editar)
    const correoInstitucional = String(raw.correoInstitucional ?? '').trim().toLowerCase();
    if (!this.emailRegex.test(correoInstitucional)) {
      this.toast.add({ severity: 'warn', summary: 'Revisa', detail: 'El correo institucional no tiene formato válido.', life: 10000 });
      return;
    }

    // usuario id desde sesión
    const sessionUser = this.tokenSvc.getUser();
    const idUsuario = Number(sessionUser?.id ?? NaN);
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo identificar tu usuario.', life: 10000 });
      return;
    }

    // 1) UPDATE USUARIO (siempre)
    const usuarioUpdate: UserUpdateRequest = {
      correo: correoInstitucional,
      activo: true,
      nombre: String(raw.nombre ?? '').trim(),
      apellidoPaterno: String(raw.apellidoPaterno ?? '').trim(),
      apellidoMaterno: String(raw.apellidoMaterno ?? '').trim(),
    };

    // helper: al guardar usuario, actualiza localStorage auth_user para que el header no se quede viejo
    const syncSessionUser = () => {
  const next = { ...(sessionUser ?? {}), ...usuarioUpdate, id: idUsuario };

  try {
    sessionStorage.setItem('auth_user', JSON.stringify(next));
  } catch {}
};

    // 2) Rama estudiante
    if (this.perfilTipo === 'estudiante') {
      if (!this.estudiante) {
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No hay registro de estudiante.', life: 10000 });
        return;
      }

      const tel = String(raw.telefonoCelular ?? '').trim();
      if (tel && !/^\d{10}$/.test(tel)) {
        this.toast.add({ severity: 'warn', summary: 'Revisa', detail: 'El teléfono debe tener 10 dígitos.', life: 10000 });
        return;
      }

      const correoP = String(raw.correoPersonal ?? '').trim();
      if (correoP && !this.emailRegex.test(correoP)) {
        this.toast.add({ severity: 'warn', summary: 'Revisa', detail: 'El correo personal no tiene formato válido.', life: 10000 });
        return;
      }

      const existingContactoId = Number(raw.idContactoEmergencia ?? 0);

// ✅ Normalizador: convierte '' -> null (para que pase CHECKs de BD)
const n = (v: any): string | null => {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
};

// ✅ Payload con nulls reales (NO strings vacíos)
const contactoPayload: any = {
  id: existingContactoId > 0 ? existingContactoId : 0,
  nombre: n(raw.nombreContacto),
  parentesco: n(raw.parentesco),
  domicilio: n(raw.domicilioContacto),
  telefono: n(raw.telefonoContacto),
  email: n(raw.emailContacto),
};

// ✅ “tieneDatos” basado en valores ya normalizados
const tieneDatos =
  !!contactoPayload.nombre ||
  !!contactoPayload.parentesco ||
  !!contactoPayload.domicilio ||
  !!contactoPayload.telefono ||
  !!contactoPayload.email;

this.usuariosSvc.update(idUsuario, usuarioUpdate).pipe(
  tap(() => syncSessionUser()),

  // ✅ UPSERT contacto emergencia (permitiendo nulls)
  concatMap(() => {
    // Si no hay datos, no tocar contacto (evita llamadas innecesarias)
    if (!tieneDatos) {
      return of<number | null>(existingContactoId > 0 ? existingContactoId : null);
    }

    if (existingContactoId > 0) {
      return this.contactoEmergenciaSvc
        .update(existingContactoId, contactoPayload)
        .pipe(map(() => existingContactoId as number));
    }

    // Create: el controller regresa "Id" (no "id")
    return this.contactoEmergenciaSvc
      .create({ ...contactoPayload, id: 0 })
      .pipe(
        map((nuevo: any) => {
          const newId = Number(nuevo?.id ?? nuevo?.Id ?? null);
          return Number.isFinite(newId) && newId > 0 ? newId : null;
        })
      );
  }),

  // ... tu concatMap de update estudiante se queda igual
  concatMap((contactoId: number | null) => {
    if (!this.estudiante) return of(void 0);

    const depMed = raw.dependenciaMedica != null && raw.dependenciaMedica !== ''
      ? Number(raw.dependenciaMedica)
      : null;

    const nss = depMed ? (String(raw.noSeguroSocial ?? '').trim() || null) : null;

    const cp = String(raw.cp ?? '').trim() || null;
    if (cp && !/^\d{5}$/.test(cp)) {
      this.toast.add({ severity: 'warn', summary: 'Revisa', detail: 'El CP debe tener 5 dígitos.', life: 10000 });
      return of(void 0);
    }

    const idEstadoFromCp =
      (this as any).cpInfo?.estado_id != null ? Number((this as any).cpInfo.estado_id) : null;

    const payloadEst: any = {
      idUsuario,
      idProyecto: (this.estudiante as any).idProyecto ?? null,
      nombre: String(raw.nombre ?? '').trim(),
      apellidoPaterno: String(raw.apellidoPaterno ?? '').trim(),
      apellidoMaterno: String(raw.apellidoMaterno ?? '').trim(),
      idcarrera: raw.carrera != null && raw.carrera !== '' ? Number(raw.carrera) : null,
      domicilio: String(raw.domicilio ?? '').trim() || null,
      ciudad: String(raw.ciudad ?? '').trim() || null,
      cp,
      idestado: idEstadoFromCp,
      noControl: String(raw.noControl ?? '').trim() || null,
      correoPersonal: (String(raw.correoPersonal ?? '').trim() || null),
      telefonoCelular: (String(raw.telefonoCelular ?? '').trim() || null),
      idDependenciaMedica: depMed,
      noSeguroSocial: nss,
      idContactoEmergencia: contactoId ?? (existingContactoId > 0 ? existingContactoId : null),
    };

    return this.estudiantesSvc.update(this.estudiante.id, payloadEst);
  })
).subscribe({
  next: () => {
    this.correoInstitucionalHeader = correoInstitucional;
    this.toast.add({ severity: 'success', summary: 'OK', detail: 'Perfil actualizado.', life: 10000 });
    this.editMode = false;
    this.backupRaw = null;
    this.postSaveResetReadOnly();
    this.perfilTipo = this.resolvePerfilTipoFromActiveRole();
    this.initLoadPerfilByRole();
  },
  error: (err) => {
    console.error('Error actualizando perfil:', err);
    const msg =
      err?.error?.message ||
      err?.error?.detail ||
      (typeof err?.error === 'string' ? err.error : null) ||
      err?.message ||
      'No se pudo actualizar el perfil.';
    this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 10000 });
  }
});

      return;
    }

    // 3) Rama docente
    if (this.perfilTipo === 'docente') {
      if (!this.docente) {
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'No hay registro de docente.', life: 10000 });
        return;
      }

      const payloadDoc: any = {
        idUsuario,
        nombre: String(raw.nombre ?? '').trim(),
        apellidoPaterno: String(raw.apellidoPaterno ?? '').trim(),
        apellidoMaterno: String(raw.apellidoMaterno ?? '').trim(),
        rfc: String(raw.rfc ?? '').trim() || null,
        telefono: String(raw.telefono ?? '').trim() || null,
      };

      this.usuariosSvc.update(idUsuario, usuarioUpdate).pipe(
        tap(() => syncSessionUser()),
        concatMap(() => this.docentesSvc.update(this.docente!.id, payloadDoc))
      ).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'OK', detail: 'Perfil actualizado.', life: 10000 });
          this.correoInstitucionalHeader = correoInstitucional;

          this.editMode = false;
          this.backupRaw = null;
          this.postSaveResetReadOnly();
          this.perfilTipo = this.resolvePerfilTipoFromActiveRole();
          this.initLoadPerfilByRole();
        },
        error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el perfil.', life: 10000 })
      });

      return;
    }

    // 4) Solo usuario
    this.usuariosSvc.update(idUsuario, usuarioUpdate).subscribe({
      next: () => {
        syncSessionUser();
        this.toast.add({ severity: 'success', summary: 'OK', detail: 'Perfil actualizado.', life: 10000 });
        this.correoInstitucionalHeader = correoInstitucional;

        this.editMode = false;
        this.backupRaw = null;
        this.postSaveResetReadOnly();
        this.initLoadPerfilByRole();
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el perfil.', life: 10000 })
    });
  }

  private disableStudentControls() {
    const keys = [
      'noControl', 'carrera', 'correoPersonal', 'telefonoCelular', 'domicilio', 'ciudad', 'estado', 'municipio',
      'dependenciaMedica', 'noSeguroSocial',
      'idContactoEmergencia', 'nombreContacto', 'parentesco', 'domicilioContacto', 'telefonoContacto', 'emailContacto'
    ];
    keys.forEach(k => this.form.get(k)?.disable({ emitEvent: false }));
    // limpia valores visibles
    this.form.patchValue({
      noControl: '', carrera: null, correoPersonal: '', telefonoCelular: '', domicilio: '', ciudad: '',
      estado: null, municipio: null, dependenciaMedica: null, noSeguroSocial: '',
      idContactoEmergencia: null, nombreContacto: '', parentesco: '', domicilioContacto: '',
      telefonoContacto: '', emailContacto: ''
    }, { emitEvent: false });
  }

  private enableStudentControlsReadOnly() {
    // read-only hasta que entres en editMode
    this.form.get('noControl')?.disable({ emitEvent: false });
    this.form.get('carrera')?.disable({ emitEvent: false });

    ['correoPersonal', 'telefonoCelular', 'domicilio', 'ciudad', 'estado', 'municipio', 'dependenciaMedica', 'noSeguroSocial',
      'nombreContacto', 'parentesco', 'domicilioContacto', 'telefonoContacto', 'emailContacto'
    ].forEach(k => this.form.get(k)?.disable({ emitEvent: false }));
  }

  private disableDocenteControls() {
    ['rfc', 'telefono'].forEach(k => this.form.get(k)?.disable({ emitEvent: false }));
    this.form.patchValue({ rfc: '', telefono: '' }, { emitEvent: false });
  }

  private enableDocenteControlsReadOnly() {
    ['rfc', 'telefono'].forEach(k => this.form.get(k)?.disable({ emitEvent: false }));
  }



  private postSaveResetReadOnly() {
    // deja todo read-only excepto cuando editMode=true
    this.form.get('carrera')?.disable({ emitEvent: false });
    this.form.get('municipio')?.disable({ emitEvent: false });
  }







  // ========================= Seguridad =========================
  abrirCambioPassword(): void {
    if (!this.canEditPerfil) return;
    this.router.navigate(['/changePassword']);
  }



  // ========================= Utils =========================
  digitsOnly(controlName: string, maxLen: number): void {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;
    const only = String(ctrl.value ?? '').replace(/\D/g, '').slice(0, maxLen);
    if (only !== ctrl.value) ctrl.setValue(only, { emitEvent: false });
  }

  private tieneDatosContacto(): boolean {
    const v = this.form.getRawValue(); // raw, por consistencia
    return !!(
      String(v.nombreContacto ?? '').trim() ||
      String(v.parentesco ?? '').trim() ||
      String(v.domicilioContacto ?? '').trim() ||
      String(v.telefonoContacto ?? '').trim() ||
      String(v.emailContacto ?? '').trim()
    );
  }

copiarTexto(text: string | null | undefined): void {
  const t = (text ?? '').trim();
  if (!t) return;

  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(t)
      .then(() => this.toast.add({ severity: 'success', summary: 'Copiado', detail: 'Enlace copiado al portapapeles.', life: 2500 }))
      .catch(() => this.toast.add({ severity: 'warn', summary: 'No se pudo copiar', detail: 'Copia manualmente el enlace.', life: 4000 }));
  } else {
    // fallback simple
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    this.toast.add({ severity: 'success', summary: 'Copiado', detail: 'Enlace copiado al portapapeles.', life: 2500 });
  }
}

  openPdfViewer(tipoExpedienteId: number): void {
    this.selectedExpediente = this.expedienteMap[tipoExpedienteId];
    if (!this.selectedExpediente || !this.isBrowser) return;

    const token = this.tokenService.getToken();
    if (!token) {
      this.toast.add({
        severity: 'warn',
        summary: 'Sesión requerida',
        detail: 'Inicia sesión nuevamente para ver el documento.',
        life: 7000
      });
      return;
    }

    this.documentosSvc.verExpedientePdfArrayBuffer(tipoExpedienteId, token).pipe(
      catchError(err => {
        console.error(err);
        // ✅ 1 solo toast en esta operación
        this.toast.add({
          severity: 'error',
          summary: 'No se pudo abrir el PDF',
          detail: 'Intenta nuevamente. Si el problema continúa, contacta a soporte.',
          life: 9000
        });
        return of(null);
      })
    ).subscribe((buffer) => {
      if (!buffer || buffer.byteLength <= 0) {
        // ✅ NO disparamos otro toast; ya se controló con catchError
        return;
      }

      this.pdfArrayBuffer = buffer;
      this.pdfDialogVisible = true;

      queueMicrotask(() => this.cdr.detectChanges());
    });
  }


  verExpedientePdf(tipo: number, token: string) {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    this.documentosSvc.verExpedientePdfArrayBuffer(tipo, token).subscribe((buffer) => {
      // Almacenamos el ArrayBuffer recibido en la variable pdfArrayBuffer
      this.pdfArrayBuffer = buffer;
      // Abre el diálogo para mostrar el PDF
      this.pdfDialogVisible = true;
    }, (error) => {
      console.error('Error al cargar el PDF para vista previa:', error);
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el PDF.', life: 10000 });
    });
  }

  viewExpediente(tipo: number): void {
    if (!this.isBrowser) return; // No ejecutar en el servidor
    this.pdfUrl = null; // Resetear antes de cargar nuevo PDF

    this.documentosSvc.descargarExpediente(tipo).subscribe({
      next: (blob: Blob | null) => {
        if (!blob) return;

        if (blob.type !== 'application/pdf') {
          console.error("El archivo recibido no es un PDF:", blob.type);
          return;
        }

        const contentType = blob.type;
        if (contentType !== 'application/pdf') {
          console.error("El archivo recibido no es un PDF:", contentType);
          return;
        }

        const fileSizeInMB = blob.size / (1024 * 1024);
        if (fileSizeInMB > 5) {
          alert("El archivo es demasiado grande para visualizarlo en línea.");
          return;
        }

        // Liberar el URL anterior si existe
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

  // Agregar en ngOnDestroy para limpiar
  ngOnDestroy(): void {
    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl);
    }
  }
  descargarExpediente(tipo: number) {
    this.documentosSvc.descargarExpediente(tipo).subscribe((response: Blob) => {
      // Asegúrate de que la respuesta sea un Blob
      if (response) {
        const reader = new FileReader();
        reader.onloadend = () => {
          this.pdfArrayBuffer = reader.result as ArrayBuffer;
          // Si es necesario, abre el visualizador después de la carga
          this.pdfDialogVisible = true;
        };
        reader.readAsArrayBuffer(response);
      }
    }, (error) => {
      console.error('Error al descargar el expediente:', error);
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar el PDF.', life: 10000 });
    });
  }




  closePdfViewer(): void {
    this.pdfArrayBuffer = null;
    this.selectedExpediente = null;
  }






  // Método para descargar el expediente (si es necesario)
  downloadExpediente(tipo: number): void {
    this.documentosSvc.descargarExpediente(tipo).subscribe((blob: Blob | null) => {
      if (!blob) return;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'expediente.pdf'; // Puedes personalizar el nombre del archivo
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  private readonly TIPO_CD = 12;
private readonly MAX_CD_BYTES = 300 * 1024 * 1024; // mismo que backend

onExpedienteFileSelected(tipo: number, event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input?.files?.[0] ?? null;
  if (input) input.value = '';
  if (!file) return;

  if (!this.puedeEditarDocumento(tipo)) {
  this.toast.add({
    severity: 'warn',
    summary: 'Documento bloqueado',
    detail: 'Solo puedes reemplazar documentos rechazados.',
    life: 8000
  });

  const input = event.target as HTMLInputElement | null;
  if (input) input.value = '';
  return;
}

  // ⛔ tipo 13 no alumno
  if (tipo === this.TIPO_ACTA) {
    this.toast.add({ severity: 'warn', summary: 'No permitido', detail: 'El Acta (tipo 13) la sube el asesor interno.', life: 9000 });
    return;
  }

  const name = (file.name ?? '').toLowerCase();

  if (tipo === this.TIPO_CD) {
    const ok = name.endsWith('.zip') || name.endsWith('.rar');
    if (!ok) {
      this.toast.add({ severity: 'warn', summary: 'Tipo 12', detail: 'Solo se permite .zip (preferente) o .rar.', life: 9000 });
      return;
    }
    if (file.size > this.MAX_CD_BYTES) {
      this.toast.add({
        severity: 'warn',
        summary: 'Archivo demasiado grande',
        detail: `Supera ${Math.floor(this.MAX_CD_BYTES / (1024*1024))}MB. Usa entrega por link (pega el enlace).`,
        life: 10000
      });
      return;
    }
  } else {
    if (!name.endsWith('.pdf')) {
      this.toast.add({ severity: 'warn', summary: 'Solo PDF', detail: 'Selecciona un archivo .pdf', life: 9000 });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.toast.add({ severity: 'warn', summary: 'Archivo grande', detail: 'El PDF supera el límite.', life: 9000 });
      return;
    }
  }

  this.documentosSvc.subirExpediente(tipo, file).pipe(
    catchError((err) => {
      this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo subir el archivo.', life: 10000 });
      return of(null);
    })
  ).subscribe((res) => {
    if (!res) return;
    this.toast.add({ severity: 'success', summary: 'Listo', detail: 'Documento actualizado.', life: 8000 });
    this.loadExpediente();
  });
}

  // Método para manejar el botón de subir archivo
  onFileInputClick(tipo: number): void {
  if (!this.puedeEditarDocumento(tipo)) {
    this.toast.add({
      severity: 'warn',
      summary: 'Documento bloqueado',
      detail: 'Solo puedes reemplazar documentos rechazados.',
      life: 8000
    });
    return;
  }

  const inputElement = document.getElementById(`fileInput-${tipo}`) as HTMLInputElement;
  if (inputElement) {
    inputElement.click();
  }
}

  descargarArchivoExpediente(tipo: number): void {
  this.documentosSvc.descargarExpediente(tipo).subscribe({
    next: (blob: Blob | null) => {
      if (!blob) return;
      const nombre = this.expedienteMap?.[tipo]?.nombreOriginal || 'archivo';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar.', life: 8000 })
  });
}

guardarLinkCD(url: string): void {
  if (!this.puedeEditarDocumento(this.TIPO_CD_ZIP)) {
    this.toast.add({
      severity: 'warn',
      summary: 'Documento bloqueado',
      detail: 'Solo puedes modificar este documento cuando fue rechazado.',
      life: 9000
    });
    return;
  }

  const clean = (url ?? '').trim();

  if (!/^https?:\/\//i.test(clean)) {
    this.toast.add({
      severity: 'warn',
      summary: 'URL inválida',
      detail: 'Debe iniciar con http:// o https://',
      life: 9000
    });
    return;
  }

  this.documentosSvc.setExpedienteLink(this.TIPO_CD_ZIP, clean).pipe(
    catchError(() => {
      this.toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo guardar el link.',
        life: 9000
      });
      return of(null);
    })
  ).subscribe((res) => {
    if (!res) return;

    this.toast.add({
      severity: 'success',
      summary: 'Listo',
      detail: 'Enlace guardado correctamente.',
      life: 8000
    });

    this.loadExpediente();
  });
}
abrirLinkCD(): void {
  const url = this.expedienteMap?.[this.TIPO_CD_ZIP]?.urlExterna;
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}
}

