export interface Proyecto {
  id: number;
  idEmpresa: number;

  titulo: string | null;
  descripcion: string | null;
  objetivo: string | null;

  fechaRegistor: string;
  noResidentes: number;

  horarioInicio: string | null;
  horarioFinal: string | null;

  idEspecializcion: number;
  idPeriodoAcademico: number;

  idModalidad: number | null;
  idEstado: number | null;
  propuestaAlumno: boolean;

  idEstudianteCreador?: number | null; // ✅ aquí
}

export interface ProyectoBanco extends Proyecto {
  registrados: number;
}
