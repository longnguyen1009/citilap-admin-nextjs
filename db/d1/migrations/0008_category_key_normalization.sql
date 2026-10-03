-- Move legacy year-specific Legion categories to the canonical combined catalog.
-- Resolve through app_options labels because older databases used different numeric keys.
UPDATE laptops
SET category = CASE lower(trim(COALESCE((
  SELECT label FROM app_options
  WHERE group_key = 'category' AND option_key = laptops.category
  ORDER BY is_active DESC, id DESC LIMIT 1
), '')))
  WHEN 'legion 5 2021' THEN 'legion_5_21_22'
  WHEN 'legion 5 2022' THEN 'legion_5_21_22'
  WHEN 'legion 5 2023' THEN 'legion_5_23_24'
  WHEN 'legion 5 pro 2021' THEN 'legion_5_pro_21_22'
  WHEN 'legion 5 pro 2022' THEN 'legion_5_pro_21_22'
  WHEN 'legion 5 pro 2023-2024' THEN 'legion_5_pro_23_24'
  ELSE category
END;

UPDATE orders
SET requested_category = CASE lower(trim(COALESCE((
  SELECT label FROM app_options
  WHERE group_key = 'category' AND option_key = orders.requested_category
  ORDER BY is_active DESC, id DESC LIMIT 1
), '')))
  WHEN 'legion 5 2021' THEN 'legion_5_21_22'
  WHEN 'legion 5 2022' THEN 'legion_5_21_22'
  WHEN 'legion 5 2023' THEN 'legion_5_23_24'
  WHEN 'legion 5 pro 2021' THEN 'legion_5_pro_21_22'
  WHEN 'legion 5 pro 2022' THEN 'legion_5_pro_21_22'
  WHEN 'legion 5 pro 2023-2024' THEN 'legion_5_pro_23_24'
  ELSE requested_category
END
WHERE requested_category IS NOT NULL;
