-- Recalculate distributed and current_stock for ALL inventory items
-- from the actual distribution_status GIVEN records
UPDATE public.inventory_items inv
SET
  distributed = COALESCE(ds_totals.total_given, 0),
  current_stock = GREATEST(
    0,
    COALESCE(inv.ytd_received, 0)
      - COALESCE(ds_totals.total_given, 0)
      - COALESCE(inv.damaged, 0)
      - COALESCE(inv.missing, 0)
      - COALESCE(inv.reserved, 0)
  ),
  updated_at = now()
FROM (
  SELECT
    public.canonical_item_key(ds.item_type) AS canon_key,
    SUM(COALESCE(ds.quantity, 1)) AS total_given
  FROM public.distribution_status ds
  WHERE ds.status = 'GIVEN'
  GROUP BY public.canonical_item_key(ds.item_type)
) ds_totals
WHERE public.canonical_item_key(inv.item_name) = ds_totals.canon_key;
