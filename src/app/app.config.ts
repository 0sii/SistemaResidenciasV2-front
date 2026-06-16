import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { HTTP_INTERCEPTORS, provideHttpClient, withFetch, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';
import { LoaderInterceptor } from './interceptors/loader.interceptor';

import { definePreset } from '@primeuix/themes';

import {
  NgxUiLoaderModule,
  NgxUiLoaderConfig,
  SPINNER,
  PB_DIRECTION,
  POSITION,
} from 'ngx-ui-loader';
import { AuthInterceptor } from './interceptors/auth.interceptor';


const MyPreset = definePreset(Aura, {
  semantic: {
    colorScheme: {
      light: {
        root: {
          background: 'white', // Fondo blanco para modo claro
          color: 'black' // Texto negro
        },
        subtitle: {
          color: 'gray' // Color gris para subtítulos
        }
      },
      dark: {
        root: {
          background: '#1a202c', // Fondo oscuro similar al fondo de la imagen
          color: '#f7fafc' // Texto blanco claro
        },
        subtitle: {
          color: '#A5A5A5' // Gris claro para subtítulos
        }
      }
    }
  }
});

const ngxUiLoaderConfig: NgxUiLoaderConfig = {
  bgsColor: '#10b981',
  fgsColor: '#10b981',
  fgsType: SPINNER.threeBounce,
  pbDirection: PB_DIRECTION.leftToRight,
  pbThickness: 4,
  hasProgressBar: false,
  overlayColor: 'rgba(15,23,42,0.6)', // queda bien con dark mode
};


export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes), provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: MyPreset
      }
    }),

    provideHttpClient(
      withFetch(),
      withInterceptorsFromDi() // ✅ ESTA ES LA CLAVE
    ),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },

    { provide: HTTP_INTERCEPTORS, useClass: LoaderInterceptor, multi: true },

    importProvidersFrom(
      NgxUiLoaderModule.forRoot(ngxUiLoaderConfig)
    ),



  ],
};
