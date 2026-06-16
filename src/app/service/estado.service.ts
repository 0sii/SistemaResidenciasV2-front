// src/app/service/estados.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';
import { Catalogo } from '../Interface/InterfaceUsuario';

export interface EstadosPagedResponse {
    total: number;
    page: number;
    pageSize: number;
    items: Catalogo[];
}

@Injectable({ providedIn: 'root' })
export class EstadosService {
    private http = inject(HttpClient);
    private base = `${environment.ConstantsService.apiUrl}/Estados`;

    /**
     * GET: api/Estados?soloActivos=true&search=...&page=1&pageSize=50
     */
    getAll(
        options?: {
            soloActivos?: boolean;
            search?: string;
            page?: number;
            pageSize?: number;
        }
    ): Observable<EstadosPagedResponse> {
        let params = new HttpParams();

        if (options?.soloActivos !== undefined) {
            params = params.set('soloActivos', options.soloActivos);
        }
        if (options?.search) {
            params = params.set('search', options.search);
        }
        if (options?.page) {
            params = params.set('page', options.page);
        }
        if (options?.pageSize) {
            params = params.set('pageSize', options.pageSize);
        }

        return this.http.get<EstadosPagedResponse>(this.base, { params });
    }

    /**
     * Atajo para obtener solo los estados activos (sin preocuparse de paginación)
     */
    getActivos(max: number = 200): Observable<Catalogo[]> {
        return this.getAll({ soloActivos: true, page: 1, pageSize: max }).pipe(
            map(res => res.items ?? [])
        );
    }

    // CRUD básico por si lo necesitas en una pantalla de administración de estados

    getById(id: number): Observable<Catalogo> {
        return this.http.get<Catalogo>(`${this.base}/${id}`);
    }

    create(body: Catalogo): Observable<Catalogo> {
        return this.http.post<Catalogo>(this.base, body);
    }

    update(id: number, body: Catalogo): Observable<void> {
        return this.http.put<void>(`${this.base}/${id}`, body);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.base}/${id}`);
    }
}
