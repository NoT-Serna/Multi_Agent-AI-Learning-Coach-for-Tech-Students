export interface Autenticacion {
  cuenta: string;
  contrasenaHash: string;
}

export interface Usuario {
  id: number;
  cuenta: string;
  nombre: string;
  apellido: string;
  edad: string;
  intereses: readonly string[];
  idsCursos: readonly number[];
}

export interface Curso {
  idCurso: number;
  rutaCronograma: string;
  rutaAvances: string;
  rutaConversaciones: string;
  rutaEvaluaciones: string;
  titulo: string;
}

export interface SignUpResult {
  auth: Autenticacion;
  usuario: Usuario;
}
