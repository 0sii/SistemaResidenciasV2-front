import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';
import { Observable, of, catchError, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private tokenKey = 'auth_token';
  private userKey = 'auth_user';
  private apiUrl = `${environment.ConstantsService.apiUrl}/Acceso`;

  // Fallback en memoria cuando no hay storage (SSR / tests)
  private memoryStore = new Map<string, string>();

  constructor(private http: HttpClient) { }

  // ✅ IMPORTANTE: sesión por pestaña (NO se comparte entre tabs)
  private get storage(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch {
      return null;
    }
  }

  private setItem(key: string, value: string): void {
    if (this.storage) this.storage.setItem(key, value);
    else this.memoryStore.set(key, value);
  }

  private getItem(key: string): string | null {
    if (this.storage) return this.storage.getItem(key);
    return this.memoryStore.has(key) ? (this.memoryStore.get(key) as string) : null;
  }

  private removeItem(key: string): void {
    if (this.storage) this.storage.removeItem(key);
    else this.memoryStore.delete(key);
  }

  setToken(token: string) { this.setItem(this.tokenKey, token); }
  getToken(): string | null { return this.getItem(this.tokenKey); }
  clearToken() { this.removeItem(this.tokenKey); }

  setUser(user: any) { this.setItem(this.userKey, JSON.stringify(user)); }
  getUser<T = any>(): T | null {
    const raw = this.getItem(this.userKey);
    if (!raw || raw === 'undefined') return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  clearUser() { this.removeItem(this.userKey); }

  clearAll() { this.clearToken(); this.clearUser(); }

  validarToken(token: string): Observable<boolean> {
    if (!token?.trim()) return of(false);
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    return this.http.get<boolean>(`${this.apiUrl}/ValidarToken`, { headers }).pipe(
      map(res => !!res),
      catchError(() => of(false))
    );
  }
}
