BEGIN;

CREATE OR REPLACE FUNCTION public.record_cod_settlement(
  p_cod_id uuid,
  p_amount_vnd numeric,
  p_account_id uuid,
  p_reference text,
  p_settled_at timestamptz,
  p_actor text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c cod_receivables%ROWTYPE;
  s cod_settlements%ROWTYPE;
  a cash_accounts%ROWTYPE;
  paid numeric;
  remaining numeric;
  t account_transactions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM cod_settlements WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(s); END IF;

  SELECT * INTO c FROM cod_receivables WHERE id = p_cod_id FOR UPDATE;
  IF NOT FOUND OR c.status NOT IN ('WAITING_SETTLEMENT', 'PARTIALLY_SETTLED', 'DISPUTED') THEN
    RAISE EXCEPTION 'COD chưa ở trạng thái nhận đối soát';
  END IF;

  a := assert_cash_account(p_account_id, 'VND', p_settled_at);
  SELECT coalesce(sum(amount_vnd), 0) INTO paid FROM cod_settlements WHERE cod_receivable_id = c.id;
  remaining := c.expected_cod_amount_vnd - paid;
  IF p_amount_vnd <= 0 OR p_amount_vnd > remaining THEN
    RAISE EXCEPTION 'Số tiền COD vượt khoản còn phải thu';
  END IF;

  INSERT INTO cod_settlements(cod_receivable_id, amount_vnd, account_id, reference, settled_at, idempotency_key, created_by)
  VALUES(c.id, p_amount_vnd, a.id, left(coalesce(p_reference, ''), 300), p_settled_at, p_idempotency_key, p_actor)
  RETURNING * INTO s;

  INSERT INTO account_transactions(account_id, direction, amount, currency, reference_type, reference_id, transaction_type, occurred_at, description, idempotency_key, created_by)
  VALUES(a.id, 'IN', p_amount_vnd, 'VND', 'COD_SETTLEMENT', s.id::text, 'COD_SETTLEMENT', p_settled_at, 'COD order #' || c.order_id, p_idempotency_key || '-CASH', p_actor)
  RETURNING * INTO t;

  paid := paid + p_amount_vnd;
  UPDATE cod_receivables
  SET status = CASE WHEN paid = c.expected_cod_amount_vnd THEN 'SETTLED' ELSE 'PARTIALLY_SETTLED' END,
      settled_at = CASE WHEN paid = c.expected_cod_amount_vnd THEN p_settled_at END
  WHERE id = c.id;

  INSERT INTO activity_logs(entity_type, entity_id, action, changes, user_name)
  VALUES('COD_SETTLEMENT', s.id::text, 'CREATE', jsonb_build_object('event', CASE WHEN paid = c.expected_cod_amount_vnd THEN 'COD_SETTLED' ELSE 'COD_SETTLEMENT_RECORDED' END, 'cod_id', c.id, 'amount_vnd', p_amount_vnd, 'resolved_dispute', c.status = 'DISPUTED'), p_actor);
  RETURN to_jsonb(s);
END
$$;

REVOKE ALL ON FUNCTION public.record_cod_settlement(uuid,numeric,uuid,text,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cod_settlement(uuid,numeric,uuid,text,timestamptz,text,text) TO service_role;

COMMIT;
