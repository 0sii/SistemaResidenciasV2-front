import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { ContactoEmergencia } from '../Interface/InterfaceContactoEmergencia';

@Injectable({
  providedIn: 'root'
})
export class ContactoEmergenciaService {

  private apiUrl = `${environment.ConstantsService.apiUrl}/Contactoemergencia`; // Asegúrate de que esta URL sea correcta

  constructor(private http: HttpClient) { }

  // Crear nuevo Contacto de Emergencia
  create(contacto: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, contacto);
  }

  // Obtener un Contacto de Emergencia por ID
  getById(id: number): Observable<ContactoEmergencia> {
    return this.http.get<ContactoEmergencia>(`${this.apiUrl}/${id}`);
  }

  // Actualizar un Contacto de Emergencia
  update(id: number, contacto: ContactoEmergencia): Observable<ContactoEmergencia> {
    return this.http.put<ContactoEmergencia>(`${this.apiUrl}/${id}`, contacto);
  }

  // Eliminar un Contacto de Emergencia
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
