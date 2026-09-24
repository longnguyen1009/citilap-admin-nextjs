import { readFile } from 'node:fs/promises';

const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
}));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const app = process.env.APP_URL || 'http://localhost:3000';
if (!base || !anon || !service || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Missing pilot environment');

const tag = `pilot_${Date.now().toString(36).toLowerCase()}`;
const checks = [];
const parse = async response => { const value = await response.text(); try { return JSON.parse(value); } catch { return value; } };
const check = (name, pass, detail = {}) => {
  checks.push({ name, pass: Boolean(pass), ...detail });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`);
};
const loginResponse = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
});
const login = await parse(loginResponse);
check('admin login', loginResponse.ok, { status: loginResponse.status });
const api = async (path, method = 'GET', body, token = login.access_token) => {
  const response = await fetch(`${app}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};
const rest = async path => {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
  return { ok: response.ok, status: response.status, body: await parse(response) };
};

const unauthOptions = await api('/api/options', 'GET', undefined, anon);
const unauthSettings = await api('/api/settings', 'GET', undefined, anon);
check('anonymous cannot read operational configuration', [401, 403].includes(unauthOptions.status) && [401, 403].includes(unauthSettings.status), { options: unauthOptions.status, settings: unauthSettings.status });

const options = await api('/api/options');
check('admin loads options', options.ok && Array.isArray(options.body) && options.body.length > 0, { status: options.status });
const systemOption = options.body.find(row => row.group_key === 'paymentStatus' && row.option_key === 'paid');
check('core paid option exists', Boolean(systemOption));
const addSystemStatus = await api('/api/options', 'POST', { group_key: 'paymentStatus', option_key: tag, label: tag });
check('cannot add semantic system status', !addSystemStatus.ok && addSystemStatus.status === 400, { status: addSystemStatus.status, error: addSystemStatus.body?.error });
const disableSystem = await api('/api/options', 'PUT', { id: systemOption.id, is_active: false });
check('cannot disable core system option', !disableSystem.ok && disableSystem.status === 400, { status: disableSystem.status, error: disableSystem.body?.error });
const renameSystemKey = await api('/api/options', 'PUT', { id: systemOption.id, option_key: `${tag}_paid` });
check('cannot change core system key', !renameSystemKey.ok && renameSystemKey.status === 400, { status: renameSystemKey.status, error: renameSystemKey.body?.error });
const deleteSystem = await api(`/api/options?id=${systemOption.id}`, 'DELETE');
check('cannot hard-delete core system option', !deleteSystem.ok && deleteSystem.status === 400, { status: deleteSystem.status, error: deleteSystem.body?.error });
const unknownGroup = await api('/api/options', 'POST', { group_key: 'unusedPilotGroup', option_key: tag, label: tag });
check('reject unused option group', !unknownGroup.ok && unknownGroup.status === 400, { status: unknownGroup.status, error: unknownGroup.body?.error });

const created = await api('/api/options', 'POST', { group_key: 'category', option_key: tag, label: 'Pilot category', is_active: 'false', sort_order: 999 });
check('create extensible option with normalized boolean', created.ok && created.body.option_key === tag && created.body.is_active === false, { status: created.status, body: created.body });
const customId = created.body.id;
const duplicate = await api('/api/options', 'POST', { group_key: 'category', option_key: tag.toUpperCase(), label: 'Duplicate' });
check('case-insensitive duplicate key blocked', duplicate.status === 409, { status: duplicate.status, error: duplicate.body?.error });
const enabled = await api('/api/options', 'PUT', { id: customId, label: 'Pilot category updated', is_active: true });
check('update and enable extensible option', enabled.ok && enabled.body.label === 'Pilot category updated' && enabled.body.is_active === true, { status: enabled.status, body: enabled.body });
const disabled = await api('/api/options', 'PUT', { id: customId, is_active: false });
check('soft-disable extensible option', disabled.ok && disabled.body.is_active === false, { status: disabled.status });
const afterDisable = await api('/api/options');
check('inactive option remains available for historical labels', afterDisable.ok && afterDisable.body.some(row => row.id === customId && row.is_active === false));
const deleted = await api(`/api/options?id=${customId}`, 'DELETE');
check('hard-delete isolated pilot option', deleted.ok, { status: deleted.status, error: deleted.body?.error });

const settings = await api('/api/settings');
check('admin loads formula settings', settings.ok && settings.body?.formula && Number(settings.body.formula.divisor) > 0, { status: settings.status, body: settings.body });
const originalFormula = settings.body.formula;
const unknownSetting = await api('/api/settings', 'POST', { unused: true });
check('unknown setting key blocked', !unknownSetting.ok && unknownSetting.status === 400, { status: unknownSetting.status });
const invalidFormula = await api('/api/settings', 'POST', { formula: { ...originalFormula, divisor: 0 } });
check('invalid formula blocked', !invalidFormula.ok && invalidFormula.status === 400, { status: invalidFormula.status });
const saveFormula = await api('/api/settings', 'POST', { formula: originalFormula });
check('save authoritative formula', saveFormula.ok, { status: saveFormula.status, error: saveFormula.body?.error });
const reloadedSettings = await api('/api/settings');
check('formula persists after reload', reloadedSettings.ok && JSON.stringify(reloadedSettings.body.formula) === JSON.stringify(originalFormula), { formula: reloadedSettings.body.formula });

const audit = await rest(`activity_logs?entity_type=in.(OPTION,SETTING)&created_at=gte.${encodeURIComponent(new Date(Date.now() - 10 * 60000).toISOString())}&select=entity_type,entity_id,action,changes`);
check('settings mutations have audit trail', audit.ok && audit.body.some(row => row.entity_type === 'OPTION' && String(row.entity_id) === String(customId)) && audit.body.some(row => row.entity_type === 'SETTING' && row.entity_id === 'formula'), { rows: audit.body });

console.log(JSON.stringify({ tag, checksPassed: checks.length, checks }, null, 2));
