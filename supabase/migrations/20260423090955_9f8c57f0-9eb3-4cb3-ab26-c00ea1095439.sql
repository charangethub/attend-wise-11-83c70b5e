CREATE OR REPLACE FUNCTION public.normalize_inventory_grade_bucket(_grade text, _curriculum text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  g text;
  c text;
BEGIN
  g := COALESCE(UPPER(TRIM(_grade)), '');
  c := COALESCE(UPPER(TRIM(_curriculum)), '');

  g := REGEXP_REPLACE(g, '[\s_]+', '-', 'g');
  g := REGEXP_REPLACE(g, '-+', '-', 'g');
  c := REGEXP_REPLACE(c, '[\s_]+', '-', 'g');
  c := REGEXP_REPLACE(c, '-+', '-', 'g');

  IF (g = '11' OR g LIKE '11-%') AND c LIKE 'JEE%' THEN RETURN '11-JEE'; END IF;
  IF (g = '12' OR g LIKE '12-%') AND c LIKE 'JEE%' THEN RETURN '12-JEE'; END IF;
  IF (g = '11' OR g LIKE '11-%') AND c LIKE 'NEET%' THEN RETURN '11-NEET'; END IF;
  IF (g = '12' OR g LIKE '12-%') AND c LIKE 'NEET%' THEN RETURN '12-NEET'; END IF;

  IF g ~ '^11-?JEE([-.].*)?$' THEN RETURN '11-JEE'; END IF;
  IF g ~ '^12-?JEE([-.].*)?$' THEN RETURN '12-JEE'; END IF;
  IF g ~ '^11-?NEET([-.].*)?$' THEN RETURN '11-NEET'; END IF;
  IF g ~ '^12-?NEET([-.].*)?$' THEN RETURN '12-NEET'; END IF;

  RETURN g;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_inventory_on_distribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_qty integer := 0;
  v_new_qty integer := 0;
  v_delta integer := 0;
  v_canonical text;
  v_size text;
  v_student_grade text := '';
  v_item_id uuid;
  v_size_item_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'GIVEN' THEN
      v_new_qty := COALESCE(NEW.quantity, 1);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'GIVEN' THEN
      v_old_qty := COALESCE(OLD.quantity, 1);
    END IF;
    IF NEW.status = 'GIVEN' THEN
      v_new_qty := COALESCE(NEW.quantity, 1);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'GIVEN' THEN
      v_old_qty := COALESCE(OLD.quantity, 1);
    END IF;
  END IF;

  v_delta := v_new_qty - v_old_qty;
  IF v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_canonical := public.canonical_item_key(COALESCE(NEW.item_type, OLD.item_type));
  v_size := UPPER(COALESCE(NEW.size, OLD.size, ''));

  SELECT public.normalize_inventory_grade_bucket(s.grade, s.curriculum)
  INTO v_student_grade
  FROM public.students s
  WHERE s.id = COALESCE(NEW.student_id, OLD.student_id)
  LIMIT 1;

  IF v_canonical = 'VDPP' THEN
    UPDATE public.inventory_items
    SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
        current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
        updated_at    = now()
    WHERE public.canonical_item_key(item_name) = 'VDPP'
       OR UPPER(REGEXP_REPLACE(COALESCE(item_name,''), '[\s\-]+', '_', 'g')) LIKE 'VDPP%';

    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_canonical LIKE 'T_SHIRT%' THEN
    IF v_size = '' AND v_canonical <> 'T_SHIRT' THEN
      v_size := REGEXP_REPLACE(v_canonical, '^T_SHIRT_', '');
    END IF;

    IF v_size <> '' THEN
      SELECT id INTO v_size_item_id
      FROM public.inventory_items
      WHERE public.canonical_item_key(item_name) = 'T_SHIRT'
        AND UPPER(COALESCE(size, '')) = v_size
      ORDER BY (CASE WHEN COALESCE(current_stock, 0) > 0 THEN 0 ELSE 1 END), created_at ASC
      LIMIT 1;

      IF v_size_item_id IS NOT NULL THEN
        UPDATE public.inventory_items
        SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
            current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
            updated_at    = now()
        WHERE id = v_size_item_id;
      END IF;
    END IF;

    UPDATE public.inventory_items
    SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
        current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
        updated_at    = now()
    WHERE public.canonical_item_key(item_name) = 'T_SHIRT'
      AND COALESCE(NULLIF(TRIM(size), ''), '') = '';

    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_item_id
  FROM public.inventory_items
  WHERE public.canonical_item_key(item_name) = v_canonical
    AND (
      v_student_grade = ''
      OR COALESCE(NULLIF(TRIM(grade), ''), '') = ''
      OR public.normalize_inventory_grade_bucket(grade) = v_student_grade
      OR public.normalize_inventory_grade_bucket(grade, NULL) = v_student_grade
    )
  ORDER BY
    CASE
      WHEN v_student_grade <> '' AND public.normalize_inventory_grade_bucket(grade) = v_student_grade THEN 0
      WHEN v_student_grade <> '' AND public.normalize_inventory_grade_bucket(grade, NULL) = v_student_grade THEN 0
      WHEN COALESCE(NULLIF(TRIM(grade), ''), '') = '' THEN 1
      ELSE 2
    END,
    CASE WHEN COALESCE(current_stock, 0) > 0 THEN 0 ELSE 1 END,
    created_at ASC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.inventory_items
  SET distributed   = GREATEST(0, COALESCE(distributed, 0) + v_delta),
      current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
      updated_at    = now()
  WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;