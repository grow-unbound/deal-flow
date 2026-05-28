// v2/data.jsx
// Extended listing-level data for the 6 module landing pages.
// Reuses BRANDS_DATA, PORTFOLIO, inrFmt, inrShort from brands/data.jsx.

/* =========================================================
   PRODUCTS  — 357 in real life; we render 8 representative rows
   ========================================================= */
const PRODUCTS_DATA = [
  { id: 'p1', name: 'Cabernet Sauvignon 2021',  brand: 'WineYard Vintners',   brandInitials: 'WY', brandHue: 'teal',  sku: 'VINO-CAB-750-2021', category: 'Red wine',   mrp: 2800, base: 2450, onHand: 96, daysCover: 14, units: 412, gmv: 1009400, growth: 12,  status: { label: 'In stock',   tone: 'success' } },
  { id: 'p2', name: 'Indian Pale Ale',           brand: 'Khanna Brewing Co.',  brandInitials: 'KH', brandHue: 'ember', sku: 'KHAN-IPA-330-006',  category: 'Beer',       mrp: 220,  base: 180,  onHand: 1240, daysCover: 22, units: 1840, gmv: 331200, growth: 18, status: { label: 'In stock',   tone: 'success' } },
  { id: 'p3', name: 'Chenin Blanc 2022',          brand: 'Maison Roussel',     brandInitials: 'MR', brandHue: 'cream', sku: 'MRSL-CB-750-2022',  category: 'White wine', mrp: 3200, base: 2640, onHand: 42, daysCover: 28, units: 98, gmv: 258720, growth: 4,  status: { label: 'In stock',   tone: 'success' } },
  { id: 'p4', name: 'Cabernet Franc Reserve',    brand: 'WineYard Vintners',   brandInitials: 'WY', brandHue: 'teal',  sku: 'VINO-CFR-750-2020', category: 'Red wine',   mrp: 3800, base: 2980, onHand: 12, daysCover: 4,  units: 168, gmv: 500640, growth: 22, status: { label: 'Low stock',  tone: 'warning' } },
  { id: 'p5', name: 'Aravalli Mead',             brand: 'Aravalli Vineyards',  brandInitials: 'AV', brandHue: 'ember', sku: 'ARAV-MED-500-001',  category: 'Mead',       mrp: 1450, base: 1180, onHand: 86, daysCover: 18, units: 312, gmv: 368160, growth: 34, status: { label: 'In stock',   tone: 'success' } },
  { id: 'p6', name: 'Tara Reserve Gin',          brand: 'Tara Spirits',        brandInitials: 'TS', brandHue: 'teal',  sku: 'TARA-GIN-750-002',  category: 'Spirits',    mrp: 2200, base: 1820, onHand: 4,  daysCover: 2,  units: 84,  gmv: 152880, growth: -12, status: { label: 'Low stock', tone: 'warning' } },
  { id: 'p7', name: 'Estate Chardonnay 2022',    brand: 'WineYard Vintners',   brandInitials: 'WY', brandHue: 'teal',  sku: 'VINO-CHR-750-2022', category: 'White wine', mrp: 2200, base: 1850, onHand: 0,  daysCover: 0,  units: 92,  gmv: 170200, growth: 6,  status: { label: 'Out of stock', tone: 'danger' } },
  { id: 'p8', name: 'Khanna Wheat',              brand: 'Khanna Brewing Co.',  brandInitials: 'KH', brandHue: 'ember', sku: 'KHAN-WHT-330-002',  category: 'Beer',       mrp: 200,  base: 165,  onHand: 920, daysCover: 16, units: 1420, gmv: 234300, growth: 9,  status: { label: 'In stock',   tone: 'success' } },
];

const PRODUCTS_AGG = {
  total: 357,
  active: 312,
  outOfStock: 8,
  lowStock: 24,
  gmv: 4728600,
  growth: 8.3,
};

/* =========================================================
   CUSTOMERS  — 142 buyers; we render 7
   ========================================================= */
const CUSTOMERS_DATA = [
  { id: 'c1', name: 'Singh Hospitality',    initials: 'SH', hue: 'ember', city: 'Bengaluru',   tier: 'A', cohort: 'South India Specialty', spend: 612000, growth: 26,  orders: 6, lastOrder: '3d',  credit: { used: 384000, limit: 600000 }, dues: 124000, status: { label: 'Active',   tone: 'success' } },
  { id: 'c2', name: 'Verma & Sons',         initials: 'VS', hue: 'teal',  city: 'Gurugram',    tier: 'A', cohort: 'North Delhi · A-class', spend: 484000, growth: 12,  orders: 4, lastOrder: '6d',  credit: { used: 220000, limit: 500000 }, dues: 86000,  status: { label: 'Active',   tone: 'success' } },
  { id: 'c3', name: 'Mehta Brothers',       initials: 'MB', hue: 'cream', city: 'Mumbai',      tier: 'A', cohort: 'Maharashtra Premium',    spend: 384000, growth: 8,   orders: 4, lastOrder: '4d',  credit: { used: 180000, limit: 400000 }, dues: 0,      status: { label: 'Active',   tone: 'success' } },
  { id: 'c4', name: 'Rajan Wine Merchants', initials: 'RW', hue: 'ember', city: 'New Delhi',   tier: 'B', cohort: 'North Delhi · A-class', spend: 268000, growth: 32,  orders: 5, lastOrder: '2d',  credit: { used: 132000, limit: 300000 }, dues: 42000,  status: { label: 'Active',   tone: 'success' } },
  { id: 'c5', name: 'Capitol Spirits',      initials: 'CS', hue: 'teal',  city: 'New Delhi',   tier: 'B', cohort: 'North Delhi · A-class', spend: 92000,  growth: -18, orders: 1, lastOrder: '32d', credit: { used: 92000,  limit: 200000 }, dues: 92000,  status: { label: 'Dormant',  tone: 'warning' } },
  { id: 'c6', name: 'Hotel Lalit',          initials: 'HL', hue: 'cream', city: 'New Delhi',   tier: 'A', cohort: 'Hospitality',           spend: 218000, growth: 4,   orders: 3, lastOrder: '8d',  credit: { used: 84000,  limit: 250000 }, dues: 0,      status: { label: 'Active',   tone: 'success' } },
  { id: 'c7', name: 'Borivali Wines',       initials: 'BW', hue: 'ember', city: 'Mumbai',      tier: 'B', cohort: 'Maharashtra Premium',    spend: 142000, growth: 14,  orders: 3, lastOrder: '5d',  credit: { used: 64000,  limit: 200000 }, dues: 0,      status: { label: 'Active',   tone: 'success' } },
];
const CUSTOMERS_AGG = {
  total: 142, active: 89, dormant: 18, new30d: 6,
  spend: 4728600, growth: 8.3, atRisk: 4, duesTotal: 344000,
};

/* =========================================================
   COHORTS  — 4 total (small set)
   ========================================================= */
const COHORTS_DATA = [
  { id: 'mh-prem', name: 'Maharashtra Premium',   description: 'A & B class buyers in Maharashtra, focused on premium wines.', members: 28, totalBuyers: 142, gmv: 1140000, growth: 12,  active: 19, aov: 124000, conversion: 38, catalogs: 3, hue: 'ember', primaryBrands: ['WY', 'MR'], status: { label: 'Active', tone: 'success' } },
  { id: 'nd-acl',  name: 'North Delhi · A-class',  description: 'Tier-1 buyers across North Delhi corridor.',                  members: 12, totalBuyers: 142, gmv: 968000,  growth: 8,   active: 9,  aov: 142000, conversion: 52, catalogs: 4, hue: 'teal',  primaryBrands: ['WY', 'KH'], status: { label: 'Active', tone: 'success' } },
  { id: 'sa-spec', name: 'South India Specialty', description: 'Hospitality & on-premise across BLR, Chennai, Hyderabad.',     members: 18, totalBuyers: 142, gmv: 786000,  growth: 18,  active: 14, aov: 102000, conversion: 41, catalogs: 2, hue: 'cream', primaryBrands: ['WY', 'AV'], status: { label: 'Active', tone: 'success' } },
  { id: 'hosp',    name: 'Hospitality',            description: 'Hotels & banquet halls — slower cadence, larger orders.',    members: 22, totalBuyers: 142, gmv: 642000,  growth: 4,   active: 12, aov: 162000, conversion: 28, catalogs: 1, hue: 'teal',  primaryBrands: ['MR', 'KH'], status: { label: 'Active', tone: 'success' } },
];

const COHORTS_AGG = {
  total: 4, members: 80, totalBuyers: 142, conversion: 39.8,
  gmv: 3536000, growth: 11.2,
};

/* =========================================================
   CATALOGS  — small visual set
   ========================================================= */
const CATALOGS_DATA = [
  { id: 'cat-summer', name: 'Summer Pours',          cohort: 'North Delhi · A-class', cohortMembers: 12, products: 28, brands: 3, gmv: 412000, growth: 44, orders: 14, opens: 24, conversion: 50, daysLeft: 4,  validUntil: 'May 31', publishedBy: 'Phani', hue: 'teal',  status: { label: 'Live',  tone: 'success' } },
  { id: 'cat-prem',   name: 'Premium Reserve',       cohort: 'South India Specialty', cohortMembers: 18, products: 14, brands: 2, gmv: 612000, growth: 18, orders: 11, opens: 22, conversion: 50, daysLeft: 12, validUntil: 'Jun 12', publishedBy: 'Phani', hue: 'ember', status: { label: 'Live',  tone: 'success' } },
  { id: 'cat-vint',   name: 'Vintage Drop',          cohort: 'Maharashtra Premium',    cohortMembers: 28, products: 22, brands: 4, gmv: 248000, growth: -6, orders: 8,  opens: 19, conversion: 42, daysLeft: 0,  validUntil: 'May 30', publishedBy: 'Phani', hue: 'cream', status: { label: 'Ended', tone: 'neutral' } },
  { id: 'cat-monsoon', name: 'Monsoon Specials',      cohort: 'Hospitality',           cohortMembers: 22, products: 18, brands: 3, gmv: 0,      growth: 0,   orders: 0, opens: 0,  conversion: 0,  daysLeft: 0,  validUntil: 'Jul 15', publishedBy: 'Phani', hue: 'teal',  status: { label: 'Draft', tone: 'warning' } },
];
const CATALOGS_AGG = {
  total: 4, live: 2, draft: 1, ended: 1,
  gmv: 1272000, growth: 14.2, orders: 33, conversion: 47.5,
};

/* =========================================================
   ORDERS  — 28 this month; render 8
   ========================================================= */
const ORDERS_DATA = [
  { id: 'DF-2026-00482', buyer: 'Singh Hospitality',    buyerInitials: 'SH', buyerHue: 'ember', placed: '4h ago',   delivery: 'Mon · Bengaluru', items: 14, gmv: 184200, status: { label: 'Confirmed', tone: 'success' } },
  { id: 'DF-2026-00481', buyer: 'Rajan Wine Merchants', buyerInitials: 'RW', buyerHue: 'ember', placed: '6h ago',   delivery: 'Tue · New Delhi', items: 8,  gmv: 86400,  status: { label: 'Confirmed', tone: 'success' } },
  { id: 'DF-2026-00480', buyer: 'Mehta Brothers',       buyerInitials: 'MB', buyerHue: 'cream', placed: '1d ago',   delivery: 'Wed · Mumbai',    items: 24, gmv: 312000, status: { label: 'In transit', tone: 'accent' } },
  { id: 'DF-2026-00479', buyer: 'Verma & Sons',         buyerInitials: 'VS', buyerHue: 'teal',  placed: '1d ago',   delivery: 'Tue · Gurugram',  items: 6,  gmv: 48600,  status: { label: 'In transit', tone: 'accent' } },
  { id: 'DF-2026-00478', buyer: 'Hotel Lalit',          buyerInitials: 'HL', buyerHue: 'cream', placed: '2d ago',   delivery: 'Fri · New Delhi', items: 18, gmv: 218000, status: { label: 'Delivered', tone: 'neutral' } },
  { id: 'DF-2026-00477', buyer: 'Borivali Wines',       buyerInitials: 'BW', buyerHue: 'ember', placed: '3d ago',   delivery: 'Wed · Mumbai',    items: 12, gmv: 142000, status: { label: 'Delivered', tone: 'neutral' } },
  { id: 'DF-2026-00476', buyer: 'Kapoor Spirits',       buyerInitials: 'KS', buyerHue: 'teal',  placed: '4d ago',   delivery: 'Thu · Pune',      items: 4,  gmv: 38200,  status: { label: 'Hold',      tone: 'warning' } },
  { id: 'DF-2026-00475', buyer: 'Capitol Spirits',      buyerInitials: 'CS', buyerHue: 'teal',  placed: '5d ago',   delivery: 'Fri · New Delhi', items: 2,  gmv: 18400,  status: { label: 'Cancelled', tone: 'danger' } },
];
const ORDERS_AGG = {
  total: 28, gmv: 1247800, growth: 14, aov: 44564,
  pendingDispatch: 4, holds: 1, deliveredMTD: 18,
};

Object.assign(window, {
  PRODUCTS_DATA, PRODUCTS_AGG,
  CUSTOMERS_DATA, CUSTOMERS_AGG,
  COHORTS_DATA, COHORTS_AGG,
  CATALOGS_DATA, CATALOGS_AGG,
  ORDERS_DATA, ORDERS_AGG,
});
