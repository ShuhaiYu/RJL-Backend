-- Migration: Email-Property M2M refactor
-- Applied directly via Neon MCP

CREATE TABLE "_EmailToProperty" (
    "A" INTEGER NOT NULL REFERENCES "EMAIL"("id") ON DELETE CASCADE,
    "B" INTEGER NOT NULL REFERENCES "PROPERTY"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "_EmailToProperty_AB_unique" ON "_EmailToProperty"("A", "B");
CREATE INDEX "_EmailToProperty_B_index" ON "_EmailToProperty"("B");

INSERT INTO "_EmailToProperty" ("A", "B")
SELECT id, property_id FROM "EMAIL" WHERE property_id IS NOT NULL;

ALTER TABLE "EMAIL" DROP CONSTRAINT "fk_property_email";
ALTER TABLE "EMAIL" DROP COLUMN "property_id";
