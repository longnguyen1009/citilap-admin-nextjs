-- Normalize the legacy October import value to the canonical payment status key.
-- Note: payments.payment_type intentionally continues to use `deposit`.
UPDATE orders
SET payment_status = 'deposited'
WHERE payment_status = 'deposit';
