export interface WeeklyTask {
  id: number;
  title: string;
  description: string;
  day: string;
  completed: boolean;
  duration: string;
  type: 'video' | 'reading' | 'practice' | 'project' | 'review';
}

export interface Goal {
  id: number;
  title: string;
  progress: number;
  deadline: string;
  totalTasks: number;
  completedTasks: number;
}

export interface CalendarEvent {
  id: number;
  title: string;
  date: string;
  time: string;
  type: 'study' | 'deadline' | 'review';
}

export interface ChatMessage {
  id: number;
  role: 'coach' | 'user';
  content: string;
  timestamp: string;
}

export const weeklyTasks: WeeklyTask[] = [
  { id: 1, title: 'Fundamentos de React Hooks', description: 'useState, useEffect y custom hooks', day: 'Lunes', completed: true, duration: '2h', type: 'video' },
  { id: 2, title: 'Práctica: Todo App con Hooks', description: 'Construir una app de tareas usando hooks', day: 'Lunes', completed: true, duration: '1.5h', type: 'practice' },
  { id: 3, title: 'Context API y useReducer', description: 'Manejo de estado global sin librerías externas', day: 'Martes', completed: true, duration: '2h', type: 'video' },
  { id: 4, title: 'Lectura: Patrones de React', description: 'Compound components y render props', day: 'Miércoles', completed: false, duration: '1h', type: 'reading' },
  { id: 5, title: 'React Router v6', description: 'Navegación y rutas dinámicas', day: 'Jueves', completed: false, duration: '2h', type: 'video' },
  { id: 6, title: 'Proyecto: Dashboard SPA', description: 'Aplicar routing y estado global', day: 'Viernes', completed: false, duration: '3h', type: 'project' },
  { id: 7, title: 'Repaso semanal', description: 'Quiz y revisión de conceptos clave', day: 'Sábado', completed: false, duration: '1h', type: 'review' },
];

export const goals: Goal[] = [
  { id: 1, title: 'Dominar React', progress: 65, deadline: '2026-05-15', totalTasks: 20, completedTasks: 13 },
  { id: 2, title: 'Aprender TypeScript', progress: 40, deadline: '2026-05-30', totalTasks: 15, completedTasks: 6 },
  { id: 3, title: 'Node.js Backend', progress: 20, deadline: '2026-06-20', totalTasks: 18, completedTasks: 4 },
  { id: 4, title: 'SQL y Bases de Datos', progress: 85, deadline: '2026-04-20', totalTasks: 12, completedTasks: 10 },
];

export const calendarEvents: CalendarEvent[] = [
  { id: 1, title: 'React Hooks', date: '2026-04-10', time: '09:00', type: 'study' },
  { id: 2, title: 'Práctica Todo App', date: '2026-04-10', time: '11:00', type: 'study' },
  { id: 3, title: 'Entrega: Proyecto SQL', date: '2026-04-12', time: '23:59', type: 'deadline' },
  { id: 4, title: 'Context API', date: '2026-04-11', time: '09:00', type: 'study' },
  { id: 5, title: 'Revisión semanal', date: '2026-04-13', time: '10:00', type: 'review' },
  { id: 6, title: 'React Router', date: '2026-04-14', time: '09:00', type: 'study' },
  { id: 7, title: 'Deadline: React módulo 3', date: '2026-04-18', time: '23:59', type: 'deadline' },
  { id: 8, title: 'TypeScript Generics', date: '2026-04-15', time: '10:00', type: 'study' },
  { id: 9, title: 'Proyecto Dashboard', date: '2026-04-16', time: '09:00', type: 'study' },
  { id: 10, title: 'Revisión de progreso', date: '2026-04-17', time: '16:00', type: 'review' },
];

export const chatMessages: ChatMessage[] = [
  { id: 1, role: 'coach', content: '¡Hola! He revisado tu progreso esta semana. Vas muy bien con React Hooks. Hoy toca profundizar en Context API.', timestamp: '09:00' },
  { id: 2, role: 'user', content: 'Genial, aunque me costó un poco entender useReducer ayer.', timestamp: '09:02' },
  { id: 3, role: 'coach', content: 'Es normal, useReducer puede ser confuso al inicio. Te sugiero que antes de Context API, repases este concepto con un ejercicio práctico. He ajustado tu plan para incluir 30 min extra de práctica.', timestamp: '09:03' },
  { id: 4, role: 'user', content: '¿Puedo mover la sesión de React Router al viernes? Tengo un compromiso el jueves.', timestamp: '09:05' },
  { id: 5, role: 'coach', content: 'Claro, he reorganizado tu plan. Moví React Router al viernes y el proyecto al sábado. Tu deadline del módulo 3 sigue siendo el 18 de abril, así que aún tienes margen. ¿Te parece bien?', timestamp: '09:06' },
];

export const streakDays = 12;
export const totalHoursThisWeek = 8.5;
export const averageScore = 82;
