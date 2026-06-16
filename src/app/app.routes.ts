import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './modulos/login/login';
import { Dashboard } from './modulos/dashboard/dashboard';
import { AuthGuard } from './guard/auth.guard';
import { Candidadatos } from './modulos/candidatos/candidadatos/candidadatos';
import { ProyectosComponent } from './modulos/proyectos/proyectos/proyectos';
import { Empresas } from './modulos/empresas/empresas/empresas';
import { Docentes } from './modulos/docentes/docentes/docentes';
import { GuestGuard } from './guard/guest.guard';
import { EstudiantesService } from './service/estudiantes.service';
import { EditDocente } from './modulos/docentes/edit-docente/edit-docente';
import { EditProyectos } from './modulos/proyectos/edit-proyectos/edit-proyectos';
import { ChangePasswordComponent } from './modulos/change-password/change-password';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Usuarios } from './modulos/usuarios/usuarios';
import { RepositorioComponent } from './modulos/repositorio/repositorio';
import { PermissionGuard } from './guard/permission.guard';
import { Seguimiento } from './modulos/seguimiento/seguimiento';
import { Perfil } from './modulos/comunes/perfil/perfil';
import { PeriodoAcademico } from './modulos/periodo-academico/periodo-academico';
import { DocenteProyectoDashboard } from './modulos/docente-proyecto-dashboard/docente-proyecto-dashboard';
import { DocenteProyectoView } from './modulos/docente-proyecto-view/docente-proyecto-view';
import { LogoutOnLoginGuard } from './guard/logout-on-login.guard';
import { EgresadosComponent } from './modulos/egresados/egresados';
export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [GuestGuard] },


  { path: 'dashboard', component: Dashboard, canActivate: [AuthGuard] },

  { path: 'changePassword', component: ChangePasswordComponent },

  {
    path: 'proyectos',
    children: [
      {
        path: '',
        component: ProyectosComponent,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permiso: 'Proyecto-Read' }
      },
      {
        path: 'edit/:id',
        component: EditProyectos,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permiso: 'Proyecto-Update' }
      }
    ]
  },
  {
    path: 'empresas',
    children: [
      {
        path: '',
        component: Empresas,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permiso: 'Empresa-Read' }
      }
    ]
  },
  {
    path: 'periodos-academicos',
    component: PeriodoAcademico,
    canActivate: [AuthGuard, PermissionGuard],
    data: { permiso: 'PeriodoAcademico-Read' }
  },
  {
    path: 'docentes',
    component: Docentes,
    canActivate: [AuthGuard, PermissionGuard],
    data: { permiso: 'Docente-Read' }
  },

  {
    path: 'docente',
    children: [
      {
        path: 'proyectos',
        canActivate: [AuthGuard, PermissionGuard],
        data: { permiso: 'DocenteProyecto-Read' }, // ✅ consistente
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./modulos/docente-proyecto-dashboard/docente-proyecto-dashboard')
                .then(m => m.DocenteProyectoDashboard),
          },
          {
            path: ':idProyecto',
            loadComponent: () =>
              import('./modulos/docente-proyecto-view/docente-proyecto-view')
                .then(m => m.DocenteProyectoView),
          }
        ]
      }
    ]
  },


  {
    path: 'estudiantes',
    children: [
      {
        path: '',
        component: Candidadatos,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permiso: 'Estudiante-Read' }
      }
    ]
  },
  {
    path: 'usuarios',
    children: [
      {
        path: '',
        component: Usuarios,
        canActivate: [AuthGuard, PermissionGuard],
        // Si aún no tienes "Usuario-Read" en la tabla Permisos, puedes
        // dejar solo AuthGuard por ahora.
        data: { permiso: 'Usuario-Read' }
      }
    ]
  },
  {
    path: 'repositorio',
    component: RepositorioComponent,
    canActivate: [AuthGuard, PermissionGuard],
    data: { permiso: 'Repositorio-Read' } // o el que definas
  },
  {
    path: 'seguimiento',
    component: Seguimiento,
    canActivate: [AuthGuard, PermissionGuard],
    data: { permiso: 'Seguimiento-Read' } // o el que definas
  },
  {
    path: 'perfil',
    component: Perfil,
    canActivate: [AuthGuard, PermissionGuard],
    data: { permiso: 'Perfil-Read' } // o el que definas
  },
  {
    path: 'docente',
    children: [
      {
        path: 'proyectos',
        component: DocenteProyectoDashboard,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permiso: 'Proyecto-Read' } // permiso nuevo recomendado
      },
      {
        path: 'proyectos/:idProyecto',
        component: DocenteProyectoView,
        canActivate: [AuthGuard, PermissionGuard],
        data: { permiso: 'Proyecto-Read' }
      }
    ]
  },


  {
    path: 'egresados',
    component: EgresadosComponent,
    canActivate: [AuthGuard, PermissionGuard],
    data: { permiso: 'Egresado-Read' }
  },

  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' }
];




// app-routing.module.ts
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { onSameUrlNavigation: 'reload' }),
    Toast
  ],
  exports: [RouterModule,],
  providers: [MessageService]
})
export class AppRoutingModule { }