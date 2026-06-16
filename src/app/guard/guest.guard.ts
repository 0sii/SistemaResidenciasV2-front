import { Injectable } from '@angular/core';
import { CanActivate } from '@angular/router';
import { AuthService } from '../service/auth.service';

@Injectable({ providedIn: 'root' })
export class GuestGuard implements CanActivate {
  constructor(private auth: AuthService) { }

  canActivate(): boolean {
    // ✅ Siempre que entras a /login, se cierra sesión en ESA pestaña
    this.auth.logout();
    return true;
  }
}
