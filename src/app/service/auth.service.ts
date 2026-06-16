import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { LoginRequest, LoginResponse, User } from '../Interface/InterfaceLogin';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private baseUrl = `${environment.ConstantsService.apiUrl}`;

  constructor(
    private http: HttpClient,
    private token: TokenService,
  ) { }

  login(req: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/Acceso/Login`, req).pipe(
      map(res => {
        if (!res?.token || !res?.user) throw new Error('Respuesta inválida');

        // ✅ Sesión por pestaña (TokenService ya usa sessionStorage)
        this.token.setToken(res.token);
        this.token.setUser(res.user);

        return res;
      })
    );
  }

  logout(navigateToLogin: boolean = true): void {
    // ✅ Limpia todo (por si quedó algo viejo en localStorage)
    this.token.clearAll();
    try { localStorage.removeItem('auth_token'); } catch { }
    try { localStorage.removeItem('auth_user'); } catch { }

  }

  getUser(): User | null { return this.token.getUser<User>(); }
  getToken(): string | null { return this.token.getToken(); }

  // Helpers JWT
  private decode<T = any>(token: string): T | null {
    try {
      const payload = token.split('.')[1];
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json) as T;
    } catch { return null; }
  }

  isTokenExpired(token: string): boolean {
    const payload = this.decode<{ exp?: number }>(token);
    if (!payload?.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    return !!token && !this.isTokenExpired(token);
  }

  // Helpers
  currentUserEmail(): string { try { const raw = localStorage.getItem('auth_user'); return raw ? (JSON.parse(raw).email ?? '') : ''; } catch { return ''; } }

  // Solicitar el código OTP para cambiar la contraseña
  requestOtp(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/Acceso/password/request-change`, { email });
  }

  // Validar el código OTP y cambiar la contraseña
  verifyOtpAndChangePassword(otpId: string, code: string, newPassword: string, email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/Acceso/password/verify-and-change`, {
      otpId,
      code,
      newPassword,
      email
    });
  }
}
