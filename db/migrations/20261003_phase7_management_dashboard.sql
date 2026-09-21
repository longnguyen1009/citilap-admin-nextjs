-- Phase 7 — Inventory Aging & Management Dashboard only.
-- No cash accounting, trade-in, commission or CRM.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_management_dashboard()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
WITH
available AS (
  SELECT l.id,l.serial,l.name,l.location,l.retail_price_vnd,l.available_for_sale_at,
    CASE WHEN l.available_for_sale_at IS NULL THEN NULL
         ELSE greatest(floor(extract(epoch FROM (now()-l.available_for_sale_at))/86400),0)::integer END age_days,
    c.landed_cost_vnd,c.cost_status
  FROM laptops l LEFT JOIN laptop_landed_costs c ON c.laptop_id=l.id
  WHERE l.is_active IS TRUE AND lower(coalesce(l.status,''))='available'
),
aging AS (
  SELECT bucket_key,bucket_label,sort_order,count(*)::integer units,
    coalesce(sum(landed_cost_vnd) FILTER(WHERE cost_status='COMPLETE'),0)::numeric(18,2) landed_cost_value,
    round(avg(age_days),1) average_age
  FROM available a
  CROSS JOIN LATERAL (VALUES
    (CASE WHEN age_days BETWEEN 0 AND 7 THEN '0_7' WHEN age_days BETWEEN 8 AND 15 THEN '8_15'
      WHEN age_days BETWEEN 16 AND 30 THEN '16_30' WHEN age_days BETWEEN 31 AND 60 THEN '31_60'
      WHEN age_days BETWEEN 61 AND 90 THEN '61_90' WHEN age_days>90 THEN '90_plus' END,
     CASE WHEN age_days BETWEEN 0 AND 7 THEN '0–7 ngày' WHEN age_days BETWEEN 8 AND 15 THEN '8–15 ngày'
      WHEN age_days BETWEEN 16 AND 30 THEN '16–30 ngày' WHEN age_days BETWEEN 31 AND 60 THEN '31–60 ngày'
      WHEN age_days BETWEEN 61 AND 90 THEN '61–90 ngày' WHEN age_days>90 THEN '90+ ngày' END,
     CASE WHEN age_days BETWEEN 0 AND 7 THEN 1 WHEN age_days BETWEEN 8 AND 15 THEN 2 WHEN age_days BETWEEN 16 AND 30 THEN 3
      WHEN age_days BETWEEN 31 AND 60 THEN 4 WHEN age_days BETWEEN 61 AND 90 THEN 5 WHEN age_days>90 THEN 6 END)
  ) b(bucket_key,bucket_label,sort_order)
  WHERE age_days IS NOT NULL GROUP BY bucket_key,bucket_label,sort_order
),
reserved AS (
 SELECT count(DISTINCT coalesce(laptop_id,requested_laptop_id))::integer units
 FROM orders WHERE is_active IS TRUE AND laptop_locked IS TRUE
),
states AS (
 SELECT lower(coalesce(status,'unknown')) state,count(*)::integer units FROM laptops WHERE is_active IS TRUE GROUP BY 1
),
transit_rows AS (
 SELECT pi.id,'SUPPLIER' stage,(pi.purchase_price_rmb*pb.exchange_rate)::numeric value_vnd
 FROM purchase_items pi JOIN purchase_batches pb ON pb.id=pi.purchase_batch_id
 WHERE pi.status IN('ORDERED','CONFIRMED') AND pb.status NOT IN('DRAFT','CANCELLED')
   AND NOT EXISTS(SELECT 1 FROM shipment_items si WHERE si.purchase_item_id=pi.id AND si.status<>'CANCELLED')
 UNION ALL
 SELECT pi.id,CASE WHEN s.status IN('DRAFT','READY') THEN 'SUPPLIER'
                   WHEN s.status='IN_TRANSIT' THEN 'IN_TRANSIT_CN'
                   WHEN s.status='AT_CHINA_WAREHOUSE' THEN 'CHINA_WAREHOUSE'
                   WHEN s.status IN('IN_TRANSIT_VN','DELAYED') THEN 'IN_TRANSIT_VN'
                   WHEN s.status='PARTIALLY_RECEIVED' THEN 'PARTIALLY_RECEIVED' ELSE 'OTHER' END,
   (pi.purchase_price_rmb*pb.exchange_rate)::numeric
 FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id JOIN purchase_items pi ON pi.id=si.purchase_item_id
 JOIN purchase_batches pb ON pb.id=pi.purchase_batch_id
 WHERE si.status NOT IN('RECEIVED','CANCELLED') AND s.status NOT IN('CANCELLED','RECEIVED')
),
qc_rows AS (
 SELECT l.id,lower(l.status) state,c.landed_cost_vnd,c.cost_status,
   greatest(floor(extract(epoch FROM (now()-coalesce(
     CASE WHEN lower(l.status)='qc_in_progress' THEN q.started_at
          WHEN lower(l.status)='qc_failed' THEN q.completed_at END,
     ri.received_at,sm.created_at)))/86400),0)::integer age_days
 FROM laptops l LEFT JOIN laptop_landed_costs c ON c.laptop_id=l.id
 LEFT JOIN LATERAL (SELECT started_at,completed_at FROM qc_inspections WHERE laptop_id=l.id ORDER BY started_at DESC LIMIT 1) q ON true
 LEFT JOIN LATERAL (SELECT r.created_at received_at FROM receiving_items r WHERE r.laptop_id=l.id AND r.result='RECEIVED' ORDER BY r.created_at DESC LIMIT 1) ri ON true
 LEFT JOIN LATERAL (SELECT created_at FROM stock_movements WHERE laptop_id=l.id AND movement_type='PURCHASE_RECEIVE' ORDER BY created_at DESC LIMIT 1) sm ON true
 WHERE l.is_active IS TRUE AND lower(l.status) IN('waiting_qc','qc_in_progress','qc_failed')
),
active_repairs AS (
 SELECT r.*,c.landed_cost_vnd,c.cost_status FROM repair_jobs r LEFT JOIN laptop_landed_costs c ON c.laptop_id=r.laptop_id
 WHERE r.status NOT IN('COMPLETED','CANCELLED')
),
active_returns AS (
 SELECT r.id,r.status,ri.laptop_id,coalesce(ri.agreed_refund_rmb,ri.expected_refund_rmb,0) refundable_rmb,
   c.landed_cost_vnd,c.cost_status
 FROM supplier_returns r JOIN supplier_return_items ri ON ri.supplier_return_id=r.id AND ri.status NOT IN('REFUNDED','REPLACED','REJECTED','CANCELLED')
 LEFT JOIN laptop_landed_costs c ON c.laptop_id=ri.laptop_id
 WHERE r.status NOT IN('REFUNDED','REPLACED','REJECTED','CLOSED','CANCELLED')
),
refunds AS (SELECT supplier_return_id,sum(amount_rmb) amount_rmb FROM supplier_refunds GROUP BY supplier_return_id)
SELECT jsonb_build_object(
 'generated_at',timezone('utc',now()),
 'thresholds',jsonb_build_object('warning_days',30,'critical_days',60),
 'available',jsonb_build_object(
   'units',(SELECT count(*) FROM available),
   'cost_complete',(SELECT count(*) FROM available WHERE cost_status='COMPLETE'),
   'cost_incomplete',(SELECT count(*) FROM available WHERE cost_status='INCOMPLETE'),
   'legacy',(SELECT count(*) FROM available WHERE cost_status='LEGACY'),
   'missing_aging_timestamp',(SELECT count(*) FROM available WHERE available_for_sale_at IS NULL),
   'known_inventory_cost_vnd',(SELECT coalesce(sum(landed_cost_vnd),0) FROM available WHERE cost_status='COMPLETE')
 ),
 'aging',coalesce((SELECT jsonb_agg(to_jsonb(aging) ORDER BY sort_order) FROM aging),'[]'::jsonb),
 'state_summary',(SELECT coalesce(jsonb_object_agg(state,units),'{}'::jsonb) FROM states) || jsonb_build_object('reserved',(SELECT units FROM reserved)),
 'transit',jsonb_build_object(
   'units',(SELECT count(*) FROM transit_rows),
   'purchase_value_vnd',(SELECT coalesce(sum(value_vnd),0) FROM transit_rows),
   'by_stage',coalesce((SELECT jsonb_object_agg(stage,units) FROM (SELECT stage,count(*)::integer units FROM transit_rows GROUP BY stage) x),'{}'::jsonb)
 ),
 'qc',jsonb_build_object(
   'waiting_qc',jsonb_build_object('units',(SELECT count(*) FROM qc_rows WHERE state='waiting_qc'),'oldest_age',(SELECT coalesce(max(age_days),0) FROM qc_rows WHERE state='waiting_qc')),
   'qc_in_progress',jsonb_build_object('units',(SELECT count(*) FROM qc_rows WHERE state='qc_in_progress'),'oldest_age',(SELECT coalesce(max(age_days),0) FROM qc_rows WHERE state='qc_in_progress')),
   'qc_failed',jsonb_build_object('units',(SELECT count(*) FROM qc_rows WHERE state='qc_failed'),'oldest_age',(SELECT coalesce(max(age_days),0) FROM qc_rows WHERE state='qc_failed')),
   'known_cost_vnd',(SELECT coalesce(sum(landed_cost_vnd),0) FROM qc_rows WHERE cost_status='COMPLETE')
 ),
 'repairs',jsonb_build_object(
   'active_jobs',(SELECT count(*) FROM active_repairs),'waiting_parts',(SELECT count(*) FROM active_repairs WHERE status='WAITING_PART'),
   'oldest_age',(SELECT coalesce(max(greatest(floor(extract(epoch FROM (now()-coalesce(started_at,created_at)))/86400),0)),0) FROM active_repairs),
   'accumulated_cost_vnd',(SELECT coalesce(sum(total_cost_vnd),0) FROM active_repairs),
   'known_laptop_cost_vnd',(SELECT coalesce(sum(landed_cost_vnd),0) FROM active_repairs WHERE cost_status='COMPLETE')
 ),
 'supplier_returns',jsonb_build_object(
   'pending',(SELECT count(DISTINCT id) FROM active_returns),
   'shipped',(SELECT count(DISTINCT id) FROM active_returns WHERE status IN('SHIPPED','SUPPLIER_RECEIVED')),
   'waiting_refund',(SELECT count(DISTINCT id) FROM active_returns WHERE status IN('WAITING_REFUND','PARTIALLY_RESOLVED')),
   'waiting_replacement',(SELECT count(DISTINCT id) FROM active_returns WHERE status='WAITING_REPLACEMENT'),
   'known_cost_exposure_vnd',(SELECT coalesce(sum(landed_cost_vnd),0) FROM active_returns WHERE cost_status='COMPLETE'),
   'refund_pending_rmb',(SELECT coalesce(sum(greatest(x.refundable-coalesce(rf.amount_rmb,0),0)),0) FROM (SELECT id,sum(refundable_rmb) refundable FROM active_returns WHERE status IN('WAITING_REFUND','PARTIALLY_RESOLVED') GROUP BY id) x LEFT JOIN refunds rf ON rf.supplier_return_id=x.id)
 ),
 'slow_moving',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY age_days DESC,laptop_id) FROM (
   SELECT id laptop_id,serial,name model,location,age_days,landed_cost_vnd,cost_status,
     round(coalesce(retail_price_vnd,0)*1000000,0) selling_price_vnd,
     CASE WHEN cost_status='COMPLETE' THEN round(coalesce(retail_price_vnd,0)*1000000-landed_cost_vnd,0) END gross_margin_potential_vnd
   FROM available WHERE age_days>=30 ORDER BY age_days DESC,id LIMIT 25
 ) x),'[]'::jsonb)
)
$$;

REVOKE ALL ON FUNCTION public.get_management_dashboard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_management_dashboard() TO service_role;
COMMIT;
