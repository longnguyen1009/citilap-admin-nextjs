import { getCloudflareBindings } from './bindings.js';
import { createDatabase } from './database.mjs';
import { requireSession } from './session.mjs';

const camelKey = key => key.replace(/[-_]([a-z])/gi, (_, letter) => letter.toUpperCase());
const snakeKey = key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

export function keysToCamel(value) {
  if (Array.isArray(value)) return value.map(keysToCamel);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [camelKey(key), keysToCamel(item)]));
}

export function keysToSnake(value) {
  if (Array.isArray(value)) return value.map(keysToSnake);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [snakeKey(key), keysToSnake(item)]));
}

export async function routeContext(request, roles) {
  const { DB } = getCloudflareBindings();
  const profile = await requireSession(DB, request, roles);
  return { DB, db: createDatabase(DB), profile };
}

export async function writeAudit(DB, entityType, entityId, action, changes, actor) {
  await DB.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
    VALUES(?,?,?,?,?)`).bind(entityType, String(entityId), action, JSON.stringify(changes || {}), actor || 'SYSTEM').run();
}
