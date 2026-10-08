import { randomUUID } from 'node:crypto';
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const decode = row => ({ ...row, is_active: Boolean(row.is_active) });

export async function reconcileCashAccount(db, {p_account_id: account,p_actual: actual,p_reconciled_at: inputDate,p_notes: notes,p_actor: actor}) {
  const date=new Date(inputDate), id=randomUUID();
  if(!account||!actor||!Number.isFinite(actual)||!inputDate||!Number.isFinite(date.valueOf())) invalid('Thông tin đối soát không hợp lệ');
  const result=await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM cash_accounts WHERE id=? AND is_active=1 AND julianday(opening_balance_at)<=julianday(?))
      THEN 1 ELSE json('invalid reconciliation account') END`).bind(account,date.toISOString()),
    db.prepare(`INSERT INTO account_reconciliations(id,account_id,recorded_balance,actual_balance,reconciled_at,notes,created_by)
      SELECT ?,id,round(opening_balance+COALESCE((SELECT sum(CASE direction WHEN 'IN' THEN amount ELSE -amount END)
        FROM account_transactions WHERE account_id=cash_accounts.id AND julianday(occurred_at)>=julianday(cash_accounts.opening_balance_at) AND julianday(occurred_at)<=julianday(?)),0),2),?,?,?,?
      FROM cash_accounts WHERE id=?`).bind(id,date.toISOString(),actual,date.toISOString(),String(notes??'').slice(0,2000),actor,account),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'CASH_ACCOUNT',account_id,'UPDATE',json_object('event','ACCOUNT_RECONCILED','recorded',recorded_balance,
        'actual',actual_balance,'difference',difference),? FROM account_reconciliations WHERE id=?`).bind(actor,id),
    db.prepare('SELECT * FROM account_reconciliations WHERE id=?').bind(id),
  ]);
  return result.at(-1).results[0];
}

export async function transferCashAccounts(db, { p_source: source, p_destination: destination, p_amount: amount,
  p_occurred_at: inputDate, p_description: description, p_actor: actor, p_idempotency_key: key }) {
  const date=new Date(inputDate), group=randomUUID();
  if (!source || !destination || source===destination || !actor || !Number.isFinite(amount) || amount<=0
    || !inputDate || !Number.isFinite(date.valueOf()) || typeof description!=='string' || !description.trim()
    || typeof key!=='string' || key.trim().length<8 || key.length>90) invalid('Chuyển tiền không hợp lệ');
  const result=await db.batch([
    db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_transactions WHERE idempotency_key=?||'-OUT') OR
      EXISTS(SELECT 1 FROM account_transactions a JOIN account_transactions b ON b.transfer_group_id=a.transfer_group_id
        WHERE a.idempotency_key=?||'-OUT' AND b.idempotency_key=?||'-IN' AND a.account_id=? AND b.account_id=?
        AND a.amount=? AND b.amount=? AND a.direction='OUT' AND b.direction='IN' AND a.reference_type='TRANSFER')
      THEN 1 ELSE json('transfer key conflict') END`).bind(key,key,key,source,destination,amount,amount),
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM account_transactions WHERE idempotency_key=?||'-OUT') OR
      EXISTS(SELECT 1 FROM cash_accounts a JOIN cash_accounts b ON b.id=? WHERE a.id=? AND a.is_active=1 AND b.is_active=1
        AND a.currency=b.currency AND date(a.opening_balance_at)<=date(?) AND date(b.opening_balance_at)<=date(?))
      THEN 1 ELSE json('invalid transfer accounts or date') END`).bind(key,destination,source,date.toISOString(),date.toISOString()),
    db.prepare(`INSERT INTO account_transactions(account_id,direction,amount,currency,reference_type,reference_id,
      transaction_type,occurred_at,description,idempotency_key,transfer_group_id,created_by)
      SELECT a.id,e.value,?,a.currency,'TRANSFER',?,'TRANSFER_'||e.value,?,?,?||'-'||e.value,?,?
      FROM json_each('["OUT","IN"]') e JOIN cash_accounts a ON a.id=CASE e.value WHEN 'OUT' THEN ? ELSE ? END
      WHERE NOT EXISTS(SELECT 1 FROM account_transactions WHERE idempotency_key=?||'-OUT')`)
      .bind(amount,group,date.toISOString(),description.trim().slice(0,1000),key,group,actor,source,destination,key),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'ACCOUNT_TRANSFER',?,'CREATE',json_object('event','ACCOUNT_TRANSFER','source',?,'destination',?,'amount',?,'currency',currency),?
      FROM account_transactions WHERE transfer_group_id=? AND direction='OUT'`).bind(group,source,destination,amount,actor,group),
    db.prepare("SELECT transfer_group_id FROM account_transactions WHERE idempotency_key=?||'-OUT'").bind(key),
  ]);
  return result.at(-1).results[0];
}

export async function postManualAccountTransaction(db, {
  p_account_id: account, p_direction: direction, p_amount: amount, p_description: description,
  p_occurred_at: occurredInput, p_actor: actor, p_idempotency_key: key,
}) {
  const date = new Date(occurredInput);
  if (!account || !actor || !['IN','OUT'].includes(direction) || !Number.isFinite(amount) || amount<=0
    || typeof description!=='string' || !description.trim() || !occurredInput || !Number.isFinite(date.valueOf())
    || typeof key!=='string' || key.trim().length<8 || key.length>90) invalid('Giao dịch thủ công không hợp lệ');
  const id=randomUUID(), occurred=date.toISOString();
  const result=await db.batch([
    db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM account_transactions WHERE idempotency_key=?
      AND (account_id<>? OR direction<>? OR amount<>? OR reference_type<>'MANUAL'))
      THEN 1 ELSE json('manual transaction key conflict') END`).bind(key,account,direction,amount),
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM account_transactions WHERE idempotency_key=?) OR
      EXISTS(SELECT 1 FROM cash_accounts WHERE id=? AND is_active=1 AND date(opening_balance_at)<=date(?))
      THEN 1 ELSE json('invalid account or transaction date') END`).bind(key,account,occurred),
    db.prepare(`INSERT INTO account_transactions(id,account_id,direction,amount,currency,reference_type,reference_id,
      transaction_type,occurred_at,description,idempotency_key,created_by)
      SELECT ?,id,?,?,currency,'MANUAL',?,?,?,?,?,? FROM cash_accounts WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM account_transactions WHERE idempotency_key=?)`)
      .bind(id,direction,amount,key,direction==='IN'?'MANUAL_IN':'MANUAL_OUT',occurred,description.trim().slice(0,1000),key,actor,account,key),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'ACCOUNT_TRANSACTION',id,'CREATE',json_object('event','ACCOUNT_TRANSACTION_POSTED','account_id',account_id,
        'direction',direction,'amount',amount,'currency',currency),? FROM account_transactions WHERE id=?`).bind(actor,id),
    db.prepare('SELECT * FROM account_transactions WHERE idempotency_key=?').bind(key),
  ]);
  return result.at(-1).results[0];
}

export async function createCashAccount(db, { p_data: data, p_actor: actor }) {
  if (!data || !actor) invalid('Thông tin tài khoản không hợp lệ');
  const code = String(data.code ?? '').trim().toUpperCase();
  const name = String(data.name ?? '').trim();
  const balance = Number(data.opening_balance ?? 0);
  const openingDate = new Date(data.opening_balance_at);
  if (!/^[A-Z0-9_-]{2,40}$/.test(code) || !name || name.length > 160 || !Number.isFinite(balance) || balance < 0
    || !['CASH','BANK','WECHAT','ALIPAY','OTHER'].includes(data.account_type)
    || !['VND','CNY'].includes(data.currency) || !data.opening_balance_at || !Number.isFinite(openingDate.getTime())) invalid('Thông tin tài khoản không hợp lệ');
  const id = randomUUID();
  const results = await db.batch([
    db.prepare('INSERT INTO cash_accounts(id,code,name,account_type,currency,opening_balance,opening_balance_at,created_by) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, code, name, data.account_type, data.currency, balance, openingDate.toISOString(), actor),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      VALUES ('CASH_ACCOUNT',?,'CREATE',json_object('event','CASH_ACCOUNT_CREATED','code',?,'currency',?,'opening_balance',?),?)`)
      .bind(id, code, data.currency, balance, actor),
    db.prepare('SELECT * FROM cash_accounts WHERE id=?').bind(id),
  ]);
  return decode(results.at(-1).results[0]);
}

export async function updateCashAccount(db, { p_id: id, p_name: name, p_is_active: active, p_actor: actor }) {
  if (!id || !actor || typeof name !== 'string' || !name.trim() || (active != null && typeof active !== 'boolean')) invalid('Thông tin tài khoản không hợp lệ');
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM cash_accounts WHERE id=?) AND
      (? IS NOT 0 OR NOT EXISTS(SELECT 1 FROM account_transactions WHERE account_id=?))
      THEN 1 ELSE json('cash account cannot be updated or deactivated') END`).bind(id, active == null ? null : Number(active), id),
    db.prepare(`UPDATE cash_accounts SET name=?,is_active=COALESCE(?,is_active),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
      .bind(name.trim().slice(0,160), active == null ? null : Number(active), id),
    db.prepare(`INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
      SELECT 'CASH_ACCOUNT',id,'UPDATE',json_object('event','CASH_ACCOUNT_UPDATED','name',name,
        'is_active',json(CASE WHEN is_active=1 THEN 'true' ELSE 'false' END)),? FROM cash_accounts WHERE id=?`).bind(actor,id),
    db.prepare('SELECT * FROM cash_accounts WHERE id=?').bind(id),
  ]);
  return decode(results.at(-1).results[0]);
}

export async function listDataMonths(db, { p_scope: scope = 'operations' } = {}) {
  const result = await db.prepare(`SELECT month_key FROM (
    SELECT month_key FROM laptops WHERE ?='operations' AND is_active=1
    UNION SELECT month_key FROM orders WHERE ?='operations' AND is_active=1
    UNION SELECT strftime('%m/%Y',purchase_date) FROM purchase_batches WHERE ?='purchases'
    UNION SELECT month_key FROM laptops WHERE ?='purchases' AND is_active=1 AND source_type='UNKNOWN')
    WHERE length(month_key)=7 AND substr(month_key,1,2) BETWEEN '01' AND '12'
      AND month_key GLOB '[0-9][0-9]/[0-9][0-9][0-9][0-9]'
    ORDER BY substr(month_key,4,4) DESC,substr(month_key,1,2) DESC`).bind(scope,scope,scope,scope).all();
  return result.results;
}
