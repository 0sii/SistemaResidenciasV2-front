
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface PeriodoAcademicoDto {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;

  jefeDepartamentoNombre?: string | null;

  // opcional, si lo expones
  prefijoOficio?: string;
  consecutivoOficio?: number;
}

export interface PeriodoDocumentosConfigDto {
  jefeDepartamentoNombre?: string | null;
  jefeDepartamentoCargoLinea1?: string | null;
  jefeDepartamentoCargoLinea2?: string | null;

  prefijoOficio?: string | null;
  consecutivoOficioAsesor?: number | null;
  consecutivoOficioRevisor?: number | null;
}

@Injectable({ providedIn: 'root' })
export class PeriodosAcademicosService {
  private baseUrl = `${environment.ConstantsService.apiUrl}/PeriodosAcademicos`;

  constructor(private http: HttpClient) { }

  getAll(): Observable<PeriodoAcademicoDto[]> {
    return this.http.get<PeriodoAcademicoDto[]>(this.baseUrl);
  }

  getActivos(): Observable<PeriodoAcademicoDto[]> {
    return this.http.get<PeriodoAcademicoDto[]>(`${this.baseUrl}/Activos`);
  }

  create(data: {
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    activo: boolean;
    jefeDepartamentoNombre: string;
  }): Observable<PeriodoAcademicoDto> {
    return this.http.post<PeriodoAcademicoDto>(this.baseUrl, data);
  }

  update(periodoId: number, data: {
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    activo: boolean;
    jefeDepartamentoNombre: string;
    consecutivoOficio?: number | null; // ✅ opcional
  }): Observable<PeriodoAcademicoDto> {
    return this.http.put<PeriodoAcademicoDto>(`${this.baseUrl}/${periodoId}`, data);
  }

  // ====== Membrentado ======
  getMembrentadoMeta(periodoId: number) {
    return this.http.get<any>(`${this.baseUrl}/${periodoId}/membrentado/meta`);
  }

  uploadMembrentado(periodoId: number, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<any>(`${this.baseUrl}/${periodoId}/membrentado`, form);
  }

  downloadMembrentado(periodoId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${periodoId}/membrentado`, { responseType: 'blob' as 'blob' });
  }

  deleteMembrentado(periodoId: number) {
    return this.http.delete<any>(`${this.baseUrl}/${periodoId}/membrentado`);
  }

  // ====== PDFs/ZIP (los de siempre) ======
  generateConstanciaAceptacionReportePreliminar(idPeriodo: number, payload: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/${idPeriodo}/constancias/aceptacion-reporte-preliminar`, payload, { responseType: 'blob' as 'blob' });
  }

  oficioAsesorInterno(idPeriodo: number, payload: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/${idPeriodo}/constancias/oficio-asesor-interno`, payload, { responseType: 'blob' as 'blob' });
  }

  oficiosRevisores(idPeriodo: number, payload: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/${idPeriodo}/constancias/oficios-revisores`, payload, { responseType: 'blob' as 'blob' });
  }

  oficiosRevisoresFormatoFoto(idPeriodo: number, payload: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/${idPeriodo}/constancias/oficios-revisores-formato-foto`, payload, { responseType: 'blob' as 'blob' });
  }

  getPeriodoActual(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/Actual`);
  }

  zipConstanciasAceptacionReportePreliminar(idPeriodoAcademico: number, request: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/${idPeriodoAcademico}/constancias/aceptacion-reporte-preliminar/zip`, request, { responseType: 'blob' as 'blob' });
  }

  zipOficiosAsesorInterno(idPeriodoAcademico: number, request: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/${idPeriodoAcademico}/constancias/oficio-asesor-interno/zip`, request, { responseType: 'blob' as 'blob' });
  }

  zipOficiosRevisores(idPeriodoAcademico: number, request: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/${idPeriodoAcademico}/constancias/oficios-revisores/zip`, request, { responseType: 'blob' as 'blob' });
  }

  downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}