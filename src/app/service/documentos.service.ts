import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, Observable, of, throwError } from 'rxjs';
import { environment } from '../environments/environment';
import { Documento } from '../Interface/InterfaceDocumento';

export interface DocumentoUploadResultDto {
  totalRegistrosCreados: number;
  idsDocumentosCreados: number[];
}

export enum EstadoRevisionDocumento {
  EnRevision = 0,
  Aceptado = 1,
  Rechazado = 2
}

export interface ActualizarEstadoDocumentoRequest {
  estadoRevision: EstadoRevisionDocumento;
  comentarioRevision?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DocumentosService {
  private http = inject(HttpClient);
  private base = `${environment.ConstantsService.apiUrl}/documentos`;

  getMisAnteproyectos(): Observable<Documento[]> {
    return this.http.get<Documento[]>(`${this.base}/mis-anteproyectos`);
  }

  subirAnteproyecto(file: File): Observable<DocumentoUploadResultDto> {
    const fd = new FormData();
    // 👇 IMPORTANTÍSIMO: mismo nombre que el parámetro del back: "Archivo"
    fd.append('Archivo', file);
    return this.http.post<DocumentoUploadResultDto>(`${this.base}/anteproyecto`, fd);
  }

  descargar(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/descargar`, { responseType: 'blob' as 'blob' });
  }

  getRevisionesPorDocumento(idDocumento: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/${idDocumento}/Revisiones`);
  }

  getTiposExpediente() {
    return this.http.get<{ id: number, descripcion: string }[]>(`${this.base}/tipos-expediente`);
  }

  getMisExpediente() {
    return this.http.get<any[]>(`${this.base}/mis-expediente`);
  }

  subirExpediente(tipo: number, file: File) {
    const fd = new FormData();
    fd.append('Archivo', file);
    return this.http.post(`${this.base}/expediente/${tipo}`, fd);
  }

  // descargarExpediente(tipo: number) {
  //   return this.http.get(`${this.base}/expediente/${tipo}/descargar`, { responseType: 'blob' });
  // }


  descargarExpediente(tipo: number): Observable<Blob> {
    return this.http.get(`${this.base}/expediente/${tipo}/descargar`, {
      responseType: 'blob' as 'blob'  // Asegúrate de que la respuesta sea del tipo 'blob'
    });
  }

  verExpedientePdf(tipo: number, headers: HttpHeaders): Observable<Blob> {
    return this.http.get(`${this.base}/expediente/${tipo}/ver`, {
      headers: headers,
      responseType: 'blob' as 'blob' // Asegúrate de que la respuesta sea del tipo 'blob' para un archivo binario
    });
  }



  verExpedientePdfArrayBuffer(tipo: number, token: string) {
    return this.http.get(`${this.base}/expediente/${tipo}/ver`, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      catchError((error) => {
        console.error('Error al obtener el archivo:', error);
        return of(null); // Retornar null en caso de error
      })
    );
  }

  // =========================
  // EXPEDIENTE POR ESTUDIANTE (Jefe Vinculación)
  // =========================

  // =========================
  // EXPEDIENTE (JEFE) POR ESTUDIANTE
  // =========================

    getExpedienteByEstudiante(idEstudiante: number, token: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.base}/expediente/estudiante/${idEstudiante}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).pipe(
      catchError((err: any) => {
        // ✅ Si el alumno no tiene expediente todavía, algunos backends devuelven 404.
        // Aquí lo tratamos como expediente vacío.
        if (err?.status === 404) return of([]);

        // Otros errores sí deben propagarse (401/403/500, etc.)
        return throwError(() => err);
      })
    );
  }

  


  verExpedientePdfArrayBufferByEstudiante(tipo: number, idEstudiante: number, token: string) {
    return this.http.get(`${this.base}/expediente/${tipo}/ver/estudiante/${idEstudiante}`, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      catchError((error) => {
        console.error('Error al obtener el PDF (expediente por estudiante):', error);
        return of(null);
      })
    );
  }

  getActasResidenciaByProyecto(idProyecto: number) {
  return this.http.get<any[]>(`${this.base}/acta-residencia/proyecto/${idProyecto}`);
}

subirActaResidencia(idProyecto: number, idEstudiante: number, file: File) {
  const fd = new FormData();
  fd.append('Archivo', file, file.name);
  return this.http.post(`${this.base}/acta-residencia/proyecto/${idProyecto}/estudiante/${idEstudiante}`, fd);
}

// ✅ Compatible con:
// - descargarExpedienteByEstudiante(idEstudiante, tipo)
// - descargarExpedienteByEstudiante(tipo, idEstudiante, token)
descargarExpedienteByEstudiante(idEstudiante: number, tipo: number): Observable<Blob>;
descargarExpedienteByEstudiante(tipo: number, idEstudiante: number, token: string): Observable<Blob>;
descargarExpedienteByEstudiante(a: number, b: number, token?: string): Observable<Blob> {
  let idEstudiante: number;
  let tipo: number;

  // Si viene token, asumimos la firma: (tipo, idEstudiante, token)
  if (typeof token === 'string' && token.trim().length > 0) {
    tipo = a;
    idEstudiante = b;
  } else {
    // si NO viene token, asumimos: (idEstudiante, tipo)
    idEstudiante = a;
    tipo = b;
  }

  const headers = token
    ? new HttpHeaders({ Authorization: `Bearer ${token}` })
    : undefined;

  return this.http.get(`${this.base}/expediente/estudiante/${idEstudiante}/tipo/${tipo}/descargar`, {
    responseType: 'blob' as 'blob',
    headers
  });
}

setExpedienteLink(tipo: number, url: string) {
  return this.http.put(`${this.base}/expediente/${tipo}/link`, { url });
}


actualizarEstadoDocumento(
  idDocumento: number,
  estadoRevision: EstadoRevisionDocumento,
  comentarioRevision?: string | null
) {
  const body: ActualizarEstadoDocumentoRequest = {
    estadoRevision,
    comentarioRevision: comentarioRevision ?? null
  };

  return this.http.put<any>(`${this.base}/${idDocumento}/estado`, body);
}

descargarMiExpedienteCompleto(): Observable<Blob> {
  return this.http.get(`${this.base}/expediente/descargar-completo`, {
    responseType: 'blob' as 'blob'
  });
}

/** Descarga solo los tipos seleccionados fusionados en un PDF */
descargarExpedienteSeleccionados(tipos: number[]): Observable<Blob> {
  return this.http.post(`${this.base}/expediente/descargar-seleccionados`,
    { tipos },
    { responseType: 'blob' as 'blob' }
  );
}

/** Descarga tipos seleccionados de un estudiante específico (para Jefa de Vinculación) */
descargarExpedienteSeleccionadosByEstudiante(
  idEstudiante: number, tipos: number[], token?: string
): Observable<Blob> {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return this.http.post(
    `${this.base}/expediente/estudiante/${idEstudiante}/descargar-seleccionados`,
    { tipos },
    { responseType: 'blob' as 'blob', headers }
  );
}

descargarExpedienteCompletoByEstudiante(idEstudiante: number, token?: string): Observable<Blob> {
  const headers = token
    ? new HttpHeaders({ Authorization: `Bearer ${token}` })
    : undefined;

  return this.http.get(`${this.base}/expediente/estudiante/${idEstudiante}/descargar-completo`, {
    responseType: 'blob' as 'blob',
    headers
  });
}

}
  