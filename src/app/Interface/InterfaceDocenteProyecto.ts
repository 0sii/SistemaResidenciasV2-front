export type RelacionClave =
    | 'REVISOR_ANTEPROYECTO'
    | 'ASESOR_INTERNO'
    | 'REVISOR_RESIDENCIA'
    | string;

export interface DocenteProyectoItem {
    idProyecto: number;
    titulo: string | null;
    descripcion: string | null;
    objetivo: string | null;
    idPeriodoAcademico: number | null;
    idEstado: number | null;
    propuestaAlumno: boolean;

    idTipoRelacion: number;
    tipoRelacionClave: RelacionClave;
    tipoRelacionDescripcion: string;
    fechaInscripcion: string; // viene como ISO
}

export interface ProyectoDocenteViewResponse {
    relacion: {
        idProyecto: number;
        idDocente: number;
        idTipoRelacion: number;
        tipoRelacionClave: RelacionClave;
        tipoRelacionDescripcion: string;
        fechaInscripcion: string;
    };
    proyecto: any; // puedes tiparlo con tu interfaz Proyectos si ya la tienes
    estudiantes: Array<{
        id: number;
        nombre: string;
        apellidoPaterno: string;
        apellidoMaterno: string;
        noControl: string;
        correo: string;
    }>;
    anteproyectos: any[];
}
