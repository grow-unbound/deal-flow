// ui_kits/cockpit/data.jsx
// In-memory mock data + helpers shared across cockpit screens.

const brands = [
  { id: 'wy', name: 'WineYard Vintners', initials: 'WY', skus: 82, cohorts: 4, gmvTrend: '+12%' },
  { id: 'mr', name: 'Maison Roussel', initials: 'MR', skus: 46, cohorts: 3, gmvTrend: '+4%' },
  { id: 'kh', name: 'Khanna Brewing Co.', initials: 'KH', skus: 124, cohorts: 6, gmvTrend: '+8%' },
  { id: 'ts', name: 'Tara Spirits', initials: 'TS', skus: 38, cohorts: 2, gmvTrend: '−2%' },
  { id: 'av', name: 'Aravalli Vineyards', initials: 'AV', skus: 67, cohorts: 4, gmvTrend: '+18%' },
];

const cohorts = [
  { id: 'ndla', name: 'North Delhi · A-class', members: 12, rules: 'state=DL · tier=A · zone=North' },
  { id: 'mh-prem', name: 'Maharashtra Premium', members: 28, rules: 'state=MH · tier∈[A,B] · brand_focus=WY,MR' },
  { id: 'south', name: 'South India Specialty', members: 41, rules: 'state∈[KA,TN,KL,AP] · brand_focus=KH,TS' },
  { id: 'all', name: 'All buyers', members: 142, rules: 'no filter — fallback list' },
];

const buyers = [
  { id: 'b1', name: 'Rajan Wine Merchants', city: 'New Delhi', tier: 'A', credit: 250000 },
  { id: 'b2', name: 'Verma & Sons', city: 'Gurugram', tier: 'A', credit: 400000 },
  { id: 'b3', name: 'Mehta Brothers', city: 'Mumbai', tier: 'B', credit: 150000 },
  { id: 'b4', name: 'Singh Hospitality', city: 'Bengaluru', tier: 'A', credit: 600000 },
  { id: 'b5', name: 'Kapoor Spirits', city: 'Pune', tier: 'B', credit: 120000 },
];

const orders = [
  { id: 'DF-2026-00471', buyer: 'Rajan Wine Merchants', items: 3, status: 'dispatched', total: 84200, placed: '2h ago', catalog: 'Summer Pours' },
  { id: 'DF-2026-00470', buyer: 'Verma & Sons', items: 12, status: 'confirmed', total: 218500, placed: '5h ago', catalog: 'Summer Pours' },
  { id: 'DF-2026-00469', buyer: 'Mehta Brothers', items: 5, status: 'delivered', total: 46820, placed: 'Yesterday', catalog: 'New Arrivals · May' },
  { id: 'DF-2026-00468', buyer: 'Singh Hospitality', items: 28, status: 'received', total: 612400, placed: 'Yesterday', catalog: 'Premium Reserve' },
  { id: 'DF-2026-00467', buyer: 'Kapoor Spirits', items: 4, status: 'cancelled', total: 18900, placed: '2d ago', catalog: 'Summer Pours' },
  { id: 'DF-2026-00466', buyer: 'Rajan Wine Merchants', items: 9, status: 'delivered', total: 124300, placed: '2d ago', catalog: 'Premium Reserve' },
  { id: 'DF-2026-00465', buyer: 'Mehta Brothers', items: 6, status: 'dispatched', total: 78200, placed: '3d ago', catalog: 'New Arrivals · May' },
];

const catalogs = [
  { id: 'c1', name: 'Summer Pours', cohort: 'North Delhi · A-class', products: 28, validUntil: '31 May', status: 'published', hue: 'teal' },
  { id: 'c2', name: 'New Arrivals · May', cohort: 'Maharashtra Premium', products: 14, validUntil: '15 Jun', status: 'published', hue: 'ember' },
  { id: 'c3', name: 'Premium Reserve', cohort: 'South India Specialty', products: 42, validUntil: '30 Jun', status: 'published', hue: 'cream' },
  { id: 'c4', name: 'Monsoon Pre-Order', cohort: 'All buyers', products: 18, validUntil: '—', status: 'draft', hue: 'teal' },
];

const products = [
  { id: 'p1', name: 'Cabernet Sauvignon 2021', brand: 'WineYard Vintners', sku: 'VINO-CAB-750-2021', pack: '750ml', mrp: 2800, price: 2450, hue: 'teal' },
  { id: 'p2', name: 'Cabernet Franc Reserve', brand: 'WineYard Vintners', sku: 'VINO-CFR-750-2020', pack: '750ml', mrp: 3400, price: 2980, hue: 'teal' },
  { id: 'p3', name: 'Chenin Blanc', brand: 'Maison Roussel', sku: 'MRSL-CB-750-2022', pack: '750ml', mrp: 1900, price: 1640, hue: 'cream' },
  { id: 'p4', name: 'Sauvignon Blanc', brand: 'Maison Roussel', sku: 'MRSL-SB-750-2022', pack: '750ml', mrp: 1800, price: 1550, hue: 'cream' },
  { id: 'p5', name: 'Indian Pale Ale', brand: 'Khanna Brewing Co.', sku: 'KHAN-IPA-330-006', pack: '330ml × 6', mrp: 720, price: 580, hue: 'ember' },
  { id: 'p6', name: 'Wheat Lager', brand: 'Khanna Brewing Co.', sku: 'KHAN-WHT-330-006', pack: '330ml × 6', mrp: 640, price: 520, hue: 'ember' },
  { id: 'p7', name: 'Single Malt 12yr', brand: 'Tara Spirits', sku: 'TARA-SM12-750', pack: '750ml', mrp: 4800, price: 4280, hue: 'teal' },
  { id: 'p8', name: 'Estate Reserve Red', brand: 'Aravalli Vineyards', sku: 'ARVL-ESR-750-2019', pack: '750ml', mrp: 3200, price: 2850, hue: 'ember' },
];

const statusMeta = {
  draft:      { label: 'Draft',      bg: '#EAF1EE', fg: '#142823', dot: '#1F3A34' },
  received:   { label: 'Received',   bg: '#E7EEF1', fg: '#2A4B59', dot: '#3F6A7C' },
  confirmed:  { label: 'Confirmed',  bg: '#FBEFE3', fg: '#6B3818', dot: '#C26E3A' },
  dispatched: { label: 'Dispatched', bg: '#FBF1DC', fg: '#7A5519', dot: '#B07D2C' },
  delivered:  { label: 'Delivered',  bg: '#ECF3EC', fg: '#2F5733', dot: '#4A7C4E' },
  cancelled:  { label: 'Cancelled',  bg: '#F6E5DF', fg: '#6B2615', dot: '#9C3A22' },
};

// INR with Indian comma grouping (12,40,000 instead of 1,240,000).
function inr(n) {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

Object.assign(window, {
  DF_DATA: { brands, cohorts, buyers, orders, catalogs, products, statusMeta },
  inr,
});
