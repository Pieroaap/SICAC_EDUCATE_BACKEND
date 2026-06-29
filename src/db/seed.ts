import { getDatabase, closeDatabase } from '../infrastructure/database/client.js';
import { roles } from './schema/index.js';

const roleSeed = [
  ['ADMINISTRADOR_SISTEMA', 'Administrador del sistema'],
  ['DIRECTOR_ACADEMICO', 'Director académico'],
  ['GESTOR_ACADEMICO', 'Gestor académico'],
  ['PROFESOR', 'Profesor'],
  ['ALUMNO', 'Alumno'],
] as const;

const db = getDatabase();
await db.insert(roles).values(roleSeed.map(([codigo, nombre]) => ({
  codigo, nombre, descripcion: `Rol operativo: ${nombre}`,
}))).onConflictDoUpdate({
  target: roles.codigo,
  set: { estado: 'activo', updatedAt: new Date() },
});
await closeDatabase();
