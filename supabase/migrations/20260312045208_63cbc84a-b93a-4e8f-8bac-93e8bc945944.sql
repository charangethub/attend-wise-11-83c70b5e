
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'teacher');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'teacher',
  admin_panel_access BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.page_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  page_name TEXT NOT NULL,
  has_access BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, page_name)
);
ALTER TABLE public.page_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center TEXT NOT NULL DEFAULT '',
  roll_no TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  curriculum TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  batch_type TEXT NOT NULL DEFAULT '',
  classroom_name TEXT NOT NULL DEFAULT '',
  classroom_id TEXT NOT NULL DEFAULT '',
  enrollment_status TEXT NOT NULL DEFAULT '',
  enrollment_date TEXT NOT NULL DEFAULT '',
  mobile_number TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  user_id_vedantu TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL DEFAULT '',
  emergency_contact_1 TEXT NOT NULL DEFAULT '',
  emergency_contact_2 TEXT NOT NULL DEFAULT '',
  dataset TEXT NOT NULL DEFAULT 'master_list_adilabad',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(roll_no),
  CONSTRAINT students_roll_no_not_empty CHECK (trim(roll_no) <> '')
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'P',
  marked_by UUID NOT NULL,
  remark TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  is_public boolean NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.student_datasets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sheet_url TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.student_datasets ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_attendance_date ON public.attendance(date);
CREATE INDEX idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX idx_students_roll_no ON public.students(roll_no);
CREATE INDEX idx_students_enrollment ON public.students(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_students_dataset ON public.students(dataset);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners and admins can delete profiles" ON public.profiles FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners admins can view all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners admins can insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND (role <> 'owner'::app_role)));
CREATE POLICY "Owners admins can update roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND (NOT has_role(user_id, 'owner'::app_role))))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND (NOT has_role(user_id, 'owner'::app_role)) AND (role <> 'owner'::app_role)));
CREATE POLICY "Owners admins can delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own status" ON public.user_status FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners admins can manage status" ON public.user_status FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own page access" ON public.page_access FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners admins can manage page access" ON public.page_access FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approved users can view students" ON public.students FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Owners admins can manage students" ON public.students FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view attendance" ON public.attendance FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Teachers admins owners can insert attendance" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR (has_role(auth.uid(), 'teacher'::app_role) AND (date = CURRENT_DATE)));
CREATE POLICY "Owners admins can update attendance" ON public.attendance FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can update today attendance" ON public.attendance FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role) AND (date = CURRENT_DATE))
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND (date = CURRENT_DATE));
CREATE POLICY "Owners admins can delete attendance" ON public.attendance FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view public settings" ON public.system_settings FOR SELECT TO authenticated
  USING ((is_public = true) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners can manage settings" ON public.system_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role)) WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Admins manage datasets" ON public.student_datasets FOR ALL
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users read datasets" ON public.student_datasets FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.enforce_marked_by()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN NEW.marked_by := auth.uid(); RETURN NEW; END; $$;

CREATE TRIGGER trg_enforce_marked_by
  BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.enforce_marked_by();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_full_name text; v_email text; v_auto_approve text; v_initial_status text;
  v_user_count int;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  v_email := COALESCE(NEW.email, '');
  INSERT INTO public.profiles (user_id, full_name, email) VALUES (NEW.id, v_full_name, v_email) ON CONFLICT (user_id) DO NOTHING;
  SELECT COUNT(*) INTO v_user_count FROM public.user_roles;
  IF v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.user_status (user_id, status) VALUES (NEW.id, 'active') ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher') ON CONFLICT (user_id) DO NOTHING;
    SELECT value INTO v_auto_approve FROM public.system_settings WHERE key = 'auto_approve_google';
    v_initial_status := CASE WHEN v_auto_approve = 'true' THEN 'active' ELSE 'pending' END;
    INSERT INTO public.user_status (user_id, status) VALUES (NEW.id, v_initial_status) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.system_settings (key, value, is_public) VALUES
  ('google_apps_script_url', 'https://script.google.com/macros/s/AKfycbxzq20yTFtjuRGKn-bijlUQCYdXT16Xxzr1qCSVxxntce0-UYXmcqJ_aodkoq39Fv2E6f/exec', false),
  ('google_sheet_csv_url', '', false),
  ('sync_interval_minutes', '0', true),
  ('web_app_url', '', true),
  ('linked_app_url_1', '', true),
  ('linked_app_url_1_label', 'App 1', true),
  ('linked_app_url_2', '', true),
  ('linked_app_url_2_label', 'App 2', true),
  ('auto_approve_google', 'false', true),
  ('last_sync_at', '', true),
  ('center_name', 'Adilabad', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.student_datasets (name, slug, sheet_url, is_active, display_order) VALUES
  ('Master List Adilabad', 'master_list_adilabad', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRnK41rs9WkGF4BRilDfihl40NKkhoQjj244tHxk-q8dO7pzc9T_pdOdw72PWOdPCIH-ehOR2DgUEWi/pub?gid=1006706135&single=true&output=csv', TRUE, 1),
  ('2025-2026 Student Data', '2025_2026_student_data', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRnK41rs9WkGF4BRilDfihl40NKkhoQjj244tHxk-q8dO7pzc9T_pdOdw72PWOdPCIH-ehOR2DgUEWi/pub?gid=1398268001&single=true&output=csv', FALSE, 2)
ON CONFLICT (slug) DO NOTHING;
