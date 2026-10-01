import { D1ReadQuery } from './query.mjs';
import { D1Mutation } from './mutation.mjs';
import { createCashAccount, updateCashAccount, listDataMonths, postManualAccountTransaction, transferCashAccounts, reconcileCashAccount } from './accounts.mjs';
import { addManualLaptopCost, voidManualLaptopCost } from './costs.mjs';
import { createSupplierReturn, linkSupplierReplacement, recordSupplierRefundWithAccount,
  transitionSupplierReturn } from './supplier-returns.mjs';
import { completeQcWithDetails } from './qc.mjs';
import { recordSupplierPaymentWithAccount } from './supplier-payments.mjs';
import { recordOrderPaymentWithAccount } from './payments.mjs';
import { getFinancialOperationsSummary } from './financial.mjs';
import { createCodReceivable, recordCodSettlement, transitionCodReceivable } from './cod.mjs';
import { allocateOrderLaptop } from './allocations.mjs';
import { cancelReservation, convertReservationToOrder, createReservation, expireReservations, extendReservation } from './reservations.mjs';
import { approveCommission, generateCommission, payCommission } from './commissions.mjs';
import { acceptTradeIn, completeTradeInInspection, convertTradeInToInventory, createTradeIn, receiveTradeIn, rejectTradeIn, startTradeInInspection } from './trade-ins.mjs';
import { createOrderWithInventory, getManagementDashboard, issueInvoice, recordOrderPayment, updateOrderWithInventory } from './remaining.mjs';
import {
  addRepairAction, cancelRepairJob, addRepairPart, removeRepairPart, startRepairJob, updateRepairJob,
  completeRepairJob, syncLaptopCostComponents,
} from './repairs.mjs';
import {
  createPurchaseBatch, receivePurchaseLaptops, startQcInspection,
  updateIncomingTracking, ignoreIncomingLaptop, updateLaptopProcurement, addLaptopToPurchaseBatch,
  receiveInventory,
  reconcileUnknownLaptop,
} from './procurement.mjs';

export const businessOperations = Object.freeze({
  create_order_with_inventory: createOrderWithInventory,
  update_order_with_inventory: updateOrderWithInventory,
  record_order_payment: recordOrderPayment,
  issue_invoice: issueInvoice,
  get_management_dashboard: getManagementDashboard,
  create_trade_in: createTradeIn,
  start_trade_in_inspection: startTradeInInspection,
  complete_trade_in_inspection: completeTradeInInspection,
  accept_trade_in: acceptTradeIn,
  reject_trade_in: rejectTradeIn,
  receive_trade_in: receiveTradeIn,
  convert_trade_in_to_inventory: convertTradeInToInventory,
  generate_commission: generateCommission,
  approve_commission: approveCommission,
  pay_commission: payCommission,
  create_reservation: createReservation,
  cancel_reservation: cancelReservation,
  extend_reservation: extendReservation,
  expire_reservations: expireReservations,
  convert_reservation_to_order: convertReservationToOrder,
  allocate_order_laptop: allocateOrderLaptop,
  create_cod_receivable: createCodReceivable,
  transition_cod_receivable: transitionCodReceivable,
  record_cod_settlement: recordCodSettlement,
  get_financial_operations_summary: getFinancialOperationsSummary,
  record_order_payment_with_account: recordOrderPaymentWithAccount,
  reconcile_cash_account: reconcileCashAccount,
  post_manual_account_transaction: postManualAccountTransaction,
  transfer_cash_accounts: transferCashAccounts,
  record_supplier_payment_with_account: recordSupplierPaymentWithAccount,
  start_repair_job: startRepairJob,
  update_repair_job: updateRepairJob,
  complete_repair_job: completeRepairJob,
  sync_laptop_cost_components: syncLaptopCostComponents,
  add_manual_laptop_cost: addManualLaptopCost,
  void_manual_laptop_cost: voidManualLaptopCost,
  create_supplier_return: createSupplierReturn,
  transition_supplier_return: transitionSupplierReturn,
  record_supplier_refund_with_account: recordSupplierRefundWithAccount,
  link_supplier_replacement: linkSupplierReplacement,
  complete_qc_with_details: completeQcWithDetails,
  add_repair_part: addRepairPart,
  remove_repair_part: removeRepairPart,
  add_repair_action: addRepairAction,
  cancel_repair_job: cancelRepairJob,
  create_cash_account: createCashAccount,
  update_cash_account: updateCashAccount,
  list_data_months: listDataMonths,
  create_purchase_batch: createPurchaseBatch,
  add_laptop_to_purchase_batch: addLaptopToPurchaseBatch,
  receive_purchase_laptops: receivePurchaseLaptops,
  receive_inventory: receiveInventory,
  reconcile_unknown_laptop: reconcileUnknownLaptop,
  start_qc_inspection: startQcInspection,
  update_incoming_tracking: updateIncomingTracking,
  ignore_incoming_laptop: ignoreIncomingLaptop,
  update_laptop_procurement: updateLaptopProcurement,
});

/** Request-scoped D1 adapter; this module has no network/Supabase fallback. */
export function createDatabase(db) {
  if (!db?.prepare || !db?.batch) throw new Error('D1 binding is required');
  return {
    from(table) {
      return {
        select: (...args) => new D1ReadQuery(db, table).select(...args),
        insert: rows => new D1Mutation(db, table, 'insert', rows),
        upsert: (rows, options) => new D1Mutation(db, table, 'upsert', rows, options),
        update: row => new D1Mutation(db, table, 'update', row),
        delete: () => new D1Mutation(db, table, 'delete'),
      };
    },
    async rpc(name, params = {}) {
      if (!Object.hasOwn(businessOperations, name)) {
        return { data: null, error: { code: 'D1_OPERATION_NOT_MIGRATED', message: `D1 operation is not migrated: ${name}` } };
      }
      try { return { data: await businessOperations[name](db, params), error: null }; }
      catch (error) { return { data: null, error: { message: error.message, status: error.status || 400 } }; }
    },
  };
}
