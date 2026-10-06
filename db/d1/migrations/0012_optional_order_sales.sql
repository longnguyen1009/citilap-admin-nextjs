-- sale_online / sale_offline are already nullable TEXT in the D1 schema.
-- Canonical representation for an unassigned salesperson is NULL.
UPDATE orders SET sale_online = NULL WHERE sale_online IS NOT NULL AND trim(sale_online) = '';
UPDATE orders SET sale_offline = NULL WHERE sale_offline IS NOT NULL AND trim(sale_offline) = '';
