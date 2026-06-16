import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { DocenteProyectoItem, ProyectoDocenteViewResponse } from '../Interface/InterfaceDocenteProyecto';



@Injectable({ providedIn: 'root' })
export class ProyectoDocentesService {
    private http = inject(HttpClient);
    private base = `${environment.ConstantsService.apiUrl}/ProyectoDocentes`;

    misProyectos(idUsuario: number, idTipoRelacion?: number): Observable<DocenteProyectoItem[]> {
        let params = new HttpParams().set('idUsuario', String(idUsuario));
        if (idTipoRelacion && idTipoRelacion > 0) {
            params = params.set('idTipoRelacion', String(idTipoRelacion));
        }
        return this.http.get<DocenteProyectoItem[]>(`${this.base}/mis-proyectos`, { params });
    }

    proyectoDocenteView(idUsuario: number, idProyecto: number): Observable<ProyectoDocenteViewResponse> {
        const params = new HttpParams()
            .set('idUsuario', String(idUsuario))
            .set('idProyecto', String(idProyecto));

        return this.http.get<ProyectoDocenteViewResponse>(`${this.base}/proyecto-docente`, { params });
    }


}
