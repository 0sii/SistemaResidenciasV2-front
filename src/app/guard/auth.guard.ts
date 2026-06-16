import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
  UrlTree
} from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { TokenService } from '../service/token.service';
import { NgxUiLoaderService } from 'ngx-ui-loader';
import { timeout, finalize } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private tokenService: TokenService,
    private router: Router,
    private ngx: NgxUiLoaderService
  ) { }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> | boolean | UrlTree {

    this.ngx.start();

    const token = this.tokenService.getToken();

    if (!token) {
      this.tokenService.clearAll();
      this.ngx.stop();

      // ✅ replaceUrl para que no “reviva” con back
      return this.router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url }
      });
    }

    return this.tokenService.validarToken(token).pipe(
      timeout(15000),
      map((isValid) => {
        if (isValid) return true;

        // inválido
        this.tokenService.clearAll();
        return this.router.createUrlTree(['/login'], {
          queryParams: { returnUrl: state.url }
        });
      }),
      catchError(() => {
        this.tokenService.clearAll();
        return of(
          this.router.createUrlTree(['/login'], {
            queryParams: { returnUrl: state.url }
          })
        );
      }),
      finalize(() => {
        // ✅ pase lo que pase, stop loader
        this.ngx.stop();
      })
    );
  }
}
