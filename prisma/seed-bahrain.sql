-- =============================================================
-- Al Seef Residences — Bahrain Demo Seed
-- Paste this entire script into the Supabase SQL Editor and run.
-- Safe to re-run: deletes existing Al Seef data first.
-- =============================================================

DO $$
DECLARE
  -- Top-level IDs
  v_org_id        TEXT;
  v_owner_id      TEXT;
  v_manager_id    TEXT;
  v_prop_id       TEXT;
  v_pw            TEXT := '$2b$10$YR7smwp6QhOjwIvBOiGqW.9Dxjx0I3owntXjibvn/ByM9XmLTrbkm';

  -- Unit IDs
  u101 TEXT; u102 TEXT; u103 TEXT; u104 TEXT; u105 TEXT;
  u201 TEXT; u202 TEXT; u203 TEXT; u204 TEXT; u205 TEXT;
  u301 TEXT; u302 TEXT; u303 TEXT; u304 TEXT; u305 TEXT;
  u401 TEXT; u402 TEXT; u403 TEXT; u404 TEXT; u405 TEXT;

  -- Tenant IDs
  t101 TEXT; t102 TEXT; t103 TEXT; t104 TEXT; t105 TEXT;
  t201 TEXT; t202 TEXT; t203 TEXT; t204 TEXT; t205 TEXT;
  t301 TEXT; t302 TEXT; t303 TEXT; t304 TEXT; t305 TEXT;
  t401 TEXT; t402 TEXT; t403 TEXT; t404 TEXT; t405 TEXT;

  -- Vendor IDs
  v_vendor_mgmt  TEXT;
  v_vendor_water TEXT;
  v_vendor_elec  TEXT;
  v_vendor_wifi  TEXT;
  v_vendor_clean TEXT;
  v_vendor_plumb TEXT;
  v_vendor_tech  TEXT;
  v_vendor_lift  TEXT;
  v_vendor_pump  TEXT;
  v_vendor_cctv  TEXT;

  -- Recurring expense IDs (for schedule linkage)
  v_recur_gen   TEXT;
  v_recur_lift  TEXT;
  v_recur_pump  TEXT;
  v_recur_cctv  TEXT;

  -- Tax config
  v_vat_id      TEXT;

  -- Expense IDs for VAT line items
  e_mgmt_jan TEXT; e_mgmt_feb TEXT; e_mgmt_mar TEXT;
  e_water_jan TEXT; e_water_feb TEXT; e_water_mar TEXT;
  e_elec_jan TEXT; e_elec_feb TEXT; e_elec_mar TEXT;
  e_wifi_jan TEXT; e_wifi_feb TEXT; e_wifi_mar TEXT;
  e_clean_jan TEXT; e_clean_feb TEXT; e_clean_mar TEXT;
  e_maint_103 TEXT; e_maint_201 TEXT; e_maint_404 TEXT; e_reinstate_302 TEXT;

  -- Misc
  v_inv_id  TEXT;
  v_inc_id  TEXT;
  v_asset_id TEXT;

BEGIN

-- =============================================================
-- CLEANUP: remove existing Al Seef data (idempotent)
-- =============================================================
SELECT id INTO v_prop_id FROM "Property" WHERE name = 'Al Seef Residences' LIMIT 1;

IF v_prop_id IS NOT NULL THEN
  DELETE FROM "MaintenanceJob"          WHERE "propertyId" = v_prop_id;
  DELETE FROM "ArrearsCase"            WHERE "propertyId" = v_prop_id;
  DELETE FROM "RecurringExpense"        WHERE "propertyId" = v_prop_id;
  DELETE FROM "InsurancePolicy"         WHERE "propertyId" = v_prop_id;
  DELETE FROM "PettyCash"               WHERE "propertyId" = v_prop_id;
  DELETE FROM "ExpenseEntry"            WHERE "propertyId" = v_prop_id;
  DELETE FROM "AssetMaintenanceSchedule" WHERE "propertyId" = v_prop_id;
  DELETE FROM "Asset"                   WHERE "propertyId" = v_prop_id;
  -- Units → tenants → invoices → income
  DELETE FROM "IncomeEntry"  WHERE "unitId" IN (SELECT id FROM "Unit" WHERE "propertyId" = v_prop_id);
  DELETE FROM "Invoice"      WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE "unitId" IN (SELECT id FROM "Unit" WHERE "propertyId" = v_prop_id));
  DELETE FROM "ExpenseEntry" WHERE "unitId"  IN (SELECT id FROM "Unit" WHERE "propertyId" = v_prop_id);
  DELETE FROM "ManagementFeeConfig" WHERE "unitId" IN (SELECT id FROM "Unit" WHERE "propertyId" = v_prop_id);
  DELETE FROM "Tenant"       WHERE "unitId"  IN (SELECT id FROM "Unit" WHERE "propertyId" = v_prop_id);
  DELETE FROM "TaxConfiguration" WHERE "orgId" = (SELECT "organizationId" FROM "Property" WHERE id = v_prop_id) AND label = 'VAT';
  DELETE FROM "Vendor"        WHERE "organizationId" = (SELECT "organizationId" FROM "Property" WHERE id = v_prop_id);
  DELETE FROM "PropertyAccess" WHERE "propertyId" = v_prop_id;
  DELETE FROM "Unit"         WHERE "propertyId" = v_prop_id;
  DELETE FROM "Property"     WHERE id = v_prop_id;
  RAISE NOTICE 'Cleaned up existing Al Seef Residences data';
END IF;

-- =============================================================
-- ORGANISATION
-- =============================================================
SELECT id INTO v_org_id FROM "Organization" WHERE name = 'Al Seef Property Management' LIMIT 1;
IF v_org_id IS NULL THEN
  INSERT INTO "Organization" (id, name, email, "defaultCurrency", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'Al Seef Property Management', 'admin@alseef.bh', 'BHD', NOW(), NOW())
  RETURNING id INTO v_org_id;
END IF;
RAISE NOTICE 'Org ID: %', v_org_id;

-- VAT Configuration (Bahrain standard rate 10%)
INSERT INTO "TaxConfiguration" (id,"orgId",label,rate,type,"appliesTo","isInclusive","isActive","effectiveFrom","createdAt")
VALUES (gen_random_uuid()::text,v_org_id,'VAT',0.10,'ADDITIVE',ARRAY['CONTRACTOR_LABOUR','SERVICE','MATERIALS','UTILITY'],false,true,'2022-01-01',NOW())
RETURNING id INTO v_vat_id;
RAISE NOTICE 'VAT config created (10%%)';

-- =============================================================
-- OWNER USER
-- =============================================================
SELECT id INTO v_owner_id FROM "User" WHERE email = 'owner@alseef.bh' LIMIT 1;
IF v_owner_id IS NULL THEN
  INSERT INTO "User" (id, name, email, password, role, phone, "isActive", "organizationId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'Khalid Al-Dosari', 'owner@alseef.bh', v_pw, 'OWNER', '+973 3600 1001', true, v_org_id, NOW(), NOW())
  RETURNING id INTO v_owner_id;
ELSE
  UPDATE "User" SET password = v_pw, "organizationId" = v_org_id, "isActive" = true, "updatedAt" = NOW()
  WHERE id = v_owner_id;
END IF;

INSERT INTO "UserOrganizationMembership" (id, "userId", "organizationId", "createdAt")
VALUES (gen_random_uuid()::text, v_owner_id, v_org_id, NOW())
ON CONFLICT ("userId", "organizationId") DO NOTHING;
RAISE NOTICE 'Owner user: owner@alseef.bh / demo123';

-- =============================================================
-- MANAGER USER
-- =============================================================
SELECT id INTO v_manager_id FROM "User" WHERE email = 'manager@alseef.bh' LIMIT 1;
IF v_manager_id IS NULL THEN
  INSERT INTO "User" (id, name, email, password, role, phone, "isActive", "organizationId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'Sara Al-Habsi', 'manager@alseef.bh', v_pw, 'MANAGER', '+973 3600 2002', true, v_org_id, NOW(), NOW())
  RETURNING id INTO v_manager_id;
ELSE
  UPDATE "User" SET password = v_pw, "organizationId" = v_org_id, "isActive" = true, "updatedAt" = NOW()
  WHERE id = v_manager_id;
END IF;

INSERT INTO "UserOrganizationMembership" (id, "userId", "organizationId", "createdAt")
VALUES (gen_random_uuid()::text, v_manager_id, v_org_id, NOW())
ON CONFLICT ("userId", "organizationId") DO NOTHING;
RAISE NOTICE 'Manager user: manager@alseef.bh / demo123';

-- =============================================================
-- PROPERTY
-- =============================================================
INSERT INTO "Property" (id, name, type, category, address, city, description, "ownerId", "organizationId", "serviceChargeDefault", currency, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'Al Seef Residences', 'LONGTERM', 'RESIDENTIAL',
  'Seef District, Manama', 'Manama',
  'Modern 4-storey residential tower in the heart of Seef District. 20 fully-furnished apartments with central A/C, covered parking, rooftop terrace, and 24/7 security.',
  v_owner_id, v_org_id, 75, 'BHD', NOW(), NOW()
) RETURNING id INTO v_prop_id;

INSERT INTO "PropertyAccess" (id, "userId", "propertyId", "grantedAt")
VALUES (gen_random_uuid()::text, v_manager_id, v_prop_id, NOW())
ON CONFLICT ("userId", "propertyId") DO NOTHING;

RAISE NOTICE 'Property: Al Seef Residences (%)' , v_prop_id;

-- =============================================================
-- UNITS (20)
-- =============================================================
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'101',v_prop_id,'ONE_BED',  1,350,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security'],58, NOW(),NOW()) RETURNING id INTO u101;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'102',v_prop_id,'ONE_BED',  1,350,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security'],58, NOW(),NOW()) RETURNING id INTO u102;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'103',v_prop_id,'TWO_BED',  1,500,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security'],90, NOW(),NOW()) RETURNING id INTO u103;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'104',v_prop_id,'TWO_BED',  1,500,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security'],90, NOW(),NOW()) RETURNING id INTO u104;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'105',v_prop_id,'TWO_BED',  1,500,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security'],90, NOW(),NOW()) RETURNING id INTO u105;

INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'201',v_prop_id,'ONE_BED',  2,370,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security'],58, NOW(),NOW()) RETURNING id INTO u201;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'202',v_prop_id,'ONE_BED',  2,370,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security'],58, NOW(),NOW()) RETURNING id INTO u202;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'203',v_prop_id,'TWO_BED',  2,520,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],95, NOW(),NOW()) RETURNING id INTO u203;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'204',v_prop_id,'TWO_BED',  2,520,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],95, NOW(),NOW()) RETURNING id INTO u204;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'205',v_prop_id,'THREE_BED',2,720,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],130,NOW(),NOW()) RETURNING id INTO u205;

INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'301',v_prop_id,'ONE_BED',  3,370,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],58, NOW(),NOW()) RETURNING id INTO u301;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'302',v_prop_id,'TWO_BED',  3,520,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],95, NOW(),NOW()) RETURNING id INTO u302;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'303',v_prop_id,'TWO_BED',  3,520,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],95, NOW(),NOW()) RETURNING id INTO u303;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'304',v_prop_id,'TWO_BED',  3,520,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],95, NOW(),NOW()) RETURNING id INTO u304;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'305',v_prop_id,'THREE_BED',3,720,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],130,NOW(),NOW()) RETURNING id INTO u305;

INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'401',v_prop_id,'ONE_BED',  4,390,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],60, NOW(),NOW()) RETURNING id INTO u401;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'402',v_prop_id,'TWO_BED',  4,540,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],98, NOW(),NOW()) RETURNING id INTO u402;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'403',v_prop_id,'TWO_BED',  4,540,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],98, NOW(),NOW()) RETURNING id INTO u403;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'404',v_prop_id,'THREE_BED',4,750,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],135,NOW(),NOW()) RETURNING id INTO u404;
INSERT INTO "Unit" (id,"unitNumber","propertyId",type,floor,"monthlyRent",status,amenities,"sizeSqm","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'405',v_prop_id,'THREE_BED',4,750,'ACTIVE',ARRAY['Central A/C','Covered Parking','24/7 Security','City View','Balcony'],135,NOW(),NOW()) RETURNING id INTO u405;

RAISE NOTICE '20 units created';

-- =============================================================
-- MANAGEMENT FEE CONFIGS
-- =============================================================
INSERT INTO "ManagementFeeConfig" (id,"unitId","flatAmount","ratePercent","effectiveFrom") VALUES
  (gen_random_uuid()::text, u101, 50, 0, '2026-01-01'),
  (gen_random_uuid()::text, u102, 50, 0, '2026-01-01'),
  (gen_random_uuid()::text, u103, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u104, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u105, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u201, 50, 0, '2026-01-01'),
  (gen_random_uuid()::text, u202, 50, 0, '2026-01-01'),
  (gen_random_uuid()::text, u203, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u204, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u205,100, 0, '2026-01-01'),
  (gen_random_uuid()::text, u301, 50, 0, '2026-01-01'),
  (gen_random_uuid()::text, u302, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u303, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u304, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u305,100, 0, '2026-01-01'),
  (gen_random_uuid()::text, u401, 50, 0, '2026-01-01'),
  (gen_random_uuid()::text, u402, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u403, 75, 0, '2026-01-01'),
  (gen_random_uuid()::text, u404,100, 0, '2026-01-01'),
  (gen_random_uuid()::text, u405,100, 0, '2026-01-01');

-- =============================================================
-- TENANTS (20)
-- =============================================================
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Ahmed Al-Dosari',      u101,700, '2026-01-01','2026-01-01','2027-12-31',350,50,1,true,'+973 3900 1101','ahmed.aldosari@gmail.com',   'BH-19820341','NONE',NOW(),NOW()) RETURNING id INTO t101;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Priya Sharma',         u102,700, '2026-01-01','2026-01-01','2026-12-31',350,50,1,true,'+973 3900 1102','priya.sharma@gmail.com',      'IN-EXP-2340','NONE',NOW(),NOW()) RETURNING id INTO t102;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Mohammed Al-Mannai',   u103,1000,'2026-01-01','2026-01-01','2027-12-31',500,75,1,true,'+973 3900 1103','m.almannaibh@gmail.com',      'BH-19751234','NONE',NOW(),NOW()) RETURNING id INTO t103;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'James & Claire Harrison',u104,1000,'2026-01-01','2026-01-01','2026-12-31',500,75,1,true,'+973 3900 1104','j.harrison.bh@gmail.com',    'GB-EXP-0891','NONE',NOW(),NOW()) RETURNING id INTO t104;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Rajesh Kumar',         u105,1000,'2026-01-01','2026-01-01','2026-12-31',500,75,1,true,'+973 3900 1105','rajesh.kumar.bh@gmail.com',   'IN-EXP-5512','NONE',NOW(),NOW()) RETURNING id INTO t105;

INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Fatima Al-Khalifa',    u201,740, '2026-01-01','2026-01-01','2027-12-31',370,50,1,true,'+973 3900 2201','fatima.alkhalifa@gmail.com',  'BH-19900876','NONE',NOW(),NOW()) RETURNING id INTO t201;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Tariq Hussain',        u202,740, '2026-01-01','2026-01-01','2026-12-31',370,50,1,true,'+973 3900 2202','tariq.hussain.bh@gmail.com',  'PK-EXP-3312','NONE',NOW(),NOW()) RETURNING id INTO t202;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Nasser Al-Qasimi',     u203,1040,'2026-01-01','2026-01-01','2027-12-31',520,75,1,true,'+973 3900 2203','n.alqasimi@gmail.com',        'AE-EXP-0044','NONE',NOW(),NOW()) RETURNING id INTO t203;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Sunita & Vikram Nair', u204,1040,'2026-01-01','2026-01-01','2026-12-31',520,75,1,true,'+973 3900 2204','vikram.nair.bh@gmail.com',    'IN-EXP-7789','NONE',NOW(),NOW()) RETURNING id INTO t204;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Ali Al-Zayani',        u205,1440,'2026-01-01','2026-01-01','2027-12-31',720,100,1,true,'+973 3900 2205','ali.alzayani@gmail.com',      'BH-19780654','NONE',NOW(),NOW()) RETURNING id INTO t205;

INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Sarah Mitchell',       u301,740, '2026-01-01','2026-01-01','2026-12-31',370,50,1,true,'+973 3900 3301','sarah.mitchell.bh@gmail.com', 'GB-EXP-1122','NONE',NOW(),NOW()) RETURNING id INTO t301;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Hassan Al-Buainain',   u302,1040,'2026-01-01','2026-01-01','2027-12-31',520,75,1,true,'+973 3900 3302','h.albuainain@gmail.com',      'BH-19851023','NONE',NOW(),NOW()) RETURNING id INTO t302;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Anwar Al-Rashid',      u303,1040,'2026-01-01','2026-01-01','2027-12-31',520,75,1,true,'+973 3900 3303','anwar.alrashid@gmail.com',    'BH-19800412','NONE',NOW(),NOW()) RETURNING id INTO t303;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Deepak & Meera Pillai',u304,1040,'2026-01-01','2026-01-01','2026-12-31',520,75,1,true,'+973 3900 3304','deepak.pillai.bh@gmail.com',  'IN-EXP-2209','NOTICE_SENT',NOW(),NOW()) RETURNING id INTO t304;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","notes","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Khalid Al-Rumaihi',    u305,1440,'2026-01-01','2026-01-01','2027-12-31',720,100,1,true,'+973 3900 3305','k.alrumaihi@gmail.com',       'BH-19720889','NONE',NULL,NOW(),NOW()) RETURNING id INTO t305;

INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Omar Al-Tajer',        u401,780, '2026-01-01','2026-01-01','2027-12-31',390,50,1,true,'+973 3900 4401','omar.altajer@gmail.com',      'BH-19930567','NONE',NOW(),NOW()) RETURNING id INTO t401;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Aisha Yusuf',          u402,1080,'2026-01-01','2026-01-01','2026-12-31',540,75,1,true,'+973 3900 4402','aisha.yusuf.bh@gmail.com',    'BH-19870234','NONE',NOW(),NOW()) RETURNING id INTO t402;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Michael & Diane Foster',u403,1080,'2026-01-01','2026-01-01','2026-12-31',540,75,1,true,'+973 3900 4403','m.foster.bahrain@gmail.com',  'US-EXP-3301','NONE',NOW(),NOW()) RETURNING id INTO t403;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Abdullah Al-Maktoum',  u404,1500,'2026-01-01','2026-01-01','2027-12-31',750,100,1,true,'+973 3900 4404','a.almaktoum.bh@gmail.com',    'AE-EXP-0078','NONE',NOW(),NOW()) RETURNING id INTO t404;
INSERT INTO "Tenant" (id,name,"unitId","depositAmount","depositPaidDate","leaseStart","leaseEnd","monthlyRent","serviceCharge","rentDueDay","isActive",phone,email,"nationalId","renewalStage","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Faisal Al-Noaimi',     u405,1500,'2026-01-01','2026-01-01','2027-12-31',750,100,1,true,'+973 3900 4405','faisal.alnoaimi@gmail.com',   'BH-19680123','NONE',NOW(),NOW()) RETURNING id INTO t405;

RAISE NOTICE '20 tenants created';

-- =============================================================
-- INVOICES + INCOME ENTRIES
-- Arrears: unit 102 skips Feb(2)+Mar(3); unit 304 skips Mar(3)
-- Invoice numbering: ASR-2026-MM-NNN
-- =============================================================

-- Helper macro: insert invoice + income in one shot
-- PAID months
-- Jan (periodMonth=1, date=2026-01-01, due=2026-01-05)

-- UNIT 101 — 350+50=400 all 3 months PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-001',t101,2026,1,350,50,400,'2026-01-05','PAID','2026-01-01',400,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u101,t101,v_inv_id,'LONGTERM_RENT',400,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-001',t101,2026,2,350,50,400,'2026-02-05','PAID','2026-02-01',400,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u101,t101,v_inv_id,'LONGTERM_RENT',400,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-001',t101,2026,3,350,50,400,'2026-03-05','PAID','2026-03-01',400,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u101,t101,v_inv_id,'LONGTERM_RENT',400,0,NOW());

-- UNIT 102 — 350+50=400; Jan PAID, Feb OVERDUE, Mar OVERDUE
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-002',t102,2026,1,350,50,400,'2026-01-05','PAID','2026-01-01',400,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u102,t102,v_inv_id,'LONGTERM_RENT',400,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-002',t102,2026,2,350,50,400,'2026-02-05','OVERDUE',NOW(),NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-002',t102,2026,3,350,50,400,'2026-03-05','OVERDUE',NOW(),NOW());

-- UNIT 103 — 500+75=575 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-003',t103,2026,1,500,75,575,'2026-01-05','PAID','2026-01-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u103,t103,v_inv_id,'LONGTERM_RENT',575,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-003',t103,2026,2,500,75,575,'2026-02-05','PAID','2026-02-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u103,t103,v_inv_id,'LONGTERM_RENT',575,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-003',t103,2026,3,500,75,575,'2026-03-05','PAID','2026-03-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u103,t103,v_inv_id,'LONGTERM_RENT',575,0,NOW());

-- UNIT 104 — 500+75=575 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-004',t104,2026,1,500,75,575,'2026-01-05','PAID','2026-01-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u104,t104,v_inv_id,'LONGTERM_RENT',575,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-004',t104,2026,2,500,75,575,'2026-02-05','PAID','2026-02-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u104,t104,v_inv_id,'LONGTERM_RENT',575,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-004',t104,2026,3,500,75,575,'2026-03-05','PAID','2026-03-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u104,t104,v_inv_id,'LONGTERM_RENT',575,0,NOW());

-- UNIT 105 — 500+75=575 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-005',t105,2026,1,500,75,575,'2026-01-05','PAID','2026-01-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u105,t105,v_inv_id,'LONGTERM_RENT',575,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-005',t105,2026,2,500,75,575,'2026-02-05','PAID','2026-02-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u105,t105,v_inv_id,'LONGTERM_RENT',575,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-005',t105,2026,3,500,75,575,'2026-03-05','PAID','2026-03-01',575,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u105,t105,v_inv_id,'LONGTERM_RENT',575,0,NOW());

-- UNIT 201 — 370+50=420 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-006',t201,2026,1,370,50,420,'2026-01-05','PAID','2026-01-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u201,t201,v_inv_id,'LONGTERM_RENT',420,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-006',t201,2026,2,370,50,420,'2026-02-05','PAID','2026-02-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u201,t201,v_inv_id,'LONGTERM_RENT',420,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-006',t201,2026,3,370,50,420,'2026-03-05','PAID','2026-03-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u201,t201,v_inv_id,'LONGTERM_RENT',420,0,NOW());

-- UNIT 202 — 370+50=420 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-007',t202,2026,1,370,50,420,'2026-01-05','PAID','2026-01-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u202,t202,v_inv_id,'LONGTERM_RENT',420,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-007',t202,2026,2,370,50,420,'2026-02-05','PAID','2026-02-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u202,t202,v_inv_id,'LONGTERM_RENT',420,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-007',t202,2026,3,370,50,420,'2026-03-05','PAID','2026-03-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u202,t202,v_inv_id,'LONGTERM_RENT',420,0,NOW());

-- UNIT 203 — 520+75=595 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-008',t203,2026,1,520,75,595,'2026-01-05','PAID','2026-01-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u203,t203,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-008',t203,2026,2,520,75,595,'2026-02-05','PAID','2026-02-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u203,t203,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-008',t203,2026,3,520,75,595,'2026-03-05','PAID','2026-03-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u203,t203,v_inv_id,'LONGTERM_RENT',595,0,NOW());

-- UNIT 204 — 520+75=595 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-009',t204,2026,1,520,75,595,'2026-01-05','PAID','2026-01-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u204,t204,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-009',t204,2026,2,520,75,595,'2026-02-05','PAID','2026-02-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u204,t204,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-009',t204,2026,3,520,75,595,'2026-03-05','PAID','2026-03-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u204,t204,v_inv_id,'LONGTERM_RENT',595,0,NOW());

-- UNIT 205 — 720+100=820 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-010',t205,2026,1,720,100,820,'2026-01-05','PAID','2026-01-01',820,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u205,t205,v_inv_id,'LONGTERM_RENT',820,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-010',t205,2026,2,720,100,820,'2026-02-05','PAID','2026-02-01',820,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u205,t205,v_inv_id,'LONGTERM_RENT',820,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-010',t205,2026,3,720,100,820,'2026-03-05','PAID','2026-03-01',820,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u205,t205,v_inv_id,'LONGTERM_RENT',820,0,NOW());

-- UNIT 301 — 370+50=420 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-011',t301,2026,1,370,50,420,'2026-01-05','PAID','2026-01-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u301,t301,v_inv_id,'LONGTERM_RENT',420,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-011',t301,2026,2,370,50,420,'2026-02-05','PAID','2026-02-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u301,t301,v_inv_id,'LONGTERM_RENT',420,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-011',t301,2026,3,370,50,420,'2026-03-05','PAID','2026-03-01',420,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u301,t301,v_inv_id,'LONGTERM_RENT',420,0,NOW());

-- UNIT 302 — 520+75=595 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-012',t302,2026,1,520,75,595,'2026-01-05','PAID','2026-01-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u302,t302,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-012',t302,2026,2,520,75,595,'2026-02-05','PAID','2026-02-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u302,t302,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-012',t302,2026,3,520,75,595,'2026-03-05','PAID','2026-03-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u302,t302,v_inv_id,'LONGTERM_RENT',595,0,NOW());

-- UNIT 303 — 520+75=595 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-013',t303,2026,1,520,75,595,'2026-01-05','PAID','2026-01-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u303,t303,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-013',t303,2026,2,520,75,595,'2026-02-05','PAID','2026-02-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u303,t303,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-013',t303,2026,3,520,75,595,'2026-03-05','PAID','2026-03-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u303,t303,v_inv_id,'LONGTERM_RENT',595,0,NOW());

-- UNIT 304 — 520+75=595; Jan+Feb PAID, Mar OVERDUE
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-014',t304,2026,1,520,75,595,'2026-01-05','PAID','2026-01-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u304,t304,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-014',t304,2026,2,520,75,595,'2026-02-05','PAID','2026-02-01',595,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u304,t304,v_inv_id,'LONGTERM_RENT',595,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-014',t304,2026,3,520,75,595,'2026-03-05','OVERDUE',NOW(),NOW());

-- UNIT 305 — 720+100=820 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-015',t305,2026,1,720,100,820,'2026-01-05','PAID','2026-01-01',820,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u305,t305,v_inv_id,'LONGTERM_RENT',820,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-015',t305,2026,2,720,100,820,'2026-02-05','PAID','2026-02-01',820,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u305,t305,v_inv_id,'LONGTERM_RENT',820,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-015',t305,2026,3,720,100,820,'2026-03-05','PAID','2026-03-01',820,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u305,t305,v_inv_id,'LONGTERM_RENT',820,0,NOW());

-- UNIT 401 — 390+50=440 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-016',t401,2026,1,390,50,440,'2026-01-05','PAID','2026-01-01',440,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u401,t401,v_inv_id,'LONGTERM_RENT',440,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-016',t401,2026,2,390,50,440,'2026-02-05','PAID','2026-02-01',440,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u401,t401,v_inv_id,'LONGTERM_RENT',440,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-016',t401,2026,3,390,50,440,'2026-03-05','PAID','2026-03-01',440,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u401,t401,v_inv_id,'LONGTERM_RENT',440,0,NOW());

-- UNIT 402 — 540+75=615 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-017',t402,2026,1,540,75,615,'2026-01-05','PAID','2026-01-01',615,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u402,t402,v_inv_id,'LONGTERM_RENT',615,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-017',t402,2026,2,540,75,615,'2026-02-05','PAID','2026-02-01',615,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u402,t402,v_inv_id,'LONGTERM_RENT',615,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-017',t402,2026,3,540,75,615,'2026-03-05','PAID','2026-03-01',615,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u402,t402,v_inv_id,'LONGTERM_RENT',615,0,NOW());

-- UNIT 403 — 540+75=615 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-018',t403,2026,1,540,75,615,'2026-01-05','PAID','2026-01-01',615,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u403,t403,v_inv_id,'LONGTERM_RENT',615,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-018',t403,2026,2,540,75,615,'2026-02-05','PAID','2026-02-01',615,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u403,t403,v_inv_id,'LONGTERM_RENT',615,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-018',t403,2026,3,540,75,615,'2026-03-05','PAID','2026-03-01',615,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u403,t403,v_inv_id,'LONGTERM_RENT',615,0,NOW());

-- UNIT 404 — 750+100=850 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-019',t404,2026,1,750,100,850,'2026-01-05','PAID','2026-01-01',850,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u404,t404,v_inv_id,'LONGTERM_RENT',850,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-019',t404,2026,2,750,100,850,'2026-02-05','PAID','2026-02-01',850,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u404,t404,v_inv_id,'LONGTERM_RENT',850,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-019',t404,2026,3,750,100,850,'2026-03-05','PAID','2026-03-01',850,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u404,t404,v_inv_id,'LONGTERM_RENT',850,0,NOW());

-- UNIT 405 — 750+100=850 all PAID
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-01-020',t405,2026,1,750,100,850,'2026-01-05','PAID','2026-01-01',850,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u405,t405,v_inv_id,'LONGTERM_RENT',850,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-02-020',t405,2026,2,750,100,850,'2026-02-05','PAID','2026-02-01',850,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u405,t405,v_inv_id,'LONGTERM_RENT',850,0,NOW());
INSERT INTO "Invoice" (id,"invoiceNumber","tenantId","periodYear","periodMonth","rentAmount","serviceCharge","totalAmount","dueDate",status,"paidAt","paidAmount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'ASR-2026-03-020',t405,2026,3,750,100,850,'2026-03-05','PAID','2026-03-01',850,NOW(),NOW()) RETURNING id INTO v_inv_id;
INSERT INTO "IncomeEntry" (id,date,"unitId","tenantId","invoiceId",type,"grossAmount","agentCommission","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u405,t405,v_inv_id,'LONGTERM_RENT',850,0,NOW());

RAISE NOTICE 'Invoices and income entries created';

-- =============================================================
-- VENDORS
-- =============================================================
INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'Al Seef Property Management','SERVICE_PROVIDER','+973 1700 1100','info@alseef.bh','Property management company responsible for day-to-day operations of Al Seef Residences.',true,NOW(),NOW())
RETURNING id INTO v_vendor_mgmt;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'BEWA — Bahrain Electricity & Water Authority','UTILITY_PROVIDER','+973 1700 0000','customer@bewa.bh','National water utility. Account ref: BEWA-ASR-2025-0441.',true,NOW(),NOW())
RETURNING id INTO v_vendor_water;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'MEW — Ministry of Electricity & Water Affairs','UTILITY_PROVIDER','+973 1753 3533','info@mew.gov.bh','National electricity provider for common areas, lifts and car park lighting. Account ref: MEW-ASR-2025-1887.',true,NOW(),NOW())
RETURNING id INTO v_vendor_elec;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'Batelco','UTILITY_PROVIDER','+973 1788 1881','business@batelco.com.bh','Batelco fibre internet — 500 Mbps dedicated building line. Contract ref: BAT-BIZ-2024-6612.',true,NOW(),NOW())
RETURNING id INTO v_vendor_wifi;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'Al Noor Facility Management','SERVICE_PROVIDER','+973 3300 7744','ops@alnoor-fm.bh','Provides 2 full-time cleaners for common areas and grounds. Also handles landscaping and G4S security coordination.',true,NOW(),NOW())
RETURNING id INTO v_vendor_clean;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'Al Baraka Plumbing & Maintenance','CONTRACTOR','+973 3911 2255','albaraka.plumbing@gmail.com','Licensed plumbing and general maintenance contractor. Used for unit-level repairs and common area plumbing.',true,NOW(),NOW())
RETURNING id INTO v_vendor_plumb;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'Gulf Technical Services','CONTRACTOR','+973 3600 4488','service@gulftechbh.com','Electrical and HVAC contractor. Handles A/C servicing, electrical faults, and generator maintenance.',true,NOW(),NOW())
RETURNING id INTO v_vendor_tech;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'ThyssenKrupp Elevator Bahrain','SERVICE_PROVIDER','+973 1721 5566','service.bh@thyssenkrupp.com','Annual lift servicing and statutory inspection contract for the 10-person MRL passenger lift. Contract ref: TK-SVC-2026-BH-004.',true,NOW(),NOW())
RETURNING id INTO v_vendor_lift;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'Aqua Systems Bahrain','CONTRACTOR','+973 1733 8899','service@aquasystemsbh.com','Authorised Grundfos service partner. Handles pump inspections, pressure testing, and rooftop tank maintenance.',true,NOW(),NOW())
RETURNING id INTO v_vendor_pump;

INSERT INTO "Vendor" (id,"organizationId",name,category,phone,email,notes,"isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_org_id,'Techno Systems Bahrain','CONTRACTOR','+973 1744 6677','support@technosystems.bh','CCTV installation and maintenance contractor. Manages Hikvision 16-channel system including annual health checks and storage verification.',true,NOW(),NOW())
RETURNING id INTO v_vendor_cctv;

RAISE NOTICE '10 vendors created';

-- =============================================================
-- EXPENSES — monthly property-level (each INSERT captured for VAT line items)
-- =============================================================
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',v_prop_id,'PROPERTY','MANAGEMENT_FEE',650,'Monthly management fee — Al Seef Property Management',false,false,v_vendor_mgmt,NOW()) RETURNING id INTO e_mgmt_jan;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',v_prop_id,'PROPERTY','WATER',         180,'BEWA — building water supply',false,false,v_vendor_water,NOW()) RETURNING id INTO e_water_jan;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',v_prop_id,'PROPERTY','ELECTRICITY',   220,'MEW — common areas, lifts & car park lighting',false,false,v_vendor_elec,NOW()) RETURNING id INTO e_elec_jan;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',v_prop_id,'PROPERTY','WIFI',            90,'Batelco Fibre — building internet infrastructure',false,false,v_vendor_wifi,NOW()) RETURNING id INTO e_wifi_jan;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',v_prop_id,'PROPERTY','CLEANER',        380,'Cleaning staff — 2 full-time (common areas & grounds)',false,false,v_vendor_clean,NOW()) RETURNING id INTO e_clean_jan;

INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',v_prop_id,'PROPERTY','MANAGEMENT_FEE',650,'Monthly management fee — Al Seef Property Management',false,false,v_vendor_mgmt,NOW()) RETURNING id INTO e_mgmt_feb;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',v_prop_id,'PROPERTY','WATER',         180,'BEWA — building water supply',false,false,v_vendor_water,NOW()) RETURNING id INTO e_water_feb;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',v_prop_id,'PROPERTY','ELECTRICITY',   220,'MEW — common areas, lifts & car park lighting',false,false,v_vendor_elec,NOW()) RETURNING id INTO e_elec_feb;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',v_prop_id,'PROPERTY','WIFI',            90,'Batelco Fibre — building internet infrastructure',false,false,v_vendor_wifi,NOW()) RETURNING id INTO e_wifi_feb;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',v_prop_id,'PROPERTY','CLEANER',        380,'Cleaning staff — 2 full-time (common areas & grounds)',false,false,v_vendor_clean,NOW()) RETURNING id INTO e_clean_feb;

INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',v_prop_id,'PROPERTY','MANAGEMENT_FEE',650,'Monthly management fee — Al Seef Property Management',false,false,v_vendor_mgmt,NOW()) RETURNING id INTO e_mgmt_mar;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',v_prop_id,'PROPERTY','WATER',         180,'BEWA — building water supply',false,false,v_vendor_water,NOW()) RETURNING id INTO e_water_mar;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',v_prop_id,'PROPERTY','ELECTRICITY',   220,'MEW — common areas, lifts & car park lighting',false,false,v_vendor_elec,NOW()) RETURNING id INTO e_elec_mar;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',v_prop_id,'PROPERTY','WIFI',            90,'Batelco Fibre — building internet infrastructure',false,false,v_vendor_wifi,NOW()) RETURNING id INTO e_wifi_mar;
INSERT INTO "ExpenseEntry" (id,date,"propertyId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',v_prop_id,'PROPERTY','CLEANER',        380,'Cleaning staff — 2 full-time (common areas & grounds)',false,false,v_vendor_clean,NOW()) RETURNING id INTO e_clean_mar;

-- Ad-hoc unit-level expenses
INSERT INTO "ExpenseEntry" (id,date,"unitId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-01-01',u103,'UNIT','MAINTENANCE',  120,'Plumbing repair — bathroom tap replacement', false,false,v_vendor_plumb,NOW()) RETURNING id INTO e_maint_103;
INSERT INTO "ExpenseEntry" (id,date,"unitId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u201,'UNIT','MAINTENANCE',   85,'Electrical fault — kitchen circuit breaker', false,false,v_vendor_tech,NOW()) RETURNING id INTO e_maint_201;
INSERT INTO "ExpenseEntry" (id,date,"unitId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-02-01',u404,'UNIT','MAINTENANCE',  310,'A/C compressor replacement — master bedroom', true, false,v_vendor_tech,NOW()) RETURNING id INTO e_maint_404;
INSERT INTO "ExpenseEntry" (id,date,"unitId",scope,category,amount,description,"isSunkCost","paidFromPettyCash","vendorId","createdAt") VALUES (gen_random_uuid()::text,'2026-03-01',u302,'UNIT','REINSTATEMENT',420,'Deep clean & repainting — post-notice unit',  true, false,v_vendor_clean,NOW()) RETURNING id INTO e_reinstate_302;

-- VAT line items (10% on all vendor-payable expenses)
-- BEWA (water) and MEW (electricity) are government utilities — VAT applicable in Bahrain
-- Management fee, cleaning, wifi, contractors — all standard 10% VAT
INSERT INTO "ExpenseLineItem" (id,"expenseId",category,description,amount,"isVatable","taxConfigId","taxRate","taxAmount","taxType","paymentStatus","amountPaid","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,e_mgmt_jan,   'LABOUR','Management fee — January 2026',  650,true,v_vat_id,0.10,65, 'ADDITIVE','PAID',715,NOW(),NOW()),
  (gen_random_uuid()::text,e_water_jan,  'MATERIAL','Water charges — January 2026', 180,true,v_vat_id,0.10,18, 'ADDITIVE','PAID',198,NOW(),NOW()),
  (gen_random_uuid()::text,e_elec_jan,   'MATERIAL','Electricity charges — January 2026',220,true,v_vat_id,0.10,22,'ADDITIVE','PAID',242,NOW(),NOW()),
  (gen_random_uuid()::text,e_wifi_jan,   'LABOUR','Batelco fibre — January 2026',    90,true,v_vat_id,0.10,9,  'ADDITIVE','PAID',99, NOW(),NOW()),
  (gen_random_uuid()::text,e_clean_jan,  'LABOUR','Cleaning staff — January 2026',  380,true,v_vat_id,0.10,38, 'ADDITIVE','PAID',418,NOW(),NOW()),

  (gen_random_uuid()::text,e_mgmt_feb,   'LABOUR','Management fee — February 2026', 650,true,v_vat_id,0.10,65, 'ADDITIVE','PAID',715,NOW(),NOW()),
  (gen_random_uuid()::text,e_water_feb,  'MATERIAL','Water charges — February 2026',180,true,v_vat_id,0.10,18, 'ADDITIVE','PAID',198,NOW(),NOW()),
  (gen_random_uuid()::text,e_elec_feb,   'MATERIAL','Electricity charges — February 2026',220,true,v_vat_id,0.10,22,'ADDITIVE','PAID',242,NOW(),NOW()),
  (gen_random_uuid()::text,e_wifi_feb,   'LABOUR','Batelco fibre — February 2026',   90,true,v_vat_id,0.10,9,  'ADDITIVE','PAID',99, NOW(),NOW()),
  (gen_random_uuid()::text,e_clean_feb,  'LABOUR','Cleaning staff — February 2026', 380,true,v_vat_id,0.10,38, 'ADDITIVE','PAID',418,NOW(),NOW()),

  (gen_random_uuid()::text,e_mgmt_mar,   'LABOUR','Management fee — March 2026',    650,true,v_vat_id,0.10,65, 'ADDITIVE','PAID',715,NOW(),NOW()),
  (gen_random_uuid()::text,e_water_mar,  'MATERIAL','Water charges — March 2026',   180,true,v_vat_id,0.10,18, 'ADDITIVE','PAID',198,NOW(),NOW()),
  (gen_random_uuid()::text,e_elec_mar,   'MATERIAL','Electricity charges — March 2026',220,true,v_vat_id,0.10,22,'ADDITIVE','PAID',242,NOW(),NOW()),
  (gen_random_uuid()::text,e_wifi_mar,   'LABOUR','Batelco fibre — March 2026',      90,true,v_vat_id,0.10,9,  'ADDITIVE','PAID',99, NOW(),NOW()),
  (gen_random_uuid()::text,e_clean_mar,  'LABOUR','Cleaning staff — March 2026',    380,true,v_vat_id,0.10,38, 'ADDITIVE','PAID',418,NOW(),NOW()),

  (gen_random_uuid()::text,e_maint_103,  'LABOUR','Plumbing repair — unit 103',     120,true,v_vat_id,0.10,12, 'ADDITIVE','PAID',132,NOW(),NOW()),
  (gen_random_uuid()::text,e_maint_201,  'LABOUR','Electrical repair — unit 201',    85,true,v_vat_id,0.10,8.5,'ADDITIVE','PAID',93.5,NOW(),NOW()),
  (gen_random_uuid()::text,e_maint_404,  'MATERIAL','A/C compressor — unit 404',    310,true,v_vat_id,0.10,31, 'ADDITIVE','PAID',341,NOW(),NOW()),
  (gen_random_uuid()::text,e_reinstate_302,'LABOUR','Deep clean & repaint — unit 302',420,true,v_vat_id,0.10,42,'ADDITIVE','PAID',462,NOW(),NOW());

RAISE NOTICE 'Expenses and VAT line items created';

-- =============================================================
-- PETTY CASH
-- =============================================================
INSERT INTO "PettyCash" (id,date,type,amount,description,"propertyId","createdAt") VALUES
  (gen_random_uuid()::text,'2026-01-01','IN', 500,'Monthly petty cash top-up — Khalid Al-Dosari',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-02-01','IN', 500,'Monthly petty cash top-up — Khalid Al-Dosari',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-03-01','IN', 500,'Monthly petty cash top-up — Khalid Al-Dosari',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-01-08','OUT', 45,'Lightbulbs & electrical fittings — lobby & corridors',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-01-14','OUT', 80,'Emergency plumber call-out — unit 103 overflow',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-01-22','OUT', 15,'Stationery & notice printing',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-02-06','OUT', 55,'Cleaning materials & detergents restock',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-02-13','OUT', 90,'Emergency electrician — lift control panel',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-02-20','OUT', 20,'Replacement padlocks & keys — car park gate',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-03-09','OUT', 40,'Garden tools & soil conditioner — rooftop terrace',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-03-17','OUT', 65,'Minor plumbing repairs — common area bathrooms',v_prop_id,NOW()),
  (gen_random_uuid()::text,'2026-03-25','OUT', 12,'Postage & courier — lease correspondence',v_prop_id,NOW());

RAISE NOTICE 'Petty cash created';

-- =============================================================
-- INSURANCE
-- =============================================================
INSERT INTO "InsurancePolicy" (id,"propertyId",type,insurer,"policyNumber","startDate","endDate","premiumAmount","premiumFrequency","coverageAmount","brokerName","brokerContact",notes,"createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,v_prop_id,'BUILDING','Gulf Union Insurance','GUI-BLD-2025-1142','2025-01-01','2025-12-31',2400,'ANNUALLY',2000000,'Bahrain Insurance Brokers','+973 1700 4455','Full building structure coverage. Renewal due January 2026.',NOW(),NOW()),
  (gen_random_uuid()::text,v_prop_id,'PUBLIC_LIABILITY','AXA Gulf','AXA-PL-2025-0881','2025-06-01','2026-05-31',480,'BIANNUALLY',500000,'Bahrain Insurance Brokers','+973 1700 4455','Covers third-party injury and property damage claims.',NOW(),NOW());

RAISE NOTICE '2 insurance policies created';

-- =============================================================
-- ASSETS + MAINTENANCE SCHEDULES
-- =============================================================
INSERT INTO "Asset" (id,"propertyId",name,category,"serialNumber","purchaseDate","purchaseCost","warrantyExpiry","serviceProvider","serviceContact",notes,"createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_prop_id,'Cummins Standby Generator','GENERATOR','CUM-C150D5-00341','2021-04-10',8500,'2024-04-10','Cummins Bahrain','+973 1770 0011','150 kVA Cummins diesel generator. Powers common areas and lifts during MEW outages.',NOW(),NOW())
RETURNING id INTO v_asset_id;
INSERT INTO "AssetMaintenanceSchedule" (id,"assetId","propertyId","taskName",frequency,"nextDue","isActive","estimatedCost","createdAt","updatedAt") VALUES (gen_random_uuid()::text,v_asset_id,v_prop_id,'Monthly Generator Service Check','MONTHLY','2026-04-10',true,280,NOW(),NOW());

INSERT INTO "Asset" (id,"propertyId",name,category,"serialNumber","purchaseDate","purchaseCost","warrantyExpiry","serviceProvider","serviceContact",notes,"createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_prop_id,'ThyssenKrupp Passenger Lift','LIFT','TK-MRL-2020-BH-004','2020-09-01',14000,NULL,'ThyssenKrupp Elevator Bahrain','+973 1721 5566','10-person machine-room-less lift. Annual statutory inspection required.',NOW(),NOW())
RETURNING id INTO v_asset_id;
INSERT INTO "AssetMaintenanceSchedule" (id,"assetId","propertyId","taskName",frequency,"nextDue","isActive","estimatedCost","createdAt","updatedAt") VALUES (gen_random_uuid()::text,v_asset_id,v_prop_id,'Quarterly Lift Servicing','QUARTERLY','2026-04-01',true,200,NOW(),NOW());

INSERT INTO "Asset" (id,"propertyId",name,category,"serialNumber","purchaseDate","purchaseCost","warrantyExpiry","serviceProvider","serviceContact",notes,"createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_prop_id,'Grundfos Water Pump','PLUMBING','GRF-CM5-2023-0055','2023-02-14',950,'2025-02-14','Aqua Systems Bahrain','+973 1733 8899','Supplies pressurised water to all floors from rooftop tanks.',NOW(),NOW())
RETURNING id INTO v_asset_id;
INSERT INTO "AssetMaintenanceSchedule" (id,"assetId","propertyId","taskName",frequency,"nextDue","isActive","estimatedCost","createdAt","updatedAt") VALUES (gen_random_uuid()::text,v_asset_id,v_prop_id,'Biannual Pump Inspection','BIANNUALLY','2026-06-14',true,150,NOW(),NOW());

INSERT INTO "Asset" (id,"propertyId",name,category,"serialNumber","purchaseDate","purchaseCost","warrantyExpiry","serviceProvider","serviceContact",notes,"createdAt","updatedAt")
VALUES (gen_random_uuid()::text,v_prop_id,'Hikvision 16-Channel CCTV System','SECURITY','HIK-DS-16CH-2022','2022-07-20',1800,'2025-07-20','Techno Systems Bahrain','+973 1744 6677','16 cameras covering entrance, car park, corridors, and rooftop. 30-day storage.',NOW(),NOW())
RETURNING id INTO v_asset_id;
INSERT INTO "AssetMaintenanceSchedule" (id,"assetId","propertyId","taskName",frequency,"nextDue","isActive","estimatedCost","createdAt","updatedAt") VALUES (gen_random_uuid()::text,v_asset_id,v_prop_id,'Annual CCTV Review & Maintenance','ANNUALLY','2026-07-20',true,250,NOW(),NOW());

RAISE NOTICE '4 assets with maintenance schedules created';

-- =============================================================
-- RECURRING EXPENSES
-- =============================================================
-- Non-asset recurring expenses (security & landscaping)
INSERT INTO "RecurringExpense" (id,description,category,amount,scope,"propertyId","vendorId",frequency,"nextDueDate","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Monthly Security Patrol — G4S Bahrain','CLEANER',350,'PROPERTY',v_prop_id,v_vendor_clean,'MONTHLY','2026-04-01',true,NOW(),NOW());

INSERT INTO "RecurringExpense" (id,description,category,amount,scope,"propertyId","vendorId",frequency,"nextDueDate","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Landscaping & Garden Maintenance','CLEANER',120,'PROPERTY',v_prop_id,v_vendor_clean,'MONTHLY','2026-04-01',true,NOW(),NOW());

-- Asset-linked recurring expenses (captured for schedule linkage)
INSERT INTO "RecurringExpense" (id,description,category,amount,scope,"propertyId","vendorId",frequency,"nextDueDate","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Quarterly Generator Service — Gulf Technical Services','MAINTENANCE',280,'PROPERTY',v_prop_id,v_vendor_tech,'QUARTERLY','2026-06-01',true,NOW(),NOW())
RETURNING id INTO v_recur_gen;

INSERT INTO "RecurringExpense" (id,description,category,amount,scope,"propertyId","vendorId",frequency,"nextDueDate","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Annual Lift Servicing Contract — ThyssenKrupp','MAINTENANCE',800,'PROPERTY',v_prop_id,v_vendor_lift,'ANNUAL','2026-12-01',true,NOW(),NOW())
RETURNING id INTO v_recur_lift;

INSERT INTO "RecurringExpense" (id,description,category,amount,scope,"propertyId","vendorId",frequency,"nextDueDate","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Biannual Water Pump Inspection — Aqua Systems','MAINTENANCE',150,'PROPERTY',v_prop_id,v_vendor_pump,'BIANNUAL','2026-06-14',true,NOW(),NOW())
RETURNING id INTO v_recur_pump;

INSERT INTO "RecurringExpense" (id,description,category,amount,scope,"propertyId","vendorId",frequency,"nextDueDate","isActive","createdAt","updatedAt")
VALUES (gen_random_uuid()::text,'Annual CCTV Review & Maintenance — Techno Systems','MAINTENANCE',250,'PROPERTY',v_prop_id,v_vendor_cctv,'ANNUAL','2026-07-20',true,NOW(),NOW())
RETURNING id INTO v_recur_cctv;

-- Link asset maintenance schedules to their recurring expenses
UPDATE "AssetMaintenanceSchedule" SET "recurringExpenseId" = v_recur_gen  WHERE "propertyId" = v_prop_id AND "taskName" LIKE '%Generator%';
UPDATE "AssetMaintenanceSchedule" SET "recurringExpenseId" = v_recur_lift WHERE "propertyId" = v_prop_id AND "taskName" LIKE '%Lift%';
UPDATE "AssetMaintenanceSchedule" SET "recurringExpenseId" = v_recur_pump WHERE "propertyId" = v_prop_id AND "taskName" LIKE '%Pump%';
UPDATE "AssetMaintenanceSchedule" SET "recurringExpenseId" = v_recur_cctv WHERE "propertyId" = v_prop_id AND "taskName" LIKE '%CCTV%';

RAISE NOTICE '6 recurring expenses created, 4 linked to asset schedules';

-- =============================================================
-- ARREARS CASES
-- =============================================================
INSERT INTO "ArrearsCase" (id,"tenantId","propertyId",stage,"amountOwed",notes,"createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,t102,v_prop_id,'INFORMAL_REMINDER',800,
   'Tenant has not paid rent for February and March 2026 (BD 400 × 2 months). Called on 15 March — promised to clear by end of month. Follow up required.',NOW(),NOW()),
  (gen_random_uuid()::text,t304,v_prop_id,'INFORMAL_REMINDER',595,
   'March 2026 rent outstanding (BD 520 + BD 75 service charge). SMS reminder sent 10 March. Tenant has given notice — chase payment before lease-end.',NOW(),NOW());

RAISE NOTICE '2 arrears cases created';

-- =============================================================
-- MAINTENANCE JOBS
-- =============================================================
-- Manager-logged jobs (various statuses)
INSERT INTO "MaintenanceJob" (id,"propertyId","unitId",title,description,category,priority,status,"reportedBy","assignedTo","reportedDate","scheduledDate","completedDate",cost,notes,"vendorId","isEmergency","submittedViaPortal","createdAt","updatedAt") VALUES

-- DONE jobs
(gen_random_uuid()::text,v_prop_id,u103,'Bathroom tap replacement','Cold water tap in main bathroom dripping constantly. Replaced tap cartridge and resealed fittings.','PLUMBING','MEDIUM','DONE','Sara Al-Habsi','Al Baraka Plumbing','2026-01-05','2026-01-07','2026-01-08',120,'Job completed satisfactorily. Tenant confirmed resolved.',v_vendor_plumb,false,false,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,u201,'Kitchen circuit breaker fault','Intermittent tripping of kitchen RCD. Replaced faulty breaker and tested all circuits.','ELECTRICAL','HIGH','DONE','Sara Al-Habsi','Gulf Technical Services','2026-02-03','2026-02-05','2026-02-06',85,'Circuit board inspected — no further faults found.',v_vendor_tech,false,false,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,u404,'A/C compressor replacement','Master bedroom A/C unit failed — compressor seized. Full unit replacement completed.','APPLIANCE','URGENT','DONE','Sara Al-Habsi','Gulf Technical Services','2026-02-10','2026-02-12','2026-02-14',310,'Sunk cost — capital replacement. New unit under 2-year warranty.',v_vendor_tech,false,false,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,u302,'Deep clean and repainting','End-of-notice deep clean and full repaint of unit following Deepak & Meera Pillai giving notice.','PAINTING','MEDIUM','DONE','Sara Al-Habsi','Al Noor Facility Management','2026-03-02','2026-03-08','2026-03-12',420,'Unit fully reinstated. Ready for re-letting.',v_vendor_clean,false,false,NOW(),NOW()),

-- IN_PROGRESS jobs
(gen_random_uuid()::text,v_prop_id,u205,'Balcony waterproofing — crack repair','Hairline crack along balcony parapet wall. Water ingress reported after rain. Contractor assessed — waterproofing treatment in progress.','STRUCTURAL','HIGH','IN_PROGRESS','Sara Al-Habsi','Gulf Technical Services','2026-03-20','2026-04-05',NULL,NULL,'Awaiting final coat to cure before sign-off.',v_vendor_tech,false,false,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,NULL,'Lobby CCTV camera 4 — offline','Camera 4 covering the main entrance has been offline since 28 March. Techno Systems attending to replace housing and reconnect feed.','SECURITY','HIGH','IN_PROGRESS','Sara Al-Habsi','Techno Systems Bahrain','2026-03-28','2026-04-08',NULL,NULL,'Replacement part ordered. ETA 3 business days.',v_vendor_cctv,false,false,NOW(),NOW()),

-- OPEN jobs
(gen_random_uuid()::text,v_prop_id,u401,'Bedroom door lock stiff','Door lock on master bedroom has become difficult to operate. Tenant reports key gets stuck.','OTHER','LOW','OPEN','Sara Al-Habsi',NULL,'2026-04-02',NULL,NULL,NULL,NULL,v_vendor_plumb,false,false,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,NULL,'Car park gate — slow closure','Automated car park gate taking over 30 seconds to close. Spring tension needs adjustment.','OTHER','LOW','OPEN','Sara Al-Habsi',NULL,'2026-04-07',NULL,NULL,NULL,NULL,NULL,false,false,NOW(),NOW()),

-- Emergency job (completed)
(gen_random_uuid()::text,v_prop_id,u103,'Emergency: water overflow — unit 103','Overflow from washing machine hose caused flooding of bathroom and hallway. Emergency plumber called out same day.','PLUMBING','URGENT','DONE','Sara Al-Habsi','Al Baraka Plumbing','2026-01-14','2026-01-14','2026-01-14',80,'Hose replaced and floor dried. No damage to unit below. Paid from petty cash.',v_vendor_plumb,true,false,NOW(),NOW()),

-- AWAITING_PARTS
(gen_random_uuid()::text,v_prop_id,u302,'Lift call button — floor 3 unresponsive','Floor 3 call button for passenger lift not responding. ThyssenKrupp engineer inspected — control board component needs replacement.','ELECTRICAL','MEDIUM','AWAITING_PARTS','Sara Al-Habsi','ThyssenKrupp Elevator Bahrain','2026-03-25','2026-04-03',NULL,NULL,'Part ordered from Germany. ETA 2 weeks.',v_vendor_lift,false,false,NOW(),NOW());

-- TENANT PORTAL REQUESTS (submittedViaPortal = true)
INSERT INTO "MaintenanceJob" (id,"propertyId","unitId",title,description,category,priority,status,"reportedBy","assignedTo","reportedDate","scheduledDate","completedDate",cost,notes,"vendorId","isEmergency","submittedViaPortal","createdAt","updatedAt") VALUES

(gen_random_uuid()::text,v_prop_id,u102,'Hot water not reaching shower','Hot water takes over 5 minutes to reach the shower in the main bathroom. Cold water fine. Please investigate.','PLUMBING','MEDIUM','OPEN','Priya Sharma',NULL,'2026-04-01',NULL,NULL,NULL,NULL,v_vendor_plumb,false,true,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,u203,'Intercom not working','Our intercom handset is completely dead — cannot receive calls from the lobby. Guests cannot reach us.','ELECTRICAL','MEDIUM','IN_PROGRESS','Nasser Al-Qasimi','Gulf Technical Services','2026-03-18','2026-03-22',NULL,NULL,'Handset confirmed faulty. Replacement unit being sourced.',v_vendor_tech,false,true,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,u305,'Ceiling light flickering — living room','Living room ceiling light flickers intermittently, especially when other appliances are on. Possible loose connection.','ELECTRICAL','LOW','OPEN','Khalid Al-Rumaihi',NULL,'2026-04-05',NULL,NULL,NULL,NULL,NULL,false,true,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,u404,'Extractor fan very noisy','Kitchen extractor fan making loud rattling noise when on. Gets worse at higher speed settings.','APPLIANCE','LOW','DONE','Abdullah Al-Maktoum','Gulf Technical Services','2026-03-10','2026-03-13','2026-03-14',NULL,'Fan blade loose — tightened and rebalanced. No cost.',v_vendor_tech,false,true,NOW(),NOW()),

(gen_random_uuid()::text,v_prop_id,u101,'Pest sighting — cockroach in kitchen','Found two cockroaches near the kitchen sink. Please arrange pest control treatment as soon as possible.','PEST_CONTROL','HIGH','OPEN','Ahmed Al-Dosari',NULL,'2026-04-08',NULL,NULL,NULL,NULL,NULL,false,true,NOW(),NOW());

-- Link completed jobs to their matching expense entries
UPDATE "MaintenanceJob" SET "expenseId" = (
  SELECT id FROM "ExpenseEntry" WHERE "unitId" = u103 AND category = 'MAINTENANCE' AND amount = 120 LIMIT 1
) WHERE "propertyId" = v_prop_id AND title LIKE '%tap replacement%';

UPDATE "MaintenanceJob" SET "expenseId" = (
  SELECT id FROM "ExpenseEntry" WHERE "unitId" = u201 AND category = 'MAINTENANCE' AND amount = 85 LIMIT 1
) WHERE "propertyId" = v_prop_id AND title LIKE '%circuit breaker%';

UPDATE "MaintenanceJob" SET "expenseId" = (
  SELECT id FROM "ExpenseEntry" WHERE "unitId" = u404 AND category = 'MAINTENANCE' AND amount = 310 LIMIT 1
) WHERE "propertyId" = v_prop_id AND title LIKE '%compressor%';

UPDATE "MaintenanceJob" SET "expenseId" = (
  SELECT id FROM "ExpenseEntry" WHERE "unitId" = u302 AND category = 'REINSTATEMENT' AND amount = 420 LIMIT 1
) WHERE "propertyId" = v_prop_id AND title LIKE '%repaint%';

RAISE NOTICE '15 maintenance jobs created (10 manager-logged, 5 tenant requests), 4 linked to expense entries';

RAISE NOTICE '';
RAISE NOTICE '✅ Al Seef Residences seeded successfully!';
RAISE NOTICE '   Owner login:   owner@alseef.bh  /  demo123';
RAISE NOTICE '   Manager login: manager@alseef.bh /  demo123';
RAISE NOTICE '   20 units · 20 tenants · 3 months (Jan–Mar 2026) · BHD';

END $$;
