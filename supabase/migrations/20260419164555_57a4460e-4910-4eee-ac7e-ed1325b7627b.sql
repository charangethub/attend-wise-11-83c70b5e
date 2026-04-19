-- 1. Add size column to distribution_status
ALTER TABLE public.distribution_status
  ADD COLUMN IF NOT EXISTS size text;

-- 2. Drop old uniqueness on (student_id, item_type) and replace with (student_id, item_type, size)
--    so a student can have one T-shirt per size if ever needed (still a single row per item normally)
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.distribution_status'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%(student_id, item_type)%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%size%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.distribution_status DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS distribution_status_student_item_size_uidx
  ON public.distribution_status (student_id, item_type, COALESCE(size, ''));

-- 3. Replace canonical_item_key so T-shirt sizes are preserved (e.g. T_SHIRT_L stays distinct from T_SHIRT_M)
CREATE OR REPLACE FUNCTION public.canonical_item_key(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  k text;
  sz text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  k := UPPER(REGEXP_REPLACE(TRIM(_raw), '[\s\-]+', '_', 'g'));
  k := REGEXP_REPLACE(k, '[^A-Z0-9_]', '', 'g');
  IF k LIKE 'VDPP%' THEN RETURN 'VDPP'; END IF;
  IF k LIKE 'T_SHIRT%' OR k LIKE 'TSHIRT%' OR k = 'TSHIRT' THEN
    -- Try to extract trailing size token
    sz := NULLIF(REGEXP_REPLACE(k, '^T_?SHIRT_?', ''), '');
    IF sz IN ('XS','S','M','L','XL','XXL','XXXL') THEN
      RETURN 'T_SHIRT_' || sz;
    END IF;
    RETURN 'T_SHIRT';
  END IF;
  RETURN k;
END;
$function$;

-- 4. Update sync trigger to take size into account when matching the right inventory row
CREATE OR REPLACE FUNCTION public.sync_inventory_on_distribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id uuid;
  v_old_qty integer := 0;
  v_new_qty integer := 0;
  v_delta integer := 0;
  v_canonical text;
  v_size text;
  v_base text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'GIVEN' THEN v_new_qty := COALESCE(NEW.quantity, 1); END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'GIVEN' THEN v_old_qty := COALESCE(OLD.quantity, 1); END IF;
    IF NEW.status = 'GIVEN' THEN v_new_qty := COALESCE(NEW.quantity, 1); END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'GIVEN' THEN v_old_qty := COALESCE(OLD.quantity, 1); END IF;
  END IF;

  v_delta := v_new_qty - v_old_qty;
  IF v_delta = 0 THEN RETURN COALESCE(NEW, OLD); END IF;

  v_canonical := public.canonical_item_key(COALESCE(NEW.item_type, OLD.item_type));
  v_size := UPPER(COALESCE(NEW.size, OLD.size, ''));

  -- For T-shirts: prefer matching inventory row by size; fall back to canonical key match
  IF v_canonical LIKE 'T_SHIRT%' THEN
    -- If size came from item_type suffix, extract it; otherwise use the explicit size column
    IF v_size = '' AND v_canonical <> 'T_SHIRT' THEN
      v_size := REGEXP_REPLACE(v_canonical, '^T_SHIRT_', '');
    END IF;

    IF v_size <> '' THEN
      SELECT id INTO v_item_id
      FROM public.inventory_items
      WHERE public.canonical_item_key(item_name) = 'T_SHIRT'
        AND UPPER(COALESCE(size, '')) = v_size
      ORDER BY (CASE WHEN COALESCE(current_stock,0) > 0 THEN 0 ELSE 1 END), created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  IF v_item_id IS NULL THEN
    v_base := CASE WHEN v_canonical LIKE 'T_SHIRT_%' THEN 'T_SHIRT' ELSE v_canonical END;
    SELECT id INTO v_item_id
    FROM public.inventory_items
    WHERE public.canonical_item_key(item_name) = v_base
    ORDER BY (CASE WHEN COALESCE(current_stock,0) > 0 THEN 0 ELSE 1 END), created_at ASC
    LIMIT 1;
  END IF;

  IF v_item_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.inventory_items
  SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
      current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
      updated_at    = now()
  WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;