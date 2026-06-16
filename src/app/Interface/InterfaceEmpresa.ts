export interface Empresa {
  id?: number;
  nombre: string;
  rfc: string;

  giro?: string | null;
  mision?: string | null;
  domicilio?: string | null;

  estado?: number | null;
  municipio?: number | null;
  colonia?: number | null; // 👈 si quieres el ID
  ciudad?: string | null;
  cp?: string | null;

  telefono: string;
  email: string;
  titular?: string | null;
  puestoTitular?: string | null;
}



export interface Contacto {
  id: number;
  idEmpresa: number;
  nombre: string;
  telefono: string;
  correo: string;
}

