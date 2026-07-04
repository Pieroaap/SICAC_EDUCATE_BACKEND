# Despliegue en Render

## Servicio

- Tipo: Web Service.
- Repositorio: `Pieroaap/SICAC_EDUCATE_BACKEND`.
- Rama: `main`.
- Runtime: Node.js.
- Build command: `npm ci && npm run build`.
- Start command: `npm start`.
- Health check: `/health/ready`.
- Plan: Free.

## Variables de entorno

Configurar en Render sin almacenarlas en Git:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS`
- `NODE_ENV=production`
- `HOST=0.0.0.0`

Render proporciona `PORT`; no debe fijarse manualmente.

`CORS_ORIGINS` debe contener la URL final del frontend en Vercel. Para
varios orígenes, usar valores separados por comas.

## Base de datos

Las migraciones se administran fuera del proceso de arranque mediante
`npm run db:migrate`. El servidor no debe ejecutar migraciones
automáticamente al iniciar.

## Verificación

- `GET /health/ready` responde correctamente.
- La documentación OpenAPI carga en `/documentacion`.
- El frontend puede autenticarse sin errores CORS.

## Secuencia de publicación

1. Ejecutar las validaciones del backend.
2. Publicar los cambios en `main`.
3. Crear el Web Service y configurar las variables.
4. Verificar el health check y OpenAPI.
5. Añadir la URL final de Vercel a `CORS_ORIGINS`.
