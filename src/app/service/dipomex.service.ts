import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface CodigoPostalResponse {
  error: boolean;
  message: string;
  codigo_postal: {
    estado_id: string;
    municipio_id: string;
    estado: string;
    estado_abreviatura: string;
    municipio: string;
    centro_reparto: string;
    codigo_postal: string;
    colonias: { colonia_id: string; colonia: string }[];
  };
}

export interface EstadoItem {
  ESTADO_ID: string;
  ESTADO: string;
  EDO1: string;
  RANGO1: string;
  RANGO2: string;
}

export interface EstadosResponse {
  error: boolean;
  message: string;
  estados: EstadoItem[];
}

export interface EstadoResponse {
  error: boolean;
  message: string;
  estado: EstadoItem[];
}

export interface MunicipioItem {
  ESTADO_ID: string;
  MUNICIPIO_ID: string;
  MUNICIPIO: string;
  RANGO1: string;
  RANGO2: string;
}

export interface MunicipiosResponse {
  error: boolean;
  message: string;
  municipios: MunicipioItem[];
}

export interface ColoniaItem {
  COLONIA_ID: string;
  ESTADO_ID: string;
  MUNICIPIO_ID: string;
  COLONIA: string;
  CP: string;
  CR: string;
  FECHA_ACT: string;
}

export interface ColoniasResponse {
  error: boolean;
  message: string;
  colonias: ColoniaItem[];
}

export interface CpColonia {
  colonia_id: string;
  colonia: string;
}
export interface UiColonia {
  id: number;      // 👈 IMPORTANTE: string, no number
  nombre: string;
  cp?: string;
}




@Injectable({ providedIn: 'root' })
export class DipomexService {
  private baseUrl = `${environment.ConstantsService.apiUrl}/dipomex`;

  constructor(private http: HttpClient) {}

  // GET api/dipomex/codigo-postal/{cp}
  getCodigoPostal(cp: string): Observable<CodigoPostalResponse> {
    return this.http.get<CodigoPostalResponse>(`${this.baseUrl}/codigo-postal/${cp}`);
  }

  // GET api/dipomex/estado/{id}
  getEstado(id: string): Observable<EstadoResponse> {
    return this.http.get<EstadoResponse>(`${this.baseUrl}/estado/${id}`);
  }

  // GET api/dipomex/estados
  getEstados(): Observable<EstadosResponse> {
    return this.http.get<EstadosResponse>(`${this.baseUrl}/estados`);
  }

  // GET api/dipomex/municipios/{estadoId}
  getMunicipios(estadoId: string): Observable<MunicipiosResponse> {
    return this.http.get<MunicipiosResponse>(`${this.baseUrl}/municipios/${estadoId}`);
  }

  // GET api/dipomex/colonias/{estadoId}/{municipioId}
  getColonias(estadoId: string, municipioId: string): Observable<ColoniasResponse> {
    return this.http.get<ColoniasResponse>(`${this.baseUrl}/colonias/${estadoId}/${municipioId}`);
  }
}
