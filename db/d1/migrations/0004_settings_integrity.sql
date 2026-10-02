-- Rebuild app_settings with database-level JSON and key constraints.
-- Existing preset data is preserved; a missing formula is seeded.

CREATE TABLE app_settings_validated (
  key TEXT NOT NULL PRIMARY KEY
    CHECK (key IN ('formula', 'preset_configs')),
  value TEXT NOT NULL
    CHECK (json_valid(value) = 1)
    CHECK (json_type(value) = 'object')
    CHECK (key <> 'formula' OR (
      json_remove(value, '$.shippingVnd', '$.divisor', '$.defaultRate') = '{}'
      AND coalesce(json_type(value, '$.shippingVnd') IN ('integer', 'real'), 0) = 1
      AND json_extract(value, '$.shippingVnd') BETWEEN 0 AND 1000000000
      AND coalesce(json_type(value, '$.divisor') IN ('integer', 'real'), 0) = 1
      AND json_extract(value, '$.divisor') > 0
      AND json_extract(value, '$.divisor') <= 1000000000
      AND coalesce(json_type(value, '$.defaultRate') IN ('integer', 'real'), 0) = 1
      AND json_extract(value, '$.defaultRate') > 0
      AND json_extract(value, '$.defaultRate') <= 1000000000
    ))
    CHECK (key <> 'preset_configs' OR length(value) <= 100000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO app_settings_validated(key, value, created_at, updated_at)
SELECT key, value,
  coalesce(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  coalesce(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM app_settings;

INSERT INTO app_settings_validated(key, value)
VALUES ('formula', '{"shippingVnd":400000,"divisor":1000000,"defaultRate":3990}')
ON CONFLICT(key) DO NOTHING;

DROP TABLE app_settings;
ALTER TABLE app_settings_validated RENAME TO app_settings;
