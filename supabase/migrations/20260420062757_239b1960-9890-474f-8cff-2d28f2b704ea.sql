-- Update sync_inventory_on_distribution so VDPP distributions decrement BOTH
-- VDPP_BOOKLET_1 and VDPP_BOOKLET_2 inventory rows (and any other VDPP rows).
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
  v_rows integer := 0;
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

  -- VDPP: update ALL VDPP* inventory rows (e.g. VDPP_BOOKLET_1 and VDPP_BOOKLET_2)
  IF v_canonical = 'VDPP' THEN
    UPDATE public.inventory_items
    SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
        current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
        updated_at    = now()
    WHERE public.canonical_item_key(item_name) = 'VDPP'
       OR UPPER(REGEXP_REPLACE(COALESCE(item_name,''), '[\s\-]+', '_', 'g')) LIKE 'VDPP%';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- T-shirts: prefer matching inventory row by size; fall back to canonical key match
  IF v_canonical LIKE 'T_SHIRT%' THEN
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