import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { TableModule, Table } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ListboxModule } from 'primeng/listbox';
import { TabsModule } from 'primeng/tabs';
import { MessageService } from 'primeng/api';

import { UsuariosService } from '../../service/usuarios.service';
import { Usuario, Catalogo, UserCreateRequest } from '../../Interface/InterfaceUsuario';

import { catchError, finalize, forkJoin, of } from 'rxjs';
import { EmailService } from '../../service/email.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    ToastModule,
    DialogModule,
    InputTextModule,
    ListboxModule,
    TabsModule
  ],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.css',
  providers: [MessageService]
})
export class Usuarios implements OnInit {

  // pestaña activa de p-tabs
  activeTab: 'usuarios' | 'roles' = 'usuarios';

  // ===== USUARIOS =====
  usuarios: Usuario[] = [];
  searchValue = '';

  showDialog = false;
  dialogMode: 'add' | 'edit' = 'add';
  form!: FormGroup;

  selectedUsuario: Usuario | null = null;
  cargando = false;


  // catálogo de roles (para listbox de usuario y tabla de roles)
  rolesCatalogo: Catalogo[] = [];

  // roles por usuario para mostrarlos en la tabla de usuarios
  rolesPorUsuario: { [idUsuario: number]: Catalogo[] } = {};

  // permisos calculados por los roles seleccionados en el diálogo de usuario
  permisosCalculados: Catalogo[] = [];

  // ===== PERMISOS POR ROL =====
  permisosCatalogo: Catalogo[] = [];
  formPermisosRol!: FormGroup;
  showPermisosRolDialog = false;
  rolSeleccionado: Catalogo = {
    id: 0,
    descripcion: '',
    activo: false
  };

  // ===== CRUD ROL =====
  formRol!: FormGroup;
  showRolDialog = false;
  rolDialogMode: 'add' | 'edit' = 'add';
  rolEditSeleccionado: Catalogo | null = null;

  mostrarNoControl = false;

  rolesLoading: Record<number, boolean> = {};
  rolesError: Record<number, boolean> = {};


  constructor(
    private fb: FormBuilder,
    private usuariosSvc: UsuariosService,
    private messageService: MessageService,
    private emailSvc: EmailService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) { }


  ngOnInit(): void {
    this.initForm();
    this.initFormPermisosRol();
    this.initFormRol();
    this.cargarUsuarios();
    this.cargarCatalogoRoles();
    this.cargarCatalogoPermisos();
  }

  cargarRolesParaUsuariosStream(usuarios: any[]) {
    if (!usuarios || usuarios.length === 0) return;

    for (const u of usuarios) {
      const id = u.id;

      // si ya lo cargaste, no vuelvas a pedir (importante para paginación)
      if (this.rolesPorUsuario[id]) continue;

      this.rolesLoading[id] = true;
      this.rolesError[id] = false;

      this.usuariosSvc.getRolesByUsuario(id).pipe(
        catchError(err => {
          this.rolesError[id] = true;
          return of([]); // si falla, no bloquea la tabla
        }),
        finalize(() => {
          this.rolesLoading[id] = false;
        })
      ).subscribe((roles: any[]) => {
        // ✅ nueva referencia para que Angular/Prime detecte cambio
        this.rolesPorUsuario = { ...this.rolesPorUsuario, [id]: roles || [] };
      });
    }
  }


  get f() {
    return this.form.controls;
  }

  // ================= FORM PRINCIPAL USUARIO =================

  noControlReadonly = false;      // si ya existe estudiante ligado al usuario
  noControlCargando = false;
  noControlYaExistiaPorUsuario = false;

  private initForm(): void {
    this.form = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      apellidoPaterno: ['', [Validators.required, Validators.maxLength(100)]],
      apellidoMaterno: ['', [Validators.maxLength(100)]],
      correo: ['', [Validators.required, Validators.email]],
      activo: [true],
      rolesIds: [<number[]>[]],

      // ✅ Nuevo
      noControl: ['']
    });
  }


  private initFormPermisosRol(): void {
    this.formPermisosRol = this.fb.group({
      permisosIds: [<number[]>[]]
    });
  }

  private initFormRol(): void {
    this.formRol = this.fb.group({
      descripcion: ['', [Validators.required, Validators.maxLength(100)]],
      activo: [true]
    });
  }

  // ================= CARGA DE CATÁLOGOS =================

  private cargarCatalogoRoles(): void {
    this.usuariosSvc.getAllRoles().subscribe({
      next: roles => {
        this.rolesCatalogo = roles;

        const est = roles.find(r => (r.descripcion || '').trim().toLowerCase() === 'estudiante');
        const doc = roles.find(r => (r.descripcion || '').trim().toLowerCase() === 'docente');

        this.rolEstudianteId = est?.id ?? null;
        this.rolDocenteId = doc?.id ?? null;
      },

      error: err => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los roles', life: 10000
        });
      }
    });
  }

  private cargarCatalogoPermisos(): void {
    this.usuariosSvc.getAllPermisos().subscribe({
      next: permisos => {
        this.permisosCatalogo = permisos;
      },
      error: err => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los permisos', life: 10000
        });
      }
    });
  }

  // ================= CARGA DE USUARIOS =================

  cargarUsuarios(): void {
    this.cargando = true;
    this.usuariosSvc.getUsuarios().subscribe({
      next: res => {
        this.usuarios = res;
        this.cargarRolesParaUsuariosStream(this.usuarios);
        this.cargando = false;

      },
      error: err => {
        console.error(err);
        this.cargando = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los usuarios', life: 10000
        });
      }
    });
  }

  private cargarRolesParaUsuarios(usuarios: Usuario[]): void {
    if (!usuarios || usuarios.length === 0) {
      this.rolesPorUsuario = {};
      return;
    }

    const requests = usuarios.map(u => this.usuariosSvc.getRolesByUsuario(u.id));

    forkJoin(requests).subscribe({
      next: listas => {
        const map: { [idUsuario: number]: Catalogo[] } = {};
        usuarios.forEach((u, index) => {
          map[u.id] = listas[index] || [];
        });



        this.rolesPorUsuario = { ...map };

        this.zone.run(() => {
          this.cdr.detectChanges();
        });
      },
      error: err => {
        console.error(err);
      }
    });


  }

  clear(dt: Table): void {
    dt.clear();
    this.searchValue = '';
  }

  // ================= DIÁLOGO USUARIO =================

  openAddDialog(): void {
    this.dialogMode = 'add';
    this.selectedUsuario = null;
    this.form.reset({
      nombre: '',
      apellidoPaterno: '',
      apellidoMaterno: '',
      correo: '',
      activo: true,
      rolesIds: [],
      noControl: '' // ✅ nuevo
    });
    this.mostrarNoControl = false;
    this.permisosCalculados = [];
    this.showDialog = true;
  }


  openEditDialog(usuario: Usuario): void {
    this.dialogMode = 'edit';
    this.selectedUsuario = usuario;

    this.form.patchValue({
      nombre: usuario.nombre,
      apellidoPaterno: usuario.apellidoPaterno,
      apellidoMaterno: usuario.apellidoMaterno,
      correo: usuario.correo,
      activo: usuario.activo
    });

    this.usuariosSvc.getRolesByUsuario(usuario.id).subscribe({
      next: rolesUsuario => {
        const ids = rolesUsuario.map(r => r.id);
        this.form.patchValue({ rolesIds: ids });
        this.cargarPermisos(ids);
        // Si ya tiene rol estudiante, checar si existe registro y precargar noControl
        if (this.rolEstudianteId != null && ids.includes(this.rolEstudianteId)) {
          this.mostrarNoControl = true;
          this.checarEstudianteExistentePorUsuario(usuario.id);
        } else {
          this.mostrarNoControl = false;
          this.form.get('noControl')?.enable({ emitEvent: false });
          this.form.get('noControl')?.setValue('');
        }

      },
      error: err => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los roles del usuario', life: 10000
        });
      }
    });

    this.showDialog = true;
  }

  isEditing(): boolean {
    return this.dialogMode === 'edit';
  }

  onDialogHide(): void {
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.permisosCalculados = [];
  }

  cancelarEdicion(): void {
    this.selectedUsuario = null;
    this.form.reset();
    this.permisosCalculados = [];
  }

  // ================= ROLES / PERMISOS (USUARIO) =================

  onRolesChange(): void {
    const ids = (this.form.value.rolesIds || []) as number[];
    this.cargarPermisos(ids);

    // reglas UI
    const esEstudiante = this.rolEstudianteId != null && ids.includes(this.rolEstudianteId);
    const esDocente = this.rolDocenteId != null && ids.includes(this.rolDocenteId);

    // No permitir docente + estudiante desde UI (aunque backend también lo valida)
    if (esEstudiante && esDocente) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Regla de roles',
        detail: 'No está permitido Docente + Estudiante.',
        life: 8000
      });

      // quita Estudiante (o quita Docente), aquí quito Estudiante:
      this.form.patchValue({ rolesIds: ids.filter(x => x !== this.rolEstudianteId) });
      this.form.updateValueAndValidity();
      return;
    }

    // Estudiante solo puede tener Estudiante
    if (esEstudiante && ids.length > 1) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Regla de roles',
        detail: 'Un Estudiante solo puede tener el rol Estudiante.',
        life: 8000
      });
      this.form.patchValue({ rolesIds: [this.rolEstudianteId!] });
    }

    // Mostrar / ocultar noControl
    this.mostrarNoControl = esEstudiante;

    if (!esEstudiante) {
      this.noControlReadonly = false;
      this.noControlYaExistiaPorUsuario = false;
      this.form.get('noControl')?.setValue('');
      this.form.get('noControl')?.clearValidators();
      this.form.get('noControl')?.clearAsyncValidators();
      this.form.get('noControl')?.updateValueAndValidity();
      return;
    }

    // Si es estudiante, checa si YA existe registro ligado al usuario (edit)
    if (this.dialogMode === 'edit' && this.selectedUsuario?.id) {
      this.checarEstudianteExistentePorUsuario(this.selectedUsuario.id);
    } else {
      // modo add: pedir noControl sí o sí
      this.configurarValidacionesNoControl(true);
    }
  }

  private configurarValidacionesNoControl(requerido: boolean) {
    const ctrl = this.form.get('noControl');
    if (!ctrl) return;

    ctrl.clearValidators();
    ctrl.clearAsyncValidators();

    const pattern = Validators.pattern(/^[A-Za-z]?\d{8}$/);

    const validators = [pattern];
    if (requerido) validators.unshift(Validators.required);

    ctrl.setValidators(validators);

    // ✅ Async validator: validar que no exista el noControl
    ctrl.setAsyncValidators(async (control) => {
      const v = String(control.value || '').trim();
      if (!v) return null;

      // Si ya existe por usuario, no validar duplicado
      if (this.noControlYaExistiaPorUsuario) return null;

      // si no pasa el patrón, no pegues al backend
      if (!/^[A-Za-z]?\d{8}$/.test(v)) return null;

      try {
        // Necesitas este método en tu service: existeNoControl(noControl)
        const res: any = await this.usuariosSvc.existeNoControlEstudiante(v).toPromise();
        return res?.exists ? { noControlExiste: true } : null;
      } catch {
        return null; // no bloquees por error de red
      }
    });

    ctrl.updateValueAndValidity();
  }

  private checarEstudianteExistentePorUsuario(idUsuario: number) {
    this.noControlCargando = true;

    // Necesitas este método en tu service: getEstudianteByIdUsuario(idUsuario)
    this.usuariosSvc.getEstudianteByIdUsuario(idUsuario).subscribe({
      next: (est: any) => {
        // Existe -> no pedirlo, solo mostrarlo
        const nc = est?.noControl || '';
        this.noControlYaExistiaPorUsuario = true;
        this.noControlReadonly = true;

        this.form.get('noControl')?.setValue(nc);
        this.form.get('noControl')?.disable({ emitEvent: false });

        // validaciones mínimas (sin required, porque ya existe)
        this.configurarValidacionesNoControl(false);

        this.noControlCargando = false;
      },
      error: () => {
        // No existe -> pedirlo
        this.noControlYaExistiaPorUsuario = false;
        this.noControlReadonly = false;

        this.form.get('noControl')?.enable({ emitEvent: false });
        this.form.get('noControl')?.setValue('');
        this.configurarValidacionesNoControl(true);

        this.noControlCargando = false;
      }
    });
  }



  private cargarPermisos(idsRoles: number[]): void {
    if (!idsRoles || idsRoles.length === 0) {
      this.permisosCalculados = [];
      return;
    }

    this.usuariosSvc.getPermisosByRoles(idsRoles).subscribe({
      next: permisos => {
        this.permisosCalculados = permisos;
      },
      error: err => {
        console.error(err);
        this.permisosCalculados = [];
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los permisos', life: 10000
        });
      }
    });
  }

  // ================= GUARDADO USUARIO + ROLES =================

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rolesIds = (this.form.value.rolesIds || []) as number[];

    const esEst = this.esRolEstudianteSeleccionado(rolesIds);
    if (esEst) {
      const noControl = String(this.form.value.noControl || '').trim();
      if (!noControl) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Falta No. Control',
          detail: 'Para asignar rol Estudiante debes capturar el No. de Control.',
          life: 10000
        });
        this.f['noControl'].markAsTouched();
        return;
      }
    }


    if (!rolesIds || rolesIds.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Roles',
        detail: 'Selecciona al menos un rol para el usuario.', life: 10000
      });
      this.f['rolesIds'].markAsTouched();
      return;
    }

    const correo = String(this.form.value.correo || '').trim().toLowerCase();

    // ✅ EDIT: NO se cambia contraseña
    if (this.dialogMode === 'edit' && this.selectedUsuario) {
      const payloadUpdate: Omit<Usuario, 'id'> = {
        nombre: this.form.value.nombre,
        apellidoPaterno: this.form.value.apellidoPaterno,
        apellidoMaterno: this.form.value.apellidoMaterno,
        correo,
        activo: this.form.value.activo
      };

      const errorRegla = this.validarReglasRoles(rolesIds);
      if (errorRegla) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Roles inválidos',
          detail: errorRegla,
          life: 10000
        });
        return;
      }


      this.actualizarUsuarioConRoles(this.selectedUsuario.id, payloadUpdate, rolesIds);
      return;
    }

    // ✅ ADD: generar contraseña aleatoria + enviar por correo
    const tempPass = this.generateTemporaryPassword(8);

    const payloadCreate: Omit<UserCreateRequest, 'id'> = {
      nombre: this.form.value.nombre,
      passwordHash: tempPass,
      apellidoPaterno: this.form.value.apellidoPaterno,
      apellidoMaterno: this.form.value.apellidoMaterno,
      correo,
      activo: this.form.value.activo
    };

    const errorRegla = this.validarReglasRoles(rolesIds);
    if (errorRegla) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Roles inválidos',
        detail: errorRegla,
        life: 10000
      });
      return;
    }


    this.crearUsuarioConRoles(payloadCreate, rolesIds, tempPass);
  }


 private crearUsuarioConRoles(
  payload: Omit<UserCreateRequest, 'id'>,
  rolesIds: number[],
  tempPass: string
): void {
  this.usuariosSvc.crearUsuario(payload).subscribe({
    next: nuevo => {
      const idUsuario = nuevo.id;

      if (!idUsuario) {
        this.messageService.add({
          severity: 'success',
          summary: 'Usuario creado',
          detail: `Se creó el usuario ${nuevo.correo}`,
          life: 10000
        });
        this.showDialog = false;
        this.cargarUsuarios();
        return;
      }

      const noControl =
        this.esRolEstudianteSeleccionado(rolesIds)
          ? String(this.form.value.noControl || '').trim()
          : undefined;

      this.usuariosSvc.updateRolesUsuario(idUsuario, rolesIds, noControl)
        .subscribe({
          next: () => {
            this.enviarCredencialesPorCorreo(nuevo.correo, tempPass).subscribe({
              next: () => {
                this.messageService.add({
                  severity: 'success',
                  summary: 'Usuario creado',
                  detail: 'Usuario creado correctamente. Credenciales enviadas por correo.',
                  life: 10000
                });
                this.showDialog = false;
                this.cargarUsuarios();
              },
              error: (e) => {
                console.error('Error al enviar correo', e);
                this.messageService.add({
                  severity: 'warn',
                  summary: 'Usuario creado',
                  detail: `Se creó el usuario ${nuevo.correo} y se asignaron roles, pero falló el envío de correo.`,
                  life: 10000
                });
                this.showDialog = false;
                this.cargarUsuarios();
              }
            });
          },
          error: err => {
            console.error(err);

            this.enviarCredencialesPorCorreo(nuevo.correo, tempPass).subscribe({
              next: () => {
                this.messageService.add({
                  severity: 'warn',
                  summary: 'Usuario creado',
                  detail: `Se creó el usuario ${nuevo.correo} y se enviaron credenciales, pero hubo error al asignar roles.`,
                  life: 10000
                });
                this.showDialog = false;
                this.cargarUsuarios();
              },
              error: (e) => {
                console.error('Error al enviar correo', e);
                this.messageService.add({
                  severity: 'warn',
                  summary: 'Usuario creado',
                  detail: `Se creó el usuario ${nuevo.correo}, pero falló roles y también el correo.`,
                  life: 10000
                });
                this.showDialog = false;
                this.cargarUsuarios();
              }
            });
          }
        });
    },
    error: err => {
      console.error(err);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo crear el usuario. Verifica el correo e intenta nuevamente.',
        life: 10000
      });
    }
  });
}

  private actualizarUsuarioConRoles(
    id: number,
    payload: Omit<Usuario, 'id'>,
    rolesIds: number[]
  ): void {
    this.usuariosSvc.actualizarUsuario(id, payload).subscribe({
      next: () => {
        const payloadRoles: any = { rolesIds };
        if (this.esRolEstudianteSeleccionado(rolesIds)) {
          payloadRoles.noControl = String(this.form.value.noControl || '').trim();
        }
        const ids = rolesIds;
        const esEstudiante = this.rolEstudianteId != null && ids.includes(this.rolEstudianteId);

        // Solo manda noControl si es estudiante y NO existía ya por usuario
        const noControlToSend =
          esEstudiante && !this.noControlYaExistiaPorUsuario
            ? String(this.form.get('noControl')?.value || '').trim()
            : undefined;

        this.usuariosSvc.updateRolesUsuario(id, ids, noControlToSend).subscribe(
          {
            next: () => {
              this.messageService.add({
                severity: 'success',
                summary: 'Usuario actualizado',
                detail: 'Se actualizaron los datos y roles del usuario', life: 10000
              });
              this.showDialog = false;
              this.cargarUsuarios();
            },
            error: err => {
              console.error(err);
              this.messageService.add({
                severity: 'warn',
                summary: 'Usuario actualizado',
                detail: 'Los datos se actualizaron, pero hubo un error al guardar sus roles', life: 10000
              });
              this.showDialog = false;
              this.cargarUsuarios();
            }
          });
      },
      error: err => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo actualizar el usuario', life: 10000
        });
      }
    });
  }

  private generateTemporaryPassword(len: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let pass = '';
    for (let i = 0; i < len; i++) {
      pass += chars[Math.floor(Math.random() * chars.length)];
    }
    return pass;
  }

  private enviarCredencialesPorCorreo(correo: string, password: string) {
    const subject = 'Acceso al Sistema';
    const body = `Su contraseña temporal es: ${password}`;

    return this.emailSvc.sendEmail(correo, subject, body);
  }


  // ================= ADMINISTRAR PERMISOS DE ROL =================

  openPermisosRolDialog(rol: Catalogo): void {
    this.rolSeleccionado = rol;
    this.formPermisosRol.patchValue({ permisosIds: [] });

    this.usuariosSvc.getPermisosByRol(rol.id).subscribe({
      next: permisos => {
        const ids = permisos.map(p => p.id);
        this.formPermisosRol.patchValue({ permisosIds: ids });
      },
      error: err => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los permisos del rol', life: 10000
        });
      }
    });

    this.showPermisosRolDialog = true;
  }

  onSubmitPermisosRol(): void {
    if (!this.rolSeleccionado) return;

    const permisosIds = (this.formPermisosRol.value.permisosIds || []) as number[];

    this.usuariosSvc.updatePermisosRol(this.rolSeleccionado.id, permisosIds).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Permisos actualizados',
          detail: `Se actualizaron los permisos del rol ${this.rolSeleccionado.descripcion}`, life: 10000
        });
        this.showPermisosRolDialog = false;

        const rolesIds = (this.form.value.rolesIds || []) as number[];
        if (rolesIds.includes(this.rolSeleccionado.id)) {
          this.cargarPermisos(rolesIds);
        }
      },
      error: err => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron actualizar los permisos del rol', life: 10000
        });
      }
    });
  }

  // ================= CRUD ROL (alta/edición/eliminar) =================

  openAddRolDialog(): void {
    this.rolDialogMode = 'add';
    this.rolEditSeleccionado = null;
    this.formRol.reset({
      descripcion: '',
      activo: true
    });
    this.showRolDialog = true;
  }

  openEditRolDialog(rol: Catalogo): void {
    this.rolDialogMode = 'edit';
    this.rolEditSeleccionado = rol;
    this.formRol.patchValue({
      descripcion: rol.descripcion,
      activo: rol.activo
    });
    this.showRolDialog = true;
  }

  onSubmitRol(): void {
    if (this.formRol.invalid) {
      this.formRol.markAllAsTouched();
      return;
    }

    const payload: Omit<Catalogo, 'id'> = {
      descripcion: this.formRol.value.descripcion,
      activo: this.formRol.value.activo
    };

    if (this.rolDialogMode === 'add') {
      this.usuariosSvc.createRol(payload).subscribe({
        next: rolCreado => {
          this.messageService.add({
            severity: 'success',
            summary: 'Rol creado',
            detail: `Se creó el rol ${rolCreado.descripcion}`, life: 10000
          });
          this.showRolDialog = false;
          this.cargarCatalogoRoles();
        },
        error: err => {
          console.error(err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudo crear el rol', life: 10000
          });
        }
      });
    } else if (this.rolDialogMode === 'edit' && this.rolEditSeleccionado) {
      this.usuariosSvc.updateRol(this.rolEditSeleccionado.id, payload).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Rol actualizado',
            detail: `Se actualizó el rol ${this.rolEditSeleccionado?.descripcion}`, life: 10000
          });
          this.showRolDialog = false;
          this.cargarCatalogoRoles();
        },
        error: err => {
          console.error(err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudo actualizar el rol', life: 10000
          });
        }
      });
    }
  }

  eliminarRol(rol: Catalogo): void {
    if (!confirm(`¿Deshabilitar el rol "${rol.descripcion}"?`)) return;

    this.usuariosSvc.deshabilitarRol(rol).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Rol deshabilitado',
          detail: `El rol "${rol.descripcion}" se marcó como inactivo`, life: 10000
        });
        this.cargarCatalogoRoles();
      },
      error: err => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo deshabilitar el rol', life: 10000
        });
      }
    });
  }


  private rolEstudianteId: number | null = null;
  private rolDocenteId: number | null = null;


  get seleccionoEstudiante(): boolean {
    const id = this.rolEstudianteId;
    const roles = this.form.value.rolesIds || [];
    return !!id && roles.includes(id);
  }



  // ================= ELIMINAR USUARIO =================

  eliminarUsuario(usuario: Usuario): void {
    if (!confirm(`¿Eliminar al usuario ${usuario.correo}?`)) return;

    this.usuariosSvc.eliminarUsuario(usuario.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Usuario eliminado',
          detail: `Se eliminó el usuario ${usuario.correo}`, life: 10000
        });
        this.cargarUsuarios();
      },
      error: err => {
        console.error(err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo eliminar el usuario', life: 10000
        });
      }
    });
  }

  private validarReglasRoles(rolesIds: number[]): string | null {
    const roles = this.rolesCatalogo.filter(r => rolesIds.includes(r.id));
    const hasEst = roles.some(r => r.descripcion?.toUpperCase().includes('ESTUDIANTE'));
    const hasDoc = roles.some(r => r.descripcion?.toUpperCase().includes('DOCENTE'));

    if (hasEst && hasDoc) return 'No se permite DOCENTE + ESTUDIANTE.';
    if (hasEst && roles.length > 1) return 'ESTUDIANTE no puede tener roles adicionales.';
    if (hasDoc && roles.length > 2) return 'DOCENTE solo puede tener 1 rol adicional (DOCENTE + 1).';

    return null;
  }

  private getRolIdByKeyword(keyword: string): number | null {
    const k = (keyword || '').toLowerCase();
    const found = this.rolesCatalogo.find(r => (r.descripcion || '').toLowerCase().includes(k));
    return found ? found.id : null;
  }

  private esRolEstudianteSeleccionado(ids: number[]): boolean {
    const idEst = this.getRolIdByKeyword('estudiante');
    return !!idEst && ids.includes(idEst);
  }

  private esRolDocenteSeleccionado(ids: number[]): boolean {
    const idDoc = this.getRolIdByKeyword('docente');
    return !!idDoc && ids.includes(idDoc);
  }


}
