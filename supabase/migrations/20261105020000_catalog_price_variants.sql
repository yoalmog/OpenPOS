-- Persist explicit size/price choices for products such as Personal, Mediana and Familiar.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS price_variants JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_price_variants_is_array;

ALTER TABLE public.items
  ADD CONSTRAINT items_price_variants_is_array
  CHECK (jsonb_typeof(price_variants) = 'array');
