import { Component, inject, signal, ChangeDetectorRef, ElementRef, ViewChild, OnInit, NgZone } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Table, TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { FileUpload } from 'primeng/fileupload';
import { MessageService } from 'primeng/api';

import * as XLSX from 'xlsx';
import { from, of, forkJoin, Observable } from 'rxjs';
import { concatMap, catchError, tap, map } from 'rxjs/operators';

import { UsuariosService } from '../../../service/usuarios.service';
import { DocentesService } from '../../../service/docentes.service';
import { EmailService } from '../../../service/email.service';
import { DocenteCreate, DocenteListItem, UserCreateRequest, UserSlim } from '../../../Interface/InterfaceUsuario';
import { requireFields, RowObj } from '../../../utils/excel-helpers';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { PeriodosAcademicosService } from '../../../service/periodoAcademico.service';

@Component({
  selector: 'app-docentes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableModule, ToastModule, FileUpload, ButtonModule, FormsModule, DialogModule],
  templateUrl: './docentes.html',
  styleUrls: ['./docentes.css'],
  providers: [MessageService]
})
export class Docentes implements OnInit {
  private fb = inject(FormBuilder);
  private usuariosSvc = inject(UsuariosService);
  private docentesSvc = inject(DocentesService);
  private emailSvc = inject(EmailService);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(MessageService);
  private periodosSvc = inject(PeriodosAcademicosService);
  private ngZone = inject(NgZone);

  @ViewChild('excelSection', { static: false }) excelSection!: ElementRef<HTMLElement>;
  @ViewChild('excelScroll', { static: false }) excelScroll!: ElementRef<HTMLElement>;

  // Solo letras + espacios + acentos
  private readonly soloLetrasRegex =
    /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;

  form: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.pattern(this.soloLetrasRegex)]],
    apellidoPaterno: ['', [Validators.required, Validators.pattern(this.soloLetrasRegex)]],
    apellidoMaterno: ['', [Validators.pattern(this.soloLetrasRegex)]],


    correoInstitucional: ['', [Validators.required, Validators.email]],

    RFC: ['', [
      Validators.pattern(/^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/i)
    ]],

    Telefono: ['', [
      Validators.pattern(/^\d{10}$/)
    ]],

    nivelAcademico: [null],
    esJefeDepartamento: [false],
  });



  get f() {
    return this.form.controls;
  }

  digitsOnly(controlName: string, maxLen: number) {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;
    const only = String(ctrl.value || '').replace(/\D/g, '').slice(0, maxLen);
    if (only !== ctrl.value) {
      ctrl.setValue(only, { emitEvent: false });
    }
  }



  docentes: DocenteListItem[] = [];
  isEditing = signal(false);
  currentIds: { idDocente?: number; idUsuario?: number } = {};

  ExcelData: any[] = [];
  rows: RowObj[] = [];
  results: { ok?: boolean; error?: string }[] = [];
  uploading = false;
  progress = 0;
  summary = '';

  validandoExistencia = false;
  validandoMsg = 'Validando en base de datos...';


  showDetalleDialog = false;
  detalleLoading = false;

  docenteSel: DocenteListItem | null = null;

  detalleDocente: any = null;
  detalleAsesor: any[] = [];
  detalleRevisor: any[] = [];
  detalleRevisorAnte: any[] = [];

  selectedPeriodoId: number | null = null;

  periodosRevisorUnicos: { idPeriodoAcademico: number; periodoNombre: string }[] = [];

  // ===== Generación de oficio revisor (por docente) =====
  showPeriodoSelectDialog = false;
  periodosGenUnicos: { idPeriodoAcademico: number; periodoNombre: string }[] = [];
  selectedPeriodoGenId: number | null = null;

  docenteGenSel: DocenteListItem | null = null;
  revisorRowsSel: any[] = [];


  // ===== Periodo actual (obligatorio para generar) =====
  currentPeriodoId: number | null = null;
  currentPeriodoNombre: string = '';

  // Estado de generación
  generandoMasivo = false;
  generandoUno = false;

  // ===== Carga masiva: modo silencioso (sin toast por fila) =====



  ngOnInit() {
    this.load();
    this.loadPeriodoActual();
  }

  private loadPeriodoActual() {
    this.periodosSvc.getPeriodoActual().subscribe({
      next: (p: any) => {
        const id = Number(p?.id ?? p?.idPeriodoAcademico ?? 0);
        if (!id) {
          this.currentPeriodoId = null;
          this.currentPeriodoNombre = '';
          this.showError('No se pudo determinar el periodo actual (respuesta inválida del API).');
          return;
        }

        this.currentPeriodoId = id;
        this.currentPeriodoNombre = String(p?.nombre ?? p?.periodoNombre ?? `Periodo #${id}`);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.currentPeriodoId = null;
        this.currentPeriodoNombre = '';
        this.showError('No se pudo cargar el periodo actual. Sin eso no se puede generar el oficio.');
      }
    });
  }

  generarOficioRevisorPorDocente(d: DocenteListItem) {
    if (!this.currentPeriodoId) {
      this.showError('No hay periodo actual cargado. No se puede generar.');
      return;
    }
    if (!d?.id) {
      this.showError('Docente inválido.');
      return;
    }
    if (this.generandoUno) return;

    this.generandoUno = true;

    this.docentesSvc.getSuscripciones(d.id).pipe(
      catchError(err => {
        console.error(err);
        this.showError('No se pudo obtener la información del revisor.');
        return of(null);
      })
    ).subscribe(res => {
      this.generandoUno = false;

      const rows = (res?.revisor ?? []) as any[];
      if (!rows.length) {
        this.showError('Este docente no tiene asignaciones como Revisor.');
        return;
      }

      const periodoId = Number(this.currentPeriodoId);
      const rowsPeriodo = rows.filter(x => Number(x?.idPeriodoAcademico ?? 0) === periodoId);

      if (!rowsPeriodo.length) {
        this.showError(`Este docente no tiene proyectos como Revisor en el periodo actual (${this.currentPeriodoNombre || periodoId}).`);
        return;
      }

      const payload = this.buildPayloadRevisorFormatoFotoFromRows(d, rowsPeriodo);

      this.periodosSvc.oficiosRevisoresFormatoFoto(periodoId, payload).subscribe({
        next: (blob) => {
          const nombre = this.fullName(d).replace(/\s+/g, '_');
          this.periodosSvc.downloadBlob(blob, `Oficio_Revisor_${nombre}_PeriodoActual.pdf`);
          this.showSuccess('Oficio generado.');
        },
        error: (err) => {
          console.error(err);
          this.showError('No se pudo generar el oficio.');
        }
      });
    });
  }


  generarOficiosRevisoresMasivo() {
    if (!this.currentPeriodoId) {
      this.showError('No hay periodo actual cargado. No se puede generar masivo.');
      return;
    }
    if (this.generandoMasivo) return;

    this.generandoMasivo = true;

    const periodoId = Number(this.currentPeriodoId);

    let generados = 0;
    let omitidos = 0;

    from(this.docentes).pipe(
      concatMap((d: DocenteListItem) =>
        this.docentesSvc.getSuscripciones(d.id).pipe(
          map(res => ({ docente: d, rows: (res?.revisor ?? []) as any[] })),
          catchError(err => {
            console.error('Suscripciones error', d?.id, err);
            omitidos++;
            return of(null);
          })
        )
      ),
      concatMap((pack: any) => {
        if (!pack) return of(null);

        const docente = pack.docente as DocenteListItem;
        const rows = pack.rows as any[];

        if (!rows.length) {
          omitidos++;
          return of(null);
        }

        const rowsPeriodo = rows.filter(x => Number(x?.idPeriodoAcademico ?? 0) === periodoId);
        if (!rowsPeriodo.length) {
          omitidos++;
          return of(null);
        }

        const payload = this.buildPayloadRevisorFormatoFotoFromRows(docente, rowsPeriodo);

        return this.periodosSvc.oficiosRevisoresFormatoFoto(periodoId, payload).pipe(
          tap((blob: any) => {
            const nombre = this.fullName(docente).replace(/\s+/g, '_');
            this.periodosSvc.downloadBlob(blob, `Oficio_Revisor_${nombre}_PeriodoActual.pdf`);
            generados++;
          }),
          catchError(err => {
            console.error('Generación error', docente?.id, err);
            omitidos++;
            return of(null);
          })
        );
      })
    ).subscribe({
      complete: () => {
        this.generandoMasivo = false;
        this.showSuccess(`Masivo finalizado (Periodo actual). Generados: ${generados}. Omitidos: ${omitidos}.`);
      },
      error: (err) => {
        this.generandoMasivo = false;
        console.error(err);
        this.showError('Falló la descarga masiva.');
      }
    });
  }



  load() {
    this.docentesSvc.getAll().subscribe({
      next: rows => {
        queueMicrotask(() => {
          this.docentes = rows;
          this.cdr.detectChanges();
        });
      },
      error: err => console.error('Load docentes error', err)
    });
  }

  openDetalleDialog(d: DocenteListItem) {
    this.docenteSel = d;
    this.showDetalleDialog = true;
    this.detalleLoading = true;

    this.detalleDocente = null;
    this.detalleAsesor = [];
    this.detalleRevisor = [];
    this.detalleRevisorAnte = [];

    this.docentesSvc.getSuscripciones(d.id).pipe(
      catchError(err => {
        console.error(err);
        this.showError('No se pudo cargar el detalle del docente.');
        return of(null);
      })
    ).subscribe(res => {
      if (!res) {
        this.detalleLoading = false;
        this.cdr.markForCheck();
        return;
      }

      this.detalleDocente = res.docente;
      this.detalleAsesor = res.asesor ?? [];
      this.detalleRevisor = res.revisor ?? [];

      // ✅ construir lista única de periodos para el select (sin duplicados)
      const map = new Map<number, string>();

      (this.detalleRevisor ?? []).forEach((x: any) => {
        const id = Number(x?.idPeriodoAcademico ?? 0);
        if (!id) return;

        const nombre = String(x?.periodoNombre ?? '').trim() || `Periodo #${id}`;
        if (!map.has(id)) map.set(id, nombre);
      });

      this.periodosRevisorUnicos = Array.from(map.entries()).map(([idPeriodoAcademico, periodoNombre]) => ({
        idPeriodoAcademico,
        periodoNombre
      }));

      // si el periodo seleccionado ya no existe, límpialo
      if (this.selectedPeriodoId && !map.has(this.selectedPeriodoId)) {
        this.selectedPeriodoId = null;
      }

      this.detalleRevisorAnte = res.revisorAnteproyecto ?? [];

      this.detalleLoading = false;
      this.cdr.markForCheck();
    });
  }

  // Correo genérico
  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // RFC México
  private readonly rfcRegex = /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/;

  // Teléfono a 10 dígitos
  private readonly telRegex = /^\d{10}$/;

  private isValidEmail(email: string): boolean {
    const e = String(email ?? '').trim();
    return !!e && this.emailRegex.test(e);
  }

  private isValidRfc(rfc: string): boolean {
    const r = String(rfc ?? '').trim();
    if (!r) return true;              // RFC opcional
    return this.rfcRegex.test(r.toUpperCase());
  }

  private isValidTelefono(tel: string): boolean {
    const t = String(tel ?? '').trim();
    if (!t) return true;              // tel opcional
    return this.telRegex.test(t);
  }

  validarRegistro(r: any): boolean {
    if (!r) return false;

    const nombre = this.normalizaNombreCampo(r.Nombre);
    const apePat = this.normalizaNombreCampo(r.ApellidoPaterno);
    const apeMat = this.normalizaNombreCampo(r.ApellidoMaterno);
    const correo = String(r.CorreoInstitucional ?? '').trim();
    const rfc = String(r.RFC ?? '').trim();
    const telefono = String(r.Telefono ?? '').trim();

    const nombreOk = this.soloLetrasRegex.test(nombre);
    const apePatOk = this.soloLetrasRegex.test(apePat);
    const apeMatOk = !apeMat || this.soloLetrasRegex.test(apeMat);
    const correoOk = this.isValidEmail(correo);
    const rfcOk = this.isValidRfc(rfc);
    const telefonoOk = this.isValidTelefono(telefono);

    return nombreOk && apePatOk && apeMatOk && correoOk && rfcOk && telefonoOk;
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



  // Cache del id del rol Docente
  rolDocenteId: number | null = null;

  private ensureRolDocenteId$(): Observable<number> {
    if (this.rolDocenteId) return of(this.rolDocenteId);

    return this.usuariosSvc.getAllRoles().pipe(
      map((roles: any[]) => {
        const rol = (roles ?? []).find(r =>
          String(r?.descripcion ?? '').trim().toLowerCase() === 'docente'
        );

        if (!rol?.id) {
          throw new Error('No se encontró el rol "Docente" en el catálogo.');
        }

        this.rolDocenteId = Number(rol.id);
        return this.rolDocenteId;
      })
    );
  }

  /**
   * Asigna el rol Docente al usuario SIN borrar otros roles.
   * (porque updateRolesUsuario normalmente reemplaza)
   */
  private asignarRolDocente$(idUsuario: number): Observable<any> {
    return this.ensureRolDocenteId$().pipe(
      concatMap((rolId) =>
        this.usuariosSvc.getRolesByUsuario(idUsuario).pipe(
          map((roles: any[]) => (roles ?? []).map(r => Number(r.id))),
          map((ids: number[]) => (ids.includes(rolId) ? ids : [...ids, rolId])),
          concatMap((idsFinal: number[]) => this.usuariosSvc.updateRolesUsuario(idUsuario, idsFinal))
        )
      ),
      catchError(err => {
        console.error('No se pudo asignar rol Docente', err);
        // ✅ Sin toast aquí: el método público decide el único mensaje final
        return of(null); // no rompas el flujo
      })

    );
  }

  private syncUsuarioNombre$(
    idUsuario: number,
    correo: string,
    nombre: string,
    apellidoPaterno: string,
    apellidoMaterno: string
  ): Observable<any> {

    const usuarioUpdate = {
      id: idUsuario,
      correo,
      nombre,
      apellidoPaterno,
      apellidoMaterno,
      activo: true
    } as any;

    return this.usuariosSvc.update(idUsuario, usuarioUpdate).pipe(
      catchError(err => {
        console.error('No se pudo sincronizar nombre/apellidos en usuario', err);
        // No rompas el flujo: el docente puede crearse aunque el update de usuario falle
        return of(null);
      })
    );
  }



  // ——————————————————————————————————
  // Crear / Actualizar
  // ——————————————————————————————————
  onSubmit() {
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    this.showError('Formulario inválido. Revisa los campos obligatorios.');
    return;
  }

  const correo = String(this.form.value.correoInstitucional || '').trim().toLowerCase();

  // ✅ Si está en edición => UPDATE (NO crear)
  if (this.isEditing() && this.currentIds?.idDocente && this.currentIds?.idUsuario) {
    this.actualizarDocente(this.currentIds.idDocente, this.currentIds.idUsuario, correo).subscribe({
      next: () => {
        this.showSuccess('Docente actualizado.');
        this.reset();
        this.load();
      },
      error: (e) => {
        console.error(e);
        this.showError('No se pudo actualizar el docente. Verifica y vuelve a intentar.');
      }
    });
    return;
  }

  // ✅ Si NO está en edición => CREATE (tu flujo actual)
  this.usuariosSvc.puedeSerDocente(correo).pipe(
    concatMap(validation => {
      if (!validation.puedeSerDocente) {
        this.showError(validation.motivo);
        return of(null);
      }
      return this.crearDocente(correo);
    })
  ).subscribe({
    next: () => {
      this.showSuccess('Docente registrado.');
      this.reset();
      this.load();
    },
    error: (e) => {
      console.error(e);
      this.showError('No se pudo registrar el docente. Verifica el correo y vuelve a intentar.');
    }
  });
}

// Extrae la lógica actual de creación a un método separado
private crearDocente(correo: string): Observable<any> {
  const nombre = this.normalizaNombreCampo(this.form.value.nombre);
  const apellidoPaterno = this.normalizaNombreCampo(this.form.value.apellidoPaterno);
  const apellidoMaterno = this.normalizaNombreCampo(this.form.value.apellidoMaterno);

  const docenteBase: Omit<DocenteCreate, 'idUsuario'> = {
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    rfc: this.nz(this.form.value.RFC),
    telefono: this.nz(this.form.value.Telefono),
    nivelAcademico: this.form.value.nivelAcademico || null,
    esJefeDepartamento: !!this.form.value.esJefeDepartamento,
    correo,
  };

  const tempPass = this.generateTemporaryPassword();

  const userPayload: UserCreateRequest = {
    correo,
    passwordHash: tempPass,
    activo: true,
    nombre,
    apellidoPaterno,
    apellidoMaterno
  };

  return this.usuariosSvc.getByCorreo(correo).pipe(
    concatMap(found => {
      if (!found) {
        return this.usuariosSvc.create(userPayload).pipe(
          concatMap((u: UserSlim) =>
            this.asignarRolDocente$(u.id).pipe(map(() => u))
          ),
          tap(() => this.enviarCorreoCredencialesDocente(correo, tempPass)),
          concatMap((u: UserSlim) => {
            const payload: DocenteCreate = { ...docenteBase, idUsuario: u.id };
            return this.docentesSvc.create(payload);
          })
        );
      }

      const idUsuario = (found as UserSlim).id;
      const payload: DocenteCreate = { ...docenteBase, idUsuario };

      return this.syncUsuarioNombre$(idUsuario, correo, nombre, apellidoPaterno, apellidoMaterno).pipe(
        concatMap(() => this.asignarRolDocente$(idUsuario)),
        concatMap(() => this.docentesSvc.create(payload)),
        tap(() => this.enviarCorreoAccesoDocente(correo))
      );
    })
  );
}

private actualizarDocente(
  idDocente: number,
  idUsuario: number,
  correo: string
): Observable<any> {

  const nombre = this.normalizaNombreCampo(this.form.value.nombre);
  const apellidoPaterno = this.normalizaNombreCampo(this.form.value.apellidoPaterno);
  const apellidoMaterno = this.normalizaNombreCampo(this.form.value.apellidoMaterno);

  const rfc = this.nz(this.form.value.RFC);
  const telefono = this.nz(this.form.value.Telefono);

  // 1) Actualiza USUARIO (correo + nombre/apellidos)
  const usuarioUpdate: any = {
    id: idUsuario,
    correo,
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    activo: true
  };

  // 2) Actualiza DOCENTE
  // OJO: tu backend maneja el correo del docente como `correo` (en editar patchValue usas d.correo)
  const docenteUpdate: any = {
    id: idDocente,
    idUsuario,
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    correo,
    rfc,
    telefono,
    nivelAcademico: this.form.value.nivelAcademico || null,
    esJefeDepartamento: !!this.form.value.esJefeDepartamento,
  };

  // Si cambiaste el correo, esto puede chocar con “docente vs estudiante” según tus reglas.
  // Por consistencia, revalidamos (pero permitimos el mismo correo si es el mismo usuario).
  return this.usuariosSvc.getByCorreo(correo).pipe(
    concatMap(found => {
      if (found && Number((found as any)?.id) !== Number(idUsuario)) {
        // El correo pertenece a otro usuario distinto
        this.showError('Ese correo ya pertenece a otro usuario.');
        return of(null);
      }

      // ✅ Ejecuta updates en secuencia
      return this.usuariosSvc.update(idUsuario, usuarioUpdate).pipe(
        // Roles opcional: solo si necesitas asegurar rol docente al editar
        concatMap(() => this.asignarRolDocente$(idUsuario)),
        // ✅ Aquí está la clave: UPDATE, no CREATE
        concatMap(() => this.docentesSvc.update(idDocente, docenteUpdate)),
      );
    })
  );
}
  // Cargar registro completo al formulario para edición
  editar(row: DocenteListItem) {
  this.docentesSvc.getById(row.id).subscribe({
    next: (d) => {
      this.isEditing.set(true);

      // ✅ Asegura que tienes los IDs necesarios para update
      this.currentIds = { idDocente: Number(d.id), idUsuario: Number(d.idUsuario) };

      this.form.patchValue({
        nombre: d.nombre ?? '',
        apellidoPaterno: d.apellidoPaterno ?? '',
        apellidoMaterno: d.apellidoMaterno ?? '',
        correoInstitucional: d.correo ?? '',
        RFC: d.rfc ?? '',
        Telefono: d.telefono ?? '',
        nivelAcademico: (d as any).nivelAcademico ?? null,
        esJefeDepartamento: !!(d as any).esJefeDepartamento,
      }, { emitEvent: false });

      setTimeout(() => {
        const el = document.querySelector('form');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);

      this.showSuccess('Docente cargado para edición.');
    },
    error: (err) => {
      console.error('GetById docente error', err);
      this.showError('No se pudo cargar el docente.');
    }
  });
}
  cancelarEdicion() {
    this.reset();
  }

  deleteDocente(idDocente: number) {
    this.docentesSvc.delete(idDocente).subscribe({
      next: () => { this.showSuccess('Docente eliminado'); this.load(); },
      error: err => { console.error('Delete docente error', err); this.showError('Error al eliminar docente'); }
    });
  }

  reset() {
    this.form.reset();
    this.isEditing.set(false);
    this.currentIds = {};
  }

  // ——————————————————————————————————
  // CARGA MASIVA DESDE EXCEL
  // ——————————————————————————————————
  onUpload(event: any) {
    const file = event.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const NIVELES_VALIDOS = [
        'Licenciatura / Ingeniería', 'Especialidad', 'Maestría', 'Doctorado', 'Postdoctorado'
      ];

      const parsedConSubio = parsed.map((r: any) => {
        const nivelRaw = String(r['NivelAcademico'] ?? '').trim();
        const nivelAcademico = NIVELES_VALIDOS.includes(nivelRaw) ? nivelRaw : null;

        const jefeRaw = String(r['EsJefeDepartamento'] ?? '').trim().toLowerCase();
        const esJefeDepartamento = jefeRaw === 'sí' || jefeRaw === 'si' || jefeRaw === 's' || jefeRaw === 'yes' || jefeRaw === '1' || jefeRaw === 'true';

        return {
          ...r,
          Nombre: this.normalizaNombreCampo(r['Nombre']),
          ApellidoPaterno: this.normalizaNombreCampo(r['ApellidoPaterno']),
          ApellidoMaterno: this.normalizaNombreCampo(r['ApellidoMaterno']),
          CorreoInstitucional: String(r['CorreoInstitucional'] ?? '').trim(),
          RFC: String(r['RFC'] ?? '').trim().toUpperCase(),
          Telefono: String(r['Telefono'] ?? '').trim(),
          NivelAcademico: nivelAcademico,
          EsJefeDepartamento: esJefeDepartamento,
          subio: '' as '' | 'OK' | 'DUPLICADO' | 'FORMATO' | 'ERROR'
        };
      });

      this.ngZone.run(() => {
        this.ExcelData = [...parsedConSubio];
        this.cdr.markForCheck();
        queueMicrotask(() => {
          this.scrollToExcelSection(80);
          this.scrollExcelPreviewToBottom();
        });
        this.validarDuplicadosEnBD();

      });
    };
    reader.readAsArrayBuffer(file);
  }


  onSubmitExcelDocentes() {
    if (!this.ExcelData?.length || this.uploading || this.validandoExistencia) return;


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

    const seenCorreos = new Set<string>();
    const normalizeEmail = (s: any) => String(s ?? '').trim().toLowerCase();

    from(this.ExcelData).pipe(
      concatMap((row: any, idx: number) => {

        // 1) columnas mínimas
        const missing = requireFields(row, ['Nombre', 'ApellidoPaterno', 'CorreoInstitucional']);
        if (missing.length) {
          const msg = `Fila ${idx + 1}: faltan columnas -> ${missing.join(', ')}`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        // 2) normalización + campos
        const nombre = this.normalizaNombreCampo(row['Nombre']);
        const apePat = this.normalizaNombreCampo(row['ApellidoPaterno']);
        const apeMat = this.normalizaNombreCampo(row['ApellidoMaterno']);
        const correo = normalizeEmail(row['CorreoInstitucional']);
        const rfc = String(row['RFC'] ?? '').trim().toUpperCase();
        const tel = String(row['Telefono'] ?? '').trim();

        // 3) validaciones (sin toast por fila)
        if (!this.soloLetrasRegex.test(nombre)) {
          const msg = `Fila ${idx + 1}: Nombre inválido (${row['Nombre']}). Solo letras y espacios.`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        if (!this.soloLetrasRegex.test(apePat)) {
          const msg = `Fila ${idx + 1}: Apellido paterno inválido (${row['ApellidoPaterno']}). Solo letras y espacios.`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        if (apeMat && !this.soloLetrasRegex.test(apeMat)) {
          const msg = `Fila ${idx + 1}: Apellido materno inválido (${row['ApellidoMaterno']}). Solo letras y espacios.`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        if (!this.isValidEmail(correo)) {
          const msg = `Fila ${idx + 1}: correo institucional inválido (${row['CorreoInstitucional'] || 'vacío'}).`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        if (!this.isValidRfc(rfc)) {
          const msg = `Fila ${idx + 1}: RFC inválido (${rfc}).`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        if (!this.isValidTelefono(tel)) {
          const msg = `Fila ${idx + 1}: Teléfono inválido (${tel}). Debe tener 10 dígitos.`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'FORMATO');
          formatoInvalido++; tick();
          return of(null);
        }

        // 4) duplicado dentro del archivo
        if (seenCorreos.has(correo)) {
          const msg = `Fila ${idx + 1}: correo repetido en el archivo (${correo}). Se omite.`;
          this.results[idx] = { error: msg };
          this.setSubio(idx, 'DUPLICADO');
          duplicados++; tick();
          return of(null);
        }
        seenCorreos.add(correo);

        // 5) construir payloads
        const nivelAcademico = row['NivelAcademico'] ?? null;
        const esJefeDepartamento = !!row['EsJefeDepartamento'];

        const docenteBase: Omit<DocenteCreate, 'idUsuario'> = {
          nombre,
          apellidoPaterno: apePat,
          apellidoMaterno: apeMat,
          rfc: this.nz(rfc),
          telefono: this.nz(tel),
          nivelAcademico,
          esJefeDepartamento,
          correo,
        };

        const tempPass = this.generateTemporaryPassword();

        const userPayload: UserCreateRequest = {
          correo,
          passwordHash: tempPass,
          activo: true,
          nombre,
          apellidoPaterno: apePat,
          apellidoMaterno: apeMat
        };


        const subject = 'Acceso al Sistema de Residencias';
        const body = `Su contraseña temporal es: ${tempPass}`;

        // 6) flujo principal
        // 6) flujo principal
return this.usuariosSvc.getByCorreo(correo).pipe(
  concatMap(foundUser => {

    // ===== Usuario YA existe =====
    if (foundUser) {
      const idUsuario = (foundUser as UserSlim).id;

      // ✅ NUEVA VALIDACIÓN: verificar que NO sea Estudiante
      return this.validarUsuarioNoEsEstudiante$(idUsuario).pipe(
        concatMap(esValido => {
          if (!esValido) {
            const msg = `Fila ${idx + 1}: el usuario (${correo}) ya tiene el rol de Estudiante. No se puede asignar rol Docente.`;
            this.results[idx] = { error: msg };
            this.setSubio(idx, 'ERROR');
            errores++; tick();
            return of(null);
          }

          return this.docentesSvc.getByIdUsuario(idUsuario).pipe(
            concatMap(existsDoc => {
              if (existsDoc) {
                const msg = `Fila ${idx + 1}: el correo (${correo}) ya tiene un docente registrado.`;
                this.results[idx] = { error: msg };
                this.setSubio(idx, 'DUPLICADO');
                duplicados++; tick();
                return of(null);
              }

              const payload: DocenteCreate = { ...docenteBase, idUsuario };

              return this.syncUsuarioNombre$(idUsuario, correo, nombre, apePat, apeMat).pipe(
                concatMap(() => this.asignarRolDocente$(idUsuario)),
                concatMap(() =>
                  this.docentesSvc.create(payload).pipe(
                    tap(() => {
                      this.results[idx] = { ok: true };
                      this.setSubio(idx, 'OK');
                      ok++; tick();

                      this.emailSvc.sendEmail(correo,
                        'Acceso habilitado | Sistema de Residencias',
                        `<p>Hola,</p>
     <p>Tu acceso al <b>Sistema de Residencias</b> ha sido habilitado.</p>
     <p>Ya puedes ingresar con tu <b>correo institucional</b> y tu contraseña habitual.</p>
     <p style="margin-top:16px;">Saludos.<br/>Sistema de Vinculación y Residencias</p>`
                      ).subscribe({
                        next: () => this.emailsOk++,
                        error: () => this.emailsFail++,
                      });
                    })
                  )
                )
              );
            })
          );
        })
      );
    }

    // ===== Usuario NO existe =====
    return this.usuariosSvc.create(userPayload).pipe(
      concatMap((u: UserSlim) =>
        this.asignarRolDocente$(u.id).pipe(map(() => u))
      ),
      tap(() => {
        this.emailSvc.sendEmail(correo, subject, body).subscribe({
          next: () => this.emailsOk++,
          error: () => this.emailsFail++,
        });
      }),
      concatMap((u: UserSlim) => {
        const payload: DocenteCreate = { ...docenteBase, idUsuario: u.id };
        return this.docentesSvc.create(payload).pipe(
          tap(() => {
            this.results[idx] = { ok: true };
            this.setSubio(idx, 'OK');
            ok++; tick();
          })
        );
      })
    );
  }),
  catchError(e => {
    const msg = this.extractApiError(e);
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

        // ✅ volver a activar toasts normales
        this.bulkSilent = false;

        // ✅ un solo toast resumen
        this.showBulkSummary(total, ok, duplicados, formatoInvalido, errores);

        this.load();
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.uploading = false;
        this.bulkSilent = false;
        this.showError(this.extractApiError(e) || 'Error en carga masiva');
        console.error(e);
        this.cdr.markForCheck();
      }
    });
  }

  private validarDuplicadosEnBD() {
    if (!this.ExcelData?.length) return;

    this.validandoExistencia = true;
    this.cdr.markForCheck();

    const normalizeEmail = (s: any) => String(s ?? '').trim().toLowerCase();
    const normalizeRfc = (s: any) => String(s ?? '').trim().toUpperCase();

    const correos = Array.from(new Set(
      this.ExcelData
        .map(r => normalizeEmail(r.CorreoInstitucional))
        .filter(c => !!c)
    ));

    const rfcs = Array.from(new Set(
      this.ExcelData
        .map(r => normalizeRfc(r.RFC))
        .filter(r => !!r)
    ));

    this.docentesSvc.existsBulk(correos, rfcs).subscribe({
      next: (resp) => {
        const setCorreos = new Set((resp?.correosExistentes ?? []).map(x => String(x).toLowerCase()));
        const setRfcs = new Set((resp?.rfcsExistentes ?? []).map(x => String(x).toUpperCase()));

        this.ExcelData = this.ExcelData.map((row: any, i: number) => {
          // Si ya está marcado por FORMATO/ERROR/OK, no lo pises
          if (row.subio === 'FORMATO' || row.subio === 'ERROR' || row.subio === 'OK') return row;

          const correo = normalizeEmail(row.CorreoInstitucional);
          const rfc = normalizeRfc(row.RFC);

          // Si no pasa validación básica, no lo marques duplicado aquí
          if (!this.validarRegistro(row)) return row;

          if (correo && setCorreos.has(correo)) {
            return { ...row, subio: 'DUPLICADO' };
          }

          if (rfc && setRfcs.has(rfc)) {
            return { ...row, subio: 'DUPLICADO' };
          }

          return row;
        });

        this.validandoExistencia = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.validandoExistencia = false;
        this.showError('No se pudo validar existencia en BD.');
        this.cdr.markForCheck();
      }
    });
  }


  private extractApiError(e: any): string {
    if (e?.error?.message) return e.error.message;
    if (e?.error?.errors && typeof e.error.errors === 'object') {
      const parts = Object.entries(e.error.errors).map(([k, v]: any) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      return parts.join(' | ');
    }
    return e?.message || 'Error';
  }



  // ——————————————————————————————————
  // Helpers UI
  // ——————————————————————————————————
  fullName(r: DocenteListItem) {
    return `${r.nombre} ${r.apellidoPaterno} ${r.apellidoMaterno}`.trim();
  }

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

  private generateTemporaryPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let p = '';
    for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p;
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
    this.emailSvc.sendEmail(correo, subject, body).subscribe({
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
    this.emailSvc.sendEmail(correo, subject, body).subscribe({
      next: () => { },
      error: (err) => console.error('Error enviando correo acceso docente:', err),
    });
  }


  private nz(v: any): string | null {
    const s = String(v ?? '').trim();
    return s.length ? s : null;
  }

  // ===== Carga masiva: modo silencioso (sin toast por fila) =====
  private bulkSilent = false;

  // Contadores opcionales (correo)
  private emailsOk = 0;
  private emailsFail = 0;

  showSuccess(msg: string) {
    if (this.bulkSilent) return;

    // ✅ 1 solo mensaje visible (limpia el anterior)
    this.toast.clear();
    this.toast.add({ severity: 'success', summary: 'OK', detail: msg, life: 10000 });
  }

  showError(msg: string) {
    if (this.bulkSilent) return;

    // ✅ 1 solo mensaje visible (limpia el anterior)
    this.toast.clear();
    this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 10000 });
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

    // ✅ 1 solo toast resumen
    this.toast.clear();

    if (errores > 0 || formato > 0) {
      this.toast.add({ severity: 'warn', summary: 'Resumen', detail: msg, life: 10000 });
    } else {
      this.toast.add({ severity: 'success', summary: 'Resumen', detail: msg, life: 10000 });
    }
  }


  searchValue = ''
  clear(table: Table) {
    table.clear();
    this.searchValue = '';
  }


  // Estado del diálogo
  showDialog = false;
  dialogMode: 'add' | 'edit' = 'add';

  // Abrir para alta
  openAddDialog() {
    this.dialogMode = 'add';
    this.cancelarEdicion?.(); // Limpia el form si ya la tienes
    this.showDialog = true;
  }

  // Abrir para edición (reutiliza tu lógica actual)
  openEditDialog(row: any) {
    this.dialogMode = 'edit';
    if (typeof this.editar === 'function') {
      this.editar(row); // Tu función ya setea el form y flags
    } else {
      // Fallback por si no usas editar():
      this.form.patchValue({
        nombre: row.nombre,
        apellidoPaterno: row.apellidoPaterno,
        apellidoMaterno: row.apellidoMaterno,
        correoInstitucional: row.correo,
        RFC: row.rfc,
        Telefono: row.telefono,
      });
    }
    this.showDialog = true;
  }

  // Al cerrar el diálogo
  onDialogHide() {
    this.cancelarEdicion?.();
    this.dialogMode = 'add';
  }

  // Limpiar datos de Excel (opcional)
  clearExcel() {
    this.ExcelData = [];
    this.progress = 0;
  }

  toUpper(controlName: string) {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;

    const value = (ctrl.value || '').toString().toUpperCase();
    if (ctrl.value !== value) {
      ctrl.setValue(value, { emitEvent: false });
    }
  }


  // Normaliza nombres/apellidos: quita espacios extras, pasa a minúsculas y luego TitleCase
  private normalizaNombreCampo(valor: any): string {
    let s = String(valor ?? '');

    // recorta y colapsa espacios
    s = s.trim().replace(/\s+/g, ' ').toLowerCase();

    // Capitalizar cada palabra
    s = s.replace(/\b[a-záéíóúüñ]/g, (c) => c.toUpperCase());

    return s;
  }

  // Para inputs de nombre/apellidos: no deja escribir números ni símbolos
  sanitizeNombreInput(controlName: string) {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;

    let value = String(ctrl.value ?? '');

    // Quitar todo lo que no sea letra/espacio
    value = value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, '');

    if (value !== ctrl.value) {
      ctrl.setValue(value, { emitEvent: false });
    }
  }

  downloadPlantilla() {
    const headers = [
      ['Nombre', 'ApellidoPaterno', 'ApellidoMaterno', 'CorreoInstitucional', 'RFC', 'Telefono', 'NivelAcademico', 'EsJefeDepartamento']
    ];
    // Fila de ejemplo orientativa
    const ejemplo = [
      ['Juan', 'García', 'López', 'juan.garcia@tec.mx', 'GALJ800101AAA', '9511234567',
       'Maestría', 'No']
    ];

    const ws = XLSX.utils.aoa_to_sheet([...headers, ...ejemplo]);

    // Ancho de columnas
    ws['!cols'] = [
      { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 32 },
      { wch: 16 }, { wch: 14 }, { wch: 28 }, { wch: 24 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Docentes');
    XLSX.writeFile(wb, 'Plantilla_Docentes.xlsx');
  }

  generarOficiosRevisoresFormatoFoto(periodoId: number, payload: any) {
    this.periodosSvc.oficiosRevisoresFormatoFoto(periodoId, payload).subscribe({
      next: (blob) => this.periodosSvc.downloadBlob(blob, 'Oficios_Revisores_Formato_Foto.pdf'),
      error: (err) => console.error(err)
    });
  }


  // helper para nombre completo (en mayúsculas como el oficio)
  private docenteSelNombreMayus(): string {
    if (!this.docenteSel) return '';
    return this.fullName(this.docenteSel).toUpperCase();
  }

  private buildPayloadRevisorFormatoFoto(): any {
    // ⚠️ Ajusta estos textos si tu escuela los maneja distinto
    const revisorNombre = this.docenteSelNombreMayus();
    const revisorCargo = 'DOCENTE DEL DEPARTAMENTO DE SISTEMAS Y COMPUTACIÓN';

    const rows = (this.detalleRevisor ?? []).map((x: any) => ({
      NoControl: x.noControl ?? x.no_control ?? '—',
      Estudiante: x.estudiante ?? x.estudianteNombre ?? '—',
      Proyecto: x.proyectoTitulo ?? x.proyecto ?? '—',
      Asesor: x.asesorNombre ?? x.asesor ?? '—',
    }));

    return {
      Ciudad: 'Oaxaca de Juárez, Oaxaca',
      Fecha: new Date().toISOString(), // backend recibe DateTime
      Oficio: 'JV-XXX/2025',
      Asunto: 'Revisor de Residencia Profesional',
      FirmaNombre: 'M.C. MARICELA MORALES HERNÁNDEZ',
      FirmaCargoLinea1: 'JEFA DEL DEPARTAMENTO DE SISTEMAS Y COMPUTACIÓN',
      Revisores: [
        {
          RevisorNombre: revisorNombre,
          RevisorCargoLinea1: revisorCargo,
          Rows: rows
        }
      ]
    };
  }

  generarOficiosRevisoresFormatoFotoDesdeDetalle() {
    if (!this.selectedPeriodoId) {
      this.showError('Selecciona un período para generar el oficio.');
      return;
    }
    if (!this.docenteSel) {
      this.showError('No hay docente seleccionado.');
      return;
    }

    const payload = this.buildPayloadRevisorFormatoFoto();

    this.periodosSvc.oficiosRevisoresFormatoFoto(this.selectedPeriodoId, payload).subscribe({
      next: (blob) => this.periodosSvc.downloadBlob(blob, 'Oficios_Revisores_Formato_Foto.pdf'),
      error: (err) => {
        console.error(err);
        this.showError('No se pudo generar el oficio.');
      }
    });
  }



  confirmarGeneracionOficioRevisor() {
    if (!this.docenteGenSel) {
      this.showError('No hay docente seleccionado.');
      return;
    }
    if (!this.selectedPeriodoGenId) {
      this.showError('Selecciona un periodo.');
      return;
    }
    const periodoId = this.selectedPeriodoGenId;

    const rowsPeriodo = (this.revisorRowsSel ?? []).filter(x =>
      Number(x?.idPeriodoAcademico ?? 0) === Number(periodoId)
    );

    if (!rowsPeriodo.length) {
      this.showError('No hay registros de revisor para ese periodo.');
      return;
    }

    this.showPeriodoSelectDialog = false;
    this.generarOficioRevisorConDatos(periodoId, this.docenteGenSel, rowsPeriodo);
  }

  private generarOficioRevisorConDatos(periodoId: number, docente: DocenteListItem, rowsPeriodo: any[]) {
    const payload = this.buildPayloadRevisorFormatoFotoFromRows(docente, rowsPeriodo);

    this.periodosSvc.oficiosRevisoresFormatoFoto(periodoId, payload).subscribe({
      next: (blob) => {
        const nombre = this.fullName(docente).replace(/\s+/g, '_');
        this.periodosSvc.downloadBlob(blob, `Oficio_Revisor_${nombre}.pdf`);
        this.showSuccess('Oficio generado.');
      },
      error: (err) => {
        console.error(err);
        this.showError('No se pudo generar el oficio.');
      }
    });
  }



  /**
   * Descarga masiva: genera el oficio para cada docente que tenga filas como revisor
   * para un periodo determinado.
   *
   * ⚠️ Importante: Sin backend ZIP, esto descargará varios PDFs (uno por docente).
   */

  private buildPayloadRevisorFormatoFotoFromRows(docente: DocenteListItem, rowsPeriodo: any[]): any {
    const revisorNombre = this.fullName(docente).toUpperCase();
    const revisorCargo = 'DOCENTE DEL DEPARTAMENTO DE SISTEMAS Y COMPUTACIÓN';

    const rows = (rowsPeriodo ?? []).map((x: any) => ({
      NoControl: x.noControl ?? x.no_control ?? '—',
      Estudiante: x.estudiante ?? x.estudianteNombre ?? x.nombreEstudiante ?? '—',
      Proyecto: x.proyectoTitulo ?? x.proyecto ?? x.tituloProyecto ?? '—',
      Asesor: x.asesorNombre ?? x.asesor ?? x.nombreAsesor ?? '—',
    }));

    return {
      Ciudad: 'Oaxaca de Juárez, Oaxaca',
      Fecha: new Date().toISOString(),
      Oficio: 'JV-XXX/2025',
      Asunto: 'Revisor de Residencia Profesional',
      FirmaNombre: 'M.C. MARICELA MORALES HERNÁNDEZ',
      FirmaCargoLinea1: 'JEFA DEL DEPARTAMENTO DE SISTEMAS Y COMPUTACIÓN',
      Revisores: [
        {
          RevisorNombre: revisorNombre,
          RevisorCargoLinea1: revisorCargo,
          Rows: rows
        }
      ]
    };
  }

  // Cache del id del rol Estudiante (para validación)
private rolEstudianteId: number | null = null;

private ensureRolEstudianteId$(): Observable<number> {
  if (this.rolEstudianteId) return of(this.rolEstudianteId);

  return this.usuariosSvc.getAllRoles().pipe(
    map((roles: any[]) => {
      const rol = (roles ?? []).find(r =>
        String(r?.descripcion ?? '').trim().toLowerCase() === 'estudiante'
      );

      if (!rol?.id) {
        throw new Error('No se encontró el rol "Estudiante" en el catálogo.');
      }

      this.rolEstudianteId = Number(rol.id);
      return this.rolEstudianteId;
    })
  );
}

// ✅ Valida que el usuario NO tenga rol Estudiante
private validarUsuarioNoEsEstudiante$(idUsuario: number): Observable<boolean> {
  return this.ensureRolEstudianteId$().pipe(
    concatMap((rolEstudianteId) =>
      this.usuariosSvc.getRolesByUsuario(idUsuario).pipe(
        map((roles: any[]) => {
          const tieneRolEstudiante = (roles ?? []).some(r => Number(r.id) === rolEstudianteId);
          return !tieneRolEstudiante; // true si NO es estudiante
        })
      )
    ),
    catchError(err => {
      console.error('Error validando rol estudiante', err);
      return of(true); // Permitir si no se puede validar (mejor que bloquear)
    })
  );
}



}
