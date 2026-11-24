from django.db import migrations


RULES = """
CREATE FUNCTION technology_number_parallel() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    analysis_mode text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM 1 FROM "Experiment_Data"
        WHERE id = OLD.experiment_id FOR NO KEY UPDATE;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (NEW.experiment_id, NEW.parallel_number) IS DISTINCT FROM
           (OLD.experiment_id, OLD.parallel_number) THEN
            RAISE EXCEPTION 'Experiment and number of an existing parallel cannot change'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    -- Concurrent additions to one analysis must allocate numbers in order.
    SELECT result_mode INTO analysis_mode FROM "Experiment_Data"
    WHERE id = NEW.experiment_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Experiment does not exist: %', NEW.experiment_id
            USING ERRCODE = '23503';
    END IF;
    IF analysis_mode <> 'weighings' THEN
        RAISE EXCEPTION 'Only weighing-based analyses accept parallels'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(max(parallel_number), 0) + 1 INTO NEW.parallel_number
    FROM "Experiment_Parallels" WHERE experiment_id = NEW.experiment_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tech_number_parallel
BEFORE INSERT OR UPDATE OF experiment_id, parallel_number OR DELETE
ON "Experiment_Parallels"
FOR EACH ROW EXECUTE FUNCTION technology_number_parallel();

CREATE FUNCTION technology_validate_analysis() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    analysis_id integer;
    analysis_mode text;
    has_parallels boolean;
BEGIN
    IF TG_TABLE_NAME = 'Experiment_Data' THEN
        analysis_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        analysis_id := OLD.experiment_id;
    ELSE
        analysis_id := NEW.experiment_id;
    END IF;

    SELECT result_mode INTO analysis_mode
    FROM "Experiment_Data" WHERE id = analysis_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM "Experiment_Parallels" WHERE experiment_id = analysis_id
    ) INTO has_parallels;

    IF (analysis_mode = 'weighings') <> has_parallels THEN
        RAISE EXCEPTION 'Weighing-based analyses require parallels; reported analyses must have none'
            USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER tech_validate_analysis
AFTER INSERT OR UPDATE OF result_mode ON "Experiment_Data"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION technology_validate_analysis();

CREATE CONSTRAINT TRIGGER tech_validate_analysis_parallels
AFTER INSERT OR DELETE ON "Experiment_Parallels"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION technology_validate_analysis();

CREATE VIEW "Average_Experiment_Data" AS
SELECT e.id AS experiment_id,
       e.unprocessed_product_id,
       e.preprocessed_product_id,
       e.processed_product_id,
       e.result_mode,
       count(p.id) AS parallel_count,
       avg(p.dry_residue_g) AS avg_dry_residue_g,
       avg(p.dry_matter_pct) AS avg_dry_matter_pct,
       e.reported_dry_matter_pct,
       CASE WHEN e.result_mode = 'reported' THEN e.reported_dry_matter_pct
            ELSE avg(p.dry_matter_pct) END AS final_dry_matter_pct
FROM "Experiment_Data" e
LEFT JOIN "Experiment_Parallels" p ON p.experiment_id = e.id
GROUP BY e.id;
"""

REVERSE = """
DROP VIEW "Average_Experiment_Data";
DROP TRIGGER tech_validate_analysis_parallels ON "Experiment_Parallels";
DROP TRIGGER tech_validate_analysis ON "Experiment_Data";
DROP TRIGGER tech_number_parallel ON "Experiment_Parallels";
DROP FUNCTION technology_validate_analysis();
DROP FUNCTION technology_number_parallel();
"""


class Migration(migrations.Migration):
    dependencies = [("technology", "0001_initial")]
    operations = [migrations.RunSQL(RULES, REVERSE)]
