-- Serialize checks involving samples and experiments to prevent inconsistent
-- links even when a sample is edited while another transaction links it.
CREATE FUNCTION technology_check_sample_links() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE s experiment_samples%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'technological_experiments' THEN
    IF NEW.before_sample_id IS NOT NULL THEN
      SELECT * INTO s FROM experiment_samples WHERE id=NEW.before_sample_id FOR SHARE;
      IF NOT FOUND OR s.batch_id <> NEW.batch_id OR s.sample_state <> 'before_processing' THEN
        RAISE EXCEPTION 'Before sample must belong to experiment batch and have before_processing state' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.after_sample_id IS NOT NULL THEN
      SELECT * INTO s FROM experiment_samples WHERE id=NEW.after_sample_id FOR SHARE;
      IF NOT FOUND OR s.batch_id <> NEW.batch_id OR s.sample_state <> 'after_processing' THEN
        RAISE EXCEPTION 'After sample must belong to experiment batch and have after_processing state' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    -- Identity/state are immutable once a sample participates in an experiment.
    IF (NEW.batch_id, NEW.sample_state) IS DISTINCT FROM (OLD.batch_id, OLD.sample_state)
       AND EXISTS (SELECT 1 FROM technological_experiments WHERE before_sample_id=OLD.id OR after_sample_id=OLD.id) THEN
      RAISE EXCEPTION 'Cannot change batch/state of a linked sample' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER technology_experiment_sample_links
BEFORE INSERT OR UPDATE ON technological_experiments
FOR EACH ROW EXECUTE FUNCTION technology_check_sample_links();
CREATE TRIGGER technology_sample_identity
BEFORE UPDATE ON experiment_samples
FOR EACH ROW EXECUTE FUNCTION technology_check_sample_links();

CREATE VIEW v_dry_matter_measurements AS
SELECT d.*, m1_g-m0_g AS wet_sample_mass_g,
       m2_g-m0_g AS dry_residue_mass_g,
       100*(m2_g-m0_g)/NULLIF(m1_g-m0_g,0) AS calculated_dry_matter_pct,
       100*(m2_g-m0_g)/NULLIF(m1_g-m0_g,0)-reported_dry_matter_pct AS deviation_from_reported_pp,
       COALESCE(100*(m2_g-m0_g)/NULLIF(m1_g-m0_g,0),reported_dry_matter_pct) AS effective_dry_matter_pct,
       CASE WHEN m0_g IS NOT NULL AND m1_g IS NOT NULL AND m2_g IS NOT NULL THEN 'masses'
            WHEN reported_dry_matter_pct IS NOT NULL THEN 'reported' ELSE 'missing' END AS result_source
FROM dry_matter_measurements d;

CREATE VIEW v_sample_dry_matter_summary AS
SELECT s.id AS sample_id, s.code AS sample_code, s.batch_id, s.sample_state,
       count(d.id) AS total_measurements,
       count(d.id) FILTER (WHERE d.excluded_from_analysis) AS excluded_measurements,
       count(d.effective_dry_matter_pct) FILTER (WHERE NOT d.excluded_from_analysis) AS accepted_measurements,
       avg(d.effective_dry_matter_pct) FILTER (WHERE NOT d.excluded_from_analysis) AS mean_dry_matter_pct,
       stddev_samp(d.effective_dry_matter_pct) FILTER (WHERE NOT d.excluded_from_analysis) AS laboratory_sd_pct
FROM experiment_samples s LEFT JOIN v_dry_matter_measurements d ON d.sample_id=s.id
GROUP BY s.id, s.code, s.batch_id, s.sample_state;

CREATE VIEW v_experiment_dry_matter_results AS
WITH amounts AS (
 SELECT e.id AS experiment_id, e.code AS experiment_code, e.batch_id, e.series_id,
        e.replicate_number, e.before_sample_id, e.after_sample_id,
        e.initial_product_weight_g, e.final_product_weight_g,
        b.mean_dry_matter_pct AS before_dry_matter_pct,
        a.mean_dry_matter_pct AS after_dry_matter_pct,
        b.accepted_measurements AS before_measurements,
        a.accepted_measurements AS after_measurements,
        e.initial_product_weight_g*b.mean_dry_matter_pct/100 AS before_dry_matter_g,
        e.final_product_weight_g*a.mean_dry_matter_pct/100 AS after_dry_matter_g
 FROM technological_experiments e
 LEFT JOIN v_sample_dry_matter_summary b ON b.sample_id=e.before_sample_id
 LEFT JOIN v_sample_dry_matter_summary a ON a.sample_id=e.after_sample_id
)
SELECT amounts.*,
       100*final_product_weight_g/initial_product_weight_g AS product_output_pct,
       100-100*final_product_weight_g/initial_product_weight_g AS weight_loss_pct,
       100*after_dry_matter_g/NULLIF(before_dry_matter_g,0) AS true_retention_pct,
       100-100*after_dry_matter_g/NULLIF(before_dry_matter_g,0) AS dry_matter_loss_pct
FROM amounts;
