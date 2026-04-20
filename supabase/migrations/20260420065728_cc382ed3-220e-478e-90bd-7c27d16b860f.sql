-- 1) Normalize T_SHIRTS -> T_SHIRT
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
  IF k LIKE 'T_SHIRT%' OR k LIKE 'TSHIRT%' OR k = 'TSHIRT' OR k = 'T_SHIRTS' OR k = 'TSHIRTS' THEN
    sz := NULLIF(REGEXP_REPLACE(k, '^T_?SHIRTS?_?', ''), '');
    IF sz IN ('XS','S','M','L','XL','XXL','XXXL') THEN
      RETURN 'T_SHIRT_' || sz;
    END IF;
    RETURN 'T_SHIRT';
  END IF;
  RETURN k;
END;
$function$;

-- 2) Backfill distributed counts for all T-Shirt rows from current GIVEN records.
--    Size-specific rows get their own size totals; aggregate (no-size) rows get the combined total.
WITH given_by_size AS (
  SELECT UPPER(COALESCE(size,'')) AS sz, SUM(COALESCE(quantity,1))::int AS qty
  FROM public.distribution_status
  WHERE status = 'GIVEN'
    AND public.canonical_item_key(item_type) LIKE 'T_SHIRT%'
  GROUP BY UPPER(COALESCE(size,''))
),
total_given AS (
  SELECT SUM(qty)::int AS qty FROM given_by_size
)
UPDATE public.inventory_items i
SET distributed = COALESCE(g.qty, 0),
    current_stock = GREATEST(0, COALESCE(i.ytd_received,0) - COALESCE(g.qty,0) - COALESCE(i.damaged,0) - COALESCE(i.missing,0) - COALESCE(i.reserved,0)),
    updated_at = now()
FROM (
  SELECT id,
         CASE WHEN COALESCE(NULLIF(TRIM(size),''),'') = ''
              THEN (SELECT qty FROM total_given)
              ELSE (SELECT qty FROM given_by_size WHERE sz = UPPER(TRIM(COALESCE(size,''))))
         END AS qty
  FROM public.inventory_items
  WHERE public.canonical_item_key(item_name) = 'T_SHIRT'
) g
WHERE i.id = g.id;