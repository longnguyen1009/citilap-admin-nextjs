-- Inventory list reads tracking_code; procurement lineage also keeps tracking_code_cn.
UPDATE laptops
SET tracking_code = tracking_code_cn
WHERE trim(coalesce(tracking_code_cn,'')) <> '';

CREATE TABLE _tracking_code_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _tracking_code_guard
SELECT CASE WHEN
  (SELECT count(*) FROM laptops WHERE trim(coalesce(tracking_code_cn,'')) <> '') = 172
  AND NOT EXISTS(
    SELECT 1 FROM laptops
    WHERE trim(coalesce(tracking_code_cn,'')) <> ''
      AND coalesce(tracking_code,'') <> tracking_code_cn
  )
THEN 1 ELSE 0 END;
DROP TABLE _tracking_code_guard;
