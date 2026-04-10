
-- 1. dataset_urls
CREATE TABLE IF NOT EXISTS public.dataset_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES public.student_datasets(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dataset_urls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read dataset_urls" ON public.dataset_urls FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage dataset_urls" ON public.dataset_urls FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. sync_targets
CREATE TABLE IF NOT EXISTS public.sync_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL DEFAULT '',
  apps_script_url TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT 'attendance',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read sync_targets" ON public.sync_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage sync_targets" ON public.sync_targets FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 3. inventory_urls
CREATE TABLE IF NOT EXISTS public.inventory_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_urls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read inventory_urls" ON public.inventory_urls FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage inventory_urls" ON public.inventory_urls FOR ALL TO authenticated USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 4. Inventory columns
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS sub_category TEXT DEFAULT '';
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS total_received INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS distributed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS extra INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS updated_by UUID;

-- 5. Fix attendance data: drop trigger, replace enforce function temporarily
CREATE OR REPLACE FUNCTION public.enforce_marked_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.marked_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

-- Now fix null marked_by rows
UPDATE public.attendance
SET marked_by = (SELECT user_id FROM public.user_roles WHERE role = 'owner' LIMIT 1)
WHERE marked_by IS NULL;

-- Rename AB → A
UPDATE public.attendance SET status = 'A' WHERE status = 'AB';

-- Restore original enforce function
CREATE OR REPLACE FUNCTION public.enforce_marked_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.marked_by := auth.uid();
  RETURN NEW;
END;
$function$;
