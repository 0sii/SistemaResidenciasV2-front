

export enum EstadoProyectoId {
    NUEVO = 1,
    DISPONIBLE = 2,
    ESPERA_REVISOR_ANTEPROYECTO = 3,
    ESPERA_REVISION_ANTEPROYECTO = 4,
    ANTEPROYECTO_REVISADO = 5,
    ESPERA_ASESOR_INTERNO = 6,
    EN_CURSO = 7,
    FINALIZADO = 8,
    CANCELADO = 9
}

export type EstadoColor = {
    label: string;
    severity: 'success' | 'info' | 'warn' | 'danger' | 'secondary';
    bgClass: string;
    textClass: string;
    shortLabel: string;
};

export const ESTADO_PROYECTO_UI: Record<number, EstadoColor> = {
  [EstadoProyectoId.NUEVO]: {
    label: 'Nuevo',
    shortLabel: 'Nuevo',
    severity: 'secondary',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-700'
  },

  [EstadoProyectoId.DISPONIBLE]: {
    label: 'Disponible',
    shortLabel: 'Disponible',
    severity: 'info',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-700'
  },

  [EstadoProyectoId.ESPERA_REVISOR_ANTEPROYECTO]: {
    label: 'En Espera de Asignación de Revisor de Anteproyecto',
    shortLabel: 'Espera revisor (AP)',
    severity: 'warn',
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-800'
  },

  [EstadoProyectoId.ESPERA_REVISION_ANTEPROYECTO]: {
    label: 'En Espera de Revisión de Anteproyecto',
    shortLabel: 'Revisión de AP',
    severity: 'warn',
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-800'
  },

  [EstadoProyectoId.ANTEPROYECTO_REVISADO]: {
    label: 'Anteproyecto revisado',
    shortLabel: 'AP revisado',
    severity: 'info',
    bgClass: 'bg-indigo-100',
    textClass: 'text-indigo-700'
  },

  [EstadoProyectoId.ESPERA_ASESOR_INTERNO]: {
    label: 'En Espera de Asignación de Asesor Interno',
    shortLabel: 'Espera asesor',
    severity: 'info',
    bgClass: 'bg-cyan-100',
    textClass: 'text-cyan-700'
  },

  [EstadoProyectoId.EN_CURSO]: {
    label: 'En curso',
    shortLabel: 'En curso',
    severity: 'success',
    bgClass: 'bg-green-100',
    textClass: 'text-green-700'
  },

  [EstadoProyectoId.FINALIZADO]: {
    label: 'Finalizado',
    shortLabel: 'Finalizado',
    severity: 'success',
    bgClass: 'bg-emerald-100',
    textClass: 'text-emerald-700'
  },

  [EstadoProyectoId.CANCELADO]: {
    label: 'Cancelado',
    shortLabel: 'Cancelado',
    severity: 'danger',
    bgClass: 'bg-red-100',
    textClass: 'text-red-700'
  }
};