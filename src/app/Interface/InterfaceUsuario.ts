import { ContactoEmergencia } from "./InterfaceContactoEmergencia";

export interface UserSlim {
  id: number;
  correo: string;
  activo: boolean;
}

export interface UserCreateRequest {
  correo: string;
  passwordHash: string;
  activo: boolean;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

export interface UserUpdateRequest {
  correo: string;
  activo: boolean;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

export interface PasswordUpdateRequest {
  password: string;
}

/* ===== ESTUDIANTES (EF) ===== */

/* ===== ESTUDIANTES (EF) ===== */

export interface EstudianteCreate {
  idUsuario: number;
  idProyecto: number | null;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;

  idcarrera?: number | null;
  domicilio?: string | null;
  ciudad?: string | null;

  cp?: string | null;           // ✅ nuevo (reemplaza idMunicipio)
  idestado?: number | null;

  noControl?: string | null;
  correoPersonal?: string | null;
  noSeguroSocial?: string | null;
  idDependenciaMedica?: number | null;
  telefonoCelular?: string | null;
  idContactoEmergencia?: number | null;
}

// Lista básica
export interface EstudianteListItem {
  id: number;
  idUsuario: number;
  idProyecto: number | null;
  correo: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;

  noControl?: string | null;
  correoPersonal?: string | null;
  telefonoCelular?: string | null;

  idcarrera?: number | null;
  cp?: string | null;           // ✅ nuevo
  idestado?: number | null;
  idDependenciaMedica?: number | null;
}

// Detalle
export interface EstudianteDetail extends EstudianteListItem {
  domicilio?: string | null;
  ciudad?: string | null;
  noSeguroSocial?: string | null;
  idContactoEmergencia?: number | null;
}


/* ===== DOCENTES ===== */

export interface DocenteCreate {
  idUsuario: number;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  correo: string;
  rfc?: string | null;
  telefono?: string | null;
  nivelAcademico?: string | null;
  esJefeDepartamento?: boolean;
}

export interface Docente extends DocenteCreate {
  id: number;
}

export interface DocenteListItem {
  id: number;
  idUsuario: number;
  correo: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  rfc?: string | null;
  telefono?: string | null;
  nivelAcademico?: string | null;
  esJefeDepartamento?: boolean;
}

/* ===== CATÁLOGOS / USUARIO ===== */

export interface Catalogo {
  id: number;
  descripcion: string;
  activo: boolean;
}

export interface Usuario {
  id: number;
  correo: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  activo: boolean;
}
