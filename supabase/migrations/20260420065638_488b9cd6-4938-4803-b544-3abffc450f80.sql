CREATE OR REPLACE FUNCTION public.sync_inventory_on_distribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_qty integer := 0;
  v_new_qty integer := 0;
  v_delta integer := 0;
  v_canonical text;
  v_size text;
  v_size_item_id uuid;
  v_agg_rows integer := 0;
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

  -- VDPP: update ALL VDPP* inventory rows
  IF v_canonical = 'VDPP' THEN
    UPDATE public.inventory_items
    SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
        current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
        updated_at    = now()
    WHERE public.canonical_item_key(item_name) = 'VDPP'
       OR UPPER(REGEXP_REPLACE(COALESCE(item_name,''), '[\s\-]+', '_', 'g')) LIKE 'VDPP%';
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- T-shirts: update BOTH the size-specific row AND the aggregate (no-size) T-Shirts row
  IF v_canonical LIKE 'T_SHIRT%' THEN
    IF v_size = '' AND v_canonical <> 'T_SHIRT' THEN
      v_size := REGEXP_REPLACE(v_canonical, '^T_SHIRT_', '');
    END IF;

    -- 1) Size-specific row
    IF v_size <> '' THEN
      SELECT id INTO v_size_item_id
      FROM public.inventory_items
      WHERE public.canonical_item_key(item_name) = 'T_SHIRT'
        AND UPPER(COALESCE(size, '')) = v_size
      ORDER BY (CASE WHEN COALESCE(current_stock,0) > 0 THEN 0 ELSE 1 END), created_at ASC
      LIMIT 1;

      IF v_size_item_id IS NOT NULL THEN
        UPDATE public.inventory_items
        SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
            current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
            updated_at    = now()
        WHERE id = v_size_item_id;
      END IF;
    END IF;

    -- 2) Aggregate row(s): T-Shirt rows with no size (treated as the combined total bucket)
    UPDATE public.inventory_items
    SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
        current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
        updated_at    = now()
    WHERE public.canonical_item_key(item_name) = 'T_SHIRT'
      AND COALESCE(NULLIF(TRIM(size), ''), '') = '';
    GET DIAGNOSTICS v_agg_rows = ROW_COUNT;

    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Other items: single matching row
  DECLARE v_item_id uuid;
  BEGIN
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
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;