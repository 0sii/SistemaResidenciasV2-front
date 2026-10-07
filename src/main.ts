import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './app/environments/environment';
fetch('/assets/config.json')
  .then(res => res.json())
  .then(cfg => {
    if (cfg?.apiUrl) {
      environment.ConstantsService.apiUrl = cfg.apiUrl;
    }
  })
  .catch(err => console.warn('No se pudo cargar config.json, se usará la URL por defecto', err))
  .finally(() => {
    bootstrapApplication(App, appConfig)
      .catch((err) => console.error(err));
  });