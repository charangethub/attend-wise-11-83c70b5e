CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.user_status us ON us.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND us.status = 'active'
  )
$function$;