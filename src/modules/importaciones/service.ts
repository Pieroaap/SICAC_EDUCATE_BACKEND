import * as xlsx from 'xlsx';
import type { Database } from '../../infrastructure/database/client.js';
import { importStudents, type StudentImportRow } from '../students/service.js';
import { importTeachers, type TeacherImportRow } from '../identity/people/service.js';
import { badRequest } from '../../shared/errors.js';

type WorkbookImportOptions = {
  dryRun: boolean;
  actorId: string;
};

function normalizeSheetName(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeHeader(value: string): string {
  return value.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function readSheetRows(workbook: xlsx.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    blankrows: false,
    raw: true,
  });
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function getCell(row: Record<string, unknown>, ...headers: string[]): unknown {
  const cells = new Map(
    Object.entries(row).map(([header, value]) => [normalizeHeader(header), value]),
  );
  return headers.map(normalizeHeader).map((header) => cells.get(header))
    .find((value) => value !== undefined) ?? '';
}

function toStudentRows(rows: Record<string, unknown>[]): StudentImportRow[] {
  return rows.map((row) => ({
    apellidos: asText(getCell(row, 'Apellidos')),
    nombres: asText(getCell(row, 'Nombres')),
    telefono: asText(getCell(row, 'Teléfono', 'Telefono')),
    dni: asText(getCell(row, 'DNI')),
    estado: asText(getCell(row, 'Estado')),
    anioIngreso: Number(getCell(row, 'Año ingreso', 'Año de ingreso', 'anioIngreso')),
    periodoIngreso: asText(getCell(row, 'Periodo ingreso', 'Periodo de ingreso', 'periodoIngreso')),
    beneficio: asText(getCell(row, 'Beneficio')),
    tipoBeneficio: asText(getCell(row, 'Tipo Beneficio', 'Tipo de beneficio', 'tipoBeneficio')),
  }));
}

function toTeacherRows(rows: Record<string, unknown>[]): TeacherImportRow[] {
  return rows.map((row) => ({
    apellidos: asText(getCell(row, 'Apellidos')),
    nombres: asText(getCell(row, 'Nombres')),
    dni: asText(getCell(row, 'DNI')),
    correo: asText(getCell(row, 'Correo', 'Email')),
    estado: asText(getCell(row, 'Estado')),
  }));
}

export async function importAcademicWorkbook(
  db: Database,
  file: Buffer,
  options: WorkbookImportOptions,
) {
  let workbook: xlsx.WorkBook;
  try {
    workbook = xlsx.read(file, { type: 'buffer' });
  } catch {
    throw badRequest('El archivo no es un Excel valido');
  }

  const sheets = new Map(workbook.SheetNames.map((name) => [normalizeSheetName(name), name]));
  const alumnosSheet = sheets.get('ALUMNOS');
  const profesoresSheet = sheets.get('PROFESORES');

  if (!alumnosSheet && !profesoresSheet) {
    throw badRequest('El archivo debe contener al menos una hoja llamada ALUMNOS o PROFESORES');
  }

  const result: {
    alumnos?: Awaited<ReturnType<typeof importStudents>>;
    profesores?: Awaited<ReturnType<typeof importTeachers>>;
  } = {};

  if (alumnosSheet) {
    const rows = toStudentRows(readSheetRows(workbook, alumnosSheet));
    result.alumnos = await importStudents(db, rows, options.actorId, options.dryRun);
  }

  if (profesoresSheet) {
    const rows = toTeacherRows(readSheetRows(workbook, profesoresSheet));
    result.profesores = await importTeachers(db, rows, options.actorId, options.dryRun);
  }

  return {
    dryRun: options.dryRun,
    applied: !options.dryRun,
    workbook: workbook.SheetNames,
    ...result,
  };
}
