-- Run with psql -v ON_ERROR_STOP=1. All violation counts should be zero.
SELECT 'invalid_sample_links' AS check_name, count(*) AS violations
FROM technological_experiments e
LEFT JOIN experiment_samples b ON b.id=e.before_sample_id
LEFT JOIN experiment_samples a ON a.id=e.after_sample_id
WHERE (e.before_sample_id IS NOT NULL AND (b.id IS NULL OR b.batch_id<>e.batch_id OR b.sample_state<>'before_processing'))
   OR (e.after_sample_id IS NOT NULL AND (a.id IS NULL OR a.batch_id<>e.batch_id OR a.sample_state<>'after_processing'));
SELECT 'excluded_without_reason' AS check_name, count(*) AS violations
FROM dry_matter_measurements WHERE excluded_from_analysis AND COALESCE(btrim(exclusion_reason),'')='';
-- Missing inputs are reported, not replaced by zero.
SELECT id, sample_id, laboratory_parallel_number FROM v_dry_matter_measurements
WHERE result_source='missing' AND NOT excluded_from_analysis;
SELECT experiment_id, experiment_code FROM v_experiment_dry_matter_results
WHERE before_dry_matter_pct IS NULL OR after_dry_matter_pct IS NULL OR final_product_weight_g IS NULL;
