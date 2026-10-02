import { describe, expect, it, vi } from 'vitest';
import * as xlsx from 'xlsx';
import type { Database } from '../src/infrastructure/database/client.js';
import { importAcademicWorkbook } from '../src/modules/importaciones/service.js';
import { importTeachers } from '../src/modules/identity/people/service.js';
vi.mock('../src/modules/identity/people/service.js', () => ({ importTeachers: vi.fn(async () => ({})) }));
vi.mock('../src/modules/students/service.js', () => ({ importStudents: vi.fn(async () => ({})) }));

describe('documentos en Excel', () => {
  it('rechaza números incompletos sin inventar un cero', async () => {
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([['DNI'], [1234567]]), 'PROFESORES');
    await expect(importAcademicWorkbook({} as Database, xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }), { actorId: 'test', dryRun: true })).rejects.toThrow('8 dígitos');
  });
  it.each(['texto', 'formato numérico'])('preserva cero inicial en DNI como %s', async (kind) => {
    const sheet = xlsx.utils.aoa_to_sheet([['DNI', 'Nombres', 'Apellidos', 'Correo', 'Estado'],
      [kind === 'texto' ? '01234567' : 1234567, 'Prueba', 'Docente', 'test@example.test', 'activo']]);
    if (kind !== 'texto') sheet.A2!.z = '00000000';
    const book = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(book, sheet, 'PROFESORES');
    await importAcademicWorkbook({} as Database, xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }), { actorId: 'test', dryRun: true });
    expect(importTeachers).toHaveBeenLastCalledWith(expect.anything(), [expect.objectContaining({ dni: '01234567' })], 'test', true);
  });
});
