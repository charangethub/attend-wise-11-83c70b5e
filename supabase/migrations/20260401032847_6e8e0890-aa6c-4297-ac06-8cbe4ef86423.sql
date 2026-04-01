
-- Fix 1: Tighten user_roles INSERT policy - restrict admins from granting roles to arbitrary users
-- Only owners can insert roles. Remove admin ability to insert roles entirely.
DROP POLICY IF EXISTS "Owners admins can insert roles" ON public.user_roles;

CREATE POLICY "Only owners can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

-- Fix 2: Add trigger on activity_logs to enforce user metadata from auth session
CREATE OR REPLACE FUNCTION public.enforce_activity_log_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Always set user_id to the authenticated user
  NEW.user_id := auth.uid();
  
  -- Look up name and email from profiles
  SELECT full_name, email INTO v_profile
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  IF v_profile IS NOT NULL THEN
    NEW.user_name := COALESCE(v_profile.full_name, '');
    NEW.user_email := COALESCE(v_profile.email, '');
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_activity_log_metadata_trigger ON public.activity_logs;

CREATE TRIGGER enforce_activity_log_metadata_trigger
BEFORE INSERT ON public.activity_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_activity_log_metadata();
