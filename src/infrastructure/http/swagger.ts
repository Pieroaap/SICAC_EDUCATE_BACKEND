import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'API del Sistema Integral de Control Académico (SICAC)',
        description: 'Backend académico del Club de Arte y Cultura.',
        version: '0.1.0',
      },
      tags: [
        { name: 'Sistema', description: 'Estado y disponibilidad del servicio' },
        { name: 'Autenticación', description: 'Inicio de sesión y acceso' },
        { name: 'Usuarios', description: 'Aprovisionamiento de cuentas y roles' },
        { name: 'Dashboard', description: 'Resumen operativo adaptado al usuario' },
        { name: 'Alumnos', description: 'Perfiles operativos de alumnos' },
        { name: 'Profesores', description: 'Profesores y estado de su rol' },
        { name: 'Importaciones', description: 'Validación e importación inicial de datos' },
        { name: 'Estructura académica', description: 'Carreras, planes, cursos y periodos' },
        { name: 'Matrículas', description: 'Matrículas de carrera e inscripciones a cursos' },
        { name: 'Evaluación', description: 'Componentes y calificaciones' },
        { name: 'Evaluación académica', description: 'Notas, promedios, actas e historial regular' },
        { name: 'Asistencia', description: 'Control de asistencia e inhabilitación' },
        { name: 'Egreso', description: 'Elegibilidad y aprobación de egresados' },
        { name: 'Talleres', description: 'Talleres extracurriculares e inscripciones' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token de acceso emitido por Supabase Auth',
          },
        },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/documentacion',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    staticCSP: true,
  });
}
