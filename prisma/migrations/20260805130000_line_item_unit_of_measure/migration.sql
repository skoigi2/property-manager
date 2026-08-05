-- Optional unit of measurement on expense line items — purely descriptive
-- context for the qty × rate breakdown (e.g. 3 KG × 800). Never enters any
-- calculation; amount stays the net source of truth. unitOther is the
-- free-text escape hatch when unit = OTHER (mirrors AssetCategory +
-- categoryOther). Both columns nullable — existing rows keep working null.

CREATE TYPE "UnitOfMeasure" AS ENUM ('UNIT','ITEM','SET','PAIR','KG','G','TONNE','LITRE','ML','M','MM','M2','HOUR','DAY','TRIP','OTHER');

ALTER TABLE "ExpenseLineItem" ADD COLUMN "unit" "UnitOfMeasure";
ALTER TABLE "ExpenseLineItem" ADD COLUMN "unitOther" TEXT;
