-- Only the empty, manually created research schema may be replaced.
-- This runs inside the same atomic migration as the new schema creation.
DO $$
DECLARE t text; populated boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['raw_materials_batches','experiment_series',
    'technological_experiments','experiment_samples','laboratory_measurements',
    'product_indicators','calculated_results'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', t);
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', t) INTO populated;
      IF populated THEN
        RAISE EXCEPTION 'Refusing to replace nonempty research table: %', t;
      END IF;
    END IF;
  END LOOP;
END $$;
DROP TABLE IF EXISTS calculated_results;
DROP TABLE IF EXISTS laboratory_measurements;
DROP TABLE IF EXISTS product_indicators;
DROP TABLE IF EXISTS experiment_samples;
DROP TABLE IF EXISTS technological_experiments;
DROP TABLE IF EXISTS experiment_series;
DROP TABLE IF EXISTS raw_materials_batches;
