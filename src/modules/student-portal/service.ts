import { and, desc, eq, inArray, or } from 'drizzle-orm';
import {
  asistencias, carreras, componentesEvaluacion, cursos, cursosProgramados, documentos,
  historialAcademico, horariosCursoProgramado, horariosTallerProgramado,
  inscripcionesTaller, matriculaCursosProgramados, matriculasCarrera, periodosAcademicos,
  planCursos, talleresProgramados,
} from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';

export async function getStudentPortalData(db: Database, personaId: string) {
  const courseRows = await db.select({
    matriculaCursoId: matriculaCursosProgramados.id,
    cursoProgramadoId: cursosProgramados.id,
    cursoCodigo: cursos.codigo,
    cursoNombre: cursos.nombre,
    ciclo: planCursos.ciclo,
    carreraId: carreras.id,
    carreraNombre: carreras.nombre,
    periodoId: periodosAcademicos.id,
    periodoNombre: periodosAcademicos.nombre,
    periodoEstado: periodosAcademicos.estado,
    estado: matriculaCursosProgramados.estado,
  }).from(matriculaCursosProgramados)
    .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
    .innerJoin(cursosProgramados, eq(cursosProgramados.id, matriculaCursosProgramados.cursoProgramadoId))
    .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
    .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
    .innerJoin(carreras, eq(carreras.id, matriculasCarrera.carreraId))
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
    .where(eq(matriculasCarrera.personaId, personaId))
    .orderBy(desc(periodosAcademicos.fechaInicio), planCursos.ciclo, planCursos.orden);

  const courseIds = courseRows.map((row) => row.cursoProgramadoId);
  const [schedules, assessments, history, attendance, workshops, documentRows] = await Promise.all([
    courseIds.length ? db.select().from(horariosCursoProgramado)
      .where(inArray(horariosCursoProgramado.cursoProgramadoId, courseIds)) : [],
    courseIds.length ? db.select().from(componentesEvaluacion)
      .where(inArray(componentesEvaluacion.cursoProgramadoId, courseIds))
      .orderBy(componentesEvaluacion.fechaProgramada, componentesEvaluacion.orden) : [],
    db.select({
      id: historialAcademico.id, cursoCodigo: cursos.codigo, cursoNombre: cursos.nombre,
      periodoNombre: periodosAcademicos.nombre, notaFinal: historialAcademico.notaFinal,
      letra: historialAcademico.letra, resultado: historialAcademico.resultado,
      escalaCodigo: historialAcademico.escalaCodigo,
    }).from(historialAcademico)
      .innerJoin(planCursos, eq(planCursos.id, historialAcademico.planCursoId))
      .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
      .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, historialAcademico.periodoAcademicoId))
      .where(eq(historialAcademico.personaId, personaId))
      .orderBy(desc(periodosAcademicos.fechaInicio), planCursos.ciclo),
    courseRows.length ? db.select({
      id: asistencias.id, matriculaCursoId: asistencias.matriculaCursoProgramadoId,
      cursoProgramadoId: asistencias.cursoProgramadoId, fecha: asistencias.fecha,
      estado: asistencias.estadoAsistencia,
    }).from(asistencias).where(inArray(asistencias.matriculaCursoProgramadoId, courseRows.map((row) => row.matriculaCursoId)))
      .orderBy(desc(asistencias.fecha)) : [],
    db.select({
      id: inscripcionesTaller.id, tallerProgramadoId: talleresProgramados.id,
      nombre: inscripcionesTaller.snapshotTallerNombre, estado: inscripcionesTaller.estado,
      fechaInicio: talleresProgramados.fechaInicio, fechaFin: talleresProgramados.fechaFin,
      modalidad: talleresProgramados.modalidad, ubicacion: talleresProgramados.ubicacion,
    }).from(inscripcionesTaller)
      .innerJoin(talleresProgramados, eq(talleresProgramados.id, inscripcionesTaller.tallerProgramadoId))
      .where(eq(inscripcionesTaller.personaId, personaId)),
    db.select({
      id: documentos.id, nombreOriginal: documentos.nombreOriginal, mimeType: documentos.mimeType,
      tamanoBytes: documentos.tamanoBytes, tipo: documentos.tipo, ambito: documentos.ambito,
      cursoProgramadoId: documentos.cursoProgramadoId, createdAt: documentos.createdAt,
    }).from(documentos).where(and(
      eq(documentos.estado, 'activo'),
      or(eq(documentos.ambito, 'INSTITUCION'), courseIds.length
        ? inArray(documentos.cursoProgramadoId, courseIds) : eq(documentos.id, '00000000-0000-0000-0000-000000000000')),
    )).orderBy(desc(documentos.createdAt)),
  ]);

  const workshopIds = workshops.map((row) => row.tallerProgramadoId);
  const workshopSchedules = workshopIds.length ? await db.select().from(horariosTallerProgramado)
    .where(inArray(horariosTallerProgramado.tallerProgramadoId, workshopIds)) : [];
  const currentCourses = courseRows.filter((row) => row.periodoEstado === 'activo' && row.estado === 'activo');

  return {
    inicio: {
      cursosActivos: currentCourses.length,
      proximasEvaluaciones: assessments.filter((item) => item.fechaProgramada && item.estado !== 'cerrada').slice(0, 5),
      cursos: currentCourses.slice(0, 5),
    },
    cursos: courseRows.map((course) => ({
      ...course,
      horarios: schedules.filter((item) => item.cursoProgramadoId === course.cursoProgramadoId),
    })),
    notas: history,
    horario: schedules,
    historial: history,
    asistencia: attendance,
    talleres: workshops.map((workshop) => ({
      ...workshop,
      horarios: workshopSchedules.filter((item) => item.tallerProgramadoId === workshop.tallerProgramadoId),
    })),
    documentos: documentRows,
  };
}
