import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { TokenService } from '../service/token.service';
import { environment } from '../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private apiBase = environment.ConstantsService.apiUrl; // ej: http://localhost:47350/api

  constructor(private tokenStore: TokenService, private router: Router) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.tokenStore.getToken();

    const esApi = req.url.startsWith(this.apiBase);
    const esLogin = req.url.includes('/Acceso/Login');

    const authReq =
      esApi && token && !esLogin
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

    return next.handle(authReq).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401 && !esLogin) {
          this.tokenStore.clearAll();
          this.router.navigate(['/login'], { replaceUrl: true });
        }
        return throwError(() => err);
      })
    );
  }
}
