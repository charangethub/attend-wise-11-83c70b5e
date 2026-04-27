CREATE OR REPLACE FUNCTION public.restore_attendance_from_logs(_date date DEFAULT NULL::date, _month integer DEFAULT NULL::integer, _year integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  restored_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owners can restore attendance from logs';
  END IF;

  WITH normalized_logs AS (
    SELECT
      al.student_name,
      al.user_id AS marked_by,
      al.created_at,
      (al.details->>'date')::date AS log_date,
      COALESCE(
        NULLIF(al.details->>'session', ''),
        CASE
          WHEN al.action ILIKE 'AM%' THEN 'AM'
          WHEN al.action ILIKE 'PM%' THEN 'PM'
          ELSE 'AM'
        END
      ) AS log_session,
      al.details->>'status' AS log_status,
      COALESCE(al.details->>'remark', '') AS log_remark
    FROM activity_logs al
    WHERE (
        al.action IN ('AM attendance marked', 'PM attendance marked', 'attendance marked')
        OR al.action ILIKE '%attendance marked%'
      )
      AND al.details ? 'date'
      AND al.details ? 'status'
      AND al.student_name IS NOT NULL
      AND TRIM(al.student_name) <> ''
  ), latest_logs AS (
    SELECT DISTINCT ON (LOWER(TRIM(nl.student_name)), nl.log_date, nl.log_session)
      s.id AS student_id,
      nl.log_date AS date,
      nl.log_session AS session,
      nl.log_status AS status,
      nl.log_remark AS remark,
      nl.marked_by
    FROM normalized_logs nl
    JOIN students s ON LOWER(TRIM(s.student_name)) = LOWER(TRIM(nl.student_name))
    WHERE nl.log_status IS NOT NULL
      AND (
        (_date IS NOT NULL AND nl.log_date = _date)
        OR (_date IS NULL AND _month IS NOT NULL AND _year IS NOT NULL
            AND EXTRACT(MONTH FROM nl.log_date) = _month
            AND EXTRACT(YEAR FROM nl.log_date) = _year)
        OR (_date IS NULL AND _month IS NULL)
      )
    ORDER BY LOWER(TRIM(nl.student_name)), nl.log_date, nl.log_session, nl.created_at DESC
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
$function$;