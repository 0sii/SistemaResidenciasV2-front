import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface EstadoEntregableDto {
    id: number;
    clave: string;
    descripcion: string;



}

export interface EntregableDto {
    id: number;
    idProyecto: number;
    idTipoEntregable: number;
    idEstudianteAutor: number;
    versionActual: number;

    // NUEVO:
    idEstadoEntregable: number;
    estadoClave: string;
    estadoDescripcion: string;

    fechaCreacion: string;





}

export interface EntregableVersionDto {
    id: number;
    idEntregable: number;
    numeroVersion: number;
    idEstudianteSubio: number;
    fechaSubida: string;
    nombreOriginal: string;
    nombreServidor: string;
    contentType: string;
    tamanoBytes: number;
    rutaFisica: string;

    // ✅ NUEVO (viene del backend)
    subidoPor?: string | null;
    noControlSubio?: string | null;




}

export interface RevisionEntregableDto {
    id: number;
    idEntregableVersion: number;
    numeroRevision: number;
    idDocenteRevisor: number;
    dictamen: string;
    observaciones: string;
    fechaRevision: string;



}

export interface EntregableDetalleDto {
    entregable: EntregableDto;
    versiones: EntregableVersionDto[];
    revisiones: RevisionEntregableDto[];




}

export interface CreateEntregableBody {
    idProyecto: number;
    idTipoEntregable: number;
    idEstudianteAutor: number;




}

export interface CreateRevisionBody {
    dictamen: 'CAMBIOS' | 'APROBADO' | 'RECHAZADO';
    observaciones: string;



}

@Injectable({ providedIn: 'root' })
export class EntregablesService {
    private http = inject(HttpClient);

    private baseUrl = `${environment.ConstantsService.apiUrl}/entregables`;

    // Lista cabeceras por proyecto
    getByProyecto(idProyecto: number): Observable<EntregableDto[]> {
        return this.http.get<EntregableDto[]>(`${this.baseUrl}/proyecto/${idProyecto}`);
    }

    // Detalle completo: cabecera + versiones + revisiones
    getDetalle(idEntregable: number): Observable<EntregableDetalleDto> {
        return this.http.get<EntregableDetalleDto>(`${this.baseUrl}/${idEntregable}`);
    }

    // Crear cabecera (1 por tipo por proyecto)
    create(body: CreateEntregableBody): Observable<any> {
        return this.http.post(`${this.baseUrl}`, body);
    }

    // Subir versión (archivo)
    uploadVersion(idEntregable: number, idEstudianteSubio: number, file: File): Observable<any> {
        const fd = new FormData();
        fd.append('IdEstudianteSubio', String(idEstudianteSubio));
        fd.append('Archivo', file, file.name);

        return this.http.post(`${this.baseUrl}/${idEntregable}/versiones`, fd);
    }

    // Crear revisión para una versión
    createRevision(idEntregableVersion: number, body: CreateRevisionBody): Observable<any> {
        return this.http.post(`${this.baseUrl}/versiones/${idEntregableVersion}/revisiones`, body);
    }


    // Descargar archivo de una versión
    downloadVersion(idEntregableVersion: number): Observable<Blob> {
        return this.http.get(`${this.baseUrl}/versiones/${idEntregableVersion}/download`, {
                responseType: 'blob' as 'blob'
            });
    }

    // Catalogo estados entregable
    getEstadosEntregable(): Observable<EstadoEntregableDto[]> {
        return this.http.get<EstadoEntregableDto[]>(`${this.baseUrl}/estados`);
    }

    createRevisionWithFile(
        idEntregableVersion: number,
        payload: { dictamen: 'CAMBIOS' | 'APROBADO' | 'RECHAZADO'; observaciones: string; archivo?: File | null }
    ): Observable<any> {
        const fd = new FormData();
        fd.append('Dictamen', payload.dictamen);
        fd.append('Observaciones', payload.observaciones ?? '');

        if (payload.archivo) {
            fd.append('Archivo', payload.archivo, payload.archivo.name);
        }

        return this.http.post(`${this.baseUrl}/versiones/${idEntregableVersion}/revisiones`, fd);
    }

    downloadRevisionFile(idRevision: number): Observable<Blob> {
        return this.http.get(`${this.baseUrl}/revisiones/${idRevision}/download`, { responseType: 'blob' as 'blob' });
    }

    reemplazarVersionArchivo(idEntregableVersion: number, idEstudianteSubio: number, archivo: File) {
        const form = new FormData();
        form.append('IdEstudianteSubio', String(idEstudianteSubio));
        form.append('Archivo', archivo, archivo.name);

        return this.http.put(
            `${this.baseUrl}/versiones/${idEntregableVersion}/reemplazar`,
            form
        );
    }




// ✅ Actualizar estado de la cabecera del entregable (estado del REPORTE, no de un archivo)
// Nota: en parciales/final, este estado se cambia SOLO por asesor interno.
updateEstadoEntregable(idEntregable: number, estadoClave: 'EN_REVISION' | 'CAMBIOS' | 'APROBADO'): Observable<any> {
    return this.http.put(`${this.baseUrl}/${idEntregable}/estado`, { estadoClave });
}



}
