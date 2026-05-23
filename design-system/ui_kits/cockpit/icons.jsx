// ui_kits/cockpit/icons.jsx
// Inline Lucide-style SVG icons. Stroke 1.5, currentColor.
// Kept minimal; add more as needed.

const Icon = ({ d, size = 18, stroke = 1.5, fill = 'none', children, style }) => (
  React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24',
    fill, stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
    style,
  }, children || React.createElement('path', { d }))
);

const IconHome    = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }), React.createElement('path', { d: 'M9 22V12h6v10' }));
const IconBrands  = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z' }), React.createElement('path', { d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }));
const IconProduct = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' }), React.createElement('path', { d: 'M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12' }));
const IconBuyers  = (p) => React.createElement(Icon, p, React.createElement('circle', { cx: 9, cy: 7, r: 4 }), React.createElement('path', { d: 'M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2' }), React.createElement('path', { d: 'M19 8v6m-3-3h6' }));
const IconCohort  = (p) => React.createElement(Icon, p, React.createElement('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }), React.createElement('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }), React.createElement('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }), React.createElement('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }));
const IconPrice   = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M21 11.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7' }), React.createElement('path', { d: 'M3 10h18' }), React.createElement('path', { d: 'M16 19h6m-3-3v6' }));
const IconCatalog = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M4 19V6a2 2 0 0 1 2-2h11l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' }), React.createElement('path', { d: 'M8 9h8M8 13h8M8 17h5' }));
const IconOrders  = (p) => React.createElement(Icon, p, React.createElement('circle', { cx: 9, cy: 20, r: 1.5 }), React.createElement('circle', { cx: 18, cy: 20, r: 1.5 }), React.createElement('path', { d: 'M3 4h2l3 12h11l2-8H6' }));
const IconExport  = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }), React.createElement('path', { d: 'M7 10l5 5 5-5' }), React.createElement('path', { d: 'M12 15V3' }));
const IconSettings= (p) => React.createElement(Icon, p, React.createElement('circle', { cx: 12, cy: 12, r: 3 }), React.createElement('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.32.77.92 1.3 1.51 1h.09a2 2 0 0 1 0 4h-.09c-.65 0-1.25.39-1.51 1z' }));
const IconSearch  = (p) => React.createElement(Icon, p, React.createElement('circle', { cx: 11, cy: 11, r: 7 }), React.createElement('path', { d: 'M21 21l-4-4' }));
const IconChev    = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M6 9l6 6 6-6' }));
const IconChevR   = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M9 6l6 6-6 6' }));
const IconArrowUp = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M5 12l5-5 5 5M10 19V7' }));
const IconArrowDn = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M5 12l5 5 5-5M10 5v14' }));
const IconPlus    = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M12 5v14M5 12h14' }));
const IconCheck   = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M20 6L9 17l-5-5' }));
const IconBell    = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9' }), React.createElement('path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }));
const IconClose   = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M18 6L6 18M6 6l12 12' }));
const IconFilter  = (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' }));
const IconExternal= (p) => React.createElement(Icon, p, React.createElement('path', { d: 'M15 3h6v6M10 14L21 3M21 14v7H3V3h7' }));
const IconCalendar= (p) => React.createElement(Icon, p, React.createElement('rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }), React.createElement('path', { d: 'M16 2v4M8 2v4M3 10h18' }));

Object.assign(window, {
  IconHome, IconBrands, IconProduct, IconBuyers, IconCohort, IconPrice, IconCatalog, IconOrders,
  IconExport, IconSettings, IconSearch, IconChev, IconChevR, IconArrowUp, IconArrowDn,
  IconPlus, IconCheck, IconBell, IconClose, IconFilter, IconExternal, IconCalendar,
});
