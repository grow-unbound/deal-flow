// brands/data.jsx
// Extended brand portfolio data for the Brands landing exploration.
// All numbers are mock-but-plausible for a 5-brand SMB distributor doing ~₹47L/month.

const BRANDS_DATA = [
  {
    id: 'wy', name: 'WineYard Vintners', initials: 'WY',
    region: 'Nashik, IN',  category: 'Wines',
    hue: 'teal',
    skus: 82, cohorts: 4, activeBuyers: 38, totalBuyers: 142,
    gmv: 1680000, gmvPrior: 1500000, growth: 12, share: 35.5,
    margin: 18.4, sellThrough: 71,
    lowStock: 4, daysSinceCatalog: 3, repeatRate: 64,
    quadrant: 'star',
    statusVerb: 'On pace',
    statusTone: 'success',
    alerts: [],
    spark: [62, 68, 71, 70, 78, 82, 79, 88, 84, 92, 96, 100],
  },
  {
    id: 'kh', name: 'Khanna Brewing Co.', initials: 'KH',
    region: 'Punjab, IN', category: 'Beer & ales',
    hue: 'ember',
    skus: 124, cohorts: 6, activeBuyers: 41, totalBuyers: 142,
    gmv: 1120000, gmvPrior: 1037000, growth: 8, share: 23.7,
    margin: 14.2, sellThrough: 58,
    lowStock: 12, daysSinceCatalog: 8, repeatRate: 58,
    quadrant: 'star',
    statusVerb: 'Stock thin',
    statusTone: 'warning',
    alerts: [
      { kind: 'low-stock', label: '12 SKUs low on stock', severity: 'warning' },
    ],
    spark: [58, 60, 63, 62, 66, 68, 64, 70, 72, 75, 78, 80],
  },
  {
    id: 'mr', name: 'Maison Roussel', initials: 'MR',
    region: 'Loire, FR', category: 'French wines',
    hue: 'cream',
    skus: 46, cohorts: 3, activeBuyers: 22, totalBuyers: 142,
    gmv: 840000, gmvPrior: 808000, growth: 4, share: 17.8,
    margin: 22.1, sellThrough: 62,
    lowStock: 2, daysSinceCatalog: 12, repeatRate: 51,
    quadrant: 'workhorse',
    statusVerb: 'Steady',
    statusTone: 'neutral',
    alerts: [],
    spark: [44, 46, 45, 48, 47, 50, 49, 51, 50, 52, 53, 54],
  },
  {
    id: 'av', name: 'Aravalli Vineyards', initials: 'AV',
    region: 'Rajasthan, IN', category: 'Wines & meads',
    hue: 'ember',
    skus: 67, cohorts: 4, activeBuyers: 19, totalBuyers: 142,
    gmv: 668600, gmvPrior: 566600, growth: 18, share: 14.1,
    margin: 19.8, sellThrough: 74,
    lowStock: 1, daysSinceCatalog: 5, repeatRate: 47,
    quadrant: 'rising',
    statusVerb: 'New peak',
    statusTone: 'accent',
    alerts: [],
    spark: [22, 24, 27, 26, 30, 34, 36, 40, 42, 46, 50, 54],
  },
  {
    id: 'ts', name: 'Tara Spirits', initials: 'TS',
    region: 'Goa, IN', category: 'Spirits',
    hue: 'teal',
    skus: 38, cohorts: 2, activeBuyers: 14, totalBuyers: 142,
    gmv: 420000, gmvPrior: 456000, growth: -8, share: 8.9,
    margin: 16.5, sellThrough: 42,
    lowStock: 6, daysSinceCatalog: 28, repeatRate: 38,
    quadrant: 'watchlist',
    statusVerb: 'Slipping',
    statusTone: 'danger',
    alerts: [
      { kind: 'gmv-drop', label: 'GMV down 8% vs last month', severity: 'danger' },
      { kind: 'stale-catalog', label: 'No new catalog in 28 days', severity: 'warning' },
      { kind: 'reach', label: 'Active buyers down 4 → 14', severity: 'warning' },
    ],
    spark: [54, 52, 55, 50, 48, 46, 44, 42, 40, 38, 36, 34],
  },
];

// Portfolio aggregates
const PORTFOLIO = {
  gmv: BRANDS_DATA.reduce((s, b) => s + b.gmv, 0),                // 47,28,600
  gmvPrior: BRANDS_DATA.reduce((s, b) => s + b.gmvPrior, 0),      // 43,67,600
  growth: 8.3,
  brandsCarried: BRANDS_DATA.length,
  brandsAtRisk: BRANDS_DATA.filter(b => b.alerts.length > 0).length,
  brandsRising: BRANDS_DATA.filter(b => b.quadrant === 'rising').length,
  activeBuyersAcross: 89,    // dedup count (a buyer may buy multiple brands)
  totalBuyers: 142,
  catalogFresh: BRANDS_DATA.filter(b => b.daysSinceCatalog <= 14).length,
  topBrand: 'WineYard Vintners',
  topBrandShare: 35.5,
};

// INR with Indian comma grouping (12,40,000 instead of 1,240,000).
function inrFmt(n) {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

// Short money — ₹16.8L, ₹4.2L, ₹47.3L
function inrShort(n) {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (n >= 100000)   return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  if (n >= 1000)     return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + ' K';
  return '₹' + n;
}

Object.assign(window, { BRANDS_DATA, PORTFOLIO, inrFmt, inrShort });
