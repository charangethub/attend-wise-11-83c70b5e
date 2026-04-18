-- Helper: canonicalize item types so VDPP_BOOKLET_1 / VDPP_BOOKLET_2 / VDPP all map to "VDPP",
-- and any T_SHIRT_* size maps to "T_SHIRT".
CREATE OR REPLACE FUNCTION public.canonical_item_key(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  k text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  k := UPPER(REGEXP_REPLACE(TRIM(_raw), '[\s\-]+', '_', 'g'));
  k := REGEXP_REPLACE(k, '[^A-Z0-9_]', '', 'g');
  IF k LIKE 'VDPP%' THEN RETURN 'VDPP'; END IF;
  IF k LIKE 'T_SHIRT%' OR k = 'TSHIRT' OR k LIKE 'TSHIRT%' THEN RETURN 'T_SHIRT'; END IF;
  RETURN k;
END;
$$;

-- Replace sync trigger so it matches inventory by canonical key (handles VDPP & T-Shirt aliases)
CREATE OR REPLACE FUNCTION public.sync_inventory_on_distribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_id uuid;
  v_old_qty integer := 0;
  v_new_qty integer := 0;
  v_delta integer := 0;
  v_canonical text;
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

  -- Match inventory row whose canonical key equals the distribution canonical key.
  -- Prefer rows with stock available; otherwise pick oldest.
  SELECT id INTO v_item_id
  FROM public.inventory_items
  WHERE public.canonical_item_key(item_name) = v_canonical
  ORDER BY (CASE WHEN COALESCE(current_stock,0) > 0 THEN 0 ELSE 1 END), created_at ASC
  LIMIT 1;

  IF v_item_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.inventory_items
  SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
      current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
      updated_at    = now()
  WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Make sure trigger is attached
DROP TRIGGER IF EXISTS trg_sync_inventory_on_distribution ON public.distribution_status;
CREATE TRIGGER trg_sync_inventory_on_distribution
AFTER INSERT OR UPDATE OR DELETE ON public.distribution_status
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_on_distribution();
