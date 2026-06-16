import { Component, inject, signal, ChangeDetectorRef, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { EmpresasService } from '../../../service/empresa.service';
import { Empresa } from '../../../Interface/InterfaceEmpresa';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';

import { DipomexService } from '../../../service/dipomex.service';
import {
  CodigoPostalResponse,
  EstadoItem,
  MunicipioItem,
  CpColonia
} from '../../../service/dipomex.service';

@Component({
  selector: 'app-empresas',
  standalone: true,
  templateUrl: './empresas.html',
  styleUrls: ['./empresas.css'],
  imports: [ReactiveFormsModule, TableModule, ToastModule, ButtonModule, FormsModule, DialogModule, SelectModule],
  providers: [MessageService]
})
export class Empresas implements OnInit {
  private fb = inject(FormBuilder);
  private empresasSvc = inject(EmpresasService);
  private dipomexSvc = inject(DipomexService);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(MessageService);

  empresas: Empresa[] = [];
  isEditing = signal(false);
  currentId: number | null = null;
  municipios: any[] = [];

  coloniasCp: CpColonia[] = [];

  // flags de carga
  loadingColonias = false;

  // texto que se muestra en los inputs de solo lectura
  estadoTexto = '';
  municipioTexto = '';

  pendingColoniaId: string | null = null;


  private readonly rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

  form: FormGroup = this.fb.group({
    nombre: ['', Validators.required],
    rfc: ['', [Validators.required, Validators.pattern(this.rfcRegex)]],
    telefono: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    email: ['', [Validators.required, Validators.email]],

    giro: [''],
    mision: [''],
    domicilio: [''],

    // Estos los llena Dipomex; no son obligatorios
    estado: [null],
    municipio: [null],

    // Colonia empieza deshabilitada y SIN validadores
    colonia: [{ value: null, disabled: true }],

    ciudad: [''],

    // CP ahora es requerido y exactamente 5 dígitos
    cp: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],

    titular: [''],
    puestoTitular: [''],
  });

  submitted = false;

  ngOnInit() {
    this.load();

    // por si acaso, se asegura que colonia arranque deshabilitada
    this.form.get('colonia')?.disable({ emitEvent: false });
  }



  get f() { return this.form.controls; }

  // ===== Helpers =====

  digitsOnly(controlName: string, maxLen: number) {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;
    const only = String(ctrl.value ?? '').replace(/\D/g, '').slice(0, maxLen);
    if (only !== ctrl.value) ctrl.setValue(only, { emitEvent: false });
  }

  onRfcInput() {
    const ctrl = this.form.get('rfc');
    if (!ctrl) return;
    let v = String(ctrl.value ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9Ñ&]/g, '');
    if (v.length > 13) v = v.slice(0, 13);
    if (v !== ctrl.value) ctrl.setValue(v, { emitEvent: false });
  }

  onEmailBlur() {
    const ctrl = this.form.get('email');
    if (!ctrl) return;
    const v = String(ctrl.value ?? '').trim().toLowerCase();
    if (v !== ctrl.value) ctrl.setValue(v, { emitEvent: false });
  }

  private nz(v: any): string | null {
    const s = String(v ?? '').trim();
    return s.length ? s : null;
  }

  private toNullableNumber(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  // ===== Carga inicial =====

  load() {
    this.empresasSvc.getAll().subscribe({
      next: (rows) => {
        this.empresas = rows ?? [];
        queueMicrotask(() => this.cdr.detectChanges());
      },
      error: (err) => console.error('Load empresas error', err)
    });
  }

  // ================================================
  // CP → Estado / Municipio / Colonias (reutilizable)
  // ================================================
  private cargarUbicacionPorCp(cp: string, coloniaIdFromDb?: number | null) {
    if (!cp) {
      this.resetUbicacion();
      return;
    }

    this.loadingColonias = true;
    this.coloniasCp = [];
    this.estadoTexto = '';
    this.municipioTexto = '';
    this.form.get('colonia')?.disable({ emitEvent: false });

    this.dipomexSvc.getCodigoPostal(cp).subscribe({
      next: (res: CodigoPostalResponse) => {
        this.loadingColonias = false;
        console.log(res)

        if (res.error || !res.codigo_postal) {
          this.showError('Código postal no encontrado. Verifica los 5 dígitos e intenta de nuevo.');
          this.resetUbicacion();
          return;
        }


        const cpData: any = res.codigo_postal;

        // IDs en formato string para el form
        const estadoId = String(cpData.estado_id ?? cpData.ESTADO_ID ?? '').padStart(2, '0');
        const municipioId = String(cpData.municipio_id ?? cpData.MUNICIPIO_ID ?? '').padStart(3, '0');

        // Texto solo para mostrar en los inputs readonly
        this.estadoTexto = cpData.estado ?? cpData.ESTADO ?? '';
        this.municipioTexto = cpData.municipio ?? cpData.MUNICIPIO ?? '';

        // Opciones de colonias normalizadas
        this.coloniasCp = this.mapColoniasFromCpData(cpData);

        if (this.coloniasCp.length) {
          this.form.get('colonia')?.enable({ emitEvent: false });
        } else {
          this.form.get('colonia')?.disable({ emitEvent: false });
        }

        // Valor de colonia:
        //   - En alta → coloniaIdFromDb = null → dejamos vacío
        //   - En edición → viene el id desde BD y lo ponemos
        const coloniaStr =
          coloniaIdFromDb != null
            ? coloniaIdFromDb.toString()
            : '';

        this.form.patchValue(
          {
            estado: estadoId,
            municipio: municipioId,
            colonia: coloniaStr,
          },
          { emitEvent: false }
        );

        // Ayuda a evitar NG0100 en modo dev
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loadingColonias = false;
        console.error('Error consultando CP', err);
        this.showError('No se pudo obtener información del código postal.');
        this.resetUbicacion();
      }
    });
  }


  // ===== CP → autoselect estado, municipio y colonias =====

  onCpBlur() {
    this.pendingColoniaId = null;

    const cpCtrl = this.form.get('cp');
    if (!cpCtrl) return;

    // Marcamos como tocado para que se vean los mensajes debajo del input
    cpCtrl.markAsTouched();

    // Si el CP es inválido según los validadores del control → mostramos mensaje y limpiamos
    if (cpCtrl.invalid) {
      this.showError('El código postal debe tener exactamente 5 dígitos.');
      this.resetUbicacion();
      return;
    }

    const cp = String(cpCtrl.value).trim();

    this.loadingColonias = true;
    this.coloniasCp = [];
    this.form.get('colonia')?.disable({ emitEvent: false });

    this.dipomexSvc.getCodigoPostal(cp).subscribe({
      next: (res: CodigoPostalResponse) => {
        this.loadingColonias = false;

        if (res.error || !res.codigo_postal) {
          this.showError('Código postal no encontrado. Verifica los 5 dígitos e intenta de nuevo.');
          this.resetUbicacion();
          return;
        }


        const cpData: any = res.codigo_postal;
        console.log('Respuesta CP:', cpData);

        // IDs SOLO si vienen en la respuesta; si no, se quedan null
        const rawEstadoId = cpData.estado_id ?? cpData.ESTADO_ID ?? null;
        const rawMunicipioId = cpData.municipio_id ?? cpData.MUNICIPIO_ID ?? null;

        const estadoId =
          rawEstadoId != null ? String(rawEstadoId).padStart(2, '0') : null;
        const municipioId =
          rawMunicipioId != null ? String(rawMunicipioId).padStart(3, '0') : null;

        // Texto para los inputs de solo lectura
        this.estadoTexto = cpData.estado ?? cpData.ESTADO ?? '';
        this.municipioTexto = cpData.municipio ?? cpData.MUNICIPIO ?? '';

        // Colonias normalizadas (soporta array de strings u objetos)
        this.coloniasCp = this.mapColoniasFromCpData(cpData);
        console.log('colonias normalizadas:', this.coloniasCp);

        const coloniaCtrl = this.form.get('colonia');

        if (this.coloniasCp.length) {
          // Si hay colonias → colonia obligatoria
          coloniaCtrl?.setValidators([Validators.required]);
          coloniaCtrl?.enable({ emitEvent: false });
        } else {
          // Sin colonias → limpiamos y deshabilitamos
          coloniaCtrl?.clearValidators();
          coloniaCtrl?.disable({ emitEvent: false });
        }
        coloniaCtrl?.updateValueAndValidity({ emitEvent: false });

        // Guardamos lo que tengamos (ids pueden ser null)
        this.form.patchValue(
          {
            estado: estadoId,
            municipio: municipioId,
            colonia: null,
          },
          { emitEvent: false }
        );

        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingColonias = false;
        console.error('Error consultando CP', err);
        this.showError('No se pudo obtener información del código postal.');
        this.resetUbicacion();
      }
    });
  }

  // ✅ Reinicia TODO lo relacionado a Dipomex / Ubicación
  private resetUbicacionHard(): void {
    // Flags/listas
    this.loadingColonias = false;
    this.coloniasCp = [];

    // Textos readonly
    this.estadoTexto = '';
    this.municipioTexto = '';

    // colonia control: vacío, sin validadores y deshabilitado
    const coloniaCtrl = this.form.get('colonia');
    coloniaCtrl?.clearValidators();
    coloniaCtrl?.setValue(null, { emitEvent: false });
    coloniaCtrl?.disable({ emitEvent: false });
    coloniaCtrl?.updateValueAndValidity({ emitEvent: false });

    // ✅ IMPORTANTE: estado/municipio a 0 como pediste
    // (si prefieres null, lo cambiamos, pero aquí va "0")
    this.form.patchValue(
      {
        estado: 0,
        municipio: 0,
        colonia: null,
        cp: '' // opcional: también limpia CP para no arrastrar ubicación
      },
      { emitEvent: false }
    );

    // también limpia el id pendiente de colonia
    this.pendingColoniaId = null;

    // refresco UI
    this.cdr.detectChanges();
  }


  resetUbicacion() {
    this.coloniasCp = [];
    this.estadoTexto = '';
    this.municipioTexto = '';

    const coloniaCtrl = this.form.get('colonia');

    coloniaCtrl?.clearValidators();
    coloniaCtrl?.setValue(null, { emitEvent: false });
    coloniaCtrl?.disable({ emitEvent: false });
    coloniaCtrl?.updateValueAndValidity({ emitEvent: false });

    this.form.patchValue(
      {
        estado: null,
        municipio: null,
        colonia: null,
      },
      { emitEvent: false }
    );
  }




  // ===== Submit =====

  onSubmit() {
  // ✅ Activa modo "intentó guardar" para mostrar errores visuales
  this.submitted = true;

  if (this.form.invalid) {
    this.form.markAllAsTouched();

    if (this.f['cp'].invalid) {
      this.showError('Revisa el código postal.');
    } else if (this.f['colonia'].invalid) {
      this.showError('Debes seleccionar una colonia.');
    } else {
      this.showError('Formulario inválido. Revisa los campos obligatorios.');
    }
    return;
  }

  // Incluye también valores de controles deshabilitados
  const v = this.form.getRawValue();

  const payload: Empresa = {
    id: this.currentId ?? 0,

    nombre: String(v.nombre || '').trim(),
    rfc: String(v.rfc || '').trim(),
    telefono: String(v.telefono || '').trim(),
    email: String(v.email || '').trim(),

    giro: this.nz(v.giro),
    mision: this.nz(v.mision),
    domicilio: this.nz(v.domicilio),

    // Dipomex → BD
    estado: this.toNullableNumber(v.estado),
    municipio: this.toNullableNumber(v.municipio),
    colonia: this.toNullableNumber(v.colonia),

    ciudad: this.nz(v.ciudad),
    cp: this.nz(v.cp),

    titular: this.nz(v.titular),
    puestoTitular: this.nz(v.puestoTitular),
  };

  console.log('PAYLOAD EMPRESA QUE SE MANDA AL BACK:', payload);

  if (this.isEditing()) {
    this.empresasSvc.update(this.currentId!, payload).subscribe({
      next: () => {
        this.showSuccess('Empresa actualizada.');
        this.submitted = false; // ✅ resetea bandera visual
        this.reset();
        this.load();
        this.showDialog = false;
      },
      error: (e) => {
        console.error('Update empresa error', e);
        this.showError('No se pudo actualizar la empresa. Verifica los datos e intenta nuevamente.');
      }
    });
    return;
  }

  this.empresasSvc.create(payload).subscribe({
    next: () => {
      this.showSuccess('Empresa creada.');
      this.submitted = false; // ✅ resetea bandera visual
      this.reset();
      this.load();
      this.showDialog = false;
    },
    error: (e) => {
      console.error('Create empresa error', e);
      this.showError('No se pudo crear la empresa. Verifica los datos e intenta nuevamente.');
    }
  });
}

  // ===== Edición =====

  editar(row: Empresa) {
    this.isEditing.set(true);
    this.currentId = row.id ?? null;

    // Colonia guardada en BD (número). La usamos cuando ya tengamos las opciones del CP.
    this.pendingColoniaId = row.colonia != null ? row.colonia.toString() : null;

    this.form.patchValue(
      {
        nombre: row.nombre ?? '',
        rfc: row.rfc ?? '',
        telefono: row.telefono ?? '',
        email: row.email ?? '',
        giro: row.giro ?? '',
        mision: row.mision ?? '',
        domicilio: row.domicilio ?? '',

        // Estos los rellenaremos a partir del CP
        estado: null,
        municipio: null,
        colonia: null,

        ciudad: row.ciudad ?? '',
        cp: row.cp ?? '',
        titular: row.titular ?? '',
        puestoTitular: row.puestoTitular ?? '',
      },
      { emitEvent: false }
    );

    // Limpiar visualmente mientras recargamos datos del CP
    this.estadoTexto = '';
    this.municipioTexto = '';
    this.coloniasCp = [];

    if (row.cp) {
      this.loadingColonias = true;
      this.form.get('colonia')?.disable({ emitEvent: false });

      this.dipomexSvc.getCodigoPostal(row.cp).subscribe({
        next: (res: CodigoPostalResponse) => {
          this.loadingColonias = false;

          if (!res.error && res.codigo_postal) {
            const cpData: any = res.codigo_postal;
            console.log('CP en edición:', cpData);

            // === IDs SOLO si vienen ===
            const rawEstadoId = cpData.estado_id ?? cpData.ESTADO_ID ?? null;
            const rawMunicipioId = cpData.municipio_id ?? cpData.MUNICIPIO_ID ?? null;

            const estadoId =
              rawEstadoId != null ? String(rawEstadoId).padStart(2, '0') : null;
            const municipioId =
              rawMunicipioId != null ? String(rawMunicipioId).padStart(3, '0') : null;

            // Textos para los inputs de solo lectura
            this.estadoTexto = cpData.estado ?? cpData.ESTADO ?? '';
            this.municipioTexto = cpData.municipio ?? cpData.MUNICIPIO ?? '';

            // Colonias normalizadas
            this.coloniasCp = this.mapColoniasFromCpData(cpData);

            this.form.patchValue(
              {
                estado: estadoId,
                municipio: municipioId,
                colonia: this.pendingColoniaId, // por ejemplo "1"
              },
              { emitEvent: false }
            );

            if (this.coloniasCp.length) {
              this.form.get('colonia')?.enable({ emitEvent: false });
            } else {
              this.form.get('colonia')?.disable({ emitEvent: false });
            }

            this.cdr.detectChanges();
          } else {
            this.resetUbicacion();
          }
        },
        error: (err) => {
          this.loadingColonias = false;
          console.error('Error CP en edición', err);
          this.showError('No se pudieron cargar las colonias del CP.');
          this.resetUbicacion();
        }
      });
    }

    setTimeout(() => {
      const el = document.querySelector('form');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);

  }


  cancelarEdicion() {
    this.reset(); // ✅ hace hard reset (estado/municipio 0 + colonia)
  }


  reset() {
  this.submitted = false; // ✅ importante

  this.form.reset();
  this.form.patchValue(
    { estado: 0, municipio: 0, colonia: null },
    { emitEvent: false }
  );

  this.isEditing.set(false);
  this.currentId = null;
  this.municipios = [];
  this.pendingColoniaId = null;

  this.resetUbicacionHard();
}


  // ===== UI helpers =====

  showSuccess(msg: string) {
    this.toast.add({ severity: 'success', summary: 'Listo', detail: msg, life: 10000 });
  }

  showError(msg: string) {
    this.toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 10000 });
  }

  searchValue = '';
  clear(table: Table) {
    table.clear();
    this.searchValue = '';
  }

  showDialog = false;
  dialogMode: 'add' | 'edit' = 'add';

  openAddDialog() {
    this.dialogMode = 'add';

    // ✅ limpia todo antes de abrir
    this.reset();

    this.showDialog = true;
  }


  openEditDialog(row: Empresa) {
    this.dialogMode = 'edit';
    this.editar(row);
    this.showDialog = true;
  }

  onDialogHide() {
    // ✅ cada vez que se cierra el diálogo, se limpia todo
    this.reset();
    this.dialogMode = 'add';
  }


  private normalizeColoniaId(raw: any, fallbackIndex: number): string {
    // si viene algo tipo "0007" o 7 → lo convertimos a "7"
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      return String(n);
    }

    // si de plano viene undefined/null, usamos el índice
    if (raw === undefined || raw === null) {
      return String(fallbackIndex);
    }

    // cualquier otra cosa, la convertimos a string directo
    return String(raw);
  }

  private mapColoniasFromCpData(cpData: any): CpColonia[] {
    const coloniasRaw = cpData.colonias ?? cpData.COLONIAS ?? [];

    return (coloniasRaw as any[]).map((c, idx) => {
      if (typeof c === 'string') {
        return {
          colonia_id: String(idx),
          colonia: c,
        };
      }

      const id =
        c.colonia_id ??
        c.COLONIA_ID ??
        c.id ??
        c.Id ??
        idx;

      const nombre =
        c.colonia ??
        c.COLONIA ??
        c.nombre ??
        c.Nombre ??
        `Colonia ${idx + 1}`;

      return {
        colonia_id: String(id),
        colonia: nombre,
      };
    });
  }


}
