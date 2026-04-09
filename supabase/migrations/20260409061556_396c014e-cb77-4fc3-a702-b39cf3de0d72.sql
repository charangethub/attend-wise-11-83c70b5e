
-- student_permissions table
CREATE TABLE IF NOT EXISTS public.student_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  permission_type TEXT NOT NULL,
  reason TEXT DEFAULT '',
  granted_by UUID,
  granted_by_name TEXT DEFAULT '',
  dataset TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_permissions_date ON public.student_permissions(date);
CREATE INDEX idx_permissions_student ON public.student_permissions(student_id);
ALTER TABLE public.student_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can view permissions" ON public.student_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert permissions" ON public.student_permissions
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'teacher'::app_role)
  );
CREATE POLICY "Owners admins can delete permissions" ON public.student_permissions
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  );

-- inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  zone TEXT DEFAULT '',
  centre TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  size TEXT DEFAULT '',
  ytd_received INTEGER DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  damaged INTEGER DEFAULT 0,
  missing INTEGER DEFAULT 0,
  reserved INTEGER DEFAULT 0,
  dataset TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can view inventory" ON public.inventory_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins owners can manage inventory" ON public.inventory_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- inventory_activity_logs table
CREATE TABLE IF NOT EXISTS public.inventory_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  item_name TEXT DEFAULT '',
  action TEXT NOT NULL,
  quantity_change INTEGER DEFAULT 0,
  changed_by UUID,
  changed_by_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.inventory_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can view inventory logs" ON public.inventory_activity_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert inventory logs" ON public.inventory_activity_logs
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'teacher'::app_role)
  );

-- distribution_status table
CREATE TABLE IF NOT EXISTS public.distribution_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  given_date DATE,
  given_by UUID,
  dataset TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, item_type)
);
ALTER TABLE public.distribution_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can view distribution" ON public.distribution_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins owners can manage distribution" ON public.distribution_status
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- page_dataset_mapping table
CREATE TABLE IF NOT EXISTS public.page_dataset_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_name TEXT NOT NULL UNIQUE,
  dataset_id UUID REFERENCES public.student_datasets(id) ON DELETE SET NULL,
  dataset_slug TEXT DEFAULT '',
  dataset_name TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.page_dataset_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can view mappings" ON public.page_dataset_mapping
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage mappings" ON public.page_dataset_mapping
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

-- Enable realtime for page_dataset_mapping
ALTER PUBLICATION supabase_realtime ADD TABLE public.page_dataset_mapping;

-- Add updated_at trigger for inventory_items
CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
