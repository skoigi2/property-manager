-- Production had Property.city DEFAULT 'Nairobi' and currency DEFAULT 'KES'
-- (from the app's Kenyan beginnings), so a property saved without them — e.g.
-- a UK or South African customer leaving City blank — was stored as a
-- Nairobi / KES property. Align with the schema: no city default; currency
-- 'USD' (the API now always sends the organisation's default currency).
-- Existing rows are unchanged.
ALTER TABLE "Property" ALTER COLUMN "city" DROP DEFAULT;
ALTER TABLE "Property" ALTER COLUMN "currency" SET DEFAULT 'USD';
