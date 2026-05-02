import type { Curso } from '../types/auth';

export const cursosDisponibles: Curso[] = [
  {
    idCurso: 1,
    titulo: 'React desde cero',
    rutaCronograma: '/cursos/1/cronograma',
    rutaAvances: '/cursos/1/avances',
    rutaConversaciones: '/cursos/1/conversaciones',
    rutaEvaluaciones: '/cursos/1/evaluaciones',
  },
  {
    idCurso: 2,
    titulo: 'TypeScript avanzado',
    rutaCronograma: '/cursos/2/cronograma',
    rutaAvances: '/cursos/2/avances',
    rutaConversaciones: '/cursos/2/conversaciones',
    rutaEvaluaciones: '/cursos/2/evaluaciones',
  },
  {
    idCurso: 3,
    titulo: 'Node.js y APIs REST',
    rutaCronograma: '/cursos/3/cronograma',
    rutaAvances: '/cursos/3/avances',
    rutaConversaciones: '/cursos/3/conversaciones',
    rutaEvaluaciones: '/cursos/3/evaluaciones',
  },
  {
    idCurso: 4,
    titulo: 'SQL y bases de datos',
    rutaCronograma: '/cursos/4/cronograma',
    rutaAvances: '/cursos/4/avances',
    rutaConversaciones: '/cursos/4/conversaciones',
    rutaEvaluaciones: '/cursos/4/evaluaciones',
  },
  {
    idCurso: 5,
    titulo: 'Diseño UI/UX',
    rutaCronograma: '/cursos/5/cronograma',
    rutaAvances: '/cursos/5/avances',
    rutaConversaciones: '/cursos/5/conversaciones',
    rutaEvaluaciones: '/cursos/5/evaluaciones',
  },
  {
    idCurso: 6,
    titulo: 'Python para datos',
    rutaCronograma: '/cursos/6/cronograma',
    rutaAvances: '/cursos/6/avances',
    rutaConversaciones: '/cursos/6/conversaciones',
    rutaEvaluaciones: '/cursos/6/evaluaciones',
  },
];

export const interesesSugeridos = [
  'Frontend',
  'Backend',
  'Mobile',
  'DevOps',
  'Data Science',
  'IA / ML',
  'Diseño',
  'Ciberseguridad',
  'Cloud',
  'Bases de datos',
];
