import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { finalize, Observable } from "rxjs";
import { NgxUiLoaderService } from "ngx-ui-loader";

@Injectable()
export class LoaderInterceptor implements HttpInterceptor {
  private active = 0;

  // 👇 guardamos pendientes por ID
  private pending = new Map<string, { url: string; method: string; startedAt: number }>();

  constructor(private ngx: NgxUiLoaderService) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const id = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const startedAt = Date.now();

    this.pending.set(id, { url: req.urlWithParams, method: req.method, startedAt });

    if (this.active === 0) this.ngx.start();
    this.active++;

    // console.groupCollapsed(`⏳ [HTTP START] #${id}`);
    // console.log("method:", req.method);
    // console.log("url:", req.urlWithParams);
    // console.log("active:", this.active);
    // console.groupEnd();

    // 👇 dump de pendientes cada vez que entra un request
    this.dumpPending("after START");

    return next.handle(req).pipe(
      finalize(() => {
        const info = this.pending.get(id);
        this.pending.delete(id);

        this.active = Math.max(0, this.active - 1);

        // console.groupCollapsed(`✅ [HTTP END] #${id}`);
        // console.log("method:", req.method);
        // console.log("url:", req.urlWithParams);
        // console.log("ms:", info ? (Date.now() - info.startedAt) : "unknown");
        // console.log("active:", this.active);
        // console.groupEnd();

        this.dumpPending("after END");

        if (this.active === 0) this.ngx.stop();
      })
    );
  }

  private dumpPending(tag: string) {
    const list = Array.from(this.pending.values()).map(x => ({
      method: x.method,
      url: x.url,
      seconds: ((Date.now() - x.startedAt) / 1000).toFixed(1)
    }));
    //console.log(`📌 pending ${tag}:`, list);
  }
}
