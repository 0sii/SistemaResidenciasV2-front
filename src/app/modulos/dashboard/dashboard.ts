import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../service/auth.service';
import { UsuariosService } from '../../service/usuarios.service';
import { EstudiantesService } from '../../service/estudiantes.service';

type DashboardCard = {
  title: string;
  description: string;
  icon: string;
  routerLink: string;
  perms?: string[];
};

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  user: any = null;
  saludo = 'Bienvenido';
  rolActivo = 'Sin rol seleccionado';

  visibleCards: DashboardCard[] = [];
  quickLinks: DashboardCard[] = [];

  private cardsConfig: DashboardCard[] = [
    {
      title: 'Proyectos',
      description: 'Gestiona proyectos y seguimiento general.',
      icon: 'pi pi-briefcase',
      routerLink: '/proyectos',
      perms: ['Proyecto-Read', 'Proyecto-Create', 'Proyecto-Update']
    },
    {
      title: 'Estudiantes',
      description: 'Consulta y administra candidatos.',
      icon: 'pi pi-users',
      routerLink: '/estudiantes',
      perms: ['Estudiante-Read', 'Estudiante-Create', 'Estudiante-Update']
    },
    {
      title: 'Docentes',
      description: 'Administra asesores y perfiles docentes.',
      icon: 'pi pi-id-card',
      routerLink: '/docentes',
      perms: ['Docente-Read', 'Docente-Create', 'Docente-Update']
    },
    {
      title: 'Empresas',
      description: 'Consulta empresas vinculadas.',
      icon: 'pi pi-building',
      routerLink: '/empresas',
      perms: ['Empresa-Read', 'Empresa-Create', 'Empresa-Update']
    },
    {
      title: 'Seguimiento',
      description: 'Revisa el avance del proceso.',
      icon: 'pi pi-chart-line',
      routerLink: '/seguimiento',
      perms: ['Seguimiento-Read']
    },
    {
      title: 'Períodos Académicos',
      description: 'Consulta ciclos y convocatorias.',
      icon: 'pi pi-calendar',
      routerLink: '/periodos-academicos',
      perms: ['PeriodoAcademico-Read']
    },
    {
      title: 'Usuarios',
      description: 'Administra accesos y permisos.',
      icon: 'pi pi-shield',
      routerLink: '/usuarios',
      perms: ['Usuario-Read', 'Usuario-Create', 'Usuario-Update']
    },
    {
      title: 'Banco de Proyectos',
      description: 'Explora proyectos disponibles.',
      icon: 'pi pi-folder-open',
      routerLink: '/repositorio',
      perms: ['Repositorio-Read']
    },
    {
      title: 'Mis Proyectos',
      description: 'Accede a tus proyectos asignados.',
      icon: 'pi pi-book',
      routerLink: '/docente/proyectos',
      perms: ['DocenteProyecto-Read']
    },
    {
      title: 'Mi Perfil',
      description: 'Consulta tu información personal.',
      icon: 'pi pi-user',
      routerLink: '/perfil',
      perms: ['Perfil-Read']
    }
  ];

  constructor(
    private authService: AuthService,
    private usuariosSvc: UsuariosService,
    private estudiantesSvc: EstudiantesService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.saludo = this.obtenerSaludo();
    this.refreshDashboard();
    this.buscarPerfilPorIdUsuario(this.user.id)

    this.usuariosSvc.activePerms$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshDashboard();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get nombreMostrar(): string {
    const nombre = this.user?.nombre?.trim?.();
    const correo = this.user?.correo?.trim?.();
    return nombre || correo || 'Usuario';
  }

  private refreshDashboard(): void {
    const rol = this.usuariosSvc.getActiveRoleSync();
    this.rolActivo = rol?.descripcion || 'Sin rol seleccionado';

    this.visibleCards = this.cardsConfig.filter(card =>
      !card.perms?.length || this.usuariosSvc.hasAnyPermission(card.perms)
    );

    this.quickLinks = this.visibleCards.slice(0, 6);
  }

  private obtenerSaludo(): string {
    const hour = new Date().getHours();

    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  seguimientoHabilitado = false;

  private buscarPerfilPorIdUsuario(idUsuario: number) {
      forkJoin({
        est: this.estudiantesSvc.getByIdUsuario(idUsuario).pipe(catchError(() => of(false))),
      }).subscribe({
        next: ({ est }) => {
  
          // ✅ regla Seguimiento:
          // solo si existe estudiante y trae idProyecto (defensivo por si viene con otro casing)
          const idProyecto =
            (est as any)?.idProyecto ?? (est as any)?.idproyecto ?? null;
  
          this.seguimientoHabilitado = !!est && !!idProyecto && Number(idProyecto) > 0;
  
          this.cdr.detectChanges();
        },
        error: () => {
          this.seguimientoHabilitado = false;
        }
      });
    }
}