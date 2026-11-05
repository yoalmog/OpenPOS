-- OpenPOS application-role security migration.
-- Apply after the baseline schema migration using the Supabase migration/admin connection.
-- The role is intentionally NOLOGIN until a dedicated credential is installed in
-- a separate secret-managed Hyperdrive configuration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openpos_app') THEN
    CREATE ROLE openpos_app
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- Future objects created by the OpenPOS migration owner must not become
-- accessible to public API roles by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO openpos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO openpos_app;

GRANT USAGE ON SCHEMA public TO openpos_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.store_settings,
  public.categories,
  public.items,
  public.ingredients,
  public.recipes,
  public.kitchen_orders,
  public.online_orders,
  public.waste_logs,
  public.temperature_logs,
  public.receipts,
  public.shifts,
  public.audit_logs,
  public.operational_records
TO openpos_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO openpos_app;

DO $policies$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'store_settings',
    'categories',
    'items',
    'ingredients',
    'recipes',
    'kitchen_orders',
    'online_orders',
    'waste_logs',
    'temperature_logs',
    'receipts',
    'shifts',
    'audit_logs',
    'operational_records'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS openpos_app_all ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY openpos_app_all ON public.%I FOR ALL TO openpos_app USING (true) WITH CHECK (true)',
      table_name
    );
  END LOOP;
END
$policies$;
