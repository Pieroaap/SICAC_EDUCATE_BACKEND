ALTER TABLE "habilitaciones_ciclo" ADD CONSTRAINT "habilitaciones_ciclos_ck" CHECK ("habilitaciones_ciclo"."ciclo_origen" > 0 and ("habilitaciones_ciclo"."ciclo_destino" is null or "habilitaciones_ciclo"."ciclo_destino" > "habilitaciones_ciclo"."ciclo_origen"));--> statement-breakpoint
ALTER TABLE "preinscripciones_ciclo" ADD CONSTRAINT "preinscripciones_confirmacion_ck" CHECK (
    ("preinscripciones_ciclo"."estado" = 'confirmada' and "preinscripciones_ciclo"."matricula_carrera_id" is not null and "preinscripciones_ciclo"."confirmada_at" is not null and "preinscripciones_ciclo"."confirmada_por_persona_id" is not null)
    or ("preinscripciones_ciclo"."estado" <> 'confirmada' and "preinscripciones_ciclo"."confirmada_at" is null and "preinscripciones_ciclo"."confirmada_por_persona_id" is null)
  );--> statement-breakpoint
ALTER TABLE "preinscripciones_cursos" ADD CONSTRAINT "preinscripciones_cursos_oferta_ck" CHECK (
    ("preinscripciones_cursos"."estado" = 'sin_oferta' and "preinscripciones_cursos"."curso_programado_id" is null)
    or ("preinscripciones_cursos"."estado" in ('propuesto', 'confirmado') and "preinscripciones_cursos"."curso_programado_id" is not null)
  );