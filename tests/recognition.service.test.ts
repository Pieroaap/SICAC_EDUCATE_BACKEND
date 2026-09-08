import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/infrastructure/database/client.js';
import { recognizeCourseBatch } from '../src/modules/enrollment/recognition.js';
import { calculateGraduationEligibility } from '../src/modules/graduation/service.js';
import { enrollInScheduledCourse } from '../src/modules/enrollment/service.js';

function database(selectResults: unknown[][], inserted: unknown[] = []) {
  const values = vi.fn();
  const tx = {
    select: vi.fn(() => {
      const rows = selectResults.shift() ?? [];
      const query = { from: () => query, innerJoin: () => query, where: () => query,
        limit: () => Promise.resolve(rows), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
      return query;
    }),
    insert: vi.fn(() => ({ values: (input: unknown) => {
      values(input);
      const query = { onConflictDoNothing: () => query, returning: async () => inserted };
      return query;
    } })),
  };
  const transaction = vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx));
  return { db: { ...tx, transaction } as unknown as Database, values, transaction };
}
const input = { personaId: 'student', actorId: 'admin', planCursoIds: ['act1', 'act2', 'act4'],
  periodoReferencial: 'Anterior a 2026-III', observacion: 'Aprobaciones históricas confirmadas por administración' };

describe('reconocimiento histórico selectivo', () => {
  it('guarda únicamente 1, 2 y 4, con actor y motivo, sin nota ni curso 3 implícito', async () => {
    const records = input.planCursoIds.map((id) => ({ id }));
    const { db, values, transaction } = database([records, []], records);
    await expect(recognizeCourseBatch(db, input)).resolves.toEqual({ data: records });
    expect(transaction).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(input.planCursoIds.map((planCursoId) => ({
      personaId: 'student', planCursoId, periodoReferencial: input.periodoReferencial,
      observacion: input.observacion, fuente: 'manual', reconocidoPorPersonaId: 'admin', createdBy: 'admin',
    })));
  });
  it('rechaza cursos ajenos al plan sin escribir', async () => {
    const { db, values } = database([[{ id: 'act1' }]]);
    await expect(recognizeCourseBatch(db, input)).rejects.toThrow('no pertenecen');
    expect(values).not.toHaveBeenCalled();
  });
  it('rechaza una aprobación regular ya publicada', async () => {
    const { db, values } = database([input.planCursoIds.map((id) => ({ id })), [{ id: 'act1' }]]);
    await expect(recognizeCourseBatch(db, input)).rejects.toThrow('aprobación publicada');
    expect(values).not.toHaveBeenCalled();
  });
  it('propaga conflicto dentro de la transacción para revertir un lote parcialmente insertado', async () => {
    const { db, transaction } = database([input.planCursoIds.map((id) => ({ id })), []], [{ id: 'act4' }]);
    await expect(recognizeCourseBatch(db, input)).rejects.toThrow('no se guardó el lote');
    await expect(transaction.mock.results[0]?.value).rejects.toThrow('no se guardó el lote');
  });
  it('rechaza selección vacía, duplicados y motivo vacío', async () => {
    const { db, transaction } = database([]);
    for (const patch of [{ planCursoIds: [] }, { planCursoIds: ['act1', 'act1'] }, { observacion: ' ' }]) {
      await expect(recognizeCourseBatch(db, { ...input, ...patch })).rejects.toThrow();
    }
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('Actuación 3 pendiente con 1, 2 y 4 reconocidas', () => {
  it.each([false, true])('egreso requiere aprobación publicada de 3: publicada=%s', async (published) => {
    const { db } = database([
      [{ personaId: 'student', planCurricularId: 'plan' }],
      ['act1', 'act2', 'act3', 'act4'].map((id) => ({ id })),
      published ? [{ id: 'act3' }] : [],
      ['act1', 'act2', 'act4'].map((id) => ({ id })),
    ]);
    await expect(calculateGraduationEligibility(db, 'enrollment')).resolves.toEqual({ eligible: published, required: 4, approved: published ? 4 : 3 });
  });
  it('permite inscribir 3 con el antecedente de 2', async () => {
    const { db, values } = database([
      [{ enrollment: { estado: 'activo', personaId: 'student', planCurricularId: 'plan', periodoAcademicoId: 'period' },
        scheduled: { estado: 'activo', periodoAcademicoId: 'period' }, planCourse: { id: 'act3', planCurricularId: 'plan' } }],
      [], [{ cursoPrerrequisitoId: 'act2' }], [], [{ id: 'act2' }],
    ], [{ id: 'registration3' }]);
    await expect(enrollInScheduledCourse(db, 'enrollment', 'scheduled3', '2026-09-05', 'admin')).resolves.toEqual({ id: 'registration3' });
    expect(values).toHaveBeenCalledOnce();
  });
  it('mantiene el bloqueo si sigue faltando un prerrequisito y no hay excepción', async () => {
    const { db, values } = database([
      [{ enrollment: { estado: 'activo', personaId: 'student', planCurricularId: 'plan', periodoAcademicoId: 'period' },
        scheduled: { estado: 'activo', periodoAcademicoId: 'period' }, planCourse: { id: 'act3', planCurricularId: 'plan' } }],
      [], [{ cursoPrerrequisitoId: 'act2' }], [], [], [],
    ]);
    await expect(enrollInScheduledCourse(db, 'enrollment', 'scheduled3', '2026-09-05', 'admin')).rejects.toThrow('No cumple prerrequisitos');
    expect(values).not.toHaveBeenCalled();
  });
});
