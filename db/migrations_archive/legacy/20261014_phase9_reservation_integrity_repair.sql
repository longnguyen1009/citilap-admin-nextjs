-- Keep Phase 9 reservations authoritative across both physical and requested
-- order assignments, and prevent attaching an unrelated payment as a deposit.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_active_reservation_order_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.reservation_conversion', true) IS DISTINCT FROM 'on'
     AND EXISTS (
       SELECT 1
       FROM public.reservations r
       WHERE r.status = 'ACTIVE'
         AND r.expires_at > timezone('utc', now())
         AND (r.laptop_id = NEW.laptop_id OR r.laptop_id = NEW.requested_laptop_id)
         AND r.order_id IS DISTINCT FROM NEW.id
     ) THEN
    RAISE EXCEPTION 'Laptop đang được giữ cho reservation khác';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_laptop_id bigint,
  p_customer_id bigint,
  p_order_id bigint,
  p_expires_at timestamptz,
  p_deposit_payment_id bigint,
  p_notes text,
  p_user_id uuid,
  p_actor text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.reservations%ROWTYPE;
  l public.laptops%ROWTYPE;
  o public.orders%ROWTYPE;
  p public.payments%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.reservations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(r); END IF;

  PERFORM public.expire_reservations(p_actor);
  SELECT * INTO l FROM public.laptops WHERE id = p_laptop_id FOR UPDATE;
  IF NOT FOUND OR lower(l.status) <> 'available' OR NOT l.is_active OR l.is_locked THEN
    RAISE EXCEPTION 'Laptop không đủ điều kiện giữ máy';
  END IF;
  IF p_expires_at <= timezone('utc', now()) THEN
    RAISE EXCEPTION 'Thời hạn giữ máy không hợp lệ';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO o FROM public.orders WHERE id = p_order_id AND is_active FOR UPDATE;
    IF NOT FOUND OR o.order_status IN ('cancelled', 'returned', 'prepared', 'shipping', 'done') THEN
      RAISE EXCEPTION 'Chỉ có thể gắn reservation vào draft order đang hoạt động';
    END IF;
    IF (o.laptop_id IS NOT NULL AND o.laptop_id <> p_laptop_id)
       OR (o.requested_laptop_id IS NOT NULL AND o.requested_laptop_id <> p_laptop_id) THEN
      RAISE EXCEPTION 'Order đang tham chiếu laptop khác';
    END IF;
    IF p_customer_id IS NOT NULL AND o.customer_id IS NOT NULL AND p_customer_id <> o.customer_id THEN
      RAISE EXCEPTION 'Khách hàng của reservation không khớp order';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders existing_order
    WHERE existing_order.is_active
      AND existing_order.order_status NOT IN ('cancelled', 'returned')
      AND existing_order.id IS DISTINCT FROM p_order_id
      AND (existing_order.laptop_id = p_laptop_id OR existing_order.requested_laptop_id = p_laptop_id)
  ) THEN
    RAISE EXCEPTION 'Laptop đang được một order khác giữ hoặc bán';
  END IF;

  IF p_deposit_payment_id IS NOT NULL THEN
    IF p_order_id IS NULL THEN
      RAISE EXCEPTION 'Payment đặt cọc phải đi kèm order';
    END IF;
    SELECT * INTO p FROM public.payments WHERE id = p_deposit_payment_id;
    IF NOT FOUND OR p.order_id <> p_order_id OR p.payment_type = 'refund' OR p.amount <= 0 THEN
      RAISE EXCEPTION 'Payment đặt cọc không thuộc order hoặc không hợp lệ';
    END IF;
  END IF;

  INSERT INTO public.reservations(
    reservation_code, laptop_id, customer_id, order_id, status, reserved_by,
    expires_at, deposit_payment_id, notes, idempotency_key, created_by
  ) VALUES (
    public.next_salesops_code('RSV', 'public.reservations'::regclass, 'reservation_code'),
    l.id, p_customer_id, p_order_id, 'ACTIVE', p_user_id, p_expires_at,
    p_deposit_payment_id, left(coalesce(p_notes, ''), 2000), p_idempotency_key, p_actor
  ) RETURNING * INTO r;

  INSERT INTO public.activity_logs(entity_type, entity_id, action, changes, user_name)
  VALUES (
    'RESERVATION', r.id::text, 'CREATE',
    jsonb_build_object('event', 'RESERVATION_CREATED', 'laptop_id', l.id), p_actor
  );
  RETURN to_jsonb(r);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO r FROM public.reservations WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN to_jsonb(r); END IF;
    RAISE EXCEPTION 'Laptop đã có reservation đang hoạt động';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_active_reservation_order_assignment(),
  public.create_reservation(bigint, bigint, bigint, timestamptz, bigint, text, uuid, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_reservation(bigint, bigint, bigint, timestamptz, bigint, text, uuid, text, text)
TO service_role;

COMMIT;
