ALTER TABLE attendance DISABLE TRIGGER trg_enforce_marked_by;
UPDATE attendance SET status = 'A' WHERE status = 'AB';
ALTER TABLE attendance ENABLE TRIGGER trg_enforce_marked_by;