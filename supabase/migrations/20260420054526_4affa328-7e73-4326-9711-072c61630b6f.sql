-- Drop the old expression-based index
DROP INDEX IF EXISTS public.distribution_status_student_item_size_uidx;

-- Backfill any NULL sizes to empty string so we can have a strict unique constraint
UPDATE public.distribution_status SET size = '' WHERE size IS NULL;

-- Make size NOT NULL with default '' so unique constraint works cleanly
ALTER TABLE public.distribution_status
  ALTER COLUMN size SET DEFAULT '',
  ALTER COLUMN size SET NOT NULL;

-- Drop any old uniqueness on (student_id, item_type) just in case
DO $$
DECLARE v_conname text;
BEGIN
  FOR v_conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.distribution_status'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.distribution_status DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

-- Add a real unique constraint that matches the upsert's ON CONFLICT target
ALTER TABLE public.distribution_status
  ADD CONSTRAINT distribution_status_student_item_size_uniq
  UNIQUE (student_id, item_type, size);

-- Ensure the inventory sync trigger is attached
DROP TRIGGER IF EXISTS trg_sync_inventory_on_distribution ON public.distribution_status;
CREATE TRIGGER trg_sync_inventory_on_distribution
AFTER INSERT OR UPDATE OR DELETE ON public.distribution_status
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_on_distribution();