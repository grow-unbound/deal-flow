// v2/orders-data.jsx
// One rich order, rendered across its full lifecycle. The order page is the
// most-used screen in the cockpit, so the data carries everything every state
// needs: line items with on-hand stock (for fulfillment checks), a cumulative
// event log ("all the changes"), an invoice, and payment/credit context.

const ORDER = {
  id: 'DF-2026-00470',
  invoiceNo: 'INV-2026-00470',
  buyer: {
    name: 'Verma & Sons',
    initials: 'VS',
    hue: 'ember',
    city: 'Gurugram, Haryana',
    tier: 'A',
    contact: 'Anil Verma · Procurement',
    gstin: '06ABXFV4421K1Z2',
  },
  seller: { gststate: 'Delhi' }, // inter-state vs Haryana → IGST
  catalog: 'Summer Pours',
  cohort: 'North Delhi · A-class',
  channel: 'Buyer app',
  placedAt: 'Jun 28, 9:42 am',
  invoiceDate: 'Jun 28',
  dueDate: 'Jul 19',          // Net 21 from invoice date
  terms: 'Net 21',
  delivery: {
    address: 'Plot 14, Sector 18, Gurugram 122001',
    window: 'Mon 1 Jul · forenoon',
    mode: 'Distributor fleet',
    contact: 'Anil Verma · +91 98xx xx21',
  },
  credit: { limit: 600000, usedBefore: 180000 },
  // onHand: bottles available right now. qty > onHand ⇒ can't fully fulfill.
  lines: [
    { name: 'Cabernet Sauvignon 2021', brand: 'WineYard Vintners', sku: 'VINO-CAB-750-2021', hue: 'teal',  qty: 48, price: 2450, onHand: 96 },
    { name: 'Cabernet Franc Reserve',  brand: 'WineYard Vintners', sku: 'VINO-CFR-750-2020', hue: 'teal',  qty: 36, price: 2980, onHand: 22 },
    { name: 'Indian Pale Ale',         brand: 'Khanna Brewing Co.', sku: 'KHAN-IPA-330-006', hue: 'ember', qty: 36, price:  580, onHand: 240 },
    { name: 'Chenin Blanc',            brand: 'Maison Roussel',    sku: 'MRSL-CB-750-2022', hue: 'cream', qty: 24, price: 1640, onHand: 180 },
  ],
};

// Derived money — computed once, tabular everywhere.
ORDER.subtotal = ORDER.lines.reduce((s, l) => s + l.qty * l.price, 0);
ORDER.gstRate = 0.18;                 // IGST (inter-state)
ORDER.gst = Math.round(ORDER.subtotal * ORDER.gstRate);
ORDER.total = ORDER.subtotal + ORDER.gst;
ORDER.units = ORDER.lines.reduce((s, l) => s + l.qty, 0);
ORDER.shortLines = ORDER.lines.filter(l => l.qty > l.onHand);

// The four lifecycle stages every order moves through.
const ORDER_STAGES = [
  { id: 'received',   label: 'Received',   at: 'Jun 28, 9:42 am' },
  { id: 'confirmed',  label: 'Confirmed',  at: 'Jun 28, 11:20 am' },
  { id: 'dispatched', label: 'Dispatched', at: 'Jun 29, 7:05 am' },
  { id: 'delivered',  label: 'Delivered',  at: 'Jul 1, 11:48 am' },
];

// The full event log — "every change to the order". Each state shows the
// events up to and including its point. Newest sits at the top when rendered.
const ORDER_EVENTS = {
  placed:    { stage: 'received',   icon: 'cart',    title: 'Order placed',       detail: '4 lines · 144 units · via Summer Pours catalog', who: 'Anil Verma · buyer app', at: 'Jun 28, 9:42 am' },
  edited:    { stage: 'received',   icon: 'edit',    title: 'Line edited',         detail: 'Indian Pale Ale 48 → 36 at buyer’s request', who: 'Phani Raju', at: 'Jun 28, 10:05 am' },
  confirmed: { stage: 'confirmed',  icon: 'check',   title: 'Order confirmed',     detail: 'Stock reserved · invoice INV-2026-00470 generated', who: 'Phani Raju', at: 'Jun 28, 11:20 am', tone: 'accent' },
  short:     { stage: 'confirmed',  icon: 'alert',   title: 'Short-stock flagged', detail: 'Cabernet Franc Reserve — 22 of 36 reserved, 14 on backorder', who: 'System', at: 'Jun 28, 11:20 am', tone: 'warn' },
  dispatched:{ stage: 'dispatched', icon: 'truck',   title: 'Dispatched',          detail: 'Distributor fleet · expected Mon 1 Jul, forenoon', who: 'Warehouse · Rohit', at: 'Jun 29, 7:05 am' },
  delivered: { stage: 'delivered',  icon: 'home',    title: 'Delivered',           detail: 'Signed by store manager at Sector 18', who: 'Driver · Sunil', at: 'Jul 1, 11:48 am', tone: 'ok' },
  paid:      { stage: 'delivered',  icon: 'rupee',   title: 'Payment received',    detail: '₹3,36,442 · UPI · auto-reconciled to invoice', who: 'System', at: 'Jul 3, 2:15 pm', tone: 'ok' },
  cancelled: { stage: 'cancelled',  icon: 'x',       title: 'Order cancelled',     detail: 'Buyer cancelled before dispatch · stock released', who: 'Anil Verma · buyer app', at: 'Jun 28, 4:30 pm', tone: 'danger' },
};

// Per-state config: where we are on the stepper, what's next, the contextual
// actions, whether an invoice exists, payment posture, and which events show.
const ORDER_STATE_CONFIG = {
  received: {
    stepIdx: 0,
    nextLine: 'Confirm to reserve stock and generate the invoice. One line is short — resolve it first or confirm a partial.',
    primary: { label: 'Confirm order', kind: 'primary' },
    secondary: [{ label: 'Edit order' }, { label: 'Message buyer' }],
    danger: { label: 'Cancel order' },
    hasInvoice: false,
    showFulfilment: true,
    payment: { tone: 'neutral', label: 'Not invoiced', amount: null, detail: 'Dues appear once you confirm and the invoice is raised.' },
    events: ['edited', 'placed'],
  },
  confirmed: {
    stepIdx: 1,
    nextLine: 'Stock is reserved and the invoice is raised. Dispatch when the fleet is loaded.',
    primary: { label: 'Mark dispatched', kind: 'primary' },
    secondary: [{ label: 'Download invoice' }, { label: 'Edit order' }],
    danger: { label: 'Cancel order' },
    hasInvoice: true,
    showFulfilment: true,
    payment: { tone: 'due', label: 'Payment due', amount: true, detail: 'Net 21 · due Jul 19' },
    events: ['short', 'confirmed', 'edited', 'placed'],
  },
  dispatched: {
    stepIdx: 2,
    nextLine: 'On the road with the distributor fleet. Mark delivered once the buyer signs.',
    primary: { label: 'Mark delivered', kind: 'primary' },
    secondary: [{ label: 'Track shipment' }, { label: 'Download invoice' }],
    danger: null,
    hasInvoice: true,
    showFulfilment: false,
    payment: { tone: 'due', label: 'Payment due', amount: true, detail: 'Net 21 · due Jul 19' },
    events: ['dispatched', 'confirmed', 'edited', 'placed'],
  },
  delivered: {
    stepIdx: 3,
    nextLine: 'Delivered and paid in full. Nothing pending — reorder for this buyer in a tap.',
    primary: { label: 'Reorder for buyer', kind: 'secondary' },
    secondary: [{ label: 'Download invoice' }, { label: 'Export to Tally' }],
    danger: null,
    hasInvoice: true,
    showFulfilment: false,
    payment: { tone: 'paid', label: 'Paid in full', amount: true, detail: 'Paid Jul 3 · UPI' },
    events: ['paid', 'delivered', 'dispatched', 'confirmed', 'edited', 'placed'],
  },
  cancelled: {
    stepIdx: -1,
    cancelledAfter: 0, // cancelled while still "received"
    nextLine: 'Cancelled before dispatch. Reserved stock was released back to inventory.',
    primary: { label: 'Reorder for buyer', kind: 'secondary' },
    secondary: [{ label: 'View reason' }],
    danger: null,
    hasInvoice: false,
    showFulfilment: false,
    payment: { tone: 'void', label: 'No charge', amount: null, detail: 'Order was cancelled — nothing billed.' },
    events: ['cancelled', 'placed'],
  },
};

// Tone → status-pill tone used by StatusTag (success/warning/danger/accent/neutral)
const ORDER_STATUS_TONE = {
  received:   'neutral',
  confirmed:  'accent',
  dispatched: 'warning',
  delivered:  'success',
  cancelled:  'danger',
};

// The order-log rows behind the drawer (Direction C). Self-contained so this
// page doesn't depend on the cockpit kit's data module.
const ORDERS_LIST = [
  { id: 'DF-2026-00471', buyer: 'Rajan Wine Merchants', items: 3, status: 'dispatched', total: 84200,  placed: '2h ago',   catalog: 'Summer Pours' },
  { id: 'DF-2026-00470', buyer: 'Verma & Sons',         items: 4, status: 'confirmed',  total: 336442, placed: '5h ago',   catalog: 'Summer Pours' },
  { id: 'DF-2026-00469', buyer: 'Mehta Brothers',       items: 5, status: 'delivered',  total: 46820,  placed: 'Yesterday', catalog: 'New Arrivals · May' },
  { id: 'DF-2026-00468', buyer: 'Singh Hospitality',    items: 28, status: 'received',  total: 612400, placed: 'Yesterday', catalog: 'Premium Reserve' },
  { id: 'DF-2026-00467', buyer: 'Kapoor Spirits',       items: 4, status: 'cancelled',  total: 18900,  placed: '2d ago',    catalog: 'Summer Pours' },
  { id: 'DF-2026-00466', buyer: 'Rajan Wine Merchants', items: 9, status: 'delivered',  total: 124300, placed: '2d ago',    catalog: 'Premium Reserve' },
  { id: 'DF-2026-00465', buyer: 'Mehta Brothers',       items: 6, status: 'dispatched', total: 78200,  placed: '3d ago',    catalog: 'New Arrivals · May' },
];

// INR with Indian comma grouping (12,40,000 not 1,240,000). Scoped here so the
// page is independent of the cockpit kit.
function inr(n) {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

Object.assign(window, {
  ORDER, ORDER_STAGES, ORDER_EVENTS, ORDER_STATE_CONFIG, ORDER_STATUS_TONE,
  ORDERS_LIST, inr,
});
