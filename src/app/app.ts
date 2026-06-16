import { Component } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { Sidebar } from './modulos/comunes/sidebar/sidebar';
import { Header } from './modulos/comunes/header/header';
import { AuthService } from './service/auth.service';
import { NgxUiLoaderModule, NgxUiLoaderService } from 'ngx-ui-loader';
import { TokenService } from './service/token.service';
import { catchError, finalize, of, filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar, Header, NgxUiLoaderModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  title = 'Vinculación de Proyectos';

  sidebarVisible = false;

  // ✅ Rutas donde NO quieres sidebar aunque exista sesión
  private readonly HIDE_SIDEBAR_ROUTES = new Set([
    '/login',
    '/changePassword',
  ]);

  constructor(
    private authService: AuthService,
    private tokenService: TokenService,
    private router: Router,
    private ngx: NgxUiLoaderService
  ) { }

  ngOnInit() {
    // ✅ Evita error SSR/hydration
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', (event: any) => {
        if (event?.persisted) {
          // Si venía de cache, revalida UI
          this.recalcLayout(this.router.url);
          if (!this.authService.isAuthenticated()) {
            this.router.navigateByUrl('/login', { replaceUrl: true });
          }
        }
      });
    }

    // ✅ Primer cálculo (ya con ruta actual)
    this.recalcLayout(this.router.url);

    // ✅ Recalcular en cada navegación
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.recalcLayout(e.urlAfterRedirects || e.url);
      });

    // ✅ (Opcional) validar token al arranque
    this.validarTokenAlArranque();
  }

  private recalcLayout(url: string): void {
    const path = this.onlyPath(url);
    const isHiddenRoute = this.HIDE_SIDEBAR_ROUTES.has(path);

    // ✅ Sidebar solo si hay sesión y NO estás en rutas públicas
    this.sidebarVisible = this.authService.isAuthenticated() && !isHiddenRoute;
  }

  private onlyPath(url: string): string {
    const q = url.indexOf('?');
    const h = url.indexOf('#');
    const cut = Math.min(q === -1 ? url.length : q, h === -1 ? url.length : h);
    return url.slice(0, cut);
  }

  private validarTokenAlArranque(): void {
    const token = this.authService.getToken();
    if (!token) return;

    this.ngx.start();

    this.tokenService.validarToken(token).pipe(
      catchError(() => of(false)),
      finalize(() => this.ngx.stop())
    ).subscribe((isValid) => {
      if (!isValid) {
        this.authService.logout();
        // ✅ Recalcular layout (oculta sidebar)
        this.recalcLayout(this.router.url);
        this.router.navigateByUrl('/login', { replaceUrl: true });
      } else {
        // ✅ Token válido: recalcula con ruta actual (si estás en /login no mostrará sidebar)
        this.recalcLayout(this.router.url);
      }
    });
  }
}
