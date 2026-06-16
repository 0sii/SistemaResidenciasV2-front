import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { Catalogo } from '../Interface/InterfaceUsuario';

@Injectable({ providedIn: 'root' })
export class CatalogosService {

    // Carreras
    private baseUrl = `${environment.ConstantsService.apiUrl}/carreras`;

    // Dependencias médicas
    private baseUrlDependenciaMedica = `${environment.ConstantsService.apiUrl}/dependenciasMedicas`;

    // Modalidades
    private baseUrlModalidad = `${environment.ConstantsService.apiUrl}/Modalidades`;

    // ⭐ Especializaciones (AJUSTA la ruta según tu API: "especializaciones", "Especializaciones", etc.)
    private baseUrlEspecializacion = `${environment.ConstantsService.apiUrl}/especializaciones`;

    constructor(private http: HttpClient) { }

    // ===================== CARRERA (bloque 1) =====================

    getAllCarrera(): Observable<Catalogo[]> {
        return this.http.get<Catalogo[]>(this.baseUrl);
    }

    getByIdCarrera(id: number): Observable<Catalogo> {
        return this.http.get<Catalogo>(`${this.baseUrl}/${id}`);
    }

    createCarrera(carrera: Partial<Catalogo>): Observable<Catalogo> {
        return this.http.post<Catalogo>(this.baseUrl, carrera);
    }

    updateCarrera(id: number, carrera: Partial<Catalogo>): Observable<void> {
        return this.http.put<void>(`${this.baseUrl}/${id}`, carrera);
    }

    deleteCarrera(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/${id}`);
    }

    // ===================== DEPENDENCIA MÉDICA =====================

    getAllDependenciaMedica(): Observable<Catalogo[]> {
        return this.http.get<Catalogo[]>(this.baseUrlDependenciaMedica);
    }

    getActivasDependenciaMedica(): Observable<Catalogo[]> {
        return this.http.get<Catalogo[]>(`${this.baseUrlDependenciaMedica}/activas`);
    }

    getByIdDependenciaMedica(id: number): Observable<Catalogo> {
        return this.http.get<Catalogo>(`${this.baseUrlDependenciaMedica}/${id}`);
    }

    createDependenciaMedica(dep: Partial<Catalogo>): Observable<Catalogo> {
        return this.http.post<Catalogo>(this.baseUrlDependenciaMedica, dep);
    }

    updateDependenciaMedica(id: number, dep: Partial<Catalogo>): Observable<void> {
        return this.http.put<void>(`${this.baseUrlDependenciaMedica}/${id}`, dep);
    }

    deleteDependenciaMedica(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrlDependenciaMedica}/${id}`);
    }

    // ===================== CARRERAS (bloque 2 genérico) =====================
    // OJO: estos son básicamente aliases del bloque de arriba.
    // Si ya los usas en otros componentes, los dejamos.

    getAll(): Observable<Catalogo[]> {
        return this.http.get<Catalogo[]>(this.baseUrl);
    }

    getById(id: number): Observable<Catalogo> {
        return this.http.get<Catalogo>(`${this.baseUrl}/${id}`);
    }

    create(carrera: Omit<Catalogo, 'id'>): Observable<Catalogo> {
        return this.http.post<Catalogo>(this.baseUrl, carrera);
    }

    update(id: number, carrera: Catalogo): Observable<void> {
        return this.http.put<void>(`${this.baseUrl}/${id}`, carrera);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/${id}`);
    }

    // ===================== MODALIDAD =====================

    getAllModalidad(): Observable<Catalogo[]> {
        return this.http.get<Catalogo[]>(this.baseUrlModalidad);
    }

    getActivasModalidad(): Observable<Catalogo[]> {
        return this.http.get<Catalogo[]>(`${this.baseUrlModalidad}/activas`);
    }

    getByIdModalidad(id: number): Observable<Catalogo> {
        return this.http.get<Catalogo>(`${this.baseUrlModalidad}/${id}`);
    }

    createModalidad(body: Omit<Catalogo, 'id'>): Observable<Catalogo> {
        return this.http.post<Catalogo>(this.baseUrlModalidad, body);
    }

    updateModalidad(id: number, body: Catalogo): Observable<void> {
        return this.http.put<void>(`${this.baseUrlModalidad}/${id}`, body);
    }

    deleteModalidad(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrlModalidad}/${id}`);
    }

    // ===================== ⭐ ESPECIALIZACIÓN =====================

    // GET: api/Especializaciones
    getAllEspecializacion(): Observable<Catalogo[]> {
        return this.http.get<Catalogo[]>(this.baseUrlEspecializacion);
    }

    // GET: api/Especializaciones/activas
    getActivasEspecializacion(): Observable<Catalogo[]> {
        return this.http.get<Catalogo[]>(`${this.baseUrlEspecializacion}/activas`);
    }

    // GET: api/Especializaciones/{id}
    getByIdEspecializacion(id: number): Observable<Catalogo> {
        return this.http.get<Catalogo>(`${this.baseUrlEspecializacion}/${id}`);
    }

    // POST: api/Especializaciones
    createEspecializacion(body: Omit<Catalogo, 'id'>): Observable<Catalogo> {
        return this.http.post<Catalogo>(this.baseUrlEspecializacion, body);
    }

    // PUT: api/Especializaciones/{id}
    updateEspecializacion(id: number, body: Catalogo): Observable<void> {
        return this.http.put<void>(`${this.baseUrlEspecializacion}/${id}`, body);
    }

    // DELETE: api/Especializaciones/{id}
    deleteEspecializacion(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrlEspecializacion}/${id}`);
    }
}
