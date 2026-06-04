// ui_kits/buyer-app/icons.jsx
// Minimal icon set for the buyer app.

const BIcon = ({ size = 22, stroke = 1.5, children, style }) => (
  React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round', style,
  }, children)
);

const BIconCatalog = (p) => React.createElement(BIcon, p,
  React.createElement('path', { d: 'M4 19V6a2 2 0 0 1 2-2h11l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' }),
  React.createElement('path', { d: 'M8 9h8M8 13h8M8 17h5' })
);
const BIconGrid = (p) => React.createElement(BIcon, p,
  React.createElement('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
  React.createElement('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
  React.createElement('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }),
  React.createElement('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 })
);
const BIconCart = (p) => React.createElement(BIcon, p,
  React.createElement('circle', { cx: 9, cy: 20, r: 1.5 }),
  React.createElement('circle', { cx: 18, cy: 20, r: 1.5 }),
  React.createElement('path', { d: 'M3 4h2l3 12h11l2-8H6' })
);
const BIconBox = (p) => React.createElement(BIcon, p,
  React.createElement('path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' }),
  React.createElement('path', { d: 'M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12' })
);
const BIconBack = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M15 6l-6 6 6 6' }));
const BIconSearch = (p) => React.createElement(BIcon, p, React.createElement('circle', { cx: 11, cy: 11, r: 7 }), React.createElement('path', { d: 'M21 21l-4-4' }));
const BIconClose = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M18 6L6 18M6 6l12 12' }));
const BIconPlus = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M12 5v14M5 12h14' }));
const BIconMinus = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M5 12h14' }));
const BIconCheck = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M20 6L9 17l-5-5' }));
const BIconChevR = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M9 6l6 6-6 6' }));
const BIconChevD = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M6 9l6 6 6-6' }));
const BIconHeart = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' }));
const BIconUser = (p) => React.createElement(BIcon, p, React.createElement('circle', { cx: 12, cy: 8, r: 4 }), React.createElement('path', { d: 'M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2' }));
const BIconChat = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }));
const BIconClock = (p) => React.createElement(BIcon, p, React.createElement('circle', { cx: 12, cy: 12, r: 9 }), React.createElement('path', { d: 'M12 7v5l3 2' }));
const BIconHome = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }), React.createElement('path', { d: 'M9 22V12h6v10' }));
const BIconPin  = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M12 22s8-7.58 8-13a8 8 0 0 0-16 0c0 5.42 8 13 8 13z' }), React.createElement('circle', { cx: 12, cy: 9, r: 2.5 }));
const BIconWine = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M8 22h8M12 17v5M8 3h8l-1 6a4 4 0 0 1-3 4h0a4 4 0 0 1-3-4z' }));
const BIconBeer = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M17 11h3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3' }), React.createElement('rect', { x: 4, y: 7, width: 13, height: 14, rx: 1 }), React.createElement('path', { d: 'M8 7V4M12 7V4M16 7V4' }));
const BIconSpark= (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z' }));
const BIconBell = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9' }), React.createElement('path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }));
const BIconHelp = (p) => React.createElement(BIcon, p, React.createElement('circle', { cx: 12, cy: 12, r: 9 }), React.createElement('path', { d: 'M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17h.01' }));
const BIconLogout = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9' }));
const BIconShield = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12z' }));
const BIconCard = (p) => React.createElement(BIcon, p, React.createElement('rect', { x: 2, y: 5, width: 20, height: 14, rx: 2 }), React.createElement('path', { d: 'M2 10h20' }));
const BIconReceipt = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M6 2h12v20l-3-2-3 2-3-2-3 2z' }), React.createElement('path', { d: 'M9 7h6M9 11h6M9 15h4' }));
const BIconEdit = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }), React.createElement('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }));
const BIconSort = (p) => React.createElement(BIcon, p, React.createElement('path', { d: 'M3 6h18M6 12h12M10 18h4' }));

Object.assign(window, {
  BIconCatalog, BIconGrid, BIconCart, BIconBox, BIconBack, BIconSearch,
  BIconClose, BIconPlus, BIconMinus, BIconCheck, BIconChevR, BIconChevD,
  BIconHeart, BIconUser, BIconChat, BIconClock,
  BIconHome, BIconPin, BIconWine, BIconBeer, BIconSpark, BIconBell,
  BIconHelp, BIconLogout, BIconShield, BIconCard,
  BIconReceipt, BIconEdit, BIconSort,
});
