-- Profit is defined by the business as sale price minus the laptop's stored
-- import price. Keep operational landed-cost components separate from this
-- product-profit figure.
CREATE OR REPLACE FUNCTION public.snapshot_order_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  import_cost_vnd numeric;
  direct_cost numeric;
  sale_vnd numeric;
BEGIN
  IF NEW.laptop_id IS NOT NULL AND NEW.sale_price IS NOT NULL THEN
    SELECT round(l.import_price_vnd * 1000000, 2)
      INTO import_cost_vnd
      FROM public.laptops l
     WHERE l.id = NEW.laptop_id;

    NEW.profit_vnd := CASE
      WHEN import_cost_vnd IS NULL THEN 0
      ELSE round(NEW.sale_price - (import_cost_vnd / 1000000), 4)
    END;
  ELSE
    NEW.profit_vnd := 0;
  END IF;

  IF NEW.order_status IN ('prepared', 'shipping', 'done')
     AND NEW.cost_snapshotted_at IS NULL
     AND NEW.laptop_id IS NOT NULL THEN
    sale_vnd := coalesce(NEW.sale_price, 0) * 1000000;
    direct_cost := coalesce(NEW.credit_card_fee, 0) * 1000000;

    NEW.cost_snapshot_vnd := import_cost_vnd;
    NEW.gross_profit_snapshot_vnd := CASE
      WHEN import_cost_vnd IS NULL THEN NULL
      ELSE sale_vnd - import_cost_vnd
    END;
    NEW.direct_cost_snapshot_vnd := direct_cost;
    NEW.net_contribution_snapshot_vnd := CASE
      WHEN import_cost_vnd IS NULL THEN NULL
      ELSE sale_vnd - import_cost_vnd - direct_cost
    END;
    NEW.cost_snapshot_status := CASE
      WHEN import_cost_vnd IS NULL THEN 'INCOMPLETE'
      ELSE 'COMPLETE'
    END;
    NEW.cost_snapshot_reasons := CASE
      WHEN import_cost_vnd IS NULL THEN jsonb_build_array('MISSING_IMPORT_PRICE_VND')
      ELSE '[]'::jsonb
    END;
    NEW.cost_snapshotted_at := timezone('utc', now());
    INSERT INTO public.activity_logs(entity_type, entity_id, action, changes, user_name)
    VALUES (
      'ORDER',
      coalesce(NEW.id::text, 'pending'),
      'UPDATE',
      jsonb_build_object(
        'event', 'COST_SNAPSHOT_CREATED',
        'cost_source', 'laptops.import_price_vnd',
        'laptop_id', NEW.laptop_id,
        'cost_snapshot_vnd', NEW.cost_snapshot_vnd,
        'cost_status', NEW.cost_snapshot_status
      ),
      'SYSTEM'
    );
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.sync_order_profit_from_import_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.orders
     SET profit_vnd = CASE
       WHEN NEW.import_price_vnd IS NULL THEN 0
       ELSE round(sale_price - NEW.import_price_vnd, 4)
     END
   WHERE laptop_id = NEW.id
     AND sale_price IS NOT NULL;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS laptops_sync_order_profit_from_import_price ON public.laptops;
CREATE TRIGGER laptops_sync_order_profit_from_import_price
AFTER UPDATE OF import_price_vnd ON public.laptops
FOR EACH ROW
WHEN (OLD.import_price_vnd IS DISTINCT FROM NEW.import_price_vnd)
EXECUTE FUNCTION public.sync_order_profit_from_import_price();

-- Recalculate existing order profit and committed-order snapshots once so
-- historical rows follow the same business rule as new orders.
DROP TRIGGER IF EXISTS orders_cost_snapshot_immutable ON public.orders;

UPDATE public.orders o
   SET profit_vnd = round(o.sale_price - l.import_price_vnd, 4)
  FROM public.laptops l
 WHERE l.id = o.laptop_id
   AND o.sale_price IS NOT NULL
   AND l.import_price_vnd IS NOT NULL;

UPDATE public.orders o
   SET cost_snapshot_vnd = round(l.import_price_vnd * 1000000, 2),
       gross_profit_snapshot_vnd = round((o.sale_price - l.import_price_vnd) * 1000000, 2),
       net_contribution_snapshot_vnd = round(
         (o.sale_price - l.import_price_vnd - coalesce(o.credit_card_fee, 0)) * 1000000,
         2
       ),
       cost_snapshot_status = 'COMPLETE',
       cost_snapshot_reasons = '[]'::jsonb
  FROM public.laptops l
 WHERE l.id = o.laptop_id
   AND o.order_status IN ('prepared', 'shipping', 'done')
   AND o.cost_snapshotted_at IS NOT NULL
   AND o.sale_price IS NOT NULL
   AND l.import_price_vnd IS NOT NULL;

CREATE TRIGGER orders_cost_snapshot_immutable
BEFORE UPDATE OF
  cost_snapshot_vnd,
  gross_profit_snapshot_vnd,
  direct_cost_snapshot_vnd,
  net_contribution_snapshot_vnd,
  cost_snapshot_status,
  cost_snapshot_reasons,
  cost_snapshotted_at
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_cost_snapshot();
