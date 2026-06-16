import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { map, of, shareReplay } from 'rxjs';

export interface EstadoMx {
  clave: string;   // CVE_ENT de 2 dígitos
  nombre: string;
  abrev?: string;
}

export interface MunicipioMx {
  clave: string;   // CVE_MUN de 3 dígitos
  nombre: string;
  cveEnt?: string; // redundante para trazabilidad
}

type Proveedor = 'githubJson' | 'copomex';

@Injectable({ providedIn: 'root' })
export class CatalogoMxService {
  // --- Cambia esto si quieres usar COPOMEX ---
  private proveedor: Proveedor = 'githubJson';

  // GitHub (sin token)
  private GH_ESTADOS = 'https://raw.githubusercontent.com/cisnerosnow/json-estados-municipios-mexico/master/estados.json';
  private GH_ESTADOS_MUN = 'https://raw.githubusercontent.com/cisnerosnow/json-estados-municipios-mexico/master/estados-municipios.json';

  // COPOMEX (requiere token)
  private COPOMEX_BASE = 'https://api.copomex.com/query';
  private COPOMEX_TOKEN = ''; // <-- pega tu token aquí si usas COPOMEX

  private _estados$ = this.cargarEstados().pipe(shareReplay(1));

  constructor(private http: HttpClient) {}

  getEstados() {
    return this._estados$;
  }

  getMunicipiosPorEstado(estadoClaveOName: string) {
    if (this.proveedor === 'githubJson') {
      return this.http.get<any[]>(this.GH_ESTADOS_MUN).pipe(
        map(arr => {
          // El JSON tiene forma: [{ clave:'01', nombre:'Aguascalientes', municipios:[{clave:'001', nombre:'Aguascalientes'}, ...] }, ...]
          const match = arr.find(e =>
            (e.clave?.toString().padStart(2, '0') === estadoClaveOName) ||
            (e.nombre?.toLowerCase() === estadoClaveOName.toLowerCase())
          );
          const municipios: MunicipioMx[] = (match?.municipios || []).map((m: any) => ({
            clave: m.clave?.toString().padStart(3, '0'),
            nombre: m.nombre,
            cveEnt: match?.clave?.toString().padStart(2, '0') || ''
          }));
          return municipios;
        })
      );
    }

    // COPOMEX: por nombre de estado (ej. "Jalisco"). Endpoints típicos:
    //  - GET /get_estados?token=...
    //  - GET /get_municipios_por_estado/{Estado}?token=...
    const headers = new HttpHeaders({ });
    const params = new HttpParams().set('token', this.COPOMEX_TOKEN);
    const url = `${this.COPOMEX_BASE}/get_municipios_por_estado/${encodeURIComponent(estadoClaveOName)}`;
    return this.http.get<any>(url, { params, headers }).pipe(
      map(resp => {
        // resp.data = [{ municipio: "Acatic" }, ...]
        const data = resp?.data ?? [];
        return data.map((x: any) => ({
          clave: '',           // COPOMEX no entrega CVE_MUN, lo dejamos vacío
          nombre: x.municipio, // o x.response.municipio según versión
        })) as MunicipioMx[];
      })
    );
  }

  // ---------- Privados ----------
  private cargarEstados() {
    if (this.proveedor === 'githubJson') {
      return this.http.get<any[]>(this.GH_ESTADOS).pipe(
        map(arr =>
          arr.map(e => ({
            clave: e.clave?.toString().padStart(2, '0'),
            nombre: e.nombre,
            abrev: e.abrev
          }) as EstadoMx)
        )
      );
    }

    // COPOMEX: /get_estados
    if (!this.COPOMEX_TOKEN) {
      // Evita reventar si alguien dejó proveedor=copomex sin token
      return of<EstadoMx[]>([]);
    }
    const params = new HttpParams().set('token', this.COPOMEX_TOKEN);
    const url = `${this.COPOMEX_BASE}/get_estados`;
    return this.http.get<any>(url, { params }).pipe(
      map(resp => {
        // resp.data = ["Aguascalientes", "Baja California", ...]
        const data = resp?.data ?? [];
        return data.map((nombre: string, idx: number) => ({
          clave: String(idx + 1).padStart(2, '0'), // No viene CVE_ENT real; se genera ordinal (si necesitas CVE oficial, usa GitHub/INEGI)
          nombre
        }) as EstadoMx);
      })
    );
  }
}
