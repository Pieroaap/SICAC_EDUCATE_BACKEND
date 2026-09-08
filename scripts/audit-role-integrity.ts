import { sql } from 'drizzle-orm';
import { closeDatabase, getDatabase } from '../src/infrastructure/database/client.js';

const db = getDatabase();

try {
  const [summary] = await db.execute<{
    duplicateGroups: number;
    rowsToInactivate: number;
  }>(sql`
    with grouped as (
      select persona_id, rol_id, count(*)::int as total
      from personas_roles
      where estado = 'activo'
      group by persona_id, rol_id
      having count(*) > 1
    )
    select
      count(*)::int as "duplicateGroups",
      coalesce(sum(total - 1), 0)::int as "rowsToInactivate"
    from grouped
  `);

  const duplicates = await db.execute<{
    personaId: string;
    roleCode: string;
    activeAssignments: number;
    startDates: string[];
  }>(sql`
    select
      pr.persona_id as "personaId",
      r.codigo as "roleCode",
      count(*)::int as "activeAssignments",
      array_agg(pr.fecha_inicio order by pr.fecha_inicio desc) as "startDates"
    from personas_roles pr
    inner join roles r on r.id = pr.rol_id
    where pr.estado = 'activo'
    group by pr.persona_id, r.codigo
    having count(*) > 1
    order by r.codigo, pr.persona_id
  `);

  const duplicateRows = await db.execute<{
    personaId: string;
    roleId: string;
    roleCode: string;
    state: string;
    startDate: string;
    endDate: string | null;
    observation: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: string | null;
    updatedBy: string | null;
  }>(sql`
    select
      pr.persona_id as "personaId",
      pr.rol_id as "roleId",
      r.codigo as "roleCode",
      pr.estado as "state",
      pr.fecha_inicio as "startDate",
      pr.fecha_fin as "endDate",
      pr.observacion as "observation",
      pr.created_at as "createdAt",
      pr.updated_at as "updatedAt",
      pr.created_by as "createdBy",
      pr.updated_by as "updatedBy"
    from personas_roles pr
    inner join roles r on r.id = pr.rol_id
    where (pr.persona_id, pr.rol_id) in (
      select persona_id, rol_id
      from personas_roles
      where estado = 'activo'
      group by persona_id, rol_id
      having count(*) > 1
    )
    order by r.codigo, pr.persona_id, pr.fecha_inicio desc
  `);

  const relatedAccounts = await db.execute<{
    personaId: string;
    createdAt: string;
  }>(sql`
    select ua.persona_id as "personaId", ua.created_at as "createdAt"
    from usuarios_auth ua
    where ua.persona_id in (
      select persona_id
      from personas_roles
      where estado = 'activo'
      group by persona_id, rol_id
      having count(*) > 1
    )
    order by ua.persona_id
  `);

  const [indexState] = await db.execute<{ exists: boolean }>(sql`
    select exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'personas_roles'
        and indexname = 'personas_roles_activa_uq'
    ) as "exists"
  `);

  const [migrationState] = await db.execute<{
    appliedCount: number;
    lastAppliedAt: number | null;
  }>(sql`
    select
      count(*)::int as "appliedCount",
      max(created_at)::bigint as "lastAppliedAt"
    from drizzle.__drizzle_migrations
  `);

  console.log(JSON.stringify({
    duplicateGroups: summary?.duplicateGroups ?? 0,
    rowsToInactivate: summary?.rowsToInactivate ?? 0,
    uniqueActiveRoleIndex: indexState?.exists ?? false,
    appliedMigrationCount: migrationState?.appliedCount ?? 0,
    lastAppliedMigrationAt: migrationState?.lastAppliedAt ?? null,
    duplicates,
    duplicateRows,
    relatedAccounts,
  }, null, 2));
} finally {
  await closeDatabase();
}
