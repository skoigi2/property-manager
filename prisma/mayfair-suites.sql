-- ============================================================
-- Mayfair Suites — Demo Data
-- Paste this entire script into the Supabase SQL Editor and run.
-- Safe to run multiple times (idempotent).
-- ============================================================

DO $$
DECLARE
  v_alba_org_id   text;
  v_mayfair_id    text;
  v_m101_id       text;
  v_m102_id       text;
  v_m201_id       text;
  v_m202_id       text;
  v_m301_id       text;
BEGIN

  -- ── 1. Get Alba Gardens' organisation ──────────────────────────────────
  SELECT "organizationId" INTO v_alba_org_id
  FROM "Property" WHERE name = 'Alba Gardens' LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alba Gardens not found — check you are on the correct database';
  END IF;
  RAISE NOTICE 'Alba Gardens orgId: %', COALESCE(v_alba_org_id, '(null — super-admin context)');

  -- ── 2. Create Mayfair Suites property ──────────────────────────────────
  SELECT id INTO v_mayfair_id FROM "Property" WHERE name = 'Mayfair Suites' LIMIT 1;

  IF v_mayfair_id IS NULL THEN
    v_mayfair_id := gen_random_uuid()::text;
    INSERT INTO "Property" (id, name, type, "organizationId", city, "createdAt", "updatedAt")
    VALUES (v_mayfair_id, 'Mayfair Suites', 'AIRBNB'::"PropertyType",
            v_alba_org_id, 'Nairobi', NOW(), NOW());
    RAISE NOTICE 'Created property Mayfair Suites (%)', v_mayfair_id;
  ELSE
    RAISE NOTICE 'Property already exists (%)', v_mayfair_id;
  END IF;

  -- ── 3. Copy PropertyAccess from Alba Gardens ────────────────────────────
  INSERT INTO "PropertyAccess" ("userId", "propertyId", "createdAt")
  SELECT pa."userId", v_mayfair_id, NOW()
  FROM   "PropertyAccess" pa
  JOIN   "Property" p ON pa."propertyId" = p.id
  WHERE  p.name = 'Alba Gardens'
  ON CONFLICT ("userId", "propertyId") DO NOTHING;
  RAISE NOTICE 'PropertyAccess copied';

  -- ── 4. Create units ─────────────────────────────────────────────────────
  SELECT id INTO v_m101_id FROM "Unit" WHERE "propertyId" = v_mayfair_id AND "unitNumber" = 'M101';
  IF v_m101_id IS NULL THEN
    v_m101_id := gen_random_uuid()::text;
    INSERT INTO "Unit" (id, "unitNumber", "propertyId", type, status, "createdAt", "updatedAt")
    VALUES (v_m101_id, 'M101', v_mayfair_id, 'ONE_BED'::"UnitType", 'ACTIVE'::"UnitStatus", NOW(), NOW());
  END IF;

  SELECT id INTO v_m102_id FROM "Unit" WHERE "propertyId" = v_mayfair_id AND "unitNumber" = 'M102';
  IF v_m102_id IS NULL THEN
    v_m102_id := gen_random_uuid()::text;
    INSERT INTO "Unit" (id, "unitNumber", "propertyId", type, status, "createdAt", "updatedAt")
    VALUES (v_m102_id, 'M102', v_mayfair_id, 'ONE_BED'::"UnitType", 'ACTIVE'::"UnitStatus", NOW(), NOW());
  END IF;

  SELECT id INTO v_m201_id FROM "Unit" WHERE "propertyId" = v_mayfair_id AND "unitNumber" = 'M201';
  IF v_m201_id IS NULL THEN
    v_m201_id := gen_random_uuid()::text;
    INSERT INTO "Unit" (id, "unitNumber", "propertyId", type, status, "createdAt", "updatedAt")
    VALUES (v_m201_id, 'M201', v_mayfair_id, 'TWO_BED'::"UnitType", 'ACTIVE'::"UnitStatus", NOW(), NOW());
  END IF;

  SELECT id INTO v_m202_id FROM "Unit" WHERE "propertyId" = v_mayfair_id AND "unitNumber" = 'M202';
  IF v_m202_id IS NULL THEN
    v_m202_id := gen_random_uuid()::text;
    INSERT INTO "Unit" (id, "unitNumber", "propertyId", type, status, "createdAt", "updatedAt")
    VALUES (v_m202_id, 'M202', v_mayfair_id, 'TWO_BED'::"UnitType", 'ACTIVE'::"UnitStatus", NOW(), NOW());
  END IF;

  SELECT id INTO v_m301_id FROM "Unit" WHERE "propertyId" = v_mayfair_id AND "unitNumber" = 'M301';
  IF v_m301_id IS NULL THEN
    v_m301_id := gen_random_uuid()::text;
    INSERT INTO "Unit" (id, "unitNumber", "propertyId", type, status, "createdAt", "updatedAt")
    VALUES (v_m301_id, 'M301', v_mayfair_id, 'THREE_BED'::"UnitType", 'ACTIVE'::"UnitStatus", NOW(), NOW());
  END IF;

  RAISE NOTICE 'Units ready: M101=%, M102=%, M201=%, M202=%, M301=%',
    v_m101_id, v_m102_id, v_m201_id, v_m202_id, v_m301_id;

  -- ── 5. Income entries (skip if already seeded) ──────────────────────────
  IF NOT EXISTS (SELECT 1 FROM "IncomeEntry" WHERE "unitId" = v_m101_id LIMIT 1) THEN
    INSERT INTO "IncomeEntry" (id, date, "unitId", type, "grossAmount", "agentCommission", platform, "agentName", note, "checkIn", "checkOut", "createdAt")
    VALUES
      -- M101 January
      (gen_random_uuid()::text,'2026-01-03',v_m101_id,'AIRBNB'::"IncomeType",47500,0,'DIRECT'::"Platform",NULL,'Direct — Jan early stay','2026-01-03','2026-01-08',NOW()),
      (gen_random_uuid()::text,'2026-01-14',v_m101_id,'AIRBNB'::"IncomeType",70000,7000,'AIRBNB'::"Platform",NULL,'Airbnb — Jan mid','2026-01-14','2026-01-21',NOW()),
      (gen_random_uuid()::text,'2026-01-25',v_m101_id,'AIRBNB'::"IncomeType",76000,3500,'AGENT'::"Platform",'James','Via James — Jan into Feb','2026-01-25','2026-02-02',NOW()),
      -- M101 February
      (gen_random_uuid()::text,'2026-02-07',v_m101_id,'AIRBNB'::"IncomeType",77000,7700,'BOOKING_COM'::"Platform",NULL,'Booking.com — Feb week 2','2026-02-07','2026-02-14',NOW()),
      (gen_random_uuid()::text,'2026-02-18',v_m101_id,'AIRBNB'::"IncomeType",60000,0,'DIRECT'::"Platform",NULL,'Direct — Feb week 3','2026-02-18','2026-02-24',NOW()),
      -- M101 March
      (gen_random_uuid()::text,'2026-03-01',v_m101_id,'AIRBNB'::"IncomeType",66000,6600,'AIRBNB'::"Platform",NULL,'Airbnb — Mar week 1','2026-03-01','2026-03-07',NOW()),
      (gen_random_uuid()::text,'2026-03-12',v_m101_id,'AIRBNB'::"IncomeType",73500,3500,'AGENT'::"Platform",'Grace','Via Grace — Mar week 2','2026-03-12','2026-03-19',NOW()),
      (gen_random_uuid()::text,'2026-03-24',v_m101_id,'AIRBNB'::"IncomeType",66000,0,'DIRECT'::"Platform",NULL,'Direct — Mar week 4','2026-03-24','2026-03-30',NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "IncomeEntry" WHERE "unitId" = v_m102_id LIMIT 1) THEN
    INSERT INTO "IncomeEntry" (id, date, "unitId", type, "grossAmount", "agentCommission", platform, "agentName", note, "checkIn", "checkOut", "createdAt")
    VALUES
      -- M102 January
      (gen_random_uuid()::text,'2026-01-06',v_m102_id,'AIRBNB'::"IncomeType",66500,6650,'AIRBNB'::"Platform",NULL,'Airbnb — Jan','2026-01-06','2026-01-13',NOW()),
      (gen_random_uuid()::text,'2026-01-18',v_m102_id,'AIRBNB'::"IncomeType",70000,7000,'BOOKING_COM'::"Platform",NULL,'Booking.com — Jan mid','2026-01-18','2026-01-25',NOW()),
      (gen_random_uuid()::text,'2026-01-29',v_m102_id,'AIRBNB'::"IncomeType",73500,0,'DIRECT'::"Platform",NULL,'Direct — Jan into Feb','2026-01-29','2026-02-05',NOW()),
      -- M102 February
      (gen_random_uuid()::text,'2026-02-10',v_m102_id,'AIRBNB'::"IncomeType",57000,3200,'AGENT'::"Platform",'Sarah','Via Sarah — Feb mid','2026-02-10','2026-02-16',NOW()),
      (gen_random_uuid()::text,'2026-02-20',v_m102_id,'AIRBNB'::"IncomeType",77000,7700,'AIRBNB'::"Platform",NULL,'Airbnb — Feb week 4','2026-02-20','2026-02-27',NOW()),
      -- M102 March
      (gen_random_uuid()::text,'2026-03-04',v_m102_id,'AIRBNB'::"IncomeType",73500,7350,'BOOKING_COM'::"Platform",NULL,'Booking.com — Mar week 1','2026-03-04','2026-03-11',NOW()),
      (gen_random_uuid()::text,'2026-03-16',v_m102_id,'AIRBNB'::"IncomeType",66000,0,'DIRECT'::"Platform",NULL,'Direct — Mar week 3','2026-03-16','2026-03-22',NOW()),
      (gen_random_uuid()::text,'2026-03-27',v_m102_id,'AIRBNB'::"IncomeType",70000,3500,'AGENT'::"Platform",'James','Via James — Mar into Apr','2026-03-27','2026-04-03',NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "IncomeEntry" WHERE "unitId" = v_m201_id LIMIT 1) THEN
    INSERT INTO "IncomeEntry" (id, date, "unitId", type, "grossAmount", "agentCommission", platform, "agentName", note, "checkIn", "checkOut", "createdAt")
    VALUES
      -- M201 January
      (gen_random_uuid()::text,'2026-01-02',v_m201_id,'AIRBNB'::"IncomeType",98000,9800,'AIRBNB'::"Platform",NULL,'Airbnb — Jan week 1','2026-01-02','2026-01-09',NOW()),
      (gen_random_uuid()::text,'2026-01-13',v_m201_id,'AIRBNB'::"IncomeType",105000,0,'DIRECT'::"Platform",NULL,'Direct — Jan week 3','2026-01-13','2026-01-20',NOW()),
      (gen_random_uuid()::text,'2026-01-25',v_m201_id,'AIRBNB'::"IncomeType",130500,13050,'BOOKING_COM'::"Platform",NULL,'Booking.com — Jan into Feb','2026-01-25','2026-02-03',NOW()),
      -- M201 February
      (gen_random_uuid()::text,'2026-02-08',v_m201_id,'AIRBNB'::"IncomeType",98000,4500,'AGENT'::"Platform",'Grace','Via Grace — Feb week 2','2026-02-08','2026-02-15',NOW()),
      (gen_random_uuid()::text,'2026-02-19',v_m201_id,'AIRBNB'::"IncomeType",105000,10500,'AIRBNB'::"Platform",NULL,'Airbnb — Feb week 3','2026-02-19','2026-02-26',NOW()),
      -- M201 March
      (gen_random_uuid()::text,'2026-03-02',v_m201_id,'AIRBNB'::"IncomeType",105000,0,'DIRECT'::"Platform",NULL,'Direct — Mar week 1','2026-03-02','2026-03-09',NOW()),
      (gen_random_uuid()::text,'2026-03-13',v_m201_id,'AIRBNB'::"IncomeType",101500,10150,'BOOKING_COM'::"Platform",NULL,'Booking.com — Mar week 2','2026-03-13','2026-03-20',NOW()),
      (gen_random_uuid()::text,'2026-03-24',v_m201_id,'AIRBNB'::"IncomeType",108500,10850,'AIRBNB'::"Platform",NULL,'Airbnb — Mar week 4','2026-03-24','2026-03-31',NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "IncomeEntry" WHERE "unitId" = v_m202_id LIMIT 1) THEN
    INSERT INTO "IncomeEntry" (id, date, "unitId", type, "grossAmount", "agentCommission", platform, "agentName", note, "checkIn", "checkOut", "createdAt")
    VALUES
      -- M202 January
      (gen_random_uuid()::text,'2026-01-05',v_m202_id,'AIRBNB'::"IncomeType",94500,9450,'BOOKING_COM'::"Platform",NULL,'Booking.com — Jan','2026-01-05','2026-01-12',NOW()),
      (gen_random_uuid()::text,'2026-01-16',v_m202_id,'AIRBNB'::"IncomeType",98000,4500,'AGENT'::"Platform",'Sarah','Via Sarah — Jan week 3','2026-01-16','2026-01-23',NOW()),
      (gen_random_uuid()::text,'2026-01-28',v_m202_id,'AIRBNB'::"IncomeType",98000,0,'DIRECT'::"Platform",NULL,'Direct — Jan into Feb','2026-01-28','2026-02-04',NOW()),
      -- M202 February
      (gen_random_uuid()::text,'2026-02-09',v_m202_id,'AIRBNB'::"IncomeType",101500,10150,'AIRBNB'::"Platform",NULL,'Airbnb — Feb week 2','2026-02-09','2026-02-16',NOW()),
      (gen_random_uuid()::text,'2026-02-20',v_m202_id,'AIRBNB'::"IncomeType",94500,9450,'BOOKING_COM'::"Platform",NULL,'Booking.com — Feb week 4','2026-02-20','2026-02-27',NOW()),
      -- M202 March
      (gen_random_uuid()::text,'2026-03-04',v_m202_id,'AIRBNB'::"IncomeType",112000,5000,'AGENT'::"Platform",'James','Via James — Mar week 1','2026-03-04','2026-03-12',NOW()),
      (gen_random_uuid()::text,'2026-03-16',v_m202_id,'AIRBNB'::"IncomeType",105000,0,'DIRECT'::"Platform",NULL,'Direct — Mar week 3','2026-03-16','2026-03-23',NOW()),
      (gen_random_uuid()::text,'2026-03-27',v_m202_id,'AIRBNB'::"IncomeType",101500,10150,'AIRBNB'::"Platform",NULL,'Airbnb — Mar into Apr','2026-03-27','2026-04-03',NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "IncomeEntry" WHERE "unitId" = v_m301_id LIMIT 1) THEN
    INSERT INTO "IncomeEntry" (id, date, "unitId", type, "grossAmount", "agentCommission", platform, "agentName", note, "checkIn", "checkOut", "createdAt")
    VALUES
      -- M301 January
      (gen_random_uuid()::text,'2026-01-03',v_m301_id,'AIRBNB'::"IncomeType",154000,0,'DIRECT'::"Platform",NULL,'Direct — Jan week 1','2026-01-03','2026-01-10',NOW()),
      (gen_random_uuid()::text,'2026-01-14',v_m301_id,'AIRBNB'::"IncomeType",161000,16100,'AIRBNB'::"Platform",NULL,'Airbnb — Jan week 3','2026-01-14','2026-01-21',NOW()),
      (gen_random_uuid()::text,'2026-01-25',v_m301_id,'AIRBNB'::"IncomeType",210000,8500,'AGENT'::"Platform",'David','Via David — Jan into Feb (10 nights)','2026-01-25','2026-02-04',NOW()),
      -- M301 February
      (gen_random_uuid()::text,'2026-02-09',v_m301_id,'AIRBNB'::"IncomeType",168000,16800,'BOOKING_COM'::"Platform",NULL,'Booking.com — Feb week 2','2026-02-09','2026-02-16',NOW()),
      (gen_random_uuid()::text,'2026-02-20',v_m301_id,'AIRBNB'::"IncomeType",154000,0,'DIRECT'::"Platform",NULL,'Direct — Feb week 4','2026-02-20','2026-02-27',NOW()),
      -- M301 March
      (gen_random_uuid()::text,'2026-03-03',v_m301_id,'AIRBNB'::"IncomeType",168000,16800,'AIRBNB'::"Platform",NULL,'Airbnb — Mar week 1','2026-03-03','2026-03-10',NOW()),
      (gen_random_uuid()::text,'2026-03-14',v_m301_id,'AIRBNB'::"IncomeType",184000,18400,'BOOKING_COM'::"Platform",NULL,'Booking.com — Mar week 2','2026-03-14','2026-03-22',NOW()),
      (gen_random_uuid()::text,'2026-03-26',v_m301_id,'AIRBNB'::"IncomeType",168000,0,'DIRECT'::"Platform",NULL,'Direct — Mar into Apr','2026-03-26','2026-04-02',NOW());
  END IF;

  RAISE NOTICE 'Income entries done';

  -- ── 6. Expenses (skip if already seeded) ────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM "ExpenseEntry" WHERE "propertyId" = v_mayfair_id LIMIT 1) THEN

    -- Fixed monthly costs — Jan 2026
    INSERT INTO "ExpenseEntry" (id, date, "unitId", "propertyId", scope, category, amount, description, "isSunkCost", "paidFromPettyCash", "createdAt")
    VALUES
      (gen_random_uuid()::text,'2026-01-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",10500,'Service charge January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3000,'Wi-Fi January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",500,'Water January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",5500,'Cleaner January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",10500,'Service charge January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3000,'Wi-Fi January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",500,'Water January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",5500,'Cleaner January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",13000,'Service charge January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3500,'Wi-Fi January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",800,'Water January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",7000,'Cleaner January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",13000,'Service charge January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3500,'Wi-Fi January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",800,'Water January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",7000,'Cleaner January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",16000,'Service charge January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",4000,'Wi-Fi January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",1200,'Water January 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",10000,'Cleaner January 2026',false,false,NOW());

    -- Fixed monthly costs — Feb 2026
    INSERT INTO "ExpenseEntry" (id, date, "unitId", "propertyId", scope, category, amount, description, "isSunkCost", "paidFromPettyCash", "createdAt")
    VALUES
      (gen_random_uuid()::text,'2026-02-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",10500,'Service charge February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3000,'Wi-Fi February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",500,'Water February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",5500,'Cleaner February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",10500,'Service charge February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3000,'Wi-Fi February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",500,'Water February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",5500,'Cleaner February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",13000,'Service charge February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3500,'Wi-Fi February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",800,'Water February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",7000,'Cleaner February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",13000,'Service charge February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3500,'Wi-Fi February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",800,'Water February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",7000,'Cleaner February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",16000,'Service charge February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",4000,'Wi-Fi February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",1200,'Water February 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",10000,'Cleaner February 2026',false,false,NOW());

    -- Fixed monthly costs — Mar 2026
    INSERT INTO "ExpenseEntry" (id, date, "unitId", "propertyId", scope, category, amount, description, "isSunkCost", "paidFromPettyCash", "createdAt")
    VALUES
      (gen_random_uuid()::text,'2026-03-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",10500,'Service charge March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3000,'Wi-Fi March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",500,'Water March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",5500,'Cleaner March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",10500,'Service charge March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3000,'Wi-Fi March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",500,'Water March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",5500,'Cleaner March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",13000,'Service charge March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3500,'Wi-Fi March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",800,'Water March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",7000,'Cleaner March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",13000,'Service charge March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",3500,'Wi-Fi March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",800,'Water March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",7000,'Cleaner March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'SERVICE_CHARGE'::"ExpenseCategory",16000,'Service charge March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WIFI'::"ExpenseCategory",4000,'Wi-Fi March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'WATER'::"ExpenseCategory",1200,'Water March 2026',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-01',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CLEANER'::"ExpenseCategory",10000,'Cleaner March 2026',false,false,NOW());

    -- Variable electricity & consumables
    INSERT INTO "ExpenseEntry" (id, date, "unitId", "propertyId", scope, category, amount, description, "isSunkCost", "paidFromPettyCash", "createdAt")
    VALUES
      -- January electricity
      (gen_random_uuid()::text,'2026-01-31',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1480,'Electricity January',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-31',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1320,'Electricity January',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-31',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",2150,'Electricity January',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-31',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1980,'Electricity January',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-31',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",3240,'Electricity January',false,false,NOW()),
      -- January consumables
      (gen_random_uuid()::text,'2026-01-15',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CONSUMABLES'::"ExpenseCategory",2000,'Consumables January',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-15',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CONSUMABLES'::"ExpenseCategory",2000,'Consumables January',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-15',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CONSUMABLES'::"ExpenseCategory",2500,'Consumables January',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-15',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CONSUMABLES'::"ExpenseCategory",2500,'Consumables January',false,false,NOW()),
      (gen_random_uuid()::text,'2026-01-15',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CONSUMABLES'::"ExpenseCategory",3500,'Consumables January',false,false,NOW()),
      -- February electricity
      (gen_random_uuid()::text,'2026-02-28',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1210,'Electricity February',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-28',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1390,'Electricity February',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-28',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1870,'Electricity February',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-28',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",2230,'Electricity February',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-28',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",2980,'Electricity February',false,false,NOW()),
      -- March electricity
      (gen_random_uuid()::text,'2026-03-31',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1560,'Electricity March',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-31',v_m102_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1440,'Electricity March',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-31',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",2080,'Electricity March',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-31',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",1950,'Electricity March',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-31',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'ELECTRICITY'::"ExpenseCategory",3110,'Electricity March',false,false,NOW()),
      -- March consumables
      (gen_random_uuid()::text,'2026-03-18',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CONSUMABLES'::"ExpenseCategory",2500,'Consumables March',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-18',v_m202_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CONSUMABLES'::"ExpenseCategory",2500,'Consumables March',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-18',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CONSUMABLES'::"ExpenseCategory",3500,'Consumables March',false,false,NOW());

    -- Capital items (sunk costs)
    INSERT INTO "ExpenseEntry" (id, date, "unitId", "propertyId", scope, category, amount, description, "isSunkCost", "paidFromPettyCash", "createdAt")
    VALUES
      (gen_random_uuid()::text,'2026-01-15',v_m201_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CAPITAL'::"ExpenseCategory",35000,'Smart TV replacement M201',true,false,NOW()),
      (gen_random_uuid()::text,'2026-01-20',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CAPITAL'::"ExpenseCategory",8500,'Coffee machine M301',true,false,NOW()),
      (gen_random_uuid()::text,'2026-02-10',v_m101_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CAPITAL'::"ExpenseCategory",18000,'Mattress replacement M101',true,false,NOW()),
      (gen_random_uuid()::text,'2026-03-05',v_m301_id,v_mayfair_id,'UNIT'::"ExpenseScope",'CAPITAL'::"ExpenseCategory",15000,'Deep clean & carpet treatment M301',true,false,NOW());

    -- Management fees
    INSERT INTO "ExpenseEntry" (id, date, "propertyId", scope, category, amount, description, "isSunkCost", "paidFromPettyCash", "createdAt")
    VALUES
      (gen_random_uuid()::text,'2026-01-31',v_mayfair_id,'PORTFOLIO'::"ExpenseScope",'MANAGEMENT_FEE'::"ExpenseCategory",155000,'Management fee January 2026 — Mayfair Suites',false,false,NOW()),
      (gen_random_uuid()::text,'2026-02-28',v_mayfair_id,'PORTFOLIO'::"ExpenseScope",'MANAGEMENT_FEE'::"ExpenseCategory",99000,'Management fee February 2026 — Mayfair Suites',false,false,NOW()),
      (gen_random_uuid()::text,'2026-03-31',v_mayfair_id,'PORTFOLIO'::"ExpenseScope",'MANAGEMENT_FEE'::"ExpenseCategory",157000,'Management fee March 2026 — Mayfair Suites',false,false,NOW());

    RAISE NOTICE 'Expenses inserted';
  ELSE
    RAISE NOTICE 'Expenses already exist — skipped';
  END IF;

  -- ── 7. Petty cash ────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM "PettyCash" WHERE "propertyId" = v_mayfair_id LIMIT 1) THEN
    INSERT INTO "PettyCash" (id, date, type, amount, description, "propertyId", "createdAt")
    VALUES
      (gen_random_uuid()::text,'2026-01-05','IN'::"PettyCashType",15000,'Opening petty cash float — Mayfair Suites',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-02-01','IN'::"PettyCashType",12000,'Petty cash top-up February',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-03-01','IN'::"PettyCashType",12000,'Petty cash top-up March',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-01-12','OUT'::"PettyCashType",3500,'Cleaning supplies all units Jan',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-01-20','OUT'::"PettyCashType",5000,'Electricity tokens January',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-01-28','OUT'::"PettyCashType",4200,'Minor repairs M101 & M102',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-02-08','OUT'::"PettyCashType",6000,'Consumables restock February',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-02-15','OUT'::"PettyCashType",3800,'Emergency shower fix M202',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-02-25','OUT'::"PettyCashType",5500,'Various maintenance February',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-03-07','OUT'::"PettyCashType",4500,'Cleaning equipment purchase',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-03-15','OUT'::"PettyCashType",6000,'Consumables & guest supplies Mar',v_mayfair_id,NOW()),
      (gen_random_uuid()::text,'2026-03-22','OUT'::"PettyCashType",5500,'Miscellaneous expenses March',v_mayfair_id,NOW());
    RAISE NOTICE 'Petty cash inserted';
  ELSE
    RAISE NOTICE 'Petty cash already exists — skipped';
  END IF;

  RAISE NOTICE '✅ Mayfair Suites seed complete!';

END $$;
