-- 1) Fix the "Dairy" -> "Diary" typo
UPDATE public.inventory_items
SET item_name = 'Diary', updated_at = now()
WHERE UPPER(TRIM(item_name)) = 'DAIRY';

-- 2) Initialize current_stock to ytd_received where 0/NULL
UPDATE public.inventory_items
SET current_stock = ytd_received, updated_at = now()
WHERE (current_stock IS NULL OR current_stock = 0)
  AND COALESCE(ytd_received, 0) > 0;

-- 3) Backfill GENERIC items (non VDPP, non T_SHIRT)
WITH given_generic AS (
  SELECT
    public.canonical_item_key(ds.item_type) AS canon_key,
    public.normalize_inventory_grade_bucket(s.grade, s.curriculum) AS grade_bucket,
    SUM(COALESCE(ds.quantity, 1))::int AS qty
  FROM public.distribution_status ds
  LEFT JOIN public.students s ON s.id = ds.student_id
  WHERE ds.status = 'GIVEN'
    AND public.canonical_item_key(ds.item_type) NOT LIKE 'T_SHIRT%'
    AND public.canonical_item_key(ds.item_type) <> 'VDPP'
  GROUP BY 1, 2
),
target_rows AS (
  SELECT DISTINCT ON (gg.canon_key, gg.grade_bucket)
    ii.id AS item_id,
    gg.qty
  FROM given_generic gg
  JOIN public.inventory_items ii
    ON public.canonical_item_key(ii.item_name) = gg.canon_key
   AND (
     gg.grade_bucket = ''
     OR COALESCE(NULLIF(TRIM(ii.grade), ''), '') = ''
     OR public.normalize_inventory_grade_bucket(ii.grade, NULL::text) = gg.grade_bucket
   )
  ORDER BY
    gg.canon_key,
    gg.grade_bucket,
    CASE
      WHEN gg.grade_bucket <> '' AND public.normalize_inventory_grade_bucket(ii.grade, NULL::text) = gg.grade_bucket THEN 0
      WHEN COALESCE(NULLIF(TRIM(ii.grade), ''), '') = '' THEN 1
      ELSE 2
    END,
    ii.created_at ASC
),
agg AS (
  SELECT item_id, SUM(qty)::int AS total_qty
  FROM target_rows
  GROUP BY item_id
)
UPDATE public.inventory_items ii
SET distributed   = agg.total_qty,
    current_stock = GREATEST(0, COALESCE(ii.ytd_received, 0) - agg.total_qty - COALESCE(ii.damaged,0) - COALESCE(ii.missing,0) - COALESCE(ii.reserved,0)),
    updated_at    = now()
FROM agg
WHERE ii.id = agg.item_id;

-- 4) Backfill VDPP rows
WITH vdpp_total AS (
  SELECT COALESCE(SUM(COALESCE(quantity, 1)), 0)::int AS qty
  FROM public.distribution_status
  WHERE status = 'GIVEN'
    AND public.canonical_item_key(item_type) = 'VDPP'
)
UPDATE public.inventory_items ii
SET distributed   = vt.qty,
    current_stock = GREATEST(0, COALESCE(ii.ytd_received, 0) - vt.qty - COALESCE(ii.damaged,0) - COALESCE(ii.missing,0) - COALESCE(ii.reserved,0)),
    updated_at    = now()
FROM vdpp_total vt
WHERE public.canonical_item_key(ii.item_name) = 'VDPP'
   OR UPPER(REGEXP_REPLACE(COALESCE(ii.item_name,''), '[\s\-]+', '_', 'g')) LIKE 'VDPP%';

-- 5) Backfill T-Shirt per-size rows
WITH given_tshirt AS (
  SELECT
    UPPER(COALESCE(NULLIF(TRIM(ds.size), ''),
      REGEXP_REPLACE(public.canonical_item_key(ds.item_type), '^T_SHIRT_?', ''))) AS sz,
    SUM(COALESCE(ds.quantity, 1))::int AS qty
  FROM public.distribution_status ds
  WHERE ds.status = 'GIVEN'
    AND public.canonical_item_key(ds.item_type) LIKE 'T_SHIRT%'
  GROUP BY 1
)
UPDATE public.inventory_items ii
SET distributed   = gt.qty,
    current_stock = GREATEST(0, COALESCE(ii.ytd_received, 0) - gt.qty - COALESCE(ii.damaged,0) - COALESCE(ii.missing,0) - COALESCE(ii.reserved,0)),
    updated_at    = now()
FROM given_tshirt gt
WHERE public.canonical_item_key(ii.item_name) = 'T_SHIRT'
  AND UPPER(COALESCE(ii.size, '')) = gt.sz
  AND gt.sz <> '';

-- 6) Backfill aggregate T-Shirt row (no size) with grand total
WITH tshirt_total AS (
  SELECT COALESCE(SUM(COALESCE(quantity, 1)), 0)::int AS qty
  FROM public.distribution_status
  WHERE status = 'GIVEN'
    AND public.canonical_item_key(item_type) LIKE 'T_SHIRT%'
)
UPDATE public.inventory_items ii
SET distributed   = tt.qty,
    current_stock = GREATEST(0, COALESCE(ii.ytd_received, 0) - tt.qty - COALESCE(ii.damaged,0) - COALESCE(ii.missing,0) - COALESCE(ii.reserved,0)),
    updated_at    = now()
FROM tshirt_total tt
WHERE public.canonical_item_key(ii.item_name) = 'T_SHIRT'
  AND COALESCE(NULLIF(TRIM(ii.size), ''), '') = '';