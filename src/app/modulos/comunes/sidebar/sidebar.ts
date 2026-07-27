import { Component, EventEmitter, Input, OnInit, Output, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { PanelMenuModule } from 'primeng/panelmenu';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';
import { PanelMenu } from 'primeng/panelmenu';
import { AuthService } from '../../../service/auth.service';
import { AvatarModule } from 'primeng/avatar';
import { EstudiantesService } from '../../../service/estudiantes.service';
import { DocentesService } from '../../../service/docentes.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { catchError, forkJoin, of } from 'rxjs';
import { Catalogo } from '../../../Interface/InterfaceUsuario';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Routes } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';


type MenuCfg = {
  label: string;
  icon: string;
  routerLink: string;
  perms?: string[]; // si está vacío/undefined => siempre visible
};

@Component({
  selector: 'app-sidebar',
  imports: [
    PanelMenuModule,
    DrawerModule,
    ButtonModule,
    PanelMenu,
    AvatarModule,
    SelectModule,
    FormsModule
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar implements OnInit, OnDestroy {

  private permsSub = new Subscription();
  private destroy$ = new Subject<void>();
  renderMenu = true; // para forzar re-render del PanelMenu si PrimeNG se pone terco

  seguimientoHabilitado = false; // ✅ solo si es estudiante y tiene idProyecto


  user: any;
  items: MenuItem[] = [];

  visible = false;
  constructor(
    private authService: AuthService,
    private router: Router,
    private estudiantesSvc: EstudiantesService,
    private docentesSvc: DocentesService,
    private usuariosSvc: UsuariosService,
    private cdr: ChangeDetectorRef
  ) { }

  private menuConfig: MenuCfg[] = [
    { label: 'Página Principal', icon: 'pi pi-home', routerLink: '/dashboard' },

    // Mostrar si tiene CUALQUIERA de estos permisos (por si algún rol solo tiene Create/Update)
    { label: 'Estudiantes', icon: 'pi pi-users', routerLink: '/estudiantes', perms: ['Estudiante-Read', 'Estudiante-Create', 'Estudiante-Update'] },
    { label: 'Docentes', icon: 'pi pi-id-card', routerLink: '/docentes', perms: ['Docente-Read', 'Docente-Create', 'Docente-Update'] },
    { label: 'Empresas', icon: 'pi pi-building', routerLink: '/empresas', perms: ['Empresa-Read', 'Empresa-Create', 'Empresa-Update'] },
    { label: 'Proyectos', icon: 'pi pi-briefcase', routerLink: '/proyectos', perms: ['Proyecto-Read', 'Proyecto-Create', 'Proyecto-Update'] },
    { label: 'Períodos Académicos', icon: 'pi pi-briefcase', routerLink: '/periodos-academicos', perms: ['PeriodoAcademico-Read'] },

    { label: 'Usuarios', icon: 'pi pi-shield', routerLink: '/usuarios', perms: ['Usuario-Read', 'Usuario-Create', 'Usuario-Update'] },

    // Si lo amarras a Proyecto, déjalo así:
    { label: 'Banco de Proyectos', icon: 'pi pi-folder-open', routerLink: '/repositorio', perms: ['Repositorio-Read'] },
    { label: 'Mis Proyectos (Docente)', icon: 'pi pi-briefcase', routerLink: '/docente/proyectos', perms: ['DocenteProyecto-Read'] },
    { label: 'Oficios consolidados', icon: 'pi pi-file-pdf', routerLink: '/oficios-consolidados', perms: ['Proyecto-Update'] },

    { label: 'Seguimiento', icon: 'pi pi-folder-open', routerLink: '/seguimiento', perms: ['Seguimiento-Read'] },
    { label: 'Egresados', icon: 'pi pi-graduation-cap', routerLink: '/egresados', perms: ['Egresado-Read'] },
  ];

  roles: Catalogo[] = []
  permisos: Catalogo[] = []

  @Input() sessionActive: boolean = false;
  ngOnInit() {
    this.user = this.authService.getUser();
    this.resolverPerfilParaHeader(this.user);

    this.rebuildMenu();

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(() => { this.visible = false; });

    this.usuariosSvc.activePerms$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.rebuildMenu();
        this.renderMenu = false;
        queueMicrotask(() => {
          this.renderMenu = true;
          this.cdr.detectChanges();
        });
      });

    // ✅ NUEVO: escucha cambios de "seguimiento habilitado"
    this.estudiantesSvc.seguimientoHabilitado$
      .pipe(takeUntil(this.destroy$))
      .subscribe(flag => {
        this.seguimientoHabilitado = flag;
        this.rebuildMenu();
        this.cdr.detectChanges();
      });

    this.cargarRoles();
  }




  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  private rebuildMenu(): void {
    const nextItems: MenuItem[] = this.menuConfig
      .filter(cfg => {
        // permisos normales
        const okPerm = this.usuariosSvc.hasAnyPermission(cfg.perms ?? []);
        if (!okPerm) return false;

        // ✅ condición extra SOLO para Seguimiento
        if (cfg.routerLink === '/seguimiento') {
          return this.seguimientoHabilitado === true;
        }

        return true;
      })
      .map(cfg => ({
        label: cfg.label,
        icon: cfg.icon,
        routerLink: cfg.routerLink,
        command: () => (this.visible = false)
      }));

    this.items = [...nextItems];
  }



  private enforcePermissionForCurrentRoute(): void {
    // 🔒 Si intenta entrar a seguimiento sin cumplir regla, lo sacamos
    const url = this.router.url;
    if (url.startsWith('/seguimiento') && !this.seguimientoHabilitado) {
      this.visible = false;
      this.router.navigateByUrl('/dashboard');
      return;
    }

    const requiredPerm = this.getRequiredPermFromActiveRoute();

    if (requiredPerm && !this.usuariosSvc.hasPermission(requiredPerm)) {
      this.visible = false;
      this.router.navigateByUrl('/dashboard');
    }
  }


  private getRequiredPermFromActiveRoute(): string | undefined {
    let route = this.router.routerState.snapshot.root;

    // Nos vamos al hijo más profundo (ruta real activa)
    let requiredPerm: string | undefined;

    while (route) {
      const p = route.data?.['permiso'];
      if (typeof p === 'string' && p.trim()) {
        requiredPerm = p; // guardamos el último encontrado (el más específico)
      }
      route = route.firstChild as any;
    }

    return requiredPerm;
  }


  private findRequiredPermForUrl(url: string): string | undefined {
    const cleaned = url.replace(/^\/+/, ''); // quita "/" inicial
    const segments = cleaned ? cleaned.split('/').filter(Boolean) : [];

    const perm = this.matchRoutesForPerm(this.router.config, segments);
    return perm;
  }

  private matchRoutesForPerm(routes: Routes, segments: string[]): string | undefined {
    for (const r of routes) {
      if (!r.path || r.redirectTo) continue;

      const routeSegs = r.path.split('/').filter(Boolean);

      // ** wildcard no nos sirve para permiso específico
      if (r.path === '**') continue;

      // match de segmentos del path actual con el route.path (soporta :id)
      if (!this.routeMatches(routeSegs, segments)) continue;

      // Si quedan segmentos, intenta con children
      const consumed = routeSegs.length;
      const remaining = segments.slice(consumed);

      if (remaining.length > 0 && r.children?.length) {
        const childPerm = this.matchRoutesForPerm(r.children, remaining);
        if (childPerm) return childPerm;
      }

      // Si ya matcheó, devuelve el permiso si existe
      const p = (r.data as any)?.permiso as string | undefined;
      if (p) return p;
    }

    return undefined;
  }

  private routeMatches(routeSegs: string[], urlSegs: string[]): boolean {
    // Si la ruta es más larga que la URL, no match
    if (routeSegs.length > urlSegs.length) return false;

    for (let i = 0; i < routeSegs.length; i++) {
      const r = routeSegs[i];
      const u = urlSegs[i];

      if (r.startsWith(':')) continue; // :id acepta cualquier cosa
      if (r !== u) return false;
    }

    return true;
  }



  private buildMenuItems(): void {
    // helper para no repetir cadenas
    const can = (
      recurso: 'Estudiante' | 'Docente' | 'Empresa' | 'Proyecto' | 'Usuario' | 'Repositorio' | 'Seguimiento',
      accion: 'Read' | 'Create' | 'Update'
    ) => this.usuariosSvc.hasPerm(recurso, accion);

    this.items = [
      {
        label: 'Página Principal',
        icon: 'pi pi-home',
        routerLink: '/dashboard',
        visible: true   // siempre visible
      },
      {
        label: 'Estudiantes',
        icon: 'pi pi-users',
        routerLink: '/estudiantes',
        visible: can('Estudiante', 'Read')
      },
      {
        label: 'Docentes',
        icon: 'pi pi-briefcase',
        routerLink: '/docentes',
        visible: can('Docente', 'Read')
      },
      {
        label: 'Empresas',
        icon: 'pi pi-building',
        routerLink: '/empresas',
        visible: can('Empresa', 'Read')
      },
      {
        label: 'Proyectos',
        icon: 'pi pi-folder-open',
        routerLink: '/proyectos',
        visible: can('Proyecto', 'Read')
      },
      {
        label: 'Usuarios',
        icon: 'pi pi-id-card',
        routerLink: '/usuarios',
        visible: can('Usuario', 'Read')
      },
      {
        label: 'Banco de Proyectos',
        icon: 'pi pi-book',
        routerLink: '/repositorio',
        visible: can('Repositorio', 'Read')
      },
      {
        label: 'Seguimiento',
        icon: 'pi pi-book',
        routerLink: '/seguimiento',
        visible: can('Seguimiento', 'Read')
      },
      {
        label: 'Periodos Académicos',
        icon: 'pi pi-book',
        routerLink: '/periodos-academicos',
        //visible: can('PeriodosAcademicos', 'Read')
      }

    ];
  }



  private resolverPerfilParaHeader(authUser: any) {
    const idUsuario =
      Number(authUser?.id ?? authUser?.userId ?? authUser?.sub ?? NaN);

    if (!Number.isNaN(idUsuario) && idUsuario > 0) {
      this.buscarPerfilPorIdUsuario(idUsuario);
      return;
    }

    // Fallback: intenta obtener el id por correo
    const correo = String(authUser?.correo ?? authUser?.email ?? '')
      .trim().toLowerCase();
    if (!correo) return;

    this.usuariosSvc.getByCorreo(correo).subscribe({
      next: u => {
        if (u && u.id) this.buscarPerfilPorIdUsuario(u.id);
      },
      error: () => {/* silencioso en sidebar */ }
    });
  }

  /** Llama en paralelo a ambos endpoints y rellena this.user con nombre/apellidos */
  /** Llama en paralelo a ambos endpoints y rellena this.user con nombre/apellidos */
  private buscarPerfilPorIdUsuario(idUsuario: number) {
    forkJoin({
      est: this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(catchError(() => of(false))),
      doc: this.docentesSvc.getByIdUsuario(idUsuario).pipe(catchError(() => of(false))),
    }).subscribe({
      next: ({ est, doc }) => {

        // ✅ regla Seguimiento:
        // solo si existe estudiante y trae idProyecto (defensivo por si viene con otro casing)
        const idProyecto =
          (est as any)?.idProyecto ?? (est as any)?.idproyecto ?? null;

        this.seguimientoHabilitado = !!est && !!idProyecto && Number(idProyecto) > 0;

        if (est) {
          this.user = {
            ...this.user,
            nombre: (est as any).nombre ?? this.user?.nombre,
            apellidoPaterno: (est as any).apellidoPaterno ?? this.user?.apellidoPaterno,
            apellidoMaterrno: (est as any).apellidoMaterrno ?? this.user?.apellidoMaterrno,
            correo: (est as any).correo ?? this.user?.correo
          };
        } else if (doc) {
          this.user = {
            ...this.user,
            nombre: (doc as any).nombre ?? this.user?.nombre,
            apellidoPaterno: (doc as any).apellidoPaterno ?? this.user?.apellidoPaterno,
            apellidoMaterrno: (doc as any).apellidoMatterno ?? this.user?.apellidoMaterrno,
            correo: ((doc as any).correo ?? (doc as any).correoInstitucional ?? this.user?.correo)
          };
        } else {
          this.seguimientoHabilitado = false;
        }

        // ✅ reconstruye menú con la nueva condición
        this.rebuildMenu();
        this.cdr.detectChanges();
      },
      error: () => {
        this.seguimientoHabilitado = false;
        this.rebuildMenu();
      }
    });
  }


  toggleSidebar() {
    this.visible = !this.visible;
  }
  logout() {
    this.authService.logout();
    this.visible = false;
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }


  navCambioContra() {
    this.router.navigateByUrl('/perfil')
    this.toggleSidebar()
  }

  //Lamar los perfiles con los que esta relacionado el usuario

  error? = ''
  cargandoRoles = false

  rolSeleccionado: Catalogo | null = null;

  cargarRoles(): void {
    this.cargandoRoles = true;
    this.usuariosSvc.getRolesByUsuario(this.user.id).subscribe({
      next: roles => {
        this.roles = roles;
        //console.log('roles:', roles);
        this.cargandoRoles = false;

        // 1) Revisar si ya hay rol activo guardado en localStorage
        const rolActivo = this.usuariosSvc.getActiveRoleSync(); // <- debe regresar Catalogo | null

        if (rolActivo) {
          const encontrado = this.roles.find(r => r.id === rolActivo.id);
          if (encontrado) {
            this.rolSeleccionado = encontrado;  // 👈 esto ya lo ve p-select
            this.onRolChange(encontrado, false); // cargar permisos sin volver a guardar rol
            return;
          }
        }

        // 2) Si no había rol activo, tomar el primero
        if (this.roles.length > 0) {
          this.rolSeleccionado = this.roles[0];
          this.onRolChange(this.roles[0]);       // aquí sí guardamos en storage
        }
      },
      error: err => {
        //console.error(err);
        this.error = 'Error al obtener roles';
        this.cargandoRoles = false;
      }
    });
  }

  cargandoPermisos = false

  onRolChange(rol: Catalogo | null, actualizarStorage: boolean = true): void {
    this.rolSeleccionado = rol;

    if (!rol) {
      this.permisos = [];
      this.usuariosSvc.clearActivePerms();
      this.enforcePermissionForCurrentRoute(); // por si se queda en ruta no permitida
      return;
    }

    if (actualizarStorage) {
      this.usuariosSvc.setActiveRole(rol);
    }

    this.cargandoPermisos = true;
    this.usuariosSvc.getPermisosByRol(rol.id).subscribe({
      next: permisos => {
        this.permisos = permisos;
        this.cargandoPermisos = false;

        this.usuariosSvc.setActivePermsFromCatalogo(permisos);

        // ✅ aquí, justo después de publicar permisos
        this.enforcePermissionForCurrentRoute();
      },

      error: err => {
        console.error(err);
        this.error = 'Error al obtener permisos';
        this.cargandoPermisos = false;

        this.usuariosSvc.clearActivePerms();
        this.enforcePermissionForCurrentRoute(); // sin permisos => a dashboard si aplica
      }
    });
  }



}
