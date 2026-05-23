// ui_kits/buyer-app/data.jsx
// Mock data + helpers for the buyer-app kit.

const buyerCatalogs = [
  {
    id: 'c1', name: 'Summer Pours', subtitle: 'A curated selection from our private cellar',
    distributor: 'Phani Distribution', products: 28, validUntil: '31 May 2026',
    hero: 'teal', isNew: true,
  },
  {
    id: 'c2', name: 'New Arrivals · May', subtitle: 'Fresh stock landed this week',
    distributor: 'Phani Distribution', products: 14, validUntil: '15 Jun 2026',
    hero: 'ember', isNew: true,
  },
  {
    id: 'c3', name: 'Premium Reserve', subtitle: 'Limited cases — for our A-class buyers',
    distributor: 'Phani Distribution', products: 42, validUntil: '30 Jun 2026',
    hero: 'cream', isNew: false,
  },
];

const buyerProducts = [
  { id: 'p1', name: 'Cabernet Sauvignon',  vintage: '2021', brand: 'WineYard Vintners',  sku: 'VINO-CAB-750-2021', pack: '750ml',     mrp: 2800, price: 2450, hue: 'teal',  featured: true,
    note: 'A medium-bodied Nashik Cab with notes of black cherry, cedar, and a long warm finish.' },
  { id: 'p2', name: 'Cabernet Franc',       vintage: '2020', brand: 'WineYard Vintners',  sku: 'VINO-CFR-750-2020', pack: '750ml',     mrp: 3400, price: 2980, hue: 'teal',  featured: false,
    note: 'Reserve bottling. Limited to 600 cases — earthy, peppery, age-worthy.' },
  { id: 'p3', name: 'Chenin Blanc',         vintage: '2022', brand: 'Maison Roussel',     sku: 'MRSL-CB-750-2022',  pack: '750ml',     mrp: 1900, price: 1640, hue: 'cream', featured: true,
    note: 'Crisp, dry, slightly aromatic. Pairs with paneer tikka and grilled fish.' },
  { id: 'p4', name: 'Sauvignon Blanc',      vintage: '2022', brand: 'Maison Roussel',     sku: 'MRSL-SB-750-2022',  pack: '750ml',     mrp: 1800, price: 1550, hue: 'cream', featured: false,
    note: 'Bright citrus and gooseberry. Drink within the year.' },
  { id: 'p5', name: 'Indian Pale Ale',      vintage: '',     brand: 'Khanna Brewing Co.', sku: 'KHAN-IPA-330-006',  pack: '330ml × 6', mrp:  720, price:  580, hue: 'ember', featured: true,
    note: 'Citrus-forward, 6.2% ABV. Brewed in Pune. Best chilled.' },
  { id: 'p6', name: 'Wheat Lager',          vintage: '',     brand: 'Khanna Brewing Co.', sku: 'KHAN-WHT-330-006',  pack: '330ml × 6', mrp:  640, price:  520, hue: 'ember', featured: false,
    note: 'Light, cloudy, refreshing. 4.8% ABV.' },
  { id: 'p7', name: 'Single Malt 12 Year',  vintage: '',     brand: 'Tara Spirits',       sku: 'TARA-SM12-750',     pack: '750ml',     mrp: 4800, price: 4280, hue: 'teal',  featured: true,
    note: 'Aged 12 years in ex-bourbon casks. Smoky, soft, slightly sweet.' },
  { id: 'p8', name: 'Estate Reserve Red',   vintage: '2019', brand: 'Aravalli Vineyards', sku: 'ARVL-ESR-750-2019', pack: '750ml',     mrp: 3200, price: 2850, hue: 'ember', featured: false,
    note: 'Old-vine Shiraz blend. Velvety tannins.' },
];

const buyerOrders = [
  { id: 'DF-2026-00471', status: 'dispatched', total: 84200,  items: 3,  placed: '2 hours ago',  catalog: 'Summer Pours' },
  { id: 'DF-2026-00466', status: 'delivered',  total: 124300, items: 9,  placed: '2 days ago',   catalog: 'Premium Reserve' },
  { id: 'DF-2026-00451', status: 'delivered',  total: 46500,  items: 4,  placed: 'Last week',    catalog: 'New Arrivals · May' },
  { id: 'DF-2026-00444', status: 'confirmed',  total: 218500, items: 12, placed: '8 days ago',   catalog: 'Summer Pours' },
  { id: 'DF-2026-00432', status: 'delivered',  total: 92800,  items: 6,  placed: '12 days ago',  catalog: 'Premium Reserve' },
  { id: 'DF-2026-00421', status: 'delivered',  total: 38400,  items: 3,  placed: '18 days ago',  catalog: 'New Arrivals · April' },
  { id: 'DF-2026-00412', status: 'cancelled',  total: 12800,  items: 1,  placed: '24 days ago',  catalog: 'Summer Pours' },
  { id: 'DF-2026-00398', status: 'delivered',  total: 156200, items: 8,  placed: 'Last month',   catalog: 'Monsoon Pre-Order' },
];

const buyerEnquiries = [
  { id: 'ENQ-2026-0042', subject: 'Bulk pricing on Cabernet Franc',  status: 'open',     distributor: 'Phani Distribution', placed: '3 hours ago' },
  { id: 'ENQ-2026-0041', subject: 'Stock check · Single Malt 12',     status: 'replied',  distributor: 'Kohli & Sons',       placed: 'Yesterday' },
  { id: 'ENQ-2026-0039', subject: 'New cohort catalog · Diwali range', status: 'closed',  distributor: 'Phani Distribution', placed: '4 days ago' },
];

const buyerInvoices = [
  { id: 'INV-2026-00128', amount: 124300, status: 'paid',    issued: '2 days ago',  due: '—' },
  { id: 'INV-2026-00121', amount: 46500,  status: 'paid',    issued: 'Last week',   due: '—' },
  { id: 'INV-2026-00118', amount: 218500, status: 'due',     issued: '8 days ago',  due: 'In 22 days' },
  { id: 'INV-2026-00114', amount: 38400,  status: 'overdue', issued: '18 days ago', due: '−4 days' },
];

const enquiryStatusLabels = { open: 'Open', replied: 'Replied', closed: 'Closed' };
const invoiceStatusLabels = { paid: 'Paid', due: 'Due', overdue: 'Overdue' };

const buyerStatusLabels = {
  draft:      'Draft',
  received:   'Received',
  confirmed:  'Confirmed',
  dispatched: 'Dispatched',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

function inr(n) {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

Object.assign(window, {
  BUYER_DATA: { catalogs: buyerCatalogs, products: buyerProducts, orders: buyerOrders, statusLabels: buyerStatusLabels, enquiries: buyerEnquiries, invoices: buyerInvoices, enquiryStatusLabels, invoiceStatusLabels },
  inrB: inr,
});

// ---------- Dashboard + Catalog browsing data ----------

const buyerLocations = [
  { id: 'dl', name: 'Delhi Showroom',   address: 'Karol Bagh · 110005',     isDefault: true },
  { id: 'gu', name: 'Gurugram Outlet',  address: 'Sector 29 · 122002',      isDefault: false },
];

const buyerDistributors = [
  { id: 'phani',   initials: 'PD', name: 'Phani Distribution',  city: 'New Delhi', lastOrder: '2h ago',   spend: 1240000, trend: '+12%' },
  { id: 'kohli',   initials: 'KS', name: 'Kohli & Sons',         city: 'Faridabad', lastOrder: '4d ago',   spend:  428000, trend: '+4%'  },
  { id: 'arasaka', initials: 'AR', name: 'Arasaka Wines',        city: 'Noida',     lastOrder: '2w ago',   spend:  186000, trend: '−6%'  },
];

const buyerCategories = [
  { id: 'wine',     name: 'Wine',     count: 184, hue: 'teal'  },
  { id: 'spirits',  name: 'Spirits',  count:  92, hue: 'ember' },
  { id: 'beer',     name: 'Beer',     count:  64, hue: 'cream' },
  { id: 'mixers',   name: 'Mixers',   count:  38, hue: 'teal'  },
  { id: 'cigars',   name: 'Cigars',   count:  14, hue: 'ember' },
  { id: 'snacks',   name: 'Snacks',   count:  72, hue: 'cream' },
];

const buyerBrands = [
  { id: 'wy',  initials: 'WY', name: 'WineYard Vintners' },
  { id: 'mr',  initials: 'MR', name: 'Maison Roussel'    },
  { id: 'kh',  initials: 'KH', name: 'Khanna Brewing'    },
  { id: 'ts',  initials: 'TS', name: 'Tara Spirits'      },
  { id: 'av',  initials: 'AV', name: 'Aravalli Vineyards'},
  { id: 'rg',  initials: 'RG', name: 'Riverstone Gin'    },
];

const buyerProfile = {
  name: 'Rajan Mehta',
  business: 'Rajan Wine Merchants',
  phone: '+91 98103 47281',
  gstin: '07AABCR1234M1Z5',
  tier: 'A-class',
  credit: 250000,
  used: 84200,
};

Object.assign(window, {
  BUYER_LOCATIONS: buyerLocations,
  BUYER_DISTRIBUTORS: buyerDistributors,
  BUYER_CATEGORIES: buyerCategories,
  BUYER_BRANDS: buyerBrands,
  BUYER_PROFILE: buyerProfile,
});
