import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { Docente, DocenteCreate, DocenteListItem } from '../Interface/InterfaceUsuario';

export interface DocenteCargaResumen {
  idDocente: number;
  idUsuario: number;
  correo: string;

  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;

  asesorInternoCount: number;
  revisorResidenciaCount: number;
  revisorAnteproyectoCount: number;
  totalActivos: number;
}

@Injectable({ providedIn: 'root' })
export class DocentesService {
  private http = inject(HttpClient);
  private base = `${environment.ConstantsService.apiUrl}/Docentes`;

  getAll(): Observable<DocenteListItem[]> {
    return this.http.get<DocenteListItem[]>(this.base);
  }

  getById(id: number): Observable<Docente> {
    return this.http.get<Docente>(`${this.base}/${id}`);
  }

  create(payload: DocenteCreate): Observable<Docente> {
    return this.http.post<Docente>(this.base, payload);
  }

  update(id: number, payload: DocenteCreate): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
  getByIdUsuario(idUsuario: number): Observable<any | false> {
    return this.http.get<any>(`${this.base}/idUsuario/${idUsuario}`);
  }

  getSuscripciones(idDocente: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${idDocente}/suscripciones`);
  }

  exists(correo?: string, rfc?: string): Observable<{ exists: boolean }> {
    const params: any = {};
    if (correo) params.correo = correo;
    if (rfc) params.rfc = rfc;
    return this.http.get<{ exists: boolean }>(`${this.base}/exists`, { params });
  }

  existsBulk(correos: string[], rfcs: string[]): Observable<{ correosExistentes: string[], rfcsExistentes: string[] }> {
    return this.http.post<{ correosExistentes: string[], rfcsExistentes: string[] }>(
      `${this.base}/exists-bulk`,
      { correos, rfcs }
    );
  }

  getCargasResumen(): Observable<DocenteCargaResumen[]> {
  return this.http.get<DocenteCargaResumen[]>(`${this.base}/cargas-resumen`);
}

}
