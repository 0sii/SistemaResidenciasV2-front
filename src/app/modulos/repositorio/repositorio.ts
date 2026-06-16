import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidatorFn,
  ReactiveFormsModule
} from '@angular/forms';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { TabsModule } from 'primeng/tabs';
import { SelectModule } from 'primeng/select';
import { Router } from '@angular/router';

import { ProyectosService } from '../../service/proyectos.service';
import { EstudiantesService } from '../../service/estudiantes.service';
import { EmpresasService } from '../../service/empresa.service';
import { UsuariosService } from '../../service/usuarios.service';
import { TokenService } from '../../service/token.service';

import { CpColonia, DipomexService } from '../../service/dipomex.service';
import { CatalogosService } from '../../service/catalogos.service';
import { EstadosService } from '../../service/estado.service';

import { ProyectoBanco } from '../../Interface/InterfaceProyecto';
import { EstudianteDetail, EstudianteCreate, Catalogo } from '../../Interface/InterfaceUsuario';
import { Empresa } from '../../Interface/InterfaceEmpresa';
import { CodigoPostalResponse } from '../../service/dipomex.service';
import { catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, map, of, Subject, switchMap, tap } from 'rxjs';
import { EmailService } from '../../service/email.service';
import { PeriodosAcademicosService } from '../../service/periodoAcademico.service';
import { PeriodoAcademicoDto } from '../../service/periodoAcademico.service';

@Component({
  selector: 'app-repositorio',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    ToastModule,
    InputTextModule,
    TabsModule,
    SelectModule
  ],
  templateUrl: './repositorio.html',
  styleUrls: ['./repositorio.css'],
  providers: [MessageService]
})
export class RepositorioComponent implements OnInit {
  // ===== Inyecciones =====
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  private proyectosSvc = inject(ProyectosService);
  private estudiantesSvc = inject(EstudiantesService);
  private empresasSvc = inject(EmpresasService);
  private usuariosSvc = inject(UsuariosService);
  private tokenSvc = inject(TokenService);
  private dipomexSvc = inject(DipomexService);
  private catalogosSvc = inject(CatalogosService);
  private estadosSvc = inject(EstadosService);
  private toast = inject(MessageService);
  private emailSvc = inject(EmailService);
  private periodosSvc = inject(PeriodosAcademicosService);


  private router = inject(Router);

  // ⭐ Estado por defecto para propuestas de alumno
  private readonly ESTADO_ESPERA_REVISOR_ID = 3; // ok
  private readonly ESTADO_CANCELADO_ID = 9;      // 👈 estaba mal (tenías 8)
  private readonly ESTADO_FINALIZADO_ID = 8;     // 👈 (si lo usas después)

  // Estados según tu catálogo (tabla estado)
  private readonly ESTADO_EN_CURSO_ID = 7;


  // ✅ Solo UI: permite seleccionar/proponer si el proyecto actual está cancelado
  proyectoActualCancelado = false;


  // ===== Estado general =====
  loading = true;
  searchValue = '';
  esAlumno = true;

  // ===== Alumno =====
  estudiante: EstudianteDetail | null = null;
  idProyectoActual: number | null = null;
  tituloProyectoActual: string | null = null;

  // 👇 para poder cruzar invitaciones con info del proyecto
  bancoCompleto: ProyectoBanco[] = [];

  proyectosTec: ProyectoBanco[] = [];
  filteredTec: ProyectoBanco[] = [];
  // ===== Invitaciones (para el estudiante invitado) =====
  invitacionesPendientes: any[] = [];
  loadingInvitaciones = false;

  // ===== Dialog detalle proyecto =====
  showDialog = false;
  proyectoSeleccionado: ProyectoBanco | null = null;

  // ===== Estudiantes del proyecto (detalle) =====
  estudiantesProyecto: any[] = [];
  loadingEstudiantesProyecto = false;


  // ===== Dialog propuesta =====
  showPropuestaDialog = false;
  modoEmpresa: 'existente' | 'nueva' = 'existente';
  empresas: Empresa[] = [];
  empresaSeleccionadaId: number | null = null;

  // ===== Equipo (para propuesta) =====
  integrantes: any[] = [];              // estudiantes ya validados
  noControlIntegrante = '';
  agregandoIntegrante = false;


  // ===== Catálogos (como ProyectosComponent) =====
  especializaciones: Catalogo[] = [];
  modalidades: Catalogo[] = [];
  estados: Catalogo[] = [];

  // ===== Empresa nueva: CP/Dipomex =====
  coloniasCp: CpColonia[] = [];
  loadingColonias = false;
  estadoTexto = '';
  municipioTexto = '';

  // ===== Confirm dialog (reutilizable) =====
  confirmVisible = false;
  confirmTitle = 'Confirmar';
  confirmMessage = '';
  confirmRunning = false;
  private confirmFn: (() => void) | null = null;

  periodoActivoId: number | null = null;
  periodoActivoNombre: string | null = null;



  private readonly rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

  // ===== Forms (inicializados desde el inicio) =====
  // ===== Forms (MINI) =====
  formEmpresa: FormGroup = this.fb.group({
    nombre: ['', Validators.required],
    giro: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    telefono: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
  });

  formPropuesta: FormGroup = this.fb.group({
    titulo: ['', Validators.required],
    descripcion: ['', Validators.required],

    // ✅ NUEVO: cupo definido por el alumno al crear la propuesta
    // min real se ajusta dinámicamente a totalEquipo con syncCupoMin()
    noResidentes: [1, [Validators.required, Validators.min(1), Validators.max(20)]],
  });


  equipoPropuesta: any[] = [];     // solo los extra (sin el dueño)
  noControlEquipo = '';
  agregandoEquipo = false;

  get totalEquipo(): number {
    return 1 + this.equipoPropuesta.length; // 1 = el alumno que crea
  }

  private syncCupoMin(): void {
    const ctrl = this.formPropuesta.get('noResidentes');
    if (!ctrl) return;

    const min = Math.max(1, this.totalEquipo);

    ctrl.setValidators([Validators.required, Validators.min(min), Validators.max(20)]);
    ctrl.updateValueAndValidity({ emitEvent: false });

    const actual = Number(ctrl.value ?? 0);
    if (!Number.isFinite(actual) || actual < min) {
      ctrl.setValue(min, { emitEvent: false });
    }
  }


  // ===== lookup equipo propuesta =====
  eqLookupLoading = false;
  eqLookupError: string | null = null;
  eqLookupEst: any | null = null;

  private eqNoControl$ = new Subject<string>();



  // ===== Lifecycle =====
  ngOnInit(): void {
    this.resetUbicacionEmpresa();

    this.loadCatalogos();
    this.cargarPeriodoActivo();


    const idUsuario = this.getIdUsuarioActual();
    if (!idUsuario) {
      this.loading = false;
      this.esAlumno = false;
      this.showError('No se pudo identificar al usuario actual.');
      return;
    }

    this.estudiantesSvc.getByIdUsuario(idUsuario).subscribe({
      next: (res) => {
        if (!res) {
          this.loading = false;
          this.esAlumno = false;

          this.showError('No se encontró un estudiante ligado a este usuario.');
          return;
        }

        this.estudiante = res as EstudianteDetail;
        this.idProyectoActual = (res as any).idProyecto ?? null;

        // ✅ Si no viene en banco (por filtros), igual lo validamos por id
        if (this.idProyectoActual) {
          this.proyectosSvc.getByIds([this.idProyectoActual]).pipe(
            catchError(() => of([]))
          ).subscribe((rows: any[]) => {
            const p = Array.isArray(rows) && rows.length ? rows[0] : null;
            const estado = Number(p?.idEstado ?? 0);
            if (estado === this.ESTADO_CANCELADO_ID) {
              this.proyectoActualCancelado = true;
              // opcional: aviso
              // this.showSuccess('Tu proyecto actual está cancelado. Puedes seleccionar o proponer otro.');
              this.cdr.detectChanges();
            }

          });
        }


        // ✅ NUEVO: cargar invitaciones del alumno (si existen)
        this.cargarMisInvitaciones();

        this.cargarProyectos();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.esAlumno = false;
        this.showError('Error al cargar la información del estudiante.');
      }
    });
    this.eqNoControl$
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        tap(() => {
          this.eqLookupLoading = true;
          this.eqLookupError = null;
          this.eqLookupEst = null;
          this.cdr.detectChanges();
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
        this.eqLookupLoading = false;

        if (!est || est === false || !est?.id) {
          this.eqLookupEst = null;
          this.eqLookupError = 'No encontrado';
          this.cdr.detectChanges();
          return;
        }

        this.eqLookupLoading = true;

        this.esInvitableEstudiante$(est).subscribe((invitable: boolean) => {
          this.eqLookupLoading = false;

          if (!invitable) {
            this.eqLookupEst = est;
            this.eqLookupError = 'Ya tiene proyecto asignado (no cancelado)';
            this.cdr.detectChanges();
            return;
          }

          this.eqLookupEst = est;
          this.eqLookupError = null;
          this.cdr.detectChanges();
        });


      });
  }


  private cargarPeriodoActivo(): void {
    this.periodosSvc.getActivos().subscribe({
      next: (rows: PeriodoAcademicoDto[]) => {
        const activos = (rows ?? []).filter(x => x?.activo);
        if (activos.length === 0) {
          this.periodoActivoId = null;
          this.periodoActivoNombre = null;
          this.showError('No hay un periodo académico activo. No se pueden crear propuestas.');
          this.cdr.detectChanges();
          return;
        }

        // Si hay más de 1 activo, esto es inconsistencia en BD (debería ser 1).
        // Elegimos el primero para no romper UI, pero te aviso.
        if (activos.length > 1) {
          console.warn('Hay múltiples periodos activos. Esto debe corregirse en BD.', activos);
          this.showError('Hay más de un periodo activo. Se usará el primero, pero deben corregirlo en BD.');
        }

        const p = activos[0];
        this.periodoActivoId = p.id;
        this.periodoActivoNombre = p.nombre;
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error(e);
        this.periodoActivoId = null;
        this.periodoActivoNombre = null;
        this.showError('No se pudo consultar el periodo activo.');
        this.cdr.detectChanges();
      }
    });
  }


  onNoControlEquipoInput(): void {
    const nc = String(this.noControlEquipo || '').trim().toUpperCase();
    this.eqNoControl$.next(nc);
  }

  // ===== Catálogos =====
  private loadCatalogos(): void {
    this.catalogosSvc.getActivasEspecializacion().subscribe({
      next: rows => {
        this.especializaciones = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: e => console.error('Load especializaciones error', e)
    });

    this.catalogosSvc.getActivasModalidad().subscribe({
      next: rows => {
        this.modalidades = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: e => console.error('Load modalidades error', e)
    });

    this.estadosSvc.getActivos().subscribe({
      next: rows => {
        this.estados = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: e => console.error('Load estados error', e)
    });
  }

  // ===== Usuario actual =====
  private getIdUsuarioActual(): number | null {
    try {
      const user = this.tokenSvc.getUser();
      if (!user) return null;
      return user.id ?? null;
    } catch {
      return null;
    }
  }

  // ===== Tabla banco =====
  private empresaById = new Map<number, string>();

  private cargarProyectos(): void {
    this.loading = true;

    forkJoin({
      banco: this.proyectosSvc.getBanco().pipe(catchError(() => of([] as any[]))),
      empresas: this.empresasSvc.getAll().pipe(catchError(() => of([] as any[]))),
    }).subscribe({
      next: ({ banco, empresas }) => {
        // mapa empresas
        this.empresaById.clear();
        (empresas ?? []).forEach((e: any) => this.empresaById.set(Number(e.id), String(e.nombre ?? '').trim()));

        // banco completo
        this.bancoCompleto = (banco as ProyectoBanco[] ?? []).map((p: any) => {
          const idEmp = Number(p?.idEmpresa ?? p?.IdEmpresa ?? 0);
          const empresaNombre =
            p?.empresa?.nombre ??
            p?.nombreEmpresa ??
            p?.empresaNombre ??
            (idEmp ? (this.empresaById.get(idEmp) ?? null) : null);

          return {
            ...p,
            empresaNombre // 👈 nuevo campo cómodo para UI
          };
        });

        this.validarProyectoActualCancelado(this.bancoCompleto);

        // solo tec
        this.proyectosTec = [...this.bancoCompleto];


        this.actualizarTituloProyectoActual(this.bancoCompleto);

        // ✅ ahora sí, invitaciones se enriquecen con empresaNombre seguro
        this.enriquecerInvitacionesPendientes();

        this.aplicarFiltro();
        this.loading = false;

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.showError('No se pudo cargar la lista del banco de proyectos.');
      }
    });
  }

  private invProyectoId(inv: any): number {
    return Number(inv?.idProyecto ?? inv?.IdProyecto ?? inv?.proyectoId ?? 0) || 0;
  }


  private enriquecerInvitacionesPendientes(): void {
    if (!this.invitacionesPendientes?.length) return;

    // map de proyectos conocidos por id (desde banco)
    const byId = new Map<number, any>();
    (this.bancoCompleto ?? []).forEach(p => {
      const id = Number((p as any)?.id ?? (p as any)?.idProyecto ?? 0) || 0;
      if (id > 0) byId.set(id, p);
    });

    // 1) primer enriquecido (lo que sí está en banco)
    this.invitacionesPendientes = this.invitacionesPendientes.map(inv => {
      const idProy = this.invProyectoId(inv);
      const p = byId.get(idProy);

      return {
        ...inv,
        _proyecto: p ?? null,
        _titulo: p?.titulo ?? inv?.tituloProyecto ?? null,
        _descripcion: p?.descripcion ?? null,
        _empresa: p?.empresaNombre ?? null
      };
    });

    // 2) fallback: ids que NO estaban en banco
    const faltantes = this.invitacionesPendientes
      .filter(inv => !inv?._proyecto)
      .map(inv => this.invProyectoId(inv))
      .filter(id => id > 0);

    const unique = Array.from(new Set(faltantes));
    if (!unique.length) {
      this.cdr.detectChanges();
      return;
    }

    this.proyectosSvc.getByIds(unique).subscribe((proys) => {
      // meterlos al mapa con empresaNombre (igual que haces en cargarProyectos)
      (proys ?? []).forEach((p: any) => {
        const id = Number(p?.id ?? 0) || 0;
        if (!id) return;

        const idEmp = Number(p?.idEmpresa ?? 0) || 0;
        const empresaNombre =
          p?.empresa?.nombre ??
          p?.nombreEmpresa ??
          p?.empresaNombre ??
          (idEmp ? (this.empresaById.get(idEmp) ?? null) : null);

        byId.set(id, { ...p, empresaNombre });
      });

      // re-enriquecer solo las que faltaban
      this.invitacionesPendientes = this.invitacionesPendientes.map(inv => {
        if (inv?._proyecto) return inv;

        const idProy = this.invProyectoId(inv);
        const p = byId.get(idProy);

        return {
          ...inv,
          _proyecto: p ?? null,
          _titulo: p?.titulo ?? inv?.tituloProyecto ?? null,
          _descripcion: p?.descripcion ?? null,
          _empresa: p?.empresaNombre ?? null
        };
      });

      this.cdr.detectChanges();
    });
  }


  /** ✅ Si idProyectoActual apunta a un proyecto cancelado, se libera (aunque no venga en getBanco). */
  /** ✅ Detecta si el proyecto actual está cancelado (sin tocar BD). */
  private validarProyectoActualCancelado(data: ProyectoBanco[]): void {
    this.proyectoActualCancelado = false;

    if (!this.estudiante || !this.idProyectoActual) return;

    const id = Number(this.idProyectoActual);

    // 1) intenta encontrarlo en el banco (si viene)
    const actual = (data ?? []).find(p => Number(p.id) === id);

    if (actual) {
      const estado = Number((actual as any).idEstado ?? 0);
      this.proyectoActualCancelado = (estado === this.ESTADO_CANCELADO_ID);
      this.cdr.detectChanges();
      return;
    }

    // 2) si no vino, tráelo por id y revisa estado
    this.proyectosSvc.getByIds([id]).pipe(
      catchError(() => of([]))
    ).subscribe((rows: any[]) => {
      const p = Array.isArray(rows) && rows.length ? rows[0] : null;
      const estado = Number(p?.idEstado ?? 0);
      this.proyectoActualCancelado = (estado === this.ESTADO_CANCELADO_ID);
      this.cdr.detectChanges();
    });
  }






  filtrar(): void {
    this.aplicarFiltro();
  }

  private aplicarFiltro(): void {
    const term = this.searchValue.trim().toLowerCase();

    const filtraTexto = (p: ProyectoBanco) => {
      if (!term) return true;
      const titulo = (p.titulo || '').toLowerCase();
      const desc = (p.descripcion || '').toLowerCase();
      const obj = (p.objetivo || '').toLowerCase();
      return titulo.includes(term) || desc.includes(term) || obj.includes(term);
    };

    // ✅ SOLO DISPONIBLES + filtro texto
    this.filteredTec = (this.proyectosTec ?? [])
      .filter(p => this.esDisponibleBanco(p))
      .filter(filtraTexto);
  }


  // ===== UI helpers =====
  fullNameEst(): string {
    if (!this.estudiante) return '';
    return `${this.estudiante.nombre} ${this.estudiante.apellidoPaterno} ${this.estudiante.apellidoMaterno}`.trim();
  }

  verDetalle(p: ProyectoBanco): void {
    this.proyectoSeleccionado = p;
    this.showDialog = true;

    // reset lista anterior
    this.estudiantesProyecto = [];

    // cargar integrantes del proyecto
    if (p?.id) {
      this.cargarEstudiantesProyecto(p.id);
    }
  }

  private cargarEstudiantesProyecto(idProyecto: number): void {
    this.loadingEstudiantesProyecto = true;
    this.cdr.markForCheck();

    this.estudiantesSvc.getByProyecto(idProyecto).pipe(
      finalize(() => {
        this.loadingEstudiantesProyecto = false;
        this.cdr.markForCheck();
      }),
      catchError((err) => {
        console.error(err);
        this.estudiantesProyecto = [];
        return of([]);
      })
    ).subscribe((rows: any[]) => {
      // Solo lo básico: nombre + apellidos + noControl
      this.estudiantesProyecto = (rows ?? []).map(x => ({
        nombre: x?.nombre ?? x?.Nombre ?? '',
        apellidoPaterno: x?.apellidoPaterno ?? x?.ApellidoPaterno ?? '',
        apellidoMaterno: x?.apellidoMaterno ?? x?.ApellidoMaterno ?? '',
        noControl: x?.noControl ?? x?.NoControl ?? ''
      }));

      this.cdr.markForCheck();
    });
  }



  esProyectoActual(p: ProyectoBanco): boolean {
    return !!this.idProyectoActual && this.idProyectoActual === p.id;
  }

  puedeSeleccionar(p: ProyectoBanco): boolean {
    const canSelect = this.usuariosSvc.hasPermission('Repositorio-Select');
    if (!canSelect) return false;

    // ✅ si ya tiene proyecto, ya no puede seleccionar otro
    if (this.tieneProyectoAsignado) return false;

    // ✅ seguridad: solo disponibles (banco + cupo + estado)
    if (!this.esDisponibleBanco(p)) return false;

    return true;
  }


  mostrarBotonPropuesta(): boolean {
    const libre = !this.idProyectoActual || this.proyectoActualCancelado;

    return libre
      && this.usuariosSvc.hasPermission('Repositorio-Create')
      && !!this.periodoActivoId;
  }


  confirmarSeleccion(): void {
    if (this.tieneProyectoAsignado) {
      this.showError('Ya tienes un proyecto asignado.');
      this.showDialog = false;
      return;
    }
    if (this.idProyectoActual && !this.proyectoActualCancelado) {
      this.showError('Ya tienes un proyecto asignado.');
      return;
    }

    if (!this.proyectoSeleccionado) {
      this.showError('Selecciona un proyecto primero.');
      return;
    }

    if (!this.puedeSeleccionar(this.proyectoSeleccionado)) {
      this.showError('No puedes seleccionar este proyecto (sin permiso, ya seleccionado o está lleno).');
      return;
    }

    const idProy = this.proyectoSeleccionado.id;


    if (!this.estudiante) {
      this.showError('No se pudo identificar al estudiante.');
      return;
    }

    this.loading = true;

    // ✅ usa backend: valida cupo y asigna al usuario del token
    this.proyectosSvc.unirse(idProy).subscribe({
      next: () => {
        this.idProyectoActual = idProy;
        this.tituloProyectoActual = String(this.proyectoSeleccionado?.titulo || '').trim();
        (this.estudiante as any).idProyecto = idProy;

        this.loading = false;
        this.showDialog = false;

        this.estudiantesSvc.refreshSeguimientoByUsuario$(this.estudiante!.idUsuario).subscribe();
        this.showSuccess('Te uniste al proyecto correctamente.');

        this.cargarProyectos();

        this.router.navigate(['/seguimiento'], {
          queryParams: { idProyecto: idProy },
          replaceUrl: true
        });
      },

      error: (err) => {
        console.error(err);
        this.loading = false;

        // ✅ Mensaje UI único y coherente (sin texto del backend)
        this.showError('No se pudo unir al proyecto. Intenta nuevamente.');
      }

    });
  }



  // ===== Dialog propuesta =====
  openPropuestaDialog(): void {
    if (!this.usuariosSvc.hasPermission('Repositorio-Create')) {
      this.showError('No tienes permiso para proponer proyectos.');
      return;
    }
    if (this.idProyectoActual && !this.proyectoActualCancelado) {
      this.showError('Ya tienes un proyecto asignado.');
      return;
    }


    this.equipoPropuesta = [];
    this.noControlEquipo = '';


    this.modoEmpresa = 'existente';
    this.empresaSeleccionadaId = null;

    this.formEmpresa.reset({
      nombre: '',
      giro: '',
      email: '',
      telefono: '',
    }, { emitEvent: false });

    this.formPropuesta.reset({
      titulo: '',
      descripcion: '',
      noResidentes: 1,
    });

    this.syncCupoMin(); // ✅ importante


    this.resetUbicacionEmpresa();
    this.cargarEmpresas();

    this.showPropuestaDialog = true;
  }

  private cargarEmpresas(): void {
    this.empresasSvc.getAll().subscribe({
      next: (rows) => {
        this.empresas = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: (err) => {
        console.error(err);
        this.empresas = [];
      }
    });
  }

  onPropuestaDialogHide(): void {
    this.formEmpresa.markAsPristine();
    this.formEmpresa.markAsUntouched();
    this.formPropuesta.markAsPristine();
    this.formPropuesta.markAsUntouched();
  }

  // ===== Empresa form helpers (igual a Empresas) =====
  digitsOnlyEmpresa(controlName: string, maxLen: number): void {
    const ctrl = this.formEmpresa.get(controlName);
    if (!ctrl) return;
    const only = String(ctrl.value ?? '').replace(/\D/g, '').slice(0, maxLen);
    if (only !== ctrl.value) ctrl.setValue(only, { emitEvent: false });
  }

  onEmpresaRfcInput(): void {
    const ctrl = this.formEmpresa.get('rfc');
    if (!ctrl) return;
    let v = String(ctrl.value ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9Ñ&]/g, '');
    if (v.length > 13) v = v.slice(0, 13);
    if (v !== ctrl.value) ctrl.setValue(v, { emitEvent: false });
  }

  onEmpresaEmailBlur(): void {
    const ctrl = this.formEmpresa.get('email');
    if (!ctrl) return;
    const v = String(ctrl.value ?? '').trim().toLowerCase();
    if (v !== ctrl.value) ctrl.setValue(v, { emitEvent: false });
  }

  resetUbicacionEmpresa(): void {
    this.coloniasCp = [];
    this.estadoTexto = '';
    this.municipioTexto = '';
    this.loadingColonias = false;

    const coloniaCtrl = this.formEmpresa.get('colonia');
    coloniaCtrl?.clearValidators();
    coloniaCtrl?.setValue(null, { emitEvent: false });
    coloniaCtrl?.disable({ emitEvent: false });
    coloniaCtrl?.updateValueAndValidity({ emitEvent: false });

    this.formEmpresa.patchValue(
      { estado: null, municipio: null, colonia: null },
      { emitEvent: false }
    );
  }

  onEmpresaCpBlur(): void {
    const cpCtrl = this.formEmpresa.get('cp');
    if (!cpCtrl) return;

    cpCtrl.markAsTouched();

    if (cpCtrl.invalid) {
      this.showError('El código postal debe tener exactamente 5 dígitos.');
      this.resetUbicacionEmpresa();
      return;
    }

    const cp = String(cpCtrl.value).trim();
    this.loadingColonias = true;
    this.coloniasCp = [];
    this.formEmpresa.get('colonia')?.disable({ emitEvent: false });

    this.dipomexSvc.getCodigoPostal(cp).subscribe({
      next: (res: CodigoPostalResponse) => {
        this.loadingColonias = false;

        if ((res as any).error || !(res as any).codigo_postal) {
          // ✅ Mensaje UI único y coherente (sin texto del backend)
          this.showError('Código postal no encontrado.');

          this.resetUbicacionEmpresa();
          return;
        }

        const cpData: any = (res as any).codigo_postal;

        const rawEstadoId = cpData.estado_id ?? cpData.ESTADO_ID ?? null;
        const rawMunicipioId = cpData.municipio_id ?? cpData.MUNICIPIO_ID ?? null;

        const estadoId = rawEstadoId != null ? String(rawEstadoId).padStart(2, '0') : null;
        const municipioId = rawMunicipioId != null ? String(rawMunicipioId).padStart(3, '0') : null;

        this.estadoTexto = cpData.estado ?? cpData.ESTADO ?? '';
        this.municipioTexto = cpData.municipio ?? cpData.MUNICIPIO ?? '';

        this.coloniasCp = this.mapColoniasFromCpData(cpData);

        const coloniaCtrl = this.formEmpresa.get('colonia');
        if (this.coloniasCp.length) {
          coloniaCtrl?.setValidators([Validators.required]);
          coloniaCtrl?.enable({ emitEvent: false });
        } else {
          coloniaCtrl?.clearValidators();
          coloniaCtrl?.disable({ emitEvent: false });
        }
        coloniaCtrl?.updateValueAndValidity({ emitEvent: false });

        this.formEmpresa.patchValue(
          { estado: estadoId, municipio: municipioId, colonia: null },
          { emitEvent: false }
        );

        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.loadingColonias = false;
        console.error(err);
        this.showError('No se pudo obtener información del código postal.');
        this.resetUbicacionEmpresa();
      }
    });
  }

  private mapColoniasFromCpData(cpData: any): CpColonia[] {
    const coloniasRaw = cpData.colonias ?? cpData.COLONIAS ?? [];
    return (coloniasRaw as any[]).map((c, idx) => {
      if (typeof c === 'string') {
        return { colonia_id: String(idx), colonia: c } as any;
      }
      const id = c.colonia_id ?? c.COLONIA_ID ?? c.id ?? c.Id ?? idx;
      const nombre = c.colonia ?? c.COLONIA ?? c.nombre ?? c.Nombre ?? `Colonia ${idx + 1}`;
      return { colonia_id: String(id), colonia: nombre } as any;
    });
  }

  // ===== Submit propuesta =====
  submitPropuesta(): void {
    if (!this.usuariosSvc.hasPermission('Repositorio-Create')) {
      this.showError('No tienes permiso para proponer proyectos.');
      return;
    }
    if (!this.estudiante) {
      this.showError('No se pudo identificar al estudiante.');
      return;
    }
    if (this.formPropuesta.invalid) {
      this.formPropuesta.markAllAsTouched();
      this.showError('Revisa los datos del proyecto.');
      return;
    }

    const vProy = this.formPropuesta.getRawValue();
    const nowIso = new Date().toISOString(); // ✅ fecha actual

    const cupo = Number(vProy.noResidentes || 1);
    if (!Number.isFinite(cupo) || cupo < this.totalEquipo) {
      this.showError(`El cupo debe ser mayor o igual a ${this.totalEquipo} (integrantes actuales).`);
      this.syncCupoMin();
      return;
    }

    const payloadBase: any = {
      titulo: String(vProy.titulo || '').trim(),
      descripcion: String(vProy.descripcion || '').trim(),

      // ✅ cupo definido por alumno
      noResidentes: cupo,

      idEstado: this.ESTADO_ESPERA_REVISOR_ID,
      idPeriodoAcademico: this.periodoActivoId,
      fechaCreacion: nowIso,
    };


    if (!this.periodoActivoId) {
      this.showError('No hay periodo activo. No se puede registrar la propuesta.');
      return;
    }


    // 👇 IMPORTANTE: un solo payload final
    let payload: any = { ...payloadBase };

    if (this.modoEmpresa === 'existente') {
      if (!this.empresaSeleccionadaId) {
        this.showError('Selecciona una empresa existente.');
        return;
      }
      payload.idEmpresa = this.empresaSeleccionadaId;
    } else {
      if (this.formEmpresa.invalid) {
        this.formEmpresa.markAllAsTouched();
        this.showError('Revisa los datos de la empresa.');
        return;
      }

      const vEmp = this.formEmpresa.getRawValue();
      payload.empresaNueva = {
        nombre: String(vEmp.nombre || '').trim(),
        giro: String(vEmp.giro || '').trim(),
        telefono: String(vEmp.telefono || '').trim(),
        email: String(vEmp.email || '').trim(),
      };
    }

    this.loading = true;

    this.proyectosSvc.crearPropuesta(payload).subscribe({
      next: (res: any) => {
        const idProyectoCreado = Number(res?.idProyecto ?? res?.IdProyecto ?? 0);
        if (!idProyectoCreado) {
          this.loading = false;
          this.showError('La propuesta se creó pero no regresó el idProyecto.');
          return;
        }

        // ✅ UI: el creador ya queda asignado por backend
        this.idProyectoActual = idProyectoCreado;
        this.tituloProyectoActual = payloadBase.titulo;
        (this.estudiante as any).idProyecto = idProyectoCreado;

        // ✅ Invitaciones: extras del modal
        const extras = (this.equipoPropuesta ?? []).filter(x => x?.id);
        const invitadosIds = extras.map(x => Number(x.id)).filter(x => x > 0);

        this.asegurarEstadoEsperaRevisor(idProyectoCreado);
        const crearInvitaciones$ = invitadosIds.length
          ? this.proyectosSvc.crearInvitaciones(
            idProyectoCreado,
            invitadosIds.map(id => ({ idEstudianteInvitado: id }))
          )
          : of({ creadas: 0 });

        crearInvitaciones$
          .pipe(finalize(() => {
            this.loading = false;
            this.showPropuestaDialog = false;

            this.estudiantesSvc.refreshSeguimientoByUsuario$(this.estudiante!.idUsuario).subscribe();
            this.cargarProyectos();

            // ⛔ ya NO navegamos aquí (para que el toast se vea)
          }))
          .subscribe({
            next: (resp: any) => {
              const creadas = Number(resp?.creadas ?? 0);

              // ✅ correos a invitados
              this.enviarCorreosInvitacion(extras, idProyectoCreado, payloadBase.titulo);

              if (invitadosIds.length) {
                this.showSuccess(`Propuesta registrada. Invitaciones creadas: ${creadas}.`);
              } else {
                this.showSuccess('Propuesta registrada.');
              }

              // ✅ deja respirar al toast antes de navegar
              setTimeout(() => {
                this.router.navigate(['/seguimiento'], {
                  queryParams: { idProyecto: idProyectoCreado },
                  replaceUrl: true
                });
              }, 800);
            },
            error: (err: any) => {
              console.error(err);

              // La propuesta ya existe, fallaron invitaciones
              this.showError('Propuesta registrada, pero no se pudieron crear las invitaciones.');

              // ✅ aún así navega, pero deja ver el toast
              setTimeout(() => {
                this.router.navigate(['/seguimiento'], {
                  queryParams: { idProyecto: idProyectoCreado },
                  replaceUrl: true
                });
              }, 800);
            }
          });

      },
      error: (err: any) => {
        console.error(err);
        this.loading = false;

        // ✅ Mensaje UI único y coherente (sin texto del backend)
        this.showError('No se pudo registrar la propuesta. Intenta nuevamente.');
      }

    });
  }





  // ===== Estudiante payload =====
  private buildEstudiantePayload(nuevoIdProyecto: number): EstudianteCreate {
    if (!this.estudiante) throw new Error('No hay estudiante cargado.');

    const e = this.estudiante;
    const payload: EstudianteCreate = {
      idUsuario: e.idUsuario,
      idProyecto: nuevoIdProyecto,
      nombre: e.nombre,
      apellidoPaterno: e.apellidoPaterno,
      apellidoMaterno: e.apellidoMaterno,
      idcarrera: e.idcarrera ?? null,
      domicilio: e.domicilio ?? null,
      ciudad: e.ciudad ?? null,
      cp: e.cp ?? null,
      idestado: e.idestado ?? null,
      noControl: e.noControl ?? null,
      correoPersonal: e.correoPersonal ?? null,
      noSeguroSocial: e.noSeguroSocial ?? null,
      idDependenciaMedica: e.idDependenciaMedica ?? null,
      telefonoCelular: e.telefonoCelular ?? null,
      idContactoEmergencia: e.idContactoEmergencia ?? null
    };
    return payload;
  }

  /** ✅ payload para liberar proyecto (null o 0) sin pelearte con el tipado */
  private buildEstudiantePayloadNullable(idProyecto: number | null): any {
    if (!this.estudiante) throw new Error('No hay estudiante cargado.');
    const e = this.estudiante;

    return {
      idUsuario: e.idUsuario,
      idProyecto: idProyecto,

      nombre: e.nombre,
      apellidoPaterno: e.apellidoPaterno,
      apellidoMaterno: e.apellidoMaterno,

      idcarrera: e.idcarrera ?? null,
      domicilio: e.domicilio ?? null,
      ciudad: e.ciudad ?? null,
      cp: e.cp ?? null,
      idestado: e.idestado ?? null,
      noControl: e.noControl ?? null,
      correoPersonal: e.correoPersonal ?? null,
      noSeguroSocial: e.noSeguroSocial ?? null,
      idDependenciaMedica: e.idDependenciaMedica ?? null,
      telefonoCelular: e.telefonoCelular ?? null,
      idContactoEmergencia: e.idContactoEmergencia ?? null
    };
  }

  // ===== Helpers =====
  private nz(v: any): string | null {
    const s = String(v ?? '').trim();
    return s.length ? s : null;
  }

  private toNullableNumber(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  private toTimeSpan(v: string | null): string | null {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
    return null;
  }

  get tieneProyectoAsignado(): boolean {
    const tiene = (this.idProyectoActual ?? 0) > 0;
    // ✅ Si el proyecto está cancelado, NO debe bloquear este módulo
    return tiene && !this.proyectoActualCancelado;
  }



  // ===== Toast =====
  showSuccess(msg: string): void {
    this.toast.add({ severity: 'success', summary: 'OK', detail: msg, life: 10000 });
  }

  showError(msg: string): void {
    this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 10000 });
  }

  get fEmp() { return this.formEmpresa.controls; }
  get fProy() { return this.formPropuesta.controls; }

  private actualizarTituloProyectoActual(data?: ProyectoBanco[]): void {
    if (!this.idProyectoActual) {
      this.tituloProyectoActual = null;
      return;
    }

    const fuente = data ?? [...this.proyectosTec];
    const p = fuente.find(x => x.id === this.idProyectoActual);

    this.tituloProyectoActual = p?.titulo ?? null;
  }

  agregarIntegrantePropuesta(): void {
    const nc = String(this.noControlIntegrante || '').trim().toUpperCase();
    if (!nc) return;

    const nc2 = String(this.noControlEquipo || '').trim().toUpperCase();
    if (!this.eqLookupEst || String(this.eqLookupEst?.noControl ?? '').trim().toUpperCase() !== nc2) {
      this.showError('Confirma el No. de control: no encontré al alumno.');
      return;
    }


    if (!this.estudiante) {
      this.showError('No se pudo identificar al estudiante.');
      return;
    }

    // no te agregues a ti mismo (ya quedas asignado por el token)
    const miNC = String((this.estudiante as any)?.noControl ?? '').trim().toUpperCase();
    if (miNC && nc === miNC) {
      this.showError('Ya estás en el proyecto.');
      return;
    }

    // duplicados
    const ya = this.integrantes.some(x => String(x?.noControl ?? '').trim().toUpperCase() === nc);
    if (ya) {
      this.showError('Ese No. de control ya está agregado.');
      return;
    }

    this.agregandoIntegrante = true;

    this.estudiantesSvc.getByNoControl(nc).subscribe({
      next: (est: any) => {
        this.agregandoIntegrante = false;

        if (!est || !est.id) {
          this.showError('Ese No. de control no existe en la plataforma.');
          return;
        }

        this.esInvitableEstudiante$(est).subscribe((invitable: boolean) => {
          if (!invitable) {
            this.showError('Ese alumno ya tiene un proyecto asignado.');
            return;
          }

          this.equipoPropuesta.push(est);
          this.syncCupoMin();

          this.noControlEquipo = '';
          this.cdr.detectChanges();
        });


        this.integrantes.push(est);
        this.noControlIntegrante = '';
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error(e);
        this.agregandoIntegrante = false;
        this.showError('No se pudo buscar por No. de control.');
      }
    });
  }

  quitarIntegrantePropuesta(idx: number): void {
    if (idx < 0 || idx >= this.integrantes.length) return;
    this.integrantes.splice(idx, 1);
    this.cdr.detectChanges();
  }

  private cargarMisInvitaciones(): void {
    this.loadingInvitaciones = true;

    this.proyectosSvc.misInvitaciones('PENDIENTE').pipe(
      finalize(() => {
        this.loadingInvitaciones = false;
        this.cdr.detectChanges();
      }),
      catchError(err => {
        console.error(err);
        this.invitacionesPendientes = [];
        return of([]);
      })
    ).subscribe((rows: any[]) => {
      this.invitacionesPendientes = Array.isArray(rows) ? rows : [];

      // ✅ primero enriquece (si ya tienes banco cargado)
      this.enriquecerInvitacionesPendientes();

      // ✅ luego filtra canceladas (robusto aunque no esté en banco)
      this.filtrarInvitacionesCanceladas();
    });
  }


  verDetalleInvitacion(inv: any): void {
    const p: ProyectoBanco | null = inv?._proyecto ?? null;

    if (p) {
      this.verDetalle(p);
      return;
    }

    // fallback: intenta buscar por id
    const idProy = Number(inv?.idProyecto ?? 0);
    const found = (this.bancoCompleto ?? []).find(x => Number(x.id) === idProy) ?? null;

    if (!found) {
      this.showError('No se encontró el detalle de ese proyecto en el banco.');
      return;
    }

    this.verDetalle(found);
  }


  aceptarInvitacion(inv: any): void {

    const estadoInv = Number(inv?._proyecto?.idEstado ?? 0);
    if (estadoInv === this.ESTADO_CANCELADO_ID) {
      this.showError('No puedes aceptar esta invitación: el proyecto fue cancelado.');
      return;
    }

    if (this.tieneProyectoAsignado) {
      this.showError('Ya tienes un proyecto asignado.');
      return;
    }

    // ✅ Ya NO usamos window.confirm aquí.
    this.loading = true;

    this.proyectosSvc.responderInvitacion(inv.id, 'ACEPTAR').pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (res: any) => {
        const idProy = Number(res?.idProyecto ?? inv?.idProyecto ?? 0);

        this.showSuccess('Invitación aceptada.');


        this.cargarMisInvitaciones();

        if (idProy > 0) {
          this.router.navigate(['/seguimiento'], {
            queryParams: { idProyecto: idProy },
            replaceUrl: true
          });
        }

        this.notificarLider(inv, true);
      },
      error: (err: any) => {
        console.error(err);

        // ✅ Mensaje UI único y coherente (sin texto del backend)
        this.showError('No se pudo aceptar la invitación. Intenta nuevamente.');
      }

    });
  }



  rechazarInvitacion(inv: any): void {
    // ✅ Ya NO usamos window.confirm aquí.
    this.loading = true;

    this.proyectosSvc.responderInvitacion(inv.id, 'RECHAZAR').pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        this.showSuccess('Invitación rechazada.');
        this.cargarMisInvitaciones();
        this.notificarLider(inv, false);
      },
      error: (err: any) => {
        console.error(err);

        // ✅ Mensaje UI único y coherente (sin texto del backend)
        this.showError('No se pudo rechazar la invitación. Intenta nuevamente.');
      }

    });
  }

  private enviarCorreosInvitacion(extras: any[], idProyecto: number, tituloProyecto: string): void {
    extras.forEach(est => {
      const correo = (est?.correoPersonal ?? est?.correo ?? est?.Correo ?? '').toString().trim();
      if (!correo) return;

      const nombre = (est?.nombre ?? est?.Nombre ?? '').toString().trim();

      const tema = 'Invitación a proyecto de residencia';
      const cuerpo = `
      <div style="font-family: Arial, sans-serif; font-size: 14px;">
        <p>Hola ${nombre || ''},</p>

        <p>
          Te invitaron a unirte al proyecto:
          <b>"${tituloProyecto}"</b>.
        </p>

        <p>
          Entra al sistema y revisa <b>"Mis invitaciones"</b> en el Banco de Proyectos para
          <b>ACEPTAR</b> o <b>RECHAZAR</b>.
        </p>

        <p><b>Proyecto ID:</b> ${idProyecto}</p>

        <p>Saludos.</p>
      </div>
    `;

      // Importante: NO mostramos toast aquí (solo log si falla)
      this.emailSvc.sendEmail(correo, tema, cuerpo).subscribe({
        next: () => { },
        error: (e) => console.error('Email invitación falló para', correo, e)
      });
    });
  }

  private notificarLider(inv: any, acepto: boolean): void {
    const idCreador = Number(inv?.idEstudianteCreador ?? 0);
    if (!idCreador) return;

    const getByIdFn = (this.estudiantesSvc as any)?.getById;
    if (typeof getByIdFn !== 'function') return;

    getByIdFn.call(this.estudiantesSvc, idCreador).subscribe({
      next: (creador: any) => {
        const correo = (creador?.correoPersonal ?? creador?.correo ?? creador?.Correo ?? '').toString().trim();
        if (!correo) return;

        const tema = 'Respuesta a invitación de proyecto';

        const titulo = (inv?.tituloProyecto ?? '').toString().trim() || `Proyecto #${inv?.idProyecto ?? ''}`;
        const alumno = (inv?.nombreAlumno ?? inv?.NombreAlumno ?? '').toString().trim(); // si existe en tu payload
        const estadoTxt = acepto ? 'ACEPTÓ' : 'RECHAZÓ';

        const cuerpo = `
        <div style="font-family: Arial, sans-serif; font-size: 14px;">
          <p>Hola,</p>

          <p>
            ${alumno ? `El alumno <b>${alumno}</b> ` : 'Un alumno '}
            <b>${estadoTxt}</b> tu invitación para el proyecto:
            <b>"${titulo}"</b>.
          </p>

          <p>Saludos.</p>
        </div>
      `;

        this.emailSvc.sendEmail(correo, tema, cuerpo).subscribe({
          next: () => { },
          error: (e) => console.error('Email a líder falló', e)
        });
      },
      error: (e: any) => console.error('No se pudo cargar líder para email', e)
    });
  }




  agregarIntegranteAPropuesta(): void {
    const nc = String(this.noControlEquipo || '').trim();
    if (!nc) return;

    // evitar duplicados
    const ya = this.equipoPropuesta.some(x => String(x?.noControl ?? '').toUpperCase() === nc.toUpperCase());
    if (ya) {
      this.showError('Ese No. de control ya está en el equipo.');
      return;
    }

    // evitar meterse a sí mismo (si aplica)
    const miNc = String((this.estudiante as any)?.noControl ?? '').trim();
    if (miNc && miNc.toUpperCase() === nc.toUpperCase()) {
      this.showError('Tú ya vienes incluido automáticamente');
      return;
    }

    this.agregandoEquipo = true;

    this.estudiantesSvc.getByNoControl(nc).subscribe({
      next: (est: any) => {
        this.agregandoEquipo = false;

        if (!est || est === false || !est.id) {
          this.showError('Ese No. de control no existe en la plataforma.');
          return;
        }

        // ✅ Nueva regla: permite si NO tiene proyecto o si su proyecto está CANCELADO
        this.esInvitableEstudiante$(est).subscribe((invitable: boolean) => {
          if (!invitable) {
            this.showError('Ese alumno ya tiene un proyecto asignado (no cancelado).');
            return;
          }

          this.equipoPropuesta.push(est);
          this.syncCupoMin();

          this.noControlEquipo = '';
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.agregandoEquipo = false;
        this.showError('No se pudo buscar ese No. de control.');
      }
    });
  }


  quitarIntegranteDePropuesta(i: number): void {
    this.equipoPropuesta.splice(i, 1);
    this.syncCupoMin();

    this.cdr.detectChanges();
  }

  private payloadEstudianteConProyecto(est: any, idProyecto: number): any {
    return {
      idUsuario: est.idUsuario,
      idProyecto,
      nombre: est.nombre,
      apellidoPaterno: est.apellidoPaterno,
      apellidoMaterno: est.apellidoMaterno,
      idcarrera: est.idcarrera ?? null,
      domicilio: est.domicilio ?? null,
      ciudad: est.ciudad ?? null,
      cp: est.cp ?? null,
      idestado: est.idestado ?? null,
      noControl: est.noControl ?? null,
      correoPersonal: est.correoPersonal ?? null,
      noSeguroSocial: est.noSeguroSocial ?? null,
      idDependenciaMedica: est.idDependenciaMedica ?? null,
      telefonoCelular: est.telefonoCelular ?? null,
      idContactoEmergencia: est.idContactoEmergencia ?? null
    };
  }


  openConfirm(title: string, message: string, fn: () => void): void {
    this.confirmTitle = title;
    this.confirmMessage = message;
    this.confirmFn = fn;
    this.confirmVisible = true;
    this.confirmRunning = false;
  }

  closeConfirm(): void {
    this.confirmVisible = false;
    this.confirmFn = null;
    this.confirmRunning = false;
  }

  runConfirm(): void {
    if (!this.confirmFn) return;
    this.confirmRunning = true;
    const fn = this.confirmFn;
    // cerramos primero para evitar doble click “nervioso”
    this.closeConfirm();
    fn();
  }

  confirmAceptarInv(inv: any): void {
    const titulo = inv?._titulo ?? inv?.tituloProyecto ?? ('Proyecto #' + inv?.idProyecto);
    this.openConfirm(
      'Aceptar invitación',
      `¿Aceptar invitación al proyecto:\n"${titulo}"?`,
      () => this.aceptarInvitacion(inv)
    );
  }

  confirmRechazarInv(inv: any): void {
    const titulo = inv?._titulo ?? inv?.tituloProyecto ?? ('Proyecto #' + inv?.idProyecto);
    this.openConfirm(
      'Rechazar invitación',
      `¿Rechazar invitación al proyecto:\n"${titulo}"?`,
      () => this.rechazarInvitacion(inv)
    );
  }

  /** ✅ asegura que el proyecto quede en estado 3 (Espera Asignando Revisor) */
  private asegurarEstadoEsperaRevisor(idProyecto: number): void {
    if (!idProyecto) return;

    // Intento 1: si ya tienes el proyecto en memoria (por ejemplo proyectoSeleccionado)
    const local = (this.bancoCompleto ?? []).find(p => Number(p.id) === Number(idProyecto));
    const base: any = local ?? null;

    // Si tengo el objeto, puedo hacer update directo
    if (base) {
      const upd = { ...base, idEstado: this.ESTADO_ESPERA_REVISOR_ID };
      this.proyectosSvc.update(idProyecto, { idEstado: this.ESTADO_ESPERA_REVISOR_ID } as any).subscribe({
        next: () => this.cargarProyectos(),
        error: (e) => console.error('No se pudo forzar estado 3 en proyecto', e)
      });
      return;
    }

    // Intento 2: traerlo por id y luego actualizar
    this.proyectosSvc.getByIds([idProyecto]).subscribe({
      next: (rows: any[]) => {
        const p = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!p) return;

        const upd = { ...p, idEstado: this.ESTADO_ESPERA_REVISOR_ID };
        this.proyectosSvc.update(idProyecto, upd as any).subscribe({
          next: () => this.cargarProyectos(),
          error: (e) => console.error('No se pudo forzar estado 3 (getByIds->update)', e)
        });
      },
      error: (e) => console.error('getByIds falló al intentar forzar estado 3', e)
    });
  }


  confirmSeleccionarProyecto(): void {
    if (this.tieneProyectoAsignado) {
      this.showError('Ya tienes un proyecto asignado.');
      this.showDialog = false;
      return;
    }
    if (this.idProyectoActual && !this.proyectoActualCancelado) {
      this.showError('Ya tienes un proyecto asignado.');
      return;
    }

    if (!this.proyectoSeleccionado) {
      this.showError('Selecciona un proyecto primero.');
      return;
    }
    if (!this.puedeSeleccionar(this.proyectoSeleccionado)) {
      this.showError('No puedes seleccionar este proyecto (sin permiso, ya seleccionado o está lleno).');
      return;
    }

    const titulo = this.proyectoSeleccionado?.titulo ?? `Proyecto #${this.proyectoSeleccionado.id}`;
    this.openConfirm(
      'Unirme al proyecto',
      `¿Unirte al proyecto:\n"${titulo}"?`,
      () => this.confirmarSeleccion() // ejecuta la lógica real
    );
  }

  private cupoDisponible(p: ProyectoBanco): boolean {
    const registrados = Number((p as any)?.registrados ?? 0);
    const noRes = Number((p as any)?.noResidentes ?? 0);

    // Si noResidentes no viene o viene 0, NO lo considero disponible
    if (!Number.isFinite(noRes) || noRes <= 0) return false;

    return registrados < noRes;
  }

  private esDisponibleBanco(p: ProyectoBanco): boolean {
    // 1) Solo banco (NO propuestas de alumno)
    if ((p as any)?.propuestaAlumno) return false;

    // 2) Debe tener cupo
    if (!this.cupoDisponible(p)) return false;

    // 3) No debe estar en curso (y por seguridad tampoco finalizado/cancelado)
    const estadoId = Number((p as any)?.idEstado ?? 0);

    const noDisponiblePorEstado = [this.ESTADO_EN_CURSO_ID, this.ESTADO_FINALIZADO_ID, this.ESTADO_CANCELADO_ID];
    if (noDisponiblePorEstado.includes(estadoId)) return false;

    return true;
  }

  private esInvitableEstudiante$(est: any) {
    const idProy = Number(est?.idProyecto ?? 0);

    // Si no tiene proyecto, es invitable
    if (!idProy) return of(true);

    // Si tiene, validar estado del proyecto
    return this.proyectosSvc.getByIds([idProy]).pipe(
      map((rows: any[]) => {
        const p = Array.isArray(rows) && rows.length ? rows[0] : null;
        const estado = Number(p?.idEstado ?? 0);

        // ✅ Cancelado = libre
        return estado === this.ESTADO_CANCELADO_ID;
      }),
      catchError(() => of(false))
    );
  }

  private filtrarInvitacionesCanceladas(): void {
    if (!this.invitacionesPendientes?.length) return;

    const ids = this.invitacionesPendientes
      .map(inv => this.invProyectoId(inv))
      .filter(id => id > 0);

    const unique = Array.from(new Set(ids));
    if (!unique.length) return;

    this.proyectosSvc.getByIds(unique).pipe(
      catchError(() => of([]))
    ).subscribe((rows: any[]) => {
      const estadoById = new Map<number, number>();

      (rows ?? []).forEach((p: any) => {
        const id = Number(p?.id ?? 0);
        const estado = Number(p?.idEstado ?? 0);
        if (id > 0) estadoById.set(id, estado);
      });

      // ✅ Filtra cancelados
      this.invitacionesPendientes = (this.invitacionesPendientes ?? []).filter(inv => {
        const idProy = this.invProyectoId(inv);
        const estado = estadoById.get(idProy);

        // Si no sabemos el estado (no vino), por seguridad la dejamos visible.
        // Si prefieres ocultarla también cuando no hay info, cámbialo a "return estado !== this.ESTADO_CANCELADO_ID && estado != null;"
        if (estado == null) return true;

        return estado !== this.ESTADO_CANCELADO_ID;
      });

      // re-enriquecer (empresa/titulo) por si cambió la lista
      this.enriquecerInvitacionesPendientes();

      this.cdr.detectChanges();
    });
  }


}



/** Validador: si ambos tiempos existen, fin debe ser mayor que inicio */
export function timeRangeValidator(startKey: string, endKey: string): ValidatorFn {
  return (group: AbstractControl) => {
    const start = group.get(startKey)?.value as string | null;
    const end = group.get(endKey)?.value as string | null;

    if (!start || !end) return null;

    const s = start.split(':').map(Number);
    const e = end.split(':').map(Number);
    const startMin = (s[0] ?? 0) * 60 + (s[1] ?? 0);
    const endMin = (e[0] ?? 0) * 60 + (e[1] ?? 0);

    if (endMin <= startMin) {
      group.get(endKey)?.setErrors({ ...(group.get(endKey)?.errors ?? {}), timeRange: true });
      return { timeRange: true };
    }

    const endCtrl = group.get(endKey);
    if (endCtrl?.errors) {
      const { timeRange, ...rest } = endCtrl.errors;
      endCtrl.setErrors(Object.keys(rest).length ? rest : null);
    }
    return null;
  };
}
