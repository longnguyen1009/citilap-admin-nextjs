-- Remove the legacy free-form gift field. Gift accessories and gift presets are
-- the single source of truth for invoice gifts.
BEGIN;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS gifts;

DELETE FROM public.app_options
WHERE group_key = 'giftOptions';

COMMIT;
