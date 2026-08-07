-- ============================================================
-- Demo tenants — shared public catalog (brands/categories/products)
--
-- catalog.brands / catalog.categories / catalog.products are global
-- (is_public = true), not per-tenant, so they're seeded once here and
-- linked into each industry tenant by 01..05_*.sql via master_sku/slug
-- lookups (no hardcoded catalog UUIDs — catalog.* has no unique
-- constraint on slug/master_sku at the DB level, only plain indexes,
-- so idempotency here is via NOT EXISTS guards, not ON CONFLICT).
--
-- Additive only — never truncates. Safe to re-run.
-- Run BEFORE 01_electricals.sql .. 05_cosmetics_salon.sql.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Categories
-- ──────────────────────────────────────────────────────────────

INSERT INTO catalog.categories (name, slug, is_public)
SELECT v.name, v.slug, true
FROM (VALUES
  -- Electricals
  ('Wires & Cables', 'wires-cables'),
  ('MCB & Switchgear', 'mcb-switchgear'),
  ('Modular Switches & Sockets', 'modular-switches-sockets'),
  ('Fans', 'fans'),
  ('Lighting & LED', 'lighting-led'),
  ('Distribution Boards', 'distribution-boards'),
  -- Mobiles & Electronics (smartphones/accessories/audio already exist from techwave seed; add small-appliances)
  ('Small Appliances', 'small-appliances'),
  -- Automotive Spares
  ('Filters', 'filters'),
  ('Brake Parts', 'brake-parts'),
  ('Batteries', 'batteries'),
  ('Auto Electricals', 'auto-electricals'),
  ('Bearings', 'bearings'),
  ('Clutch Plates', 'clutch-plates'),
  ('Body Parts', 'body-parts'),
  -- Hardware & Building Materials
  ('Paints', 'paints'),
  ('Sanitaryware', 'sanitaryware'),
  ('Fasteners', 'fasteners'),
  ('Adhesives & Sealants', 'adhesives-sealants'),
  ('Hand & Power Tools', 'hand-power-tools'),
  ('Plumbing', 'plumbing'),
  -- Cosmetics & Salon Supply
  ('Hair Color', 'hair-color'),
  ('Skincare', 'skincare'),
  ('Makeup', 'makeup'),
  ('Haircare', 'haircare'),
  ('Salon Consumables', 'salon-consumables')
) AS v(name, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM catalog.categories c WHERE c.slug = v.slug AND c.is_public = true
);

-- ──────────────────────────────────────────────────────────────
-- Brands
-- ──────────────────────────────────────────────────────────────

INSERT INTO catalog.brands (name, slug, is_public)
SELECT v.name, v.slug, true
FROM (VALUES
  -- Electricals
  ('Polycab', 'polycab'),
  ('Havells', 'havells'),
  ('Anchor', 'anchor'),
  -- Mobiles & Electronics (Samsung/Xiaomi/Apple already exist from techwave seed)
  ('Vivo', 'vivo'),
  ('Motorola', 'motorola'),
  ('Boat', 'boat'),
  -- Automotive Spares
  ('Bosch', 'bosch'),
  ('Rane', 'rane'),
  ('Exide', 'exide'),
  ('Local Make', 'local-make'),
  -- Hardware & Building Materials
  ('Asian Paints', 'asian-paints'),
  ('CERA', 'cera'),
  ('Pidilite', 'pidilite'),
  ('Local Unbranded', 'local-unbranded'),
  -- Cosmetics & Salon Supply
  ('L''Oreal Professionnel', 'loreal-professionnel'),
  ('Lakme', 'lakme'),
  ('VLCC', 'vlcc')
) AS v(name, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM catalog.brands b WHERE b.slug = v.slug AND b.is_public = true
);

-- ──────────────────────────────────────────────────────────────
-- Products
-- master_sku is the join key used by 01..05_*.sql (app.tenant_products.internal_sku
-- + master_product_id lookup). gst_rate defaults to 18 (standard India GST slab)
-- for all rows here — not spec-critical for a demo, kept uniform like seed.sql.
-- ──────────────────────────────────────────────────────────────

INSERT INTO catalog.products (brand_id, category_id, master_sku, name, description, default_uom, gst_rate, is_public)
SELECT b.id, c.id, v.master_sku, v.name, v.description, 'unit', 18, true
FROM (VALUES
  -- ── Electricals ──────────────────────────────────────────
  ('polycab', 'wires-cables',              'ELE-PLC-WIRE15',  'FR Wire 1.5 sq mm (90m coil)',   'Polycab FR Wire 1.5 sq mm, 90m coil'),
  ('polycab', 'wires-cables',              'ELE-PLC-WIRE25',  'FR Wire 2.5 sq mm (90m coil)',   'Polycab FR Wire 2.5 sq mm, 90m coil'),
  ('polycab', 'wires-cables',              'ELE-PLC-WIRE40',  'FR Wire 4 sq mm (90m coil)',     'Polycab FR Wire 4 sq mm, 90m coil'),
  ('havells', 'mcb-switchgear',            'ELE-HAV-MCB16C',  'MCB 16A C-curve SP',             'Havells MCB 16A C-curve, single pole'),
  ('havells', 'mcb-switchgear',            'ELE-HAV-MCB32C',  'MCB 32A C-curve SP',             'Havells MCB 32A C-curve, single pole'),
  ('havells', 'mcb-switchgear',            'ELE-HAV-RCCB25',  'RCCB 25A 30mA DP',               'Havells RCCB 25A 30mA, double pole'),
  ('havells', 'distribution-boards',       'ELE-HAV-DB8SPN',  '8-way SPN Distribution Board',   'Havells 8-way SPN distribution board'),
  ('anchor',  'modular-switches-sockets',  'ELE-ANC-SW6A10',  'Modular Switch 6A (10-pack)',    'Anchor modular switch 6A, pack of 10'),
  ('anchor',  'modular-switches-sockets',  'ELE-ANC-SOC16A',  'Modular Switch 16A Socket',      'Anchor modular switch 16A socket'),
  ('havells', 'fans',                      'ELE-HAV-FAN1200', 'Ceiling Fan 1200mm',             'Havells ceiling fan, 1200mm sweep'),
  ('havells', 'lighting-led',              'ELE-HAV-LED9W10', 'LED Bulb 9W (pack of 10)',       'Havells LED bulb 9W, pack of 10'),
  ('polycab', 'lighting-led',              'ELE-PLC-BAT20W',  'LED Batten 20W',                 'Polycab LED batten 20W'),
  ('havells', 'fans',                      'ELE-HAV-EXH150',  'Exhaust Fan 150mm',              'Havells exhaust fan, 150mm'),
  ('anchor',  'lighting-led',              'ELE-ANC-ROSE',    'Ceiling Rose + Connector',       'Anchor ceiling rose with connector'),
  ('havells', 'mcb-switchgear',            'ELE-HAV-ELCB40',  'ELCB 40A',                       'Havells ELCB 40A'),

  -- ── Mobiles & Electronics ────────────────────────────────
  ('samsung', 'smartphones',      'MOB-SAM-A16-128',  'Galaxy A16 5G (128GB)',       'Samsung Galaxy A16 5G, 128GB'),
  ('samsung', 'smartphones',      'MOB-SAM-M35-128',  'Galaxy M35 5G (128GB)',       'Samsung Galaxy M35 5G, 128GB'),
  ('vivo',    'smartphones',      'MOB-VIV-Y29-128',  'Y29 5G (128GB)',              'Vivo Y29 5G, 128GB'),
  ('vivo',    'smartphones',      'MOB-VIV-T4-128',   'T4 5G (128GB)',               'Vivo T4 5G, 128GB'),
  ('xiaomi',  'smartphones',      'MOB-XMI-14C-128',  'Redmi 14C (128GB)',           'Xiaomi Redmi 14C, 128GB'),
  ('xiaomi',  'smartphones',      'MOB-XMI-M7P-5G',   'POCO M7 Pro 5G',              'Xiaomi POCO M7 Pro 5G'),
  ('motorola','smartphones',      'MOB-MOT-E60F',     'Edge 60 Fusion',              'Motorola Edge 60 Fusion'),
  ('apple',   'accessories',      'MOB-APL-CHG20W',   '20W USB-C Charger',           'Apple 20W USB-C power adapter (MRP-protected)'),
  ('samsung', 'accessories',      'MOB-SAM-CHG25W',   '25W Fast Charger',            'Samsung 25W fast charger'),
  ('boat',    'audio',            'MOB-BOT-RKZ450',   'Rockerz 450 Bluetooth Headset','Boat Rockerz 450 Bluetooth headset'),
  ('boat',    'audio',            'MOB-BOT-AD141',    'Airdopes 141',                'Boat Airdopes 141'),
  ('vivo',    'accessories',      'MOB-VIV-GLASS',    'Tempered Glass (universal)',  'Vivo tempered glass, universal fit'),
  ('xiaomi',  'accessories',      'MOB-XMI-PB10K',    'Power Bank 10000mAh',         'Xiaomi power bank, 10000mAh'),
  ('samsung', 'accessories',      'MOB-SAM-USBC1M',   'Type-C Cable 1m',             'Samsung Type-C cable, 1m'),
  ('samsung', 'accessories',      'MOB-GEN-CASE',     'Silicone Case (assorted)',    'Generic silicone case, assorted models'),

  -- ── Automotive Spares ────────────────────────────────────
  ('bosch',      'filters',           'AUT-BSH-OILF-SWF', 'Oil Filter (Maruti Swift/Baleno)',   'Bosch oil filter, petrol fitment'),
  ('bosch',      'filters',           'AUT-BSH-AIRF-I20',  'Air Filter (Hyundai i20)',           'Bosch air filter, petrol/diesel fitment'),
  ('bosch',      'auto-electricals',  'AUT-BSH-PLUG4',     'Spark Plug (set of 4)',              'Bosch spark plug set, multi-model'),
  ('rane',       'brake-parts',       'AUT-RNE-BRK-WGR',   'Brake Pad Set Front (WagonR)',       'Rane brake pad set, Maruti WagonR front'),
  ('rane',       'brake-parts',       'AUT-RNE-BRK-CRT',   'Brake Pad Set Front (Creta)',        'Rane brake pad set, Hyundai Creta front'),
  ('rane',       'clutch-plates',     'AUT-RNE-CLU-BOL',   'Clutch Plate (Bolero)',              'Rane clutch plate, Mahindra Bolero'),
  ('exide',      'batteries',         'AUT-EXD-BAT35',     'Battery 35Ah',                       'Exide battery 35Ah, multi-model'),
  ('exide',      'batteries',         'AUT-EXD-BAT65',     'Battery 65Ah',                       'Exide battery 65Ah, SUV/UV'),
  ('bosch',      'filters',           'AUT-BSH-FUELF-ACE', 'Fuel Filter Diesel (Tata Ace)',      'Bosch diesel fuel filter, Tata Ace'),
  ('local-make', 'bearings',          'AUT-LOC-BRG-FRT',   'Wheel Bearing Front',                'Local-make wheel bearing, multi-model front'),
  ('local-make', 'body-parts',        'AUT-LOC-TAIL-ALT',  'Tail Light Assembly (Alto)',         'Local-make tail light assembly, Maruti Alto'),
  ('bosch',      'auto-electricals',  'AUT-BSH-WIPE20',    'Wiper Blade 20"',                    'Bosch wiper blade, 20 inch universal'),
  ('local-make', 'body-parts',        'AUT-LOC-RAD-BOL',   'Radiator (Bolero, Diesel)',          'Local-make radiator, Mahindra Bolero diesel'),
  ('rane',       'brake-parts',       'AUT-RNE-TIE-SWB',   'Steering Tie Rod End (Swift/Baleno)','Rane steering tie rod end'),
  ('local-make', 'bearings',          'AUT-LOC-ENGMT',     'Engine Mounting',                    'Local-make engine mounting, multi-model'),

  -- ── Hardware & Building Materials ────────────────────────
  ('asian-paints',    'paints',               'HRD-ASP-TRC20',  'Tractor Emulsion 20L (white)',  'Asian Paints Tractor Emulsion, 20L white'),
  ('asian-paints',    'paints',               'HRD-ASP-APX10',  'Apex Exterior 10L',              'Asian Paints Apex Exterior, 10L'),
  ('asian-paints',    'paints',               'HRD-ASP-PRM20',  'Primer 20L',                     'Asian Paints Primer, 20L'),
  ('cera',             'sanitaryware',         'HRD-CER-BASIN',  'Wash Basin (standard)',          'CERA wash basin, standard'),
  ('cera',             'sanitaryware',         'HRD-CER-WC1PC',  'One-piece WC',                   'CERA one-piece water closet'),
  ('cera',             'sanitaryware',         'HRD-CER-BATHFIT','Bath Fitting Set (basic)',       'CERA basic bath fitting set'),
  ('pidilite',         'adhesives-sealants',   'HRD-PID-FEV1KG', 'Fevicol SH 1kg',                 'Pidilite Fevicol SH, 1kg'),
  ('pidilite',         'adhesives-sealants',   'HRD-PID-DRFIX20','Dr. Fixit Waterproofing 20L',    'Pidilite Dr. Fixit waterproofing, 20L'),
  ('local-unbranded',  'fasteners',            'HRD-LOC-M8BOLT', 'M8 Bolts (box of 100)',          'Local-unbranded M8 bolts, box of 100'),
  ('local-unbranded',  'fasteners',            'HRD-LOC-HINGE',  'Door Hinges (pair)',             'Local-unbranded door hinges, pair'),
  ('local-unbranded',  'fasteners',            'HRD-LOC-NAIL3',  'Cement Nails 3" (1kg)',          'Local-unbranded cement nails, 3 inch, 1kg'),
  ('local-unbranded',  'fasteners',            'HRD-LOC-TWRB8',  'Tower Bolt 8"',                  'Local-unbranded tower bolt, 8 inch'),
  ('pidilite',         'adhesives-sealants',   'HRD-PID-MSEAL',  'M-Seal 100g',                    'Pidilite M-Seal, 100g'),
  ('local-unbranded',  'plumbing',             'HRD-LOC-PVC1IN', 'PVC Pipe 1" (3m)',               'Local-unbranded PVC pipe, 1 inch, 3m'),
  ('local-unbranded',  'hand-power-tools',     'HRD-LOC-TROWEL', 'Hand Trowel',                    'Local-unbranded hand trowel'),

  -- ── Cosmetics & Salon Supply ─────────────────────────────
  ('loreal-professionnel', 'hair-color',         'COS-LOR-MAJ63',   'Majirel Hair Color Shade 6.3 (50g)', 'L''Oreal Professionnel Majirel, shade 6.3, 50g'),
  ('loreal-professionnel', 'hair-color',         'COS-LOR-MAJ40',   'Majirel Hair Color Shade 4.0 (50g)', 'L''Oreal Professionnel Majirel, shade 4.0, 50g'),
  ('loreal-professionnel', 'haircare',           'COS-LOR-SEXP500', 'Serie Expert Shampoo 500ml',         'L''Oreal Professionnel Serie Expert shampoo, 500ml'),
  ('lakme',                 'makeup',             'COS-LAK-FOUND',   'Absolute Foundation (30ml)',         'Lakme Absolute Foundation, 30ml, 3 shades'),
  ('lakme',                 'makeup',             'COS-LAK-COMP',    '9 to 5 Compact',                     'Lakme 9 to 5 Compact, 4 shades'),
  ('lakme',                 'makeup',             'COS-LAK-KAJAL',   'Eyeconic Kajal (Black)',             'Lakme Eyeconic Kajal, black'),
  ('vlcc',                  'skincare',           'COS-VLC-FACGOLD', 'Facial Kit Gold (250g)',             'VLCC Facial Kit Gold, 250g'),
  ('vlcc',                  'skincare',           'COS-VLC-BLEACH',  'Bleach Cream (300g)',                'VLCC bleach cream, 300g'),
  ('vlcc',                  'skincare',           'COS-VLC-BODYPOL', 'Body Polishing Kit (500g)',          'VLCC body polishing kit, 500g'),
  ('loreal-professionnel', 'hair-color',         'COS-LOR-DEV1L',   'Developer/Peroxide 1L',              'L''Oreal Professionnel developer/peroxide, 1L, 10/20/30 vol'),
  ('lakme',                 'makeup',             'COS-LAK-NAIL',    'Nail Enamel (6 shades)',             'Lakme nail enamel, 6 shades'),
  ('vlcc',                  'salon-consumables',  'COS-VLC-STRIPS',  'Threading/Waxing Strips (100)',      'VLCC threading/waxing strips, pack of 100'),
  ('loreal-professionnel', 'haircare',           'COS-LOR-SERUM',   'Hair Serum (100ml)',                 'L''Oreal Professionnel hair serum, 100ml'),
  ('lakme',                 'skincare',           'COS-LAK-REMOVER', 'Makeup Remover (200ml)',             'Lakme makeup remover, 200ml'),
  ('vlcc',                  'salon-consumables',  'COS-VLC-GLOVES',  'Salon Gloves (box of 100)',          'VLCC salon gloves, box of 100')
) AS v(brand_slug, category_slug, master_sku, name, description)
JOIN catalog.brands b ON b.slug = v.brand_slug AND b.is_public = true
JOIN catalog.categories c ON c.slug = v.category_slug AND c.is_public = true
WHERE NOT EXISTS (
  SELECT 1 FROM catalog.products p WHERE p.master_sku = v.master_sku AND p.is_public = true
);

-- Verification
SELECT 'catalog_categories' AS metric, count(*)::text AS value FROM catalog.categories WHERE is_public = true
UNION ALL
SELECT 'catalog_brands', count(*)::text FROM catalog.brands WHERE is_public = true
UNION ALL
SELECT 'catalog_products', count(*)::text FROM catalog.products WHERE is_public = true;
