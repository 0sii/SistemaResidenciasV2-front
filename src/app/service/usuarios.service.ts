import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, forkJoin, map, Observable, of } from 'rxjs';
import { environment } from '../environments/environment';
import {
  Catalogo,
  PasswordUpdateRequest,
  UserCreateRequest,
  UserSlim,
  UserUpdateRequest
} from '../Interface/InterfaceUsuario';
import { Usuario } from '../Interface/InterfaceUsuario';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private http = inject(HttpClient);
  private base = `${environment.ConstantsService.apiUrl}/Usuarios`;
  private rolesBase = `${environment.ConstantsService.apiUrl}/Roles`;
  private estudianteBase = `${environment.ConstantsService.apiUrl}/Estudiantes`

  // ======================================================================
  // API "nueva" (UserSlim) - si no la estás usando, la puedes ir retirando.
  // ======================================================================

  getAll(): Observable<UserSlim[]> {
    return this.http.get<UserSlim[]>(this.base);
  }

  getById(id: number): Observable<UserSlim> {
    return this.http.get<UserSlim>(`${this.base}/${id}`);
  }

  // GET /api/Usuarios/by-correo?correo=...
  getByCorreo(correo: string): Observable<UserSlim | false> {
    const params = new HttpParams().set('correo', correo);
    return this.http.get<UserSlim | false>(`${this.base}/by-correo`, { params });
  }

  create(payload: UserCreateRequest): Observable<UserSlim> {
    return this.http.post<UserSlim>(this.base, payload);
  }

  update(id: number, payload: UserUpdateRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}`, payload);
  }

  updatePassword(id: number, payload: PasswordUpdateRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}/password`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  // ======================================================================
  // Roles & permisos relacionados con usuario
  // ======================================================================

  // GET /api/Usuarios/Roles?idUsuario=1
  getRolesByUsuario(idUsuario: number): Observable<Catalogo[]> {
    const params = new HttpParams().set('idUsuario', idUsuario);
    return this.http.get<any>(`${this.base}/Roles`, { params }).pipe(
      map(res => (res === false || !res ? [] : (res as Catalogo[])))
    );
  }

  // GET /api/Usuarios/Permisos?idRol=1
  getPermisosByRol(idRol: number): Observable<Catalogo[]> {
    const params = new HttpParams().set('idRol', idRol);
    return this.http.get<any>(`${this.base}/Permisos`, { params }).pipe(
      map(res => (res === false || !res ? [] : (res as Catalogo[])))
    );
  }

  // fusiona permisos de varios roles (para mostrar en diálogo de usuario)
  getPermisosByRoles(idsRoles: number[]): Observable<Catalogo[]> {
    if (!idsRoles || idsRoles.length === 0) {
      return of([]);
    }

    const requests = idsRoles.map(idRol => this.getPermisosByRol(idRol));

    return forkJoin(requests).pipe(
      map(listas => {
        const mapa = new Map<number, Catalogo>();
        listas.forEach(lista => {
          lista.forEach(p => {
            if (!mapa.has(p.id)) {
              mapa.set(p.id, p);
            }
          });
        });
        return Array.from(mapa.values());
      })
    );
  }



  // ⚠️ IMPORTANTE: tu update de roles ahora recibe DTO, no int[]
  updateRolesUsuario(idUsuario: number, rolesIds: number[], noControl?: string) {
    const body = { rolesIds, noControl };
    return this.http.put(`${this.base}/${idUsuario}/Roles`, body);
  }


  // ======================================================================
  // Manejo de rol activo en el cliente (localStorage)
  // ======================================================================

  private activeRoleSubject = new BehaviorSubject<Catalogo | null>(this.loadActiveRoleFromStorage());
  activeRole$ = this.activeRoleSubject.asObservable();

  loadActiveRoleFromStorage(): Catalogo | null {
    // Soportamos tanto 'activeRole' como 'activeRol' por si tenías el viejo
    const data = localStorage.getItem('activeRole') ?? localStorage.getItem('activeRol');
    if (!data) return null;
    try {
      return JSON.parse(data) as Catalogo;
    } catch {
      return null;
    }
  }

  setActiveRole(rol: Catalogo | null): void {
    if (rol) {
      localStorage.setItem('activeRole', JSON.stringify(rol));
    } else {
      localStorage.removeItem('activeRole');
    }
    this.activeRoleSubject.next(rol);
  }

  getActiveRoleSync(): Catalogo | null {
    const raw = localStorage.getItem('activeRole');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Catalogo;
    } catch {
      return null;
    }
  }

  // ======================================================================
  // API "vieja" (Usuario completo) que usa tu componente de Usuarios
  // ======================================================================

  getUsuarios(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(this.base);
  }

  crearUsuario(usuario: Omit<Usuario, 'id'>): Observable<Usuario> {
    return this.http.post<Usuario>(this.base, usuario);
  }

  actualizarUsuario(id: number, usuario: Omit<Usuario, 'id'>): Observable<Usuario> {
    return this.http.put<Usuario>(`${this.base}/${id}`, usuario);
  }

  eliminarUsuario(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  // ======================================================================
  // Catálogo de roles  (usa /api/Roles)
  // ======================================================================

  getAllRoles(): Observable<Catalogo[]> {
    return this.http.get<Catalogo[]>(this.rolesBase);
  }

  // Si vas a crear/editar roles desde la UI:
  // POST /api/Roles
  createRol(payload: Omit<Catalogo, 'id'>): Observable<Catalogo> {
    return this.http.post<Catalogo>(this.rolesBase, payload);
  }

  // PUT /api/Roles/{id}
  updateRol(id: number, payload: Omit<Catalogo, 'id'>): Observable<Catalogo> {
    return this.http.put<Catalogo>(`${this.rolesBase}/${id}`, payload);
  }

  // DELETE /api/Roles/{id}
  deleteRol(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rolesBase}/${id}`);
  }

  // ======================================================================
  // Catálogo de permisos (nuevo) - /api/Usuarios/PermisosCatalogo
  // ======================================================================

  getAllPermisos(): Observable<Catalogo[]> {
    return this.http.get<Catalogo[]>(`${this.base}/PermisosCatalogo`);
  }

  // ======================================================================
  // guardar los PERMISOS de un rol - /api/Usuarios/Roles/{idRol}/Permisos
  // ======================================================================

  updatePermisosRol(idRol: number, permisosIds: number[]): Observable<void> {
    return this.http.put<void>(`${this.base}/Roles/${idRol}/Permisos`, permisosIds);
  }

  deshabilitarRol(rol: Catalogo): Observable<void> {
    const payload: Omit<Catalogo, 'id'> = {
      descripcion: rol.descripcion,
      activo: false
    };

    return this.http.put<void>(`${this.rolesBase}/${rol.id}`, payload);
  }

  // ======================================================================
  // Permisos activos del rol seleccionado (cliente)
  // ======================================================================

  private activePermsSubject = new BehaviorSubject<string[]>(this.loadActivePermsFromStorage());
  activePerms$ = this.activePermsSubject.asObservable();

  private loadActivePermsFromStorage(): string[] {
    const raw = localStorage.getItem('activePerms');
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x: any) => String(x ?? '').trim().toLowerCase())
        .filter(Boolean);
    } catch {
      return [];
    }
  }


  /**
   * Recibe un arreglo de Catalogo (Permisos) y guarda sus descripciones
   * ("Estudiante-Read", etc.) como permisos activos del rol.
   */
  setActivePermsFromCatalogo(permisos: Catalogo[]): void {
    const codes = (permisos || [])
      .filter(p => p?.activo !== false) // por si el API manda permisos inactivos
      .map(p => String(p.descripcion ?? '').trim().toLowerCase())
      .filter(Boolean);

    localStorage.setItem('activePerms', JSON.stringify(codes));
    this.activePermsSubject.next(codes);
  }


  clearActivePerms(): void {
    localStorage.removeItem('activePerms');
    this.activePermsSubject.next([]);
  }

  hasPermission(code: string): boolean {
    const c = String(code ?? '').trim().toLowerCase();
    if (!c) return false;
    return this.activePermsSubject.value.includes(c);
  }


  hasAnyPermission(codes: string[]): boolean {
    if (!codes || !codes.length) return true;

    const wanted = codes
      .map(c => String(c ?? '').trim().toLowerCase())
      .filter(Boolean);

    const current = this.activePermsSubject.value;
    return wanted.some(c => current.includes(c));
  }


  // Helper con tipado bonito para usar en componentes
  hasPerm(
    recurso: 'Estudiante' | 'Docente' | 'Empresa' | 'Proyecto' | 'Usuario' | 'Repositorio' | 'Seguimiento' | 'Perfil',
    accion: 'Read' | 'Create' | 'Update' | 'Select' | 'Sustituir'
  ): boolean {
    return this.hasPermission(`${recurso}-${accion}`);
  }


  existeNoControlEstudiante(noControl: string) {
    return this.http.get(`${this.estudianteBase}/existe-nocontrol`, {
      params: { noControl }
    });
  }

  getEstudianteByIdUsuario(idUsuario: number) {
    return this.http.get(`${this.estudianteBase}/idUsuario/${idUsuario}`);
  }

puedeSerEstudiante(correo: string): Observable<{ puedeSerEstudiante: boolean; motivo: string }> {
  return this.http.get<any>(`${this.base}/puede-ser-estudiante`, {
    params: { correo }
  });
}

puedeSerDocente(correo: string): Observable<{ puedeSerDocente: boolean; motivo: string }> {
  return this.http.get<any>(`${this.base}/puede-ser-docente`, {
    params: { correo }
  });
}


}
