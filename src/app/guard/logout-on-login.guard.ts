import { Injectable } from '@angular/core';
import { CanActivate } from '@angular/router';
import { TokenService } from '../service/token.service';

@Injectable({ providedIn: 'root' })
export class LogoutOnLoginGuard implements CanActivate {
    constructor(private token: TokenService) { }

    canActivate(): boolean {
        // ✅ si traes sesión en ESTA pestaña, la borramos
        this.token.clearAll();
        return true;
    }
}
