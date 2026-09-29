-- Keep one editable note per laptop across purchase, receiving, inventory and QC test.
BEGIN;
CREATE OR REPLACE FUNCTION public.receive_inventory(
  p_expected jsonb, p_unknown jsonb, p_notes text, p_actor text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE prior jsonb; known_result jsonb:=jsonb_build_object('laptops','[]'::jsonb,'received_count',0);
  entry jsonb; unknown_rows jsonb:='[]'::jsonb; unknown_row jsonb; index_no integer:=0;
BEGIN
  SELECT result INTO prior FROM operation_requests
  WHERE idempotency_key=p_idempotency_key AND operation='RECEIVE_INVENTORY';
  IF FOUND THEN RETURN prior; END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 80
     OR jsonb_typeof(coalesce(p_expected,'[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_typeof(coalesce(p_unknown,'[]'::jsonb)) IS DISTINCT FROM 'array'
     OR jsonb_array_length(coalesce(p_expected,'[]'::jsonb))+jsonb_array_length(coalesce(p_unknown,'[]'::jsonb)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Đợt nhận hàng không hợp lệ';
  END IF;
  IF jsonb_array_length(coalesce(p_expected,'[]'::jsonb))>0 THEN
    known_result:=receive_purchase_laptops(p_expected,p_notes,p_actor,p_idempotency_key||'-expected');
    -- Receiving edits the same laptop note instead of creating or appending another note.
    FOR entry IN SELECT value FROM jsonb_array_elements(p_expected) LOOP
      IF entry ? 'notes' THEN
        UPDATE laptops SET condition_note=left(coalesce(entry->>'notes',''),2000)
        WHERE id=(entry->>'laptop_id')::bigint;
      END IF;
    END LOOP;
    SELECT jsonb_build_object('laptops',coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb),
      'received_count',count(*)) INTO known_result
    FROM laptops l WHERE l.id IN (SELECT (value->>'laptop_id')::bigint FROM jsonb_array_elements(p_expected));
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_unknown,'[]'::jsonb)) LOOP
    index_no:=index_no+1;
    unknown_row:=receive_unknown_laptop(entry,p_actor,p_idempotency_key||'-unknown-'||index_no::text);
    unknown_rows:=unknown_rows||jsonb_build_array(unknown_row);
  END LOOP;
  prior:=jsonb_build_object('expected',known_result->'laptops','unknown',unknown_rows,
    'received_count',jsonb_array_length(coalesce(known_result->'laptops','[]'::jsonb))+jsonb_array_length(unknown_rows));
  INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
  VALUES(p_idempotency_key,'RECEIVE_INVENTORY',prior,p_actor);
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('RECEIVING',p_idempotency_key,'CREATE',jsonb_build_object('received_count',prior->'received_count','notes',left(coalesce(p_notes,''),1000)),p_actor);
  RETURN prior;
END;
$$;
REVOKE ALL ON FUNCTION public.receive_inventory(jsonb,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_inventory(jsonb,jsonb,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
