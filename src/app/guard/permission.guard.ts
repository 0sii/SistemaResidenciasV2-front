// src/app/guard/permission.guard.ts
import { Injectable } from '@angular/core';
import {
    CanActivate,
    ActivatedRouteSnapshot,
    RouterStateSnapshot,
    UrlTree,
    Router
} from '@angular/router';
import { UsuariosService } from '../service/usuarios.service';

@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {

    constructor(
        private usuariosSvc: UsuariosService,
        private router: Router
    ) { }

    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): boolean | UrlTree {

        const requiredPerm = route.data?.['permiso'] as string | undefined;

        // Si la ruta no define permiso, solo pasa AuthGuard
        if (!requiredPerm) {
            return true;
        }

        const allowed = this.usuariosSvc.hasPermission(requiredPerm);

        if (allowed) {
            return true;
        }

        // Aquí puedes mandar a /dashboard o a una página 403
        return this.router.createUrlTree(['/dashboard']);
    }
}
