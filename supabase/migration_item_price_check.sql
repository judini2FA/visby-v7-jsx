-- Defense-in-depth from the 7.3 offers adversarial verify: an item's price must be positive.
-- A corrupted non-positive price_usdc could sign-flip the sol-pay amount check; the app never writes
-- one, but this makes it impossible at the database. NOT VALID enforces every new/updated row without
-- validating (and potentially failing on) any legacy row; run VALIDATE later once data is confirmed clean.
alter table items
  add constraint items_price_usdc_positive
  check (price_usdc is null or price_usdc > 0) not valid;
