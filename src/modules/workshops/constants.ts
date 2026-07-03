export type ScheduledWorkshopState = 'borrador' | 'abierto' | 'en_curso' | 'finalizado' | 'cancelado';

const transitions: Record<ScheduledWorkshopState, ScheduledWorkshopState[]> = {
  borrador: ['abierto', 'cancelado'],
  abierto: ['en_curso', 'cancelado'],
  en_curso: ['finalizado', 'cancelado'],
  finalizado: [],
  cancelado: [],
};

export function canTransitionWorkshop(from: ScheduledWorkshopState, to: ScheduledWorkshopState) {
  return transitions[from].includes(to);
}

export function availableWorkshopCapacity(maximum: number, activeEnrollments: number) {
  return Math.max(0, maximum - activeEnrollments);
}
