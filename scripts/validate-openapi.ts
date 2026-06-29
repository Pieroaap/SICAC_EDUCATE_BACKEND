import { buildApp } from '../src/app.js';

const app = await buildApp();
try {
  await app.ready();
  const document = app.swagger();
  const declaredTags = new Set((document.tags ?? []).map((tag) => tag.name));
  const usedTags = new Set<string>();
  const problems: string[] = [];
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!methods.has(method) || !operation || typeof operation !== 'object') continue;
      const tags = 'tags' in operation && Array.isArray(operation.tags)
        ? operation.tags
        : [];
      if (tags.length === 0 || tags.includes('default')) {
        problems.push(`${method.toUpperCase()} ${path} no tiene una etiqueta válida`);
      }
      if (!('summary' in operation) || !operation.summary) {
        problems.push(`${method.toUpperCase()} ${path} no tiene resumen`);
      }
      for (const tag of tags) usedTags.add(tag);
    }
  }

  for (const tag of declaredTags) {
    if (!usedTags.has(tag)) problems.push(`La etiqueta "${tag}" no contiene operaciones`);
  }
  for (const tag of usedTags) {
    if (!declaredTags.has(tag)) problems.push(`La etiqueta "${tag}" no está declarada`);
  }

  if (problems.length > 0) {
    throw new Error(`OpenAPI inválido:\n- ${problems.join('\n- ')}`);
  }
  console.log(
    `OpenAPI verificado: ${Object.keys(document.paths ?? {}).length} rutas, `
      + `${usedTags.size} etiquetas utilizadas y ninguna operación en default.`,
  );
} finally {
  await app.close();
}
