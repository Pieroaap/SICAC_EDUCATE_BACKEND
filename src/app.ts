import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { getEnv } from './config/env.js';
import { databasePlugin } from './infrastructure/database/plugin.js';
import { registerErrorHandler } from './infrastructure/http/error-handler.js';
import { requestAuthPlugin } from './infrastructure/http/request-auth.js';
import { registerSwagger } from './infrastructure/http/swagger.js';
import { supabasePlugin } from './infrastructure/supabase/plugin.js';
import { registerAttendanceRoutes } from './modules/attendance/routes.js';
import { registerCareerStructureRoutes } from './modules/career-structure/routes.js';
import { registerDashboardRoutes } from './modules/dashboard/routes.js';
import { registerOperationRoutes } from './modules/operations/routes.js';
import { registerEnrollmentRoutes } from './modules/enrollment/routes.js';
import { registerEvaluationRoutes } from './modules/evaluation/routes.js';
import { registerGraduationRoutes } from './modules/graduation/routes.js';
import { registerAuthRoutes } from './modules/identity/auth/routes.js';
import { registerPeopleRoutes } from './modules/identity/people/routes.js';
import { registerUserRoutes } from './modules/identity/users/routes.js';
import { registerHealthRoutes } from './modules/system/health/routes.js';
import { registerStudentRoutes } from './modules/students/routes.js';
import { registerWorkshopRoutes } from './modules/workshops/routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const env = getEnv();
  const app = Fastify({ logger: true });
  registerErrorHandler(app);
  await registerSwagger(app);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  });
  await app.register(databasePlugin);
  await app.register(supabasePlugin);
  await app.register(requestAuthPlugin);
  await app.register(registerHealthRoutes);
  await app.register(registerAuthRoutes);
  await app.register(registerDashboardRoutes);
  await app.register(registerPeopleRoutes);
  await app.register(registerUserRoutes);
  await app.register(registerStudentRoutes);
  await app.register(registerOperationRoutes);
  await app.register(registerCareerStructureRoutes);
  await app.register(registerEnrollmentRoutes);
  await app.register(registerEvaluationRoutes);
  await app.register(registerAttendanceRoutes);
  await app.register(registerGraduationRoutes);
  await app.register(registerWorkshopRoutes);
  return app;
}
