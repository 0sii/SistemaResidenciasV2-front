import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { EstudianteCreate, EstudianteDetail, EstudianteListItem } from '../Interface/InterfaceUsuario';

@Injectable({ providedIn: 'root' })
export class EstudiantesService {
  private http = inject(HttpClient);
  private base = `${environment.ConstantsService.apiUrl}/Estudiantes`;

  // ✅ estado reactivo + persistente (por si recargas)
  private readonly LS_KEY = 'seguimiento_enabled';
  private seguimientoEnabledSubject = new BehaviorSubject<boolean>(this.readSeguimientoLS());

  private readSeguimientoLS(): boolean {
    return localStorage.getItem(this.LS_KEY) === '1';
  }
  private writeSeguimientoLS(v: boolean) {
    localStorage.setItem(this.LS_KEY, v ? '1' : '0');
  }



  resetSeguimientoHabilitado() {
    this.writeSeguimientoLS(false);
    this.seguimientoEnabledSubject.next(false);
  }


  // ---------------- CRUD ----------------
  getAll(): Observable<EstudianteListItem[]> {
    return this.http.get<EstudianteListItem[]>(this.base);
  }

  getById(id: number): Observable<EstudianteDetail> {
    return this.http.get<EstudianteDetail>(`${this.base}/${id}`);
  }

  create(payload: EstudianteCreate): Observable<EstudianteCreate> {
    return this.http.post<EstudianteCreate>(this.base, payload);
  }

  update(id: number, payload: EstudianteCreate): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  getByNoControl(noControl: string): Observable<any | false> {
    return this.http.get<any | false>(`${this.base}/noControl/${encodeURIComponent(noControl)}`);
  }

  getByIdUsuario(idUsuario: number): Observable<any | false> {
    return this.http.get<any | false>(`${this.base}/idUsuario/${idUsuario}`);
  }

  getByProyecto(idProyecto: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/proyecto/${idProyecto}`);
  }



  // ---------------- Helper ----------------
  private tieneProyectoAsignado(est: any | false): boolean {
    if (!est) return false;
    const raw =
      est?.idProyecto ??
      est?.idproyecto ??
      est?.IdProyecto ??
      null;

    const idProyecto = Number(raw ?? 0);
    return Number.isFinite(idProyecto) && idProyecto > 0;
  }

  private seguimientoEnabled$ = new BehaviorSubject<boolean>(false);
  seguimientoHabilitado$ = this.seguimientoEnabled$.asObservable();

  setSeguimientoHabilitado(value: boolean) {
    this.seguimientoEnabled$.next(!!value);
  }

  /** Recalcula desde API si el estudiante del usuario tiene idProyecto asignado */
  refreshSeguimientoByUsuario$(idUsuario: number) {
    return this.getByIdUsuario(idUsuario).pipe(
      map((est: any) => {
        const idProyecto = Number(est?.idProyecto ?? est?.idproyecto ?? 0);
        return idProyecto > 0;
      }),
      tap(flag => this.seguimientoEnabled$.next(flag)),
      catchError(() => {
        this.seguimientoEnabled$.next(false);
        return of(false);
      })
    );
  }

  existsBulk(payload: { noControles: string[]; correos: string[] }) {
    return this.http.post<{
      noControlesExistentes: string[];
      correosExistentes: string[];
    }>(`${this.base}/exists-bulk`, payload);
  }

  getLibres(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/libres`);
  }

}
