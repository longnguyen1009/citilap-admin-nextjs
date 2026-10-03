-- Default invoice gift catalog. Safe to re-apply by SKU.
INSERT INTO accessories(sku,name,kind,price,note,active) VALUES
  ('PK-MOUSE','Chuột không dây','mouse',0,'Quà tặng kèm đơn hàng',1),
  ('PK-BAG','Balo laptop','backpack',0,'Quà tặng kèm đơn hàng',1),
  ('PK-PAD','Lót chuột','mousepad',0,'Quà tặng kèm đơn hàng',1),
  ('PK-SLEEVE','Túi chống sốc','sleeve',0,'Quà tặng kèm đơn hàng',1)
ON CONFLICT(sku) DO UPDATE SET
  name=excluded.name,
  kind=excluded.kind,
  note=excluded.note,
  active=1;
