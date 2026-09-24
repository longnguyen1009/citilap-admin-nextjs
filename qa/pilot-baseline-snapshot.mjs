import { readFile, writeFile } from 'node:fs/promises';

const raw = await readFile('.env', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/)
  .filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
  }));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !service) throw new Error('Missing Supabase environment');

async function rest(path) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path}: ${body?.message || response.status}`);
  return body;
}

const group = (rows, key) => rows.reduce((result, row) => {
  const value = String(row[key] ?? 'UNKNOWN');
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

const [laptops, orders, payments, invoices, warranty, accounts, reservations, tradeIns, commissions] = await Promise.all([
  rest('laptops?select=id,status,location,is_active'),
  rest('orders?select=id,order_status,payment_status,sale_price,amount_paid,debt_amount,trade_in_credit_vnd,is_active'),
  rest('payments?select=id,amount,payment_type'),
  rest('invoices?select=id'),
  rest('warranty_cases?select=id,status'),
  rest('cash_account_balances?is_active=eq.true&select=code,name,currency,recorded_balance,last_difference'),
  rest('reservations?select=id,status'),
  rest('trade_ins?select=id,status'),
  rest('commissions?select=id,status,amount_vnd'),
]);

const activeOrders = orders.filter(row => row.is_active !== false);
const collectibleOrders = activeOrders.filter(row => !['cancelled', 'returned'].includes(row.order_status) && row.payment_status !== 'refunded');
const activeLaptops = laptops.filter(row => row.is_active !== false);
const snapshot = {
  generatedAt: new Date().toISOString(),
  environment: 'current Supabase seed data',
  inventory: {
    totalActive: activeLaptops.length,
    byStatus: group(activeLaptops, 'status'),
    byLocation: group(activeLaptops, 'location'),
  },
  orders: {
    totalActive: activeOrders.length,
    byOrderStatus: group(activeOrders, 'order_status'),
    byPaymentStatus: group(activeOrders, 'payment_status'),
    salePriceMillionVnd: sum(activeOrders, 'sale_price'),
    cashPaidMillionVnd: sum(activeOrders, 'amount_paid'),
    collectibleOrders: collectibleOrders.filter(row => Number(row.debt_amount || 0) > 0).length,
    outstandingMillionVnd: sum(collectibleOrders, 'debt_amount'),
    tradeInCreditVnd: sum(activeOrders, 'trade_in_credit_vnd'),
  },
  payments: {
    count: payments.length,
    netMillionVnd: payments.reduce((total, row) => total + (row.payment_type === 'refund' ? -1 : 1) * Number(row.amount || 0), 0),
  },
  documents: { invoices: invoices.length },
  afterSales: { warrantyCases: warranty.length, warrantyByStatus: group(warranty, 'status') },
  salesOperations: {
    reservationByStatus: group(reservations, 'status'),
    tradeInByStatus: group(tradeIns, 'status'),
    commissionByStatus: group(commissions, 'status'),
    commissionVnd: sum(commissions.filter(row => row.status !== 'CANCELLED'), 'amount_vnd'),
  },
  cashAccounts: {
    count: accounts.length,
    byCurrency: group(accounts, 'currency'),
    recordedBalanceByCurrency: accounts.reduce((result, row) => {
      result[row.currency] = (result[row.currency] || 0) + Number(row.recorded_balance || 0);
      return result;
    }, {}),
    accountsWithDifference: accounts
      .filter(row => Number(row.last_difference || 0) !== 0)
      .map(row => ({ code: row.code, currency: row.currency, lastDifference: Number(row.last_difference) })),
  },
};

const json = `${JSON.stringify(snapshot, null, 2)}\n`;
const outputArg = process.argv.find(arg => arg.startsWith('--write='));
if (outputArg) {
  const outputPath = outputArg.slice('--write='.length);
  await writeFile(outputPath, json, 'utf8');
  console.log(`Wrote ${outputPath}`);
} else {
  process.stdout.write(json);
}
