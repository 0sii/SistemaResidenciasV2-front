import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { PeriodosAcademicosService } from '../../service/periodoAcademico.service';
import { PeriodoAcademicoDto } from '../../service/periodoAcademico.service';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { CommonModule } from '@angular/common';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';

import { LOCALE_ID } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { registerLocaleData } from '@angular/common';

registerLocaleData(localeEs);

@Component({
  selector: 'app-periodo-academico',
  standalone: true,
  imports: [
    DialogModule,
    ButtonModule,
    TableModule,
    InputTextModule,
    FormsModule,
    ToastModule,
    CheckboxModule,
    ReactiveFormsModule,
    CommonModule,
    NgxExtendedPdfViewerModule
  ],
  templateUrl: './periodo-academico.html',
  styleUrl: './periodo-academico.css',
  providers: [MessageService, { provide: LOCALE_ID, useValue: 'es' }]
})
export class PeriodoAcademico implements OnInit, OnDestroy {

  private _subs: Subscription[] = [];

  periodos: PeriodoAcademicoDto[] = [];

  // ✅ Dialog crear
  showCreateDialog = false;
  createForm!: FormGroup;
  createSubmitted = false;
  creating = false;
  createMemFile: File | null = null;

  // ✅ Dialog editar
  showEditDialog = false;
  editForm!: FormGroup;
  editSubmitted = false;
  savingEdit = false;
  resetConsecutivo = false;

  selectedPeriodo: PeriodoAcademicoDto | null = null;

  // Membrentado (edit dialog)
  memMetaLoading = false;
  memExists = false;
  memFileName = '';
  memUploadedAt = '';
  memFile: File | null = null;
  memUploading = false;

  @ViewChild('memInput') memInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('createMemInput') createMemInputRef!: ElementRef<HTMLInputElement>;

  pdfUrl: string | null = null;
  displayDialog: boolean = false;

  constructor(
    private fb: FormBuilder,
    private periodosSvc: PeriodosAcademicosService,
    private messageService: MessageService
  ) { }

  ngOnInit(): void {
    this.createForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(5)]],
      fechaInicio: ['', Validators.required],
      fechaFin: ['', Validators.required],
      activo: [true],
      jefeDepartamentoNombre: ['', [Validators.required, Validators.minLength(5)]],
    }, { validators: this.fechaRangoValidator });

    this.editForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(5)]],
      fechaInicio: ['', Validators.required],
      fechaFin: ['', Validators.required],
      activo: [true],
      jefeDepartamentoNombre: ['', [Validators.required, Validators.minLength(5)]],

      // opcional (solo si resetConsecutivo = true)
      consecutivoOficio: [{ value: null, disabled: true }, [Validators.min(1)]],
    }, { validators: this.fechaRangoValidator });

    this.loadPeriodos();

    // ── Auto-nombre según fechas ──────────────────────────────────────
    for (const form of [this.createForm, this.editForm]) {
      const sub = form.valueChanges.subscribe(() => {
        const inicio = form.get('fechaInicio')?.value;
        const fin    = form.get('fechaFin')?.value;
        if (inicio && fin) {
          const nombre = this.generarNombrePeriodo(inicio, fin);
          form.get('nombre')?.setValue(nombre, { emitEvent: false });
        }
      });
      this._subs.push(sub);
    }
  }

  ngOnDestroy(): void {
    this._subs.forEach(s => s.unsubscribe());
  }

  /**
   * Genera nombre tipo "ENE-JUN 2026" a partir de dos fechas ISO (YYYY-MM-DD).
   * Usa el año de la fecha de fin.
   */
  generarNombrePeriodo(inicio: string, fin: string): string {
    const meses = ['ENE','FEB','MAR','ABR','MAY','JUN',
                   'JUL','AGO','SEP','OCT','NOV','DIC'];
    const [anioI, mesI] = inicio.split('-').map(Number);
    const [anioF, mesF] = fin.split('-').map(Number);
    const mesInicioStr = meses[(mesI ?? 1) - 1] ?? '';
    const mesFinStr    = meses[(mesF ?? 1) - 1] ?? '';
    // Si inicio y fin son el mismo mes/año → solo un mes
    if (anioI === anioF && mesI === mesF) {
      return `${mesInicioStr} ${anioF}`;
    }
    return `${mesInicioStr}-${mesFinStr} ${anioF}`;
  }

  fechaRangoValidator(control: AbstractControl) {
    const inicio = control.get('fechaInicio')?.value;
    const fin = control.get('fechaFin')?.value;
    if (!inicio || !fin) return null;
    return new Date(fin) < new Date(inicio) ? { fechaInvalida: true } : null;
  }

  loadPeriodos(): void {
    this.periodosSvc.getAll().subscribe({
      next: data => this.periodos = data
    });
  }

  // =======================
  // CREAR
  // =======================
  openCreate(): void {
    this.createSubmitted = false;
    this.createMemFile = null;

    this.createForm.reset({
      nombre: '',
      fechaInicio: '',
      fechaFin: '',
      activo: true,
      jefeDepartamentoNombre: ''
    });

    this.showCreateDialog = true;
  }

  onCreateMemFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) { this.createMemFile = null; return; }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.messageService.add({ severity: 'warn', summary: 'Archivo inválido', detail: 'Solo PDF.', life: 10000 });
      input.value = '';
      this.createMemFile = null;
      return;
    }

    this.createMemFile = file;
  }

  submitCreate(): void {
    this.createSubmitted = true;

    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      this.messageService.add({ severity: 'warn', summary: 'Formulario incompleto', detail: 'Revisa los campos.', life: 10000 });
      return;
    }

    // ✅ requerido por tu regla: al crear se asigna membrentado
    if (!this.createMemFile) {
      this.messageService.add({ severity: 'warn', summary: 'Falta membrentado', detail: 'Selecciona el PDF del membrentado.', life: 10000 });
      return;
    }

    this.creating = true;

    const payload = { ...this.createForm.value };
    payload.nombre = String(payload.nombre).trim();
    payload.jefeDepartamentoNombre = String(payload.jefeDepartamentoNombre).trim();

    this.periodosSvc.create(payload).subscribe({
      next: (periodoCreado) => {
        // subir membrentado
        this.periodosSvc.uploadMembrentado(periodoCreado.id, this.createMemFile!).subscribe({
          next: () => {
            this.creating = false;
            this.showCreateDialog = false;
            this.createMemFile = null;

            this.messageService.add({ severity: 'success', summary: 'Listo', detail: 'Período y membrentado guardados.', life: 10000 });
            this.loadPeriodos();
          },
          error: (err) => {
            console.error(err);
            this.creating = false;
            // período sí quedó creado, solo falló membrentado
            this.messageService.add({
              severity: 'warn',
              summary: 'Período creado',
              detail: 'El período se creó, pero falló la subida del membrentado. Entra a editar y súbelo.',
              life: 12000
            });
            this.loadPeriodos();
          }
        });
      },
      error: (err) => {
        console.error(err);
        this.creating = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear el período.', life: 10000 });
      }
    });
  }

  // =======================
  // EDITAR
  // =======================
  openEdit(row: PeriodoAcademicoDto) {
  this.selectedPeriodo = row;
  this.editSubmitted = false;
  this.resetConsecutivo = false;

  this.editForm.reset({
    nombre: row.nombre ?? '',
    fechaInicio: row.fechaInicio ?? '',
    fechaFin: row.fechaFin ?? '',
    activo: !!row.activo,
    jefeDepartamentoNombre: (row as any).jefeDepartamentoNombre ?? '',

    // ✅ ponemos el valor actual (si existe) pero lo dejamos deshabilitado
    consecutivoOficio: (row as any).consecutivoOficio ?? null
  });

  this.editForm.get('consecutivoOficio')?.disable({ emitEvent: false });

  this.memFile = null;
  this.showEditDialog = true;
  this.loadMembrentadoMeta();
}

  toggleResetConsecutivo() {
  this.resetConsecutivo = !this.resetConsecutivo;

  const ctrl = this.editForm.get('consecutivoOficio');
  if (!ctrl) return;

  if (this.resetConsecutivo) {
    ctrl.enable({ emitEvent: false });

    // ✅ default al consecutivo actual si existe, si no a 1
    const current = (this.selectedPeriodo as any)?.consecutivoOficio ?? 1;
    ctrl.setValue(current, { emitEvent: false });

    ctrl.markAsTouched();
  } else {
    ctrl.setValue((this.selectedPeriodo as any)?.consecutivoOficio ?? null, { emitEvent: false });
    ctrl.disable({ emitEvent: false });
  }
}

  saveEdit() {
    if (!this.selectedPeriodo?.id) return;

    this.editSubmitted = true;

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      this.messageService.add({ severity: 'warn', summary: 'Formulario incompleto', detail: 'Revisa los campos.', life: 10000 });
      return;
    }

    const payload: any = {
      nombre: String(this.editForm.value.nombre).trim(),
      fechaInicio: this.editForm.value.fechaInicio,
      fechaFin: this.editForm.value.fechaFin,
      activo: !!this.editForm.value.activo,
      jefeDepartamentoNombre: String(this.editForm.value.jefeDepartamentoNombre).trim(),
    };

    if (this.resetConsecutivo) {
      payload.consecutivoOficio = Number(this.editForm.get('consecutivoOficio')?.value ?? 0) || null;
    }

    this.savingEdit = true;

    this.periodosSvc.update(this.selectedPeriodo.id, payload).subscribe({
      next: () => {
        this.savingEdit = false;
        this.messageService.add({ severity: 'success', summary: 'Listo', detail: 'Período actualizado.', life: 10000 });
        this.loadPeriodos();
      },
      error: (err) => {
        console.error(err);
        this.savingEdit = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el período.', life: 10000 });
      }
    });
  }

  // =======================
  // Membrentado (en edit)
  // =======================
  loadMembrentadoMeta(showToast: boolean = true) {
    if (!this.selectedPeriodo?.id) return;

    this.memMetaLoading = true;

    this.periodosSvc.getMembrentadoMeta(this.selectedPeriodo.id).subscribe({
      next: (meta) => {
        this.memExists = !!meta.exists;
        this.memFileName = meta.fileName ?? '';
        this.memUploadedAt = meta.uploadedAt ? new Date(meta.uploadedAt).toLocaleString() : '';
        this.memMetaLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.memMetaLoading = false;
        if (showToast) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el membrentado.', life: 10000 });
        }
      }
    });
  }

  onMemFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) { this.memFile = null; return; }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.messageService.add({ severity: 'warn', summary: 'Archivo inválido', detail: 'Solo PDF.', life: 10000 });
      input.value = '';
      this.memFile = null;
      return;
    }

    this.memFile = file;
  }

  uploadMembrentado() {
    if (!this.selectedPeriodo?.id) return;
    if (!this.memFile) {
      this.messageService.add({ severity: 'warn', summary: 'Falta archivo', detail: 'Selecciona un PDF antes de subir.', life: 10000 });
      return;
    }

    this.memUploading = true;

    this.periodosSvc.uploadMembrentado(this.selectedPeriodo.id, this.memFile).subscribe({
      next: () => {
        this.memUploading = false;
        this.messageService.add({ severity: 'success', summary: 'Listo', detail: 'Membrentado guardado.', life: 10000 });
        this.memFile = null;
        this.loadMembrentadoMeta(false);
      },
      error: (err) => {
        console.error(err);
        this.memUploading = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo subir el membrentado.', life: 10000 });
      }
    });
  }

  deleteMembrentado() {
    if (!this.selectedPeriodo?.id) return;

    const ok = confirm('¿Eliminar el membrentado de este período?');
    if (!ok) return;

    this.periodosSvc.deleteMembrentado(this.selectedPeriodo.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Listo', detail: 'Membrentado eliminado.', life: 10000 });
        this.loadMembrentadoMeta(false);
      },
      error: (err) => {
        console.error(err);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar.', life: 10000 });
      }
    });
  }

  liberarPdfUrl(): void {
    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
  }

  viewMembrentado(): void {
    if (!this.selectedPeriodo?.id) return;

    this.liberarPdfUrl();
    this.pdfUrl = null;

    this.periodosSvc.downloadMembrentado(this.selectedPeriodo.id).subscribe({
      next: (blob: Blob) => {
        if (!blob) return;
        if (blob.type !== 'application/pdf') {
          this.messageService.add({ severity: 'error', summary: 'Archivo inválido', detail: 'No es PDF.', life: 10000 });
          return;
        }
        const fileSizeInMB = blob.size / (1024 * 1024);
        if (fileSizeInMB > 15) {
          this.messageService.add({ severity: 'warn', summary: 'Archivo grande', detail: 'Demasiado grande para visor.', life: 10000 });
          return;
        }
        this.pdfUrl = URL.createObjectURL(blob);
        this.displayDialog = true;
      },
      error: (err) => {
        console.error(err);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar.', life: 10000 });
      }
    });
  }

  getEstadoBadgeClass(activo: boolean): string {
    return activo
      ? 'bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium'
      : 'bg-gray-200 text-gray-600 px-3 py-1 rounded-full text-sm font-medium';
  }
}