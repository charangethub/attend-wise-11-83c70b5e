-- 1. Add quantity to distribution_status
ALTER TABLE public.distribution_status
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

-- 2. Auto-decrement / restore inventory based on distribution changes
CREATE OR REPLACE FUNCTION public.sync_inventory_on_distribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_old_qty integer := 0;
  v_new_qty integer := 0;
  v_delta integer := 0;
BEGIN
  -- Compute the qty going OUT (positive = consume stock, negative = restore)
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'GIVEN' THEN v_new_qty := COALESCE(NEW.quantity, 1); END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'GIVEN' THEN v_old_qty := COALESCE(OLD.quantity, 1); END IF;
    IF NEW.status = 'GIVEN' THEN v_new_qty := COALESCE(NEW.quantity, 1); END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'GIVEN' THEN v_old_qty := COALESCE(OLD.quantity, 1); END IF;
  END IF;

  v_delta := v_new_qty - v_old_qty;
  IF v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Find first inventory row matching the item_type by name (case-insensitive, normalized)
  SELECT id INTO v_item_id
  FROM public.inventory_items
  WHERE UPPER(REPLACE(item_name, ' ', '_')) = UPPER(REPLACE(COALESCE(NEW.item_type, OLD.item_type), ' ', '_'))
     OR UPPER(REPLACE(item_name, '-', '_')) = UPPER(REPLACE(COALESCE(NEW.item_type, OLD.item_type), '-', '_'))
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.inventory_items
  SET distributed = GREATEST(0, COALESCE(distributed, 0) + v_delta),
      current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_delta),
      updated_at = now()
  WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_inventory_on_distribution ON public.distribution_status;
CREATE TRIGGER trg_sync_inventory_on_distribution
AFTER INSERT OR UPDATE OR DELETE ON public.distribution_status
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_on_distribution();

-- 3. When a permission is deleted, clear attendance for that student/date
CREATE OR REPLACE FUNCTION public.clear_attendance_on_permission_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.attendance
  WHERE student_id = OLD.student_id
    AND date = OLD.date;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_attendance_on_permission_delete ON public.student_permissions;
CREATE TRIGGER trg_clear_attendance_on_permission_delete
AFTER DELETE ON public.student_permissions
FOR EACH ROW
EXECUTE FUNCTION public.clear_attendance_on_permission_delete();