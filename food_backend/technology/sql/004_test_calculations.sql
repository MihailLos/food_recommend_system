-- Disposable fixtures only. No rows or consumed identity values survive rollback.
BEGIN;
DO $$
DECLARE p integer; x numeric; n integer;
BEGIN
 SELECT "ID" INTO p FROM "Culinary_Processing_Types" ORDER BY "ID" LIMIT 1;
 IF p IS NULL THEN RAISE EXCEPTION 'Processing dictionary is empty'; END IF;
 INSERT INTO raw_materials_batches(id,code,product) VALUES(-91001,'__test_batch_1','test'),(-91002,'__test_batch_2','test');
 INSERT INTO experiment_series(id,code,title,created_at) VALUES(-91001,'__test_series','test',now());
 INSERT INTO experiment_samples(id,code,batch_id,sample_state) VALUES
 (-91001,'__test_raw',-91001,'before_processing'),(-91002,'__test_cooked',-91001,'after_processing'),(-91003,'__test_empty',-91001,'after_processing');
 INSERT INTO dry_matter_measurements(id,sample_id,laboratory_parallel_number,m0_g,m1_g,m2_g,excluded_from_analysis)
 VALUES(-91001,-91001,1,40,45,41,false);
 INSERT INTO dry_matter_measurements(id,sample_id,laboratory_parallel_number,reported_dry_matter_pct,excluded_from_analysis,exclusion_reason) VALUES
 (-91002,-91001,2,20,false,NULL),(-91003,-91001,3,1,true,'test exclusion'),(-91004,-91002,1,25,false,NULL);
 INSERT INTO technological_experiments(id,code,batch_id,series_id,replicate_number,processing_type_id,before_sample_id,after_sample_id,initial_product_weight_g,final_product_weight_g)
 VALUES(-91001,'__test_exp_1',-91001,-91001,1,p,-91001,-91002,100,80),
       (-91002,'__test_exp_2',-91001,-91001,2,p,-91001,-91003,100,NULL);
 SELECT calculated_dry_matter_pct INTO x FROM v_dry_matter_measurements WHERE id=-91001;
 IF x IS DISTINCT FROM 20::numeric THEN RAISE EXCEPTION 'Mass formula failed: %',x; END IF;
 SELECT mean_dry_matter_pct,accepted_measurements INTO x,n FROM v_sample_dry_matter_summary WHERE sample_id=-91001;
 IF x IS DISTINCT FROM 20::numeric OR n<>2 THEN RAISE EXCEPTION 'Sample aggregation/exclusion failed'; END IF;
 SELECT true_retention_pct INTO x FROM v_experiment_dry_matter_results WHERE experiment_id=-91001;
 IF x IS DISTINCT FROM 100::numeric THEN RAISE EXCEPTION 'Retention formula failed: %',x; END IF;
 IF EXISTS(SELECT 1 FROM v_experiment_dry_matter_results WHERE experiment_id=-91002 AND true_retention_pct IS NOT NULL) THEN RAISE EXCEPTION 'Missing data must not produce retention'; END IF;
 BEGIN
   UPDATE dry_matter_measurements SET m1_g=m0_g WHERE id=-91001;
   RAISE EXCEPTION 'Invalid masses accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   UPDATE technological_experiments SET batch_id=-91002 WHERE id=-91001;
   RAISE EXCEPTION 'Cross-batch link accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   UPDATE experiment_samples SET sample_state='after_processing' WHERE id=-91001;
   RAISE EXCEPTION 'Linked sample state change accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   UPDATE dry_matter_measurements SET excluded_from_analysis=true,exclusion_reason='  ' WHERE id=-91001;
   RAISE EXCEPTION 'Missing exclusion reason accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   INSERT INTO dry_matter_measurements(id,sample_id,laboratory_parallel_number,excluded_from_analysis) VALUES(-91005,-91001,1,false);
   RAISE EXCEPTION 'Duplicate parallel accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 -- Mass gain / retention over 100% must remain visible rather than be clamped.
 UPDATE technological_experiments SET final_product_weight_g=120 WHERE id=-91001;
 SELECT true_retention_pct INTO x FROM v_experiment_dry_matter_results WHERE experiment_id=-91001;
 IF x IS DISTINCT FROM 150::numeric THEN RAISE EXCEPTION 'Retention above 100 was lost'; END IF;
 RAISE NOTICE 'PASS: formulas, reported-only results, shared baseline, missing values, exclusions, constraints, and sample links';
END $$;
ROLLBACK;
