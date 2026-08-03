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

export type RoleAssignmentForCleanup = {
  fechaInicio: string;
  updatedAt: Date;
  createdAt: Date;
  tieBreaker: string;
};

export function selectRoleAssignmentToKeep<T extends RoleAssignmentForCleanup>(assignments: T[]): T | undefined {
  return assignments.reduce<T | undefined>((latest, candidate) => {
    if (!latest) return candidate;
    const comparison = compareRoleAssignmentRecency(candidate, latest);
    return comparison > 0 ? candidate : latest;
  }, undefined);
}

export function compareRoleAssignmentRecency(
  left: RoleAssignmentForCleanup,
  right: RoleAssignmentForCleanup,
): number {
  return left.fechaInicio.localeCompare(right.fechaInicio)
    || left.updatedAt.getTime() - right.updatedAt.getTime()
    || left.createdAt.getTime() - right.createdAt.getTime()
    || left.tieBreaker.localeCompare(right.tieBreaker);
}

export async function runRoleReplacement<T>(
  transaction: <Result>(work: () => Promise<Result>) => Promise<Result>,
  activateDestination: () => Promise<void>,
  deactivateOrigin: () => Promise<T>,
): Promise<T> {
  return transaction(async () => {
    await activateDestination();
    return deactivateOrigin();
  });
}
