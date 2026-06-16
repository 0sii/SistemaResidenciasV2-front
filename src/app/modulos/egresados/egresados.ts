import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { EgresadosService, EgresadoDto } from '../../service/egresados.service';
import { PeriodosAcademicosService, PeriodoAcademicoDto } from '../../service/periodoAcademico.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-egresados',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, ToastModule, ButtonModule, SelectModule, DialogModule],
  templateUrl: './egresados.html',
  styleUrls: ['./egresados.css'],
  providers: [MessageService]
})
export class EgresadosComponent implements OnInit {
  private egresadosSvc = inject(EgresadosService);
  private periodosSvc  = inject(PeriodosAcademicosService);
  private toast        = inject(MessageService);

  egresados = signal<EgresadoDto[]>([]);
  loading   = signal(false);
  total     = signal(0);

  searchValue = '';
  page        = 1;
  pageSize    = 20;

  // Filtro periodo
  periodos: PeriodoAcademicoDto[] = [];
  periodoSeleccionado: number | null = null;

  // Modal detalle
  modalVisible   = false;
  egresadoDetalle: EgresadoDto | null = null;

  ngOnInit(): void {
    this.cargarPeriodos();
    this.cargar();
  }

  cargarPeriodos(): void {
    this.periodosSvc.getAll().subscribe({
      next: p => {
        this.periodos = [...p].sort((a, b) =>
          new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()
        );
      },
      error: () => {}
    });
  }

  cargar(): void {
    this.loading.set(true);
    this.egresadosSvc
      .getEgresados(this.searchValue, this.page, this.pageSize, this.periodoSeleccionado)
      .subscribe({
        next: res => {
          this.egresados.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => {
          this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los egresados' });
          this.loading.set(false);
        }
      });
  }

  onSearch(): void      { this.page = 1; this.cargar(); }
  onFiltroChange(): void { this.page = 1; this.cargar(); }

  limpiarFiltros(): void {
    this.searchValue         = '';
    this.periodoSeleccionado = null;
    this.page                = 1;
    this.cargar();
  }

  onPageChange(event: any): void {
    this.page     = Math.floor(event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.cargar();
  }

  // ── Modal ──────────────────────────────────────────────────────────────
  verDetalle(row: EgresadoDto): void {
    this.egresadoDetalle = row;
    this.modalVisible    = true;
  }

  cerrarModal(): void {
    this.modalVisible    = false;
    this.egresadoDetalle = null;
  }

  // ── Exportar a Excel ───────────────────────────────────────────────────
  exportarExcel(): void {
    if (!this.egresados().length) return;

    const headers = [
      'Nombre', 'No. Control', 'Correo Personal', 'Teléfono',
      'Proyecto', 'Descripción', 'Empresa', 'Correo Empresa', 'Tel. Empresa',
      'Modalidad', 'Asesor', 'Revisor', 'Período', 'Carrera'
    ];

    const rows = this.egresados().map(e => [
      e.nombreCompleto,
      e.noControl            ?? '',
      e.correoPersonal       ?? '',
      e.telefono             ?? '',
      e.tituloProyecto       ?? '',
      e.descripcionProyecto  ?? '',
      e.empresa              ?? '',
      e.empresaCorreo        ?? '',
      e.empresaTelefono      ?? '',
      e.modalidad            ?? '',
      e.asesor               ?? '',
      e.revisor              ?? '',
      e.periodo              ?? '',
      e.carrera              ?? '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Egresados');
    XLSX.writeFile(wb, 'Egresados.xlsx');
  }
}
