import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface EgresadoDto {
  idEstudiante: number;
  nombreCompleto: string;
  noControl: string | null;
  correoPersonal: string | null;
  telefono: string | null;
  idProyecto: number;
  tituloProyecto: string | null;
  descripcionProyecto: string | null;
  asesor: string | null;
  revisor: string | null;
  periodo: string | null;
  carrera: string | null;
  empresa: string | null;
  empresaCorreo: string | null;
  empresaTelefono: string | null;
  empresaDireccion: string | null;
  modalidad: string | null;
}

export interface EgresadosResponse {
  total: number;
  page: number;
  pageSize: number;
  items: EgresadoDto[];
}

@Injectable({ providedIn: 'root' })
export class EgresadosService {
  private http = inject(HttpClient);
  private base = `${environment.ConstantsService.apiUrl}/Egresados`;

  getEgresados(
    search: string = '',
    page: number = 1,
    pageSize: number = 20,
    idPeriodo?: number | null
  ): Observable<EgresadosResponse> {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);

    if (search.trim()) params = params.set('search', search.trim());
    if (idPeriodo)     params = params.set('idPeriodo', idPeriodo);

    return this.http.get<EgresadosResponse>(this.base, { params });
  }
}
