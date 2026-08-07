import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';
import { environment } from '../environments/environment';
import { Proyecto } from '../Interface/InterfaceProyecto';
import { ProyectoBanco } from '../Interface/InterfaceProyecto';

export interface DocenteProyectoDashboardItem {
  idProyecto: number;

  titulo: string | null;
  descripcion: string | null;

  idTipoRelacion: number;
  tipoRelacionClave: string;
  tipoRelacionDescripcion: string;

  fechaInscripcion: string; // el backend manda DateOnly -> llega como "YYYY-MM-DD"

  estadoId: number | null;
  estadoDescripcion: string; // "Sin estado" si null en backend
}

export interface IntegranteProyectoDto {
  id: number;
  idUsuario: number;
  idProyecto?: number | null;

  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;

  noControl?: string | null;
  correo?: string | null;

  idcarrera?: number | null;
  carreraId?: number | null;
  carreraNombre?: string | null;

  domicilio?: string | null;
  ciudad?: string | null;
  cp?: string | null;
  idestado?: number | null;
  correoPersonal?: string | null;
  noSeguroSocial?: string | null;
  idDependenciaMedica?: number | null;
  telefonoCelular?: string | null;
  idContactoEmergencia?: number | null;
}

export interface ProyectoDocumentoMetaDto {
  exists: boolean;
  id?: number;
  nombreOriginal?: string;
  contentType?: string;
  tamanoBytes?: number;
  fechaSubida?: string; // ISO
}

/** Forma exacta que devuelve GET /api/Proyectos/disponibles-para-asignacion */
export interface ProyectoDisponibleItem {
  id: number;
  titulo: string | null;
  descripcion: string | null;
  idEstado: number | null;
  idPeriodoAcademico: number | null;
  periodoNombre: string | null;
  docentesAsignados: number;
  yoSoyElAsignado: boolean;
}

export interface DisponiblesParaAsignacionResponse {
  yaAlcanceLimite: boolean;
  proyectoElegidoId: number | null;
  rolElegido: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO' | null;
  limitePorDocente: number;      // cuántos proyectos puede tomar cada docente
  proyectos: ProyectoDisponibleItem[];
}


@Injectable({ providedIn: 'root' })
export class ProyectosService {
  private baseUrl = `${environment.ConstantsService.apiUrl}/proyectos`;
  private entregablesUrl = `${environment.ConstantsService.apiUrl}/entregables`;

  constructor(private http: HttpClient) { }

  // CRUD
  getAll(): Observable<Proyecto[]> {
    return this.http.get<Proyecto[]>(this.baseUrl);
  }

  getById(id: number): Observable<Proyecto> {
    return this.http.get<Proyecto>(`${this.baseUrl}/${id}`);
  }

  create(proyecto: any): Observable<any> {
    return this.http.post<any>(this.baseUrl, proyecto);
  }

  update(id: number, proyecto: Proyecto): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}`, proyecto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // ✅ Banco (proyectos + registrados)
  getBanco(): Observable<ProyectoBanco[]> {
    return this.http.get<ProyectoBanco[]>(`${this.baseUrl}/Banco`);
  }

  // ✅ Crear propuesta alumno (con empresa obligatoria)
  crearPropuesta(payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/Propuesta`, payload);
  }

  // ✅ Unirse a un proyecto
  unirse(idProyecto: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${idProyecto}/Unirse`, {});
  }

  // ✅ Asignar revisor
  asignarRevisor(idProyecto: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${idProyecto}/AsignarRevisor`, {});
  }

  // ✅ Asignar asesor
  asignarAsesor(idProyecto: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${idProyecto}/AsignarAsesor`, {});
  }

  // POST /api/Proyectos/{idProyecto}/Invitaciones
  crearInvitaciones(idProyecto: number, invitados: { idEstudianteInvitado: number }[]) {
    return this.http.post<any>(`${this.baseUrl}/${idProyecto}/Invitaciones`, invitados);
  }

  // GET /api/Proyectos/Invitaciones/Mias?estado=PENDIENTE
  misInvitaciones(estado: string = 'PENDIENTE') {
    return this.http.get<any[]>(`${this.baseUrl}/Invitaciones/Mias`, {
      params: { estado }
    });
  }

  // POST /api/Proyectos/Invitaciones/{idInv}/Responder
  responderInvitacion(idInv: number, accion: 'ACEPTAR' | 'RECHAZAR') {
    return this.http.post<any>(`${this.baseUrl}/Invitaciones/${idInv}/Responder`, { accion });
  }

  misInvitacionesEnviadas(idProyecto: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/${idProyecto}/Invitaciones/Enviadas`);
  }

  esLider(idProyecto: number): Observable<{ idProyecto: number; esLider: boolean; idEstudianteCreador?: number | null }> {
    return this.http.get<{ idProyecto: number; esLider: boolean; idEstudianteCreador?: number | null }>(
      `${this.baseUrl}/${idProyecto}/EsLider`
    );
  }

  getByIds(ids: number[]): Observable<Proyecto[]> {
    const unique = Array.from(new Set((ids ?? []).map(n => Number(n)).filter(n => n > 0)));
    if (!unique.length) return of([]);

    return forkJoin(
      unique.map(id =>
        this.getById(id).pipe(catchError(() => of(null as any)))
      )
    ).pipe(
      map(rows => rows.filter(Boolean))
    );
  }

  misProyectosDashboard(idDocente: number) {
    return this.http.get<DocenteProyectoDashboardItem[]>(
      `${this.baseUrl}/${idDocente}/proyectos-asignados`
    );
  }

  asignarDocenteRelacion(idProyecto: number, body: { idDocente: number; tipoClave: string }) {
    return this.http.post<any>(`${this.baseUrl}/${idProyecto}/Docentes/Asignar`, body);
  }

  getDocenteRelacion(idProyecto: number, tipoClave: string) {
    return this.http.get<any>(`${this.baseUrl}/${idProyecto}/Docentes/Relacion`, {
      params: { tipoClave }
    });
  }

  quitarDocenteRelacion(idProyecto: number, tipoClave: string) {
    return this.http.delete<any>(`${this.baseUrl}/${idProyecto}/Docentes/Relacion`, {
      params: { tipoClave }
    });
  }

  getIntegrantes(idProyecto: number) {
    return this.http.get<any[]>(`${this.baseUrl}/${idProyecto}/Integrantes`);
  }

  aceptarProyecto(idProyecto: number) {
    const url = `${environment.ConstantsService.apiUrl}/entregables/${idProyecto}/Aceptar`;
    return this.http.post<any>(url, {});
  }

  descargarAceptacionAnteproyecto(idProyecto: number) {
    const url = `${environment.ConstantsService.apiUrl}/entregables/${idProyecto}/Aceptacion/Descargar`;
    return this.http.get(url, { responseType: 'blob' });
  }

  cancelarProyecto(idProyecto: number) {
    const url = `${environment.ConstantsService.apiUrl}/entregables/${idProyecto}/Cancelar`;
    return this.http.post<any>(url, {});
  }

  getProyectoParaUpdate(idProyecto: number): Observable<any> {
    return this.getAll().pipe(
      map((rows: any[]) => {
        const proyecto = (rows ?? []).find(p => Number(p?.id ?? p?.Id ?? 0) === Number(idProyecto));
        return proyecto ?? null;
      }),
      switchMap((proyecto) => {
        if (!proyecto) {
          return throwError(() => new Error(`No se encontró el proyecto ${idProyecto}.`));
        }
        return of(proyecto);
      })
    );
  }

  finalizarProyecto(idProyecto: number, idEstadoFinalizado: number): Observable<void> {
    return this.getProyectoParaUpdate(idProyecto).pipe(
      map((p: any) => ({
        Id: Number(p?.id ?? p?.Id ?? idProyecto),
        Titulo: p?.titulo ?? p?.Titulo ?? '',
        Descripcion: p?.descripcion ?? p?.Descripcion ?? '',
        Objetivo: p?.objetivo ?? p?.Objetivo ?? '',
        NoResidentes: Number(p?.noResidentes ?? p?.NoResidentes ?? 0),
        HorarioInicio: p?.horarioInicio ?? p?.HorarioInicio ?? null,
        HorarioFinal: p?.horarioFinal ?? p?.HorarioFinal ?? null,
        idModalidad: p?.idModalidad ?? p?.IdModalidad ?? null,
        idEspecializcion: p?.idEspecializcion ?? p?.IdEspecializcion ?? null,
        idEstado: idEstadoFinalizado,
        IdEmpresa: Number(p?.idEmpresa ?? p?.IdEmpresa ?? 0),
        IdPeriodoAcademico: Number(p?.idPeriodoAcademico ?? p?.IdPeriodoAcademico ?? 0),
        PropuestaAlumno: Boolean(p?.propuestaAlumno ?? p?.PropuestaAlumno),
        IdEstudianteCreador: p?.idEstudianteCreador ?? p?.IdEstudianteCreador ?? null
      })),
      switchMap((payload) => this.update(idProyecto, payload as any))
    );
  }

  getDocentesRelacion(idProyecto: number, tipoClave: string) {
    return this.http.get<any[]>(`${this.baseUrl}/${idProyecto}/Docentes/Relaciones`, {
      params: { tipoClave }
    });
  }

  quitarDocenteRelacionPorDocente(idProyecto: number, tipoClave: string, idDocente: number) {
    return this.http.delete<any>(`${this.baseUrl}/${idProyecto}/Docentes/Relacion`, {
      params: { tipoClave, idDocente }
    });
  }

  // ✅ GET meta
  getDocumentoMeta(idProyecto: number): Observable<ProyectoDocumentoMetaDto> {
    return this.http.get<ProyectoDocumentoMetaDto>(
      `${this.baseUrl}/${idProyecto}/Documento/Meta`
    );
  }

  // ✅ POST upload (multipart)
  uploadDocumento(idProyecto: number, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(
      `${this.baseUrl}/${idProyecto}/Documento`,
      fd
    );
  }

  // ✅ GET download
  downloadDocumento(idProyecto: number): Observable<Blob> {
    return this.http.get(
      `${this.baseUrl}/${idProyecto}/Documento/Download`,
      { responseType: 'blob' as 'blob' }
    );
  }

  // ✅ DELETE
  deleteDocumento(idProyecto: number): Observable<any> {
    return this.http.delete(
      `${this.baseUrl}/${idProyecto}/Documento`
    );
  }

  agregarIntegrante(idProyecto: number, idEstudiante: number) {
    return this.http.post<any>(`${this.baseUrl}/${idProyecto}/Integrantes/Agregar`, {
      idEstudiante
    });
  }

  quitarIntegrante(idProyecto: number, idEstudiante: number) {
    return this.http.delete<any>(`${this.baseUrl}/${idProyecto}/Integrantes/Quitar/${idEstudiante}`);
  }

  salirseDelProyecto(idProyecto: number) {
    return this.http.post<any>(`${this.baseUrl}/${idProyecto}/Salir`, {});
  }

  /**
   * Proyectos en estado 3 o 6 disponibles para auto-asignación.
   * El backend devuelve un OBJETO con { yaAlcanceLimite, proyectoElegidoId, rolElegido, proyectos },
   * NO un array directo.
   */
  getProyectosDisponiblesParaAsignacion(): Observable<DisponiblesParaAsignacionResponse> {
    return this.http.get<DisponiblesParaAsignacionResponse>(
      `${this.baseUrl}/disponibles-para-asignacion`
    );
  }

  /**
   * El docente logueado se asigna como asesor o revisor del proyecto
   * y recibe el oficio PDF generado automáticamente.
   * Usa observe: 'response' para acceder a headers (Content-Disposition)
   * y responseType: 'blob' para recibir el PDF binario.
   * Si el backend devuelve JSON (sin PDF), el error handler en el componente
   * lo lee con FileReader.
   */
  autoAsignarme(idProyecto: number, tipoClave: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO'): Observable<HttpResponse<Blob>> {
    // HttpClient overload typings make `responseType: 'blob'` incompatible with some generics.
    // Use a cast to satisfy the compiler and return the full HttpResponse<Blob>.
    return this.http.post(
      `${this.baseUrl}/${idProyecto}/autoasignarme`,
      { tipoClave },
      {
        headers: new HttpHeaders({ Accept: 'application/pdf' }),
        // cast to 'json' to match overload signature, then cast result to Observable<HttpResponse<Blob>>
        responseType: 'blob' as 'json',
        observe: 'response' as 'response'
      }
    ) as Observable<HttpResponse<Blob>>;
  }

  /**
   * Oficio consolidado del docente logueado: junta TODOS sus proyectos
   * vigentes para un rol (tipoClave) en un solo PDF.
   * Pega a GET /Oficios/Regenerar (auto-servicio; el backend identifica
   * al docente por el usuario autenticado, no acepta idDocente).
   */
  regenerarMiOficioConsolidado(
    tipoClave: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO' | 'REVISOR_RESIDENCIA'
  ): Observable<HttpResponse<Blob>> {
    const params = new HttpParams().set('tipoClave', tipoClave);

    return this.http.get(
      `${this.baseUrl}/Oficios/Regenerar`,
      {
        params,
        headers: new HttpHeaders({ Accept: 'application/pdf' }),
        responseType: 'blob' as 'json',
        observe: 'response' as 'response'
      }
    ) as Observable<HttpResponse<Blob>>;
  }

  /**
   * Oficio consolidado de CUALQUIER docente (uso del panel de la jefa de
   * vinculación). Pega a GET /Oficios/RegenerarDeDocente?idDocente=&tipoClave=.
   */
  regenerarOficioConsolidadoDeDocente(
    tipoClave: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO' | 'REVISOR_RESIDENCIA',
    idDocente: number
  ): Observable<HttpResponse<Blob>> {
    const params = new HttpParams()
      .set('tipoClave', tipoClave)
      .set('idDocente', idDocente);

    return this.http.get(
      `${this.baseUrl}/Oficios/RegenerarDeDocente`,
      {
        params,
        headers: new HttpHeaders({ Accept: 'application/pdf' }),
        responseType: 'blob' as 'json',
        observe: 'response' as 'response'
      }
    ) as Observable<HttpResponse<Blob>>;
  }

  /**
   * Lista de docentes con al menos un proyecto asignado en ese rol,
   * junto con el conteo de proyectos. Usado en el panel de la jefa de
   * vinculación para saber a quién generarle el oficio consolidado.
   */
  docentesConAsignacion(
    tipoClave: 'ASESOR_INTERNO' | 'REVISOR_ANTEPROYECTO' | 'REVISOR_RESIDENCIA'
  ): Observable<Array<{ idDocente: number; nombre: string; numProyectos: number }>> {
    return this.http.get<Array<{ idDocente: number; nombre: string; numProyectos: number }>>(
      `${this.baseUrl}/Oficios/PendientesPorDocente`,
      { params: new HttpParams().set('tipoClave', tipoClave) }
    );
  }

  actualizarEstadoProyecto(idProyecto: number, idEstado: number): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${idProyecto}`, {
      id: idProyecto,
      idEstado
    } as any);
  }

  /** El revisor de anteproyecto marca que terminó su revisión.
   *  Estado 4 → 5 (Anteproyecto Revisado) → 6 (En Espera de Asesor Interno) */
  marcarRevisionCompletada(idProyecto: number): Observable<{ ok: boolean; estadoNuevo: number; mensaje: string }> {
    return this.http.post<any>(`${this.baseUrl}/${idProyecto}/MarcarRevisionCompletada`, {});
  }
  // En proyectos.service.ts — agregar este método:
  sustituirDocente(
    idProyecto: number,
    body: { tipoClave: string; idDocenteSale: number; idDocenteEntra: number; motivo?: string }
  ) {
    return this.http.post<any>(`${this.baseUrl}/${idProyecto}/Docentes/Sustituir`, body);
  }


}
