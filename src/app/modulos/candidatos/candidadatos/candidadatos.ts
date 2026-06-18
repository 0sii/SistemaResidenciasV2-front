import { ChangeDetectorRef, Component, ElementRef, ViewChild, inject, signal, OnInit, NgZone } from '@angular/core';
import * as XLSX from 'xlsx';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { of, from, forkJoin, fromEvent, asyncScheduler, BehaviorSubject, Observable, throwError } from 'rxjs';
import { concatMap, catchError, tap, observeOn, map, mergeMap } from 'rxjs/operators';

import { CommonModule } from '@angular/common';
import { FileUpload } from 'primeng/fileupload';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { Table, TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { UsuariosService } from '../../../service/usuarios.service';
import { EstudiantesService } from '../../../service/estudiantes.service';
import { EmailService } from '../../../service/email.service';
import { Catalogo, EstudianteCreate, EstudianteDetail, EstudianteListItem, PasswordUpdateRequest, UserCreateRequest, UserSlim, UserUpdateRequest } from '../../../Interface/InterfaceUsuario';
import { readExcelAsJson, requireFields, RowObj, trimAll } from '../../../utils/excel-helpers';
import { FormsModule } from '@angular/forms';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { ContactoEmergencia } from '../../../Interface/InterfaceContactoEmergencia';
import { ContactoEmergenciaService } from '../../../service/contactoEmergencia.service';
import { FloatLabel } from 'primeng/floatlabel';
import { DialogModule } from 'primeng/dialog';

import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DipomexService } from '../../../service/dipomex.service';
import { CodigoPostalResponse, EstadoItem, MunicipioItem } from '../../../service/dipomex.service';
import { CatalogosService } from '../../../service/catalogos.service';
import { DocumentosService, EstadoRevisionDocumento } from '../../../service/documentos.service';
import { TokenService } from '../../../service/token.service';

import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { HttpHeaders } from '@angular/common/http';

import { Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ProyectosService } from '../../../service/proyectos.service';
import { EstadosPagedResponse, EstadosService } from '../../../service/estado.service';

import { FechaEsPipe } from '../../../pipe/fecha-es.pipe';

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
}

interface ExpedienteAlumnoStatus {
  loading: boolean;
  done: number;
  required: number;
  complete: boolean;
  missing: number[];
  pendingReview: number[];
}

@Component({
  selector: 'app-candidadatos',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, FileUpload,FechaEsPipe, ToastModule, ButtonModule, TableModule, FormsModule, InputTextModule, DialogModule, SelectModule, NgxExtendedPdfViewerModule],
  templateUrl: './candidadatos.html',
  styleUrl: './candidadatos.css',
  providers: [MessageService],
})
export class Candidadatos implements OnInit {



  private cdr = inject(ChangeDetectorRef);
  private fb = inject(FormBuilder);
  private usuariosSvc = inject(UsuariosService);
  private estudiantesSvc = inject(EstudiantesService);
  private contactoEmergenciaSvc = inject(ContactoEmergenciaService)
  private documentosSvc = inject(DocumentosService);
  private tokenSvc = inject(TokenService);
  private sanitizer = inject(DomSanitizer);
  private proyectosSvc = inject(ProyectosService);
  private estadosSvc = inject(EstadosService);

  selectedProyectoIdForExpediente: number | null = null;
  finalizandoProyecto = false;

  private estadoProyectoFinalizadoId: number | null = null;
  private estadosProyectoMap = new Map<number, string>();

  pdfSafeUrl: SafeResourceUrl | null = null;

  // =========================
  // VISOR PDF (igual que Perfil)
  // =========================
  pdfUrl: string | null = null;
  pdfTitle: string = '';
  displayDialog: boolean = false; // si tu template usa "displayDialog"
  showPdfDialog: boolean = false; // si tu template usa "showPdfDialog" (deja el que uses)
  downloadingTipo: number | null = null;


  constructor(
    private messageService: MessageService,
    private router: Router,
    private emailService: EmailService,
    private route: ActivatedRoute,
    private dipomex: DipomexService,
    private catalogosSvc: CatalogosService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  hasExpediente(tipoId: number): boolean {
    return !!this.expedienteMap?.[tipoId];
  }
  pendingEstadoId: string | null = null;
  pendingMunicipioId: string | null = null;

  currentProyectoId: number | null = null;


  loadingEstados = false;
  loadingMunicipios = false;
  cpLookupLoading = false;
  cpLookupError = '';
  cpInfo: any = null;

  carreras: Catalogo[] = [];

  estados: EstadoItem[] = [];
  municipios: MunicipioItem[] = [];
  dependenciaMedica: Catalogo[] = [];

  // Vista previa Excel
  @ViewChild('excelSection', { static: false }) excelSection!: ElementRef<HTMLElement>;
  @ViewChild('excelScroll', { static: false }) excelScroll!: ElementRef<HTMLElement>;

  form: FormGroup = this.fb.group({
    nombre: ['', Validators.required],
    apellidoPaterno: ['', Validators.required],
    apellidoMaterno: ['', Validators.required],
    correoInstitucional: ['', [Validators.required, Validators.email]],
    noControl: ['', [Validators.required, Validators.pattern(/^(?:\d{8}|[A-Za-z]\d{8})$/)]],
    correoPersonal: ['', [Validators.email, Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)]],
    telefonoCelular: ['', [Validators.pattern(/^\d{10}$/)]],

    carrera: [null],
    domicilio: [''],
    ciudad: [''],
    cp: ['', [Validators.pattern(/^\d{5}$/)]], // ✅ nuevo

    estadoTexto: [{ value: '', disabled: true }],
    municipioTexto: [{ value: '', disabled: true }],

    dependenciaMedica: [null],       // <-- aquí
    noSeguroSocial: [{ value: '', disabled: true }],

    idContactoEmergencia: [null],
    nombreContacto: [''],
    parentesco: [''],
    domicilioContacto: [''],
    telefonoContacto: ['', [Validators.pattern(/^\d{10}$/)]],
    emailContacto: ['', [Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)]],
  });

  parentescos: string[] = [
    'Madre',
    'Padre',
    'Hermano(a)',
    'Tío(a)',
    'Abuelo(a)',
    'Tutor',
    'Otro'
  ];


  cargandoMunicipios = false;

  private estadoSeleccionado$ = new BehaviorSubject<string>(''); // CVE o nombre

  estudiantes: EstudianteListItem[] = [];
  isEditing = signal(false);
  currentIds: { estudianteId?: number; usuarioId?: number } = {};

  rows: RowObj[] = [];
  results: { ok?: boolean; error?: string }[] = [];
  uploading = false;
  progress = 0;
  summary = '';
  ExcelData: any[] = [];

  validandoDuplicados = false;


  expedienteDialogVisible = false;
  expedienteLoading = false;


  pdfDialogVisible = false;
  pdfArrayBuffer: ArrayBuffer | null = null;


  selectedEstudianteForExpediente: any = null; // row completo
  tiposExpediente: { id: number; descripcion: string }[] = [];
  expedienteMap: Record<number, any | null> = {};
  pdfSrc: string | null = null;

  showExpedienteDialog = false;
  loadingExpediente = false;

  selectedAlumnoForExpediente: any = null;



  // ===== visor (igual que Perfil) =====
  public isBrowser: boolean = false;

  // Guarda el correo original cuando entras a edición (para no revalidar si no cambió)
  originalCorreoInstitucional: string = '';

  private contactoTieneDatosEnForm(): boolean {
    return (
      !!String(this.form.value.nombreContacto || '').trim() ||
      !!String(this.form.value.parentesco || '').trim() ||
      !!String(this.form.value.domicilioContacto || '').trim() ||
      !!String(this.form.value.telefonoContacto || '').trim() ||
      !!String(this.form.value.emailContacto || '').trim()
    );
  }

  /**
   * IMPORTANTE: NO regresar nulls. El backend no acepta nulls en Contactoemergencia.
   * Mandamos strings vacíos en su lugar.
   */
  private buildContactoPayloadForApi(contactoId: number): any {
    return {
      id: contactoId,
      // OJO: tu backend usa propiedades Nombre/Parentesco/Domicilio/Telefono/email (email en minúscula).
      Nombre: String(this.normalizaNombreCampo(this.form.value.nombreContacto) || '').trim(),
      Parentesco: String(this.form.value.parentesco || '').trim(),
      Domicilio: String(this.form.value.domicilioContacto || '').trim(),
      Telefono: String(this.form.value.telefonoContacto || '').trim(),
      email: String(this.form.value.emailContacto || '').trim().toLowerCase(),
    };
  }


  saving = false;
  loadingEdit = false; // si ya la tienes, no la dupliques


  downloadingExpedienteCompleto = false;
  expedienteChecked: Record<number, boolean> = {};
  descargandoSeleccionados = false;
private pendingOpenExpedienteId: number | null = null;

  ngOnInit() {



    this.load();
    this.cargarCatalogos()
    this.cargarEstadosProyecto();
    this.form.get('estado')?.disable({ emitEvent: false });
    this.form.get('municipio')?.disable({ emitEvent: false });

    this.route.queryParamMap.subscribe(params => {
  const id = Number(params.get('openExpediente') ?? 0);
  this.pendingOpenExpedienteId = id > 0 ? id : null;
});

    // Municipio empieza deshabilitado
    this.form.get('municipio')?.disable({ emitEvent: false });

    this.form.get('dependenciaMedica')?.valueChanges.subscribe(depId => {
      const noSSCtrl = this.form.get('noSeguroSocial');

      if (depId) {
        // Hay dependencia médica seleccionada → habilitamos
        noSSCtrl?.enable({ emitEvent: false });
      } else {
        // Nada seleccionado → deshabilitamos y limpiamos
        noSSCtrl?.reset('', { emitEvent: false });
        noSSCtrl?.disable({ emitEvent: false });
      }
    });
  }

  


  get expedienteTiposSeleccionados(): number[] {
    return Object.entries(this.expedienteChecked)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
  }

  get expedienteTieneSeleccion(): boolean {
    return this.expedienteTiposSeleccionados.length > 0;
  }

  seleccionarTodosExpediente(valor: boolean): void {
    const nuevo: Record<number, boolean> = {};
    for (const t of this.tiposExpediente) {
      const doc = this.expedienteMap?.[t.id];
      if (doc && t.id !== 11) {
        nuevo[t.id] = valor;
      }
    }
    this.expedienteChecked = nuevo;
  }

  descargarExpedienteSeleccionados(): void {
    const tipos = this.expedienteTiposSeleccionados;
    if (!tipos.length) return;

    const alumnoId = Number(
      this.selectedAlumnoForExpediente?.id ??
      this.selectedAlumnoForExpediente?.Id ?? 0
    );
    if (!alumnoId) {
      this.showError('Selecciona un estudiante válido.');
      return;
    }

    const token = this.tokenSvc.getToken() ?? undefined;
    this.descargandoSeleccionados = true;

    this.documentosSvc
      .descargarExpedienteSeleccionadosByEstudiante(alumnoId, tipos, token)
      .pipe(
        catchError((err) => {
          console.error(err);
          this.showError('No se pudieron descargar los documentos seleccionados.');
          this.descargandoSeleccionados = false;
          return of(null as Blob | null);
        })
      )
      .subscribe((blob: Blob | null) => {
        this.descargandoSeleccionados = false;
        if (!blob) return;

        const noControl = String(
          this.selectedAlumnoForExpediente?.noControl ?? 'Alumno'
        ).trim() || 'Alumno';
        const url = window.URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `Expediente_Seleccion_${noControl}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      });
  }

  puedeDescargarExpedienteCompleto(): boolean {
    return this.EXPEDIENTE_REQUIRED_IDS.every(tipoId => {
      const doc = this.expedienteMap?.[tipoId];
      return !!doc && this.getEstadoRevision(doc) === EstadoRevisionDocumento.Aceptado;
    });
  }

  descargarExpedienteCompletoSeleccionado(): void {
    const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
    if (!alumnoId) {
      this.showError('Selecciona un estudiante válido para descargar el expediente completo.');
      return;
    }

    const token = this.tokenSvc.getToken();
    if (!token) {
      this.showError('Sesión requerida. Inicia sesión nuevamente.');
      return;
    }

    this.downloadingExpedienteCompleto = true;

    this.documentosSvc.descargarExpedienteCompletoByEstudiante(alumnoId, token).pipe(
      catchError((err) => {
        console.error(err);
        this.showError('No se pudo generar el expediente completo.');
        this.downloadingExpedienteCompleto = false;
        return of(null as Blob | null);
      })
    ).subscribe((blob: Blob | null) => {
      this.downloadingExpedienteCompleto = false;
      if (!blob) return;

      const noControl = String(this.selectedAlumnoForExpediente?.noControl ?? 'Alumno').trim() || 'Alumno';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Expediente_${noControl}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  private cargarEstadosProyecto(): void {
    this.estadosSvc.getAll()
      .pipe(map((resp: EstadosPagedResponse) => resp.items ?? []))
      .subscribe({
        next: (rows: any[]) => {
          this.estadosProyectoMap.clear();
          this.estadoProyectoFinalizadoId = null;

          for (const r of rows) {
            const id = Number(r?.id ?? r?.Id ?? NaN);
            const desc = String(r?.descripcion ?? r?.Descripcion ?? '').trim();

            if (!Number.isFinite(id) || !desc) continue;

            this.estadosProyectoMap.set(id, desc);

            if (desc.toUpperCase().includes('FINALIZ')) {
              this.estadoProyectoFinalizadoId = id;
            }
          }
        },
        error: (err) => {
          console.error('No se pudieron cargar estados del proyecto', err);
        }
      });
  }

  private isDocumentoAceptado(doc: any): boolean {
    return this.getEstadoRevision(doc) === EstadoRevisionDocumento.Aceptado;
  }

  private tipoExpedienteLabel(tipoId: number): string {
    return this.tiposExpediente.find(t => Number(t.id) === Number(tipoId))?.descripcion ?? `Tipo #${tipoId}`;
  }

  getMissingLabels(st: ExpedienteAlumnoStatus | null): string[] {
    if (!st) return [];
    return (st.missing ?? []).map(id => this.tipoExpedienteLabel(id));
  }

  getPendingLabels(st: ExpedienteAlumnoStatus | null): string[] {
    if (!st) return [];
    return (st.pendingReview ?? []).map(id => this.tipoExpedienteLabel(id));
  }

  private actualizarStatusExpedienteLocal(alumnoId: number): void {
    const docs = Object.values(this.expedienteMap ?? {}).filter(Boolean) as any[];
    this.setAlumnoStatusFromDocs(alumnoId, docs);
    this.selectedExpedienteStatus = this.expedienteStatusByAlumnoId[alumnoId] ?? null;
  }

  private resolverProyectoSeleccionado(alumnoId: number): void {
    this.estudiantesSvc.getById(alumnoId).subscribe({
      next: (detalle: any) => {
        const proyectoId = Number(detalle?.idProyecto ?? detalle?.IdProyecto ?? 0);
        this.selectedProyectoIdForExpediente = proyectoId > 0 ? proyectoId : null;
      },
      error: (err) => {
        console.error(err);
        this.selectedProyectoIdForExpediente = null;
      }
    });
  }

  private resolverAlumnoIdsDelProyecto(proyectoId: number, done: (ids: number[]) => void): void {
    const reqs = (this.estudiantes ?? [])
      .map(row => {
        const alumnoId = this.getAlumnoId(row);
        if (!alumnoId) return of(null);

        const proyectoDirecto = Number(row?.idProyecto ?? row?.idProyecto ?? 0);
        if (proyectoDirecto > 0) {
          return of({ alumnoId, proyectoId: proyectoDirecto });
        }

        return this.estudiantesSvc.getById(alumnoId).pipe(
          map((detalle: any) => ({
            alumnoId,
            proyectoId: Number(detalle?.idProyecto ?? detalle?.IdProyecto ?? 0)
          })),
          catchError(() => of(null))
        );
      });

    if (!reqs.length) {
      done([]);
      return;
    }

    forkJoin(reqs).subscribe({
      next: (rows: any[]) => {
        const ids = rows
          .filter(x => !!x && Number(x.proyectoId) === Number(proyectoId))
          .map(x => Number(x.alumnoId))
          .filter((id, i, arr) => id > 0 && arr.indexOf(id) === i);

        done(ids);
      },
      error: (err) => {
        console.error(err);
        done([]);
      }
    });
  }

  public intentarFinalizarProyectoSiProcede(): void {
  const proyectoId = Number(this.selectedProyectoIdForExpediente ?? 0);
  if (!proyectoId) return;

  const estadoFinalizadoId = this.estadoProyectoFinalizadoId;
  if (estadoFinalizadoId == null) {
    this.showError('No se encontró el estado FINALIZADO en el catálogo de estados del proyecto.');
    return;
  }

  const token = this.tokenSvc.getToken();
  if (!token) {
    this.showError('Sesión requerida. Inicia sesión nuevamente.');
    return;
  }

  this.resolverAlumnoIdsDelProyecto(proyectoId, (alumnoIds) => {
    if (!alumnoIds.length) {
      this.showError('No se pudieron resolver los alumnos del proyecto para finalizarlo.');
      return;
    }

    const reqs = alumnoIds.map(id =>
      this.documentosSvc.getExpedienteByEstudiante(id, token).pipe(
        catchError(() => of([]))
      )
    );

    forkJoin(reqs).subscribe({
      next: (docsPorAlumno: any[][]) => {
        const todosListos = docsPorAlumno.every(docs => this.computeExpedienteStatusFromDocs(docs).complete);

        if (!todosListos) {
          this.showError('Aún faltan documentos por cargar o aceptar en este proyecto. No se puede finalizar.');
          return;
        }

        this.finalizandoProyecto = true;

this.proyectosSvc.finalizarProyecto(
  proyectoId,
  estadoFinalizadoId
).subscribe({
  next: () => {
    this.finalizandoProyecto = false;
    this.showSuccess('Proyecto finalizado correctamente.');
  },
  error: (err) => {
    console.error(err);
    this.finalizandoProyecto = false;

    const detalle =
      typeof err?.error === 'string'
        ? err.error
        : (err?.error?.message ?? '');

    this.showError(
      detalle
        ? `No se pudo finalizar el proyecto. ${detalle}`
        : 'No se pudo finalizar el proyecto.'
    );
  }
});
      },
      error: (err) => {
        console.error(err);
        this.showError('No se pudo validar el expediente completo del proyecto.');
      }
    });
  });
}


  readonly EstadoRevisionDocumento = EstadoRevisionDocumento;
  updatingDocumentoId: number | null = null;

  confirmRevisionDialogVisible = false;
  rejectRevisionDialogVisible = false;

  documentoRevisionSeleccionado: any | null = null;
  estadoRevisionPendiente: EstadoRevisionDocumento | null = null;
  comentarioRevisionDraft = '';

  // ── Aprobar todos ──────────────────────────────────────────────────────────
  confirmAprobarTodosVisible = false;
  aprobandoTodos = false;

  get docsEnRevision(): any[] {
    if (!this.expedienteMap) return [];
    return Object.values(this.expedienteMap).filter(
      (doc: any) => doc && this.getEstadoRevision(doc) === EstadoRevisionDocumento.EnRevision
    );
  }

  solicitarAprobarTodos(): void {
    if (this.docsEnRevision.length === 0) return;
    this.confirmAprobarTodosVisible = true;
  }

  confirmarAprobarTodos(): void {
    this.confirmAprobarTodosVisible = false;
    const docs = [...this.docsEnRevision];
    if (docs.length === 0) return;

    this.aprobandoTodos = true;
    const calls = docs.map(doc =>
      this.documentosSvc.actualizarEstadoDocumento(
        Number(doc.id ?? doc.Id),
        EstadoRevisionDocumento.Aceptado,
        null
      ).toPromise().then((resp: any) => {
        doc.estadoRevision = Number(resp?.estadoRevision ?? EstadoRevisionDocumento.Aceptado);
        doc.estadoRevisionTexto = String(resp?.estadoRevisionTexto ?? 'Aceptado');
        doc.comentarioRevision = null;
        doc.fechaRevision = resp?.fechaRevision ?? new Date().toISOString();
      })
    );

    Promise.allSettled(calls).then(results => {
      this.aprobandoTodos = false;
      const errores = results.filter(r => r.status === 'rejected').length;
      const ok = results.length - errores;

      const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
      if (alumnoId) this.actualizarStatusExpedienteLocal(alumnoId);

      if (errores === 0) {
        this.showSuccess(`${ok} documento(s) aprobados correctamente.`);
      } else {
        this.showError(`${ok} aprobado(s), ${errores} fallaron. Revisa individualmente.`);
      }
      this.cdr.detectChanges();
    });
  }
  // ──────────────────────────────────────────────────────────────────────────

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

  puedeDictaminar(doc: any): boolean {
    return !!doc && this.getEstadoRevision(doc) === EstadoRevisionDocumento.EnRevision;
  }

  solicitarCambioEstadoDocumento(doc: any, estado: EstadoRevisionDocumento): void {
    const idDocumento = Number(doc?.id ?? doc?.Id ?? 0);
    if (!idDocumento) {
      this.showError('Documento inválido.');
      return;
    }

    this.documentoRevisionSeleccionado = doc;
    this.estadoRevisionPendiente = estado;

    if (estado === EstadoRevisionDocumento.Rechazado) {
      this.comentarioRevisionDraft = String(doc?.comentarioRevision ?? '').trim();
      this.rejectRevisionDialogVisible = true;
      return;
    }

    this.confirmRevisionDialogVisible = true;
  }

  confirmarAceptarDocumento(): void {
    if (!this.documentoRevisionSeleccionado) return;

    this.confirmRevisionDialogVisible = false;
    this.ejecutarCambioEstadoDocumento(
      this.documentoRevisionSeleccionado,
      EstadoRevisionDocumento.Aceptado,
      null
    );
  }

  confirmarRechazoDocumento(): void {
    const comentario = String(this.comentarioRevisionDraft ?? '').trim();

    if (!comentario) {
      this.showError('Debes capturar el motivo del rechazo.');
      return;
    }

    if (!this.documentoRevisionSeleccionado) return;

    this.rejectRevisionDialogVisible = false;
    this.ejecutarCambioEstadoDocumento(
      this.documentoRevisionSeleccionado,
      EstadoRevisionDocumento.Rechazado,
      comentario
    );
  }

  cancelarCambioEstadoDocumento(): void {
    this.confirmRevisionDialogVisible = false;
    this.rejectRevisionDialogVisible = false;
    this.documentoRevisionSeleccionado = null;
    this.estadoRevisionPendiente = null;
    this.comentarioRevisionDraft = '';
  }

  private ejecutarCambioEstadoDocumento(
    doc: any,
    estado: EstadoRevisionDocumento,
    comentarioRevision?: string | null
  ): void {
    const idDocumento = Number(doc?.id ?? doc?.Id ?? 0);
    if (!idDocumento) {
      this.showError('Documento inválido.');
      return;
    }

    this.updatingDocumentoId = idDocumento;

    this.documentosSvc.actualizarEstadoDocumento(idDocumento, estado, comentarioRevision ?? null).subscribe({
      next: (resp) => {
        doc.estadoRevision = Number(resp?.estadoRevision ?? estado);
        doc.estadoRevisionTexto = String(resp?.estadoRevisionTexto ?? this.getEstadoRevisionTexto(doc));
        doc.comentarioRevision = resp?.comentarioRevision ?? (estado === EstadoRevisionDocumento.Rechazado ? comentarioRevision ?? null : null);
        doc.fechaRevision = resp?.fechaRevision ?? new Date().toISOString();

        const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
        if (alumnoId) {
          this.actualizarStatusExpedienteLocal(alumnoId);
        }

        this.showSuccess('Estado del documento actualizado.');
        this.cancelarCambioEstadoDocumento();
        this.cdr.detectChanges();

        
      },
      error: (err) => {
        console.error(err);
        this.showError('No se pudo actualizar el estado del documento.');
      },
      complete: () => {
        this.updatingDocumentoId = null;
      }
    });
  }

  irAProyectoSeleccionado(): void {
  const idProyecto = Number(this.selectedProyectoIdForExpediente ?? 0);
  const idAlumno = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);

  if (!idProyecto) {
    this.showError('No se encontró el proyecto del estudiante.');
    return;
  }

  this.showExpedienteDialog = false;

  // ⚠️ Reemplaza esta ruta por la real de tu app
  this.router.navigate(['/proyectos'], {
    queryParams: {
      openProyecto: idProyecto,
      fromAlumno: idAlumno || null
    }
  });
}

  // ===================== EXPEDIENTE (CATÁLOGO + STATUS) =====================
  // Dictamen (#1) NO cuenta para "expediente completo" (solo si es necesario)
  readonly EXPEDIENTE_REQUIRED_IDS: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  get expedienteRequiredCount(): number {
    return this.EXPEDIENTE_REQUIRED_IDS.length; // 12
  }

  expedienteStatusByAlumnoId: Record<number, ExpedienteAlumnoStatus | undefined> = {};
  selectedExpedienteStatus: ExpedienteAlumnoStatus | null = null;

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

  private normalizeTipoExpediente(x: any): TipoExpedienteItem | null {
    const id = Number(x?.id ?? x?.Id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const descripcion = String(x?.descripcion ?? x?.Descripcion ?? '').trim();
    return { id, descripcion };
  }

  private buildTiposExpediente(apiTipos: any[]): TipoExpedienteItem[] {
    const mapTipos = new Map<number, TipoExpedienteItem>();

    // base: catálogo completo
    for (const d of this.EXPEDIENTE_TIPOS_DEFAULT) {
      mapTipos.set(Number(d.id), { id: Number(d.id), descripcion: String(d.descripcion).trim() });
    }

    // overlay: lo que venga del backend (si trae descripción distinta, se respeta)
    for (const raw of (apiTipos ?? [])) {
      const n = this.normalizeTipoExpediente(raw);
      if (!n) continue;

      const prev = mapTipos.get(n.id);
      const descFinal = n.descripcion.length ? n.descripcion : (prev?.descripcion ?? '');
      mapTipos.set(n.id, { id: n.id, descripcion: descFinal });
    }

    return Array.from(mapTipos.values()).sort((a, b) => a.id - b.id);
  }

  private computeExpedienteStatusFromDocs(
    docs: any[]
  ): { done: number; required: number; complete: boolean; missing: number[]; pendingReview: number[] } {
    const present = new Set<number>();
    const accepted = new Set<number>();

    for (const d of (docs ?? [])) {
      const tipo = Number(d?.tipoDocumento ?? d?.TipoDocumento);
      if (!Number.isFinite(tipo) || tipo <= 0) continue;

      if (this.EXPEDIENTE_REQUIRED_IDS.includes(tipo)) {
        present.add(tipo);
        if (this.isDocumentoAceptado(d)) {
          accepted.add(tipo);
        }
      }
    }

    const missing = this.EXPEDIENTE_REQUIRED_IDS.filter(id => !present.has(id));
    const pendingReview = this.EXPEDIENTE_REQUIRED_IDS.filter(id => present.has(id) && !accepted.has(id));
    const required = this.EXPEDIENTE_REQUIRED_IDS.length;
    const done = this.EXPEDIENTE_REQUIRED_IDS.filter(id => accepted.has(id)).length;

    return {
      done,
      required,
      complete: missing.length === 0 && pendingReview.length === 0,
      missing,
      pendingReview
    };
  }

  private setAlumnoStatusFromDocs(alumnoId: number, docs: any[]): void {
    const st = this.computeExpedienteStatusFromDocs(docs);
    this.expedienteStatusByAlumnoId[alumnoId] = {
      loading: false,
      done: st.done,
      required: st.required,
      complete: st.complete,
      missing: st.missing,
      pendingReview: st.pendingReview,
    };
  }

  private getAlumnoId(row: any): number {
    return Number(row?.id ?? row?.Id ?? 0);
  }

  private prefetchExpedienteStatuses(rows: any[]): void {
    const token = this.tokenSvc.getToken();
    if (!token) return;

    const ids = (rows ?? [])
      .map(r => this.getAlumnoId(r))
      .filter(id => Number.isFinite(id) && id > 0);

    if (!ids.length) return;

    // marca loading
    for (const id of ids) {
      this.expedienteStatusByAlumnoId[id] = {
        loading: true,
        done: 0,
        required: this.expedienteRequiredCount,
        complete: false,
        missing: this.EXPEDIENTE_REQUIRED_IDS.slice(),
        pendingReview: [],
      };
    }

    from(ids).pipe(
      mergeMap((alumnoId) => {
        return this.documentosSvc.getExpedienteByEstudiante(alumnoId, token).pipe(
          catchError((err) => {
            // aquí solo entrarían 401/403/500 porque 404 ya regresa [] desde el service
            console.error('Error expediente alumno', alumnoId, err);
            return of([]);
          }),
          map((docs) => ({ alumnoId, docs }))
        );
      }, 4)
    ).subscribe(({ alumnoId, docs }) => {
      this.setAlumnoStatusFromDocs(alumnoId, docs ?? []);
      queueMicrotask(() => this.cdr.detectChanges());
    });
  }

  private cleanStr(v: any): string {
    return String(v ?? '').trim();
  }

  private cleanEmailOrNull(v: any): string | null {
    const email = String(v ?? '').trim().toLowerCase();
    if (!email) return null;
    const basic = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return basic.test(email) ? email : null;
  }

  private cleanPhoneDigitsOrNull(v: any): string | null {
    const raw = String(v ?? '').trim();
    if (!raw) return null;

    // Solo dígitos (quita +, espacios, guiones, paréntesis, etc.)
    const digits = raw.replace(/\D/g, '');

    // Si quedó vacío, no mandamos nada
    if (!digits) return null;

    // Ajusta si tu CHECK exige longitud (común: 10 en MX)
    // Si no estás seguro, comenta este bloque y solo manda dígitos.
    if (digits.length < 10) return null;

    return digits;
  }

  /** Mínimo = nombre (como dijiste) */
  private contactoMinimoCapturado(): boolean {
    return !!this.cleanStr(this.form.value.nombreContacto);
  }

  /**
   * Payload para Contactoemergencia:
   * - NO manda email si está vacío o inválido
   * - NO manda Telefono si está vacío o inválido
   */
  private buildContactoCreatePayload(): any {
    const payload: any = {
      id: 0,
      Nombre: this.cleanStr(this.form.value.nombreContacto),
      Parentesco: this.cleanStr(this.form.value.parentesco),
      Domicilio: this.cleanStr(this.form.value.domicilioContacto),
    };

    const tel = this.cleanPhoneDigitsOrNull(this.form.value.telefonoContacto);
    if (tel) payload.Telefono = tel;

    const email = this.cleanEmailOrNull(this.form.value.emailContacto);
    if (email) payload.email = email;

    return payload;
  }

  private buildContactoUpdatePayload(contactoId: number): any {
    const payload: any = {
      id: contactoId,
      Nombre: this.cleanStr(this.form.value.nombreContacto),
      Parentesco: this.cleanStr(this.form.value.parentesco),
      Domicilio: this.cleanStr(this.form.value.domicilioContacto),
    };

    const tel = this.cleanPhoneDigitsOrNull(this.form.value.telefonoContacto);
    if (tel) payload.Telefono = tel; // si no, NO lo mandamos

    const email = this.cleanEmailOrNull(this.form.value.emailContacto);
    if (email) payload.email = email; // si no, NO lo mandamos

    return payload;
  }



  openExpedienteAlumno(row: any) {
    if (!this.canReadEstudiante && !this.canUpdateEstudiante) {
      this.showError('No tienes permisos para ver el expediente.');
      return;
    }

    this.selectedAlumnoForExpediente = row;

    const alumnoId = this.getAlumnoId(row);
    if (!alumnoId) {
      this.showError('Estudiante inválido para ver expediente.');
      return;
    }

    const token = this.tokenSvc.getToken();
    if (!token) {
      this.showError('Sesión requerida. Inicia sesión nuevamente.');
      return;
    }

    this.showExpedienteDialog = true;
    this.loadingExpediente = true;
    this.expedienteChecked = {};
    this.selectedExpedienteStatus = null;
    this.selectedProyectoIdForExpediente = null;

    const tipos$ = this.documentosSvc.getTiposExpediente().pipe(
      catchError(() => of([]))
    );

    const docs$ = this.documentosSvc.getExpedienteByEstudiante(alumnoId, token).pipe(
      catchError((err) => {
        console.error(err);
        this.showError('No se pudo cargar el expediente del estudiante.');
        return of([]);
      })
    );

    const detalle$ = this.estudiantesSvc.getById(alumnoId).pipe(
      catchError((err) => {
        console.error(err);
        return of(null);
      })
    );

    forkJoin({ tipos: tipos$, docs: docs$, detalle: detalle$ }).subscribe(({ tipos, docs, detalle }) => {
      this.tiposExpediente = this.buildTiposExpediente(tipos ?? []);

      const mapDoc: Record<number, any | null> = {};
      for (const t of this.tiposExpediente) mapDoc[Number(t.id)] = null;

      for (const d of (docs ?? [])) {
        const tipo = Number(d?.tipoDocumento ?? d?.TipoDocumento);
        if (!Number.isFinite(tipo)) continue;
        mapDoc[tipo] = d;
      }

      this.expedienteMap = mapDoc;

      this.setAlumnoStatusFromDocs(alumnoId, docs ?? []);
      this.selectedExpedienteStatus = this.expedienteStatusByAlumnoId[alumnoId] ?? null;

      const proyectoId = Number(
        detalle?.idProyecto ??
        detalle?.idProyecto ??
        row?.idProyecto ??
        row?.IdProyecto ??
        0
      );

      this.selectedProyectoIdForExpediente = proyectoId > 0 ? proyectoId : null;

      this.loadingExpediente = false;
      queueMicrotask(() => this.cdr.detectChanges());
    });
  }
  viewExpedienteAlumno(tipoExpedienteId: number): void {
    const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
    if (!alumnoId) {
      this.showError('Selecciona un estudiante válido para ver su PDF.');
      return;
    }

    const doc = this.expedienteMap[tipoExpedienteId];
    if (!doc) {
      this.showError('Este documento no está cargado.');
      return;
    }

    const token = this.tokenSvc.getToken();
    if (!token) {
      this.showError('Sesión requerida. Inicia sesión nuevamente.');
      return;
    }

    this.downloadingTipo = tipoExpedienteId;

    this.documentosSvc.descargarExpedienteByEstudiante(tipoExpedienteId, alumnoId, token).pipe(
      catchError(err => {
        console.error(err);
        this.showError('No se pudo abrir el PDF.');
        return of(null);
      })
    ).subscribe((blob: Blob | null) => {
      this.downloadingTipo = null;
      if (!blob) return;

      if (blob.type !== 'application/pdf') {
        console.error('El archivo recibido no es PDF:', blob.type);
        this.showError('El archivo recibido no es un PDF válido.');
        return;
      }

      // limpiar url anterior
      if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);

      this.pdfUrl = URL.createObjectURL(blob);
      this.displayDialog = true;

      queueMicrotask(() => this.cdr.detectChanges());
    });
  }

  closeExpedienteDialog() {
    this.showExpedienteDialog = false;
    this.selectedAlumnoForExpediente = null;
    this.selectedProyectoIdForExpediente = null;
    this.expedienteMap = {};
    this.selectedExpedienteStatus = null;
  }

  // Limpieza (igual que perfil)
  ngOnDestroy(): void {
    if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
  }


  onClosePdfViewer() {
    this.displayDialog = false;
    this.cleanupPdfUrl();
  }

  private cleanupPdfUrl() {
    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
    this.pdfTitle = '';
  }


  verExpedienteEstudiante(tipoExpedienteId: number) {
    const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
    if (!alumnoId) {
      this.showError('Selecciona un estudiante válido para ver su PDF.');
      return;
    }

    const doc = this.expedienteMap?.[tipoExpedienteId];
    if (!doc) {
      this.showError('Este documento no está cargado.');
      return;
    }

    const token = this.tokenSvc.getToken();
    if (!token) {
      this.showError('Sesión requerida. Inicia sesión nuevamente.');
      return;
    }

    this.downloadingTipo = tipoExpedienteId;

    // Limpia visor anterior
    this.cleanupPdfUrl();

    this.documentosSvc.descargarExpedienteByEstudiante(tipoExpedienteId, alumnoId, token).pipe(
      catchError((err) => {
        console.error(err);
        this.showError('No se pudo abrir el PDF. Intenta nuevamente.');
        return of(null);
      })
    ).subscribe((blob: Blob | null) => {
      this.downloadingTipo = null;
      if (!blob || blob.size <= 0) return;

      // Título bonito
      this.pdfTitle = doc?.nombreOriginal ?? `Expediente tipo #${tipoExpedienteId}`;

      // 👉 Igual que Perfil: Blob URL en string
      this.pdfUrl = URL.createObjectURL(blob);

      // Abre dialog
      this.displayDialog = true;
    });
  }

  viewExpedienteEstudiante(tipoExpedienteId: number): void {
    const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
    if (!alumnoId) {
      this.showError('Selecciona un estudiante válido para ver su PDF.');
      return;
    }

    const doc = this.expedienteMap[tipoExpedienteId];
    if (!doc) {
      this.showError('Este documento no está cargado.');
      return;
    }

    const token = this.tokenSvc.getToken();
    if (!token) {
      this.showError('Sesión requerida. Inicia sesión nuevamente.');
      return;
    }

    this.downloadingTipo = tipoExpedienteId;

    this.documentosSvc.descargarExpedienteByEstudiante(tipoExpedienteId, alumnoId, token).pipe(
      catchError((err) => {
        console.error(err);
        this.showError('No se pudo abrir el PDF.');
        return of(null);
      })
    ).subscribe(async (blob: Blob | null) => {
      this.downloadingTipo = null;
      if (!blob) return;

      // ✅ DEBUG (si llega HTML/JSON por error, aquí lo detectas)
      const type = (blob.type || '').toLowerCase();
      if (!type.includes('pdf')) {
        try {
          const txt = await blob.text();
          console.error('RESPUESTA NO PDF:', type, txt);
        } catch { }
        this.showError('El servidor no devolvió un PDF. Revisa consola (posible 401/403/500).');
        return;
      }

      // ✅ limpia URL anterior
      if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);

      this.pdfUrl = URL.createObjectURL(blob);
      this.pdfTitle = doc?.nombreOriginal || 'Documento';
      this.displayDialog = true;

      queueMicrotask(() => this.cdr.detectChanges());
    });
  }


  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }







  // Descargar PDF
  descargarExpedienteEstudiante(tipoExpedienteId: number) {
    const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
    if (!alumnoId) {
      this.showError('Selecciona un estudiante válido para descargar su PDF.');
      return;
    }

    const doc = this.expedienteMap[tipoExpedienteId];
    if (!doc) {
      this.showError('Este documento no está cargado.');
      return;
    }

    const token = this.tokenSvc.getToken();
    if (!token) {
      this.showError('Sesión requerida. Inicia sesión nuevamente.');
      return;
    }

    this.downloadingTipo = tipoExpedienteId;

    this.documentosSvc.descargarExpedienteByEstudiante(tipoExpedienteId, alumnoId, token).pipe(
      catchError(err => {
        console.error(err);
        this.showError('No se pudo descargar el PDF. Intenta nuevamente.');
        return of(null);
      })
    ).subscribe((blob: Blob | null) => {
      this.downloadingTipo = null;
      if (!blob) return;

      const fileName = doc?.nombreOriginal || `expediente_tipo_${tipoExpedienteId}.pdf`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  onPdfDialogHide() {
    this.pdfArrayBuffer = null;
    this.pdfTitle = '';
  }


  // atajo para template
  get f() { return this.form.controls; }

  // Sanitiza a dígitos y aplica tope de longitud
  digitsOnly(controlName: string, maxLen: number) {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;
    const only = String(ctrl.value || '').replace(/\D/g, '').slice(0, maxLen);
    if (only !== ctrl.value) ctrl.setValue(only, { emitEvent: false });
  }

  load() {
    this.estudiantesSvc.getAll().subscribe({
      next: rows => {
        queueMicrotask(() => {
          this.estudiantes = rows;

          // ✅ para badges "desde afuera"
          this.prefetchExpedienteStatuses(rows);

          this.cdr.detectChanges();
          if (this.pendingOpenExpedienteId) {
  const row = (rows ?? []).find((x: any) => Number(x?.id ?? x?.Id ?? 0) === this.pendingOpenExpedienteId);
  if (row) {
    setTimeout(() => this.openExpedienteAlumno(row), 0);
    this.pendingOpenExpedienteId = null;
  }
}
        });
      },
      error: err => console.error('Load estudiantes error', err),
    });
  }
  // Helpers de scroll (opcional)
  private scrollToExcelSection(offsetPx = 0) {
    const el = this.excelSection?.nativeElement;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - offsetPx;
    window.scrollTo({ top, behavior: 'smooth' });
  }
  private scrollExcelPreviewToBottom() {
    const c = this.excelScroll?.nativeElement;
    if (!c) return;
    c.scrollTop = c.scrollHeight;
  }

  // ——————————————————————————————————————————————————————————
  // CREAR / ACTUALIZAR (Formulario)
  // ——————————————————————————————————————————————————————————
  onSubmit() {
    if (this.saving) return;

    if (this.form.invalid) {
      this.showError('Formulario inválido. Revisa los campos obligatorios.');
      this.form.markAllAsTouched();
      return;
    }

    const correo = String(this.form.value.correoInstitucional || '').trim().toLowerCase();
    const isEdit = this.dialogMode === 'edit';

    // =========================
    // MODO EDICIÓN
    // =========================
    if (isEdit) {
      if (!this.canUpdateEstudiante) {
        this.showError('No tienes permisos para actualizar estudiantes.');
        return;
      }

      const estudianteId = Number(this.currentIds?.estudianteId);
      const usuarioId = Number(this.currentIds?.usuarioId);

      if (!estudianteId || !usuarioId) {
        this.showError('No se encontraron IDs para actualizar.');
        return;
      }

      const correoOriginal = String(this.originalCorreoInstitucional || '').trim().toLowerCase();
      const cambioCorreo = correo !== correoOriginal;

      const usuarioUpdate: any = {
        id: usuarioId,
        correo,
        nombre: this.normalizaNombreCampo(this.form.value.nombre),
        apellidoPaterno: this.normalizaNombreCampo(this.form.value.apellidoPaterno),
        apellidoMaterno: this.normalizaNombreCampo(this.form.value.apellidoMaterno),
        activo: true
      };

      const estudianteUpdate: any = {
        idUsuario: usuarioId,
        nombre: this.normalizaNombreCampo(this.form.value.nombre),
        apellidoPaterno: this.normalizaNombreCampo(this.form.value.apellidoPaterno),
        apellidoMaterno: this.normalizaNombreCampo(this.form.value.apellidoMaterno),
        idcarrera: this.form.value.carrera ?? null,
        domicilio: this.form.value.domicilio || null,
        ciudad: this.form.value.ciudad || null,
        cp: this.form.value.cp ? String(this.form.value.cp).trim() : null,
        noControl: String(this.form.value.noControl || '').trim().toUpperCase(),
        correoPersonal: this.form.value.correoPersonal || null,
        telefonoCelular: this.normalizaTelefono(this.form.value.telefonoCelular),
        idDependenciaMedica: this.form.value.dependenciaMedica ?? null,
        idContactoEmergencia: this.form.value.idContactoEmergencia ?? null,
        idProyecto: this.currentProyectoId
      };

      const contactoId = Number(this.form.value.idContactoEmergencia || 0);

      const contactoTieneDatos =
        !!String(this.form.value.nombreContacto ?? '').trim() ||
        !!String(this.form.value.parentesco ?? '').trim() ||
        !!String(this.form.value.domicilioContacto ?? '').trim() ||
        !!String(this.form.value.telefonoContacto ?? '').trim() ||
        !!String(this.form.value.emailContacto ?? '').trim();

      // backend no acepta nulls => strings vacíos
      const contactoPayload: any = {
        id: contactoId,
        Nombre: String(this.form.value.nombreContacto ?? '').trim(),
        Parentesco: String(this.form.value.parentesco ?? '').trim(),
        Domicilio: String(this.form.value.domicilioContacto ?? '').trim(),
        Telefono: String(this.form.value.telefonoContacto ?? '').trim(),
        email: String(this.form.value.emailContacto ?? '').trim().toLowerCase(),
      };

      // ✅ VALIDACIÓN SOLO SI CAMBIÓ EL CORREO
      const validar$ = cambioCorreo
        ? this.usuariosSvc.puedeSerEstudiante(correo)
        : of({ puedeSerEstudiante: true, motivo: '' });

      this.saving = true;

      validar$.pipe(
        concatMap((validation: any) => {
          if (!validation?.puedeSerEstudiante) {
            this.showError(validation?.motivo || 'El correo no puede ser asignado a estudiante.');
            return of(null);
          }

          // 1) update usuario
          return this.usuariosSvc.update(usuarioId, usuarioUpdate).pipe(
            // 2) update contacto SOLO si hay datos; si está vacío, NO tocarlo
            concatMap(() => {
              // Si el usuario no capturó mínimo (nombre), no hacemos nada con contacto
              if (!this.contactoMinimoCapturado()) {
                return of({ id: null });
              }

              // ✅ construir payloads limpios (sin email/tel inválidos)
              if (!contactoId) {
                const createPayload = this.buildContactoCreatePayload();

                // si nombre está vacío, no creamos
                if (!this.cleanStr(createPayload.Nombre)) return of({ id: null });

                // ⚠️ Si el usuario escribió teléfono pero es inválido (por longitud), muéstrale error
                // (solo si tú quieres bloquear; si prefieres ignorarlo, quita este if)
                const userTypedPhone = !!this.cleanStr(this.form.value.telefonoContacto);
                const telClean = this.cleanPhoneDigitsOrNull(this.form.value.telefonoContacto);
                if (userTypedPhone && !telClean) {
                  this.showError('Teléfono de contacto inválido. Usa al menos 10 dígitos.');
                  return of(null);
                }

                return this.contactoEmergenciaSvc.create(createPayload);
              }

              const updatePayload = this.buildContactoUpdatePayload(contactoId);

              const userTypedPhone = !!this.cleanStr(this.form.value.telefonoContacto);
              const telClean = this.cleanPhoneDigitsOrNull(this.form.value.telefonoContacto);
              if (userTypedPhone && !telClean) {
                this.showError('Teléfono de contacto inválido. Usa al menos 10 dígitos.');
                return of(null);
              }

              return this.contactoEmergenciaSvc.update(contactoId, updatePayload);
            }),
            concatMap((contactoResp: any) => {
              const newId = Number(contactoResp?.id ?? contactoResp?.Id ?? 0);
              if (newId) estudianteUpdate.idContactoEmergencia = newId;
              return this.estudiantesSvc.update(estudianteId, estudianteUpdate);
            }),
            tap(() => {
              // si cambió correo, actualiza el original
              this.originalCorreoInstitucional = correo;

              this.showSuccess('Estudiante actualizado.');
              this.showDialog = false;
              this.reset();
              this.load();
            })
          );
        }),
        catchError((err: any) => {
          console.error(err);
          this.showError('Error al actualizar estudiante');
          return of(null);
        })
      ).subscribe({
        complete: () => {
          this.saving = false;
        }
      });

      return;
    }

    // =========================
    // MODO CREAR
    // =========================
    if (!this.canCreateEstudiante) {
      this.showError('No tienes permisos para crear estudiantes.');
      return;
    }

    this.saving = true;

    this.usuariosSvc.puedeSerEstudiante(correo).pipe(
      concatMap((validation: any) => {
        if (!validation?.puedeSerEstudiante) {
          this.showError(validation?.motivo || 'El correo no puede ser asignado a estudiante.');
          return of(false);
        }
        return this.crearEstudiante(correo); // debe retornar Observable<boolean>
      }),
      catchError((err: any) => {
        console.error(err);
        this.showError('Error al guardar estudiante');
        return of(false);
      })
    ).subscribe({
      next: (ok: boolean) => {
        // ✅ CIERRE + TOAST EN CREATE
        if (ok) {
          this.showSuccess('Estudiante registrado.');
          this.showDialog = false;
          this.reset();
          this.load();
        }
      },
      complete: () => {
        this.saving = false;
      }
    });
  }
  // Extrae la lógica actual
  private crearEstudiante(correo: string): Observable<boolean> {
    const nombreLimpio = this.normalizaNombreCampo(this.form.value.nombre);
    const apePatLimpio = this.normalizaNombreCampo(this.form.value.apellidoPaterno);
    const apeMatLimpio = this.normalizaNombreCampo(this.form.value.apellidoMaterno);
    const noControl = String(this.form.value.noControl || '').trim().toUpperCase();

    const tmpPassword = this.generateTemporaryPassword();

    const userPayload: UserCreateRequest = {
      correo,
      passwordHash: tmpPassword,
      activo: true,
      nombre: nombreLimpio,
      apellidoPaterno: apePatLimpio,
      apellidoMaterno: apeMatLimpio
    };

    const estBase: Omit<EstudianteCreate, 'idUsuario'> = {
      nombre: nombreLimpio,
      apellidoPaterno: apePatLimpio,
      apellidoMaterno: apeMatLimpio,
      idcarrera: this.form.value.carrera ?? null,
      domicilio: this.form.value.domicilio || null,
      ciudad: this.form.value.ciudad || null,
      cp: this.form.value.cp ? String(this.form.value.cp).trim() : null,
      // OJO: en tu masivo mandas idestado; aquí tu form trae estadoTexto/municipioTexto.
      // Si tu API ya no requiere idestado/idmunicipio aquí, déjalo fuera.
      noControl: noControl || null,
      correoPersonal: this.form.value.correoPersonal || null,
      telefonoCelular: this.normalizaTelefono(this.form.value.telefonoCelular),
      idDependenciaMedica: this.form.value.dependenciaMedica ?? null,
      idContactoEmergencia: this.form.value.idContactoEmergencia ?? null,
      idProyecto: this.currentProyectoId
    };

    // ✅ Parte 4: Contacto de emergencia OPCIONAL.
    // En ALTA (create) tu UI normalmente ni muestra contacto, así que esto casi siempre será falso.
    const contactoTieneDatos =
      !!String(this.form.value.nombreContacto || '').trim() ||
      !!String(this.form.value.parentesco || '').trim() ||
      !!String(this.form.value.domicilioContacto || '').trim() ||
      !!String(this.form.value.telefonoContacto || '').trim() ||
      !!String(this.form.value.emailContacto || '').trim();

    const contactoCreatePayload: ContactoEmergencia = {
      id: 0,
      nombre: this.normalizaNombreCampo(this.form.value.nombreContacto),
      parentesco: String(this.form.value.parentesco || '').trim(),
      domicilio: String(this.form.value.domicilioContacto || '').trim(),
      telefono: this.normalizaTelefono(this.form.value.telefonoContacto),
      email: String(this.form.value.emailContacto || '').trim().toLowerCase(),
    } as any;

    // ✅ Si está vacío, NO creamos contacto; devolvemos id null.
    const contacto$ = contactoTieneDatos
      ? this.contactoEmergenciaSvc.create(contactoCreatePayload)
      : of({ id: null } as any);

    return forkJoin({
      byNoControl: this.estudiantesSvc.getByNoControl(noControl),
      byCorreo: this.usuariosSvc.getByCorreo(correo)
    }).pipe(
      concatMap(({ byNoControl, byCorreo }) => {
        // 1) NoControl duplicado
        if (byNoControl) {
          this.showError(`No. de control ya registrado (${noControl}).`);
          return of(false);
        }

        // 2) Usuario ya existe
        if (byCorreo) {
          const idUsuario = (byCorreo as UserSlim).id;

          // Validar que NO sea docente
          return this.validarUsuarioNoEsDocente$(idUsuario).pipe(
            concatMap(esValido => {
              if (!esValido) {
                this.showError(`El correo (${correo}) pertenece a un Docente. No se puede registrar como Estudiante.`);
                return of(false);
              }

              return this.asegurarRolEstudiante$(idUsuario, noControl).pipe(
                // ✅ Parte 4 aplicada aquí:
                concatMap(() => contacto$),
                concatMap((contacto) =>
                  this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(
                    concatMap((estMin: any) => {
                      const payload: EstudianteCreate = {
                        ...estBase,
                        idUsuario,
                        idContactoEmergencia: contacto?.id ?? null
                      };
                      return this.estudiantesSvc.update(Number(estMin.id), payload);
                    })
                  )
                ),
                tap(() => {
                  // usuario ya existía -> correo de “acceso habilitado”
                  this.enviarCorreoAccesoSistema(correo, noControl);
                }),
                map(() => true)
              );
            })
          );
        }

        // 3) Usuario nuevo -> crear -> rol -> (contacto opcional) -> update estudiante mínimo
        return this.usuariosSvc.create(userPayload).pipe(
          concatMap((u: UserSlim) =>
            this.asegurarRolEstudiante$(u.id, noControl).pipe(map(() => u))
          ),
          concatMap((u: UserSlim) =>
            // ✅ Parte 4 aplicada aquí:
            contacto$.pipe(
              concatMap((contacto) =>
                this.estudiantesSvc.getByIdUsuario(u.id).pipe(
                  concatMap((estMin: any) => {
                    const payload: EstudianteCreate = {
                      ...estBase,
                      idUsuario: u.id,
                      idContactoEmergencia: contacto?.id ?? null
                    };
                    return this.estudiantesSvc.update(Number(estMin.id), payload);
                  })
                )
              )
            )
          ),
          tap(() => {
            // usuario nuevo -> credenciales
            this.enviarCorreo(correo, tmpPassword, 'Credenciales enviadas');
          }),
          map(() => true)
        );
      }),
      catchError(err => {
        console.error('crearEstudiante error', err);
        this.showError('Error al guardar estudiante');
        return of(false);
      })
    );
  }

  private mapContactoFromApi(c: any) {
    // soporta tanto camelCase como PascalCase
    return {
      nombre: String(c?.nombre ?? c?.Nombre ?? ''),
      parentesco: String(c?.parentesco ?? c?.Parentesco ?? ''),
      domicilio: String(c?.domicilio ?? c?.Domicilio ?? ''),
      telefono: String(c?.telefono ?? c?.Telefono ?? ''),
      email: String(c?.email ?? c?.Email ?? ''),
      id: Number(c?.id ?? c?.Id ?? 0),
    };
  }

  // NUEVO: cargar registro completo al formulario
  editar(row: any) {
    // Asumo que row.id es idEstudiante
    this.estudiantesSvc.getById(row.id).subscribe({
      next: (d: any) => {
        this.isEditing.set(true);
        this.currentIds = { estudianteId: Number(d.id), usuarioId: Number(d.idUsuario) };

        const correoServer = String(d.correo ?? d.correoInstitucional ?? '').trim().toLowerCase();
        this.originalCorreoInstitucional = correoServer; // ✅ CLAVE

        this.form.patchValue({
          nombre: d.nombre ?? '',
          apellidoPaterno: d.apellidoPaterno ?? '',
          apellidoMaterno: d.apellidoMaterno ?? '',
          correoInstitucional: correoServer,
          noControl: d.noControl ?? '',
          correoPersonal: d.correoPersonal ?? '',
          telefonoCelular: d.telefonoCelular ?? '',
          carrera: d.idcarrera ?? null,
          domicilio: d.domicilio ?? '',
          ciudad: d.ciudad ?? '',
          cp: d.cp ?? '',
          dependenciaMedica: d.idDependenciaMedica ?? null,
          idContactoEmergencia: d.idContactoEmergencia ?? null,

          // contacto en form (si lo usas)
          nombreContacto: '',
          parentesco: '',
          domicilioContacto: '',
          telefonoContacto: '',
          emailContacto: '',
        }, { emitEvent: false });

        // Si hay contacto, lo cargas (opcional)
        if (d.idContactoEmergencia) {
          if (d.idContactoEmergencia) {
            this.contactoEmergenciaSvc.getById(d.idContactoEmergencia).subscribe({
              next: (contacto: any) => {
                const m = this.mapContactoFromApi(contacto);

                this.form.patchValue({
                  nombreContacto: m.nombre,
                  parentesco: m.parentesco,
                  domicilioContacto: m.domicilio,
                  telefonoContacto: m.telefono,
                  emailContacto: m.email,
                }, { emitEvent: false });

                this.loadingEdit = false;
              },
              error: (err: any) => {
                console.error('Error al cargar contacto de emergencia', err);
                this.showError('No se pudo cargar el contacto de emergencia.');
                this.loadingEdit = false;
              }
            });
          } else {
            // sin contacto ligado
            this.form.patchValue({
              nombreContacto: '',
              parentesco: '',
              domicilioContacto: '',
              telefonoContacto: '',
              emailContacto: '',
            }, { emitEvent: false });

            this.loadingEdit = false;
          }
        } else {
          this.loadingEdit = false;
        }
      },
      error: (err: any) => {
        console.error(err);
        this.showError('No se pudo cargar el estudiante.');
        this.loadingEdit = false;
      }
    });
  }




  // NUEVO: salir de edición y limpiar
  cancelarEdicion() {
    this.reset();
  }



  // ——————————————————————————————————————————————————————————
  // CARGA DE EXCEL (PrimeNG)
  // ——————————————————————————————————————————————————————————
  private ngZone = inject(NgZone);

  onUpload(event: any) {
    if (!this.canCreateEstudiante) {
      this.showError('No tienes permisos para cargar estudiantes desde Excel.');
      return;
    }

    const file = event.files?.[0];
    if (!file) return;


    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      // Aquí le agregamos la nueva columna "subio"
      const parsedConSubio = parsed.map((row: any) => ({
        ...row,
        subio: false      // o this.validarRegistro(row) si quieres marcar los válidos
      }));

      this.ngZone.run(() => {
        this.ExcelData = [...parsedConSubio];  // usamos la versión con la columna nueva

        this.marcarDuplicadosEnBD();

        this.cdr.markForCheck();

        queueMicrotask(() => {
          this.scrollToExcelSection(80);
          this.scrollExcelPreviewToBottom?.();
        });
      });
    };
    reader.readAsArrayBuffer(file);
  }

  private marcarDuplicadosEnBD() {
    if (!this.ExcelData?.length) return;

    const noControles = this.ExcelData
      .map(r => String(r?.noControl ?? '').trim().toUpperCase())
      .filter(v => !!v);

    const correos = this.ExcelData
      .map(r => String(r?.CorreoInstitucional ?? '').trim().toLowerCase())
      .filter(v => !!v);

    if (noControles.length === 0 && correos.length === 0) return;

    // ✅ PRENDER LOADER
    this.validandoDuplicados = true;
    this.cdr.markForCheck();

    this.estudiantesSvc.existsBulk({
      noControles: Array.from(new Set(noControles)),
      correos: Array.from(new Set(correos)),
    }).subscribe({
      next: (resp) => {
        const setNoCtrl = new Set((resp?.noControlesExistentes ?? []).map(x => String(x).trim().toUpperCase()));
        const setCorreo = new Set((resp?.correosExistentes ?? []).map(x => String(x).trim().toLowerCase()));

        this.ExcelData = this.ExcelData.map((row: any) => {
          const nc = String(row?.noControl ?? '').trim().toUpperCase();
          const co = String(row?.CorreoInstitucional ?? '').trim().toLowerCase();
          const formatoOk = this.validarRegistro(row);

          if (formatoOk && (setNoCtrl.has(nc) || setCorreo.has(co))) {
            return { ...row, subio: 'DUPLICADO' };
          }
          return row;
        });
      },
      error: (err) => {
        console.error('exists-bulk error', err);
      },
      complete: () => {
        // ✅ APAGAR LOADER
        this.validandoDuplicados = false;
        this.cdr.markForCheck();
      }
    });
  }


  async onFileChange(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const raw = await readExcelAsJson(file);
    this.rows = raw.map(r => trimAll(r));
    this.results = this.rows.map(() => ({}));
    this.progress = 0;
    this.summary = '';
  }

  private setSubio(
    idx: number,
    value: 'OK' | 'DUPLICADO' | 'FORMATO' | 'ERROR'
  ) {
    this.ExcelData = this.ExcelData.map((row: any, i: number) =>
      i === idx ? { ...row, subio: value } : row
    );
    this.cdr.markForCheck();
  }


  // Correo con formato tipo algo@dominio.tld
  private isValidEmail(email: string): boolean {
    if (!email) return false;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  // No de control: solo dígitos, 7 u 8 posiciones (ajústalo si tu regla es otra)
  // No. de control: 8 dígitos o 1 letra + 8 dígitos
  private isValidNoControl(noControl: string): boolean {
    if (!noControl) return false;
    return this.noControlRegex.test(noControl);
  }


  onSubmitExcel() {
    if (!this.canCreateEstudiante) {
      this.showError('No tienes permisos para guardar estudiantes desde Excel.');
      return;
    }

    if (!this.ExcelData.length || this.uploading) return;

    this.results = this.ExcelData.map(() => ({ ok: false, error: '' }));
    this.uploading = true;

    // ✅ activar modo silencioso (no toasts por fila)
    this.bulkSilent = true;
    this.emailsOk = 0;
    this.emailsFail = 0;

    let ok = 0;
    let duplicados = 0;
    let formatoInvalido = 0;
    let errores = 0;

    const total = this.ExcelData.length;

    const tick = () => {
      const procesados = ok + duplicados + formatoInvalido + errores;
      this.progress = Math.round((procesados / total) * 100);
      this.cdr.markForCheck();
    };

    // ✅ evitar duplicados dentro del mismo archivo (correo/noControl)
    const seenCorreos = new Set<string>();
    const seenNoControl = new Set<string>();

    from(this.ExcelData).pipe(
      concatMap((row: any, idx: number) => {

        // ✅ Si ya estaba marcado como duplicado desde la vista previa, no lo proceses
        if (row?.subio === 'DUPLICADO') {
          duplicados++;
          tick();
          return of(null);
        }

        const missing = requireFields(row, [
          'Nombre',
          'ApellidoPaterno',
          'ApellidoMaterno',
          'CorreoInstitucional',
          'noControl',
        ]);

        if (missing.length) {
          const msg = `Fila ${idx + 1}: faltan columnas -> ${missing.join(', ')}`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        const correo = String(row['CorreoInstitucional'] || '').trim().toLowerCase();
        const noControl = String(row['noControl'] ?? '').trim().toUpperCase();

        // ✅ duplicados dentro del archivo
        if (seenCorreos.has(correo)) {
          const msg = `Fila ${idx + 1}: correo repetido en el archivo (${correo}).`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'DUPLICADO');
          duplicados++; tick();
          return of(null);
        }
        if (seenNoControl.has(noControl)) {
          const msg = `Fila ${idx + 1}: NoControl repetido en el archivo (${noControl}).`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'DUPLICADO');
          duplicados++; tick();
          return of(null);
        }

        if (!this.isValidEmail(correo)) {
          const msg = `Fila ${idx + 1}: formato de correo institucional inválido (${correo || 'vacío'}).`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        if (!this.isValidNoControl(noControl)) {
          const msg = `Fila ${idx + 1}: formato de No. de control inválido (${noControl || 'vacío'}).`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        // ya pasaron validación local => los marcamos en los sets
        seenCorreos.add(correo);
        seenNoControl.add(noControl);

        const tmpPassword = this.generateTemporaryPassword();

        const nombreLimpio = this.normalizaNombreCampo(row['Nombre']);
        const apePatLimpio = this.normalizaNombreCampo(row['ApellidoPaterno']);
        const apeMatLimpio = this.normalizaNombreCampo(row['ApellidoMaterno']);

        const domicilioLimpio = this.normalizaDomicilio(row['Domicilio']);
        const ciudadLimpia = this.normalizaCiudad(row['Ciudad']);
        const telCelLimpio = this.normalizaTelefono(row['TelefonoCelular']);

        const userPayload: UserCreateRequest = {
          correo,
          passwordHash: tmpPassword,
          activo: true,
          nombre: nombreLimpio,
          apellidoPaterno: apePatLimpio,
          apellidoMaterno: apeMatLimpio
        };

        const estBase: Omit<EstudianteCreate, 'idUsuario'> = {
          nombre: nombreLimpio,
          apellidoPaterno: apePatLimpio,
          apellidoMaterno: apeMatLimpio,

          idcarrera: row['Carrera'] !== '' && row['Carrera'] != null ? Number(row['Carrera']) : null,

          domicilio: domicilioLimpio || null,
          ciudad: ciudadLimpia || null,

          cp: row['CP'] ? String(row['CP']).trim() : null,

          idestado: row['Estado'] !== '' && row['Estado'] != null ? Number(row['Estado']) : null,

          noControl,
          correoPersonal: row['CorreoPersonal'] || null,
          noSeguroSocial: row['NoSeguroSocial'] || null,

          idDependenciaMedica: row['DependenciaMedica'] !== '' && row['DependenciaMedica'] != null
            ? Number(row['DependenciaMedica'])
            : null,

          telefonoCelular: telCelLimpio,

          // ✅ Parte 4: NO creamos contacto en masivo.
          // Si el Excel trae un IdContactoEmergencia real, lo usamos; si no, null.
          idContactoEmergencia: row['IdContactoEmergencia'] ?? null,

          idProyecto: null
        };

        // ✅ Parte 4: contacto$ siempre null en masivo (evita crear registros vacíos).
        const contacto$ = of({ id: null } as any);

        return forkJoin({
          byNoControl: this.estudiantesSvc.getByNoControl(noControl),
          byCorreo: this.usuariosSvc.getByCorreo(correo),
        }).pipe(
          concatMap(({ byNoControl, byCorreo }) => {

            if (byNoControl) {
              const msg = `Fila ${idx + 1}: No. de control ya registrado (${noControl}).`;
              this.results[idx] = { error: msg };
              this.setSubio(idx, 'DUPLICADO');
              duplicados++; tick();
              return of(null);
            }

            // ===== Usuario ya existe
            if (byCorreo) {
              const idUsuario = (byCorreo as UserSlim).id;

              // ✅ VALIDACIÓN: verificar que NO sea Docente
              return this.validarUsuarioNoEsDocente$(idUsuario).pipe(
                concatMap(esValido => {
                  if (!esValido) {
                    const msg = `Fila ${idx + 1}: el usuario (${correo}) ya tiene el rol de Docente. No se puede asignar rol Estudiante.`;
                    this.results[idx] = { error: msg };
                    this.setSubio(idx, 'ERROR');
                    errores++; tick();
                    return of(null);
                  }

                  return this.asegurarRolEstudiante$(idUsuario, noControl).pipe(
                    // ✅ Parte 4 aplicada:
                    concatMap(() => contacto$),
                    concatMap((contacto) =>
                      this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(
                        concatMap((estMin: any) => {
                          const est: EstudianteCreate = {
                            ...estBase,
                            idUsuario,
                            idContactoEmergencia: (estBase as any).idContactoEmergencia ?? contacto?.id ?? null
                          };
                          return this.estudiantesSvc.update(Number(estMin.id), est);
                        }),
                        tap(() => {
                          this.results[idx] = { ok: true };
                          this.setSubio(idx, 'OK');
                          ok++; tick();

                          this.enviarCorreoAccesoSistema(correo, noControl);
                        })
                      )
                    )
                  );
                })
              );
            }

            // ===== Usuario nuevo -> crear usuario -> rol -> (sin contacto) -> update estudiante
            return this.usuariosSvc.create(userPayload).pipe(
              concatMap((u: UserSlim) =>
                this.asegurarRolEstudiante$(u.id, noControl).pipe(map(() => u))
              ),
              concatMap((u: UserSlim) =>
                // ✅ Parte 4 aplicada:
                contacto$.pipe(
                  concatMap((contacto) =>
                    this.estudiantesSvc.getByIdUsuario(u.id).pipe(
                      concatMap((estMin: any) => {
                        const est: EstudianteCreate = {
                          ...estBase,
                          idUsuario: u.id,
                          idContactoEmergencia: (estBase as any).idContactoEmergencia ?? contacto?.id ?? null
                        };
                        return this.estudiantesSvc.update(Number(estMin.id), est);
                      }),
                      tap(() => {
                        this.results[idx] = { ok: true };
                        this.setSubio(idx, 'OK');
                        ok++; tick();

                        this.enviarCorreo(correo, tmpPassword, 'Credenciales enviadas');
                      })
                    )
                  )
                )
              )
            );
          }),
          catchError(e => {
            console.error(`Error al guardar estudiante (fila ${idx + 1})`, e?.error || e);

            const msg = `Fila ${idx + 1}: Error al guardar en el servidor.`;
            this.results[idx] = { error: msg };
            this.setSubio(idx, 'ERROR');

            errores++; tick();
            return of(null);
          })
        );
      })
    ).subscribe({
      complete: () => {
        this.uploading = false;

        this.summary =
          `Proceso terminado. ` +
          `Guardados: ${ok}. ` +
          `Ya registrados: ${duplicados}. ` +
          `Formato inválido: ${formatoInvalido}. ` +
          `Errores: ${errores}.`;

        // ✅ desactivar modo silencioso
        this.bulkSilent = false;

        // ✅ un solo toast final
        this.showBulkSummary(total, ok, duplicados, formatoInvalido, errores);

        this.cdr.markForCheck();
        this.load();
      },
      error: (e) => {
        this.uploading = false;
        this.bulkSilent = false;
        console.error('Error en flujo general de carga masiva:', e?.error || e);
        this.showError('No se pudo completar la carga masiva.');
      }
    });
  }



  // ——————————————————————————————————————————————————————————
  // Utilidades UI
  // ——————————————————————————————————————————————————————————

  // ========================= ROLES: asegurar "Estudiante" =========================
  private estudianteRoleIdCache: number | null = null;

  private getEstudianteRoleId$() {
    if (this.estudianteRoleIdCache) {
      return of(this.estudianteRoleIdCache);
    }

    return this.usuariosSvc.getAllRoles().pipe(
      map((roles: any[]) => {
        const rol = (roles ?? []).find(r =>
          String(r?.descripcion ?? '').trim().toLowerCase() === 'estudiante'
        );

        const id = Number(rol?.id ?? NaN);
        if (!Number.isFinite(id) || id <= 0) {
          throw new Error('No se encontró el rol "Estudiante" en el catálogo.');
        }

        this.estudianteRoleIdCache = id;
        return id;
      })
    );
  }

  private asegurarRolEstudiante$(idUsuario: number, noControl: string) {
    const nc = String(noControl || '').trim().toUpperCase();

    return this.getEstudianteRoleId$().pipe(
      concatMap((idRolEstudiante: number) =>
        // ✅ Asignar SOLO Estudiante (tu backend lo exige: Estudiante no puede traer más roles)
        // ✅ Mandar noControl para que el backend pueda crear el “mínimo viable” si no existe
        this.usuariosSvc.updateRolesUsuario(idUsuario, [idRolEstudiante], nc)
      ),
      map(() => void 0)
    );
  }



  fullName(r: EstudianteListItem) {
    return `${r.nombre} ${r.apellidoPaterno} ${r.apellidoMaterno}`.trim();
  }

  reset() {
    this.form.reset();
    this.isEditing.set(false);
    this.currentIds = {};
    this.currentProyectoId = null;

  }

  trackById = (_: number, r: EstudianteListItem) => r.id;

  // ===== Carga masiva: modo silencioso (sin toast por fila) =====
  private bulkSilent = false;

  // Contadores de correo (para resumen final)
  private emailsOk = 0;
  private emailsFail = 0;

  showSuccess(mensaje: string) {
    if (this.bulkSilent) return;
    this.messageService.add({ severity: 'success', summary: 'OK', detail: mensaje, life: 10000 });
  }

  showError(mensaje: string) {
    if (this.bulkSilent) return;
    this.messageService.add({ severity: 'error', summary: 'Error', detail: mensaje, life: 10000 });
  }

  private catalogToastShown = false;

  private showCatalogErrorOnce() {
    if (this.bulkSilent) return;
    if (this.catalogToastShown) return;
    this.catalogToastShown = true;

    this.messageService.add({
      severity: 'warn',
      summary: 'Catálogos',
      detail: 'No se pudieron cargar algunos catálogos. Recarga la página o intenta más tarde.',
      life: 8000
    });
  }


  private showBulkSummary(total: number, ok: number, duplicados: number, formato: number, errores: number) {
    const msg =
      `Carga masiva finalizada: ${ok} de ${total} guardados ✅ | ` +
      `Duplicados: ${duplicados} | ` +
      `Formato inválido: ${formato} | ` +
      `Errores: ${errores}` +
      ((this.emailsOk + this.emailsFail) > 0
        ? ` | Correos: ${this.emailsOk} enviados, ${this.emailsFail} fallidos`
        : '');

    if (errores > 0 || formato > 0) {
      this.messageService.add({ severity: 'warn', summary: 'Resumen', detail: msg, life: 10000 });
    } else {
      this.messageService.add({ severity: 'success', summary: 'Resumen', detail: msg, life: 10000 });
    }
  }


  enviarCorreo(correo: string, password: string, _okMessage: string) {
    const tema = 'Credenciales para Vinculación de Proyectos';
    const cuerpo = `Su contraseña temporal es: ${password}`;

    this.emailService.sendEmail(correo, tema, cuerpo).subscribe({
      next: () => {
        // ✅ En masivo solo contamos
        if (this.bulkSilent) this.emailsOk++;
        // ✅ En NO masivo: NO mostramos toast (para no duplicar confirmaciones)
      },
      error: (e) => {
        console.error('Error al enviar correo', e);
        this.showError('Error al enviar correo')
        // ✅ En masivo contamos fallos
        if (this.bulkSilent) this.emailsFail++;

        // ✅ En NO masivo: NUNCA dispares toast aquí (rompe la regla 1 operación = 1 mensaje)
        // Si luego quieres avisarlo, se integra en el mensaje final del submit, no aquí.
      }
    });
  }


  private enviarCorreoAccesoSistema(email: string, noControl: string): void {
    const em = String(email || '').trim().toLowerCase();
    if (!em) return;

    const nc = String(noControl || '').trim().toUpperCase();

    const tema = 'Acceso habilitado | Sistema de Residencias';

    // ✅ Como tu backend tiene IsBodyHtml = true, mandamos HTML real
    const cuerpo = `
    <p>Hola,</p>
    <p>Te informamos que tu registro como <b>Candidato a Residencia</b> ya fue creado y tu acceso al <b>Sistema de Residencias</b> está habilitado.</p>
    <p><b>No. de control:</b> ${nc || 'N/A'}</p>
    <p>Ya puedes ingresar con tu <b>correo institucional</b> y tu contraseña habitual.</p>
    <p style="margin-top:16px;">Si no recuerdas tu contraseña, utiliza la opción de <b>recuperación</b> desde la pantalla de inicio.</p>
    <p style="margin-top:16px;">Saludos.<br/>Sistema de Vinculación y Residencias</p>
  `;

    // ✅ Sin toasts: un solo mensaje por operación en la UI
    this.emailService.sendEmail(em, tema, cuerpo).subscribe({
      next: () => { this.emailsOk++; },
      error: (err) => { console.error(err); this.emailsFail++; }
    });
  }



  openCom(id: number) {
    this.router.navigate(['/estudiantes/edit', id]);
  }

  generateTemporaryPassword() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      password += characters[randomIndex];
    }
    return password;
  }

  private enviarCorreoCredencialesDocente(email: string, tempPass: string): void {
    const correo = String(email || '').trim().toLowerCase();
    if (!correo) return;

    const subject = 'Acceso al Sistema de Residencias';
    const body = `
    <p>Hola,</p>
    <p>Tu acceso al <b>Sistema de Residencias</b> ha sido creado.</p>
    <p><b>Usuario:</b> ${correo}</p>
    <p><b>Contraseña temporal:</b> ${tempPass}</p>
    <p>Te recomendamos cambiar tu contraseña al ingresar.</p>
    <p style="margin-top:16px;">Saludos.<br/>Sistema de Vinculación y Residencias</p>
  `;

    // ✅ sin toast, best-effort
    this.emailService.sendEmail(correo, subject, body).subscribe({
      next: () => { },
      error: (err) => console.error('Error enviando correo credenciales docente:', err),
    });
  }

  private enviarCorreoAccesoDocente(email: string): void {
    const correo = String(email || '').trim().toLowerCase();
    if (!correo) return;

    const subject = 'Acceso habilitado | Sistema de Residencias';
    const body = `
    <p>Hola,</p>
    <p>Tu acceso al <b>Sistema de Residencias</b> ha sido habilitado.</p>
    <p>Ya puedes ingresar con tu <b>correo institucional</b> y tu contraseña habitual.</p>
    <p style="margin-top:16px;">Si no recuerdas tu contraseña, utiliza la opción de <b>recuperación</b> en la pantalla de inicio.</p>
    <p style="margin-top:16px;">Saludos.<br/>Sistema de Vinculación y Residencias</p>
  `;

    // ✅ sin toast, best-effort
    this.emailService.sendEmail(correo, subject, body).subscribe({
      next: () => { },
      error: (err) => console.error('Error enviando correo acceso docente:', err),
    });
  }


  searchValue = ''
  clear(table: Table) {
    table.clear();
    this.searchValue = '';
  }




  // propiedades nuevas
  showDialog = false;
  dialogMode: 'add' | 'edit' = 'add';

  // abrir para alta
  openAddDialog() {
    if (!this.canCreateEstudiante) {
      this.showError('No tienes permisos para crear estudiantes.');
      return;
    }

    this.dialogMode = 'add';
    this.originalCorreoInstitucional = '';
    this.isEditing.set(false);
    this.saving = false;

    this.reset();         // si ya tienes reset()
    this.showDialog = true;
  }

  // abrir para edición (desde la tabla)
  openEditDialog(row: any) {
    if (!this.canUpdateEstudiante) {
      this.showError('No tienes permisos para actualizar estudiantes.');
      return;
    }

    this.dialogMode = 'edit';
    this.isEditing.set(true);
    this.saving = false;
    this.loadingEdit = true;
    this.showDialog = true;

    this.editar(row);
  }



  openPdfViewerExpediente(tipoExpedienteId: number) {
    const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
    if (!alumnoId) {
      this.showError('Selecciona un estudiante válido para ver su PDF.');
      return;
    }

    const doc = this.expedienteMap[tipoExpedienteId];
    if (!doc) {
      this.showError('Este documento no está cargado.');
      return;
    }

    const token = this.tokenSvc.getToken();
    if (!token) {
      this.showError('Sesión requerida. Inicia sesión nuevamente.');
      return;
    }

    this.downloadingTipo = tipoExpedienteId;

    this.documentosSvc.verExpedientePdfArrayBufferByEstudiante(tipoExpedienteId, alumnoId, token).pipe(
      catchError((err) => {
        console.error(err);
        this.showError('No se pudo abrir el PDF. Intenta nuevamente.');
        return of(null);
      })
    ).subscribe((buffer: ArrayBuffer | null) => {
      this.downloadingTipo = null;

      if (!buffer || buffer.byteLength <= 0) return;

      this.pdfArrayBuffer = buffer;
      this.pdfDialogVisible = true;
      queueMicrotask(() => this.cdr.detectChanges());
    });
  }

  downloadExpedienteAlumno(tipoExpedienteId: number) {
    const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
    if (!alumnoId) {
      this.showError('Selecciona un estudiante válido para descargar su documento.');
      return;
    }

    const doc = this.expedienteMap[tipoExpedienteId];
    if (!doc) {
      this.showError('Este documento no está cargado.');
      return;
    }

    const token = this.tokenSvc.getToken();
    if (!token) {
      this.showError('Sesión requerida. Inicia sesión nuevamente.');
      return;
    }

    this.downloadingTipo = tipoExpedienteId;

    this.documentosSvc.descargarExpedienteByEstudiante(tipoExpedienteId, alumnoId, token).pipe(
      catchError((err) => {
        console.error(err);
        this.showError('No se pudo descargar el documento.');
        return of(null);
      })
    ).subscribe((blob: Blob | null) => {
      this.downloadingTipo = null;
      if (!blob) return;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const safeName = (doc?.nombreOriginal || `expediente_${tipoExpedienteId}.pdf`).replace(/[^\w.\-() ]+/g, '_');
      a.download = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;

      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  closePdfViewer() {
    this.pdfArrayBuffer = null;
    this.pdfDialogVisible = false;
  }


  // al cerrar el diálogo, deja todo limpio
  onDialogHide() {
    this.cancelarEdicion?.();
    this.dialogMode = 'add';
  }

  clearExcel() {
    this.ExcelData = []
  }

  // Letras con espacios y acentos, sin números
  private readonly soloLetrasRegex =
    /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;

  // 8 dígitos O una letra y 8 dígitos
  private readonly noControlRegex = /^(\d{8}|[A-Za-z]\d{8})$/;

  // Formato general de correo
  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  validarRegistro(r: any): boolean {
    if (!r) return false;

    const nombre = this.normalizaNombreCampo(r.Nombre);
    const apePat = this.normalizaNombreCampo(r.ApellidoPaterno);
    const apeMat = this.normalizaNombreCampo(r.ApellidoMaterno);
    const correo = (r.CorreoInstitucional ?? '').trim();
    const noControl = String(r.noControl ?? '').trim().toUpperCase();



    const nombreOk = this.soloLetrasRegex.test(nombre);
    const apePatOk = this.soloLetrasRegex.test(apePat);
    const apeMatOk = apeMat === '' || this.soloLetrasRegex.test(apeMat);
    const correoOk = this.emailRegex.test(correo);
    const noControlOk = this.noControlRegex.test(noControl);

    return nombreOk && apePatOk && apeMatOk && correoOk && noControlOk;
  }


  cargarCatalogos() {
    this.loadingEstados = true;
    this.form.get('estado')?.disable({ emitEvent: false });


    // DEPENDENCIAS MÉDICAS
    this.catalogosSvc.getActivasDependenciaMedica().subscribe({
      next: (res) => {
        this.dependenciaMedica = res;
      },
      error: (err) => {
        console.error(err);
        this.showCatalogErrorOnce();

      }
    });

    // CARRERAS
    this.catalogosSvc.getAll().subscribe({
      next: (res) => {
        this.carreras = res.filter(c => c.activo);
      },
      error: (err) => {
        console.error(err);
        this.showCatalogErrorOnce();

      }
    });
  }


  onEstadoChange(estadoId: string | number) {
    this.form.patchValue({ municipio: null });
    this.municipios = [];
    this.form.get('municipio')?.disable({ emitEvent: false });

    if (!estadoId) return;

    this.loadingMunicipios = true;

    this.dipomex.getMunicipios(String(estadoId)).subscribe({
      next: (res) => {
        this.loadingMunicipios = false;

        if (res.error) {
          this.showCatalogErrorOnce();
          return;
        }

        this.municipios = res.municipios || [];

        if (this.municipios.length > 0) {
          this.form.get('municipio')?.enable({ emitEvent: false });
        }

        // y aquí usamos el que venía de la BD
        if (this.pendingMunicipioId) {
          this.form.patchValue({ municipio: this.pendingMunicipioId });
          this.pendingMunicipioId = null;
        }
      },
      error: (err) => {
        this.loadingMunicipios = false;
        console.error(err);
        this.showCatalogErrorOnce();

        this.form.get('municipio')?.disable({ emitEvent: false });
      }
    });
  }



  onCpInput(): void {
    const cpCtrl = this.form.get('cp');
    if (!cpCtrl) return;

    // normaliza a 5 dígitos
    const clean = String(cpCtrl.value ?? '').replace(/\D/g, '').slice(0, 5);
    if (clean !== cpCtrl.value) cpCtrl.setValue(clean, { emitEvent: false });

    // si incompleto, limpia textos
    if (clean.length !== 5) {
      this.cpLookupError = clean.length === 0 ? '' : 'El CP debe tener 5 dígitos.';
      this.form.patchValue(
        { estadoTexto: '', municipioTexto: '' },
        { emitEvent: false }
      );
      return;
    }

    this.cpLookupLoading = true;
    this.cpLookupError = '';

    this.dipomex.getCodigoPostal(clean).subscribe({
      next: (res) => {
        this.cpLookupLoading = false;

        if (!res || res.error) {
          this.cpLookupError = res?.message || 'No se encontró información para el CP.';
          this.form.patchValue({ estadoTexto: '', municipioTexto: '' }, { emitEvent: false });
          return;
        }

        const info = res.codigo_postal;
        this.form.patchValue(
          {
            estadoTexto: info?.estado ?? '',
            municipioTexto: info?.municipio ?? '',
          },
          { emitEvent: false }
        );
      },
      error: () => {
        this.cpLookupLoading = false;
        this.cpLookupError = 'Error consultando Dipomex.';
        this.form.patchValue({ estadoTexto: '', municipioTexto: '' }, { emitEvent: false });
      },
    });
  }





  private mapEstadoIdFromDb(id: number | null | undefined): string | null {
    if (id == null) return null;
    // ESTADO_ID es "01", "02", ..., "32"
    return id.toString().padStart(2, '0');
  }

  private mapMunicipioIdFromDb(id: number | null | undefined): string | null {
    if (id == null) return null;
    // MUNICIPIO_ID es "001", "002", ...
    return id.toString().padStart(3, '0');
  }

  get canReadEstudiante() {
    return this.usuariosSvc.hasPerm('Estudiante', 'Read');
  }

  get canCreateEstudiante() {
    return this.usuariosSvc.hasPerm('Estudiante', 'Create');
  }

  get canUpdateEstudiante() {
    return this.usuariosSvc.hasPerm('Estudiante', 'Update');
  }

  // Nombres / apellidos: sin números, sin símbolos raros, espacios normales y Title Case
  private normalizaNombreCampo(valor: any): string {
    const soloLetrasYEspacios = String(valor ?? '')
      // solo letras (con acentos) + espacios
      .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, '');

    const limpio = soloLetrasYEspacios
      .trim()                // quita espacios al inicio y final
      .replace(/\s+/g, ' '); // convierte múltiples espacios internos en uno solo

    if (!limpio) return '';

    // Title Case palabra por palabra
    return limpio
      .toLowerCase()
      .split(' ')
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  // Domicilio: texto libre, pero sin espacios de más
  private normalizaDomicilio(valor: any): string {
    return String(valor ?? '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  // Ciudad: la tratamos como nombre propio → Title Case
  private normalizaCiudad(valor: any): string {
    const limpio = String(valor ?? '')
      .trim()
      .replace(/\s+/g, ' ');

    if (!limpio) return '';

    return limpio
      .toLowerCase()
      .split(' ')
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  private normalizaTelefono(valor: any, maxLen: number = 10): string | null {
    const digits = String(valor ?? '')
      .replace(/\D/g, '')
      .slice(0, maxLen);

    return digits || null;
  }

  private tieneDatosContacto(): boolean {
    const v = this.form.value;

    return !!(
      (v.nombreContacto && String(v.nombreContacto).trim()) ||
      (v.parentesco && String(v.parentesco).trim()) ||
      (v.domicilioContacto && String(v.domicilioContacto).trim()) ||
      (v.telefonoContacto && String(v.telefonoContacto).trim()) ||
      (v.emailContacto && String(v.emailContacto).trim())
    );
  }


  onNombreBlur(controlName: string) {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;

    const normalizado = this.normalizaNombreCampo(ctrl.value);
    if (normalizado !== ctrl.value) {
      ctrl.setValue(normalizado, { emitEvent: false });
    }
  }


  // Normaliza el No. de control: mayúsculas, sin espacios, 1ª letra/dígito, resto dígitos
  sanitizeNoControlInput() {
    const ctrl = this.form.get('noControl');
    if (!ctrl) return;

    let value = String(ctrl.value || '')
      .toUpperCase()      // todo a mayúsculas
      .replace(/\s+/g, ''); // sin espacios

    let result = '';

    for (let i = 0; i < value.length && i < 9; i++) {
      const ch = value[i];

      if (i === 0) {
        // primer carácter: letra o dígito
        if (/[A-Z0-9]/.test(ch)) {
          result += ch;
        }
      } else {
        // del segundo en adelante: solo dígitos
        if (/\d/.test(ch)) {
          result += ch;
        }
      }
    }

    if (result !== ctrl.value) {
      ctrl.setValue(result, { emitEvent: false });
    }
  }

  downloadExcelTemplate() {
    const headers = [
      'Nombre',
      'ApellidoPaterno',
      'ApellidoMaterno',
      'CorreoInstitucional',
      'noControl'
    ];

    // Solo encabezados, sin datos
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estudiantes');

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    const blob = new Blob(
      [wbout],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Plantilla_Estudiantes.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  // Solo letras (con acentos) y espacios mientras el usuario escribe
  onLettersOnlyInput(controlName: string) {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;

    const original = String(ctrl.value || '');
    // Permitimos letras (may/min), acentos y espacios
    const sanitized = original.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, '');

    if (sanitized !== original) {
      ctrl.setValue(sanitized, { emitEvent: false });
    }
  }

  // Cache del id del rol Docente (para validación)
  private docenteRoleIdCache: number | null = null;

  private getDocenteRoleId$() {
    if (this.docenteRoleIdCache) {
      return of(this.docenteRoleIdCache);
    }

    return this.usuariosSvc.getAllRoles().pipe(
      map((roles: any[]) => {
        const rol = (roles ?? []).find(r =>
          String(r?.descripcion ?? '').trim().toLowerCase() === 'docente'
        );

        const id = Number(rol?.id ?? NaN);
        if (!Number.isFinite(id) || id <= 0) {
          throw new Error('No se encontró el rol "Docente" en el catálogo.');
        }

        this.docenteRoleIdCache = id;
        return id;
      })
    );
  }

  // ✅ Valida que el usuario NO tenga rol Docente
  private validarUsuarioNoEsDocente$(idUsuario: number): Observable<boolean> {
    return this.getDocenteRoleId$().pipe(
      concatMap((rolDocenteId) =>
        this.usuariosSvc.getRolesByUsuario(idUsuario).pipe(
          map((roles: any[]) => {
            const tieneRolDocente = (roles ?? []).some(r => Number(r.id) === rolDocenteId);
            return !tieneRolDocente; // true si NO es docente
          })
        )
      ),
      catchError(err => {
        console.error('Error validando rol docente', err);
        return of(true); // Permitir si no se puede validar
      })
    );
  }

  private readonly TIPO_CD = 11;



  

  /** Para tipo 12 cuando es ZIP/RAR (descarga directa, no visor PDF) */
  descargarArchivoAlumno(tipoExpedienteId: number): void {
    const alumnoId = Number(this.selectedAlumnoForExpediente?.id ?? this.selectedAlumnoForExpediente?.Id ?? 0);
    if (!alumnoId) return;

    const doc = this.expedienteMap[tipoExpedienteId];
    if (!doc) return;

    const token = this.tokenSvc.getToken();
    if (!token) return;

    this.downloadingTipo = tipoExpedienteId;

    this.documentosSvc.descargarExpedienteByEstudiante(tipoExpedienteId, alumnoId, token).pipe(
      catchError(err => {
        console.error(err);
        this.showError('No se pudo descargar el archivo.');
        return of(null);
      })
    ).subscribe((blob: Blob | null) => {
      this.downloadingTipo = null;
      if (!blob) return;

      const fileName = doc?.nombreOriginal || `expediente_tipo_${tipoExpedienteId}`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  getUrlExterna(doc: any): string | null {
  const u = String(doc?.urlExterna ?? doc?.UrlExterna ?? '').trim();
  return u.length ? u : null;
}

abrirUrl(url: string): void {
  const clean = (url ?? '').trim();
  if (!clean) return;
  window.open(clean, '_blank', 'noopener');
}

copiarUrl(url: string): void {
  const clean = (url ?? '').trim();
  if (!clean) return;

  navigator.clipboard?.writeText(clean)
    .then(() => this.showSuccess('Enlace copiado.'))
    .catch(() => this.showError('No se pudo copiar. Copia manualmente.'));
}

}
