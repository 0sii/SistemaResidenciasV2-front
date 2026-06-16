export interface LoginRequest {
  email: string;
  password: string;
}

export interface User {
  id: number;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  correo: string;
  role?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
