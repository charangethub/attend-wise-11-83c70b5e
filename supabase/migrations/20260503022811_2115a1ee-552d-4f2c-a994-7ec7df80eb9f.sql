CREATE UNIQUE INDEX IF NOT EXISTS attendance_student_date_session_uidx
ON public.attendance (student_id, date, session);