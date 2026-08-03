import { badRequest, conflict, forbidden } from '../../../shared/errors.js';

export const systemRoles = [
  'ALUMNO',
  'PROFESOR',
  'GESTOR_ACADEMICO',
  'DIRECTOR_ACADEMICO',
  'ADMINISTRADOR_SISTEMA',
] as const;

export type SystemRole = typeof systemRoles[number];

type RemovalContext = {
  personId: string;
  actorId: string;
  role: SystemRole;
  activeRoleCount: number;
  activeAdministratorCount: number;
};

export function assertDirectRoleRemovalAllowed(context: RemovalContext): void {
  if (context.activeRoleCount <= 1) {
    throw badRequest('La persona debe conservar al menos un rol activo');
  }
  assertAdministrativeRoleCanBeRemoved(context);
}

export function assertReplacementAllowed(
  context: Omit<RemovalContext, 'activeRoleCount'>,
): void {
  assertAdministrativeRoleCanBeRemoved({ ...context, activeRoleCount: 2 });
}

function assertAdministrativeRoleCanBeRemoved(context: RemovalContext): void {
  if (context.role !== 'ADMINISTRADOR_SISTEMA') return;
  if (context.personId === context.actorId) {
    throw forbidden('No puede retirar su propio rol ADMINISTRADOR_SISTEMA');
  }
  if (context.activeAdministratorCount <= 1) {
    throw conflict('No se puede retirar al último ADMINISTRADOR_SISTEMA activo');
  }
}

export function assertDestinationCanBeActivated(isAlreadyActive: boolean): void {
  if (isAlreadyActive) throw conflict('La persona ya tiene este rol activo');
}

export function assertTeacherRoleStatusChangeAuthorized(
  requestedState: 'activo' | 'inactivo',
  actorRoles: string[],
): void {
  if (requestedState === 'inactivo' && !actorRoles.includes('ADMINISTRADOR_SISTEMA')) {
    throw forbidden('Solo ADMINISTRADOR_SISTEMA puede inactivar el rol PROFESOR');
  }
}

export async function runRoleReplacement<T>(
  activateDestination: () => Promise<void>,
  deactivateOrigin: () => Promise<T>,
): Promise<T> {
  await activateDestination();
  return deactivateOrigin();
}
