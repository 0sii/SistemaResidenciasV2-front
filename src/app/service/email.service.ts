import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EmailService {

  private apiUrl = environment.ConstantsService.apiUrl + '/emails'; // Cambia la URL por la de tu API real

  constructor(private http: HttpClient) { }

  sendEmail(email: string, tema: string, cuerpo: string): Observable<any> {
    const emailData = { email, tema, cuerpo };  // Objeto JSON que contiene los datos del correo
    return this.http.post(this.apiUrl, emailData);  // Se envía como cuerpo de la solicitud
  }



}
