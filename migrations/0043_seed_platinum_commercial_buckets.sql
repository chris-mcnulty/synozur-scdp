-- Historical no-op retained so migration ordering stays stable.
-- Commercial buckets are project configuration data created and maintained
-- through the application; migrations must not create client-specific terms.
SELECT 1;