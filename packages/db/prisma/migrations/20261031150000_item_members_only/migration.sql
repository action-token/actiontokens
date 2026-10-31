-- Who can buy an item, kept apart from draft/published: everyone, members
-- (fans holding the artist's lowest tier of fan tokens) or one tier (tierId).
ALTER TABLE "items" ADD COLUMN "membersOnly" BOOLEAN NOT NULL DEFAULT false;
