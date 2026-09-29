-- Remove legacy duplicate Phase 8 checks before enabling commission payouts.
BEGIN;

DO $$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN
  SELECT conname FROM pg_constraint
  WHERE conrelid='public.account_transactions'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%reference_type%'
 LOOP
  EXECUTE format('ALTER TABLE public.account_transactions DROP CONSTRAINT %I',constraint_name);
 END LOOP;
 FOR constraint_name IN
  SELECT conname FROM pg_constraint
  WHERE conrelid='public.account_transactions'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%transaction_type%'
 LOOP
  EXECUTE format('ALTER TABLE public.account_transactions DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;

ALTER TABLE public.account_transactions ADD CONSTRAINT account_transactions_reference_type_check
 CHECK(reference_type IN('PAYMENT','SUPPLIER_PAYMENT','SUPPLIER_REFUND','COD_SETTLEMENT','COMMISSION','MANUAL','TRANSFER'));
ALTER TABLE public.account_transactions ADD CONSTRAINT account_transactions_transaction_type_check
 CHECK(transaction_type IN('CUSTOMER_PAYMENT','COD_SETTLEMENT','SUPPLIER_PAYMENT','SUPPLIER_REFUND','COMMISSION_PAYMENT','MANUAL_IN','MANUAL_OUT','TRANSFER_IN','TRANSFER_OUT','OTHER'));

COMMIT;
