
CREATE OR REPLACE FUNCTION public.restore_attendance_from_logs(
  _date date DEFAULT NULL,
  _month integer DEFAULT NULL,
  _year integer DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  restored_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owners can restore attendance from logs';
  END IF;

  WITH latest_logs AS (
    SELECT DISTINCT ON (LOWER(TRIM(al.student_name)), al.details->>'date', al.details->>'session')
      s.id as student_id,
      (al.details->>'date')::date as date,
      (al.details->>'session') as session,
      (al.details->>'status') as status,
      COALESCE(al.details->>'remark', '') as remark,
      al.user_id as marked_by
    FROM activity_logs al
    JOIN students s ON LOWER(TRIM(s.student_name)) = LOWER(TRIM(al.student_name))
    WHERE al.action IN ('AM attendance marked', 'PM attendance marked')
      AND al.details->>'date' IS NOT NULL
      AND al.details->>'session' IS NOT NULL
      AND al.details->>'status' IS NOT NULL
      AND (
        (_date IS NOT NULL AND (al.details->>'date')::date = _date)
        OR (_date IS NULL AND _month IS NOT NULL AND _year IS NOT NULL
            AND EXTRACT(MONTH FROM (al.details->>'date')::date) = _month
            AND EXTRACT(YEAR FROM (al.details->>'date')::date) = _year)
        OR (_date IS NULL AND _month IS NULL)
      )
    ORDER BY LOWER(TRIM(al.student_name)), al.details->>'date', al.details->>'session', al.created_at DESC
  )
  INSERT INTO attendance (student_id, date, session, status, remark, marked_by)
  SELECT student_id, date, session, status, remark, marked_by
  FROM latest_logs ll
  WHERE NOT EXISTS (
    SELECT 1 FROM attendance a
    WHERE a.student_id = ll.student_id AND a.date = ll.date AND a.session = ll.session
  );

  GET DIAGNOSTICS restored_count = ROW_COUNT;
  RETURN restored_count;
END;
$$;
