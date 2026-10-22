-- TG_ARGV is NULL (not an empty array) for triggers declared without arguments, which made the
-- UPDATE comparison evaluate to NULL and silently allow changes. Normalise it.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[] := coalesce(TG_ARGV, ARRAY[]::text[]);
BEGIN
  IF coalesce(current_setting('app.purge', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% is append-only: rows cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION '% is append-only: rows cannot be modified', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
