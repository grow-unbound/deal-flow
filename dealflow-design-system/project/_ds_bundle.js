/* @ds-bundle: {"format":3,"namespace":"DealFlowDesignSystem_13780f","components":[{"name":"Calendar","sourcePath":"dialogs/Calendar.jsx"}],"sourceHashes":{"brands/EntityCockpits.jsx":"201548e77ac6","brands/Shared.jsx":"f421fc43f803","brands/VariationA.jsx":"24881466809c","brands/VariationB.jsx":"ecc60aa09183","brands/VariationC.jsx":"8b727fbaebf6","brands/data.jsx":"871bd7946953","brands/design-canvas.jsx":"3b0e985041dd","brands/tweaks-panel.jsx":"82c387552588","details/Edit.jsx":"5b286043e48e","details/Patterns.jsx":"3eac17c3ce3e","details/Perf.jsx":"e7d56b372cef","details/SharedDetails.jsx":"76c572313d91","details/data.jsx":"22fb82f97788","dialogs/Calendar.jsx":"c1f6986a4ae9","dialogs/composers-extra.jsx":"5bc695d8291e","dialogs/composers.jsx":"15f933e0b6a6","dialogs/design-canvas.jsx":"bd8746af6e58","dialogs/documents-modals.jsx":"1e8d31dbc8de","dialogs/documents-states.jsx":"8359a9c6fbb1","dialogs/documents.jsx":"a9b792fd04a2","dialogs/modals.jsx":"1682e3e87967","dialogs/shared.jsx":"444cb7dbab7c","dialogs/slideovers.jsx":"fe52b06c68f3","dialogs/system.jsx":"8ce5d5aab24e","ui_kits/buyer-app/Screens.jsx":"1a545723ba40","ui_kits/buyer-app/data.jsx":"0b363d3e6359","ui_kits/buyer-app/icons.jsx":"1d78d5431fc8","ui_kits/buyer-app/ios-frame.jsx":"d67eb3ffe562","ui_kits/cockpit/Catalogs.jsx":"8ea71b920a5a","ui_kits/cockpit/Common.jsx":"d004eb4ee976","ui_kits/cockpit/Dashboard.jsx":"b8fcb63613ea","ui_kits/cockpit/Orders.jsx":"b93c6c79860f","ui_kits/cockpit/Publisher.jsx":"54b4ff542cdc","ui_kits/cockpit/Shell.jsx":"8da41759fc61","ui_kits/cockpit/data.jsx":"e34047b08b6e","ui_kits/cockpit/icons.jsx":"4ddce9444347","v2/DetailsV2.jsx":"304ad5150c8c","v2/Lens.jsx":"c6e4a450e396","v2/Modules.jsx":"16e2e35eaae9","v2/OrdersV2.jsx":"c284556c9731","v2/SharedV2.jsx":"66ba29d53f90","v2/data.jsx":"9712be299376","v2/orders-data.jsx":"b0a957f52ef9","v3/ModulesV3.jsx":"8b8e06019ebc"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DealFlowDesignSystem_13780f = window.DealFlowDesignSystem_13780f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// brands/EntityCockpits.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// brands/EntityCockpits.jsx
// Portfolio Cockpit pattern applied to the other entity landing pages.
// Same chrome as Brands Concept A: PageHeader → InsightStrip → SectionBar
// (search + sort + Report/List toggle) → Leaderboard table + 3 callouts
// (Top performers, Needs attention, Rising).
//
// Each module is a near-mirror of Concept A's body — only the columns,
// KPIs and callout content change. The intent: prove the pattern holds.

/* =============================================================
   Reusable atoms
   ============================================================= */

// Status pill mapped to the verb-pill tones.
function StatusPill({
  status
}) {
  if (!status) return null;
  return /*#__PURE__*/React.createElement(VerbPill, {
    label: status.label,
    tone: status.tone || 'neutral'
  });
}

// Generic ArtboardShell — same chrome, parameterized per entity.
function EntityShell({
  letter,
  conceptTitle,
  conceptSub,
  eyebrow,
  title,
  subtitle,
  horizon,
  primary,
  insights,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "brand-art",
    style: {
      background: 'var(--bg-page)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-art-label"
  }, "Standard entity page \xB7 ", eyebrow), /*#__PURE__*/React.createElement(ConceptTag, {
    letter: letter,
    title: conceptTitle,
    sub: conceptSub
  }), /*#__PURE__*/React.createElement(PageHeaderStd, {
    eyebrow: eyebrow,
    title: title,
    subtitle: subtitle,
    horizon: horizon,
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 15V3"
    })), /*#__PURE__*/React.createElement("span", null, "Export"))), /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-primary"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14M5 12h14"
    })), /*#__PURE__*/React.createElement("span", null, primary))))
  }), /*#__PURE__*/React.createElement(InsightStrip, {
    tiles: insights
  }), children);
}

/* CockpitCallouts — three stacked callout cards.
   Each callout takes { eyebrow, tone, hint, items[] }; renders identical
   layout to Concept A so the visual rhythm is shared across modules. */
function CockpitCallouts({
  attention,
  top,
  rising,
  showAlerts = true
}) {
  if (!showAlerts) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "va-callouts"
  }, attention && /*#__PURE__*/React.createElement(Callout, _extends({}, attention, {
    variant: "attention"
  })), top && /*#__PURE__*/React.createElement(Callout, _extends({}, top, {
    variant: "top"
  })), rising && /*#__PURE__*/React.createElement(Callout, _extends({}, rising, {
    variant: "rising"
  })));
}
function Callout({
  eyebrow,
  hint,
  items,
  variant
}) {
  const isAttention = variant === 'attention';
  return /*#__PURE__*/React.createElement("div", {
    className: 'va-callout' + (isAttention ? ' is-attention' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-callout-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: isAttention ? 'var(--ember-700)' : 'var(--cream-800)'
    }
  }, eyebrow), hint != null && /*#__PURE__*/React.createElement("span", {
    style: isAttention ? {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--ember-600)',
      background: 'var(--ember-50)',
      padding: '2px 7px',
      borderRadius: 999,
      fontWeight: 600
    } : {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--cream-700)'
    }
  }, hint)), /*#__PURE__*/React.createElement("div", {
    className: "va-callout-list"
  }, items.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--cream-700)',
      padding: '4px 0'
    }
  }, "None right now. Everything within thresholds."), items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    className: "va-callout-item",
    key: i,
    style: {
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: it.initials,
    hue: it.hue || 'cream',
    size: 32
  }), /*#__PURE__*/React.createElement("div", {
    className: "col-meta"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "name",
    style: {
      flex: '0 1 auto'
    }
  }, it.name), it.trailing), /*#__PURE__*/React.createElement("div", {
    className: "reason"
  }, it.reason))))));
}

/* Reusable leaderboard scaffolding so each entity table looks identical
   but holds its own columns. `cols` = array of widths matching headers
   and `renderRow` returns React cells for a row. */
function Leaderboard({
  cols,
  headers,
  rows,
  onRow
}) {
  const gridTemplate = cols.join(' ');
  return /*#__PURE__*/React.createElement("div", {
    className: "va-leaderboard"
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-row va-row-head",
    style: {
      gridTemplateColumns: gridTemplate
    }
  }, headers.map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "th",
    style: h.align ? {
      textAlign: h.align
    } : null
  }, h.label))), rows.map((cells, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "va-row",
    style: {
      gridTemplateColumns: gridTemplate
    },
    onClick: () => onRow && onRow(i)
  }, cells)));
}

/* Small entity name + subline cell — the bread-and-butter first column. */
function EntityCell({
  initials,
  hue,
  name,
  sub,
  avatarSize = 38,
  avatar = true
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, avatar ? /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: initials,
    hue: hue,
    size: avatarSize
  }) : /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-name"
  }, name), sub && /*#__PURE__*/React.createElement("div", {
    className: "va-name-sub"
  }, sub)));
}

/* Big number cell (right aligned, display font) */
function NumCell({
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "va-gmv"
  }, value);
}

/* Mono small numeric cell */
function MonoCell({
  value,
  secondary,
  align = 'right'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--cream-800)',
      textAlign: align,
      fontVariantNumeric: 'tabular-nums'
    }
  }, value, secondary != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)'
    }
  }, " ", secondary));
}
const SortTrailing = ({
  value
}) => /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 500
  }
}, value);

/* =============================================================
   PRODUCTS — Catalog cockpit
   ============================================================= */
function ProductsCockpit({
  tweaks
}) {
  const sorted = [...PRODUCTS_DATA].sort((a, b) => b.gmv - a.gmv);
  const top = [...PRODUCTS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const rising = [...PRODUCTS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = PRODUCTS_DATA.filter(p => p.status.tone === 'danger' || p.status.tone === 'warning' || p.growth < 0);
  const insights = [{
    label: 'Catalog GMV',
    value: inrShort(PRODUCTS_AGG.gmv),
    delta: '+8.3%',
    deltaTone: 'up',
    hint: 'vs last month',
    tone: 'accent'
  }, {
    label: 'Active SKUs',
    value: `${PRODUCTS_AGG.active}`,
    hint: `${PRODUCTS_AGG.total} carried`
  }, {
    label: 'Need attention',
    value: `${PRODUCTS_AGG.outOfStock + PRODUCTS_AGG.lowStock}`,
    hint: `${PRODUCTS_AGG.outOfStock} OOS · ${PRODUCTS_AGG.lowStock} low stock`,
    tone: 'warn'
  }, {
    label: 'Avg margin',
    value: '18.4%',
    hint: 'across the catalog'
  }];
  return /*#__PURE__*/React.createElement(EntityShell, {
    letter: "A",
    conceptTitle: "Catalog Cockpit",
    conceptSub: "Top SKUs \xB7 attention SKUs \xB7 rising SKUs",
    eyebrow: "Products",
    title: "357 SKUs. The ones moving this month.",
    subtitle: "Cabernet Sauvignon leads. Estate Chardonnay is out of stock; Tara Gin is thinning. Aravalli Mead is breaking out.",
    horizon: tweaks.horizon,
    primary: "Add a product",
    insights: insights
  }, /*#__PURE__*/React.createElement(SectionBar, {
    title: "All products",
    count: `${PRODUCTS_AGG.total} SKUs · this month`,
    view: "overview",
    sortBy: "GMV (high \u2192 low)",
    searchPlaceholder: "Search SKU, name, brand\u2026"
  }), /*#__PURE__*/React.createElement("div", {
    className: "va-body"
  }, /*#__PURE__*/React.createElement(Leaderboard, {
    cols: ['48px', '1fr', '110px', '90px', '110px', '90px', '24px'],
    headers: [{
      label: ''
    }, {
      label: 'Product'
    }, {
      label: 'GMV · MTD',
      align: 'right'
    }, {
      label: 'Growth'
    }, {
      label: 'Inventory'
    }, {
      label: 'Units',
      align: 'right'
    }, {
      label: ''
    }],
    rows: sorted.slice(0, 6).map(p => [/*#__PURE__*/React.createElement(BrandAvatarSm, {
      key: "av",
      initials: p.brandInitials,
      hue: p.brandHue,
      size: 38
    }), /*#__PURE__*/React.createElement("div", {
      key: "meta",
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "va-name"
    }, p.name), /*#__PURE__*/React.createElement("div", {
      className: "va-name-sub"
    }, p.sku, " \xB7 ", p.category.toUpperCase(), " \xB7 ", p.brand)), /*#__PURE__*/React.createElement(NumCell, {
      key: "gmv",
      value: inrShort(p.gmv)
    }), /*#__PURE__*/React.createElement(GrowthPill, {
      key: "g",
      value: p.growth
    }), /*#__PURE__*/React.createElement("div", {
      key: "inv",
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }
    }, /*#__PURE__*/React.createElement(StatusPill, {
      status: p.status
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--cream-700)'
      }
    }, p.onHand, " on hand \xB7 ", p.daysCover, "d cover")), /*#__PURE__*/React.createElement(MonoCell, {
      key: "u",
      value: p.units
    }), /*#__PURE__*/React.createElement("div", {
      key: "ch",
      className: "va-chev"
    }, "\u203A")])
  }), /*#__PURE__*/React.createElement(CockpitCallouts, {
    showAlerts: tweaks.showAlerts,
    attention: {
      eyebrow: 'Needs attention',
      hint: attention.length,
      items: attention.slice(0, 3).map(p => ({
        initials: p.brandInitials,
        hue: p.brandHue,
        name: p.name,
        reason: p.status.label + ' · ' + (p.growth < 0 ? `GMV ${p.growth}% MoM` : `${p.onHand} on hand · ${p.daysCover}d cover`),
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: p.growth
        })
      }))
    },
    top: {
      eyebrow: 'Top performers',
      hint: 'by GMV',
      items: top.map(p => ({
        initials: p.brandInitials,
        hue: p.brandHue,
        name: p.name,
        reason: `${p.units.toLocaleString()} units · ${p.brand}`,
        trailing: /*#__PURE__*/React.createElement(SortTrailing, {
          value: inrShort(p.gmv)
        })
      }))
    },
    rising: {
      eyebrow: 'Rising',
      hint: 'fastest growth',
      items: rising.map(p => ({
        initials: p.brandInitials,
        hue: p.brandHue,
        name: p.name,
        reason: `${p.brand} · ${inrShort(p.gmv)} MTD`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: p.growth
        })
      }))
    }
  })));
}

/* =============================================================
   CUSTOMERS — Buyer cockpit
   ============================================================= */
function CustomersCockpit({
  tweaks
}) {
  const sorted = [...CUSTOMERS_DATA].sort((a, b) => b.spend - a.spend);
  const top = [...CUSTOMERS_DATA].sort((a, b) => b.spend - a.spend).slice(0, 2);
  const rising = [...CUSTOMERS_DATA].filter(c => c.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = CUSTOMERS_DATA.filter(c => c.status.tone === 'warning' || c.status.tone === 'danger' || c.growth < 0 || c.dues > 80000);
  const insights = [{
    label: 'Buyer spend',
    value: inrShort(CUSTOMERS_AGG.spend),
    delta: '+8.3%',
    deltaTone: 'up',
    hint: 'vs last month',
    tone: 'accent'
  }, {
    label: 'Active buyers',
    value: `${CUSTOMERS_AGG.active}`,
    hint: `of ${CUSTOMERS_AGG.total} on roster`
  }, {
    label: 'Need attention',
    value: `${CUSTOMERS_AGG.dormant + CUSTOMERS_AGG.atRisk}`,
    hint: `${CUSTOMERS_AGG.dormant} dormant · ${CUSTOMERS_AGG.atRisk} at risk`,
    tone: 'warn'
  }, {
    label: 'Dues outstanding',
    value: inrShort(CUSTOMERS_AGG.duesTotal),
    hint: 'across 6 buyers'
  }];
  return /*#__PURE__*/React.createElement(EntityShell, {
    letter: "A",
    conceptTitle: "Buyer Cockpit",
    conceptSub: "Top spenders \xB7 need a call \xB7 rising",
    eyebrow: "Customers",
    title: "142 buyers. Who's spending, who's gone quiet.",
    subtitle: "Singh Hospitality leads spend this month. Capitol Spirits has gone dormant with full credit drawn. Rajan Wine Merchants is up 32%.",
    horizon: tweaks.horizon,
    primary: "Invite a buyer",
    insights: insights
  }, /*#__PURE__*/React.createElement(SectionBar, {
    title: "All buyers",
    count: `${CUSTOMERS_AGG.total} buyers · this month`,
    view: "overview",
    sortBy: "Spend (high \u2192 low)",
    searchPlaceholder: "Search buyer, city, cohort\u2026"
  }), /*#__PURE__*/React.createElement("div", {
    className: "va-body"
  }, /*#__PURE__*/React.createElement(Leaderboard, {
    cols: ['48px', '1fr', '110px', '90px', '120px', '90px', '24px'],
    headers: [{
      label: ''
    }, {
      label: 'Buyer'
    }, {
      label: 'Spend · MTD',
      align: 'right'
    }, {
      label: 'Growth'
    }, {
      label: 'Credit drawn'
    }, {
      label: 'Orders',
      align: 'right'
    }, {
      label: ''
    }],
    rows: sorted.map(c => {
      const pct = Math.round(c.credit.used / c.credit.limit * 100);
      const hue = c.hue === 'ember' ? 'ember' : 'teal';
      return [/*#__PURE__*/React.createElement(BrandAvatarSm, {
        key: "av",
        initials: c.initials,
        hue: c.hue,
        size: 38
      }), /*#__PURE__*/React.createElement("div", {
        key: "meta",
        style: {
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "va-name"
      }, c.name), /*#__PURE__*/React.createElement("div", {
        className: "va-name-sub"
      }, c.city.toUpperCase(), " \xB7 TIER ", c.tier, " \xB7 ", c.cohort)), /*#__PURE__*/React.createElement(NumCell, {
        key: "gmv",
        value: inrShort(c.spend)
      }), /*#__PURE__*/React.createElement(GrowthPill, {
        key: "g",
        value: c.growth
      }), /*#__PURE__*/React.createElement("div", {
        key: "credit",
        className: "va-share"
      }, /*#__PURE__*/React.createElement(ShareBar, {
        pct: pct,
        hue: pct > 80 ? 'ember' : 'teal'
      }), /*#__PURE__*/React.createElement("div", {
        className: "va-share-num"
      }, pct, "% of ", inrShort(c.credit.limit))), /*#__PURE__*/React.createElement(MonoCell, {
        key: "o",
        value: c.orders,
        secondary: `· ${c.lastOrder}`
      }), /*#__PURE__*/React.createElement("div", {
        key: "ch",
        className: "va-chev"
      }, "\u203A")];
    })
  }), /*#__PURE__*/React.createElement(CockpitCallouts, {
    showAlerts: tweaks.showAlerts,
    attention: {
      eyebrow: 'Needs a call',
      hint: attention.length,
      items: attention.slice(0, 3).map(c => ({
        initials: c.initials,
        hue: c.hue,
        name: c.name,
        reason: c.dues > 0 ? `Last order ${c.lastOrder} · ${inrShort(c.dues)} dues` : `Last order ${c.lastOrder} · spend ${c.growth}% MoM`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: c.growth
        })
      }))
    },
    top: {
      eyebrow: 'Top spenders',
      hint: 'by GMV',
      items: top.map(c => ({
        initials: c.initials,
        hue: c.hue,
        name: c.name,
        reason: `${c.orders} orders · ${c.city}`,
        trailing: /*#__PURE__*/React.createElement(SortTrailing, {
          value: inrShort(c.spend)
        })
      }))
    },
    rising: {
      eyebrow: 'Rising',
      hint: 'fastest growth',
      items: rising.map(c => ({
        initials: c.initials,
        hue: c.hue,
        name: c.name,
        reason: `${c.city} · ${inrShort(c.spend)} this month`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: c.growth
        })
      }))
    }
  })));
}

/* =============================================================
   ORDERS — Order cockpit
   ============================================================= */
function OrdersCockpit({
  tweaks
}) {
  const sorted = [...ORDERS_DATA];
  const top = [...ORDERS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const attention = ORDERS_DATA.filter(o => o.status.tone === 'warning' || o.status.tone === 'danger');
  const inTransit = ORDERS_DATA.filter(o => o.status.label === 'In transit').slice(0, 2);
  const insights = [{
    label: 'Order GMV · MTD',
    value: inrShort(ORDERS_AGG.gmv),
    delta: '+14%',
    deltaTone: 'up',
    hint: 'vs last month',
    tone: 'accent'
  }, {
    label: 'Orders this month',
    value: `${ORDERS_AGG.total}`,
    hint: `${ORDERS_AGG.deliveredMTD} delivered`
  }, {
    label: 'Need attention',
    value: `${ORDERS_AGG.holds + ORDERS_AGG.pendingDispatch}`,
    hint: `${ORDERS_AGG.holds} hold · ${ORDERS_AGG.pendingDispatch} pending dispatch`,
    tone: 'warn'
  }, {
    label: 'AOV',
    value: inrShort(ORDERS_AGG.aov),
    hint: '+₹3.2K vs last month'
  }];
  return /*#__PURE__*/React.createElement(EntityShell, {
    letter: "A",
    conceptTitle: "Order Cockpit",
    conceptSub: "Recent \xB7 need attention \xB7 biggest tickets",
    eyebrow: "Orders",
    title: "28 orders this month. \u20B912.5 L on the books.",
    subtitle: "Mehta Brothers is the largest order of the week. Kapoor Spirits is on hold awaiting credit approval; Capitol Spirits cancelled.",
    horizon: tweaks.horizon,
    primary: "New order",
    insights: insights
  }, /*#__PURE__*/React.createElement(SectionBar, {
    title: "All orders",
    count: `${ORDERS_AGG.total} orders · this month`,
    view: "overview",
    sortBy: "Most recent",
    searchPlaceholder: "Search order, buyer, status\u2026"
  }), /*#__PURE__*/React.createElement("div", {
    className: "va-body"
  }, /*#__PURE__*/React.createElement(Leaderboard, {
    cols: ['48px', '1fr', '130px', '110px', '60px', '110px', '24px'],
    headers: [{
      label: ''
    }, {
      label: 'Buyer · Order'
    }, {
      label: 'Delivery'
    }, {
      label: 'Status'
    }, {
      label: 'Items',
      align: 'right'
    }, {
      label: 'GMV',
      align: 'right'
    }, {
      label: ''
    }],
    rows: sorted.map(o => [/*#__PURE__*/React.createElement(BrandAvatarSm, {
      key: "av",
      initials: o.buyerInitials,
      hue: o.buyerHue,
      size: 38
    }), /*#__PURE__*/React.createElement("div", {
      key: "meta",
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "va-name"
    }, o.buyer), /*#__PURE__*/React.createElement("div", {
      className: "va-name-sub"
    }, o.id, " \xB7 PLACED ", o.placed.toUpperCase())), /*#__PURE__*/React.createElement("div", {
      key: "del",
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        color: 'var(--cream-800)'
      }
    }, o.delivery), /*#__PURE__*/React.createElement(StatusPill, {
      key: "st",
      status: o.status
    }), /*#__PURE__*/React.createElement(MonoCell, {
      key: "it",
      value: o.items
    }), /*#__PURE__*/React.createElement(NumCell, {
      key: "gmv",
      value: inrShort(o.gmv)
    }), /*#__PURE__*/React.createElement("div", {
      key: "ch",
      className: "va-chev"
    }, "\u203A")])
  }), /*#__PURE__*/React.createElement(CockpitCallouts, {
    showAlerts: tweaks.showAlerts,
    attention: {
      eyebrow: 'Needs attention',
      hint: attention.length,
      items: attention.map(o => ({
        initials: o.buyerInitials,
        hue: o.buyerHue,
        name: o.buyer,
        reason: `${o.id} · ${o.status.label} · ${o.delivery}`,
        trailing: /*#__PURE__*/React.createElement(StatusPill, {
          status: o.status
        })
      }))
    },
    top: {
      eyebrow: 'Biggest tickets',
      hint: 'this month',
      items: top.map(o => ({
        initials: o.buyerInitials,
        hue: o.buyerHue,
        name: o.buyer,
        reason: `${o.id} · ${o.items} items · ${o.delivery}`,
        trailing: /*#__PURE__*/React.createElement(SortTrailing, {
          value: inrShort(o.gmv)
        })
      }))
    },
    rising: {
      eyebrow: 'In motion',
      hint: 'dispatching now',
      items: inTransit.map(o => ({
        initials: o.buyerInitials,
        hue: o.buyerHue,
        name: o.buyer,
        reason: `${o.id} · ${o.delivery} · ${inrShort(o.gmv)}`,
        trailing: /*#__PURE__*/React.createElement(StatusPill, {
          status: o.status
        })
      }))
    }
  })));
}

/* =============================================================
   COHORTS — Cohort cockpit
   ============================================================= */
function CohortsCockpit({
  tweaks
}) {
  const sorted = [...COHORTS_DATA].sort((a, b) => b.gmv - a.gmv);
  const top = [...COHORTS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const rising = [...COHORTS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = [...COHORTS_DATA].sort((a, b) => a.conversion - b.conversion).slice(0, 2);
  const insights = [{
    label: 'Cohort GMV',
    value: inrShort(COHORTS_AGG.gmv),
    delta: '+11.2%',
    deltaTone: 'up',
    hint: 'vs last month',
    tone: 'accent'
  }, {
    label: 'Cohorts active',
    value: `${COHORTS_AGG.total}`,
    hint: `${COHORTS_AGG.members} of ${COHORTS_AGG.totalBuyers} buyers grouped`
  }, {
    label: 'Need attention',
    value: '1',
    hint: 'Hospitality conversion below 30%',
    tone: 'warn'
  }, {
    label: 'Avg conversion',
    value: `${COHORTS_AGG.conversion}%`,
    hint: 'cohort → order'
  }];
  return /*#__PURE__*/React.createElement(EntityShell, {
    letter: "A",
    conceptTitle: "Cohort Cockpit",
    conceptSub: "Top GMV \xB7 low conversion \xB7 rising",
    eyebrow: "Cohorts",
    title: "Four cohorts. Where the demand actually clusters.",
    subtitle: "Maharashtra Premium is the largest. South India Specialty is growing fastest at +18%. Hospitality buys big but converts slowly.",
    horizon: tweaks.horizon,
    primary: "New cohort",
    insights: insights
  }, /*#__PURE__*/React.createElement(SectionBar, {
    title: "All cohorts",
    count: `${COHORTS_AGG.total} cohorts · this month`,
    view: "overview",
    sortBy: "GMV (high \u2192 low)",
    searchPlaceholder: "Search cohort or buyer\u2026"
  }), /*#__PURE__*/React.createElement("div", {
    className: "va-body"
  }, /*#__PURE__*/React.createElement(Leaderboard, {
    cols: ['48px', '1fr', '110px', '90px', '140px', '70px', '24px'],
    headers: [{
      label: ''
    }, {
      label: 'Cohort'
    }, {
      label: 'GMV · MTD',
      align: 'right'
    }, {
      label: 'Growth'
    }, {
      label: 'Conversion'
    }, {
      label: 'Members',
      align: 'right'
    }, {
      label: ''
    }],
    rows: sorted.map(c => [/*#__PURE__*/React.createElement(BrandAvatarSm, {
      key: "av",
      initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''),
      hue: c.hue,
      size: 38
    }), /*#__PURE__*/React.createElement("div", {
      key: "meta",
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "va-name"
    }, c.name), /*#__PURE__*/React.createElement("div", {
      className: "va-name-sub"
    }, c.primaryBrands.join(' · '), " \xB7 ", c.catalogs, " CATALOGS \xB7 AOV ", inrShort(c.aov))), /*#__PURE__*/React.createElement(NumCell, {
      key: "gmv",
      value: inrShort(c.gmv)
    }), /*#__PURE__*/React.createElement(GrowthPill, {
      key: "g",
      value: c.growth
    }), /*#__PURE__*/React.createElement("div", {
      key: "conv",
      className: "va-share"
    }, /*#__PURE__*/React.createElement(ShareBar, {
      pct: c.conversion,
      hue: c.conversion < 30 ? 'ember' : 'teal'
    }), /*#__PURE__*/React.createElement("div", {
      className: "va-share-num"
    }, c.conversion, "% \xB7 ", c.active, " active")), /*#__PURE__*/React.createElement(MonoCell, {
      key: "m",
      value: c.members,
      secondary: `/ ${c.totalBuyers}`
    }), /*#__PURE__*/React.createElement("div", {
      key: "ch",
      className: "va-chev"
    }, "\u203A")])
  }), /*#__PURE__*/React.createElement(CockpitCallouts, {
    showAlerts: tweaks.showAlerts,
    attention: {
      eyebrow: 'Low conversion',
      hint: attention.length,
      items: attention.slice(0, 2).map(c => ({
        initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''),
        hue: c.hue,
        name: c.name,
        reason: `${c.conversion}% conversion · ${c.active} of ${c.members} active`,
        trailing: /*#__PURE__*/React.createElement(SortTrailing, {
          value: c.conversion + '%'
        })
      }))
    },
    top: {
      eyebrow: 'Top performers',
      hint: 'by GMV',
      items: top.map(c => ({
        initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''),
        hue: c.hue,
        name: c.name,
        reason: `${c.members} buyers · AOV ${inrShort(c.aov)}`,
        trailing: /*#__PURE__*/React.createElement(SortTrailing, {
          value: inrShort(c.gmv)
        })
      }))
    },
    rising: {
      eyebrow: 'Rising',
      hint: 'fastest growth',
      items: rising.map(c => ({
        initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''),
        hue: c.hue,
        name: c.name,
        reason: `${c.catalogs} catalogs live · ${c.active} active`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: c.growth
        })
      }))
    }
  })));
}

/* =============================================================
   CATALOGS — Catalog cockpit
   ============================================================= */
function CatalogsCockpit({
  tweaks
}) {
  const sorted = [...CATALOGS_DATA].sort((a, b) => b.gmv - a.gmv);
  const top = sorted.filter(c => c.status.tone === 'success').slice(0, 2);
  const rising = [...CATALOGS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = CATALOGS_DATA.filter(c => c.status.label === 'Draft' || c.status.label === 'Ended' || c.growth < 0 || c.daysLeft != null && c.daysLeft <= 5 && c.daysLeft > 0);
  const insights = [{
    label: 'Catalog GMV',
    value: inrShort(CATALOGS_AGG.gmv),
    delta: '+14.2%',
    deltaTone: 'up',
    hint: 'vs last month',
    tone: 'accent'
  }, {
    label: 'Live catalogs',
    value: `${CATALOGS_AGG.live}`,
    hint: `${CATALOGS_AGG.draft} draft · ${CATALOGS_AGG.ended} ended`
  }, {
    label: 'Need attention',
    value: '2',
    hint: 'Vintage ended · Monsoon draft',
    tone: 'warn'
  }, {
    label: 'Open → order',
    value: `${CATALOGS_AGG.conversion}%`,
    hint: `${CATALOGS_AGG.orders} orders MTD`
  }];
  return /*#__PURE__*/React.createElement(EntityShell, {
    letter: "A",
    conceptTitle: "Catalog Cockpit",
    conceptSub: "Best converting \xB7 expiring soon \xB7 rising",
    eyebrow: "Catalogs",
    title: "Four catalogs in market. \u20B912.7 L written off them.",
    subtitle: "Premium Reserve is the highest-grossing catalog. Summer Pours expires in 4 days and is still climbing. Monsoon Specials hasn't shipped yet.",
    horizon: tweaks.horizon,
    primary: "Publish catalog",
    insights: insights
  }, /*#__PURE__*/React.createElement(SectionBar, {
    title: "All catalogs",
    count: `${CATALOGS_AGG.total} catalogs · this month`,
    view: "overview",
    sortBy: "GMV (high \u2192 low)",
    searchPlaceholder: "Search catalog or cohort\u2026"
  }), /*#__PURE__*/React.createElement("div", {
    className: "va-body"
  }, /*#__PURE__*/React.createElement(Leaderboard, {
    cols: ['48px', '1fr', '100px', '110px', '130px', '80px', '24px'],
    headers: [{
      label: ''
    }, {
      label: 'Catalog'
    }, {
      label: 'Status'
    }, {
      label: 'GMV · MTD',
      align: 'right'
    }, {
      label: 'Conversion'
    }, {
      label: 'Valid',
      align: 'right'
    }, {
      label: ''
    }],
    rows: sorted.map(c => [/*#__PURE__*/React.createElement(BrandAvatarSm, {
      key: "av",
      initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''),
      hue: c.hue,
      size: 38
    }), /*#__PURE__*/React.createElement("div", {
      key: "meta",
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "va-name"
    }, c.name), /*#__PURE__*/React.createElement("div", {
      className: "va-name-sub"
    }, c.cohort.toUpperCase(), " \xB7 ", c.products, " SKUS \xB7 ", c.brands, " BRANDS")), /*#__PURE__*/React.createElement(StatusPill, {
      key: "st",
      status: c.status
    }), /*#__PURE__*/React.createElement(NumCell, {
      key: "gmv",
      value: c.gmv > 0 ? inrShort(c.gmv) : '—'
    }), /*#__PURE__*/React.createElement("div", {
      key: "conv",
      className: "va-share"
    }, /*#__PURE__*/React.createElement(ShareBar, {
      pct: c.conversion,
      hue: c.conversion < 30 ? 'ember' : 'teal'
    }), /*#__PURE__*/React.createElement("div", {
      className: "va-share-num"
    }, c.conversion > 0 ? `${c.conversion}% · ${c.orders} orders` : 'not opened')), /*#__PURE__*/React.createElement(MonoCell, {
      key: "v",
      value: c.status.label === 'Draft' ? '—' : c.daysLeft > 0 ? `${c.daysLeft}d` : 'ended',
      secondary: c.status.label === 'Draft' ? '' : `· ${c.validUntil}`
    }), /*#__PURE__*/React.createElement("div", {
      key: "ch",
      className: "va-chev"
    }, "\u203A")])
  }), /*#__PURE__*/React.createElement(CockpitCallouts, {
    showAlerts: tweaks.showAlerts,
    attention: {
      eyebrow: 'Needs attention',
      hint: attention.length,
      items: attention.slice(0, 3).map(c => ({
        initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''),
        hue: c.hue,
        name: c.name,
        reason: c.status.label === 'Draft' ? 'Draft · not yet shipped to cohort' : c.status.label === 'Ended' ? `Ended ${c.validUntil} · ${c.orders} orders` : `Expires in ${c.daysLeft} days · ${c.orders} orders`,
        trailing: /*#__PURE__*/React.createElement(StatusPill, {
          status: c.status
        })
      }))
    },
    top: {
      eyebrow: 'Top performers',
      hint: 'by GMV',
      items: top.map(c => ({
        initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''),
        hue: c.hue,
        name: c.name,
        reason: `${c.cohort} · ${c.orders} orders · ${c.conversion}% conv.`,
        trailing: /*#__PURE__*/React.createElement(SortTrailing, {
          value: inrShort(c.gmv)
        })
      }))
    },
    rising: {
      eyebrow: 'Rising',
      hint: 'fastest growth',
      items: rising.filter(c => c.growth > 0).map(c => ({
        initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''),
        hue: c.hue,
        name: c.name,
        reason: `${c.cohort} · expires in ${c.daysLeft}d`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: c.growth
        })
      }))
    }
  })));
}
Object.assign(window, {
  ProductsCockpit,
  CustomersCockpit,
  OrdersCockpit,
  CohortsCockpit,
  CatalogsCockpit
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "brands/EntityCockpits.jsx", error: String((e && e.message) || e) }); }

// brands/Shared.jsx
try { (() => {
// brands/Shared.jsx — Reusable chrome for entity landing pages.
// PageHeader, InsightStrip, SectionBar (with view switcher), MiniSpark,
// GrowthPill, VerbPill, ShareBar, BrandAvatar (local copy for sizing).

function MiniSpark({
  data,
  width = 110,
  height = 30,
  tone = 'auto'
}) {
  // tone: 'auto' = green if last > first, red if last < first.
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = i / (data.length - 1) * width;
    const y = height - 4 - (v - min) / range * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  let cls = 'spark';
  if (tone === 'auto') {
    if (data[data.length - 1] < data[0]) cls += ' is-down';else if (data[data.length - 1] === data[0]) cls += ' is-flat';
  } else if (tone === 'down') cls += ' is-down';else if (tone === 'flat') cls += ' is-flat';

  // Fill area below the line for atmosphere.
  const areaPts = pts.concat([`${width},${height}`, `0,${height}`]).join(' ');
  const linePts = pts.join(' ');
  return /*#__PURE__*/React.createElement("svg", {
    className: cls,
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none",
    style: {
      width,
      height
    }
  }, /*#__PURE__*/React.createElement("polygon", {
    points: areaPts,
    fill: "currentColor",
    opacity: "0.10"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: linePts,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
function GrowthPill({
  value
}) {
  const tone = value > 0 ? 'is-up' : value < 0 ? 'is-down' : 'is-flat';
  const sign = value > 0 ? '+' : '';
  // Use Unicode arrows (allowed per design system).
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '·';
  return /*#__PURE__*/React.createElement("span", {
    className: `growth-pill ${tone}`
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, arrow), /*#__PURE__*/React.createElement("span", null, sign, value.toFixed(1), "%"));
}
function VerbPill({
  label,
  tone = 'neutral'
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `verb-pill is-${tone}`
  }, label);
}
function ShareBar({
  pct,
  hue = 'teal'
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `share-bar is-${hue}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "fill",
    style: {
      width: pct + '%'
    }
  }));
}
function BrandAvatarSm({
  initials,
  hue = 'cream',
  size = 38
}) {
  const map = {
    cream: {
      bg: '#F4EFE6',
      fg: '#1F3A34',
      border: '#EFE9DF'
    },
    teal: {
      bg: '#EAF1EE',
      fg: '#1F3A34',
      border: '#C6DAD3'
    },
    ember: {
      bg: '#FBEFE3',
      fg: '#874720',
      border: '#F5DAB8'
    }
  };
  const c = map[hue] || map.cream;
  return /*#__PURE__*/React.createElement("div", {
    className: "brand-avatar",
    style: {
      width: size,
      height: size,
      background: c.bg,
      color: c.fg,
      borderColor: c.border,
      fontSize: size * 0.36
    }
  }, initials);
}

/* =========================================================
   PageHeader — shared across every entity landing page
   ========================================================= */
function PageHeaderStd({
  eyebrow,
  title,
  subtitle,
  horizon = 'This month',
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "page-header"
  }, /*#__PURE__*/React.createElement("div", null, eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    className: "page-title"
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "page-subtitle"
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    className: "page-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "horizon-picker"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Showing"), /*#__PURE__*/React.createElement("span", null, horizon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--cream-600)'
    }
  }, "\u25BE")), actions));
}

/* =========================================================
   InsightStrip — 4 portfolio-level KPI tiles.
   This component shape is reused for Products / Customers / etc.
   ========================================================= */
function InsightStrip({
  tiles
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "insight-strip"
  }, tiles.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'insight-tile ' + (t.tone === 'accent' ? 'is-accent' : t.tone === 'warn' ? 'is-warn' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, t.label), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, t.value), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, t.delta && /*#__PURE__*/React.createElement("span", {
    className: t.deltaTone === 'down' ? 'delta-down' : 'delta-up'
  }, t.deltaTone === 'down' ? '↓' : '↑', " ", t.delta), t.hint && /*#__PURE__*/React.createElement("span", null, t.hint)))));
}

/* =========================================================
   SectionBar — title + count, with the Overview/List view switch
   + filters/sort on the right. The view-switch lives here so every
   entity page has the same toggle anatomy.
   ========================================================= */
function SectionBar({
  title,
  count,
  view = 'overview',
  onView,
  sortBy = 'GMV (high → low)',
  searchPlaceholder = 'Search…'
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "section-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-bar-left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, title, count != null && /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, count)), /*#__PURE__*/React.createElement("div", {
    className: "section-bar-inline"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inline-search"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 21l-4-4"
  })), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: searchPlaceholder
  })), /*#__PURE__*/React.createElement("button", {
    className: "sort-btn"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Sort"), /*#__PURE__*/React.createElement("span", null, sortBy), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--cream-600)'
    }
  }, "\u25BE")))), /*#__PURE__*/React.createElement("div", {
    className: "controls"
  }, /*#__PURE__*/React.createElement("div", {
    className: "view-switch"
  }, /*#__PURE__*/React.createElement("button", {
    className: view === 'overview' ? 'is-active' : '',
    onClick: () => onView && onView('overview')
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "7",
    height: "9",
    rx: "1.2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "3",
    width: "7",
    height: "5",
    rx: "1.2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "12",
    width: "7",
    height: "9",
    rx: "1.2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "16",
    width: "7",
    height: "5",
    rx: "1.2"
  })), /*#__PURE__*/React.createElement("span", null, "Report")), /*#__PURE__*/React.createElement("button", {
    className: view === 'list' ? 'is-active' : '',
    onClick: () => onView && onView('list')
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"
  })), /*#__PURE__*/React.createElement("span", null, "List")))));
}

/* =========================================================
   ConceptTag — variation label inside artboard
   ========================================================= */
function ConceptTag({
  letter,
  title,
  sub
}) {
  const cls = letter === 'B' ? 'concept-tag is-b' : letter === 'C' ? 'concept-tag is-c' : 'concept-tag';
  return /*#__PURE__*/React.createElement("div", {
    className: cls
  }, /*#__PURE__*/React.createElement("i", null, "Concept ", letter), /*#__PURE__*/React.createElement("span", null, title), sub && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-700)',
      letterSpacing: 0,
      textTransform: 'none',
      fontWeight: 400,
      fontSize: 11
    }
  }, "\xB7 ", sub));
}
Object.assign(window, {
  MiniSpark,
  GrowthPill,
  VerbPill,
  ShareBar,
  BrandAvatarSm,
  PageHeaderStd,
  InsightStrip,
  SectionBar,
  ConceptTag
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "brands/Shared.jsx", error: String((e && e.message) || e) }); }

// brands/VariationA.jsx
try { (() => {
// brands/VariationA.jsx — "Portfolio Cockpit"
// Conservative, table-leaning. Leaderboard of brands on the left,
// stacked Top/Attention/Rising callouts on the right.

function VariationA({
  tweaks
}) {
  // Sort the brand list per tweak.
  const sortedBrands = [...BRANDS_DATA].sort((a, b) => {
    if (tweaks.sortBy === 'growth') return b.growth - a.growth;
    if (tweaks.sortBy === 'share') return b.share - a.share;
    if (tweaks.sortBy === 'alpha') return a.name.localeCompare(b.name);
    return b.gmv - a.gmv;
  });
  const sortLabel = {
    gmv: 'GMV (high → low)',
    growth: 'Growth (best → worst)',
    share: 'Share (high → low)',
    alpha: 'A → Z'
  }[tweaks.sortBy] || 'GMV (high → low)';
  const topPerformers = [...BRANDS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const risingBrands = [...BRANDS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attentionBrands = BRANDS_DATA.filter(b => b.alerts.length > 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "va"
  }, /*#__PURE__*/React.createElement(SectionBar, {
    title: "Brand portfolio",
    count: `5 brands · this month`,
    view: "overview",
    sortBy: sortLabel
  }), /*#__PURE__*/React.createElement("div", {
    className: "va-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-leaderboard"
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-row va-row-head"
  }, /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    className: "th"
  }, "Brand"), /*#__PURE__*/React.createElement("div", {
    className: "th",
    style: {
      textAlign: 'right'
    }
  }, "GMV \xB7 MTD"), /*#__PURE__*/React.createElement("div", {
    className: "th"
  }, "Growth"), /*#__PURE__*/React.createElement("div", {
    className: "th"
  }, "Share of portfolio"), /*#__PURE__*/React.createElement("div", {
    className: "th",
    style: {
      textAlign: 'right'
    }
  }, "Buyers"), /*#__PURE__*/React.createElement("div", null)), sortedBrands.map((b, i) => /*#__PURE__*/React.createElement("div", {
    className: "va-row",
    key: b.id
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: b.initials,
    hue: b.hue,
    size: 38
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-name"
  }, b.name), /*#__PURE__*/React.createElement("div", {
    className: "va-name-sub"
  }, b.category.toUpperCase(), " \xB7 ", b.region, " \xB7 ", b.skus, " SKUs")), /*#__PURE__*/React.createElement("div", {
    className: "va-gmv"
  }, inrShort(b.gmv)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(GrowthPill, {
    value: b.growth
  })), /*#__PURE__*/React.createElement("div", {
    className: "va-share"
  }, /*#__PURE__*/React.createElement(ShareBar, {
    pct: b.share * 2.4,
    hue: b.hue
  }), /*#__PURE__*/React.createElement("div", {
    className: "va-share-num"
  }, b.share.toFixed(1), "% of \u20B947.3 L")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--cream-800)',
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums'
    }
  }, b.activeBuyers, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)'
    }
  }, " / ", b.totalBuyers)), /*#__PURE__*/React.createElement("div", {
    className: "va-chev"
  }, "\u203A")))), tweaks.showAlerts !== false && /*#__PURE__*/React.createElement("div", {
    className: "va-callouts"
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-callout is-attention"
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-callout-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      color: 'var(--ember-700)'
    }
  }, "Needs attention"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--ember-600)',
      background: 'var(--ember-50)',
      padding: '2px 7px',
      borderRadius: 999,
      fontWeight: 600
    }
  }, attentionBrands.length)), /*#__PURE__*/React.createElement("div", {
    className: "va-callout-list"
  }, attentionBrands.map(b => /*#__PURE__*/React.createElement("div", {
    className: "va-callout-item",
    key: b.id,
    style: {
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: b.initials,
    hue: b.hue,
    size: 32
  }), /*#__PURE__*/React.createElement("div", {
    className: "col-meta"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "name",
    style: {
      flex: '0 1 auto'
    }
  }, b.name), /*#__PURE__*/React.createElement(GrowthPill, {
    value: b.growth
  })), /*#__PURE__*/React.createElement("div", {
    className: "reason"
  }, b.alerts.slice(0, 2).map(a => a.label).join(' · '))))), attentionBrands.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--cream-700)',
      padding: '4px 0'
    }
  }, "No alerts. All brands are within thresholds."))), /*#__PURE__*/React.createElement("div", {
    className: "va-callout"
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-callout-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Top performers"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--cream-700)'
    }
  }, "by GMV")), /*#__PURE__*/React.createElement("div", {
    className: "va-callout-list"
  }, topPerformers.map(b => /*#__PURE__*/React.createElement("div", {
    className: "va-callout-item",
    key: b.id
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: b.initials,
    hue: b.hue,
    size: 32
  }), /*#__PURE__*/React.createElement("div", {
    className: "col-meta"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, b.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      fontWeight: 500
    }
  }, inrShort(b.gmv))), /*#__PURE__*/React.createElement("div", {
    className: "reason"
  }, b.share.toFixed(1), "% of portfolio \xB7 ", b.activeBuyers, " buyers")))))), /*#__PURE__*/React.createElement("div", {
    className: "va-callout"
  }, /*#__PURE__*/React.createElement("div", {
    className: "va-callout-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Rising"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--cream-700)'
    }
  }, "fastest growth")), /*#__PURE__*/React.createElement("div", {
    className: "va-callout-list"
  }, risingBrands.map(b => /*#__PURE__*/React.createElement("div", {
    className: "va-callout-item",
    key: b.id
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: b.initials,
    hue: b.hue,
    size: 32
  }), /*#__PURE__*/React.createElement("div", {
    className: "col-meta"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, b.name), /*#__PURE__*/React.createElement(GrowthPill, {
    value: b.growth
  })), /*#__PURE__*/React.createElement("div", {
    className: "reason"
  }, "from ", inrShort(b.gmvPrior), " \u2192 ", inrShort(b.gmv), " this month")))))))));
}
window.VariationA = VariationA;
})(); } catch (e) { __ds_ns.__errors.push({ path: "brands/VariationA.jsx", error: String((e && e.message) || e) }); }

// brands/VariationB.jsx
try { (() => {
// brands/VariationB.jsx — "Quadrant Brief"
// Editorial. Growth × Share quadrant chart on the left,
// narrative + quadrant-grouped brand list on the right.

function VariationB({
  tweaks
}) {
  // Quadrant plot is 0–100% on each axis (within the bordered .vb-plot).
  // We map:
  //   x = share (0–40% of portfolio) → 0–100%
  //   y = growth (−15% to +25%) → 0 at bottom to 100 at top
  // Mid-lines are at share=15% and growth=0% by default.
  const xMax = 40;
  const yMin = -15;
  const yMax = 25;
  function pos(b) {
    const x = Math.max(0, Math.min(100, b.share / xMax * 100));
    const y = 100 - Math.max(0, Math.min(100, (b.growth - yMin) / (yMax - yMin) * 100));
    return {
      x,
      y
    };
  }

  // Bubble size by GMV (range 28–68px).
  const minGmv = Math.min(...BRANDS_DATA.map(b => b.gmv));
  const maxGmv = Math.max(...BRANDS_DATA.map(b => b.gmv));
  function bubbleSize(g) {
    const t = (g - minGmv) / (maxGmv - minGmv || 1);
    return 32 + t * 32;
  }
  const groups = {
    star: {
      title: 'Stars',
      sub: 'High share · growing',
      tone: 'var(--success-500)',
      list: []
    },
    rising: {
      title: 'Rising bets',
      sub: 'Small but climbing',
      tone: 'var(--ember-400)',
      list: []
    },
    workhorse: {
      title: 'Workhorses',
      sub: 'Big share · steady',
      tone: 'var(--teal-400)',
      list: []
    },
    watchlist: {
      title: 'Watchlist',
      sub: 'Slipping or stalled',
      tone: 'var(--danger-500)',
      list: []
    }
  };
  BRANDS_DATA.forEach(b => groups[b.quadrant] && groups[b.quadrant].list.push(b));
  return /*#__PURE__*/React.createElement("div", {
    className: "vb"
  }, /*#__PURE__*/React.createElement(SectionBar, {
    title: "Brand portfolio",
    count: "5 brands \xB7 this month",
    view: "overview",
    sortBy: "GMV (high \u2192 low)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "vb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vb-quadrant"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vb-quadrant-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, "Growth \xD7 Share"), /*#__PURE__*/React.createElement("p", null, "Where each brand sits in your portfolio this month. Bubble size scales with GMV.")), /*#__PURE__*/React.createElement("div", {
    className: "vb-quadrant-legend"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--teal-500)'
    }
  }), "Indian"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--ember-400)'
    }
  }), "Mixed"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--cream-500)'
    }
  }), "Import"))), /*#__PURE__*/React.createElement("div", {
    className: "vb-plot-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vb-plot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vb-quad-label",
    style: {
      left: 12,
      top: 8
    }
  }, "Rising bets"), /*#__PURE__*/React.createElement("div", {
    className: "vb-quad-label",
    style: {
      right: 12,
      top: 8
    }
  }, "Stars"), /*#__PURE__*/React.createElement("div", {
    className: "vb-quad-label",
    style: {
      left: 12,
      bottom: 8
    }
  }, "Watchlist"), /*#__PURE__*/React.createElement("div", {
    className: "vb-quad-label",
    style: {
      right: 12,
      bottom: 8
    }
  }, "Workhorses"), BRANDS_DATA.map(b => {
    const p = pos(b);
    const sz = bubbleSize(b.gmv);
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      className: "vb-dot",
      style: {
        left: p.x + '%',
        top: p.y + '%'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: `vb-bubble ${b.hue}`,
      style: {
        width: sz,
        height: sz
      }
    }, b.initials), /*#__PURE__*/React.createElement("div", {
      className: "vb-dot-label"
    }, b.name.split(' ')[0]));
  }), /*#__PURE__*/React.createElement("div", {
    className: "vb-axis-x"
  }, "Share of portfolio \u2192"), /*#__PURE__*/React.createElement("div", {
    className: "vb-axis-y"
  }, "Growth vs last month \u2192")))), /*#__PURE__*/React.createElement("div", {
    className: "vb-brief"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vb-brief-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "This month's read"), /*#__PURE__*/React.createElement("h3", null, "Two brands carry the portfolio. Aravalli is closing in. Tara needs a call this week."), /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, /*#__PURE__*/React.createElement("b", null, "WineYard"), " and ", /*#__PURE__*/React.createElement("b", null, "Khanna Brewing"), " together hold ", /*#__PURE__*/React.createElement("b", null, "59% of GMV"), " and both are growing. ", /*#__PURE__*/React.createElement("b", null, "Aravalli"), " is your fastest mover (+18%) on a smaller base.", /*#__PURE__*/React.createElement("b", null, " Tara Spirits"), " has slipped \u22128% with no new catalog in 28 days.")), Object.entries(groups).map(([k, g]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    className: "vb-quad-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vb-quad-group-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "swatch",
    style: {
      background: g.tone
    }
  }), /*#__PURE__*/React.createElement("h4", null, g.title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--cream-700)',
      textTransform: 'none',
      letterSpacing: 0,
      fontWeight: 400,
      marginLeft: 6
    }
  }, "\xB7 ", g.sub), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, g.list.length)), g.list.map(b => /*#__PURE__*/React.createElement("div", {
    className: "vb-quad-row",
    key: b.id
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: b.initials,
    hue: b.hue,
    size: 26
  }), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, b.name), /*#__PURE__*/React.createElement(GrowthPill, {
    value: b.growth
  }), /*#__PURE__*/React.createElement("div", {
    className: "gmv"
  }, inrShort(b.gmv)))), g.list.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--cream-600)',
      padding: '2px 0'
    }
  }, "\u2014"))))));
}
window.VariationB = VariationB;
})(); } catch (e) { __ds_ns.__errors.push({ path: "brands/VariationB.jsx", error: String((e && e.message) || e) }); }

// brands/VariationC.jsx
try { (() => {
// brands/VariationC.jsx — "Brand Lookbook"
// Bold. Portfolio share-bar on top, then large brand tiles in a 3-up grid.
// Each tile reads as a curated card: hero stripe, GMV in serif, sparkline,
// 2 micro-KPIs, status verb. Alerts surface as a footer band on the card.

function VariationC({
  tweaks
}) {
  const sorted = [...BRANDS_DATA].sort((a, b) => {
    if (tweaks.sortBy === 'growth') return b.growth - a.growth;
    if (tweaks.sortBy === 'share') return b.share - a.share;
    if (tweaks.sortBy === 'alpha') return a.name.localeCompare(b.name);
    return b.gmv - a.gmv;
  });

  // Stacked share-bar segments. Each brand gets a band coloured to its hue.
  const hueClass = (b, i) => {
    const fallback = ['s-teal', 's-ember', 's-teal2', 's-ember2', 's-cream'][i];
    if (b.hue === 'teal') return i % 2 === 0 ? 's-teal' : 's-teal2';
    if (b.hue === 'ember') return i % 2 === 0 ? 's-ember' : 's-ember2';
    return fallback;
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "vc"
  }, /*#__PURE__*/React.createElement(SectionBar, {
    title: "Brand portfolio",
    count: "5 brands \xB7 this month",
    view: "overview",
    sortBy: {
      gmv: 'GMV (high → low)',
      growth: 'Growth (best → worst)',
      share: 'Share (high → low)',
      alpha: 'A → Z'
    }[tweaks.sortBy] || 'GMV (high → low)'
  }), /*#__PURE__*/React.createElement("div", {
    className: "vc-portfolio-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vc-portfolio-bar-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Portfolio composition"), /*#__PURE__*/React.createElement("div", {
    className: "r"
  }, "\u20B947.3 L \xB7 this month \xB7 5 brands")), /*#__PURE__*/React.createElement("div", {
    className: "vc-portfolio-bar-vis"
  }, sorted.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: b.id,
    className: `vc-portfolio-seg ${hueClass(b, i)}`,
    style: {
      flex: b.share
    },
    title: `${b.name} · ${b.share.toFixed(1)}%`
  }, b.share > 10 ? `${b.initials} · ${b.share.toFixed(0)}%` : b.initials)))), /*#__PURE__*/React.createElement("div", {
    className: "vc-grid"
  }, sorted.map(b => /*#__PURE__*/React.createElement("div", {
    className: "vc-card",
    key: b.id
  }, /*#__PURE__*/React.createElement("div", {
    className: `vc-card-hero h-${b.hue}`
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, b.name), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, b.category.toUpperCase(), " \xB7 ", b.region)), /*#__PURE__*/React.createElement(VerbPill, {
    label: b.statusVerb,
    tone: b.statusTone
  })), /*#__PURE__*/React.createElement("div", {
    className: "vc-card-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vc-card-gmv"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, inrShort(b.gmv)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(GrowthPill, {
    value: b.growth
  }), /*#__PURE__*/React.createElement("div", {
    className: "h"
  }, "vs ", inrShort(b.gmvPrior), " last month"))), /*#__PURE__*/React.createElement("div", {
    className: "vc-card-spark"
  }, /*#__PURE__*/React.createElement(MiniSpark, {
    data: b.spark,
    width: 300,
    height: 36
  })), /*#__PURE__*/React.createElement("div", {
    className: "vc-card-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Share of portfolio"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, b.share.toFixed(1), "%")), /*#__PURE__*/React.createElement("div", {
    className: "vc-card-row v-buyers"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Buyers"), /*#__PURE__*/React.createElement("div", {
    className: "v-bar"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: b.activeBuyers / b.totalBuyers * 100 + '%'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, b.activeBuyers, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)'
    }
  }, "/", b.totalBuyers))), /*#__PURE__*/React.createElement("div", {
    className: "vc-card-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Low stock \xB7 catalog"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, b.lowStock, " SKU", b.lowStock === 1 ? '' : 's', " \xB7 ", b.daysSinceCatalog, "d ago"))), b.alerts.length > 0 && tweaks.showAlerts !== false && /*#__PURE__*/React.createElement("div", {
    className: "vc-card-alerts"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, b.alerts[0].label, b.alerts.length > 1 ? ` · +${b.alerts.length - 1} more` : ''))))));
}
window.VariationC = VariationC;
})(); } catch (e) { __ds_ns.__errors.push({ path: "brands/VariationC.jsx", error: String((e && e.message) || e) }); }

// brands/data.jsx
try { (() => {
// brands/data.jsx
// Extended brand portfolio data for the Brands landing exploration.
// All numbers are mock-but-plausible for a 5-brand SMB distributor doing ~₹47L/month.

const BRANDS_DATA = [{
  id: 'wy',
  name: 'WineYard Vintners',
  initials: 'WY',
  region: 'Nashik, IN',
  category: 'Wines',
  hue: 'teal',
  skus: 82,
  cohorts: 4,
  activeBuyers: 38,
  totalBuyers: 142,
  gmv: 1680000,
  gmvPrior: 1500000,
  growth: 12,
  share: 35.5,
  margin: 18.4,
  sellThrough: 71,
  lowStock: 4,
  daysSinceCatalog: 3,
  repeatRate: 64,
  quadrant: 'star',
  statusVerb: 'On pace',
  statusTone: 'success',
  alerts: [],
  spark: [62, 68, 71, 70, 78, 82, 79, 88, 84, 92, 96, 100]
}, {
  id: 'kh',
  name: 'Khanna Brewing Co.',
  initials: 'KH',
  region: 'Punjab, IN',
  category: 'Beer & ales',
  hue: 'ember',
  skus: 124,
  cohorts: 6,
  activeBuyers: 41,
  totalBuyers: 142,
  gmv: 1120000,
  gmvPrior: 1037000,
  growth: 8,
  share: 23.7,
  margin: 14.2,
  sellThrough: 58,
  lowStock: 12,
  daysSinceCatalog: 8,
  repeatRate: 58,
  quadrant: 'star',
  statusVerb: 'Stock thin',
  statusTone: 'warning',
  alerts: [{
    kind: 'low-stock',
    label: '12 SKUs low on stock',
    severity: 'warning'
  }],
  spark: [58, 60, 63, 62, 66, 68, 64, 70, 72, 75, 78, 80]
}, {
  id: 'mr',
  name: 'Maison Roussel',
  initials: 'MR',
  region: 'Loire, FR',
  category: 'French wines',
  hue: 'cream',
  skus: 46,
  cohorts: 3,
  activeBuyers: 22,
  totalBuyers: 142,
  gmv: 840000,
  gmvPrior: 808000,
  growth: 4,
  share: 17.8,
  margin: 22.1,
  sellThrough: 62,
  lowStock: 2,
  daysSinceCatalog: 12,
  repeatRate: 51,
  quadrant: 'workhorse',
  statusVerb: 'Steady',
  statusTone: 'neutral',
  alerts: [],
  spark: [44, 46, 45, 48, 47, 50, 49, 51, 50, 52, 53, 54]
}, {
  id: 'av',
  name: 'Aravalli Vineyards',
  initials: 'AV',
  region: 'Rajasthan, IN',
  category: 'Wines & meads',
  hue: 'ember',
  skus: 67,
  cohorts: 4,
  activeBuyers: 19,
  totalBuyers: 142,
  gmv: 668600,
  gmvPrior: 566600,
  growth: 18,
  share: 14.1,
  margin: 19.8,
  sellThrough: 74,
  lowStock: 1,
  daysSinceCatalog: 5,
  repeatRate: 47,
  quadrant: 'rising',
  statusVerb: 'New peak',
  statusTone: 'accent',
  alerts: [],
  spark: [22, 24, 27, 26, 30, 34, 36, 40, 42, 46, 50, 54]
}, {
  id: 'ts',
  name: 'Tara Spirits',
  initials: 'TS',
  region: 'Goa, IN',
  category: 'Spirits',
  hue: 'teal',
  skus: 38,
  cohorts: 2,
  activeBuyers: 14,
  totalBuyers: 142,
  gmv: 420000,
  gmvPrior: 456000,
  growth: -8,
  share: 8.9,
  margin: 16.5,
  sellThrough: 42,
  lowStock: 6,
  daysSinceCatalog: 28,
  repeatRate: 38,
  quadrant: 'watchlist',
  statusVerb: 'Slipping',
  statusTone: 'danger',
  alerts: [{
    kind: 'gmv-drop',
    label: 'GMV down 8% vs last month',
    severity: 'danger'
  }, {
    kind: 'stale-catalog',
    label: 'No new catalog in 28 days',
    severity: 'warning'
  }, {
    kind: 'reach',
    label: 'Active buyers down 4 → 14',
    severity: 'warning'
  }],
  spark: [54, 52, 55, 50, 48, 46, 44, 42, 40, 38, 36, 34]
}];

// Portfolio aggregates
const PORTFOLIO = {
  gmv: BRANDS_DATA.reduce((s, b) => s + b.gmv, 0),
  // 47,28,600
  gmvPrior: BRANDS_DATA.reduce((s, b) => s + b.gmvPrior, 0),
  // 43,67,600
  growth: 8.3,
  brandsCarried: BRANDS_DATA.length,
  brandsAtRisk: BRANDS_DATA.filter(b => b.alerts.length > 0).length,
  brandsRising: BRANDS_DATA.filter(b => b.quadrant === 'rising').length,
  activeBuyersAcross: 89,
  // dedup count (a buyer may buy multiple brands)
  totalBuyers: 142,
  catalogFresh: BRANDS_DATA.filter(b => b.daysSinceCatalog <= 14).length,
  topBrand: 'WineYard Vintners',
  topBrandShare: 35.5
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
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + ' K';
  return '₹' + n;
}
Object.assign(window, {
  BRANDS_DATA,
  PORTFOLIO,
  inrFmt,
  inrShort
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "brands/data.jsx", error: String((e && e.message) || e) }); }

// brands/design-canvas.jsx
try { (() => {
// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = ['.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}', '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}', '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}', '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}', '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
  // isolation:isolate contains artboard content's z-indexes so a
  // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
  // the .dc-menu popover that drops into the top of the card.
  '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}', '.dc-card *{scrollbar-width:none}', '.dc-card *::-webkit-scrollbar{display:none}',
  // Per-artboard header: grip + label on the left, delete/expand on the
  // right. Single flex row; when the artboard's on-screen width is too
  // narrow for both the label yields (ellipsis, then hidden entirely below
  // ~4ch via the container query) and the buttons stay on the row.
  '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;', '  display:flex;align-items:center;container-type:inline-size}', '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}', '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s,opacity .12s}', '.dc-grip:hover{background:rgba(0,0,0,.08)}', '.dc-grip:active{cursor:grabbing}', '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;', '  display:flex;align-items:center;transition:background .12s;overflow:hidden}',
  // Below ~4ch of label room: hide the label entirely, and drop the grip to
  // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
  // until the card is moused.
  '@container (max-width: 110px){', '  .dc-labeltext{display:none}', '  .dc-grip{opacity:0}', '  [data-dc-slot]:hover .dc-grip{opacity:1}', '}', '.dc-labeltext:hover{background:rgba(0,0,0,.05)}', '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}', '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}', '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}', '[data-dc-slot]:hover .dc-btns,.dc-btns:has(.dc-menu){opacity:1}', '.dc-expand,.dc-kebab{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;', '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center;', '  font:inherit;transition:background .12s,color .12s}', '.dc-expand:hover,.dc-kebab:hover{background:rgba(0,0,0,.06);color:#2a251f}',
  // Slot hosting an open menu floats above later siblings (which otherwise
  // paint on top — same z-index:auto, later DOM order) so the popup isn't
  // clipped by the next card.
  '[data-dc-slot]:has(.dc-menu){z-index:10}', '.dc-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border-radius:8px;', '  box-shadow:0 8px 28px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);padding:4px;min-width:160px;z-index:10}', '.dc-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;', '  border-radius:5px;font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;', '  color:#29261b;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap}', '.dc-menu button:hover{background:rgba(0,0,0,.05)}', '.dc-menu hr{border:0;border-top:1px solid rgba(0,0,0,.08);margin:4px 2px}', '.dc-menu .dc-danger{color:#c96442}', '.dc-menu .dc-danger:hover{background:rgba(201,100,66,.1)}',
  // Chrome (titles / labels / buttons) counter-scales against the viewport
  // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
  // DCViewport on every transform update and inherits to all descendants —
  // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
  // it the same way.
  //
  // The header uses transform:scale (out-of-flow, so layout impact doesn't
  // matter) with its world-space width set to card-width / inv-zoom so that
  // after counter-scaling its on-screen width exactly matches the card's —
  // that's what lets the container query + text-overflow behave against the
  // card's visible edge at every zoom level.
  //
  // The section head uses CSS zoom instead of transform so its layout box
  // grows with the counter-scale, pushing the card row down — otherwise the
  // constant-screen-size title would overflow into the (shrinking) world-
  // space gap and overlap the artboard headers at low zoom.
  '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));', '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}', '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}'].join('\n');
  document.head.appendChild(s);
}
const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, c => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';
function DesignCanvas({
  children,
  minScale,
  maxScale,
  style
}) {
  const [state, setState] = React.useState({
    sections: {},
    focus: null
  });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);
  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE).then(r => r.ok ? r.json() : null).then(saved => {
      if (off || !saved || !saved.sections) return;
      skipNextWrite.current = true;
      setState(s => ({
        ...s,
        sections: saved.sections
      }));
    }).catch(() => {}).finally(() => {
      didRead.current = true;
      if (!off) setReady(true);
    });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({
        sections: state.sections
      })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Fragments are flattened; wrapping in other
  // elements still opts out of focus/reorder.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  dcFlatten(children).forEach(sec => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const abs = [];
    dcFlatten(sec.props.children).forEach(ab => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (aid) abs.push([aid, ab]);
    });
    // hidden is scoped to one source revision — when the agent regenerates
    // (artboard-ID set changes), prior deletes don't apply to new content.
    const srcKey = abs.map(([k]) => k).join('\x1f');
    const hidden = persisted.srcKey === srcKey ? persisted.hidden || [] : [];
    const srcIds = [];
    abs.forEach(([aid, ab]) => {
      if (hidden.includes(aid)) return;
      registry[`${sid}/${aid}`] = {
        sectionId: sid,
        artboard: ab
      };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter(k => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter(k => !kept.includes(k))]
    };
  });
  const api = React.useMemo(() => ({
    state,
    section: id => state.sections[id] || {},
    patchSection: (id, p) => setState(s => ({
      ...s,
      sections: {
        ...s.sections,
        [id]: {
          ...s.sections[id],
          ...(typeof p === 'function' ? p(s.sections[id] || {}) : p)
        }
      }
    })),
    setFocus: slotId => setState(s => ({
      ...s,
      focus: slotId
    }))
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = e => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);
  return /*#__PURE__*/React.createElement(DCCtx.Provider, {
    value: api
  }, /*#__PURE__*/React.createElement(DCViewport, {
    minScale: minScale,
    maxScale: maxScale,
    style: style
  }, ready && children), state.focus && registry[state.focus] && /*#__PURE__*/React.createElement(DCFocusOverlay, {
    entry: registry[state.focus],
    sectionMeta: sectionMeta,
    sectionOrder: sectionOrder
  }));
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({
  children,
  minScale = 0.1,
  maxScale = 8,
  style = {}
}) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({
    x: 0,
    y: 0,
    scale: 1
  });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);
  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const {
      x,
      y,
      scale
    } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({
        type: '__dc_zoom',
        scale
      }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    }, 200);
  }, [tfKey]);
  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = {
          x: s.x,
          y: s.y,
          scale: Math.min(maxScale, Math.max(minScale, s.scale))
        };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null,
        markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) {
          t.y -= drift;
          apply();
        }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = e => e.deltaMode !== 0 || e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40;
    const onWheel = e => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = e => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, gsBase * e.scale / tf.current.scale);
    };
    const onGestureEnd = e => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = e => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || e.button === 0 && onBg)) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        lx: e.clientX,
        ly: e.clientY
      };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = e => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({
          type: '__dc_present'
        }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({
      type: '__dc_present'
    }, '*');
    lastPostedScale.current = undefined;
    apply();
    vp.addEventListener('wheel', onWheel, {
      passive: false
    });
    vp.addEventListener('gesturestart', onGestureStart, {
      passive: false
    });
    vp.addEventListener('gesturechange', onGestureChange, {
      passive: false
    });
    vp.addEventListener('gestureend', onGestureEnd, {
      passive: false
    });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);
  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return /*#__PURE__*/React.createElement("div", {
    ref: vpRef,
    className: "design-canvas",
    style: {
      height: '100vh',
      width: '100vw',
      background: DC.bg,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      position: 'relative',
      fontFamily: DC.font,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: worldRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      transformOrigin: '0 0',
      willChange: 'transform',
      width: 'max-content',
      minWidth: '100%',
      minHeight: '100%',
      padding: '60px 0 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -6000,
      backgroundImage: gridSvg,
      backgroundSize: '120px 120px',
      pointerEvents: 'none',
      zIndex: -1
    }
  }), children));
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({
  id,
  title,
  subtitle,
  children,
  gap = 48
}) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter(c => c && c.type === DCArtboard);
  const rest = all.filter(c => !(c && c.type === DCArtboard));
  const sec = ctx && sid && ctx.section(sid) || {};
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map(a => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? sec.hidden || [] : [];
  const srcOrder = allIds.filter(k => !hidden.includes(k));
  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter(k => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter(k => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);
  const byId = Object.fromEntries(artboards.map(a => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return /*#__PURE__*/React.createElement("div", {
    "data-dc-section": sid,
    style: {
      marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-sectionhead",
    style: {
      paddingBottom: 36
    }
  }, /*#__PURE__*/React.createElement(DCEditable, {
    tag: "div",
    value: sec.title ?? title,
    onChange: v => ctx && sid && ctx.patchSection(sid, {
      title: v
    }),
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: DC.title,
      letterSpacing: -0.4,
      marginBottom: 6,
      display: 'inline-block'
    }
  }), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: DC.subtitle
    }
  }, subtitle))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      padding: '0 60px',
      alignItems: 'flex-start',
      width: 'max-content'
    }
  }, order.map(k => /*#__PURE__*/React.createElement(DCArtboardFrame, {
    key: k,
    sectionId: sid,
    artboard: byId[k],
    order: order,
    label: (sec.labels || {})[k] ?? byId[k].props.label,
    onRename: v => ctx && ctx.patchSection(sid, x => ({
      labels: {
        ...x.labels,
        [k]: v
      }
    })),
    onReorder: next => ctx && ctx.patchSection(sid, {
      order: next
    }),
    onDelete: () => ctx && ctx.patchSection(sid, x => ({
      hidden: [...(x.srcKey === srcKey ? x.hidden || [] : []), k],
      srcKey
    })),
    onFocus: () => ctx && ctx.setFocus(`${sid}/${k}`)
  }))), rest);
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try {
    await document.fonts.ready;
  } catch {}
  const toDataURL = url => fetch(url).then(r => r.blob()).then(b => new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(url);
    fr.readAsDataURL(b);
  })).catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [],
    pending = [],
    seen = new Set();
  const scrapeCss = href => {
    if (seen.has(href)) return;
    seen.add(href);
    pending.push(fetch(href).then(r => r.text()).then(css => {
      for (const m of css.match(/@font-face\s*{[^}]*}/g) || []) fontRules.push({
        css: m,
        base: href
      });
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) scrapeCss(new URL(m[1], href).href);
    }).catch(() => {}));
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({
        css: r.cssText,
        base
      });else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try {
          walk(r.styleSheet.cssRules, ibase);
        } catch {
          scrapeCss(ibase);
        }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try {
      walk(ss.cssRules, base);
    } catch {
      if (ss.href) scrapeCss(ss.href);
    }
  }
  while (pending.length) await pending.shift();
  const fontCss = (await Promise.all(fontRules.map(async rule => {
    let out = rule.css,
      m;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    while (m = re.exec(rule.css)) {
      if (m[2].indexOf('data:') === 0) continue;
      let abs;
      try {
        abs = new URL(m[2], rule.base).href;
      } catch {
        continue;
      }
      out = out.split(m[0]).join('url("' + (await toDataURL(abs)) + '")');
    }
    return out;
  }))).join('\n');
  const cloneStyled = src => {
    if (src.nodeType === 8 || src.nodeType === 1 && src.tagName === 'SCRIPT') return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src);
      let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS') try {
        const im = document.createElement('img');
        im.src = src.toDataURL();
        im.setAttribute('style', txt);
        return im;
      } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  const jobs = [];
  clone.querySelectorAll('img').forEach(el => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0) jobs.push(toDataURL(el.src).then(d => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach(el => {
    const bg = el.style.backgroundImage;
    if (!bg) return;
    let m;
    const re = /url\(["']?([^"')]+)["']?\)/g;
    while (m = re.exec(bg)) {
      const tok = m[0],
        url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(toDataURL(url).then(d => {
        el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")');
      }));
    }
  });
  await Promise.all(jobs);
  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (kind === 'html') {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title>' + (fontCss ? '<style>' + fontCss + '</style>' : '') + '</head><body style="margin:0">' + xml + '</body></html>';
    return save(new Blob([html], {
      type: 'text/html'
    }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * px + '" height="' + h * px + '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' + (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') + xml + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px;
  cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob(blob => save(blob, 'png'), 'image/png');
}
function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus,
  onDelete
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {}
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // ⋯ menu: close on any outside pointerdown. Two-click delete lives inside
  // the menu — first click arms the row, second commits; closing disarms.
  React.useEffect(() => {
    if (!menuOpen) {
      setConfirming(false);
      return;
    }
    const off = e => {
      if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menuOpen]);
  const doExport = kind => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind).catch(e => console.error('[design-canvas] export failed:', e));
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map(el => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left
    }));
    const slotXs = homes.map(h => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');
    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };
    const move = ev => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter(k => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    "data-dc-slot": id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-header",
    "data-omelette-chrome": "",
    style: {
      color: DC.label
    },
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-labelrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-grip",
    onPointerDown: onGripDown,
    title: "Drag to reorder"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "13",
    viewBox: "0 0 9 13",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "11",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "11",
    r: "1.1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-labeltext",
    onClick: onFocus,
    title: "Click to focus"
  }, /*#__PURE__*/React.createElement(DCEditable, {
    value: label,
    onChange: onRename,
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: DC.label,
      lineHeight: 1
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-btns"
  }, /*#__PURE__*/React.createElement("div", {
    ref: menuRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "dc-kebab",
    title: "More",
    onClick: () => setMenuOpen(o => !o)
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2.5",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9.5",
    cy: "6",
    r: "1.1"
  }))), menuOpen && /*#__PURE__*/React.createElement("div", {
    className: "dc-menu",
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('png')
  }, "Download PNG"), /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('html')
  }, "Download HTML"), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("button", {
    className: "dc-danger",
    onClick: () => {
      if (confirming) {
        setMenuOpen(false);
        onDelete();
      } else setConfirming(true);
    }
  }, confirming ? 'Click again to delete' : 'Delete'))), /*#__PURE__*/React.createElement("button", {
    className: "dc-expand",
    onClick: onFocus,
    title: "Focus"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"
  }))))), /*#__PURE__*/React.createElement("div", {
    ref: cardRef,
    className: "dc-card",
    style: {
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      width,
      height,
      background: '#fff',
      ...style
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb',
      fontSize: 13,
      fontFamily: DC.font
    }
  }, id)));
}

// Inline rename — commits on blur or Enter.
function DCEditable({
  value,
  onChange,
  style,
  tag = 'span',
  onClick
}) {
  const T = tag;
  return /*#__PURE__*/React.createElement(T, {
    className: "dc-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: onClick,
    onPointerDown: e => e.stopPropagation(),
    onBlur: e => onChange && onChange(e.currentTarget.textContent),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    style: style
  }, value);
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({
  entry,
  sectionMeta,
  sectionOrder
}) {
  const ctx = React.useContext(DCCtx);
  const {
    sectionId,
    artboard
  } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);
  const go = d => {
    const n = peers[(idx + d + peers.length) % peers.length];
    if (n) ctx.setFocus(`${sectionId}/${n}`);
  };
  const goSection = d => {
    // Sections whose artboards are all deleted have slotIds:[] — step past
    // them to the next non-empty section so ↑/↓ doesn't dead-end.
    const n = sectionOrder.length;
    for (let i = 1; i < n; i++) {
      const ns = sectionOrder[((secIdx + d * i) % n + n) % n];
      const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
      if (first) {
        ctx.setFocus(`${ns}/${first}`);
        return;
      }
    }
  };
  React.useEffect(() => {
    const k = e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const {
    width = 260,
    height = 480,
    children
  } = artboard.props;
  const [vp, setVp] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight
  });
  React.useEffect(() => {
    const r = () => setVp({
      w: window.innerWidth,
      h: window.innerHeight
    });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));
  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({
    dir,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    style: {
      position: 'absolute',
      top: '50%',
      [dir]: 28,
      transform: 'translateY(-50%)',
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: 'rgba(255,255,255,.9)',
      width: 44,
      height: 44,
      borderRadius: 22,
      fontSize: 18,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.18)',
    onMouseLeave: e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'
  })));

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    onClick: () => ctx.setFocus(null),
    onWheel: e => e.preventDefault(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(24,20,16,.6)',
      backdropFilter: 'blur(14px)',
      fontFamily: DC.font,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 20px 0',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(o => !o),
    style: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
      padding: '6px 8px',
      borderRadius: 6,
      textAlign: 'left',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, meta.title), /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 11 11",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3.5 3.5L9 4"
  }))), meta.subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      opacity: .6,
      fontWeight: 400,
      marginTop: 2
    }
  }, meta.subtitle)), ddOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#2a251f',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: 4,
      minWidth: 200,
      zIndex: 10
    }
  }, sectionOrder.filter(sid => sectionMeta[sid].slotIds.length).map(sid => /*#__PURE__*/React.createElement("button", {
    key: sid,
    onClick: () => {
      setDd(false);
      const f = sectionMeta[sid].slotIds[0];
      if (f) ctx.setFocus(`${sid}/${f}`);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 5,
      fontSize: 14,
      fontWeight: sid === sectionId ? 600 : 400,
      fontFamily: 'inherit'
    }
  }, sectionMeta[sid].title)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ctx.setFocus(null),
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.12)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,.7)',
      width: 32,
      height: 32,
      borderRadius: 16,
      fontSize: 20,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'background .12s'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 64,
      bottom: 56,
      left: 100,
      right: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: width * scale,
      height: height * scale,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      background: '#fff',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: '0 20px 80px rgba(0,0,0,.4)'
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb'
    }
  }, aid))), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 14,
      fontWeight: 500,
      opacity: .85,
      textAlign: 'center'
    }
  }, (sec.labels || {})[aid] ?? artboard.props.label, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .5,
      marginLeft: 10,
      fontVariantNumeric: 'tabular-nums'
    }
  }, idx + 1, " / ", peers.length))), /*#__PURE__*/React.createElement(Arrow, {
    dir: "left",
    onClick: () => go(-1)
  }), /*#__PURE__*/React.createElement(Arrow, {
    dir: "right",
    onClick: () => go(1)
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8
    }
  }, peers.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => ctx.setFocus(`${sectionId}/${p}`),
    style: {
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: i === idx ? '#fff' : 'rgba(255,255,255,.3)'
    }
  })))), document.body);
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom,
      width,
      background: DC.postitBg,
      padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14,
      lineHeight: 1.4,
      color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5
    }
  }, children);
}
Object.assign(window, {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "brands/design-canvas.jsx", error: String((e && e.message) || e) }); }

// brands/tweaks-panel.jsx
try { (() => {
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits
    }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({
      type: '__edit_mode_dismissed'
    }, '*');
  };
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    "data-omelette-chrome": "",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    "aria-label": "Close tweaks",
    onMouseDown: e => e.stopPropagation(),
    onClick: dismiss
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRow({
  label,
  value,
  children,
  inline = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: inline ? 'twk-row twk-row-h' : 'twk-row'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label), value != null && /*#__PURE__*/React.createElement("span", {
    className: "twk-val"
  }, value)), children);
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label,
    value: `${value}${unit}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "twk-slider",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  }));
}
function TweakToggle({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row twk-row-h"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "twk-toggle",
    "data-on": value ? '1' : '0',
    role: "switch",
    "aria-checked": !!value,
    onClick: () => onChange(!value)
  }, /*#__PURE__*/React.createElement("i", null)));
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = o => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({
    2: 16,
    3: 10
  }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = s => {
      const m = options.find(o => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return /*#__PURE__*/React.createElement(TweakSelect, {
      label: label,
      value: value,
      options: options,
      onChange: s => onChange(resolve(s))
    });
  }
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const segAt = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor((clientX - r.left - 2) / inner * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = e => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = ev => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    role: "radiogroup",
    onPointerDown: onPointerDown,
    className: dragging ? 'twk-seg dragging' : 'twk-seg'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "radio",
    "aria-checked": o.value === value
  }, o.label))));
}
function TweakSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("select", {
    className: "twk-field",
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })));
}
function TweakText({
  label,
  value,
  placeholder,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("input", {
    className: "twk-field",
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: e => onChange(e.target.value)
  }));
}
function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange
}) {
  const clamp = n => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({
    x: 0,
    val: 0
  });
  const onScrubStart = e => {
    e.preventDefault();
    startRef.current = {
      x: e.clientX,
      val: value
    };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = ev => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "twk-num-lbl",
    onPointerDown: onScrubStart
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    min: min,
    max: max,
    step: step,
    onChange: e => onChange(clamp(Number(e.target.value)))
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "twk-num-unit"
  }, unit));
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, c => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = n >> 16 & 255,
    g = n >> 8 & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({
  light
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 7.2 5.8 10 11 4.2",
  fill: "none",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  stroke: light ? 'rgba(0,0,0,.78)' : '#fff'
}));

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      className: "twk-swatch",
      value: value,
      onChange: e => onChange(e.target.value)
    }));
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-chips",
    role: "radiogroup"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const sup = rest.slice(0, 4);
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "twk-chip",
      role: "radio",
      "aria-checked": on,
      "data-on": on ? '1' : '0',
      "aria-label": colors.join(', '),
      title: colors.join(' · '),
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, sup.length > 0 && /*#__PURE__*/React.createElement("span", null, sup.map((c, j) => /*#__PURE__*/React.createElement("i", {
      key: j,
      style: {
        background: c
      }
    }))), on && /*#__PURE__*/React.createElement(__TwkCheck, {
      light: __twkIsLight(hero)
    }));
  })));
}
function TweakButton({
  label,
  onClick,
  secondary = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: secondary ? 'twk-btn secondary' : 'twk-btn',
    onClick: onClick
  }, label);
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "brands/tweaks-panel.jsx", error: String((e && e.message) || e) }); }

// details/Edit.jsx
try { (() => {
// details/Edit.jsx — Form-style edit panels for each entity.
// All use the same shared Field / SectionCard primitives.

/* ─── BRAND ────────────────────────────────────────────────── */
function BrandEdit({
  d
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Identity",
    sub: "The basics retailers see in their app"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Brand name",
    value: d.name,
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Category",
    value: d.category
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Region",
    value: d.region
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Carried since",
    value: d.carriedSince,
    muted: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Default cohort",
    value: /*#__PURE__*/React.createElement("span", {
      className: "link"
    }, d.defaultCohort)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Master price list",
    value: /*#__PURE__*/React.createElement("span", {
      className: "link"
    }, d.masterPriceList)
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Principal contact",
    sub: "Whom Phani calls when something needs unblocking"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Contact name",
    value: d.principalContact.name
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Role",
    value: d.principalContact.role
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Phone",
    value: d.principalContact.phone,
    mono: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Email",
    value: /*#__PURE__*/React.createElement("span", {
      className: "link"
    }, d.principalContact.email)
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Commercials"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "GSTIN",
    value: d.gstin,
    mono: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Payment terms",
    value: d.paymentTerms
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Margin agreement",
    value: d.marginAgreement
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Default credit (\u20B9)",
    value: "\u2014",
    muted: true
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Internal notes",
    sub: "Visible to your team. Not shared with retailers."
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid cols-1"
  }, /*#__PURE__*/React.createElement(Field, {
    full: true,
    multiline: true,
    label: "Notes",
    value: d.notes
  })), /*#__PURE__*/React.createElement("div", {
    className: "edit-trail"
  }, /*#__PURE__*/React.createElement("span", null, "Last edited 3 days ago by ", /*#__PURE__*/React.createElement("strong", null, "Phani Raju")), /*#__PURE__*/React.createElement("span", {
    className: "link",
    style: {
      fontSize: 12
    }
  }, "Activity log \u2192"))));
}

/* ─── PRODUCT ──────────────────────────────────────────────── */
function ProductEdit({
  d
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Identity"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Product name",
    value: d.name,
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Brand",
    value: /*#__PURE__*/React.createElement("span", {
      className: "link"
    }, d.brand),
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "SKU",
    value: d.sku,
    mono: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "HSN code",
    value: d.hsn,
    mono: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Category",
    value: d.category
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Vintage / batch",
    value: d.vintage
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Packaging"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Pack size",
    value: d.pack
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Case size",
    value: d.caseSize
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Weight",
    value: d.weight,
    mono: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Storage",
    value: "Cool & dry",
    muted: true
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Pricing",
    sub: "Base values; cohort overrides apply on top."
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "MRP",
    value: /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, inrFmt(d.mrp)),
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Base distributor price",
    value: /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, inrFmt(d.basePrice)),
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "GST rate",
    value: d.gstRate
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Min order qty",
    value: "6 bottles"
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Description",
    sub: "Shown to retailers in the buyer app"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid cols-1"
  }, /*#__PURE__*/React.createElement(Field, {
    full: true,
    multiline: true,
    label: "Description",
    value: d.description
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Photos"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      padding: 4
    }
  }, [1, 2, 3].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      width: 84,
      height: 84,
      borderRadius: 10,
      background: 'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      padding: '0 0 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 56,
      borderRadius: '20% 20% 8% 8% / 8% 8% 4% 4%',
      background: 'linear-gradient(180deg, #1F3A34, #142823)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 84,
      height: 84,
      borderRadius: 10,
      border: '1.5px dashed var(--cream-400)',
      color: 'var(--cream-700)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 4,
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      lineHeight: 1
    }
  }, "+"), /*#__PURE__*/React.createElement("span", null, "Add photo")))));
}

/* ─── CUSTOMER (Buyer) ─────────────────────────────────────── */
function CustomerEdit({
  d
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Identity"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Business name",
    value: d.name,
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Tier",
    value: /*#__PURE__*/React.createElement("span", {
      className: "pill",
      style: {
        background: 'var(--ember-50)',
        color: 'var(--ember-700)'
      }
    }, "Tier ", d.tier)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "City",
    value: d.city
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Buyer since",
    value: d.buyerSince,
    muted: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Default cohort",
    value: /*#__PURE__*/React.createElement("span", {
      className: "link"
    }, d.defaultCohort)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Status",
    value: /*#__PURE__*/React.createElement(StatusTag, {
      label: d.status.label,
      tone: d.status.tone
    })
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Primary contact"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Contact name",
    value: d.contact.name
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Role",
    value: d.contact.role
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Phone",
    value: d.contact.phone,
    mono: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Email",
    value: /*#__PURE__*/React.createElement("span", {
      className: "link"
    }, d.contact.email)
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Tax & terms"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "GSTIN",
    value: d.gstin,
    mono: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "PAN",
    value: d.pan,
    mono: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Payment terms",
    value: d.paymentTerms
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Credit limit",
    value: /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, inrFmt(d.creditLimit))
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Addresses"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    full: true,
    multiline: true,
    label: "Billing address",
    value: d.billing
  }), /*#__PURE__*/React.createElement(Field, {
    full: true,
    multiline: true,
    label: "Shipping address",
    value: d.shipping
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Notes"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid cols-1"
  }, /*#__PURE__*/React.createElement(Field, {
    full: true,
    multiline: true,
    label: "Internal notes",
    value: d.notes
  }))));
}

/* ─── COHORT ───────────────────────────────────────────────── */
function CohortEdit({
  d
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Identity"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Cohort name",
    value: d.name,
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Status",
    value: /*#__PURE__*/React.createElement(StatusTag, {
      label: d.status.label,
      tone: d.status.tone
    })
  }), /*#__PURE__*/React.createElement(Field, {
    full: true,
    multiline: true,
    label: "Description",
    value: d.description
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Membership rules",
    sub: "A buyer joins this cohort automatically if all rules match."
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, d.rules.map(r => /*#__PURE__*/React.createElement(Field, {
    key: r.k,
    label: r.k,
    value: r.v
  }))), /*#__PURE__*/React.createElement("div", {
    className: "edit-trail"
  }, /*#__PURE__*/React.createElement("span", null, d.members, " buyers currently match these rules."), /*#__PURE__*/React.createElement("span", {
    className: "link",
    style: {
      fontSize: 12
    }
  }, "Preview members \u2192"))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Defaults"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Default price list",
    value: /*#__PURE__*/React.createElement("span", {
      className: "link"
    }, d.defaultPriceList)
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Applicable catalogs",
    value: d.applicableCatalogs
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Members",
    sub: `${d.members} of ${d.totalBuyers} buyers`,
    right: /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary cockpit-btn-sm"
    }, "Manage members")
  }, /*#__PURE__*/React.createElement("div", {
    className: "compact-list"
  }, COHORT_DETAIL.perf.topMembers.slice(0, 3).map((m, i) => /*#__PURE__*/React.createElement("div", {
    className: "compact-row",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "idx"
  }, i + 1), /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: m.name.split(' ').map(w => w[0]).slice(0, 2).join(''),
    hue: ['teal', 'ember', 'cream'][i % 3],
    size: 28
  }), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, m.name, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, m.city)), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, inrShort(m.spend), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, m.orders, " orders")))))));
}

/* ─── CATALOG ──────────────────────────────────────────────── */
function CatalogEdit({
  d
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "catalog-hero-large h-teal"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, d.name), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, "Cohort: ", d.cohort, " \xB7 ", d.products, " products \xB7 Live until ", d.validUntil)), /*#__PURE__*/React.createElement(StatusTag, {
    label: d.status.label,
    tone: d.status.tone
  })), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Basics"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Catalog name",
    value: d.name,
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Cohort",
    value: /*#__PURE__*/React.createElement("span", {
      className: "link"
    }, d.cohort, " \xB7 ", d.cohortMembers, " buyers"),
    required: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Valid from",
    value: d.validFrom
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Valid until",
    value: d.validUntil
  }), /*#__PURE__*/React.createElement(Field, {
    full: true,
    multiline: true,
    label: "Intro copy",
    value: d.intro
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: `Products · ${d.products}`,
    flush: true,
    right: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-ghost cockpit-btn-sm"
    }, "Reorder"), /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary cockpit-btn-sm"
    }, "Add products"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "cat-products"
  }, ['teal', 'teal', 'ember', 'teal', 'cream', 'ember', 'teal', 'cream', 'ember', 'teal', 'ember', 'cream'].map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `cat-product ${c}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "b"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "edit-trail"
  }, /*#__PURE__*/React.createElement("span", null, "Showing 12 of ", d.products, " \xB7 drag to reorder"), /*#__PURE__*/React.createElement("span", {
    className: "link",
    style: {
      fontSize: 12
    }
  }, "See all \u2192"))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Publish settings"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Hero image",
    value: "Default (teal)"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Published by",
    value: d.publishedBy,
    muted: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Published at",
    value: d.publishedAt,
    muted: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Notify buyers",
    value: /*#__PURE__*/React.createElement("span", {
      className: "pill",
      style: {
        background: 'var(--teal-50)',
        color: 'var(--teal-700)'
      }
    }, "WhatsApp + in-app")
  }))));
}
Object.assign(window, {
  BrandEdit,
  ProductEdit,
  CustomerEdit,
  CohortEdit,
  CatalogEdit
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "details/Edit.jsx", error: String((e && e.message) || e) }); }

// details/Patterns.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// details/Patterns.jsx — Three layout patterns for switching between
// Details (edit) and Performance modes. All three use the Brand entity
// for consistent comparison; only the navigation between modes changes.

const BRAND_META_TILES = (() => {
  const p = BRAND_DETAIL.perf;
  return [{
    label: 'GMV · this month',
    value: inrShort(p.gmv),
    sub: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      className: "up"
    }, "\u2191 +", p.growth, "%"), " vs last month")
  }, {
    label: 'Share of portfolio',
    value: `${p.share}%`,
    sub: 'of ₹47.3 L'
  }, {
    label: 'Active buyers',
    value: `${p.activeBuyers}/${p.totalBuyers}`,
    sub: 'bought this month'
  }, {
    label: 'Low-stock SKUs',
    value: `${p.lowStock}`,
    sub: '4 of 82 SKUs'
  }, {
    label: 'Catalog freshness',
    value: `${p.daysSinceCatalog}d ago`,
    sub: 'last sent Jun 24'
  }];
})();
const BRAND_TABS = [{
  id: 'details',
  label: 'Details'
}, {
  id: 'performance',
  label: 'Performance'
}, {
  id: 'buyers',
  label: 'Buyers',
  badge: BRAND_DETAIL.perf.activeBuyers
}, {
  id: 'catalogs',
  label: 'Catalogs',
  badge: 12
}, {
  id: 'activity',
  label: 'Activity'
}];
const BRAND_HEADER_PROPS = {
  crumbPath: [{
    label: 'Brands'
  }, {
    label: BRAND_DETAIL.name,
    current: true
  }],
  avatar: {
    kind: 'brand',
    initials: BRAND_DETAIL.initials,
    hue: BRAND_DETAIL.hue
  },
  title: BRAND_DETAIL.name,
  status: BRAND_DETAIL.status,
  subtitle: [BRAND_DETAIL.category, BRAND_DETAIL.region, `Carried since ${BRAND_DETAIL.carriedSince}`, `${BRAND_DETAIL.perf.skus} SKUs`]
};

/* ───────────────────────────────────────────────────────────
   PATTERN A · Tabs at top
   Details and Performance are two tabs among many.
   Pro: lots of room for future sections (Buyers, Catalogs, Activity).
   ─────────────────────────────────────────────────────────── */
function PatternA() {
  const [tab, setTab] = React.useState('performance');
  return /*#__PURE__*/React.createElement("div", {
    className: "detail-art"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-art-label"
  }, "Pattern \xB7 Tabs along the top"), /*#__PURE__*/React.createElement(ConceptTag, {
    letter: "A",
    title: "Tabs along the top",
    sub: "Edit + Analyze sit beside other sections"
  }), /*#__PURE__*/React.createElement(DetailHeader, _extends({}, BRAND_HEADER_PROPS, {
    actions: /*#__PURE__*/React.createElement(DetailActions, {
      mode: tab === 'performance' ? 'perf' : 'edit'
    })
  })), /*#__PURE__*/React.createElement(MetaStrip, {
    tiles: BRAND_META_TILES
  }), /*#__PURE__*/React.createElement(DetailTabs, {
    tabs: BRAND_TABS,
    active: tab,
    onChange: setTab
  }), tab === 'details' && /*#__PURE__*/React.createElement(BrandEdit, {
    d: BRAND_DETAIL
  }), tab === 'performance' && /*#__PURE__*/React.createElement(BrandPerf, {
    d: BRAND_DETAIL
  }), tab !== 'details' && tab !== 'performance' && /*#__PURE__*/React.createElement("div", {
    className: "section-card section-card-body padded",
    style: {
      textAlign: 'center',
      color: 'var(--cream-700)',
      padding: 40
    }
  }, /*#__PURE__*/React.createElement("em", null, tab, " section \u2014 same chrome, different body.")));
}

/* ───────────────────────────────────────────────────────────
   PATTERN B · Mode toggle in the header
   A single Edit / Analyze segmented control changes EVERYTHING.
   Pro: extremely clear "which mode am I in". Less room for ancillary
   sub-sections (those become secondary navigation inside each mode).
   ─────────────────────────────────────────────────────────── */
function PatternB() {
  const [mode, setMode] = React.useState('edit');
  return /*#__PURE__*/React.createElement("div", {
    className: "detail-art"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-art-label"
  }, "Pattern \xB7 Edit / Analyze toggle"), /*#__PURE__*/React.createElement(ConceptTag, {
    letter: "B",
    title: "Mode toggle in the header",
    sub: "Edit vs Analyze, full-page"
  }), /*#__PURE__*/React.createElement(DetailHeader, _extends({}, BRAND_HEADER_PROPS, {
    mode: mode === 'edit' ? 'edit' : 'perf',
    onMode: m => setMode(m === 'perf' ? 'perf' : 'edit'),
    actions: /*#__PURE__*/React.createElement(DetailActions, {
      mode: mode
    })
  })), /*#__PURE__*/React.createElement(MetaStrip, {
    tiles: BRAND_META_TILES
  }), mode === 'edit' ? /*#__PURE__*/React.createElement(BrandEdit, {
    d: BRAND_DETAIL
  }) : /*#__PURE__*/React.createElement(BrandPerf, {
    d: BRAND_DETAIL
  }));
}

/* ───────────────────────────────────────────────────────────
   PATTERN C · Sticky meta sidebar + tabbed right pane
   Sidebar carries the editable identity fields always-visible.
   Right pane carries performance & deeper analytical tabs.
   Pro: edit-on-the-side while reviewing performance.
   Con: editable fields cramped; less room for analytical detail.
   ─────────────────────────────────────────────────────────── */
function PatternC() {
  const [tab, setTab] = React.useState('performance');
  const d = BRAND_DETAIL;
  return /*#__PURE__*/React.createElement("div", {
    className: "detail-art"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-art-label"
  }, "Pattern \xB7 Two-pane (sidebar + tabs)"), /*#__PURE__*/React.createElement(ConceptTag, {
    letter: "C",
    title: "Sidebar + right-pane tabs",
    sub: "Identity on the left, analysis on the right"
  }), /*#__PURE__*/React.createElement("div", {
    className: "detail-header",
    style: {
      paddingBottom: 14,
      marginBottom: 14,
      borderBottom: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-header-meta",
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "crumb",
    style: {
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("a", null, "Brands"), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "current"
  }, d.name)), /*#__PURE__*/React.createElement("div", {
    className: "detail-header-row1"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "detail-header-title",
    style: {
      fontSize: 28
    }
  }, d.name), /*#__PURE__*/React.createElement(StatusTag, {
    label: d.status.label,
    tone: d.status.tone
  }))), /*#__PURE__*/React.createElement("div", {
    className: "detail-header-actions"
  }, /*#__PURE__*/React.createElement(DetailActions, {
    mode: "perf"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "twin-pane"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twin-pane-side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twin-pane-side-head"
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: d.initials,
    hue: d.hue,
    size: 56
  }), /*#__PURE__*/React.createElement("h2", {
    className: "name"
  }, d.name), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, d.category, " \xB7 ", d.region)), /*#__PURE__*/React.createElement("div", {
    className: "side-fact-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "side-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Carried since"), /*#__PURE__*/React.createElement("span", {
    className: "v text"
  }, d.carriedSince)), /*#__PURE__*/React.createElement("div", {
    className: "side-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Principal"), /*#__PURE__*/React.createElement("span", {
    className: "v text"
  }, d.principalContact.name)), /*#__PURE__*/React.createElement("div", {
    className: "side-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Phone"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, d.principalContact.phone)), /*#__PURE__*/React.createElement("div", {
    className: "side-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "GSTIN"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, d.gstin)), /*#__PURE__*/React.createElement("div", {
    className: "side-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Payment terms"), /*#__PURE__*/React.createElement("span", {
    className: "v text"
  }, d.paymentTerms)), /*#__PURE__*/React.createElement("div", {
    className: "side-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Margin agreement"), /*#__PURE__*/React.createElement("span", {
    className: "v text"
  }, d.marginAgreement)), /*#__PURE__*/React.createElement("div", {
    className: "side-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Default cohort"), /*#__PURE__*/React.createElement("span", {
    className: "v text",
    style: {
      color: 'var(--teal-500)'
    }
  }, d.defaultCohort)), /*#__PURE__*/React.createElement("div", {
    className: "side-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Price list"), /*#__PURE__*/React.createElement("span", {
    className: "v text",
    style: {
      color: 'var(--teal-500)'
    }
  }, d.masterPriceList))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px',
      borderTop: '1px solid var(--cream-300)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-secondary cockpit-btn-sm",
    style: {
      width: '100%',
      justifyContent: 'center'
    }
  }, "Edit identity"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(MetaStrip, {
    tiles: BRAND_META_TILES.slice(0, 4)
  }), /*#__PURE__*/React.createElement(DetailTabs, {
    tabs: [{
      id: 'performance',
      label: 'Performance'
    }, {
      id: 'buyers',
      label: 'Buyers',
      badge: d.perf.activeBuyers
    }, {
      id: 'catalogs',
      label: 'Catalogs',
      badge: 12
    }, {
      id: 'activity',
      label: 'Activity'
    }],
    active: tab,
    onChange: setTab
  }), tab === 'performance' && /*#__PURE__*/React.createElement(BrandPerf, {
    d: d
  }), tab !== 'performance' && /*#__PURE__*/React.createElement("div", {
    className: "section-card section-card-body padded",
    style: {
      textAlign: 'center',
      color: 'var(--cream-700)',
      padding: 40
    }
  }, /*#__PURE__*/React.createElement("em", null, tab, " \u2014 same chrome, different body.")))));
}
Object.assign(window, {
  PatternA,
  PatternB,
  PatternC
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "details/Patterns.jsx", error: String((e && e.message) || e) }); }

// details/Perf.jsx
try { (() => {
// details/Perf.jsx — Performance panels for each entity.

/* Generic helper — small KPI block embedded inside a perf panel */
function PerfStat({
  label,
  value,
  sub,
  tone
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 0,
      fontSize: 10.5
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 500,
      letterSpacing: '-0.01em',
      marginTop: 4,
      fontVariantNumeric: 'tabular-nums',
      color: tone === 'danger' ? 'var(--danger-500)' : 'var(--cream-900)'
    }
  }, value), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 2,
      fontSize: 11.5,
      color: 'var(--cream-700)'
    }
  }, sub));
}

/* ─── BRAND PERF ───────────────────────────────────────────── */
function BrandPerf({
  d
}) {
  const p = d.perf;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "perf-grid",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "GMV trend"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Last 12 months \xB7 this brand")), /*#__PURE__*/React.createElement("div", {
    className: "view-switch",
    style: {
      background: 'var(--cream-200)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "is-active"
  }, "12 mo"), /*#__PURE__*/React.createElement("button", null, "YTD"), /*#__PURE__*/React.createElement("button", null, "3 mo"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-headline"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, inrShort(p.gmv)), /*#__PURE__*/React.createElement("div", {
    className: "h"
  }, /*#__PURE__*/React.createElement(GrowthPill, {
    value: p.growth
  }), " vs last month \xB7 ", inrShort(p.gmvPrior))), /*#__PURE__*/React.createElement(TrendChart, {
    data: p.trend,
    labels: p.trendLabels
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "editorial"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "This brand"), /*#__PURE__*/React.createElement("p", null, /*#__PURE__*/React.createElement("b", null, "WineYard"), " is your largest principal \u2014 ", /*#__PURE__*/React.createElement("b", null, p.share, "%"), " of portfolio, growing +", p.growth, "% MoM. Singh Hospitality drove a third of GMV this month. Restock the Cabernet Sauvignon by ", /*#__PURE__*/React.createElement("b", null, "Jul 12"), " to avoid a stockout.")), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18,
      rowGap: 18
    }
  }, /*#__PURE__*/React.createElement(PerfStat, {
    label: "Margin (avg)",
    value: `${p.margin}%`,
    sub: "across SKUs"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Sell-through",
    value: `${p.sellThrough}%`,
    sub: "last 30 days"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Repeat rate",
    value: `${p.repeatRate}%`,
    sub: "buyers re-ordering"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Buyer reach",
    value: `${p.activeBuyers}/${p.totalBuyers}`,
    sub: "bought this month"
  })))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-grid cols-2",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Top buyers"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "By GMV \xB7 this month")), /*#__PURE__*/React.createElement("a", {
    className: "panel-link"
  }, "See all \u2192")), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("div", {
    className: "compact-list"
  }, p.topBuyers.map((b, i) => /*#__PURE__*/React.createElement("div", {
    className: "compact-row",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "idx"
  }, i + 1), /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: b.name.split(' ').map(w => w[0]).slice(0, 2).join(''),
    hue: ['teal', 'ember', 'cream', 'teal'][i],
    size: 28
  }), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, b.name, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, b.city.toUpperCase())), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, inrShort(b.spend), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, b.orders, " orders"))))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Top SKUs"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "By units \xB7 this month")), /*#__PURE__*/React.createElement("a", {
    className: "panel-link"
  }, "See all \u2192")), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("div", {
    className: "compact-list"
  }, p.topSkus.map((s, i) => /*#__PURE__*/React.createElement("div", {
    className: "compact-row",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "idx"
  }, i + 1), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, s.name, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, s.sku)), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, inrShort(s.gmv), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, s.units, " units")))))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Catalog history"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "What you sent \xB7 how it landed"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("table", {
    className: "simple-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Catalog"), /*#__PURE__*/React.createElement("th", null, "Sent"), /*#__PURE__*/React.createElement("th", null, "Cohort"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Orders"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "GMV"))), /*#__PURE__*/React.createElement("tbody", null, p.catalogHistory.map((c, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", null, c.name), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11.5,
      color: 'var(--cream-700)'
    }
  }, c.sent), /*#__PURE__*/React.createElement("td", null, c.cohort), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, c.orders), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, inrShort(c.gmv)))))))));
}

/* ─── PRODUCT PERF ─────────────────────────────────────────── */
function ProductPerf({
  d
}) {
  const p = d.perf;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "perf-grid",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Units sold"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Last 12 months"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-headline"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, p.units), /*#__PURE__*/React.createElement("div", {
    className: "h"
  }, /*#__PURE__*/React.createElement(GrowthPill, {
    value: p.growth
  }), " \xB7 ", inrShort(p.gmv), " in revenue")), /*#__PURE__*/React.createElement(TrendChart, {
    data: p.trend,
    accent: "var(--ember-400)",
    accentSoft: "rgba(194,110,58,0.10)"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Inventory & ops"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18,
      rowGap: 18
    }
  }, /*#__PURE__*/React.createElement(PerfStat, {
    label: "On hand",
    value: `${p.onHand}`,
    sub: "bottles"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Days of cover",
    value: `${p.daysOfCover} d`,
    sub: "at current pace",
    tone: p.daysOfCover < 14 ? 'danger' : ''
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Sell-through",
    value: `${p.sellThrough}%`,
    sub: "last 30 days"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Last ordered",
    value: p.lastOrdered,
    sub: "Singh Hospitality"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-grid cols-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Top buyers"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Who's been buying this SKU"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("div", {
    className: "compact-list"
  }, p.topBuyers.map((b, i) => /*#__PURE__*/React.createElement("div", {
    className: "compact-row",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "idx"
  }, i + 1), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, b.name, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, b.city.toUpperCase())), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, b.units, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "bottles"))))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Price by cohort"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Base + overrides"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("table", {
    className: "simple-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Cohort"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Price"), /*#__PURE__*/React.createElement("th", null, "Override"))), /*#__PURE__*/React.createElement("tbody", null, p.priceByCohort.map((row, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", null, row.cohort), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, inrFmt(row.price)), /*#__PURE__*/React.createElement("td", null, row.override ? /*#__PURE__*/React.createElement(StatusTag, {
    label: "Override",
    tone: "accent"
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--cream-700)'
    }
  }, "\u2014"))))))))));
}

/* ─── CUSTOMER PERF ────────────────────────────────────────── */
function CustomerPerf({
  d
}) {
  const p = d.perf;
  const utilization = Math.round(d.creditUsed / d.creditLimit * 100);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "perf-grid",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Spend trend"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Last 12 months"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-headline"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, inrShort(p.spend)), /*#__PURE__*/React.createElement("div", {
    className: "h"
  }, /*#__PURE__*/React.createElement(GrowthPill, {
    value: p.growth
  }), " \xB7 ", p.orders, " orders \xB7 AOV ", inrShort(p.aov))), /*#__PURE__*/React.createElement(TrendChart, {
    data: p.trend
  }))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Brand mix"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "This month"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mix-bar"
  }, p.brandMix.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `seg ${b.hue}`,
    style: {
      width: b.share + '%'
    }
  }, b.share, "%"))), /*#__PURE__*/React.createElement("div", {
    className: "mix-legend"
  }, p.brandMix.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "mix-legend-row"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: b.hue === 'teal' ? 'var(--teal-500)' : b.hue === 'ember' ? 'var(--ember-400)' : 'var(--cream-600)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, b.name), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, b.share, "%"))))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-grid cols-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Top SKUs"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "What this buyer keeps reordering"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("div", {
    className: "compact-list"
  }, p.topSkus.map((s, i) => /*#__PURE__*/React.createElement("div", {
    className: "compact-row",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "idx"
  }, i + 1), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, s.name, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, s.sku)), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, inrShort(s.gmv), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, s.units, " units"))))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Credit & ops"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18,
      rowGap: 18,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(PerfStat, {
    label: "Last order",
    value: p.lastOrder,
    sub: "\u20B984,200"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Catalog opens",
    value: p.catalogOpens,
    sub: "in PWA, this month"
  })), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 0
    }
  }, "Credit utilization"), /*#__PURE__*/React.createElement("div", {
    className: "gauge"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fill",
    style: {
      width: utilization + '%'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "gauge-foot"
  }, /*#__PURE__*/React.createElement("span", null, inrFmt(d.creditUsed), " used"), /*#__PURE__*/React.createElement("span", null, utilization, "% of ", inrFmt(d.creditLimit))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      fontSize: 12,
      color: 'var(--cream-800)',
      padding: '8px 10px',
      background: 'var(--success-50)',
      borderRadius: 8,
      border: '1px solid rgba(74,124,78,0.18)'
    }
  }, "\u2713 Payment behavior \u2014 ", p.paymentBehavior)))));
}

/* ─── COHORT PERF ──────────────────────────────────────────── */
function CohortPerf({
  d
}) {
  const p = d.perf;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "perf-grid",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "GMV trend"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Last 12 months \xB7 from this cohort"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-headline"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, inrShort(p.gmv)), /*#__PURE__*/React.createElement("div", {
    className: "h"
  }, /*#__PURE__*/React.createElement(GrowthPill, {
    value: p.growth
  }), " vs last month \xB7 AOV ", inrShort(p.avgOrderValue))), /*#__PURE__*/React.createElement(TrendChart, {
    data: p.trend
  }))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Engagement"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18,
      rowGap: 18,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement(PerfStat, {
    label: "Active members",
    value: `${p.activeMembers}/${d.members}`,
    sub: "ordered this month"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Dormant",
    value: p.dormantMembers,
    sub: "no order in 30 days",
    tone: p.dormantMembers > 5 ? 'danger' : ''
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Conversion",
    value: `${p.conversionRate}%`,
    sub: "catalog \u2192 order"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Brands sold",
    value: p.brandsSold,
    sub: "of 5 carried"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-grid cols-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Top members"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "By GMV \xB7 this month"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("div", {
    className: "compact-list"
  }, p.topMembers.map((m, i) => /*#__PURE__*/React.createElement("div", {
    className: "compact-row",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "idx"
  }, i + 1), /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: m.name.split(' ').map(w => w[0]).slice(0, 2).join(''),
    hue: ['teal', 'ember', 'cream', 'teal'][i],
    size: 28
  }), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, m.name, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, m.city.toUpperCase())), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, inrShort(m.spend), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, m.orders, " orders"))))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Catalogs to this cohort"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Recent sends"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("table", {
    className: "simple-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Catalog"), /*#__PURE__*/React.createElement("th", null, "Sent"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Opens"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Orders"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "GMV"))), /*#__PURE__*/React.createElement("tbody", null, p.catalogPerformance.map((c, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", null, c.name), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11.5,
      color: 'var(--cream-700)'
    }
  }, c.sent), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, c.opens), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, c.orders), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, inrShort(c.gmv))))))))));
}

/* ─── CATALOG PERF ─────────────────────────────────────────── */
function CatalogPerf({
  d
}) {
  const p = d.perf;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "perf-grid",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Cumulative orders"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Since publish \xB7 valid until ", d.validUntil))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-headline"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, p.orders), /*#__PURE__*/React.createElement("div", {
    className: "h"
  }, inrShort(p.gmv), " \xB7 ", /*#__PURE__*/React.createElement(GrowthPill, {
    value: p.growth
  }), " vs previous catalog")), /*#__PURE__*/React.createElement(TrendChart, {
    data: p.trend,
    accent: "var(--ember-400)",
    accentSoft: "rgba(194,110,58,0.10)"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Funnel"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 18,
      rowGap: 18
    }
  }, /*#__PURE__*/React.createElement(PerfStat, {
    label: "Views",
    value: p.views,
    sub: `${p.uniqueViewers} unique`
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Opens \u2192 order",
    value: `${p.conversionRate}%`,
    sub: "conversion"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "AOV",
    value: inrShort(p.aov),
    sub: "across orders"
  }), /*#__PURE__*/React.createElement(PerfStat, {
    label: "Abandoners",
    value: p.abandoners,
    sub: "opened, didn't order",
    tone: p.abandoners > 2 ? 'danger' : ''
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-grid cols-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Top SKUs in this catalog"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("div", {
    className: "compact-list"
  }, p.topSkus.map((s, i) => /*#__PURE__*/React.createElement("div", {
    className: "compact-row",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "idx"
  }, i + 1), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, s.name, /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, s.sku)), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, inrShort(s.gmv), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, s.units, " units"))))))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Per-buyer activity"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "From this catalog's cohort"))), /*#__PURE__*/React.createElement("div", {
    className: "perf-panel-body flush"
  }, /*#__PURE__*/React.createElement("table", {
    className: "simple-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Buyer"), /*#__PURE__*/React.createElement("th", null, "Opened"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Orders"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "GMV"))), /*#__PURE__*/React.createElement("tbody", null, p.buyers.map((b, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", null, b.name, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      color: 'var(--cream-700)',
      marginTop: 2
    }
  }, b.city.toUpperCase())), /*#__PURE__*/React.createElement("td", null, b.opened === 'yes' ? /*#__PURE__*/React.createElement(StatusTag, {
    label: "Opened",
    tone: "success"
  }) : /*#__PURE__*/React.createElement(StatusTag, {
    label: "Not yet",
    tone: "warning"
  })), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, b.orders), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, b.gmv > 0 ? inrShort(b.gmv) : '—')))))))));
}
Object.assign(window, {
  PerfStat,
  BrandPerf,
  ProductPerf,
  CustomerPerf,
  CohortPerf,
  CatalogPerf
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "details/Perf.jsx", error: String((e && e.message) || e) }); }

// details/SharedDetails.jsx
try { (() => {
// details/Shared.jsx — shared chrome for entity detail pages.

function StatusTag({
  label,
  tone = 'neutral'
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `status-tag is-${tone}`
  }, label);
}
function ModeBadge({
  mode
}) {
  // For artboards that only show one mode at a time.
  return /*#__PURE__*/React.createElement("span", {
    className: `mode-badge ${mode === 'perf' ? 'is-perf' : 'is-edit'}`
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 50,
      background: 'currentColor',
      display: 'inline-block'
    }
  }), mode === 'perf' ? 'Performance mode' : 'Edit mode');
}
function ConceptTag({
  letter,
  title,
  sub
}) {
  const cls = letter === 'B' ? 'concept-tag is-b' : letter === 'C' ? 'concept-tag is-c' : 'concept-tag';
  return /*#__PURE__*/React.createElement("div", {
    className: cls
  }, /*#__PURE__*/React.createElement("i", null, "Pattern ", letter), /*#__PURE__*/React.createElement("span", null, title), sub && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-700)',
      letterSpacing: 0,
      textTransform: 'none',
      fontWeight: 400,
      fontSize: 11
    }
  }, "\xB7 ", sub));
}
function Crumb({
  path
}) {
  // path: array of { label, current? }
  return /*#__PURE__*/React.createElement("div", {
    className: "crumb"
  }, path.map((p, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/"), p.current ? /*#__PURE__*/React.createElement("span", {
    className: "current"
  }, p.label) : /*#__PURE__*/React.createElement("a", null, p.label))));
}
function DetailHeader({
  crumbPath,
  avatar,
  title,
  status,
  subtitle,
  actions,
  mode,
  onMode
}) {
  // avatar: { initials, hue, kind: 'brand' | 'product' | 'catalog' }
  return /*#__PURE__*/React.createElement(React.Fragment, null, crumbPath && /*#__PURE__*/React.createElement(Crumb, {
    path: crumbPath
  }), /*#__PURE__*/React.createElement("div", {
    className: "detail-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-header-thumb"
  }, avatar.kind === 'catalog' ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 14,
      background: 'linear-gradient(135deg, #346A5C 0%, #1F3A34 100%)',
      color: '#fff',
      fontFamily: 'var(--font-display)',
      fontSize: 13,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 6,
      textAlign: 'center',
      lineHeight: 1.1
    }
  }, avatar.initials) : avatar.kind === 'product' ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 14,
      background: 'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      padding: '0 0 6px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 44,
      borderRadius: '20% 20% 8% 8% / 8% 8% 4% 4%',
      background: 'linear-gradient(180deg, #1F3A34, #142823)'
    }
  })) : /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: avatar.initials,
    hue: avatar.hue,
    size: 64
  })), /*#__PURE__*/React.createElement("div", {
    className: "detail-header-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-header-row1"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "detail-header-title"
  }, title), status && /*#__PURE__*/React.createElement(StatusTag, {
    label: status.label,
    tone: status.tone
  })), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "detail-header-sub"
  }, subtitle.map((s, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, s))))), /*#__PURE__*/React.createElement("div", {
    className: "detail-header-actions"
  }, mode && onMode && /*#__PURE__*/React.createElement("div", {
    className: "mode-toggle"
  }, /*#__PURE__*/React.createElement("button", {
    className: mode === 'edit' ? 'is-active' : '',
    onClick: () => onMode('edit')
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 20h9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"
  })), "Details"), /*#__PURE__*/React.createElement("button", {
    className: mode === 'perf' ? 'is-active' : '',
    onClick: () => onMode('perf')
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 3v18h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 14l4-4 4 4 5-6"
  })), "Performance")), actions)));
}

/* Meta strip — small KPI strip between header and tabs.
   tiles: [{ label, value, sub, deltaTone? }] */
function MetaStrip({
  tiles
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "meta-strip",
    style: {
      gridTemplateColumns: `repeat(${tiles.length}, 1fr)`
    }
  }, tiles.map((t, i) => /*#__PURE__*/React.createElement("div", {
    className: "meta-tile",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, t.label), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, t.value), t.sub && /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, t.sub))));
}

/* Tabs — Pattern A uses these. */
function DetailTabs({
  tabs,
  active,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "detail-tabs"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    className: 'detail-tab' + (active === t.id ? ' is-active' : ''),
    onClick: () => onChange && onChange(t.id)
  }, /*#__PURE__*/React.createElement("span", null, t.label), t.badge != null && /*#__PURE__*/React.createElement("span", {
    className: "badge"
  }, t.badge))));
}

/* Common action buttons. */
function DetailActions({
  primary = 'Save changes',
  primaryHidden,
  secondary,
  mode
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, secondary || /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-ghost",
    title: "Share"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "5",
    r: "3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "19",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"
  }))), /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-secondary"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 10l5 5 5-5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 15V3"
  })), /*#__PURE__*/React.createElement("span", null, "Export")))), !primaryHidden && /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-primary"
  }, mode === 'perf' ? 'Open buyer app preview' : primary));
}

/* Trend area chart — reused on every performance panel. */
function TrendChart({
  data,
  height = 160,
  accent = 'var(--teal-500)',
  accentSoft = 'rgba(31,58,52,0.10)',
  labels
}) {
  const width = 600; // viewBox; will scale via preserveAspectRatio
  const padTop = 8;
  const padBottom = 10;
  const padX = 8;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const pts = data.map((v, i) => {
    const x = padX + i / (data.length - 1) * innerW;
    const y = padTop + (1 - (v - min) / range) * innerH;
    return [x, y];
  });
  const line = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pts[0][0]},${height - padBottom} ` + line + ` ${pts[pts.length - 1][0]},${height - padBottom}`;
  // Last point dot
  const lastX = pts[pts.length - 1][0],
    lastY = pts[pts.length - 1][1];
  return /*#__PURE__*/React.createElement("div", {
    className: "perf-chart-wrap"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "perf-chart",
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none",
    style: {
      color: accent
    }
  }, [0.25, 0.5, 0.75].map((p, i) => /*#__PURE__*/React.createElement("line", {
    key: i,
    x1: padX,
    x2: width - padX,
    y1: padTop + innerH * p,
    y2: padTop + innerH * p,
    stroke: "#EFE9DF",
    strokeWidth: "1",
    strokeDasharray: "3 4"
  })), /*#__PURE__*/React.createElement("polygon", {
    points: area,
    fill: accentSoft
  }), /*#__PURE__*/React.createElement("polyline", {
    points: line,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    vectorEffect: "non-scaling-stroke"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: lastX,
    cy: lastY,
    r: "3.5",
    fill: "#fff",
    stroke: "currentColor",
    strokeWidth: "2"
  })), labels && /*#__PURE__*/React.createElement("div", {
    className: "perf-chart-axis"
  }, labels.map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, l))));
}

/* Field (Edit-mode form row) */
function Field({
  label,
  value,
  mono,
  muted,
  required,
  full,
  multiline
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: full ? {
      gridColumn: '1 / -1'
    } : null
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-label"
  }, /*#__PURE__*/React.createElement("span", null, label), required && /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "*")), /*#__PURE__*/React.createElement("div", {
    className: 'field-value' + (muted ? ' muted' : '')
  }, mono ? /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, value) : multiline ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      lineHeight: 1.55,
      color: 'var(--cream-800)'
    }
  }, value) : /*#__PURE__*/React.createElement("span", null, value)), /*#__PURE__*/React.createElement("span", {
    className: "field-edit-cue"
  }, "\u21B5 edit"));
}
function SectionCard({
  title,
  sub,
  right,
  children,
  flush
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "section-card"
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "section-card-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, title), sub && /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, sub)), right), /*#__PURE__*/React.createElement("div", {
    className: 'section-card-body' + (flush ? '' : ' padded')
  }, children));
}
Object.assign(window, {
  StatusTag,
  ModeBadge,
  ConceptTag,
  Crumb,
  DetailHeader,
  MetaStrip,
  DetailTabs,
  DetailActions,
  TrendChart,
  Field,
  SectionCard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "details/SharedDetails.jsx", error: String((e && e.message) || e) }); }

// details/data.jsx
try { (() => {
// details/data.jsx — Sample entity data for all 5 detail pages.
// Each record carries enough to render BOTH the edit-mode panel
// (form-style key/value pairs) and the performance panel.

const BRAND_DETAIL = {
  id: 'wy',
  name: 'WineYard Vintners',
  initials: 'WY',
  hue: 'teal',
  category: 'Wines',
  region: 'Nashik, Maharashtra',
  status: {
    label: 'On pace',
    tone: 'success'
  },
  carriedSince: 'Apr 2019',
  principalContact: {
    name: 'Ravi Pratap',
    role: 'National sales head',
    phone: '+91 98...12',
    email: 'ravi@wineyard.in'
  },
  gstin: '27AABCW1234A1Z5',
  paymentTerms: 'Net 30',
  marginAgreement: '18%–22% (tiered)',
  defaultCohort: 'North Delhi · A-class',
  masterPriceList: 'WY · Base FY26',
  notes: 'Switch to Q3 reserve allocation in July. Founder visit pending.',
  perf: {
    gmv: 1680000,
    gmvPrior: 1500000,
    growth: 12,
    share: 35.5,
    activeBuyers: 38,
    totalBuyers: 142,
    skus: 82,
    cohorts: 4,
    lowStock: 4,
    daysSinceCatalog: 3,
    margin: 18.4,
    sellThrough: 71,
    repeatRate: 64,
    trend: [62, 68, 71, 70, 78, 82, 79, 88, 84, 92, 96, 100],
    trendLabels: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    topBuyers: [{
      name: 'Singh Hospitality',
      city: 'Bengaluru',
      spend: 384000,
      orders: 6
    }, {
      name: 'Verma & Sons',
      city: 'Gurugram',
      spend: 264000,
      orders: 4
    }, {
      name: 'Rajan Wine Merchants',
      city: 'New Delhi',
      spend: 218000,
      orders: 5
    }, {
      name: 'Mehta Brothers',
      city: 'Mumbai',
      spend: 162000,
      orders: 3
    }],
    topSkus: [{
      name: 'Cabernet Sauvignon 2021',
      sku: 'VINO-CAB-750-2021',
      units: 412,
      gmv: 1009400
    }, {
      name: 'Cabernet Franc Reserve',
      sku: 'VINO-CFR-750-2020',
      units: 168,
      gmv: 500640
    }, {
      name: 'Estate Chardonnay 2022',
      sku: 'VINO-CHR-750-2022',
      units: 92,
      gmv: 170200
    }],
    catalogHistory: [{
      name: 'Summer Pours',
      sent: 'Jun 24',
      cohort: 'North Delhi · A-class',
      orders: 14,
      gmv: 412000
    }, {
      name: 'Premium Reserve',
      sent: 'Jun 12',
      cohort: 'South India Specialty',
      orders: 11,
      gmv: 612000
    }, {
      name: 'Vintage Drop',
      sent: 'May 30',
      cohort: 'Maharashtra Premium',
      orders: 8,
      gmv: 248000
    }]
  }
};
const PRODUCT_DETAIL = {
  id: 'p1',
  name: 'Cabernet Sauvignon 2021',
  brand: 'WineYard Vintners',
  brandInitials: 'WY',
  brandHue: 'teal',
  sku: 'VINO-CAB-750-2021',
  hsn: '22042100',
  gstRate: '28%',
  pack: '750 ml',
  caseSize: '12 bottles',
  mrp: 2800,
  basePrice: 2450,
  weight: '1.4 kg',
  status: {
    label: 'In stock',
    tone: 'success'
  },
  category: 'Red wine',
  vintage: '2021',
  description: 'Single-estate Cabernet Sauvignon from Nashik. Aged 14 months in French oak. Full-bodied, blackcurrant and graphite.',
  perf: {
    units: 412,
    unitsPrior: 368,
    growth: 12,
    gmv: 1009400,
    returns: 0,
    sellThrough: 71,
    onHand: 96,
    daysOfCover: 14,
    lastOrdered: '4h ago',
    trend: [22, 26, 28, 32, 34, 36, 38, 42, 44, 48, 50, 52],
    topBuyers: [{
      name: 'Singh Hospitality',
      city: 'Bengaluru',
      units: 96
    }, {
      name: 'Rajan Wine Merchants',
      city: 'New Delhi',
      units: 72
    }, {
      name: 'Verma & Sons',
      city: 'Gurugram',
      units: 48
    }, {
      name: 'Hotel Lalit',
      city: 'New Delhi',
      units: 36
    }],
    priceByCohort: [{
      cohort: 'North Delhi · A-class',
      price: 2450,
      override: false
    }, {
      cohort: 'Maharashtra Premium',
      price: 2380,
      override: true
    }, {
      cohort: 'South India Specialty',
      price: 2520,
      override: true
    }, {
      cohort: 'All buyers (base)',
      price: 2450,
      override: false
    }]
  }
};
const CUSTOMER_DETAIL = {
  id: 'b4',
  name: 'Singh Hospitality',
  initials: 'SH',
  hue: 'ember',
  city: 'Bengaluru, Karnataka',
  tier: 'A',
  status: {
    label: 'Active',
    tone: 'success'
  },
  buyerSince: 'Jan 2021',
  contact: {
    name: 'Harpreet Singh',
    role: 'Procurement lead',
    phone: '+91 99...44',
    email: 'p@singhh.in'
  },
  gstin: '29ABFCS9912H1ZK',
  pan: 'ABFCS9912H',
  paymentTerms: 'Net 21',
  creditLimit: 600000,
  creditUsed: 384000,
  defaultCohort: 'South India Specialty',
  billing: '14 Lavelle Road, Bengaluru 560001',
  shipping: '14 Lavelle Road, Bengaluru 560001',
  notes: 'Hospitality group · 3 hotels. Prefers Friday deliveries. Founder visit Q3.',
  perf: {
    spend: 612000,
    spendPrior: 484000,
    growth: 26,
    orders: 6,
    aov: 102000,
    lastOrder: '3d ago',
    brandMix: [{
      name: 'WineYard',
      share: 48,
      hue: 'teal'
    }, {
      name: 'Khanna Brewing',
      share: 22,
      hue: 'ember'
    }, {
      name: 'Maison Roussel',
      share: 18,
      hue: 'cream'
    }, {
      name: 'Aravalli',
      share: 12,
      hue: 'ember'
    }],
    topSkus: [{
      name: 'Cabernet Sauvignon 2021',
      sku: 'VINO-CAB-750-2021',
      units: 96,
      gmv: 235200
    }, {
      name: 'Indian Pale Ale',
      sku: 'KHAN-IPA-330-006',
      units: 84,
      gmv: 48720
    }, {
      name: 'Chenin Blanc',
      sku: 'MRSL-CB-750-2022',
      units: 42,
      gmv: 68880
    }],
    trend: [42, 48, 52, 58, 64, 72, 70, 78, 84, 88, 96, 102],
    paymentBehavior: 'On time · 22 of 24 invoices',
    catalogOpens: 14
  }
};
const COHORT_DETAIL = {
  id: 'mh-prem',
  name: 'Maharashtra Premium',
  status: {
    label: 'Active',
    tone: 'success'
  },
  description: 'A-class and B-class buyers in Maharashtra with focus on premium wines and import labels.',
  members: 28,
  totalBuyers: 142,
  rules: [{
    k: 'State',
    v: 'Maharashtra'
  }, {
    k: 'Tier',
    v: 'A or B'
  }, {
    k: 'Brand focus',
    v: 'WineYard, Maison Roussel'
  }, {
    k: 'Order history',
    v: '≥ ₹50 K in last 90 days'
  }],
  defaultPriceList: 'MH Premium · FY26',
  applicableCatalogs: 3,
  createdBy: 'Phani Raju · Apr 2025',
  perf: {
    gmv: 1140000,
    gmvPrior: 1020000,
    growth: 12,
    avgOrderValue: 124000,
    conversionRate: 38,
    activeMembers: 19,
    dormantMembers: 9,
    brandsSold: 5,
    trend: [60, 64, 68, 66, 72, 74, 78, 82, 80, 86, 90, 94],
    topMembers: [{
      name: 'Mehta Brothers',
      city: 'Mumbai',
      spend: 246000,
      orders: 4
    }, {
      name: 'Kapoor Spirits',
      city: 'Pune',
      spend: 184000,
      orders: 3
    }, {
      name: 'Borivali Wines',
      city: 'Mumbai',
      spend: 142000,
      orders: 3
    }, {
      name: 'Solapur Cellars',
      city: 'Solapur',
      spend: 96000,
      orders: 2
    }],
    catalogPerformance: [{
      name: 'Premium Reserve',
      sent: 'Jun 12',
      opens: 24,
      orders: 11,
      gmv: 612000
    }, {
      name: 'New Arrivals · May',
      sent: 'May 30',
      opens: 22,
      orders: 8,
      gmv: 248000
    }]
  }
};
const CATALOG_DETAIL = {
  id: 'c1',
  name: 'Summer Pours',
  cohort: 'North Delhi · A-class',
  cohortMembers: 12,
  hue: 'teal',
  status: {
    label: 'Live',
    tone: 'success'
  },
  validFrom: 'May 20',
  validUntil: 'May 31',
  daysLeft: 4,
  products: 28,
  intro: 'Six new arrivals plus the WineYard summer favourites. Order by Friday for Monday delivery.',
  brandsCovered: 3,
  publishedBy: 'Phani Raju',
  publishedAt: 'May 20, 4:12 pm',
  perf: {
    views: 184,
    uniqueViewers: 11,
    orders: 14,
    conversionRate: 50,
    gmv: 412000,
    gmvPrior: 286000,
    aov: 29400,
    growth: 44,
    abandoners: 3,
    trend: [0, 12, 28, 38, 46, 58, 64, 78, 92, 108, 122, 142],
    topSkus: [{
      name: 'Cabernet Sauvignon 2021',
      sku: 'VINO-CAB-750-2021',
      units: 96,
      gmv: 235200
    }, {
      name: 'Cabernet Franc Reserve',
      sku: 'VINO-CFR-750-2020',
      units: 48,
      gmv: 143040
    }, {
      name: 'Estate Chardonnay 2022',
      sku: 'VINO-CHR-750-2022',
      units: 24,
      gmv: 44400
    }],
    buyers: [{
      name: 'Rajan Wine Merchants',
      city: 'New Delhi',
      orders: 2,
      gmv: 84200,
      opened: 'yes'
    }, {
      name: 'Verma & Sons',
      city: 'Gurugram',
      orders: 4,
      gmv: 218500,
      opened: 'yes'
    }, {
      name: 'Hotel Lalit',
      city: 'New Delhi',
      orders: 3,
      gmv: 96200,
      opened: 'yes'
    }, {
      name: 'Capitol Spirits',
      city: 'New Delhi',
      orders: 0,
      gmv: 0,
      opened: 'no'
    }]
  }
};
Object.assign(window, {
  BRAND_DETAIL,
  PRODUCT_DETAIL,
  CUSTOMER_DETAIL,
  COHORT_DETAIL,
  CATALOG_DETAIL
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "details/data.jsx", error: String((e && e.message) || e) }); }

// dialogs/Calendar.jsx
try { (() => {
// CalendarPicker.jsx — Date picker component aligned to DealFlow design system
// Standalone calendar widget with month/year navigation, keyboard support, and
// integration into modal/slide-over contexts. Follows the Ember/Cream palette.

const Calendar = ({
  value,
  onChange,
  minDate,
  maxDate
}) => {
  const [viewDate, setViewDate] = React.useState(() => {
    if (value instanceof Date) return new Date(value);
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [inputValue, setInputValue] = React.useState(() => {
    if (value instanceof Date) {
      return value.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    }
    return '';
  });

  // Validate that a date is within bounds
  const isDateValid = date => {
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    return true;
  };

  // Generate calendar grid for current viewDate
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const calendarDays = (() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    // Pad previous month's days
    const daysInPrevMonth = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        isPrev: true
      });
    }

    // Current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        isPrev: false
      });
    }

    // Pad next month's days
    const totalCells = days.length;
    const remaining = 42 - totalCells; // 6 rows × 7 days
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        isPrev: false
      });
    }
    return days;
  })();
  const handleDayClick = dayObj => {
    if (!dayObj.isCurrentMonth) return;
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayObj.day);
    if (!isDateValid(newDate)) return;
    onChange(newDate);
  };
  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1));
  };
  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1));
  };
  const handleInputChange = e => {
    const val = e.target.value;
    setInputValue(val);
    // Try to parse DD/MM/YYYY or DD-MM-YYYY
    const match = val.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      const parsed = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      if (!isNaN(parsed) && isDateValid(parsed)) {
        onChange(parsed);
        setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      }
    }
  };
  const monthYear = viewDate.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric'
  });
  return /*#__PURE__*/React.createElement("div", {
    style: calendarPickerStyles.container
  }, /*#__PURE__*/React.createElement("div", {
    style: calendarPickerStyles.inputSection
  }, /*#__PURE__*/React.createElement("label", {
    style: calendarPickerStyles.label
  }, "Select date"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: inputValue,
    onChange: handleInputChange,
    placeholder: "DD/MM/YYYY",
    style: calendarPickerStyles.input
  })), /*#__PURE__*/React.createElement("div", {
    style: calendarPickerStyles.calendar
  }, /*#__PURE__*/React.createElement("div", {
    style: calendarPickerStyles.header
  }, /*#__PURE__*/React.createElement("button", {
    onClick: handlePrevMonth,
    style: calendarPickerStyles.navButton
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronLeft",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: calendarPickerStyles.monthYear
  }, monthYear), /*#__PURE__*/React.createElement("button", {
    onClick: handleNextMonth,
    style: calendarPickerStyles.navButton
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronRight",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    style: calendarPickerStyles.weekDays
  }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => /*#__PURE__*/React.createElement("div", {
    key: day,
    style: calendarPickerStyles.weekDay
  }, day))), /*#__PURE__*/React.createElement("div", {
    style: calendarPickerStyles.daysGrid
  }, calendarDays.map((dayObj, idx) => {
    let cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayObj.day);
    if (!dayObj.isCurrentMonth) {
      const prevMonthDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, dayObj.day);
      const nextMonthDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, dayObj.day);
      cellDate = dayObj.isPrev ? prevMonthDate : nextMonthDate;
    }
    const isSelected = value instanceof Date && value.getFullYear() === cellDate.getFullYear() && value.getMonth() === cellDate.getMonth() && value.getDate() === cellDate.getDate();
    const isToday = (() => {
      const today = new Date();
      return today.getFullYear() === cellDate.getFullYear() && today.getMonth() === cellDate.getMonth() && today.getDate() === cellDate.getDate();
    })();
    const isDisabled = !dayObj.isCurrentMonth || !isDateValid(cellDate);
    return /*#__PURE__*/React.createElement("button", {
      key: idx,
      onClick: () => handleDayClick(dayObj),
      disabled: isDisabled,
      style: {
        ...calendarPickerStyles.dayButton,
        ...(isDisabled ? calendarPickerStyles.dayButtonDisabled : {}),
        ...(isSelected ? calendarPickerStyles.dayButtonSelected : {}),
        ...(isToday && !isSelected ? calendarPickerStyles.dayButtonToday : {}),
        ...(dayObj.isCurrentMonth ? {} : calendarPickerStyles.dayButtonOtherMonth)
      }
    }, dayObj.day);
  }))));
};
const calendarPickerStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: '#fff',
    borderRadius: 12,
    padding: 16,
    border: '1px solid var(--cream-300)'
  },
  inputSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--cream-800)',
    letterSpacing: 0
  },
  input: {
    width: '100%',
    border: '1px solid var(--cream-400)',
    borderRadius: 8,
    background: '#fff',
    padding: '9px 12px',
    fontSize: 13.5,
    color: 'var(--cream-900)',
    boxShadow: 'inset 0 1px 0 rgba(20, 40, 35, 0.02)',
    outline: 'none',
    fontFamily: 'var(--font-body)'
  },
  calendar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  navButton: {
    width: 32,
    height: 32,
    border: '1px solid var(--cream-300)',
    borderRadius: 8,
    background: '#fff',
    color: 'var(--cream-700)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 120ms'
  },
  monthYear: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--cream-900)',
    flex: 1,
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.01em'
  },
  weekDays: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2
  },
  weekDay: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--cream-700)',
    textAlign: 'center',
    padding: '8px 4px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2
  },
  dayButton: {
    width: '100%',
    aspectRatio: '1',
    border: '1px solid transparent',
    borderRadius: 8,
    background: '#fff',
    color: 'var(--cream-900)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 120ms',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-body)'
  },
  dayButtonDisabled: {
    color: 'var(--cream-400)',
    cursor: 'not-allowed',
    background: 'var(--cream-50)'
  },
  dayButtonOtherMonth: {
    color: 'var(--cream-300)',
    background: 'transparent'
  },
  dayButtonSelected: {
    background: 'var(--teal-500)',
    color: 'var(--cream-50)',
    border: '1px solid var(--teal-500)',
    fontWeight: 600
  },
  dayButtonToday: {
    border: '1px solid var(--ember-400)',
    color: 'var(--ember-500)'
  }
};
Object.assign(window, {
  Calendar
});
Object.assign(__ds_scope, { Calendar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/Calendar.jsx", error: String((e && e.message) || e) }); }

// dialogs/composers-extra.jsx
try { (() => {
// dialogs/composers-extra.jsx
//
// Composer pattern applied to Cohort and Catalog — same chrome as the
// Pricelist composer (composers.jsx). The frame stays identical; what
// changes is the data shape:
//
//   · Pricelist · rows = SKUs     · summary = pricing impact
//   · Cohort    · rows = buyers   · summary = group profile
//   · Catalog   · rows = products · summary = what the cohort will see
//
// Reuses ComposerTop and ComposerTitle from composers.jsx (window).
//
// Exports (window):
//   ComposerCohortCreate   ComposerCohortEdit
//   ComposerCatalogCreate  ComposerCatalogEdit

/* ──────────────── shared utilities ──────────────── */
const _inr = n => '₹' + n.toLocaleString('en-IN');
const _inrL = n => n >= 100000 ? '₹' + (n / 100000).toFixed(1) + ' L' : '₹' + n.toLocaleString('en-IN');

/* ──────────────── DATA ──────────────── */

const BUYERS = [{
  id: 'B‑2024‑0114',
  name: 'Bharat Stores',
  geo: 'Karol Bagh, North Delhi',
  tier: 'A',
  lastOrder: '2 days ago',
  mtd: 240000,
  credit: 'Net 21',
  av: 'BS',
  hue: 'teal'
}, {
  id: 'B‑2024‑0122',
  name: 'Mehra Stores',
  geo: 'Rohini, North Delhi',
  tier: 'A',
  lastOrder: '1 day ago',
  mtd: 210000,
  credit: 'Net 21',
  av: 'MS',
  hue: 'ember'
}, {
  id: 'B‑2024‑0138',
  name: 'Singh Liquor Mart',
  geo: 'Pitampura, North Delhi',
  tier: 'A',
  lastOrder: '3 days ago',
  mtd: 190000,
  credit: 'Net 21',
  av: 'SL',
  hue: 'cream'
}, {
  id: 'B‑2024‑0151',
  name: 'Sehgal & Sons',
  geo: 'Greater Kailash, South Delhi',
  tier: 'A',
  lastOrder: '1 day ago',
  mtd: 320000,
  credit: 'Net 30',
  av: 'SS',
  hue: 'teal'
}, {
  id: 'B‑2024‑0163',
  name: 'Gupta Wines',
  geo: 'CR Park, South Delhi',
  tier: 'A',
  lastOrder: '5 days ago',
  mtd: 110000,
  credit: 'Net 15',
  av: 'GW',
  hue: 'ember'
}, {
  id: 'B‑2024‑0177',
  name: 'Khurana Cellars',
  geo: 'Rajouri Garden, West Delhi',
  tier: 'B',
  lastOrder: '12 days ago',
  mtd: 60000,
  credit: 'Net 15',
  av: 'KC',
  hue: 'cream'
}, {
  id: 'B‑2024‑0189',
  name: 'Patel Provisions',
  geo: 'Janakpuri, West Delhi',
  tier: 'B',
  lastOrder: '8 days ago',
  mtd: 80000,
  credit: 'Net 15',
  av: 'PP',
  hue: 'teal'
}];
const PRODUCTS = [{
  sku: 'SKU‑2026‑00471',
  name: 'Vinikus Shiraz Reserve · 750ml',
  brand: 'Vinikus Estates',
  av: 'VE',
  hue: 'teal',
  base: 1280,
  stock: 142,
  state: 'in',
  tag: 'NEW'
}, {
  sku: 'SKU‑2026‑00472',
  name: 'Vinikus Sauvignon Blanc · 750ml',
  brand: 'Vinikus Estates',
  av: 'VE',
  hue: 'teal',
  base: 980,
  stock: 88,
  state: 'in',
  tag: null
}, {
  sku: 'SKU‑2026‑00473',
  name: 'Vinikus Cabernet Estate · 750ml',
  brand: 'Vinikus Estates',
  av: 'VE',
  hue: 'teal',
  base: 1540,
  stock: 36,
  state: 'in',
  tag: null
}, {
  sku: 'SKU‑2026‑00481',
  name: 'Casa del Sol Tempranillo · 750ml',
  brand: 'Casa del Sol',
  av: 'CS',
  hue: 'ember',
  base: 1680,
  stock: 56,
  state: 'in',
  tag: 'NEW'
}, {
  sku: 'SKU‑2026‑00482',
  name: 'Casa del Sol Albariño · 750ml',
  brand: 'Casa del Sol',
  av: 'CS',
  hue: 'ember',
  base: 1380,
  stock: 12,
  state: 'low',
  tag: null
}, {
  sku: 'SKU‑2026‑00483',
  name: 'Casa del Sol Reserva Roble · 750ml',
  brand: 'Casa del Sol',
  av: 'CS',
  hue: 'ember',
  base: 2240,
  stock: 0,
  state: 'out',
  tag: null
}, {
  sku: 'SKU‑2026‑00501',
  name: 'Konkan Cellars Feni · 750ml',
  brand: 'Konkan Cellars',
  av: 'KC',
  hue: 'cream',
  base: 740,
  stock: 64,
  state: 'in',
  tag: 'NEW'
}];

/* ─────────────────────────────────────────────────────────────
   COHORT
   ───────────────────────────────────────────────────────────── */

/* Filter rail — geography / tier / activity. The "activity" radio
   slot replaces the pricelist's "pricing strategy" — same shape, so
   the rail reads identically across composers. */
function CohortFilterRail({
  areas = [],
  tiers = [],
  recent = '30'
}) {
  const allAreas = [{
    name: 'North Delhi',
    count: 28
  }, {
    name: 'South Delhi',
    count: 19
  }, {
    name: 'West Delhi',
    count: 24
  }, {
    name: 'East Delhi',
    count: 11
  }, {
    name: 'NCR · Gurgaon',
    count: 16
  }, {
    name: 'NCR · Noida',
    count: 14
  }];
  const allTiers = [{
    name: 'A‑class',
    count: 31
  }, {
    name: 'B‑class',
    count: 48
  }, {
    name: 'C‑class',
    count: 22
  }, {
    name: 'Unsorted',
    count: 11
  }];
  const recencyHint = {
    any: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "No recency filter."), " Every matching buyer is in the cohort, including dormant ones."),
    '30': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "Ordered in the last 30 days."), " The cohort recomputes nightly \u2014 dormant buyers drop off automatically."),
    '90': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "Ordered in the last 90 days."), " A wider net \u2014 good for seasonal pricelists that need to reach lapsed buyers."),
    dormant: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "Dormant 90+ days."), " Win\u2011back targeting. Pair with a discount pricelist to re\u2011engage.")
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "filter-rail"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Geography"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, allAreas.map(a => /*#__PURE__*/React.createElement("label", {
    key: a.name,
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: areas.includes(a.name)
  }), " ", a.name), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, a.count))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Tier"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, allTiers.map(t => /*#__PURE__*/React.createElement("label", {
    key: t.name,
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: tiers.includes(t.name)
  }), " ", t.name), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, t.count))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Last ordered"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, [{
    k: 'any',
    label: 'Anytime'
  }, {
    k: '30',
    label: 'Within 30 days'
  }, {
    k: '90',
    label: 'Within 90 days'
  }, {
    k: 'dormant',
    label: 'Dormant 90+ days'
  }].map(opt => /*#__PURE__*/React.createElement("div", {
    className: "strat-option",
    key: opt.k
  }, /*#__PURE__*/React.createElement("label", {
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "cohort-recent",
    defaultChecked: recent === opt.k
  }), " ", opt.label)))), /*#__PURE__*/React.createElement("div", {
    className: "strat-hint"
  }, recencyHint[recent]))));
}

/* Buyer table — same chrome as the pricelist's price table.
   `mode='edit'` shows the "Was" column equivalent here as a status pill
   (Added / Removed / Live) and the ember bar on changed rows. */
function BuyerTable({
  mode = 'create',
  addedIds = [],
  removedIds = [],
  searchTerm = ''
}) {
  const tierStyle = t => t === 'A' ? {
    background: 'var(--ember-50)',
    color: 'var(--ember-700)',
    borderColor: 'var(--ember-100)'
  } : {
    background: 'var(--cream-100)',
    color: 'var(--cream-800)',
    borderColor: 'var(--cream-300)'
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "comp-table-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "comp-table-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, mode === 'edit' ? `${BUYERS.length} buyers · ${addedIds.length} added · ${removedIds.length} removed` : `${BUYERS.length} buyers match the rules above`), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, mode === 'edit' ? /*#__PURE__*/React.createElement(React.Fragment, null, "Added rows sit at the top. Removed buyers stay visible \u2014 struck through \u2014 until you save.") : /*#__PURE__*/React.createElement(React.Fragment, null, "Untick to exclude. Switch ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "Type"), " to ", /*#__PURE__*/React.createElement("em", null, "Manual pick"), " to ignore the rules above."))), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "comp-table-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 13,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search name, code, area",
    defaultValue: searchTerm
  }), /*#__PURE__*/React.createElement("kbd", null, "\u2318F")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 13
  }), "Add buyer manually")), /*#__PURE__*/React.createElement("table", {
    className: "comp-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 28
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: true,
    style: {
      accentColor: 'var(--teal-500)'
    }
  })), /*#__PURE__*/React.createElement("th", null, "Buyer"), /*#__PURE__*/React.createElement("th", null, "Geography"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 82
    }
  }, "Tier"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 116
    }
  }, "Last order"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 104
    },
    className: "num"
  }, "MTD spend"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 84
    }
  }, "Credit"), mode === 'edit' && /*#__PURE__*/React.createElement("th", {
    style: {
      width: 92
    }
  }, "\u0394"))), /*#__PURE__*/React.createElement("tbody", null, BUYERS.map(b => {
    const added = addedIds.includes(b.id);
    const removed = removedIds.includes(b.id);
    const changed = added || removed;
    return /*#__PURE__*/React.createElement("tr", {
      key: b.id,
      className: changed ? 'is-changed' : ''
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      defaultChecked: !removed,
      style: {
        accentColor: 'var(--teal-500)'
      }
    })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: `b-av b-av--${b.hue}`,
      style: {
        width: 28,
        height: 28,
        borderRadius: 6,
        fontSize: 10
      }
    }, b.av), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13.5,
        color: removed ? 'var(--cream-700)' : 'var(--cream-900)',
        fontWeight: 500,
        textDecoration: removed ? 'line-through' : 'none'
      }
    }, b.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--cream-700)',
        marginTop: 1
      }
    }, b.id)))), /*#__PURE__*/React.createElement("td", {
      style: {
        fontSize: 12.5,
        color: 'var(--cream-800)'
      }
    }, b.geo), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        border: '1px solid',
        ...tierStyle(b.tier)
      }
    }, b.tier, "\u2011class")), /*#__PURE__*/React.createElement("td", {
      style: {
        fontSize: 12.5,
        color: 'var(--cream-800)'
      }
    }, b.lastOrder), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, _inrL(b.mtd)), /*#__PURE__*/React.createElement("td", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        color: 'var(--cream-700)'
      }
    }, b.credit), mode === 'edit' && /*#__PURE__*/React.createElement("td", null, added && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 999,
        background: 'var(--success-50)',
        color: 'var(--success-700)',
        border: '1px solid #C8DDC9',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em'
      }
    }, "ADDED"), removed && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 999,
        background: 'var(--danger-50)',
        color: 'var(--danger-700)',
        border: '1px solid #EAC8C0',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em'
      }
    }, "REMOVED")));
  }))));
}

/* Summary card — Create profile vs Edit diff. */
function CohortSummary({
  mode = 'create'
}) {
  if (mode === 'edit') {
    return /*#__PURE__*/React.createElement("div", {
      className: "summary-card"
    }, /*#__PURE__*/React.createElement("h4", null, "Diff \xB7 what will change"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "name"
    }, "North Delhi \xB7 A\u2011class"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--cream-700)',
        marginTop: 4
      }
    }, "Referenced by 3 pricelists, 2 catalogs \xB7 live")), /*#__PURE__*/React.createElement("div", {
      className: "summary-divider"
    }), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "Members"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "was"
    }, "12"), /*#__PURE__*/React.createElement(Icon, {
      name: "arrowRight",
      size: 12,
      color: "var(--cream-600)"
    }), /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "13"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--good"
    }, "+1 net"))), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "MTD spend"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "was"
    }, "\u20B919.6 L"), /*#__PURE__*/React.createElement(Icon, {
      name: "arrowRight",
      size: 12,
      color: "var(--cream-600)"
    }), /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "\u20B922.7 L"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--good"
    }, "+\u20B93.1 L"))), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "Avg AOV"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "was"
    }, "\u20B938,200"), /*#__PURE__*/React.createElement(Icon, {
      name: "arrowRight",
      size: 12,
      color: "var(--cream-600)"
    }), /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "\u20B941,500"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--good"
    }, "+8.6%"))), /*#__PURE__*/React.createElement("div", {
      className: "summary-divider"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--warning-50)',
        border: '1px solid #F3E2BD',
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 12,
        color: 'var(--warning-700)',
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "alertTriangle",
      size: 14,
      stroke: 1.6,
      color: "var(--warning-500)"
    }), /*#__PURE__*/React.createElement("span", null, "3 pricelists & 2 catalogs reference this cohort. Their reach updates on save. A confirm modal opens before commit.")));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "summary-card"
  }, /*#__PURE__*/React.createElement("h4", null, "Cohort profile"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, "North Delhi \xB7 A\u2011class"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)',
      marginTop: 4
    }
  }, "Rule\u2011based \xB7 auto\u2011updates as buyers join")), /*#__PURE__*/React.createElement("div", {
    className: "summary-divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Members"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "12")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Areas covered"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "2")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "MTD spend"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "\u20B919.6 L")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Avg AOV"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "\u20B938,200")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Active \xB7 30d"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "11 / 12")), /*#__PURE__*/React.createElement("div", {
    className: "summary-divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--teal-50)',
      border: '1px solid var(--teal-100)',
      borderRadius: 10,
      padding: '10px 12px',
      fontSize: 12,
      color: 'var(--teal-700)',
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    stroke: 1.75,
    color: "var(--teal-500)"
  }), /*#__PURE__*/React.createElement("span", null, "Ready to save. You can target this cohort from any pricelist or catalog after.")));
}

/* Inline basics strip — Cohort flavor (Name · Type · Geography · Tier) */
function CohortBasics({
  editing = null
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "composer-basics"
  }, /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Name"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, "North Delhi \xB7 A\u2011class")), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Type"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-pill",
    style: {
      background: 'var(--ember-50)',
      color: 'var(--ember-700)',
      borderColor: 'var(--ember-100)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 11
  }), "Rule\u2011based"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 13,
    className: "chevron"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Geography"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-pill"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "layers",
    size: 11
  }), "North Delhi"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 13,
    className: "chevron"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Tier"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-pill",
    style: {
      background: 'var(--ember-50)',
      color: 'var(--ember-700)',
      borderColor: 'var(--ember-100)'
    }
  }, "A\u2011class"))));
}

/* ──────────────── COHORT · CREATE ──────────────── */
function ComposerCohortCreate() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(ComposerTop, {
    crumbCurrent: "New cohort",
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    },
    draftSaved: "Draft saved \xB7 4 sec ago by Phani"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ComposerTitle, {
    title: "Add a cohort",
    subtitle: "Group buyers by geography, tier, or activity. Pricelists and catalogs target a cohort \u2014 never an individual list of buyers.",
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 13
    }), "Import from CSV"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "users",
      size: 13
    }), "Copy another cohort"))
  }), /*#__PURE__*/React.createElement(CohortBasics, null), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(CohortFilterRail, {
    areas: ['North Delhi'],
    tiers: ['A‑class'],
    recent: "30"
  }), /*#__PURE__*/React.createElement(BuyerTable, {
    mode: "create"
  }), /*#__PURE__*/React.createElement(CohortSummary, {
    mode: "create"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Draft saved \xB7 auto\u2011resumes if you close"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save & close"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    stroke: 1.75
  }), "Save cohort"))));
}

/* ──────────────── COHORT · EDIT ──────────────── */
function ComposerCohortEdit() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(ComposerTop, {
    crumbCurrent: "North Delhi \xB7 A\u2011class",
    modeChip: {
      tone: 'live',
      label: 'Live · 3 pricelists · 2 catalogs'
    },
    draftSaved: "2 unsaved changes"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ComposerTitle, {
    title: "Edit cohort",
    subtitle: /*#__PURE__*/React.createElement("span", null, "You\u2019re editing a live cohort.", ' ', /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, "3 pricelists"), " and", ' ', /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, "2 catalogs"), " target it \u2014 their reach updates on save. Added rows show first; removals stay visible until commit."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "fileText",
      size: 13
    }), "Activity log"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "archive",
      size: 13
    }), "Archive cohort"))
  }), /*#__PURE__*/React.createElement(CohortBasics, null), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(CohortFilterRail, {
    areas: ['North Delhi'],
    tiers: ['A‑class'],
    recent: "30"
  }), /*#__PURE__*/React.createElement(BuyerTable, {
    mode: "edit",
    addedIds: ['B‑2024‑0122', 'B‑2024‑0138'],
    removedIds: ['B‑2024‑0177']
  }), /*#__PURE__*/React.createElement(CohortSummary, {
    mode: "edit"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta",
    style: {
      color: 'var(--ember-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: 'var(--ember-400)'
    }
  }), "2 unsaved changes \xB7 last edit 14 sec ago by Phani"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Revert changes"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save as draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Save & apply", /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 14
  })))));
}

/* ─────────────────────────────────────────────────────────────
   CATALOG
   ───────────────────────────────────────────────────────────── */

function CatalogFilterRail({
  brands = [],
  cats = [],
  availability = 'in'
}) {
  const allBrands = [{
    name: 'Vinikus Estates',
    count: 82
  }, {
    name: 'Casa del Sol',
    count: 47
  }, {
    name: 'Marwadi Spice Co.',
    count: 128
  }, {
    name: 'Asha Tea Garden',
    count: 31
  }, {
    name: 'Konkan Cellars',
    count: 64
  }];
  const allCats = [{
    name: 'Red wine',
    count: 42
  }, {
    name: 'White wine',
    count: 28
  }, {
    name: 'Sparkling',
    count: 12
  }, {
    name: 'Spirits · Local',
    count: 18
  }];
  const availHint = {
    in: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "Hiding 18 out\u2011of\u2011stock SKUs."), " Buyers see only what you can ship today."),
    low: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "Showing in\u2011stock + 6 low\u2011stock SKUs."), " Low stock flagged in the buyer app."),
    all: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "Including 18 out\u2011of\u2011stock SKUs."), " Buyers can place back\u2011orders; you confirm dispatch later.")
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "filter-rail"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Brands"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, allBrands.map(b => /*#__PURE__*/React.createElement("label", {
    key: b.name,
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: brands.includes(b.name)
  }), " ", b.name), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, b.count))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Category"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, allCats.map(c => /*#__PURE__*/React.createElement("label", {
    key: c.name,
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: cats.includes(c.name)
  }), " ", c.name), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, c.count))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Availability"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, [{
    k: 'in',
    label: 'In stock only'
  }, {
    k: 'low',
    label: 'Include low stock'
  }, {
    k: 'all',
    label: 'Show everything · allow back‑order'
  }].map(opt => /*#__PURE__*/React.createElement("div", {
    className: "strat-option",
    key: opt.k
  }, /*#__PURE__*/React.createElement("label", {
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "cat-avail",
    defaultChecked: availability === opt.k
  }), " ", opt.label)))), /*#__PURE__*/React.createElement("div", {
    className: "strat-hint"
  }, availHint[availability]))));
}

/* Product table — same chrome. Pricing is intentionally absent past
   "Base" — the catalog only controls visibility; the buyer's pricelist
   provides the price they actually see. */
function ProductTable({
  mode = 'create',
  addedSkus = [],
  removedSkus = [],
  searchTerm = ''
}) {
  const stockPill = (state, n) => {
    const base = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 9px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      border: '1px solid'
    };
    if (state === 'in') return {
      ...base,
      background: 'var(--success-50)',
      color: 'var(--success-700)',
      borderColor: '#C8DDC9'
    };
    if (state === 'low') return {
      ...base,
      background: 'var(--warning-50)',
      color: 'var(--warning-700)',
      borderColor: '#F3E2BD'
    };
    return {
      ...base,
      background: 'var(--cream-100)',
      color: 'var(--cream-700)',
      borderColor: 'var(--cream-300)'
    };
  };
  const dotColor = state => state === 'in' ? 'var(--success-500)' : state === 'low' ? 'var(--warning-500)' : 'var(--cream-500)';
  return /*#__PURE__*/React.createElement("div", {
    className: "comp-table-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "comp-table-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, mode === 'edit' ? `${PRODUCTS.length} products · ${addedSkus.length} added · ${removedSkus.length} removed` : `${PRODUCTS.length} products match · 14 hidden by filters`), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, mode === 'edit' ? /*#__PURE__*/React.createElement(React.Fragment, null, "Modified rows flagged. Buyers see updates within a minute of save.") : /*#__PURE__*/React.createElement(React.Fragment, null, "Untick to exclude. Prices come from each buyer\u2019s pricelist; the catalog controls visibility only."))), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "comp-table-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 13,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search SKU or product name",
    defaultValue: searchTerm
  }), /*#__PURE__*/React.createElement("kbd", null, "\u2318F")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkle",
    size: 13
  }), "Mark as new")), /*#__PURE__*/React.createElement("table", {
    className: "comp-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 28
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: true,
    style: {
      accentColor: 'var(--teal-500)'
    }
  })), /*#__PURE__*/React.createElement("th", null, "Product"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 152
    }
  }, "Brand"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 108
    }
  }, "Stock"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 88
    },
    className: "num"
  }, "Base"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 72
    }
  }, "Tag"), mode === 'edit' && /*#__PURE__*/React.createElement("th", {
    style: {
      width: 92
    }
  }, "\u0394"))), /*#__PURE__*/React.createElement("tbody", null, PRODUCTS.map(p => {
    const added = addedSkus.includes(p.sku);
    const removed = removedSkus.includes(p.sku);
    const changed = added || removed;
    return /*#__PURE__*/React.createElement("tr", {
      key: p.sku,
      className: changed ? 'is-changed' : ''
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      defaultChecked: !removed,
      style: {
        accentColor: 'var(--teal-500)'
      }
    })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: `b-av b-av--${p.hue}`,
      style: {
        width: 28,
        height: 28,
        borderRadius: 6,
        fontSize: 10
      }
    }, p.av), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13.5,
        color: removed ? 'var(--cream-700)' : 'var(--cream-900)',
        fontWeight: 500,
        textDecoration: removed ? 'line-through' : 'none'
      }
    }, p.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--cream-700)',
        marginTop: 1
      }
    }, p.sku)))), /*#__PURE__*/React.createElement("td", {
      style: {
        fontSize: 12.5,
        color: 'var(--cream-800)'
      }
    }, p.brand), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: stockPill(p.state, p.stock)
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dotColor(p.state)
      }
    }), p.state === 'out' ? 'Out' : p.stock)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, _inr(p.base)), /*#__PURE__*/React.createElement("td", null, p.tag && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        background: 'var(--ember-50)',
        color: 'var(--ember-700)',
        border: '1px solid var(--ember-100)'
      }
    }, p.tag)), mode === 'edit' && /*#__PURE__*/React.createElement("td", null, added && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 999,
        background: 'var(--success-50)',
        color: 'var(--success-700)',
        border: '1px solid #C8DDC9',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em'
      }
    }, "ADDED"), removed && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 999,
        background: 'var(--danger-50)',
        color: 'var(--danger-700)',
        border: '1px solid #EAC8C0',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em'
      }
    }, "REMOVED")));
  }))));
}
function CatalogSummary({
  mode = 'create'
}) {
  if (mode === 'edit') {
    return /*#__PURE__*/React.createElement("div", {
      className: "summary-card"
    }, /*#__PURE__*/React.createElement("h4", null, "Diff \xB7 what will change"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "name"
    }, "Summer \u201926 \xB7 New Arrivals"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--cream-700)',
        marginTop: 4
      }
    }, "Live to 12 buyers \xB7 expires 31 Aug")), /*#__PURE__*/React.createElement("div", {
      className: "summary-divider"
    }), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "Products in catalog"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "was"
    }, "45"), /*#__PURE__*/React.createElement(Icon, {
      name: "arrowRight",
      size: 12,
      color: "var(--cream-600)"
    }), /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "47"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--good"
    }, "+2 net"))), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "Marked \u201Cnew\u201D"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "was"
    }, "8"), /*#__PURE__*/React.createElement(Icon, {
      name: "arrowRight",
      size: 12,
      color: "var(--cream-600)"
    }), /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "12"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--good"
    }, "+4"))), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "Out of stock visible"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "was"
    }, "2"), /*#__PURE__*/React.createElement(Icon, {
      name: "arrowRight",
      size: 12,
      color: "var(--cream-600)"
    }), /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "0"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--good"
    }, "\u22122"))), /*#__PURE__*/React.createElement("div", {
      className: "summary-divider"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--teal-50)',
        border: '1px solid var(--teal-100)',
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 12,
        color: 'var(--teal-700)',
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "info",
      size: 14,
      stroke: 1.6,
      color: "var(--teal-500)"
    }), /*#__PURE__*/React.createElement("span", null, "Buyers see updates within a minute. Carts in progress keep their current view until checkout.")));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "summary-card"
  }, /*#__PURE__*/React.createElement("h4", null, "Catalog summary"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, "Summer \u201926 \xB7 New Arrivals"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)',
      marginTop: 4
    }
  }, "Publishes to ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "North Delhi \xB7 A\u2011class"), " (12 buyers)")), /*#__PURE__*/React.createElement("div", {
    className: "summary-divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Products"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "47")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Brands"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "4")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "In stock"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "38")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Marked \u201Cnew\u201D"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "12")), /*#__PURE__*/React.createElement("div", {
    className: "summary-divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Valid from"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      fontFamily: 'var(--font-body)'
    }
  }, "1 Jun")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Valid until"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      fontFamily: 'var(--font-body)'
    }
  }, "31 Aug")), /*#__PURE__*/React.createElement("div", {
    className: "summary-divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--teal-50)',
      border: '1px solid var(--teal-100)',
      borderRadius: 10,
      padding: '10px 12px',
      fontSize: 12,
      color: 'var(--teal-700)',
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    stroke: 1.75,
    color: "var(--teal-500)"
  }), /*#__PURE__*/React.createElement("span", null, "Ready to publish. Buyers see it within a minute.")));
}

/* Inline basics strip — Catalog flavor (Name · Cohort · Validity · Theme) */
function CatalogBasics() {
  return /*#__PURE__*/React.createElement("div", {
    className: "composer-basics"
  }, /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Name"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, "Summer \u201926 \xB7 New Arrivals")), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Cohort"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-pill"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 11
  }), "North Delhi \xB7 A\u2011class"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 13,
    className: "chevron"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Validity"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)'
    }
  }, "1 Jun \u2192 31 Aug 2026"))), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Theme"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-pill",
    style: {
      background: 'var(--ember-50)',
      color: 'var(--ember-700)',
      borderColor: 'var(--ember-100)'
    }
  }, "Seasonal launch"))));
}

/* ──────────────── CATALOG · CREATE ──────────────── */
function ComposerCatalogCreate() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(ComposerTop, {
    crumbCurrent: "New catalog",
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    },
    draftSaved: "Draft saved \xB7 8 sec ago by Phani"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ComposerTitle, {
    title: "Add a catalog",
    subtitle: "Curate which products a cohort sees. Prices come from their pricelist \u2014 the catalog only controls visibility, validity, and what\u2019s marked new.",
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 13
    }), "Import from CSV"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkle",
      size: 13
    }), "Copy from another catalog"))
  }), /*#__PURE__*/React.createElement(CatalogBasics, null), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(CatalogFilterRail, {
    brands: ['Vinikus Estates', 'Casa del Sol', 'Konkan Cellars'],
    cats: ['Red wine', 'White wine'],
    availability: "in"
  }), /*#__PURE__*/React.createElement(ProductTable, {
    mode: "create"
  }), /*#__PURE__*/React.createElement(CatalogSummary, {
    mode: "create"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Draft saved \xB7 auto\u2011resumes if you close"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save & close"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    stroke: 1.75
  }), "Publish catalog"))));
}

/* ──────────────── CATALOG · EDIT ──────────────── */
function ComposerCatalogEdit() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(ComposerTop, {
    crumbCurrent: "Summer \u201926 \xB7 New Arrivals",
    modeChip: {
      tone: 'live',
      label: 'Live · 12 buyers'
    },
    draftSaved: "4 unsaved changes"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ComposerTitle, {
    title: "Edit catalog",
    subtitle: /*#__PURE__*/React.createElement("span", null, "This catalog is ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, "live"), " to 12 buyers. Changes propagate within a minute of save. Carts in progress keep their current view until checkout."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "fileText",
      size: 13
    }), "Activity log"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "archive",
      size: 13
    }), "Archive catalog"))
  }), /*#__PURE__*/React.createElement(CatalogBasics, null), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(CatalogFilterRail, {
    brands: ['Vinikus Estates', 'Casa del Sol', 'Konkan Cellars'],
    cats: ['Red wine', 'White wine'],
    availability: "low"
  }), /*#__PURE__*/React.createElement(ProductTable, {
    mode: "edit",
    addedSkus: ['SKU‑2026‑00501', 'SKU‑2026‑00481'],
    removedSkus: ['SKU‑2026‑00483']
  }), /*#__PURE__*/React.createElement(CatalogSummary, {
    mode: "edit"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta",
    style: {
      color: 'var(--ember-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: 'var(--ember-400)'
    }
  }), "4 unsaved changes \xB7 last edit 8 sec ago by Phani"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Revert changes"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save as draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Save & publish", /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 14
  })))));
}
Object.assign(window, {
  ComposerCohortCreate,
  ComposerCohortEdit,
  ComposerCatalogCreate,
  ComposerCatalogEdit
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/composers-extra.jsx", error: String((e && e.message) || e) }); }

// dialogs/composers.jsx
try { (() => {
// dialogs/composers.jsx
//
// Composer system — refactored per Phani's feedback:
//   · Drop the 3-step flow. The summary card on the right already shows what a
//     "review" step would. The publish click opens a Tier-1 modal only when
//     there's a risk (live orders, big margin drop).
//   · Drop the inline "step 1" pane. Basics live in a horizontal strip at the
//     top of the body — always editable, never gating.
//   · Single ComposerFrame holds the chrome; Create/Edit are mode flavors.
//
// Exports (window):
//   ComposerPricelistEmpty       — fresh, basics partially filled
//   ComposerPricelistCreate      — mid-build, summary populated
//   ComposerPricelistEdit        — existing live pricelist, diff view
//   ComposerRationaleCard        — small explainer artboard
//   InlineTeamRows               — unchanged, escape-hatch demo

/* ──────────────── DATA: shared rows used in both Create and Edit ────── */
const PRICE_ROWS = [{
  sku: 'SKU‑2026‑00471',
  name: 'Vinikus Shiraz Reserve · 750ml',
  mrp: 1850,
  base: 1280,
  np: 1180,
  prevNp: 1240,
  av: 'VE',
  hue: 'teal'
}, {
  sku: 'SKU‑2026‑00472',
  name: 'Vinikus Sauvignon Blanc · 750ml',
  mrp: 1450,
  base: 980,
  np: 920,
  prevNp: 940,
  av: 'VE',
  hue: 'teal'
}, {
  sku: 'SKU‑2026‑00473',
  name: 'Vinikus Cabernet Estate · 750ml',
  mrp: 2200,
  base: 1540,
  np: 1480,
  prevNp: 1480,
  av: 'VE',
  hue: 'teal'
}, {
  sku: 'SKU‑2026‑00474',
  name: 'Vinikus Rosé Garden · 750ml',
  mrp: 1200,
  base: 860,
  np: 820,
  prevNp: 820,
  av: 'VE',
  hue: 'teal'
}, {
  sku: 'SKU‑2026‑00481',
  name: 'Casa del Sol Tempranillo · 750ml',
  mrp: 2400,
  base: 1680,
  np: 1620,
  prevNp: 1620,
  av: 'CS',
  hue: 'ember'
}, {
  sku: 'SKU‑2026‑00482',
  name: 'Casa del Sol Albariño · 750ml',
  mrp: 1950,
  base: 1380,
  np: 1340,
  prevNp: 1380,
  av: 'CS',
  hue: 'ember'
}, {
  sku: 'SKU‑2026‑00483',
  name: 'Casa del Sol Reserva Roble · 750ml',
  mrp: 3200,
  base: 2240,
  np: 2120,
  prevNp: 2120,
  av: 'CS',
  hue: 'ember'
}];
const inr = n => '₹' + n.toLocaleString('en-IN');

/* ──────────────── SHARED CHROME ──────────────── */

function ComposerTop({
  crumbCurrent,
  modeChip,
  draftSaved
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "composer-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crumb"
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--cream-700)'
    }
  }, "Pricelists"), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "current"
  }, crumbCurrent)), modeChip && /*#__PURE__*/React.createElement("span", {
    className: `mode-chip mode-chip--${modeChip.tone}`
  }, modeChip.label), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), draftSaved && /*#__PURE__*/React.createElement("span", {
    className: "status-chip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), draftSaved), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 13
  }), "Close"));
}
function ComposerTitle({
  title,
  subtitle,
  rightActions
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "composer-title-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, title), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, subtitle)), rightActions);
}
function BasicsStrip({
  name,
  cohort,
  validity,
  tier,
  editing
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "composer-basics"
  }, /*#__PURE__*/React.createElement("div", {
    className: 'basics-field' + (editing === 'name' ? ' basics-field--editing' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Name"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, name.input ? /*#__PURE__*/React.createElement("input", {
    defaultValue: name.value,
    placeholder: name.placeholder
  }) : /*#__PURE__*/React.createElement("span", {
    className: name.placeholder ? 'placeholder' : ''
  }, name.value || name.placeholder))), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Cohort"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, cohort.value ? /*#__PURE__*/React.createElement("span", {
    className: "inline-pill"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 11
  }), cohort.value) : /*#__PURE__*/React.createElement("span", {
    className: "placeholder"
  }, "Pick a cohort"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 13,
    className: "chevron"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Validity"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, validity ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)'
    }
  }, validity) : /*#__PURE__*/React.createElement("span", {
    className: "placeholder"
  }, "Set date range"))), /*#__PURE__*/React.createElement("div", {
    className: "basics-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Tier"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, tier ? /*#__PURE__*/React.createElement("span", {
    className: "inline-pill",
    style: {
      background: 'var(--ember-50)',
      color: 'var(--ember-700)',
      borderColor: 'var(--ember-100)'
    }
  }, tier) : /*#__PURE__*/React.createElement("span", {
    className: "placeholder"
  }, "Optional"))));
}

/* Left filter rail — same for all stages.
   strategy: 'each' | 'margin' | 'flat'
   marginValue: number   (e.g. 15 means "15% off MRP")
   flatValue:   number   (e.g. 150 means "₹150 off base")
   The chosen strategy's input lights up; the other two are visible but disabled
   so the location of the central value is obvious before the user picks. */
function FilterRail({
  checkedBrands = [],
  checkedCats = [],
  strategy = 'each',
  marginValue = 15,
  flatValue = 150,
  ratePerm = 'enabled' // for the radio name uniqueness
}) {
  const brands = [{
    name: 'Vinikus Estates',
    count: 82
  }, {
    name: 'Casa del Sol',
    count: 47
  }, {
    name: 'Marwadi Spice Co.',
    count: 128
  }, {
    name: 'Asha Tea Garden',
    count: 31
  }, {
    name: 'Konkan Cellars',
    count: 64
  }];
  const cats = [{
    name: 'Red wine',
    count: 42
  }, {
    name: 'White wine',
    count: 28
  }, {
    name: 'Sparkling',
    count: 12
  }];
  const hintFor = {
    each: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "Edit each price inline."), " No global rule; every row is independent."),
    margin: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "\u2212", marginValue, "% from MRP"), " applies to every selected product. Click any New price to override that row."),
    flat: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("strong", null, "\u2212\u20B9", flatValue, " off base"), " applies to every selected product. Click any New price to override that row.")
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "filter-rail"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Brands"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, brands.map(b => /*#__PURE__*/React.createElement("label", {
    key: b.name,
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: checkedBrands.includes(b.name)
  }), " ", b.name), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, b.count))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Category"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, cats.map(c => /*#__PURE__*/React.createElement("label", {
    key: c.name,
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: checkedCats.includes(c.name)
  }), " ", c.name), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, c.count))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "Pricing strategy"), /*#__PURE__*/React.createElement("div", {
    className: "filter-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "strat-option"
  }, /*#__PURE__*/React.createElement("label", {
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "strat",
    defaultChecked: strategy === 'each'
  }), " Edit each price"))), /*#__PURE__*/React.createElement("div", {
    className: "strat-option"
  }, /*#__PURE__*/React.createElement("label", {
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "strat",
    defaultChecked: strategy === 'margin'
  }), " % margin from MRP")), /*#__PURE__*/React.createElement("div", {
    className: 'strategy-input ' + (strategy === 'margin' ? 'strategy-input--active' : 'strategy-input--disabled')
  }, /*#__PURE__*/React.createElement("span", {
    className: "unit"
  }, "\u2212"), /*#__PURE__*/React.createElement("input", {
    defaultValue: marginValue,
    disabled: strategy !== 'margin'
  }), /*#__PURE__*/React.createElement("span", {
    className: "unit"
  }, "%"))), /*#__PURE__*/React.createElement("div", {
    className: "strat-option"
  }, /*#__PURE__*/React.createElement("label", {
    className: "filter-check"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "strat",
    defaultChecked: strategy === 'flat'
  }), " Flat \u20B9 off base")), /*#__PURE__*/React.createElement("div", {
    className: 'strategy-input ' + (strategy === 'flat' ? 'strategy-input--active' : 'strategy-input--disabled')
  }, /*#__PURE__*/React.createElement("span", {
    className: "unit"
  }, "\u2212\u20B9"), /*#__PURE__*/React.createElement("input", {
    defaultValue: flatValue,
    disabled: strategy !== 'flat'
  }))), /*#__PURE__*/React.createElement("div", {
    className: "strat-hint"
  }, hintFor[strategy]))));
}

/* Price table — variants:
   mode:    'create' | 'edit'
   strategy:'each' | 'margin' | 'flat'
   marginValue / flatValue — used to compute the New price when strategy != 'each'.
   Per-row overrides (overrideSkus) skip the global computation. */
function PriceTable({
  mode = 'create',
  strategy = 'each',
  marginValue = 15,
  flatValue = 150,
  changedSkus = [],
  overrideSkus = [],
  searchTerm = ''
}) {
  const computeNp = r => {
    if (overrideSkus.includes(r.sku)) return r.np; // user-set override
    if (strategy === 'margin') return Math.round(r.mrp * (1 - marginValue / 100));
    if (strategy === 'flat') return r.base - flatValue;
    return r.np;
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "comp-table-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "comp-table-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, mode === 'edit' ? '129 products · 3 modified' : strategy === 'each' ? '129 products match · 14 hidden by filters' : `129 products · global rule applied · ${overrideSkus.length} row override${overrideSkus.length === 1 ? '' : 's'}`), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, mode === 'edit' ? /*#__PURE__*/React.createElement(React.Fragment, null, "Inline edits flag the row. ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "Show only changed"), " to focus.") : strategy === 'each' ? /*#__PURE__*/React.createElement(React.Fragment, null, "Edit prices inline. Hold \u2318\u2011drag to apply a value down a column.") : /*#__PURE__*/React.createElement(React.Fragment, null, "Change the global value in the filter rail. Click any row to override that one."))), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "comp-table-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 13,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search SKU or product name",
    defaultValue: searchTerm
  }), /*#__PURE__*/React.createElement("kbd", null, "\u2318F")), mode === 'edit' && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 13
  }), "Show only changed"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 13
  }), "Bulk adjust")), strategy !== 'each' && mode === 'create' && /*#__PURE__*/React.createElement("div", {
    className: "bulk-banner"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 15,
    color: "var(--ember-500)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("strong", null, strategy === 'margin' ? `Applying −${marginValue}% from MRP` : `Applying −₹${flatValue} off base`, ' ', "to all 129 selected products."), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, overrideSkus.length === 0 ? /*#__PURE__*/React.createElement(React.Fragment, null, "No row overrides yet. Click any New price to override that row.") : /*#__PURE__*/React.createElement(React.Fragment, null, overrideSkus.length, " row override", overrideSkus.length === 1 ? '' : 's', " preserved \u2014 Reset will discard them."))), /*#__PURE__*/React.createElement("button", {
    className: "reset"
  }, "Reset overrides")), /*#__PURE__*/React.createElement("table", {
    className: "comp-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 28
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: true,
    style: {
      accentColor: 'var(--teal-500)'
    }
  })), /*#__PURE__*/React.createElement("th", null, "Product"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 84
    },
    className: "num"
  }, "MRP"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 92
    },
    className: "num"
  }, "Base"), mode === 'edit' && /*#__PURE__*/React.createElement("th", {
    style: {
      width: 92
    },
    className: "num"
  }, "Was"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 108
    },
    className: "num"
  }, "New price"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 70
    },
    className: "num"
  }, "\u0394"))), /*#__PURE__*/React.createElement("tbody", null, PRICE_ROWS.map((r, i) => {
    const changed = mode === 'edit' && changedSkus.includes(r.sku);
    const overridden = overrideSkus.includes(r.sku);
    const np = computeNp(r);
    const delta = (np - r.base) / r.base * 100;
    return /*#__PURE__*/React.createElement("tr", {
      key: r.sku,
      className: changed ? 'is-changed' : ''
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      defaultChecked: true,
      style: {
        accentColor: 'var(--teal-500)'
      }
    })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: `b-av b-av--${r.hue}`,
      style: {
        width: 28,
        height: 28,
        borderRadius: 6,
        fontSize: 10
      }
    }, r.av), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13.5,
        color: 'var(--cream-900)',
        fontWeight: 500
      }
    }, r.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--cream-700)',
        marginTop: 1
      }
    }, r.sku)))), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, inr(r.mrp)), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, inr(r.base)), mode === 'edit' && /*#__PURE__*/React.createElement("td", {
      className: "num",
      style: {
        color: 'var(--cream-700)',
        textDecoration: changed ? 'line-through' : 'none'
      }
    }, changed ? inr(r.prevNp) : '—'), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, /*#__PURE__*/React.createElement("span", {
      className: 'price-edit ' + (changed || overridden || mode === 'create' && strategy === 'each' && i === 0 ? 'price-edit-focus' : '')
    }, inr(np)), overridden && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        marginLeft: 6,
        fontSize: 9,
        padding: '1px 5px',
        borderRadius: 999,
        background: 'var(--ember-50)',
        color: 'var(--ember-700)',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        verticalAlign: 'middle'
      }
    }, "OVR")), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, /*#__PURE__*/React.createElement("span", {
      className: "delta-down"
    }, delta.toFixed(1), "%")));
  }))));
}

/* Empty table state for the very-first composer view */
function EmptyTable() {
  return /*#__PURE__*/React.createElement("div", {
    className: "comp-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "illus"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "layers",
    size: 36,
    stroke: 1.25,
    color: "var(--cream-600)"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "No products selected yet"), /*#__PURE__*/React.createElement("p", null, "Pick a brand or category on the left and the SKUs that match will appear here. You can also ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "import a CSV"), " or copy another pricelist as a starting point.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 13
  }), "Import CSV"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkle",
    size: 13
  }), "Copy another pricelist")));
}

/* Summary card — variants: 'empty' | 'create' | 'edit' */
function SummaryCard({
  mode = 'create'
}) {
  if (mode === 'empty') {
    return /*#__PURE__*/React.createElement("div", {
      className: "summary-card"
    }, /*#__PURE__*/React.createElement("h4", null, "Pricelist summary"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "name",
      style: {
        color: 'var(--cream-600)'
      }
    }, "Untitled pricelist"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--cream-700)',
        marginTop: 4
      }
    }, "Set a cohort and pick filters \u2014 the impact appears here in real time.")), /*#__PURE__*/React.createElement("div", {
      className: "summary-divider"
    }), /*#__PURE__*/React.createElement("div", {
      className: "summary-stat"
    }, /*#__PURE__*/React.createElement("span", {
      className: "l"
    }, "Products"), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, "0")), /*#__PURE__*/React.createElement("div", {
      className: "summary-stat"
    }, /*#__PURE__*/React.createElement("span", {
      className: "l"
    }, "Brands"), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, "0")), /*#__PURE__*/React.createElement("div", {
      className: "summary-stat"
    }, /*#__PURE__*/React.createElement("span", {
      className: "l"
    }, "Avg discount vs base"), /*#__PURE__*/React.createElement("span", {
      className: "v",
      style: {
        color: 'var(--cream-600)'
      }
    }, "\u2014")), /*#__PURE__*/React.createElement("div", {
      className: "summary-stat"
    }, /*#__PURE__*/React.createElement("span", {
      className: "l"
    }, "Avg margin retained"), /*#__PURE__*/React.createElement("span", {
      className: "v",
      style: {
        color: 'var(--cream-600)'
      }
    }, "\u2014")), /*#__PURE__*/React.createElement("div", {
      className: "summary-divider"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--cream-50)',
        border: '1px dashed var(--cream-400)',
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 12,
        color: 'var(--cream-700)',
        lineHeight: 1.5
      }
    }, "Tip \xB7 the summary replaces a separate \u201Creview\u201D step. Once it looks right, publish in one click."));
  }
  if (mode === 'edit') {
    return /*#__PURE__*/React.createElement("div", {
      className: "summary-card"
    }, /*#__PURE__*/React.createElement("h4", null, "Diff \xB7 what will change"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "name"
    }, "North Delhi A\u2011class \xB7 Summer \u201926"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--cream-700)',
        marginTop: 4
      }
    }, "Applies to 12 buyers \xB7 live")), /*#__PURE__*/React.createElement("div", {
      className: "summary-divider"
    }), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "Modified rows"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "3"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--neutral"
    }, "of 129"))), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "Avg discount vs base"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "was"
    }, "\u22124.2%"), /*#__PURE__*/React.createElement(Icon, {
      name: "arrowRight",
      size: 12,
      color: "var(--cream-600)"
    }), /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "\u22124.8%"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--bad"
    }, "+0.6 pts"))), /*#__PURE__*/React.createElement("div", {
      className: "diff-stat"
    }, /*#__PURE__*/React.createElement("div", {
      className: "l"
    }, "Avg margin retained"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "was"
    }, "23.9%"), /*#__PURE__*/React.createElement(Icon, {
      name: "arrowRight",
      size: 12,
      color: "var(--cream-600)"
    }), /*#__PURE__*/React.createElement("span", {
      className: "now"
    }, "23.4%"), /*#__PURE__*/React.createElement("span", {
      className: "delta delta--bad"
    }, "\u22120.5 pts"))), /*#__PURE__*/React.createElement("div", {
      className: "summary-divider"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--warning-50)',
        border: '1px solid #F3E2BD',
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 12,
        color: 'var(--warning-700)',
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "alertTriangle",
      size: 14,
      stroke: 1.6,
      color: "var(--warning-500)"
    }), /*#__PURE__*/React.createElement("span", null, "Saving will affect 12 live buyers. 4 are mid\u2011order \u2014 they keep their current prices. A confirm modal opens on Save.")));
  }

  // create / mid-build
  return /*#__PURE__*/React.createElement("div", {
    className: "summary-card"
  }, /*#__PURE__*/React.createElement("h4", null, "Pricelist summary"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, "North Delhi A\u2011class \xB7 Summer \u201926"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)',
      marginTop: 4
    }
  }, "Applies to 12 buyers in ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "North Delhi \xB7 A\u2011class"))), /*#__PURE__*/React.createElement("div", {
    className: "summary-divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Products"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "129")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Brands"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "2")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Avg discount vs base"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "\u22124.8%")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Avg margin retained"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "23.4%")), /*#__PURE__*/React.createElement("div", {
    className: "summary-divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Valid from"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      fontFamily: 'var(--font-body)'
    }
  }, "1 Jun")), /*#__PURE__*/React.createElement("div", {
    className: "summary-stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Valid until"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      fontFamily: 'var(--font-body)'
    }
  }, "31 Aug")), /*#__PURE__*/React.createElement("div", {
    className: "summary-divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--teal-50)',
      border: '1px solid var(--teal-100)',
      borderRadius: 10,
      padding: '10px 12px',
      fontSize: 12,
      color: 'var(--teal-700)',
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    stroke: 1.75,
    color: "var(--teal-500)"
  }), /*#__PURE__*/React.createElement("span", null, "Ready to publish. No live orders blocked.")));
}

/* ──────────────── STAGE 1 · CREATE · EMPTY ──────────────── */
function ComposerPricelistEmpty() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(ComposerTop, {
    crumbCurrent: "New pricelist",
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    },
    draftSaved: "Draft created \xB7 2 sec ago"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ComposerTitle, {
    title: "Add a pricelist",
    subtitle: "Name it, pick the cohort it applies to, then choose which SKUs and how to price them.",
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 13
    }), "Import from CSV"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkle",
      size: 13
    }), "Copy from another pricelist"))
  }), /*#__PURE__*/React.createElement(BasicsStrip, {
    name: {
      value: '',
      placeholder: 'e.g. North Delhi A‑class · Summer ’26',
      input: true
    },
    cohort: {
      value: ''
    },
    validity: null,
    tier: null,
    editing: "name"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(FilterRail, {
    strategy: "each"
  }), /*#__PURE__*/React.createElement(EmptyTable, null), /*#__PURE__*/React.createElement(SummaryCard, {
    mode: "empty"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Auto\u2011saves as you type"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-disabled",
    disabled: true
  }, "Publish pricelist"))));
}

/* ──────────────── STAGE 2 · CREATE · IN PROGRESS ──────────────── */
function ComposerPricelistCreate() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(ComposerTop, {
    crumbCurrent: "New pricelist",
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    },
    draftSaved: "Draft saved \xB7 6 sec ago by Phani"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ComposerTitle, {
    title: "Add a pricelist",
    subtitle: "Filter the SKUs, edit prices inline, publish when the summary looks right.",
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 13
    }), "Import from CSV"))
  }), /*#__PURE__*/React.createElement(BasicsStrip, {
    name: {
      value: 'North Delhi A‑class · Summer ’26'
    },
    cohort: {
      value: 'North Delhi · A‑class'
    },
    validity: "1 Jun \u2192 31 Aug 2026",
    tier: "A\u2011class"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(FilterRail, {
    checkedBrands: ['Vinikus Estates', 'Casa del Sol'],
    checkedCats: ['Red wine', 'White wine'],
    strategy: "margin",
    marginValue: 15
  }), /*#__PURE__*/React.createElement(PriceTable, {
    mode: "create",
    strategy: "margin",
    marginValue: 15,
    overrideSkus: ['SKU‑2026‑00473'],
    searchTerm: ""
  }), /*#__PURE__*/React.createElement(SummaryCard, {
    mode: "create"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Draft saved \xB7 auto\u2011resumes if you close"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save & close"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    stroke: 1.75
  }), "Publish pricelist"))));
}

/* ──────────────── STAGE 3 · EDIT · EXISTING LIVE PRICELIST ──────────────── */
function ComposerPricelistEdit() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(ComposerTop, {
    crumbCurrent: "North Delhi A\u2011class \xB7 Summer \u201926",
    modeChip: {
      tone: 'live',
      label: 'Live · 12 buyers'
    },
    draftSaved: "3 unsaved changes"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ComposerTitle, {
    title: "Edit pricelist",
    subtitle: /*#__PURE__*/React.createElement("span", null, "You\u2019re editing a live pricelist. Changes apply to ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, "new orders"), "; in\u2011flight orders keep their current prices. Modified rows are flagged."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "fileText",
      size: 13
    }), "Activity log"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "archive",
      size: 13
    }), "Archive pricelist"))
  }), /*#__PURE__*/React.createElement(BasicsStrip, {
    name: {
      value: 'North Delhi A‑class · Summer ’26'
    },
    cohort: {
      value: 'North Delhi · A‑class'
    },
    validity: "1 Jun \u2192 31 Aug 2026",
    tier: "A\u2011class"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(FilterRail, {
    checkedBrands: ['Vinikus Estates', 'Casa del Sol'],
    checkedCats: ['Red wine', 'White wine'],
    strategy: "each"
  }), /*#__PURE__*/React.createElement(PriceTable, {
    mode: "edit",
    strategy: "each",
    changedSkus: ['SKU‑2026‑00471', 'SKU‑2026‑00472', 'SKU‑2026‑00482'],
    searchTerm: "shiraz"
  }), /*#__PURE__*/React.createElement(SummaryCard, {
    mode: "edit"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta",
    style: {
      color: 'var(--ember-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: 'var(--ember-400)'
    }
  }), "3 unsaved changes \xB7 last edit 12 sec ago by Phani"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Revert changes"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save as draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Save & apply to live", /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 14
  })))));
}

/* ──────────────── RATIONALE CARD ──────────────── */
function ComposerRationaleCard() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer-rationale"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: 'var(--cream-700)',
      marginBottom: 8
    }
  }, "What changed in the composer"), /*#__PURE__*/React.createElement("h2", null, "One screen, two modes, no review step."), /*#__PURE__*/React.createElement("div", {
    className: "sub",
    style: {
      marginTop: 8
    }
  }, "Phani\u2019s pushback was right: a persistent summary card on the right makes a sequential \u201CReview\u201D step redundant. We also collapsed the \u201CBasics\u201D step into a horizontal strip at the top, and reused the chrome for Edit. The composer is now ", /*#__PURE__*/React.createElement("strong", null, "one screen"), ", and the only difference between", /*#__PURE__*/React.createElement("strong", null, " Create"), " and ", /*#__PURE__*/React.createElement("strong", null, "Edit"), " is the mode chip, the diff\u2011shaped summary, and the modified\u2011row indicators.")), /*#__PURE__*/React.createElement("div", {
    className: "cols"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("h4", null, "Dropped"), /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "The Continue \u2192 Review \u2192 Publish flow"), /*#__PURE__*/React.createElement("p", null, "The summary card is the review. Publishing risky changes opens a Tier\u20111 confirmation modal \u2014 that\u2019s where the pause belongs, not in a separate page step."), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "No stepper. The header is the title; basics live below it."), /*#__PURE__*/React.createElement("li", null, "One primary action: ", /*#__PURE__*/React.createElement("em", null, "Publish pricelist"), " (Create) or ", /*#__PURE__*/React.createElement("em", null, "Save & apply to live"), " (Edit)."), /*#__PURE__*/React.createElement("li", null, "Live\u2011pricelist edits with risk \u2192 modal confirm before commit."))), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("h4", null, "Reused"), /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Same composer for Create and Edit"), /*#__PURE__*/React.createElement("p", null, "Universal chrome (same as Detail pages v2): breadcrumb \xB7 mode chip \xB7 title \xB7 basics strip \xB7 3\u2011column body \xB7 foot. What changes is the mode."), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Create"), ": cream ", /*#__PURE__*/React.createElement("em", null, "Draft"), " chip \xB7 empty summary tip \xB7 \u201CPublish\u201D."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "Edit"), ": green ", /*#__PURE__*/React.createElement("em", null, "Live \xB7 12 buyers"), " chip \xB7 diff summary \xB7 \u201CSave & apply\u201D \xB7 row markers."), /*#__PURE__*/React.createElement("li", null, "Same pattern works for Catalog (rows = products) and Cohort (rows = buyers).")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      padding: '14px 18px',
      background: 'var(--teal-50)',
      border: '1px solid var(--teal-100)',
      borderRadius: 12,
      display: 'flex',
      gap: 12,
      fontSize: 13,
      color: 'var(--teal-700)',
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 16,
    color: "var(--teal-500)",
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--teal-900)'
    }
  }, "Naming."), ' ', "On the existing Detail pages (Detail Pages v2), the entity has tabs for", /*#__PURE__*/React.createElement("em", null, " Details \xB7 Performance \xB7 Activity"), ". Clicking ", /*#__PURE__*/React.createElement("strong", null, "Edit"), " from the Details tab opens this composer with the same identity. Closing the composer returns to the tab the user came from \u2014 never to the list."))));
}

/* ───────────────────────────────────────────────────────────
   INLINE TEAM ROWS — escape-hatch pattern.
   Now uses the full Customer Detail v2 chrome (breadcrumb,
   header w/ avatar + status + subtitle, 4-tile KPI strip,
   varied tabs) and a standard searchable/filterable/sortable
   table inside the Team tab. The Add Team Member action lives
   at the tab-toolbar level; inline-add row keeps Save / Cancel
   together at the right.
   ─────────────────────────────────────────────────────────── */
function InlineTeamRows() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dp-page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dp-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dp-crumb"
  }, /*#__PURE__*/React.createElement("span", null, "Customers"), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "current"
  }, "Bharat Stores")), /*#__PURE__*/React.createElement("div", {
    className: "dp-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dp-header-left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dp-avatar b-av--teal"
  }, "BS"), /*#__PURE__*/React.createElement("div", {
    className: "dp-title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dp-title-row"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "dp-title"
  }, "Bharat Stores"), /*#__PURE__*/React.createElement("span", {
    className: "dp-status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Active")), /*#__PURE__*/React.createElement("div", {
    className: "dp-subtitle"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill-tier"
  }, "Tier A"), /*#__PURE__*/React.createElement("span", null, "Karol Bagh, Delhi"), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "Buyer since Mar 2024 \xB7 2 yrs loyal"), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "Net 21 terms")))), /*#__PURE__*/React.createElement("div", {
    className: "dp-header-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "moreVertical",
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "fileText",
    size: 13
  }), "Activity log"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm"
  }, "Edit buyer"))), /*#__PURE__*/React.createElement("div", {
    className: "dp-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dp-tile"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Spend \xB7 MTD"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, "\u20B92.4 L"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, /*#__PURE__*/React.createElement("span", {
    className: "up"
  }, "\u2191 +18%"), " vs last month")), /*#__PURE__*/React.createElement("div", {
    className: "dp-tile"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Orders \xB7 MTD"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, "7"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "AOV \u20B934,200")), /*#__PURE__*/React.createElement("div", {
    className: "dp-tile"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Last order"), /*#__PURE__*/React.createElement("div", {
    className: "value",
    style: {
      fontSize: 22
    }
  }, "2 days ago"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Vinikus Shiraz \xD7 24")), /*#__PURE__*/React.createElement("div", {
    className: "dp-tile"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Credit used"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, "\u20B91.6 L"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "of \u20B92.5 L \xB7 64%"))), /*#__PURE__*/React.createElement("div", {
    className: "dp-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: "dp-tab"
  }, "Details"), /*#__PURE__*/React.createElement("button", {
    className: "dp-tab"
  }, "Performance"), /*#__PURE__*/React.createElement("button", {
    className: "dp-tab"
  }, "Orders ", /*#__PURE__*/React.createElement("span", {
    className: "badge"
  }, "7")), /*#__PURE__*/React.createElement("button", {
    className: "dp-tab is-active"
  }, "Team ", /*#__PURE__*/React.createElement("span", {
    className: "badge"
  }, "3")), /*#__PURE__*/React.createElement("button", {
    className: "dp-tab"
  }, "Activity")), /*#__PURE__*/React.createElement("div", {
    className: "dp-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dp-tab-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, "Team at Bharat Stores"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "People who can place orders on this buyer\u2019s behalf in the buyer app.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 13
  }), "Export"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 13,
    stroke: 2
  }), "Add team member"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "dp-toolbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 13,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search name, phone, email"
  })), /*#__PURE__*/React.createElement("button", {
    className: "filter-chip filter-chip--on"
  }, "Role", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, "2"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 11
  })), /*#__PURE__*/React.createElement("button", {
    className: "filter-chip"
  }, "Status", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 11
  })), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, "Sort", /*#__PURE__*/React.createElement("button", {
    className: "filter-chip"
  }, "Status \xB7 Active first", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 11
  })))), /*#__PURE__*/React.createElement("div", {
    className: "dp-table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "dp-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: '32%'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sortable"
  }, "Name ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 11
  }))), /*#__PURE__*/React.createElement("th", {
    style: {
      width: '20%'
    }
  }, "Phone"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: '24%'
    }
  }, "Email"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: '12%'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sortable is-sorted"
  }, "Role ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 11
  }))), /*#__PURE__*/React.createElement("th", {
    style: {
      width: '12%'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sortable is-sorted"
  }, "Status ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 11
  }))), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90
    }
  }))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", {
    className: "add-row"
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    placeholder: "Full name",
    defaultValue: "Vikram Bharat",
    autoFocus: true
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    placeholder: "+91 \u2026",
    defaultValue: "+91 98101 22011",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("input", {
    placeholder: "Optional",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("select", {
    defaultValue: "Buyer"
  }, /*#__PURE__*/React.createElement("option", null, "Admin"), /*#__PURE__*/React.createElement("option", null, "Buyer"), /*#__PURE__*/React.createElement("option", null, "Read\u2011only"))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "status-pill status-pill--invited"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Invite")), /*#__PURE__*/React.createElement("td", {
    className: "add-actions"
  }, /*#__PURE__*/React.createElement("span", {
    className: "row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm"
  }, "Save")))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "person"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--ember",
    style: {
      width: 28,
      height: 28,
      borderRadius: 6,
      fontSize: 10
    }
  }, "SB"), /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, "Suresh Bharat"))), /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, "+91 98101 22433"), /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, "suresh@bharatstores.in"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "role-pill role-pill--admin"
  }, "Admin")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "status-pill status-pill--active"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Active")), /*#__PURE__*/React.createElement("td", {
    className: "row-actions"
  }, /*#__PURE__*/React.createElement("button", null, /*#__PURE__*/React.createElement(Icon, {
    name: "moreVertical",
    size: 14
  })))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "person"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--cream",
    style: {
      width: 28,
      height: 28,
      borderRadius: 6,
      fontSize: 10
    }
  }, "AB"), /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, "Anita Bharat"))), /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, "+91 98101 22877"), /*#__PURE__*/React.createElement("td", {
    className: "mono",
    style: {
      color: 'var(--cream-600)'
    }
  }, "\u2014"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "role-pill"
  }, "Buyer")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "status-pill status-pill--active"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Active")), /*#__PURE__*/React.createElement("td", {
    className: "row-actions"
  }, /*#__PURE__*/React.createElement("button", null, /*#__PURE__*/React.createElement(Icon, {
    name: "moreVertical",
    size: 14
  })))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "person"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--teal",
    style: {
      width: 28,
      height: 28,
      borderRadius: 6,
      fontSize: 10
    }
  }, "RB"), /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, "Ravi Bharat"))), /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, "+91 98101 22904"), /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, "ravi@bharatstores.in"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "role-pill"
  }, "Buyer")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "status-pill status-pill--invited"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Invited")), /*#__PURE__*/React.createElement("td", {
    className: "row-actions"
  }, /*#__PURE__*/React.createElement("button", null, /*#__PURE__*/React.createElement(Icon, {
    name: "moreVertical",
    size: 14
  })))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px',
      background: 'var(--teal-50)',
      border: '1px solid var(--teal-100)',
      borderRadius: 12,
      display: 'flex',
      gap: 12,
      fontSize: 13,
      color: 'var(--teal-700)',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 16,
    color: "var(--teal-500)",
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--teal-900)'
    }
  }, "Why inline, not a slide\u2011over?"), ' ', "A buyer\u2011side team member is just ", /*#__PURE__*/React.createElement("em", null, "name \xB7 phone \xB7 email \xB7 role"), ". The user is already looking at the roster \u2014 opening a panel would obscure that context. Standard table chrome (search \xB7 role & status filters \xB7 sort) keeps the surface predictable, while the pinned add\u2011row makes \u201Cadd one more\u201D one click away. Same rule as the seller\u2011side", /*#__PURE__*/React.createElement("em", null, " Settings \u2192 Team"), " page."))))));
}
Object.assign(window, {
  ComposerPricelistEmpty,
  ComposerPricelistCreate,
  ComposerPricelistEdit,
  ComposerRationaleCard,
  InlineTeamRows,
  // shared chrome — reused by composers-extra.jsx (Cohort & Catalog)
  ComposerTop,
  ComposerTitle
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/composers.jsx", error: String((e && e.message) || e) }); }

// dialogs/design-canvas.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Exports (to window): DesignCanvas, DCSection, DCArtboard, DCPostIt.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>
//
// Artboards are static design frames, not scroll regions — never use
// height: 100% + overflow: auto/scroll on inner elements; size each artboard
// to fit its content (explicit pixel height, or let it grow).
/* END USAGE */

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = ['.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}', '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}', '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}', '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}', '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
  // isolation:isolate contains artboard content's z-indexes so a
  // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
  // the .dc-menu popover that drops into the top of the card.
  '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}', '.dc-card *{scrollbar-width:none}', '.dc-card *::-webkit-scrollbar{display:none}',
  // Per-artboard header: grip + label on the left, delete/expand on the
  // right. Single flex row; when the artboard's on-screen width is too
  // narrow for both the label yields (ellipsis, then hidden entirely below
  // ~4ch via the container query) and the buttons stay on the row.
  '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;', '  display:flex;align-items:center;container-type:inline-size}', '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}', '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s,opacity .12s}', '.dc-grip:hover{background:rgba(0,0,0,.08)}', '.dc-grip:active{cursor:grabbing}', '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;', '  display:flex;align-items:center;transition:background .12s;overflow:hidden}',
  // Below ~4ch of label room: hide the label entirely, and drop the grip to
  // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
  // until the card is moused.
  '@container (max-width: 110px){', '  .dc-labeltext{display:none}', '  .dc-grip{opacity:0}', '  [data-dc-slot]:hover .dc-grip{opacity:1}', '}', '.dc-labeltext:hover{background:rgba(0,0,0,.05)}', '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}', '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}', '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}', '[data-dc-slot]:hover .dc-btns,.dc-btns:has(.dc-menu){opacity:1}', '.dc-expand,.dc-kebab{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;', '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center;', '  font:inherit;transition:background .12s,color .12s}', '.dc-expand:hover,.dc-kebab:hover{background:rgba(0,0,0,.06);color:#2a251f}',
  // Slot hosting an open menu floats above later siblings (which otherwise
  // paint on top — same z-index:auto, later DOM order) so the popup isn't
  // clipped by the next card.
  '[data-dc-slot]:has(.dc-menu){z-index:10}', '.dc-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border-radius:8px;', '  box-shadow:0 8px 28px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);padding:4px;min-width:160px;z-index:10}', '.dc-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;', '  border-radius:5px;font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;', '  color:#29261b;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap}', '.dc-menu button:hover{background:rgba(0,0,0,.05)}', '.dc-menu hr{border:0;border-top:1px solid rgba(0,0,0,.08);margin:4px 2px}', '.dc-menu .dc-danger{color:#c96442}', '.dc-menu .dc-danger:hover{background:rgba(201,100,66,.1)}',
  // Chrome (titles / labels / buttons) counter-scales against the viewport
  // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
  // DCViewport on every transform update and inherits to all descendants —
  // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
  // it the same way.
  //
  // The header uses transform:scale (out-of-flow, so layout impact doesn't
  // matter) with its world-space width set to card-width / inv-zoom so that
  // after counter-scaling its on-screen width exactly matches the card's —
  // that's what lets the container query + text-overflow behave against the
  // card's visible edge at every zoom level.
  //
  // The section head uses CSS zoom instead of transform so its layout box
  // grows with the counter-scale, pushing the card row down — otherwise the
  // constant-screen-size title would overflow into the (shrinking) world-
  // space gap and overlap the artboard headers at low zoom.
  '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));', '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}', '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}'].join('\n');
  document.head.appendChild(s);
}
const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, c => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';
function DesignCanvas({
  children,
  minScale,
  maxScale,
  style
}) {
  const [state, setState] = React.useState({
    sections: {},
    focus: null
  });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);
  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE).then(r => r.ok ? r.json() : null).then(saved => {
      if (off || !saved || !saved.sections) return;
      skipNextWrite.current = true;
      setState(s => ({
        ...s,
        sections: saved.sections
      }));
    }).catch(() => {}).finally(() => {
      didRead.current = true;
      if (!off) setReady(true);
    });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({
        sections: state.sections
      })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Fragments are flattened; wrapping in other
  // elements still opts out of focus/reorder.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  dcFlatten(children).forEach(sec => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const abs = [];
    dcFlatten(sec.props.children).forEach(ab => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (aid) abs.push([aid, ab]);
    });
    // hidden is scoped to one source revision — when the agent regenerates
    // (artboard-ID set changes), prior deletes don't apply to new content.
    const srcKey = abs.map(([k]) => k).join('\x1f');
    const hidden = persisted.srcKey === srcKey ? persisted.hidden || [] : [];
    const srcIds = [];
    abs.forEach(([aid, ab]) => {
      if (hidden.includes(aid)) return;
      registry[`${sid}/${aid}`] = {
        sectionId: sid,
        artboard: ab
      };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter(k => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter(k => !kept.includes(k))]
    };
  });
  const api = React.useMemo(() => ({
    state,
    section: id => state.sections[id] || {},
    patchSection: (id, p) => setState(s => ({
      ...s,
      sections: {
        ...s.sections,
        [id]: {
          ...s.sections[id],
          ...(typeof p === 'function' ? p(s.sections[id] || {}) : p)
        }
      }
    })),
    setFocus: slotId => setState(s => ({
      ...s,
      focus: slotId
    }))
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = e => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);
  return /*#__PURE__*/React.createElement(DCCtx.Provider, {
    value: api
  }, /*#__PURE__*/React.createElement(DCViewport, {
    minScale: minScale,
    maxScale: maxScale,
    style: style
  }, ready && children), state.focus && registry[state.focus] && /*#__PURE__*/React.createElement(DCFocusOverlay, {
    entry: registry[state.focus],
    sectionMeta: sectionMeta,
    sectionOrder: sectionOrder
  }));
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({
  children,
  minScale = 0.1,
  maxScale = 8,
  style = {}
}) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({
    x: 0,
    y: 0,
    scale: 1
  });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);
  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const {
      x,
      y,
      scale
    } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({
        type: '__dc_zoom',
        scale
      }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    }, 200);
  }, [tfKey]);
  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = {
          x: s.x,
          y: s.y,
          scale: Math.min(maxScale, Math.max(minScale, s.scale))
        };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null,
        markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) {
          t.y -= drift;
          apply();
        }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = e => e.deltaMode !== 0 || e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40;
    const onWheel = e => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = e => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, gsBase * e.scale / tf.current.scale);
    };
    const onGestureEnd = e => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = e => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || e.button === 0 && onBg)) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        lx: e.clientX,
        ly: e.clientY
      };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = e => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({
          type: '__dc_present'
        }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({
      type: '__dc_present'
    }, '*');
    lastPostedScale.current = undefined;
    apply();
    vp.addEventListener('wheel', onWheel, {
      passive: false
    });
    vp.addEventListener('gesturestart', onGestureStart, {
      passive: false
    });
    vp.addEventListener('gesturechange', onGestureChange, {
      passive: false
    });
    vp.addEventListener('gestureend', onGestureEnd, {
      passive: false
    });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);
  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return /*#__PURE__*/React.createElement("div", {
    ref: vpRef,
    className: "design-canvas",
    style: {
      height: '100vh',
      width: '100vw',
      background: DC.bg,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      position: 'relative',
      fontFamily: DC.font,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: worldRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      transformOrigin: '0 0',
      willChange: 'transform',
      width: 'max-content',
      minWidth: '100%',
      minHeight: '100%',
      padding: '60px 0 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -6000,
      backgroundImage: gridSvg,
      backgroundSize: '120px 120px',
      pointerEvents: 'none',
      zIndex: -1
    }
  }), children));
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({
  id,
  title,
  subtitle,
  children,
  gap = 48
}) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter(c => c && c.type === DCArtboard);
  const rest = all.filter(c => !(c && c.type === DCArtboard));
  const sec = ctx && sid && ctx.section(sid) || {};
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map(a => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? sec.hidden || [] : [];
  const srcOrder = allIds.filter(k => !hidden.includes(k));
  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter(k => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter(k => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);
  const byId = Object.fromEntries(artboards.map(a => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return /*#__PURE__*/React.createElement("div", {
    "data-dc-section": sid,
    style: {
      marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-sectionhead",
    style: {
      paddingBottom: 36
    }
  }, /*#__PURE__*/React.createElement(DCEditable, {
    tag: "div",
    value: sec.title ?? title,
    onChange: v => ctx && sid && ctx.patchSection(sid, {
      title: v
    }),
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: DC.title,
      letterSpacing: -0.4,
      marginBottom: 6,
      display: 'inline-block'
    }
  }), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: DC.subtitle
    }
  }, subtitle))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      padding: '0 60px',
      alignItems: 'flex-start',
      width: 'max-content'
    }
  }, order.map(k => /*#__PURE__*/React.createElement(DCArtboardFrame, {
    key: k,
    sectionId: sid,
    artboard: byId[k],
    order: order,
    label: (sec.labels || {})[k] ?? byId[k].props.label,
    onRename: v => ctx && ctx.patchSection(sid, x => ({
      labels: {
        ...x.labels,
        [k]: v
      }
    })),
    onReorder: next => ctx && ctx.patchSection(sid, {
      order: next
    }),
    onDelete: () => ctx && ctx.patchSection(sid, x => ({
      hidden: [...(x.srcKey === srcKey ? x.hidden || [] : []), k],
      srcKey
    })),
    onFocus: () => ctx && ctx.setFocus(`${sid}/${k}`)
  }))), rest);
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try {
    await document.fonts.ready;
  } catch {}
  const toDataURL = url => fetch(url).then(r => r.blob()).then(b => new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(url);
    fr.readAsDataURL(b);
  })).catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [],
    pending = [],
    seen = new Set();
  const scrapeCss = href => {
    if (seen.has(href)) return;
    seen.add(href);
    pending.push(fetch(href).then(r => r.text()).then(css => {
      for (const m of css.match(/@font-face\s*{[^}]*}/g) || []) fontRules.push({
        css: m,
        base: href
      });
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) scrapeCss(new URL(m[1], href).href);
    }).catch(() => {}));
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({
        css: r.cssText,
        base
      });else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try {
          walk(r.styleSheet.cssRules, ibase);
        } catch {
          scrapeCss(ibase);
        }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try {
      walk(ss.cssRules, base);
    } catch {
      if (ss.href) scrapeCss(ss.href);
    }
  }
  while (pending.length) await pending.shift();
  const fontCss = (await Promise.all(fontRules.map(async rule => {
    let out = rule.css,
      m;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    while (m = re.exec(rule.css)) {
      if (m[2].indexOf('data:') === 0) continue;
      let abs;
      try {
        abs = new URL(m[2], rule.base).href;
      } catch {
        continue;
      }
      out = out.split(m[0]).join('url("' + (await toDataURL(abs)) + '")');
    }
    return out;
  }))).join('\n');
  const cloneStyled = src => {
    if (src.nodeType === 8 || src.nodeType === 1 && src.tagName === 'SCRIPT') return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src);
      let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS') try {
        const im = document.createElement('img');
        im.src = src.toDataURL();
        im.setAttribute('style', txt);
        return im;
      } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  const jobs = [];
  clone.querySelectorAll('img').forEach(el => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0) jobs.push(toDataURL(el.src).then(d => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach(el => {
    const bg = el.style.backgroundImage;
    if (!bg) return;
    let m;
    const re = /url\(["']?([^"')]+)["']?\)/g;
    while (m = re.exec(bg)) {
      const tok = m[0],
        url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(toDataURL(url).then(d => {
        el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")');
      }));
    }
  });
  await Promise.all(jobs);
  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (kind === 'html') {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title>' + (fontCss ? '<style>' + fontCss + '</style>' : '') + '</head><body style="margin:0">' + xml + '</body></html>';
    return save(new Blob([html], {
      type: 'text/html'
    }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * px + '" height="' + h * px + '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' + (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') + xml + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px;
  cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob(blob => save(blob, 'png'), 'image/png');
}
function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus,
  onDelete
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {}
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // ⋯ menu: close on any outside pointerdown. Two-click delete lives inside
  // the menu — first click arms the row, second commits; closing disarms.
  React.useEffect(() => {
    if (!menuOpen) {
      setConfirming(false);
      return;
    }
    const off = e => {
      if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menuOpen]);
  const doExport = kind => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind).catch(e => console.error('[design-canvas] export failed:', e));
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map(el => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left
    }));
    const slotXs = homes.map(h => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');
    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };
    const move = ev => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter(k => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    "data-dc-slot": id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-header",
    "data-omelette-chrome": "",
    style: {
      color: DC.label
    },
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-labelrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-grip",
    onPointerDown: onGripDown,
    title: "Drag to reorder"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "13",
    viewBox: "0 0 9 13",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "11",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "11",
    r: "1.1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-labeltext",
    onClick: onFocus,
    title: "Click to focus"
  }, /*#__PURE__*/React.createElement(DCEditable, {
    value: label,
    onChange: onRename,
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: DC.label,
      lineHeight: 1
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-btns"
  }, /*#__PURE__*/React.createElement("div", {
    ref: menuRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "dc-kebab",
    title: "More",
    onClick: () => setMenuOpen(o => !o)
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2.5",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9.5",
    cy: "6",
    r: "1.1"
  }))), menuOpen && /*#__PURE__*/React.createElement("div", {
    className: "dc-menu",
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('png')
  }, "Download PNG"), /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('html')
  }, "Download HTML"), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("button", {
    className: "dc-danger",
    onClick: () => {
      if (confirming) {
        setMenuOpen(false);
        onDelete();
      } else setConfirming(true);
    }
  }, confirming ? 'Click again to delete' : 'Delete'))), /*#__PURE__*/React.createElement("button", {
    className: "dc-expand",
    onClick: onFocus,
    title: "Focus"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"
  }))))), /*#__PURE__*/React.createElement("div", {
    ref: cardRef,
    className: "dc-card",
    style: {
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      width,
      height,
      background: '#fff',
      ...style
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb',
      fontSize: 13,
      fontFamily: DC.font
    }
  }, id)));
}

// Inline rename — commits on blur or Enter.
function DCEditable({
  value,
  onChange,
  style,
  tag = 'span',
  onClick
}) {
  const T = tag;
  return /*#__PURE__*/React.createElement(T, {
    className: "dc-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: onClick,
    onPointerDown: e => e.stopPropagation(),
    onBlur: e => onChange && onChange(e.currentTarget.textContent),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    style: style
  }, value);
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({
  entry,
  sectionMeta,
  sectionOrder
}) {
  const ctx = React.useContext(DCCtx);
  const {
    sectionId,
    artboard
  } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);
  const go = d => {
    const n = peers[(idx + d + peers.length) % peers.length];
    if (n) ctx.setFocus(`${sectionId}/${n}`);
  };
  const goSection = d => {
    // Sections whose artboards are all deleted have slotIds:[] — step past
    // them to the next non-empty section so ↑/↓ doesn't dead-end.
    const n = sectionOrder.length;
    for (let i = 1; i < n; i++) {
      const ns = sectionOrder[((secIdx + d * i) % n + n) % n];
      const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
      if (first) {
        ctx.setFocus(`${ns}/${first}`);
        return;
      }
    }
  };
  React.useEffect(() => {
    const k = e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const {
    width = 260,
    height = 480,
    children
  } = artboard.props;
  const [vp, setVp] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight
  });
  React.useEffect(() => {
    const r = () => setVp({
      w: window.innerWidth,
      h: window.innerHeight
    });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));
  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({
    dir,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    style: {
      position: 'absolute',
      top: '50%',
      [dir]: 28,
      transform: 'translateY(-50%)',
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: 'rgba(255,255,255,.9)',
      width: 44,
      height: 44,
      borderRadius: 22,
      fontSize: 18,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.18)',
    onMouseLeave: e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'
  })));

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    onClick: () => ctx.setFocus(null),
    onWheel: e => e.preventDefault(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(24,20,16,.6)',
      backdropFilter: 'blur(14px)',
      fontFamily: DC.font,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 20px 0',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(o => !o),
    style: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
      padding: '6px 8px',
      borderRadius: 6,
      textAlign: 'left',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, meta.title), /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 11 11",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3.5 3.5L9 4"
  }))), meta.subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      opacity: .6,
      fontWeight: 400,
      marginTop: 2
    }
  }, meta.subtitle)), ddOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#2a251f',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: 4,
      minWidth: 200,
      zIndex: 10
    }
  }, sectionOrder.filter(sid => sectionMeta[sid].slotIds.length).map(sid => /*#__PURE__*/React.createElement("button", {
    key: sid,
    onClick: () => {
      setDd(false);
      const f = sectionMeta[sid].slotIds[0];
      if (f) ctx.setFocus(`${sid}/${f}`);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 5,
      fontSize: 14,
      fontWeight: sid === sectionId ? 600 : 400,
      fontFamily: 'inherit'
    }
  }, sectionMeta[sid].title)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ctx.setFocus(null),
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.12)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,.7)',
      width: 32,
      height: 32,
      borderRadius: 16,
      fontSize: 20,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'background .12s'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 64,
      bottom: 56,
      left: 100,
      right: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: width * scale,
      height: height * scale,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      background: '#fff',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: '0 20px 80px rgba(0,0,0,.4)'
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb'
    }
  }, aid))), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 14,
      fontWeight: 500,
      opacity: .85,
      textAlign: 'center'
    }
  }, (sec.labels || {})[aid] ?? artboard.props.label, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .5,
      marginLeft: 10,
      fontVariantNumeric: 'tabular-nums'
    }
  }, idx + 1, " / ", peers.length))), /*#__PURE__*/React.createElement(Arrow, {
    dir: "left",
    onClick: () => go(-1)
  }), /*#__PURE__*/React.createElement(Arrow, {
    dir: "right",
    onClick: () => go(1)
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8
    }
  }, peers.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => ctx.setFocus(`${sectionId}/${p}`),
    style: {
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: i === idx ? '#fff' : 'rgba(255,255,255,.3)'
    }
  })))), document.body);
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom,
      width,
      background: DC.postitBg,
      padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14,
      lineHeight: 1.4,
      color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5
    }
  }, children);
}
Object.assign(window, {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/design-canvas.jsx", error: String((e && e.message) || e) }); }

// dialogs/documents-modals.jsx
try { (() => {
// dialogs/documents-modals.jsx — Tier-1 lifecycle modals that pair with
// the document composer. All four follow the existing modal idiom.
//
//   1. Convert estimate → SO (line picker)
//   2. Mark invoice as paid (date · mode · reference)
//   3. Void invoice (typed-confirm)
//   4. Send via WhatsApp / Email (recipient + preview)

/* Dimmed faux-doc backdrop — gives the modal context without recreating the whole composer. */
function FauxDocBackdrop({
  kind = 'invoice',
  docNumber = 'INV-2026-00091'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      filter: 'blur(1.5px) brightness(0.96)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--cream-100)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      borderBottom: '1px solid var(--cream-300)',
      background: 'var(--cream-50)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      gap: 14,
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Sales"), /*#__PURE__*/React.createElement("span", null, "/"), /*#__PURE__*/React.createElement("span", null, KIND[kind].crumbList), /*#__PURE__*/React.createElement("span", null, "/"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-900)',
      fontFamily: 'var(--font-mono)'
    }
  }, docNumber), /*#__PURE__*/React.createElement("span", {
    className: `doc-type-chip ${KIND[kind].chipClass}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), KIND[kind].label)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '22px 28px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 500,
      letterSpacing: '-0.015em',
      color: 'var(--cream-900)'
    }
  }, KIND[kind].titleSentVerb)), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 28px 18px',
      height: 64,
      background: '#fff',
      border: '1px solid var(--cream-300)',
      borderRadius: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '260px 1fr 320px',
      gap: 18,
      padding: '0 28px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 380,
      background: '#fff',
      border: '1px solid var(--cream-300)',
      borderRadius: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 380,
      background: '#fff',
      border: '1px solid var(--cream-300)',
      borderRadius: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 380,
      background: '#fff',
      border: '1px solid var(--cream-300)',
      borderRadius: 14
    }
  })));
}

/* ───────────────────────────────────────────────────────────
   1 · CONVERT ESTIMATE → SALES ORDER
   ─────────────────────────────────────────────────────────── */
function ModalConvertEstimateToSO() {
  const lines = [{
    sku: 'SKU-2026-00471',
    qty: 12,
    amt: 13452,
    checked: true
  }, {
    sku: 'SKU-2026-00481',
    qty: 6,
    amt: 9720,
    checked: true
  }, {
    sku: 'SKU-2026-00611',
    qty: 6,
    amt: 2304,
    checked: true
  }, {
    sku: 'SKU-2026-00702',
    qty: 4,
    amt: 2160,
    checked: false
  }];
  const incl = lines.filter(l => l.checked);
  const total = incl.reduce((s, l) => s + l.amt, 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FauxDocBackdrop, {
    kind: "estimate",
    docNumber: "EST-2026-00128"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal modal--wide",
    style: {
      width: 600
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head modal-head--icon"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-icon modal-icon--info"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 18,
    stroke: 1.6
  })), /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "From estimate \xB7 EST\u20112026\u201100128"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title",
    style: {
      fontSize: 19
    }
  }, "Convert to sales order"), /*#__PURE__*/React.createElement("p", {
    className: "ov-sub",
    style: {
      marginTop: 6
    }
  }, "Confirms the order with ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "Bharat Stores"), " and reserves stock. Pick which lines roll over \u2014 anything left stays on the estimate.")), /*#__PURE__*/React.createElement("button", {
    className: "ov-close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body",
    style: {
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "convert-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      background: 'var(--cream-50)',
      fontSize: 10.5,
      letterSpacing: '0.10em',
      textTransform: 'uppercase',
      color: 'var(--cream-700)',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null, "Product"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Qty"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Amount")), lines.map(l => {
    const p = findP(l.sku);
    return /*#__PURE__*/React.createElement("div", {
      key: l.sku,
      className: 'row' + (l.checked ? '' : ' is-deselected')
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      defaultChecked: l.checked
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "name"
    }, p.name), /*#__PURE__*/React.createElement("div", {
      className: "sku"
    }, p.sku)), /*#__PURE__*/React.createElement("div", {
      className: "qty"
    }, l.qty), /*#__PURE__*/React.createElement("div", {
      className: "amt"
    }, inr(l.amt)));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Expected delivery"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "13 Jun 2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "SO number"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "SO-2026-00057",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '10px 14px',
      background: 'var(--cream-50)',
      border: '1px solid var(--cream-300)',
      borderRadius: 10,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-700)'
    }
  }, incl.length, " of ", lines.length, " lines rolling over"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
      fontWeight: 500,
      color: 'var(--cream-900)'
    }
  }, inr(total))), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
      fontSize: 12.5,
      color: 'var(--cream-800)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: true,
    style: {
      accentColor: 'var(--teal-500)'
    }
  }), "Keep the estimate open for the remaining 1 line")), /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 14
  }), "Create SO-2026-00057"))));
}

/* ───────────────────────────────────────────────────────────
   2 · MARK INVOICE AS PAID
   ─────────────────────────────────────────────────────────── */
function ModalMarkInvoicePaid() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FauxDocBackdrop, {
    kind: "invoice",
    docNumber: "INV-2026-00091"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head modal-head--icon"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-icon",
    style: {
      background: 'var(--success-50)',
      color: 'var(--success-700)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 18,
    stroke: 2
  })), /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Invoice \xB7 INV\u20112026\u201100091"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title",
    style: {
      fontSize: 19
    }
  }, "Mark as paid"), /*#__PURE__*/React.createElement("p", {
    className: "ov-sub",
    style: {
      marginTop: 6
    }
  }, "Record a payment from ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "Bharat Stores"), ". Full or partial \u2014 we'll keep the invoice open until the balance is zero.")), /*#__PURE__*/React.createElement("button", {
    className: "ov-close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Amount received"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "\u20B935,478.00",
    style: {
      flex: 1,
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
      fontSize: 15,
      fontWeight: 500
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-sm",
    style: {
      flexShrink: 0
    }
  }, "Full amount")), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Invoice total \u20B935,478 \xB7 0 paid \xB7 \u20B935,478 due")), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Payment date"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "6 Jun 2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Method"), /*#__PURE__*/React.createElement("select", {
    className: "field-select",
    defaultValue: "upi"
  }, /*#__PURE__*/React.createElement("option", {
    value: "upi"
  }, "UPI"), /*#__PURE__*/React.createElement("option", {
    value: "bank"
  }, "Bank transfer"), /*#__PURE__*/React.createElement("option", {
    value: "cheque"
  }, "Cheque"), /*#__PURE__*/React.createElement("option", {
    value: "cash"
  }, "Cash"))), /*#__PURE__*/React.createElement("div", {
    className: "field field-full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Reference"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "UPI/406572198432",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Optional \u2014 UPI ref, cheque number, or bank reference. Shows on the receipt."))), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12.5,
      color: 'var(--cream-800)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: true,
    style: {
      accentColor: 'var(--teal-500)'
    }
  }), "Send receipt to Bharat Stores by WhatsApp")), /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    stroke: 2
  }), "Record payment"))));
}

/* ───────────────────────────────────────────────────────────
   3 · VOID INVOICE  (typed-confirm)
   ─────────────────────────────────────────────────────────── */
function ModalVoidInvoice() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FauxDocBackdrop, {
    kind: "invoice",
    docNumber: "INV-2026-00091"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head modal-head--icon"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-icon modal-icon--danger"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alertTriangle",
    size: 18,
    stroke: 1.6
  })), /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4,
      color: 'var(--danger-700)'
    }
  }, "Irreversible"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title",
    style: {
      fontSize: 19
    }
  }, "Void this invoice?"), /*#__PURE__*/React.createElement("p", {
    className: "ov-sub",
    style: {
      marginTop: 6
    }
  }, "Voiding marks ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "INV\u20112026\u201100091"), " as cancelled and notifies the buyer. The GST entry is reversed in the next Tally export. Voided invoices stay in the ledger \u2014 they can't be edited or deleted.")), /*#__PURE__*/React.createElement("button", {
    className: "ov-close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "confirm-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "The buyer's portal will show this invoice as voided")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "Any payments already received will need to be refunded separately")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "Tally export reverses the entry on next sync"))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Reason for voiding"), /*#__PURE__*/React.createElement("select", {
    className: "field-select",
    defaultValue: "error"
  }, /*#__PURE__*/React.createElement("option", {
    value: "error"
  }, "Raised in error"), /*#__PURE__*/React.createElement("option", {
    value: "dup"
  }, "Duplicate of another invoice"), /*#__PURE__*/React.createElement("option", {
    value: "cancelled"
  }, "Buyer cancelled the order"), /*#__PURE__*/React.createElement("option", {
    value: "other"
  }, "Other (write a note)"))), /*#__PURE__*/React.createElement("div", {
    className: "typed-input"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Type ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, "INV-2026-00091"), " to confirm"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    placeholder: "INV-2026-00091",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "A specific match enables the Void button."))), /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-disabled",
    disabled: true
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash",
    size: 14
  }), "Void invoice"))));
}

/* ───────────────────────────────────────────────────────────
   4 · SEND VIA WHATSAPP / EMAIL
   ─────────────────────────────────────────────────────────── */
function ModalSendInvoice() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FauxDocBackdrop, {
    kind: "invoice",
    docNumber: "INV-2026-00091"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal modal--wide",
    style: {
      width: 580
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head modal-head--icon"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-icon modal-icon--info"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "send",
    size: 18,
    stroke: 1.6
  })), /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Invoice \xB7 INV\u20112026\u201100091"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title",
    style: {
      fontSize: 19
    }
  }, "Send to Bharat Stores"), /*#__PURE__*/React.createElement("p", {
    className: "ov-sub",
    style: {
      marginTop: 6
    }
  }, "Sending locks GSTIN and HSN on the PDF. We'll record the send to the activity log.")), /*#__PURE__*/React.createElement("button", {
    className: "ov-close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "channel-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: "is-on"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "whatsapp",
    size: 13
  }), "WhatsApp"), /*#__PURE__*/React.createElement("button", null, /*#__PURE__*/React.createElement(Icon, {
    name: "mail",
    size: 13
  }), "Email"), /*#__PURE__*/React.createElement("button", null, /*#__PURE__*/React.createElement(DocIcon, {
    name: "printer",
    size: 13
  }), "Download only")), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field field-full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Send to"), /*#__PURE__*/React.createElement("div", {
    className: "combo-input"
  }, /*#__PURE__*/React.createElement(BAv, {
    hue: "teal",
    label: "SB",
    size: 22
  }), /*#__PURE__*/React.createElement("input", {
    defaultValue: "Suresh Bharat \xB7 +91 98101 22433",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "ib-clear",
    style: {
      background: 'transparent',
      border: 'none',
      color: 'var(--cream-700)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 13
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Admin contact on file. Also cc: ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "Anita Bharat \xB7 +91 98101 22877"), ".")), /*#__PURE__*/React.createElement("div", {
    className: "field field-full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Message"), /*#__PURE__*/React.createElement("textarea", {
    className: "field-textarea",
    style: {
      minHeight: 70
    },
    defaultValue: "Hi Suresh, sharing invoice INV-2026-00091 for \u20B935,478 due 24 Jun. Reply if you need anything changed."
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "A polite default \u2014 edit freely. The PDF attaches automatically."))), /*#__PURE__*/React.createElement("div", {
    className: "preview-stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "preview-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Preview \xB7 what the buyer will see"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--cream-700)'
    }
  }, "WhatsApp \xB7 in 2 min")), /*#__PURE__*/React.createElement("div", {
    className: "preview-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 14,
      fontWeight: 500
    }
  }, "DealFlow \xB7 Phani Raju"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--cream-700)'
    }
  }, "2:14 PM")), /*#__PURE__*/React.createElement("div", {
    className: "greet"
  }, "Hi Suresh, sharing invoice ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)',
      fontFamily: 'var(--font-mono)',
      fontSize: 12
    }
  }, "INV-2026-00091"), " for ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "\u20B935,478"), " due ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "24 Jun"), ". Reply if you need anything changed."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      padding: '8px 10px',
      background: 'var(--cream-50)',
      border: '1px solid var(--cream-300)',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "fileText",
    size: 14,
    color: "var(--teal-500)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      color: 'var(--cream-900)',
      fontWeight: 500
    }
  }, "INV-2026-00091.pdf"), /*#__PURE__*/React.createElement("span", {
    className: "sig",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11
    }
  }, "128 KB"))))), /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Schedule"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "send",
    size: 13
  }), "Send now"))));
}
Object.assign(window, {
  FauxDocBackdrop,
  ModalConvertEstimateToSO,
  ModalMarkInvoicePaid,
  ModalVoidInvoice,
  ModalSendInvoice
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/documents-modals.jsx", error: String((e && e.message) || e) }); }

// dialogs/documents-states.jsx
try { (() => {
// dialogs/documents-states.jsx — The 7 composer states + rationale card.
// Uses helpers from dialogs/documents.jsx and shared chrome from dialogs/composers.jsx.

/* ──────────────── RATIONALE ──────────────── */
function DocRationale() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "doc-rationale"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: 'var(--cream-700)',
      marginBottom: 8
    }
  }, "Documents \xB7 System"), /*#__PURE__*/React.createElement("h2", null, "One composer. Three documents. Create / Edit / View, all the same chrome."), /*#__PURE__*/React.createElement("div", {
    className: "sub",
    style: {
      marginTop: 8
    }
  }, "Estimates, sales orders, and invoices share ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "~85% of their fields"), ". We reuse the composer pattern from pricelists, cohorts, and catalogs \u2014 same three\u2011column body (buyer \xB7 lines \xB7 totals + insights), same auto\u2011saved draft, same back\u2011button. Type chip, doc\u2011# prefix, and the second date label switch by kind. Edit mode flags the diffs; View mode locks the inputs and swaps the action bar for lifecycle.")), /*#__PURE__*/React.createElement("div", {
    className: "cols"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tag doc-type-chip doc-type-chip--estimate"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Estimate"), /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Quote a buyer"), /*#__PURE__*/React.createElement("p", null, "A pre\u2011sale proposal. Lives long, gets re\u2011opened, often gets converted."), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", {
    className: "is-e"
  }, /*#__PURE__*/React.createElement("strong", null, "EST\u2011YYYY\u2011NNNNN"), " doc number, with a ", /*#__PURE__*/React.createElement("em", null, "Valid until"), " date"), /*#__PURE__*/React.createElement("li", {
    className: "is-e"
  }, "Primary action: ", /*#__PURE__*/React.createElement("em", null, "Send estimate"), " \u2014 by email or WhatsApp"), /*#__PURE__*/React.createElement("li", {
    className: "is-e"
  }, "When accepted: ", /*#__PURE__*/React.createElement("em", null, "Convert to sales order"), " carries every line"), /*#__PURE__*/React.createElement("li", {
    className: "is-e"
  }, "No GST commitment yet (preview only)"))), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tag doc-type-chip doc-type-chip--so"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Sales order"), /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Confirm and reserve"), /*#__PURE__*/React.createElement("p", null, "The buyer said yes. We lock the lines, reserve stock, and start fulfilment."), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", {
    className: "is-so"
  }, /*#__PURE__*/React.createElement("strong", null, "SO\u2011YYYY\u2011NNNNN"), " doc number, with an ", /*#__PURE__*/React.createElement("em", null, "Expected delivery"), " date"), /*#__PURE__*/React.createElement("li", {
    className: "is-so"
  }, "Primary action: ", /*#__PURE__*/React.createElement("em", null, "Confirm order"), " \u2014 reserves stock against the buyer"), /*#__PURE__*/React.createElement("li", {
    className: "is-so"
  }, "Stock validation lives here \u2014 over\u2011stock warnings appear inline"), /*#__PURE__*/React.createElement("li", {
    className: "is-so"
  }, "When dispatched (full or partial): ", /*#__PURE__*/React.createElement("em", null, "Convert to invoice")))), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tag doc-type-chip doc-type-chip--invoice"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Invoice"), /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Bill and collect"), /*#__PURE__*/React.createElement("p", null, "The receivable. GST commitment, due date, and the system\u2011of\u2011record for Tally export."), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", {
    className: "is-inv"
  }, /*#__PURE__*/React.createElement("strong", null, "INV\u2011YYYY\u2011NNNNN"), " doc number, with a ", /*#__PURE__*/React.createElement("em", null, "Due date")), /*#__PURE__*/React.createElement("li", {
    className: "is-inv"
  }, "Primary action: ", /*#__PURE__*/React.createElement("em", null, "Send invoice"), " \u2014 locks GSTIN and HSN at send time"), /*#__PURE__*/React.createElement("li", {
    className: "is-inv"
  }, "Lifecycle: Sent \u2192 Partially paid \u2192 Paid \xB7 or Void"), /*#__PURE__*/React.createElement("li", {
    className: "is-inv"
  }, "Tally / Busy CSV maps from here in Phase 1")))), /*#__PURE__*/React.createElement("div", {
    className: "shared"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 16,
    color: "var(--teal-500)",
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Why a composer, not a slide\u2011over."), ' ', "A transactional document needs the user to see ", /*#__PURE__*/React.createElement("em", null, "other data"), " while filling it in \u2014 the buyer's pricelist, their credit headroom, scheme savings, stock availability per line. That's the deciding question in our overlay system (read: ", /*#__PURE__*/React.createElement("em", null, "System \xB7 Three tiers"), " above). A slide\u2011over works for a single\u2011entity create with no surrounding data; a document fails that test. Same as Pricelist / Cohort / Catalog \u2014 same composer, different rows."))));
}

/* ──────────────── STATE 1 · EMPTY (just opened, no buyer) ──────────────── */
function DocComposerEstimateEmpty() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(DocTop, {
    kind: "estimate",
    docNumber: null,
    autoSave: {
      label: 'Draft created · 2 sec ago',
      dot: {
        background: 'var(--success-500)'
      }
    },
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DocTitleRow, {
    kind: "estimate",
    mode: "create",
    subtitle: "Pick a buyer to start \u2014 pricelist, credit, and place of supply auto-apply.",
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 13
    }), "Import CSV"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkle",
      size: 13
    }), "Copy from another estimate"))
  }), /*#__PURE__*/React.createElement(DocStrip, {
    kind: "estimate",
    docNumber: "EST-2026-00128",
    date: "6 Jun 2026",
    secondDate: "20 Jun 2026",
    refPO: null,
    posState: "\u2014 (pick buyer)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(BuyerCardEmpty, {
    focused: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "doc-lines"
  }, /*#__PURE__*/React.createElement("div", {
    className: "doc-lines-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Pick a buyer first"), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Lines appear here once a buyer is chosen."))), /*#__PURE__*/React.createElement("div", {
    className: "lines-empty",
    style: {
      padding: '64px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "illus"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 26,
    stroke: 1.25
  })), /*#__PURE__*/React.createElement("h4", null, "Waiting on the buyer"), /*#__PURE__*/React.createElement("p", null, "The pricelist that's applied \u2014 and the products you can add \u2014 depend on which buyer this is for."))), /*#__PURE__*/React.createElement(TotalsStack, null, /*#__PURE__*/React.createElement(TotalsCard, {
    lines: []
  })))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Auto\u2011saves as you type \xB7 resumes on reload"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-disabled",
    disabled: true
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "send",
    size: 13
  }), "Send estimate"))));
}

/* ──────────────── STATE 2 · BUYER PICKED, NO LINES ──────────────── */
function DocComposerEstimateBuyer() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(DocTop, {
    kind: "estimate",
    docNumber: "EST-2026-00128",
    autoSave: {
      label: 'Draft saved · 4 sec ago',
      dot: {
        background: 'var(--success-500)'
      }
    },
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DocTitleRow, {
    kind: "estimate",
    mode: "create",
    subtitle: /*#__PURE__*/React.createElement(React.Fragment, null, "For ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, BUYER.name), " \u2014 start adding products in the search row."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 13
    }), "Import CSV"))
  }), /*#__PURE__*/React.createElement(DocStrip, {
    kind: "estimate",
    docNumber: "EST-2026-00128",
    date: "6 Jun 2026",
    secondDate: "20 Jun 2026",
    refPO: null,
    posState: "Delhi (intra-state)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(BuyerCardFilled, null), /*#__PURE__*/React.createElement(LinesTable, {
    lines: [],
    showAddRow: true,
    addRowProps: {
      open: false,
      searchTerm: ''
    },
    emptyMsg: "Pricelist is ready. Type product name or SKU in the search row above to add your first line."
  }), /*#__PURE__*/React.createElement(TotalsStack, null, /*#__PURE__*/React.createElement(TotalsCard, {
    lines: []
  }), /*#__PURE__*/React.createElement(InsightsCard, {
    buyer: BUYER,
    creditState: "ok",
    addToCart: 0
  })))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Draft saved \xB7 auto\u2011resumes if you close"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save & close"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-disabled",
    disabled: true
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "send",
    size: 13
  }), "Send estimate"))));
}

/* ──────────────── STATE 3 · IN PROGRESS (4 lines, summary live) ──────────────── */
function DocComposerEstimateInProgress() {
  const lines = [{
    sku: 'SKU-2026-00471',
    qty: 12,
    price: 1180,
    discPct: 5,
    taxPct: 18,
    scheme: 'Buy 12, get 1 free'
  }, {
    sku: 'SKU-2026-00481',
    qty: 6,
    price: 1620,
    discPct: 0,
    taxPct: 18
  }, {
    sku: 'SKU-2026-00611',
    qty: 6,
    price: 384,
    discPct: 0,
    taxPct: 18
  }, {
    sku: 'SKU-2026-00702',
    qty: 4,
    price: 540,
    discPct: 0,
    taxPct: 12
  }];
  // subtotal ~ 26,532; addToCart total approx after tax ~ 30,500
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(DocTop, {
    kind: "estimate",
    docNumber: "EST-2026-00128",
    autoSave: {
      label: 'Draft saved · 6 sec ago by Phani',
      dot: {
        background: 'var(--success-500)'
      }
    },
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DocTitleRow, {
    kind: "estimate",
    mode: "create",
    subtitle: /*#__PURE__*/React.createElement(React.Fragment, null, "For ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, BUYER.name), " \u2014 review the totals on the right, then send."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(DocIcon, {
      name: "printer",
      size: 13
    }), "Preview PDF"))
  }), /*#__PURE__*/React.createElement(DocStrip, {
    kind: "estimate",
    docNumber: "EST-2026-00128",
    date: "6 Jun 2026",
    secondDate: "20 Jun 2026",
    refPO: "PO/BS/06-128",
    posState: "Delhi (intra-state)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(BuyerCardFilled, {
    addToCart: 32600
  }), /*#__PURE__*/React.createElement(LinesTable, {
    lines: lines,
    showAddRow: true,
    addRowProps: {
      open: false
    }
  }), /*#__PURE__*/React.createElement(TotalsStack, null, /*#__PURE__*/React.createElement(TotalsCard, {
    lines: lines,
    discountFlat: 500,
    freight: 250
  }), /*#__PURE__*/React.createElement(InsightsCard, {
    buyer: BUYER,
    schemeSavings: 1180,
    creditState: "ok",
    addToCart: 32600
  })))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Draft saved \xB7 last edit 6 sec ago by Phani"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save & close"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "send",
    size: 13
  }), "Send estimate"))));
}

/* ──────────────── STATE 4 · EDIT MODE (existing invoice, diff markers) ──────────────── */
function DocComposerInvoiceEdit() {
  const lines = [{
    sku: 'SKU-2026-00471',
    qty: 12,
    price: 1180,
    discPct: 5,
    taxPct: 18,
    status: 'changed',
    wasPrice: 1240
  }, {
    sku: 'SKU-2026-00481',
    qty: 6,
    price: 1620,
    discPct: 0,
    taxPct: 18,
    status: 'normal'
  }, {
    sku: 'SKU-2026-00611',
    qty: 6,
    price: 384,
    discPct: 0,
    taxPct: 18,
    status: 'added'
  }, {
    sku: 'SKU-2026-00702',
    qty: 4,
    price: 540,
    discPct: 0,
    taxPct: 12,
    status: 'removed'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(DocTop, {
    kind: "invoice",
    docNumber: "INV-2026-00091",
    autoSave: {
      label: '3 unsaved changes · 12 sec ago',
      dot: {
        background: 'var(--ember-400)'
      }
    },
    modeChip: {
      tone: 'edit',
      label: 'Editing · was sent'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DocTitleRow, {
    kind: "invoice",
    mode: "edit",
    subtitle: /*#__PURE__*/React.createElement("span", null, "You're editing an invoice that's already been sent to ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, "Bharat Stores"), ". Saving will bump it to ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, "v2"), " and notify the buyer. Modified lines are flagged."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(DocIcon, {
      name: "rotateCcw",
      size: 13
    }), "Revert all"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "fileText",
      size: 13
    }), "Activity log"))
  }), /*#__PURE__*/React.createElement(DocStrip, {
    kind: "invoice",
    docNumber: "INV-2026-00091",
    date: "3 Jun 2026",
    secondDate: "24 Jun 2026",
    refPO: "PO/BS/06-121",
    posState: "Delhi (intra-state)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(BuyerCardFilled, null), /*#__PURE__*/React.createElement(LinesTable, {
    lines: lines,
    mode: "edit",
    showAddRow: true,
    addRowProps: {
      open: false
    }
  }), /*#__PURE__*/React.createElement(TotalsStack, null, /*#__PURE__*/React.createElement(TotalsCard, {
    lines: lines,
    discountFlat: 500,
    freight: 250,
    mode: "edit",
    diff: {
      subtotal: 28452,
      tax: 5121,
      total: 33823
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "callout callout--warning"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alertTriangle",
    size: 15,
    stroke: 1.6,
    color: "var(--warning-500)",
    className: "ico"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Saving notifies the buyer."), " v1 was viewed 2 days ago. We'll mark the old PDF superseded and send v2 by the same channel.")), /*#__PURE__*/React.createElement(InsightsCard, {
    buyer: BUYER,
    schemeSavings: 1180,
    creditState: "ok",
    addToCart: 29950
  })))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta",
    style: {
      color: 'var(--ember-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: 'var(--ember-400)'
    }
  }), "3 unsaved changes \xB7 last edit 12 sec ago by Phani"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard changes"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save as draft"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "send",
    size: 13
  }), "Save & resend"))));
}

/* ──────────────── STATE 5 · STOCK WARNING (sales order, one line over stock) ──────────────── */
function DocComposerSOStockWarning() {
  const lines = [{
    sku: 'SKU-2026-00482',
    qty: 24,
    price: 1340,
    discPct: 0,
    taxPct: 18,
    stockWarn: true,
    stockAvail: 18
  }, {
    sku: 'SKU-2026-00481',
    qty: 8,
    price: 1620,
    discPct: 0,
    taxPct: 18
  }, {
    sku: 'SKU-2026-00472',
    qty: 6,
    price: 920,
    discPct: 5,
    taxPct: 18
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(DocTop, {
    kind: "so",
    docNumber: "SO-2026-00057",
    autoSave: {
      label: 'Draft saved · 3 sec ago',
      dot: {
        background: 'var(--success-500)'
      }
    },
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DocTitleRow, {
    kind: "so",
    mode: "create",
    subtitle: /*#__PURE__*/React.createElement(React.Fragment, null, "For ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, BUYER.name), " \u2014 one line exceeds available stock."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "package",
      size: 13
    }), "Stock report"))
  }), /*#__PURE__*/React.createElement(DocStrip, {
    kind: "so",
    docNumber: "SO-2026-00057",
    date: "6 Jun 2026",
    secondDate: "13 Jun 2026",
    refPO: "PO/BS/06-129",
    posState: "Delhi (intra-state)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(BuyerCardFilled, {
    addToCart: 50200
  }), /*#__PURE__*/React.createElement(LinesTable, {
    lines: lines,
    showAddRow: true,
    addRowProps: {
      open: false
    }
  }), /*#__PURE__*/React.createElement(TotalsStack, null, /*#__PURE__*/React.createElement("div", {
    className: "callout callout--warning"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alertTriangle",
    size: 15,
    stroke: 1.6,
    color: "var(--warning-500)",
    className: "ico"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "1 line over stock."), " Casa del Sol Albari\xF1o \xB7 ordered ", /*#__PURE__*/React.createElement("strong", null, "24"), ", only ", /*#__PURE__*/React.createElement("strong", null, "18"), " on hand. Options: ", /*#__PURE__*/React.createElement("em", null, "backorder the 6"), ", ", /*#__PURE__*/React.createElement("em", null, "split into two SOs"), ", or ", /*#__PURE__*/React.createElement("em", null, "cut the line to 18"), ".")), /*#__PURE__*/React.createElement(TotalsCard, {
    lines: lines,
    freight: 400
  }), /*#__PURE__*/React.createElement(InsightsCard, {
    buyer: BUYER,
    creditState: "ok",
    addToCart: 50200
  })))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Draft saved \xB7 resolve the stock warning before confirming"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Discard"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Save & close"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary",
    style: {
      borderColor: 'var(--warning-500)',
      color: 'var(--warning-700)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 13,
    stroke: 2
  }), "Confirm with backorder"))));
}

/* ──────────────── STATE 6 · CREDIT LIMIT WARNING ──────────────── */
function DocComposerEstimateCreditWarn() {
  const lines = [{
    sku: 'SKU-2026-00481',
    qty: 30,
    price: 1620,
    discPct: 0,
    taxPct: 18
  }, {
    sku: 'SKU-2026-00471',
    qty: 24,
    price: 1180,
    discPct: 5,
    taxPct: 18,
    scheme: 'Buy 12, get 1 free'
  }, {
    sku: 'SKU-2026-00482',
    qty: 12,
    price: 1340,
    discPct: 0,
    taxPct: 18
  }];
  // subtotal ~ 91k; tax ~ 16k; total ~ 107k.  Buyer used 160k of 250k → adding 107k = 267k → ₹17k over.
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer"
  }, /*#__PURE__*/React.createElement(DocTop, {
    kind: "estimate",
    docNumber: "EST-2026-00128",
    autoSave: {
      label: 'Draft saved · 8 sec ago',
      dot: {
        background: 'var(--success-500)'
      }
    },
    modeChip: {
      tone: 'draft',
      label: 'Draft'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DocTitleRow, {
    kind: "estimate",
    mode: "create",
    subtitle: /*#__PURE__*/React.createElement(React.Fragment, null, "For ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, BUYER.name), " \u2014 this estimate exceeds their credit limit."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(DocIcon, {
      name: "creditCard",
      size: 13
    }), "Credit history"))
  }), /*#__PURE__*/React.createElement(DocStrip, {
    kind: "estimate",
    docNumber: "EST-2026-00128",
    date: "6 Jun 2026",
    secondDate: "20 Jun 2026",
    refPO: "PO/BS/06-131",
    posState: "Delhi (intra-state)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(BuyerCardFilled, {
    addToCart: 107000,
    isOver: true
  }), /*#__PURE__*/React.createElement(LinesTable, {
    lines: lines,
    showAddRow: true,
    addRowProps: {
      open: false
    }
  }), /*#__PURE__*/React.createElement(TotalsStack, null, /*#__PURE__*/React.createElement("div", {
    className: "callout callout--danger"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alertTriangle",
    size: 15,
    stroke: 1.6,
    color: "var(--danger-500)",
    className: "ico"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Over credit limit by \u20B917 K."), " Bharat Stores' limit is \u20B92.5 L and they've already used \u20B91.6 L. Send still allowed for estimates \u2014 but converting to SO will need a manager's approval.")), /*#__PURE__*/React.createElement(TotalsCard, {
    lines: lines,
    discountFlat: 2000,
    freight: 400,
    over: true
  }), /*#__PURE__*/React.createElement(InsightsCard, {
    buyer: BUYER,
    schemeSavings: 2360,
    creditState: "over",
    addToCart: 107000
  })))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta",
    style: {
      color: 'var(--danger-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: 'var(--danger-500)'
    }
  }), "Over credit limit \xB7 estimate can still be sent for buyer's approval"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Trim lines"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Request limit raise"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "send",
    size: 13
  }), "Send estimate"))));
}

/* ──────────────── STATE 7 · VIEW / READ-ONLY (invoice sent) ──────────────── */
function DocComposerInvoiceSent() {
  const lines = [{
    sku: 'SKU-2026-00471',
    qty: 12,
    price: 1180,
    discPct: 5,
    taxPct: 18
  }, {
    sku: 'SKU-2026-00481',
    qty: 6,
    price: 1620,
    discPct: 0,
    taxPct: 18
  }, {
    sku: 'SKU-2026-00611',
    qty: 6,
    price: 384,
    discPct: 0,
    taxPct: 18
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement("div", {
    className: "composer doc-readonly"
  }, /*#__PURE__*/React.createElement(DocTop, {
    kind: "invoice",
    docNumber: "INV-2026-00091",
    statusChip: /*#__PURE__*/React.createElement("span", {
      className: "doc-status doc-status--sent"
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "Sent \xB7 awaiting payment"),
    autoSave: null
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DocTitleRow, {
    kind: "invoice",
    mode: "sent",
    subtitle: /*#__PURE__*/React.createElement(React.Fragment, null, "To ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, BUYER.name), " \xB7 \u20B935,478 due in ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--cream-900)'
      }
    }, "18 days"), "."),
    rightActions: /*#__PURE__*/React.createElement("div", {
      className: "doc-actions"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(DocIcon, {
      name: "printer",
      size: 13
    }), "Download PDF"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm"
    }, /*#__PURE__*/React.createElement(DocIcon, {
      name: "send",
      size: 13
    }), "Send again"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 13,
      stroke: 2
    }), "Mark as paid"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      style: {
        width: 28,
        padding: 0,
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "moreVertical",
      size: 14
    })))
  }), /*#__PURE__*/React.createElement("div", {
    className: "doc-trail"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "Sent"), " via WhatsApp \xB7 2 hours ago by Phani"), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "Seen"), " by buyer \xB7 24 min ago"), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "Tally export \xB7 pending next sync")), /*#__PURE__*/React.createElement(DocStrip, {
    kind: "invoice",
    docNumber: "INV-2026-00091",
    date: "6 Jun 2026",
    secondDate: "24 Jun 2026",
    refPO: "PO/BS/06-128",
    posState: "Delhi (intra-state)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "composer-body"
  }, /*#__PURE__*/React.createElement(BuyerCardFilled, null), /*#__PURE__*/React.createElement(LinesTable, {
    lines: lines,
    readOnly: true
  }), /*#__PURE__*/React.createElement(TotalsStack, null, /*#__PURE__*/React.createElement(TotalsCard, {
    lines: lines,
    discountFlat: 500,
    freight: 250
  }), /*#__PURE__*/React.createElement("div", {
    className: "callout callout--info"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 15,
    stroke: 1.6,
    color: "var(--teal-500)",
    className: "ico"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "To edit, click Edit invoice."), " Edits bump the version and notify the buyer. Use ", /*#__PURE__*/React.createElement("em", null, "Void"), " only if this invoice was raised in error.")), /*#__PURE__*/React.createElement(InsightsCard, {
    buyer: BUYER,
    schemeSavings: 1180,
    creditState: "ok",
    addToCart: 0
  })))), /*#__PURE__*/React.createElement("div", {
    className: "composer-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: 'var(--info-500)'
    }
  }), "Sent \xB7 last viewed by buyer 24 min ago"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      color: 'var(--danger-700)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash",
    size: 13
  }), "Void invoice"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary"
  }, "Edit invoice"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 13,
    stroke: 2
  }), "Mark as paid"))));
}
Object.assign(window, {
  DocRationale,
  DocComposerEstimateEmpty,
  DocComposerEstimateBuyer,
  DocComposerEstimateInProgress,
  DocComposerInvoiceEdit,
  DocComposerSOStockWarning,
  DocComposerEstimateCreditWarn,
  DocComposerInvoiceSent
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/documents-states.jsx", error: String((e && e.message) || e) }); }

// dialogs/documents.jsx
try { (() => {
// dialogs/documents.jsx — Estimate / Sales order / Invoice composer
// Same chrome reused across Create, Edit, and View(read-only), and across
// the three document kinds — only the kind chip, doc-# prefix, and a few
// labels change. Mirrors the pricelist / cohort / catalog composer pattern.
//
// Exports (window):
//   DocRationale                    — section explainer card
//   DocComposerEstimateEmpty        — state 1: just opened, no buyer
//   DocComposerEstimateBuyer        — state 2: buyer picked, no lines yet
//   DocComposerEstimateInProgress   — state 3: 4 lines, summary live
//   DocComposerInvoiceEdit          — state 4: edit a sent invoice, diff
//   DocComposerSOStockWarning       — state 5: stock warning
//   DocComposerEstimateCreditWarn   — state 6: credit-limit warning
//   DocComposerInvoiceSent          — state 7: read-only after send

/* ───────────────────────────── DATA ──────────────────────────────── */

const inrNum = n => n.toLocaleString('en-IN', {
  maximumFractionDigits: 2
});
const inr = n => '₹' + inrNum(n);
const inrShort = n => {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return '₹' + inrNum(n);
};
const BUYER = {
  id: 'CUS-024',
  initials: 'BS',
  hue: 'teal',
  name: 'Bharat Stores',
  loc: 'Karol Bagh, Delhi',
  gstin: '07AAACB1234F1ZX',
  billAddr: '12 Pusa Road, Karol Bagh, New Delhi 110005',
  posState: 'Delhi (intra-state)',
  terms: 'Net 21',
  credit: {
    limit: 250000,
    used: 160000
  },
  pricelist: {
    name: "North Delhi A-class · Summer '26",
    saving: '−4.8% vs base'
  },
  agent: {
    name: 'Phani Raju',
    avatar: 'PR'
  },
  tier: 'A-class'
};

/* Product catalog for the search popover and line items */
const DOC_PRODUCTS = [{
  sku: 'SKU-2026-00471',
  name: 'Vinikus Shiraz Reserve · 750ml',
  brand: 'VE',
  hue: 'teal',
  mrp: 1850,
  list: 1180,
  stock: 142
}, {
  sku: 'SKU-2026-00472',
  name: 'Vinikus Sauvignon Blanc · 750ml',
  brand: 'VE',
  hue: 'teal',
  mrp: 1450,
  list: 920,
  stock: 84
}, {
  sku: 'SKU-2026-00481',
  name: 'Casa del Sol Tempranillo · 750ml',
  brand: 'CS',
  hue: 'ember',
  mrp: 2400,
  list: 1620,
  stock: 38
}, {
  sku: 'SKU-2026-00482',
  name: 'Casa del Sol Albariño · 750ml',
  brand: 'CS',
  hue: 'ember',
  mrp: 1950,
  list: 1340,
  stock: 18
}, {
  sku: 'SKU-2026-00611',
  name: 'Marwadi Cardamom Whole · 100g',
  brand: 'MS',
  hue: 'cream',
  mrp: 480,
  list: 384,
  stock: 220
}, {
  sku: 'SKU-2026-00702',
  name: 'Asha Darjeeling First Flush · 250g',
  brand: 'AT',
  hue: 'cream',
  mrp: 720,
  list: 540,
  stock: 64
}];
const findP = sku => DOC_PRODUCTS.find(p => p.sku === sku);

/* Brand avatar shorthand */
const BAv = ({
  hue,
  label,
  size = 28
}) => /*#__PURE__*/React.createElement("div", {
  className: `b-av b-av--${hue}`,
  style: {
    width: size,
    height: size,
    borderRadius: 6,
    fontSize: size <= 22 ? 9 : 10
  }
}, label);

/* Small inline icon glyphs not in shared.jsx — keep the set tiny. */
const DocIcon = ({
  name,
  size = 14,
  stroke = 1.5,
  color = 'currentColor',
  style
}) => {
  const paths = {
    send: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M22 2L11 13"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 2l-7 20-4-9-9-4 20-7z"
    })),
    creditCard: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "5",
      width: "20",
      height: "14",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M2 10h20"
    })),
    tag: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 7h.01"
    })),
    gift: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
      points: "20 12 20 22 4 22 4 12"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "7",
      width: "20",
      height: "5"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "12",
      y1: "22",
      x2: "12",
      y2: "7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 100-5C13 2 12 7 12 7z"
    })),
    mapPin: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "10",
      r: "3"
    })),
    calendar: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "4",
      width: "18",
      height: "18",
      rx: "2"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "16",
      y1: "2",
      x2: "16",
      y2: "6"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "8",
      y1: "2",
      x2: "8",
      y2: "6"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "3",
      y1: "10",
      x2: "21",
      y2: "10"
    })),
    whatsapp: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 12a9 9 0 11-3.5-7.1L21 3l-1.9 3.4A9 9 0 0121 12z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8.5 9c0 4 3 6.5 6.5 6.5l1.5-1.5-2.5-1-1 1c-1.5-.5-2.5-1.5-3-3l1-1-1-2.5L8.5 9z"
    })),
    printer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
      points: "6 9 6 2 18 2 18 9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "6",
      y: "14",
      width: "12",
      height: "8"
    })),
    rotateCcw: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
      points: "1 4 1 10 7 10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.51 15a9 9 0 102.13-9.36L1 10"
    })),
    minus: /*#__PURE__*/React.createElement("line", {
      x1: "5",
      y1: "12",
      x2: "19",
      y2: "12"
    })
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    "aria-hidden": "true"
  }, paths[name]);
};

/* ────────────────── KIND CONFIG ─────────────────────────────────── */
/* Same composer, different copy & colors per kind. */
const KIND = {
  estimate: {
    label: 'Estimate',
    chipClass: 'doc-type-chip--estimate',
    crumbList: 'Estimates',
    crumbListPath: 'Sales',
    docPrefix: 'EST',
    titleVerb: 'New estimate',
    titleEditVerb: 'Edit estimate',
    titleSentVerb: 'Estimate',
    dateLabel: 'Date issued',
    secondDateLabel: 'Valid until',
    primary: {
      label: 'Send estimate',
      icon: 'send'
    },
    primaryEdit: {
      label: 'Save & resend',
      icon: 'send'
    },
    sentActions: 'estimate'
  },
  so: {
    label: 'Sales order',
    chipClass: 'doc-type-chip--so',
    crumbList: 'Sales orders',
    crumbListPath: 'Sales',
    docPrefix: 'SO',
    titleVerb: 'New sales order',
    titleEditVerb: 'Edit sales order',
    titleSentVerb: 'Sales order',
    dateLabel: 'Order date',
    secondDateLabel: 'Expected delivery',
    primary: {
      label: 'Confirm order',
      icon: 'check'
    },
    primaryEdit: {
      label: 'Save changes',
      icon: 'check'
    },
    sentActions: 'so'
  },
  invoice: {
    label: 'Invoice',
    chipClass: 'doc-type-chip--invoice',
    crumbList: 'Invoices',
    crumbListPath: 'Sales',
    docPrefix: 'INV',
    titleVerb: 'New invoice',
    titleEditVerb: 'Edit invoice',
    titleSentVerb: 'Invoice',
    dateLabel: 'Invoice date',
    secondDateLabel: 'Due date',
    primary: {
      label: 'Send invoice',
      icon: 'send'
    },
    primaryEdit: {
      label: 'Save & resend',
      icon: 'send'
    },
    sentActions: 'invoice'
  }
};

/* ────────────────── SHARED CHROME ────────────────────────────────── */

function DocTop({
  kind,
  docNumber,
  statusChip,
  autoSave,
  modeChip,
  crumbCurrentOverride
}) {
  const K = KIND[kind];
  const current = crumbCurrentOverride || (docNumber ? docNumber : `New ${K.label.toLowerCase()}`);
  return /*#__PURE__*/React.createElement("div", {
    className: "composer-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crumb"
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--cream-700)'
    }
  }, K.crumbListPath), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/"), /*#__PURE__*/React.createElement("a", {
    style: {
      color: 'var(--cream-700)'
    }
  }, K.crumbList), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "current"
  }, current)), /*#__PURE__*/React.createElement("span", {
    className: `doc-type-chip ${K.chipClass}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), K.label), statusChip, modeChip && /*#__PURE__*/React.createElement("span", {
    className: `mode-chip mode-chip--${modeChip.tone}`
  }, modeChip.label), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), autoSave && /*#__PURE__*/React.createElement("span", {
    className: "status-chip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: autoSave.dot
  }), autoSave.label), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 13
  }), "Close"));
}
function DocTitleRow({
  kind,
  mode = 'create',
  subtitle,
  rightActions
}) {
  const K = KIND[kind];
  const title = mode === 'edit' ? K.titleEditVerb : mode === 'sent' ? K.titleSentVerb : K.titleVerb;
  return /*#__PURE__*/React.createElement("div", {
    className: "composer-title-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, title), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, subtitle)), rightActions);
}

/* Doc strip — 5 fields: doc #, date, second date (valid/due/delivery), ref PO, place of supply */
function DocStrip({
  kind,
  docNumber,
  date,
  secondDate,
  refPO,
  posState,
  editingDocNumber = false
}) {
  const K = KIND[kind];
  return /*#__PURE__*/React.createElement("div", {
    className: "doc-strip"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, K.label, " #"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, editingDocNumber ? /*#__PURE__*/React.createElement("input", {
    defaultValue: docNumber,
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13
    }
  }) : /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, docNumber))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, K.dateLabel), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400
    }
  }, date), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 12,
    className: "chevron"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, K.secondDateLabel), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400
    }
  }, secondDate), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 12,
    className: "chevron"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Buyer PO ref"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, refPO ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13
    }
  }, refPO) : /*#__PURE__*/React.createElement("span", {
    className: "placeholder"
  }, "Optional"))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Place of supply"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400
    }
  }, posState), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 12,
    className: "chevron"
  }))));
}

/* ────────────────── BUYER CARD ───────────────────────────────────── */

function BuyerCardEmpty({
  focused = true
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "buyer-card--empty buyer-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Buyer"), /*#__PURE__*/React.createElement("h4", null, "Who is this for?"), /*#__PURE__*/React.createElement("div", {
    className: `search ${focused ? 'is-focus' : ''}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 13,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search by name, phone, GST\u2026",
    autoFocus: focused
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--cream-700)',
      padding: '1px 5px',
      background: 'var(--cream-100)',
      borderRadius: 4
    }
  }, "\u2318K")), /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "Picking a buyer applies their pricelist, terms, and place of supply automatically \u2014 you can override any of it."), /*#__PURE__*/React.createElement("div", {
    className: "buyer-suggest"
  }, [{
    i: 'BS',
    hue: 'teal',
    name: 'Bharat Stores',
    sub: 'Karol Bagh, Delhi · A-class',
    bal: '₹1.6 L due'
  }, {
    i: 'GW',
    hue: 'ember',
    name: 'Gupta Wines',
    sub: 'CR Park, Delhi · A-class',
    bal: '₹0'
  }, {
    i: 'SP',
    hue: 'cream',
    name: 'Sehgal & Sons',
    sub: 'Greater Kailash · B-class',
    bal: '₹84 K due'
  }].map((b, idx) => /*#__PURE__*/React.createElement("div", {
    key: b.i,
    className: 'row' + (idx === 0 ? ' is-hl' : '')
  }, /*#__PURE__*/React.createElement(BAv, {
    hue: b.hue,
    label: b.i,
    size: 26
  }), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, b.name), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, b.sub)), /*#__PURE__*/React.createElement("div", {
    className: "balance"
  }, b.bal)))));
}
function CreditBar({
  buyer,
  addToCart = 0,
  isOver = false
}) {
  const {
    limit,
    used
  } = buyer.credit;
  const pctUsed = used / limit * 100;
  const pctPreview = Math.min((used + addToCart) / limit * 100, 100) - pctUsed;
  const overBy = used + addToCart - limit;
  const avail = limit - used - addToCart;
  return /*#__PURE__*/React.createElement("div", {
    className: "credit-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row1"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Credit"), /*#__PURE__*/React.createElement("span", {
    className: "right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "used"
  }, inrShort(used + addToCart)), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "limit"
  }, inrShort(limit)))), /*#__PURE__*/React.createElement("div", {
    className: "track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "used",
    style: {
      width: pctUsed + '%'
    }
  }), addToCart > 0 && /*#__PURE__*/React.createElement("div", {
    className: isOver ? 'preview--over' : 'preview',
    style: {
      width: pctPreview + '%'
    }
  })), addToCart === 0 && /*#__PURE__*/React.createElement("div", {
    className: "footnote"
  }, /*#__PURE__*/React.createElement("strong", null, inrShort(avail)), " available \xB7 Net 21 terms"), addToCart > 0 && !isOver && /*#__PURE__*/React.createElement("div", {
    className: "footnote"
  }, "This ", KIND.estimate.label.toLowerCase(), " adds ", /*#__PURE__*/React.createElement("strong", null, inrShort(addToCart)), ". ", /*#__PURE__*/React.createElement("strong", null, inrShort(avail)), " still available after."), isOver && /*#__PURE__*/React.createElement("div", {
    className: "footnote is-warning"
  }, "This adds ", /*#__PURE__*/React.createElement("strong", null, inrShort(addToCart)), " \u2014 ", /*#__PURE__*/React.createElement("strong", null, inrShort(overBy)), " over the credit limit."));
}
function BuyerCardFilled({
  buyer = BUYER,
  addToCart = 0,
  isOver = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "buyer-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "head"
  }, /*#__PURE__*/React.createElement(BAv, {
    hue: buyer.hue,
    label: buyer.initials,
    size: 36
  }), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "name"
  }, buyer.name), /*#__PURE__*/React.createElement("div", {
    className: "loc"
  }, buyer.loc), /*#__PURE__*/React.createElement("div", {
    className: "pill-tier"
  }, "Tier ", buyer.tier.replace('-class', ''))), /*#__PURE__*/React.createElement("button", {
    className: "swap"
  }, "Swap")), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "GSTIN"), /*#__PURE__*/React.createElement("span", {
    className: "v mono"
  }, buyer.gstin)), /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Bill to"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      textAlign: 'right',
      fontSize: 11.5,
      color: 'var(--cream-800)',
      lineHeight: 1.4
    }
  }, buyer.billAddr))), /*#__PURE__*/React.createElement(CreditBar, {
    buyer: buyer,
    addToCart: addToCart,
    isOver: isOver
  }), /*#__PURE__*/React.createElement("div", {
    className: "terms"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Sales agent"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, /*#__PURE__*/React.createElement(BAv, {
    hue: "ember",
    label: buyer.agent.avatar,
    size: 20
  }), buyer.agent.name)), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Payment"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, buyer.terms, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronDown",
    size: 11,
    className: "chev"
  })))));
}

/* ────────────────── LINES TABLE ──────────────────────────────────── */

/* A single line object:
   { sku, qty, price, discPct, taxPct, scheme?, stockWarn?, status? }
   status is 'normal' | 'changed' | 'added' | 'removed'  (edit mode)
*/

function calcLine(line) {
  const p = findP(line.sku);
  if (!p) return {
    gross: 0,
    net: 0
  };
  const base = p.list * line.qty;
  const disc = base * (line.discPct || 0) / 100;
  const net = base - disc;
  return {
    p,
    base,
    disc,
    net
  };
}
function LinesAddRow({
  open = true,
  searchTerm = '',
  highlightSku
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "doc-add-row",
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "row-num",
    style: {
      textAlign: 'center',
      color: 'var(--cream-600)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 13,
    stroke: 2
  })), /*#__PURE__*/React.createElement("div", {
    className: "search-cell"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 13,
    color: "var(--ember-700)"
  }), /*#__PURE__*/React.createElement("input", {
    defaultValue: searchTerm,
    placeholder: "Type product name, SKU, or scan a barcode\u2026",
    autoFocus: true
  }), /*#__PURE__*/React.createElement("span", {
    className: "kbd"
  }, "\u21B5 to add")), /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "Tab through \xB7 \u2318\u21B5 saves the line"), open && /*#__PURE__*/React.createElement("div", {
    className: "doc-search-pop"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Matches \xB7 pricelist ", BUYER.pricelist.name), DOC_PRODUCTS.filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5).map(p => /*#__PURE__*/React.createElement("div", {
    key: p.sku,
    className: 'item' + (p.sku === highlightSku ? ' is-hl' : '')
  }, /*#__PURE__*/React.createElement(BAv, {
    hue: p.hue,
    label: p.brand,
    size: 22
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, p.name), /*#__PURE__*/React.createElement("div", {
    className: "sku"
  }, p.sku)), /*#__PURE__*/React.createElement("div", {
    className: 'stock ' + (p.stock < 20 ? 'is-low' : '')
  }, p.stock, " in stock"), /*#__PURE__*/React.createElement("div", {
    className: "price"
  }, inr(p.list)), /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 12,
    color: "var(--cream-500)"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "foot"
  }, /*#__PURE__*/React.createElement("span", null, "Press ", /*#__PURE__*/React.createElement("kbd", null, "\u2191\u2193"), " to navigate, ", /*#__PURE__*/React.createElement("kbd", null, "\u21B5"), " to add, ", /*#__PURE__*/React.createElement("kbd", null, "esc"), " to close"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      color: 'var(--cream-700)'
    }
  }, DOC_PRODUCTS.length, " products"))));
}
function LineRow({
  line,
  n,
  mode = 'create'
}) {
  const {
    p,
    base,
    disc,
    net
  } = calcLine(line);
  if (!p) return null;
  const cls = [];
  if (line.status === 'changed') cls.push('is-changed');
  if (line.status === 'added') cls.push('is-added');
  if (line.status === 'removed') cls.push('is-removed');
  return /*#__PURE__*/React.createElement("tr", {
    className: cls.join(' ')
  }, /*#__PURE__*/React.createElement("td", {
    className: "row-num"
  }, n), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "prod"
  }, /*#__PURE__*/React.createElement(BAv, {
    hue: p.hue,
    label: p.brand,
    size: 30
  }), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, p.name, line.stockWarn && /*#__PURE__*/React.createElement("span", {
    className: "stock-warn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alertTriangle",
    size: 10,
    stroke: 2
  }), "Only ", line.stockAvail, " in stock")), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, /*#__PURE__*/React.createElement("span", null, p.sku), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, p.brand === 'VE' ? 'Vinikus' : p.brand === 'CS' ? 'Casa del Sol' : p.brand === 'MS' ? 'Marwadi Spice' : p.brand === 'AT' ? 'Asha Tea' : ''), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "HSN 2204")), line.scheme && /*#__PURE__*/React.createElement("div", {
    className: "row-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "scheme-tag"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkle",
    size: 9,
    stroke: 2
  }), line.scheme))))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "qty-cell"
  }, /*#__PURE__*/React.createElement("button", null, "\u2212"), /*#__PURE__*/React.createElement("input", {
    defaultValue: line.qty
  }), /*#__PURE__*/React.createElement("button", null, "+"))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, line.wasPrice && /*#__PURE__*/React.createElement("span", {
    className: "was"
  }, inr(line.wasPrice)), /*#__PURE__*/React.createElement("span", {
    className: 'editable' + (line.priceOverride ? ' is-override' : '')
  }, /*#__PURE__*/React.createElement("span", {
    className: "unit"
  }, "\u20B9"), inrNum(line.price || p.list))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "editable"
  }, /*#__PURE__*/React.createElement("span", null, line.discPct || 0), /*#__PURE__*/React.createElement("span", {
    className: "unit"
  }, "%"))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tax-cell"
  }, line.taxPct || 18, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)'
    }
  }, "%"))), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      fontSize: 13.5,
      color: 'var(--cream-900)'
    }
  }, line.wasNet && /*#__PURE__*/React.createElement("span", {
    className: "was"
  }, inr(line.wasNet)), inr(net)), /*#__PURE__*/React.createElement("td", {
    className: "row-actions"
  }, /*#__PURE__*/React.createElement("button", {
    title: "Remove"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash",
    size: 13
  }))));
}
function LinesTable({
  lines = [],
  mode = 'create',
  showAddRow = true,
  addRowProps = {},
  emptyMsg = null,
  readOnly = false
}) {
  const totalLines = lines.filter(l => l.status !== 'removed').length;
  return /*#__PURE__*/React.createElement("div", {
    className: "doc-lines"
  }, /*#__PURE__*/React.createElement("div", {
    className: "doc-lines-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, readOnly ? `${lines.length} line${lines.length === 1 ? '' : 's'}` : mode === 'edit' ? `${totalLines} lines · ${lines.filter(l => l.status === 'changed').length} changed · ${lines.filter(l => l.status === 'added').length} added · ${lines.filter(l => l.status === 'removed').length} removed` : totalLines === 0 ? 'Add your first product' : `${totalLines} line${totalLines === 1 ? '' : 's'}`), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, readOnly ? 'View only — clone or revise to make changes.' : 'Pricelist auto-applies. Click any price, qty, or discount to override.')), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), !readOnly && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 13
  }), "Import CSV"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 13
  }), "Bulk adjust"))), /*#__PURE__*/React.createElement("table", {
    className: "lines-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 28
    }
  }, "#"), /*#__PURE__*/React.createElement("th", null, "Product"), /*#__PURE__*/React.createElement("th", {
    className: "num",
    style: {
      width: 96
    }
  }, "Qty"), /*#__PURE__*/React.createElement("th", {
    className: "num",
    style: {
      width: 110
    }
  }, "Price"), /*#__PURE__*/React.createElement("th", {
    className: "num",
    style: {
      width: 78
    }
  }, "Disc"), /*#__PURE__*/React.createElement("th", {
    className: "num",
    style: {
      width: 70
    }
  }, "Tax"), /*#__PURE__*/React.createElement("th", {
    className: "num",
    style: {
      width: 108
    }
  }, "Amount"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 36
    }
  }))), /*#__PURE__*/React.createElement("tbody", null, showAddRow && !readOnly && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 8,
    style: {
      padding: 0,
      background: 'transparent'
    }
  }, /*#__PURE__*/React.createElement(LinesAddRow, addRowProps))), lines.length === 0 && !showAddRow && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 8,
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "lines-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "illus"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "package",
    size: 24,
    stroke: 1.25
  })), /*#__PURE__*/React.createElement("h4", null, "No products yet"), /*#__PURE__*/React.createElement("p", null, emptyMsg || 'Start typing in the search row above to add products.')))), lines.map((line, i) => /*#__PURE__*/React.createElement(LineRow, {
    key: i,
    line: line,
    n: i + 1,
    mode: mode
  })))), lines.length > 0 && !readOnly && /*#__PURE__*/React.createElement("div", {
    className: "doc-lines-foot"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, lines.reduce((s, l) => s + (l.status === 'removed' ? 0 : l.qty), 0)), " units across ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, totalLines), " SKU", totalLines === 1 ? '' : 's'), /*#__PURE__*/React.createElement("span", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", null, "Add notes for buyer"), /*#__PURE__*/React.createElement("button", null, "Add freight / packing"), /*#__PURE__*/React.createElement("button", null, "Add internal note")));
}

/* ────────────────── TOTALS + INSIGHTS ────────────────────────────── */

function TotalsCard({
  lines = [],
  discountFlat = 0,
  freight = 0,
  mode = 'create',
  diff = null,
  over = false
}) {
  let subtotal = 0,
    taxAmt = 0;
  lines.forEach(l => {
    if (l.status === 'removed') return;
    const {
      p,
      net
    } = calcLine(l);
    if (!p) return;
    subtotal += net;
    taxAmt += net * (l.taxPct || 18) / 100;
  });
  const afterDoc = subtotal - discountFlat;
  const taxOnAfterDoc = afterDoc / subtotal * taxAmt || 0;
  const total = afterDoc + taxOnAfterDoc + freight;
  const rounded = Math.round(total);
  const roundOff = rounded - total;
  const showZero = subtotal === 0;
  if (showZero) {
    return /*#__PURE__*/React.createElement("div", {
      className: "totals-card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "head"
    }, "Totals"), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "l"
    }, "Subtotal"), /*#__PURE__*/React.createElement("span", {
      className: "v",
      style: {
        color: 'var(--cream-600)'
      }
    }, "\u2014")), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "l"
    }, "Discount"), /*#__PURE__*/React.createElement("span", {
      className: "v",
      style: {
        color: 'var(--cream-600)'
      }
    }, "\u2014")), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "l"
    }, "Tax"), /*#__PURE__*/React.createElement("span", {
      className: "v",
      style: {
        color: 'var(--cream-600)'
      }
    }, "\u2014")), /*#__PURE__*/React.createElement("div", {
      className: "grand"
    }, /*#__PURE__*/React.createElement("span", {
      className: "l"
    }, "Total"), /*#__PURE__*/React.createElement("span", {
      className: "v",
      style: {
        color: 'var(--cream-500)'
      }
    }, "\u20B90")));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: 'totals-card' + (mode === 'edit' && diff ? ' is-diff' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "head"
  }, "Totals"), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Subtotal ", /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "(", lines.filter(l => l.status !== 'removed').length, " lines)")), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, diff && diff.subtotal && /*#__PURE__*/React.createElement("span", {
    className: "was"
  }, inr(diff.subtotal)), /*#__PURE__*/React.createElement("span", {
    className: "now"
  }, inr(subtotal)))), discountFlat > 0 && /*#__PURE__*/React.createElement("div", {
    className: "row is-discount"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Document discount"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "\u2212", inr(discountFlat))), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Tax (GST avg 18%)"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, diff && diff.tax && /*#__PURE__*/React.createElement("span", {
    className: "was"
  }, inr(diff.tax)), /*#__PURE__*/React.createElement("span", {
    className: "now"
  }, inr(Math.round(taxOnAfterDoc))))), freight > 0 && /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Freight & packing"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inr(freight))), Math.abs(roundOff) > 0.01 && /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Round off"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      color: 'var(--cream-700)'
    }
  }, roundOff > 0 ? '+' : '', roundOff.toFixed(2))), /*#__PURE__*/React.createElement("div", {
    className: "grand"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    className: 'v' + (over ? ' over' : '')
  }, diff && diff.total && /*#__PURE__*/React.createElement("span", {
    className: "was",
    style: {
      fontSize: 13
    }
  }, inr(diff.total)), inr(rounded))));
}
function InsightsCard({
  buyer = BUYER,
  schemeSavings = 0,
  creditState = 'ok',
  addToCart = 0
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "insights-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "head"
  }, "Why this price"), /*#__PURE__*/React.createElement("div", {
    className: "item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "tag",
    size: 11
  }), "Pricelist applied"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    className: "chip teal"
  }, buyer.pricelist.name), /*#__PURE__*/React.createElement("button", {
    className: "swap"
  }, "Swap")), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, "Auto-picked from ", /*#__PURE__*/React.createElement("strong", null, buyer.name), "'s cohort. ", buyer.pricelist.saving, ".")), schemeSavings > 0 && /*#__PURE__*/React.createElement("div", {
    className: "item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "gift",
    size: 11
  }), "Scheme savings"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, /*#__PURE__*/React.createElement("span", {
    className: "chip success"
  }, "\u2212", inr(schemeSavings), " saved")), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, /*#__PURE__*/React.createElement("strong", null, "Buy 12, get 1 free"), " applied on Vinikus Shiraz. ", /*#__PURE__*/React.createElement("strong", null, "Slab \u2265 \u20B920K"), " unlocked an extra 2%.")), /*#__PURE__*/React.createElement("div", {
    className: "item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, /*#__PURE__*/React.createElement(DocIcon, {
    name: "creditCard",
    size: 11
  }), "Credit status"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, creditState === 'ok' && /*#__PURE__*/React.createElement("span", {
    className: "chip success"
  }, "Healthy"), creditState === 'tight' && /*#__PURE__*/React.createElement("span", {
    className: "chip warning"
  }, "Tight"), creditState === 'over' && /*#__PURE__*/React.createElement("span", {
    className: "chip danger"
  }, "Over limit")), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, creditState === 'ok' && /*#__PURE__*/React.createElement(React.Fragment, null, "\u20B9", ((buyer.credit.limit - buyer.credit.used - addToCart) / 1000).toFixed(0), "K available after this. Average days-to-pay ", /*#__PURE__*/React.createElement("strong", null, "14 days"), ", last 6 months."), creditState === 'tight' && /*#__PURE__*/React.createElement(React.Fragment, null, "Buyer would be over ", /*#__PURE__*/React.createElement("strong", null, "80%"), " utilised after this. They normally pay in ", /*#__PURE__*/React.createElement("strong", null, "14 days"), ", so likely fine."), creditState === 'over' && /*#__PURE__*/React.createElement(React.Fragment, null, "This ", KIND.estimate.label.toLowerCase(), " pushes the buyer ", /*#__PURE__*/React.createElement("strong", null, "over their \u20B9", (buyer.credit.limit / 1e5).toFixed(1), "L limit"), ". Approval needed before send."))));
}

/* Right-rail "totals stack" — composes totals + insights + optional callout */
function TotalsStack({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "totals-stack"
  }, children);
}
Object.assign(window, {
  DocIcon,
  BAv,
  BUYER,
  DOC_PRODUCTS,
  KIND,
  findP,
  inr,
  inrShort,
  inrNum,
  calcLine,
  DocTop,
  DocTitleRow,
  DocStrip,
  BuyerCardEmpty,
  BuyerCardFilled,
  CreditBar,
  LinesAddRow,
  LineRow,
  LinesTable,
  TotalsCard,
  InsightsCard,
  TotalsStack
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/documents.jsx", error: String((e && e.message) || e) }); }

// dialogs/modals.jsx
try { (() => {
// dialogs/modals.jsx — 4 modal examples covering the full Tier 1 surface area.
//   1. Invite team member   — quick form (Settings → Team)
//   2. Discard changes      — dirty close warning
//   3. Archive pricelist    — simple destructive confirm
//   4. Delete brand         — typed-confirm for irreversible action

/* ───────────────────────────────────────────────────────────
   1 · INVITE TEAM MEMBER  (seller-side, Settings → Team)
   ─────────────────────────────────────────────────────────── */
function ModalInviteMember() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Settings",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Team \xB7 seller side"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title"
  }, "Invite a team member"), /*#__PURE__*/React.createElement("p", {
    className: "ov-sub",
    style: {
      marginTop: 4
    }
  }, "They\u2019ll get an email with a link to sign in. You can change their role any time.")), /*#__PURE__*/React.createElement("button", {
    className: "ov-close",
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Name ", /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "*")), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "Ravi Kapoor"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Work email ", /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "*")), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "ravi@dealflow.in",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Role"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, [{
    id: 'admin',
    label: 'Admin',
    on: false
  }, {
    id: 'manager',
    label: 'Manager',
    on: true
  }, {
    id: 'assistant',
    label: 'Assistant',
    on: false
  }].map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: {
      padding: '7px 14px',
      borderRadius: 8,
      border: '1px solid ' + (r.on ? 'var(--teal-500)' : 'var(--cream-400)'),
      background: r.on ? 'var(--teal-50)' : '#fff',
      color: r.on ? 'var(--teal-700)' : 'var(--cream-800)',
      fontSize: 12.5,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, r.label))), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Managers can publish catalogs and pricelists. Assistants are read\u2011only.")))), /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "mail",
    size: 14
  }), "Send invite"))));
}

/* ───────────────────────────────────────────────────────────
   2 · DISCARD CHANGES  (dirty close)
   ─────────────────────────────────────────────────────────── */
function ModalDiscardChanges() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Brands",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 540,
      background: '#fff',
      borderLeft: '1px solid var(--cream-300)',
      boxShadow: '-20px 0 50px rgba(20, 40, 35, 0.10)',
      filter: 'blur(1px) brightness(0.97)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal modal--narrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head modal-head--icon"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-icon modal-icon--warning"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alertTriangle",
    size: 18,
    stroke: 1.6
  })), /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "ov-title",
    style: {
      fontSize: 19
    }
  }, "Discard your changes?"), /*#__PURE__*/React.createElement("p", {
    className: "ov-sub",
    style: {
      marginTop: 6
    }
  }, "You\u2019ve started filling in ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "Add a brand"), ". Closing now means you lose what you typed \u2014 including the principal contact and GSTIN."))), /*#__PURE__*/React.createElement("div", {
    className: "modal-foot",
    style: {
      paddingTop: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Keep editing"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary",
    style: {
      color: 'var(--danger-700)',
      borderColor: 'var(--cream-400)'
    }
  }, "Discard"))));
}

/* ───────────────────────────────────────────────────────────
   3 · ARCHIVE PRICELIST  (simple destructive confirm)
   ─────────────────────────────────────────────────────────── */
function ModalArchivePricelist() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Brands",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head modal-head--icon"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-icon modal-icon--warning"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "archive",
    size: 18,
    stroke: 1.6
  })), /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "ov-title",
    style: {
      fontSize: 19
    }
  }, "Archive this pricelist?"), /*#__PURE__*/React.createElement("p", {
    className: "ov-sub",
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "North Delhi A\u2011class \xB7 Summer \u201926"), " will stop applying to new orders. Orders placed under it keep their prices."))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body",
    style: {
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "confirm-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "12 buyers will fall back to ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "Base pricelist"), " on their next order.")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "4 catalogs reference this pricelist \u2014 you\u2019ll be asked to re\u2011point them.")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "You can restore it from ", /*#__PURE__*/React.createElement("em", null, "Archived"), " any time.")))), /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary",
    style: {
      color: 'var(--danger-700)',
      borderColor: 'var(--cream-400)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "archive",
    size: 14
  }), "Archive pricelist"))));
}

/* ───────────────────────────────────────────────────────────
   4 · DELETE BRAND  (typed-confirm, irreversible)
   ─────────────────────────────────────────────────────────── */
function ModalDeleteBrand() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Brands",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "modal modal--wide"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head modal-head--icon"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-icon modal-icon--danger"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash",
    size: 18,
    stroke: 1.6
  })), /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "ov-title",
    style: {
      fontSize: 20
    }
  }, "Delete Vinikus Estates?"), /*#__PURE__*/React.createElement("p", {
    className: "ov-sub",
    style: {
      marginTop: 6
    }
  }, "This removes the brand, its 82 SKUs, and 6 months of order history from your tenant. Buyers who recently ordered will see a \u201Ccatalog updated\u201D notice.", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--danger-700)'
    }
  }, " This cannot be undone.")))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body",
    style: {
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "confirm-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "82 SKUs \xB7 \u20B947.3 L lifetime GMV")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "3 active catalogs will be archived")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "Tally export keeps historical line items, but new exports will skip this brand"))), /*#__PURE__*/React.createElement("div", {
    className: "typed-input",
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "Type ", /*#__PURE__*/React.createElement("code", null, "Vinikus Estates"), " to confirm."), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    placeholder: "Vinikus Estates",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, "Deleted by Phani Raju \xB7 permanent in 14 days"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-disabled",
    disabled: true
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash",
    size: 14
  }), "Delete brand"))));
}
Object.assign(window, {
  ModalInviteMember,
  ModalDiscardChanges,
  ModalArchivePricelist,
  ModalDeleteBrand
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/modals.jsx", error: String((e && e.message) || e) }); }

// dialogs/shared.jsx
try { (() => {
// dialogs/shared.jsx — Lucide-style icon set + tiny primitives used across all examples.

const Icon = ({
  name,
  size = 16,
  stroke = 1.5,
  color = 'currentColor',
  style
}) => {
  const paths = {
    x: /*#__PURE__*/React.createElement("path", {
      d: "M18 6L6 18M6 6l12 12"
    }),
    check: /*#__PURE__*/React.createElement("path", {
      d: "M20 6L9 17l-5-5"
    }),
    chevronRight: /*#__PURE__*/React.createElement("path", {
      d: "M9 18l6-6-6-6"
    }),
    chevronLeft: /*#__PURE__*/React.createElement("path", {
      d: "M15 18l-6-6 6-6"
    }),
    chevronDown: /*#__PURE__*/React.createElement("path", {
      d: "M6 9l6 6 6-6"
    }),
    search: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M21 21l-4.35-4.35"
    })),
    info: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 16v-4M12 8h.01"
    })),
    alertTriangle: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 9v4M12 17h.01"
    })),
    sparkle: /*#__PURE__*/React.createElement("path", {
      d: "M12 3l1.9 5.8H20l-4.95 3.6L17 18l-5-3.6L7 18l1.95-5.6L4 8.8h6.1z"
    }),
    plus: /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14M5 12h14"
    }),
    arrowRight: /*#__PURE__*/React.createElement("path", {
      d: "M5 12h14M13 5l7 7-7 7"
    }),
    user: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "7",
      r: "4"
    })),
    users: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "7",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
    })),
    mail: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 6l-10 7L2 6"
    })),
    trash: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 6h18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
    })),
    archive: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "3",
      width: "20",
      height: "5",
      rx: "1"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M4 8v12a2 2 0 002 2h12a2 2 0 002-2V8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 12h4"
    })),
    download: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 15V3"
    })),
    layers: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 2L2 7l10 5 10-5-10-5z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M2 17l10 5 10-5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M2 12l10 5 10-5"
    })),
    layoutGrid: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "3",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "14",
      width: "7",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "14",
      width: "7",
      height: "7",
      rx: "1"
    })),
    panelRight: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "18",
      height: "18",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M15 3v18"
    })),
    sliders: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M1 14h6M9 8h6M17 16h6"
    })),
    moreVertical: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "5",
      r: "1"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "1"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "19",
      r: "1"
    })),
    package: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"
    })),
    fileText: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 2v6h6M16 13H8M16 17H8M10 9H8"
    })),
    ticket: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 9a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 100-4V9z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13 5v14",
      strokeDasharray: "2 2"
    })),
    barChart: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 20V10M18 20V4M6 20v-4"
    })),
    chevronsRight: /*#__PURE__*/React.createElement("path", {
      d: "M13 17l5-5-5-5M6 17l5-5-5-5"
    })
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    "aria-hidden": "true"
  }, paths[name]);
};

/* ───────────────────────────────────────────────────────────
   Fake-cockpit page chrome (sidebar nav, topbar) used to
   place modal/slide-over examples in plausible context.
   ─────────────────────────────────────────────────────────── */
function FakeCockpit({
  section = 'Brands',
  dimmed = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      filter: dimmed ? 'blur(1.5px) brightness(0.96)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--cream-50)',
      borderRight: '1px solid var(--cream-300)',
      padding: '18px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 6px 14px',
      borderBottom: '1px solid var(--cream-300)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 26,
      height: 26,
      borderRadius: 6,
      background: 'var(--teal-500)',
      color: 'var(--cream-50)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontSize: 13,
      fontWeight: 500
    }
  }, "DF"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 15,
      fontWeight: 500
    }
  }, "DealFlow")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      paddingTop: 12
    }
  }, [{
    i: 'barChart',
    label: 'Dashboard'
  }, {
    i: 'layers',
    label: 'Brands'
  }, {
    i: 'package',
    label: 'Products'
  }, {
    i: 'users',
    label: 'Customers'
  }, {
    i: 'ticket',
    label: 'Catalogs'
  }, {
    i: 'fileText',
    label: 'Pricelists'
  }, {
    i: 'layoutGrid',
    label: 'Cohorts'
  }].map(item => /*#__PURE__*/React.createElement("div", {
    key: item.label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 10px',
      borderRadius: 8,
      background: section === item.label ? 'var(--teal-500)' : 'transparent',
      color: section === item.label ? 'var(--cream-50)' : 'var(--cream-800)',
      fontSize: 13,
      fontWeight: 500
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: item.i,
    size: 15,
    stroke: 1.5
  }), /*#__PURE__*/React.createElement("span", null, item.label))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      borderBottom: '1px solid var(--cream-300)',
      background: 'rgba(250, 247, 242, 0.85)',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '7px 12px',
      background: '#fff',
      border: '1px solid var(--cream-300)',
      borderRadius: 8,
      color: 'var(--cream-600)',
      fontSize: 13,
      width: 280
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Search brands, products, orders\u2026")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'var(--ember-100)',
      color: 'var(--ember-700)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 600,
      border: '1px solid var(--ember-200)'
    }
  }, "PR")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      flex: 1,
      minHeight: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 500,
      color: 'var(--cream-900)'
    }
  }, section), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--cream-700)',
      fontSize: 13,
      marginTop: 6
    }
  }, section === 'Brands' && '5 brands · 482 SKUs across portfolio', section === 'Customers' && '124 buyers · 78 active this month', section === 'Settings' && 'Team · Tally · Notifications'), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      background: '#fff',
      border: '1px solid var(--cream-300)',
      borderRadius: 14,
      overflow: 'hidden'
    }
  }, (section === 'Brands' ? ['Vinikus Estates', 'Casa del Sol', 'Marwadi Spice Co.', 'Asha Tea Garden', 'Konkan Cellars'] : section === 'Customers' ? ['Bharat Stores · Karol Bagh', 'Gupta Wines · CR Park', 'Sehgal & Sons · Greater Kailash', 'Patel Provisions · Janakpuri', 'Singh Liquor Mart · Pitampura'] : ['Phani Raju · admin@dealflow.in', 'Anita Sharma · anita@dealflow.in', 'Ravi Kapoor · ravi@dealflow.in']).map((row, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: '14px 18px',
      borderBottom: '1px solid var(--cream-300)',
      fontSize: 13.5,
      color: 'var(--cream-900)',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `b-av b-av--${['teal', 'ember', 'cream'][i % 3]}`,
    style: {
      width: 28,
      height: 28,
      borderRadius: 6,
      fontSize: 10
    }
  }, row.split(' ').map(w => w[0]).slice(0, 2).join('')), /*#__PURE__*/React.createElement("div", null, row)))))));
}

/* Inline label + value (for confirm modals) */
function MetaRow({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--cream-900)',
      fontWeight: 500
    }
  }, value));
}
Object.assign(window, {
  Icon,
  FakeCockpit,
  MetaRow
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/shared.jsx", error: String((e && e.message) || e) }); }

// dialogs/slideovers.jsx
try { (() => {
// dialogs/slideovers.jsx — 4 slide-over examples:
//   1. Add a brand — search-as-you-type with master suggestions (no upfront fork)
//   2. Add a brand — after master selected (imported state)
//   3. Add a customer — full form, no master concept
//   4. Add a brand — STACKED inner picker for default cohort

/* ───────────────────────────────────────────────────────────
   1 · ADD A BRAND — empty / typing state with master matches
   ─────────────────────────────────────────────────────────── */
function SOAddBrandSearch() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Brands",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim",
    style: {
      background: 'rgba(26,26,26,0.24)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "slideover"
  }, /*#__PURE__*/React.createElement("div", {
    className: "slideover-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Brands"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title"
  }, "Add a brand"), /*#__PURE__*/React.createElement("div", {
    className: "slideover-head-meta"
  }, /*#__PURE__*/React.createElement("span", null, "Start with the name. We\u2019ll match it against the master directory."))), /*#__PURE__*/React.createElement("button", {
    className: "ov-close",
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Brand name"), /*#__PURE__*/React.createElement("div", {
    className: "so-section-sub"
  }, "Required")), /*#__PURE__*/React.createElement("div", {
    className: "combo"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-input combo-input--focus"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 14,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("input", {
    defaultValue: "Vinik",
    autoFocus: true
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--cream-600)',
      fontFamily: 'var(--font-mono)'
    }
  }, "3 matches")), /*#__PURE__*/React.createElement("div", {
    className: "combo-pop"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-pop-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-pop-eyebrow"
  }, "Master directory \xB7 import & prefill"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item combo-item--hl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--teal"
  }, "VE"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-item-name"
  }, "Vinikus Estates"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-sub"
  }, "Wine \xB7 Maharashtra \xB7 82 SKUs \xB7 GSTIN 27AABC\u2026")), /*#__PURE__*/React.createElement("span", {
    className: "combo-item-badge"
  }, "Verified")), /*#__PURE__*/React.createElement("div", {
    className: "combo-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--cream"
  }, "VC"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-item-name"
  }, "Vinika Coffee Roasters"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-sub"
  }, "Coffee \xB7 Karnataka \xB7 24 SKUs")), /*#__PURE__*/React.createElement("span", {
    className: "combo-item-badge"
  }, "Verified")), /*#__PURE__*/React.createElement("div", {
    className: "combo-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--ember"
  }, "VK"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-item-name"
  }, "Vinikalp Spirits"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-sub"
  }, "Spirits \xB7 Goa \xB7 47 SKUs")), /*#__PURE__*/React.createElement("span", {
    className: "combo-item-badge"
  }, "Verified"))), /*#__PURE__*/React.createElement("div", {
    className: "combo-create"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 13,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("span", null, "Keep typing to create custom brand ", /*#__PURE__*/React.createElement("strong", null, "\u201CVinik\u201D"), " \xB7 press"), /*#__PURE__*/React.createElement("kbd", null, "Enter")))), /*#__PURE__*/React.createElement("div", {
    className: "field-hint",
    style: {
      marginTop: 6
    }
  }, "Picking a master brand pre\u2011fills the principal, GSTIN, and category fields. Custom brands stay private to your tenant."))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 13,
    color: "var(--cream-600)"
  }), "Step 1 \u2014 basics"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-disabled",
    disabled: true
  }, "Continue"))));
}

/* ───────────────────────────────────────────────────────────
   2 · ADD A BRAND — master selected, form filled out
   ─────────────────────────────────────────────────────────── */
function SOAddBrandFilled() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Brands",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim",
    style: {
      background: 'rgba(26,26,26,0.24)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "slideover"
  }, /*#__PURE__*/React.createElement("div", {
    className: "slideover-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Brands"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title"
  }, "Add a brand"), /*#__PURE__*/React.createElement("div", {
    className: "slideover-head-meta"
  }, /*#__PURE__*/React.createElement("span", null, "Imported from master \xB7 adjust anything before saving."))), /*#__PURE__*/React.createElement("button", {
    className: "ov-close",
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "imported-banner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ib-icon"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16,
    stroke: 1.75
  })), /*#__PURE__*/React.createElement("div", {
    className: "ib-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ib-name"
  }, "Imported from master \xB7 Vinikus Estates"), /*#__PURE__*/React.createElement("div", {
    className: "ib-sub"
  }, "82 SKUs available \xB7 last verified 12 days ago")), /*#__PURE__*/React.createElement("button", {
    className: "ib-clear"
  }, "Clear")), /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Identity"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field field-full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Brand name ", /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "*")), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "Vinikus Estates"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Category"), /*#__PURE__*/React.createElement("select", {
    className: "field-select",
    defaultValue: "Wine"
  }, /*#__PURE__*/React.createElement("option", null, "Wine"), /*#__PURE__*/React.createElement("option", null, "Spirits"), /*#__PURE__*/React.createElement("option", null, "Beer"))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Region"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "Nashik, MH"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Principal contact"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Name"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "Anand Mehrotra"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Phone"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "+91 98203 11842",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Defaults"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field field-full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Default cohort"), /*#__PURE__*/React.createElement("div", {
    className: "combo-input",
    style: {
      justifyContent: 'space-between'
    },
    "data-comment-anchor": "64a7b35ba8-div-177-17"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)'
    }
  }, "Pick a cohort"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronRight",
    size: 14,
    color: "var(--cream-700)"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Opens a picker \u2014 keep typing or browse."))))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 13,
    color: "var(--success-500)"
  }), "Draft saved \xB7 2 sec ago"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Save brand", /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    stroke: 1.75
  })))));
}

/* ───────────────────────────────────────────────────────────
   3 · ADD A CUSTOMER — long-form, no master concept
   ─────────────────────────────────────────────────────────── */
function SOAddCustomer() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Customers",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim",
    style: {
      background: 'rgba(26,26,26,0.24)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "slideover",
    style: {
      width: 540
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "slideover-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Customers"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title"
  }, "Add a buyer"), /*#__PURE__*/React.createElement("div", {
    className: "slideover-head-meta"
  }, /*#__PURE__*/React.createElement("span", null, "You can add team members and shipping addresses after the buyer is created."))), /*#__PURE__*/React.createElement("button", {
    className: "ov-close",
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Identity"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field field-full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Business name ", /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "*")), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "Bharat Stores"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "City"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "Karol Bagh, Delhi"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Tier"), /*#__PURE__*/React.createElement("select", {
    className: "field-select",
    defaultValue: "A"
  }, /*#__PURE__*/React.createElement("option", {
    value: "A"
  }, "Tier A"), /*#__PURE__*/React.createElement("option", {
    value: "B"
  }, "Tier B"), /*#__PURE__*/React.createElement("option", {
    value: "C"
  }, "Tier C"))))), /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Primary contact"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Name"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "Suresh Bharat"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Role"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "Proprietor"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Phone ", /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "*")), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "+91 98101 22433",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Email"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    placeholder: "optional",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Tax & terms"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "GSTIN"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "07AABCV1234L1Z5",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Payment terms"), /*#__PURE__*/React.createElement("select", {
    className: "field-select",
    defaultValue: "Net 21"
  }, /*#__PURE__*/React.createElement("option", null, "Cash on delivery"), /*#__PURE__*/React.createElement("option", null, "Net 14"), /*#__PURE__*/React.createElement("option", null, "Net 21"), /*#__PURE__*/React.createElement("option", null, "Net 30"))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Credit limit (\u20B9)"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "2,50,000",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Default cohort"), /*#__PURE__*/React.createElement("div", {
    className: "combo-input",
    style: {
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)'
    }
  }, "Pick a cohort"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronRight",
    size: 14,
    color: "var(--cream-700)"
  })))))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 13,
    color: "var(--success-500)"
  }), "Draft saved \xB7 4 sec ago"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Save buyer"))));
}

/* ───────────────────────────────────────────────────────────
   4 · STACKED PICKER — Default cohort, opened from Add a brand
   ─────────────────────────────────────────────────────────── */
function SOStackedPicker() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Brands",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim",
    style: {
      background: 'rgba(26,26,26,0.30)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "slideover-under",
    style: {
      width: 540
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "slideover-head",
    style: {
      opacity: 0.45
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Brands"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title"
  }, "Add a brand")))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-stack",
    style: {
      width: 540
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "slideover-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("button", {
    className: "back-link"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronLeft",
    size: 13
  }), "Back to Add a brand"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title",
    style: {
      marginTop: 6
    }
  }, "Pick a default cohort"), /*#__PURE__*/React.createElement("div", {
    className: "slideover-head-meta"
  }, /*#__PURE__*/React.createElement("span", null, "The cohort that catalogs and pricelists for this brand will default to."))), /*#__PURE__*/React.createElement("button", {
    className: "ov-close",
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "picker-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 14,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Search cohorts\u2026"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--cream-600)',
      fontFamily: 'var(--font-mono)'
    }
  }, "5 cohorts")), /*#__PURE__*/React.createElement("div", {
    className: "picker-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "picker-row picker-row--selected"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--ember"
  }, "ND"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "picker-row-name"
  }, "North Delhi \xB7 A\u2011class"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-sub"
  }, "12 buyers \xB7 default price list ", /*#__PURE__*/React.createElement("span", {
    className: "picker-row-mono"
  }, "PL\u2011NDA\u201101"))), /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14,
    color: "var(--ember-500)",
    stroke: 2
  })), /*#__PURE__*/React.createElement("div", {
    className: "picker-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--teal"
  }, "SD"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "picker-row-name"
  }, "South Delhi \xB7 A\u2011class"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-sub"
  }, "9 buyers \xB7 default price list ", /*#__PURE__*/React.createElement("span", {
    className: "picker-row-mono"
  }, "PL\u2011SDA\u201101")))), /*#__PURE__*/React.createElement("div", {
    className: "picker-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--cream"
  }, "NC"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "picker-row-name"
  }, "NCR \xB7 B\u2011class"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-sub"
  }, "31 buyers \xB7 default price list ", /*#__PURE__*/React.createElement("span", {
    className: "picker-row-mono"
  }, "PL\u2011NCR\u201102")))), /*#__PURE__*/React.createElement("div", {
    className: "picker-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--teal"
  }, "GZ"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "picker-row-name"
  }, "Ghaziabad \xB7 all tiers"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-sub"
  }, "18 buyers \xB7 default price list ", /*#__PURE__*/React.createElement("span", {
    className: "picker-row-mono"
  }, "PL\u2011GZB\u201101")))), /*#__PURE__*/React.createElement("div", {
    className: "picker-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--ember"
  }, "FR"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "picker-row-name"
  }, "Faridabad \xB7 pilot"), /*#__PURE__*/React.createElement("div", {
    className: "picker-row-sub"
  }, "4 buyers \xB7 default price list ", /*#__PURE__*/React.createElement("span", {
    className: "picker-row-mono"
  }, "PL\u2011FRB\u201101")))))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status"
  }, "Selecting ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "North Delhi \xB7 A\u2011class")), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Use this cohort"))));
}
Object.assign(window, {
  SOAddBrandSearch,
  SOAddBrandFilled,
  SOAddCustomer,
  SOStackedPicker,
  SOPickerFlipUp
});

/* ───────────────────────────────────────────────────────────
   5 · PICKER FLIP-UP — field near bottom of a scrolled slide-over.
   Demonstrates how an inline combobox picker behaves when there
   isn't room below the anchor. Two rules:
     (a) Popover anchors below by default, flips ABOVE the field
         when there's < 280px between the field and the panel foot.
     (b) The popover itself never scrolls past 220px tall — if the
         match set is longer, promote to the stacked picker
         (Tier 2 · sibling pattern shown in artboard 4).
   ─────────────────────────────────────────────────────────── */
function SOPickerFlipUp() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ab"
  }, /*#__PURE__*/React.createElement(FakeCockpit, {
    section: "Customers",
    dimmed: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "ab-scrim",
    style: {
      background: 'rgba(26,26,26,0.24)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "slideover",
    style: {
      width: 540
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "slideover-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "title-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ov-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "Customers"), /*#__PURE__*/React.createElement("h2", {
    className: "ov-title"
  }, "Add a buyer"), /*#__PURE__*/React.createElement("div", {
    className: "slideover-head-meta"
  }, /*#__PURE__*/React.createElement("span", null, "Scrolled past Identity & Primary contact \u2014 picker opens upward."))), /*#__PURE__*/React.createElement("button", {
    className: "ov-close",
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-body-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "slideover-body-scroll-fade-top"
  }), /*#__PURE__*/React.createElement("div", {
    className: "slideover-scrollbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "thumb",
    style: {
      top: '58%',
      height: '32%'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      opacity: 0.55,
      marginTop: -40
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Tax & terms"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "GSTIN"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "07AABCV1234L1Z5",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "PAN"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "AABCV1234L",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Payment terms"), /*#__PURE__*/React.createElement("select", {
    className: "field-select",
    defaultValue: "Net 21"
  }, /*#__PURE__*/React.createElement("option", null, "Net 21"))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Credit limit (\u20B9)"), /*#__PURE__*/React.createElement("input", {
    className: "field-input",
    defaultValue: "2,50,000",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "so-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Addresses"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field field-full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Billing address"), /*#__PURE__*/React.createElement("textarea", {
    className: "field-textarea",
    defaultValue: "Shop 14, Bharat Market, Karol Bagh, New Delhi 110005"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "so-section",
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "so-section-title"
  }, "Defaults"), /*#__PURE__*/React.createElement("div", {
    className: "field-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field field-full"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Default cohort ", /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "*")), /*#__PURE__*/React.createElement("div", {
    className: "combo"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-input combo-input--focus",
    style: {
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      color: 'var(--cream-900)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 14,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "nor"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 1,
      height: 14,
      background: 'var(--ember-400)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--cream-600)',
      fontFamily: 'var(--font-mono)'
    }
  }, "3 matches")), /*#__PURE__*/React.createElement("div", {
    className: "combo-pop combo-pop--up"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-pop-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 13,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("input", {
    defaultValue: "nor"
  }), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, "3 / 12")), /*#__PURE__*/React.createElement("div", {
    className: "combo-pop-list",
    style: {
      maxHeight: 168
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-pop-section",
    style: {
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-item combo-item--hl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--ember"
  }, "ND"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-item-name"
  }, "North Delhi \xB7 A\u2011class"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-sub"
  }, "12 buyers \xB7 PL\u2011NDA\u201101")), /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 13,
    color: "var(--ember-500)",
    stroke: 2
  })), /*#__PURE__*/React.createElement("div", {
    className: "combo-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--teal"
  }, "NC"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-item-name"
  }, "NCR \xB7 B\u2011class"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-sub"
  }, "31 buyers \xB7 PL\u2011NCR\u201102"))), /*#__PURE__*/React.createElement("div", {
    className: "combo-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-av b-av--cream"
  }, "NO"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "combo-item-name"
  }, "Noida \xB7 pilot"), /*#__PURE__*/React.createElement("div", {
    className: "combo-item-sub"
  }, "8 buyers \xB7 PL\u2011NOI\u201101"))))), /*#__PURE__*/React.createElement("div", {
    className: "combo-create",
    style: {
      borderTop: '1px solid var(--cream-300)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronsRight",
    size: 13,
    color: "var(--cream-700)"
  }), /*#__PURE__*/React.createElement("span", null, "Don\u2019t see it? ", /*#__PURE__*/React.createElement("strong", null, "Browse all cohorts"), " opens a stacked picker.")))), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Picker anchors above the field when there\u2019s less than 280px below \u2014 keeps the foot reachable."))))), /*#__PURE__*/React.createElement("div", {
    className: "slideover-body-scroll-fade-bot"
  })), /*#__PURE__*/React.createElement("div", {
    className: "slideover-foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 13,
    color: "var(--success-500)"
  }), "Draft saved \xB7 6 sec ago"), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Save buyer"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 18,
      bottom: 18,
      background: 'var(--teal-50)',
      border: '1px solid var(--teal-100)',
      borderRadius: 10,
      padding: '10px 14px',
      maxWidth: 340,
      fontSize: 12.5,
      color: 'var(--teal-700)',
      lineHeight: 1.5,
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--teal-900)'
    }
  }, "Rule."), ' ', "Inline popover flips up when the anchor has less than 280\xA0px below it. If matches exceed 5 rows or labels wrap, promote to a stacked picker (Tier 2, sibling artboard)."));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/slideovers.jsx", error: String((e && e.message) || e) }); }

// dialogs/system.jsx
try { (() => {
// dialogs/system.jsx — System rules + decision matrix.
// One large artboard that documents the WHEN of the system,
// so the three example tiers below have a clear authority.

function SystemRulesCard() {
  return /*#__PURE__*/React.createElement("div", {
    className: "docs-shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "docs-head"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: 'var(--cream-700)',
      marginBottom: 8
    }
  }, "Dialogs & overlays \xB7 System"), /*#__PURE__*/React.createElement("h1", null, "Three tiers. Decide by data\u2011context, not field count."), /*#__PURE__*/React.createElement("p", {
    className: "sub"
  }, "Modals confirm or capture a tiny payload. Slide\u2011overs hold the full form for one entity. Composers take over the page when the work needs you to ", /*#__PURE__*/React.createElement("em", null, "see"), " other data (filter a population, edit values per row, review before committing). The deciding question is never \u201Chow many fields\u201D \u2014 it\u2019s \u201Cdoes the user need to look at other data to fill this in?\u201D")), /*#__PURE__*/React.createElement("div", {
    className: "tier-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tier-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tag"
  }, "Tier 1"), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, "Modal"), /*#__PURE__*/React.createElement("div", {
    className: "desc"
  }, "Centered, blocking, \u2264 30 seconds of work. Confirmations, destructive actions, and invites with three or fewer fields. Closes on Escape and on backdrop click \u2014 never use one to hold work a user could lose."), /*#__PURE__*/React.createElement("div", {
    className: "uses"
  }, /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "Invite a tenant team member (name, email, role)"), /*#__PURE__*/React.createElement("li", null, "Archive / delete confirmations"), /*#__PURE__*/React.createElement("li", null, "Typed\u2011confirm for irreversible actions"), /*#__PURE__*/React.createElement("li", null, "\u201CDiscard changes?\u201D warnings on dirty close"))), /*#__PURE__*/React.createElement("div", {
    className: "specs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Width"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "408 / 460 / 540 px")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Radius"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "20 px")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Scrim"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "cream\u2011900 @ 42%, 2px blur")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Dismiss"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "Esc \xB7 scrim \xB7 close X")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Route"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "None \u2014 query param only")))), /*#__PURE__*/React.createElement("div", {
    className: "tier-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tag"
  }, "Tier 2"), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, "Slide\u2011over panel"), /*#__PURE__*/React.createElement("div", {
    className: "desc"
  }, "Right\u2011edge drawer for ", /*#__PURE__*/React.createElement("em", null, "creating"), " a single entity. Holds the full form (identity, contacts, commercials, internal notes) without taking the user off the list they came from. Edit lives on the Detail page \u2014 never re\u2011uses this surface."), /*#__PURE__*/React.createElement("div", {
    className: "uses"
  }, /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "Add a brand (with master search inline)"), /*#__PURE__*/React.createElement("li", null, "Add a product (with master search inline)"), /*#__PURE__*/React.createElement("li", null, "Add a customer (buyer)"), /*#__PURE__*/React.createElement("li", null, "Pickers nested inside (stack one panel over another)"))), /*#__PURE__*/React.createElement("div", {
    className: "specs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Width"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "540 px (640 if wide form)")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Radius"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "0 (flush right edge)")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Scrim"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "cream\u2011900 @ 24% under panel")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Dismiss"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "Esc \xB7 scrim \xB7 close \u2192 \u201CDiscard?\u201D")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Route"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "/brands?new=true")))), /*#__PURE__*/React.createElement("div", {
    className: "tier-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tag"
  }, "Tier 3"), /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, "Composer (full page)"), /*#__PURE__*/React.createElement("div", {
    className: "desc"
  }, "A dedicated route that takes over the content area when the user must filter a population, edit values per row, and review before committing. Three\u2011column rhythm: filters \xB7 data \xB7 summary. Auto\u2011saves to draft every few seconds \u2014 the back button works."), /*#__PURE__*/React.createElement("div", {
    className: "uses"
  }, /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "Add a pricelist (filter SKUs, edit prices, review)"), /*#__PURE__*/React.createElement("li", null, "Add a catalog (filter products, set order, review)"), /*#__PURE__*/React.createElement("li", null, "Add a cohort (filter buyers, review membership)"), /*#__PURE__*/React.createElement("li", null, "Any \u201Cpublish\u201D flow that needs side\u2011by\u2011side data"))), /*#__PURE__*/React.createElement("div", {
    className: "specs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Width"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "Full content area (\u2265 1100 px)")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Layout"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "260 \xB7 flex \xB7 320")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Header"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "Breadcrumb \xB7 title \xB7 stepper")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Dismiss"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "Back button \u2014 draft persists")), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Route"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "/pricelists/new"))))), /*#__PURE__*/React.createElement("div", {
    className: "matrix"
  }, /*#__PURE__*/React.createElement("table", null, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: '38%'
    }
  }, "If the user\u2026"), /*#__PURE__*/React.createElement("th", null, "\u2026use this tier"), /*#__PURE__*/React.createElement("th", null, "Because"))), /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Confirms or rejects something they\u2019ve already triggered"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-modal"
  }, "Modal")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Decision, not work. Esc and scrim are safe to use.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Enters \u2264 3 fields with no need to look at other data"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-modal"
  }, "Modal")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Invite, rename, schedule \u2014 keep the surrounding page visible.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Performs an irreversible action that could affect live orders"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-modal"
  }, "Modal"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-700)',
      fontSize: 12,
      marginLeft: 4
    }
  }, "(typed\u2011confirm)")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Force a deliberate pause. Type the name to enable Delete.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Creates one new entity (brand, product, customer)"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-slide"
  }, "Slide\u2011over")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Full form, no context loss from the list they came from.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Needs to pick from a long list mid\u2011form (cohort, master brand)"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-slide"
  }, "Slide\u2011over"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-700)',
      fontSize: 12,
      marginLeft: 4
    }
  }, "(stacked)")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Push a second panel; back arrow returns. No third level.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Edits an existing entity"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-skip"
  }, "Detail page")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Edits stay on the Detail page. Slide\u2011over is create\u2011only.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Filters a population and decides something per row"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-comp"
  }, "Composer")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Needs filters \xB7 data \xB7 summary side by side. Drafts persist.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Adds a buyer\u2011side team member to a customer record"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-skip"
  }, "Inline row")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Name + phone + role lives in the Customer\u2019s Team tab as an inline row.")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "q"
  }, "Closes a form with unsaved changes"), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, /*#__PURE__*/React.createElement("span", {
    className: "verdict verdict-modal"
  }, "Modal")), /*#__PURE__*/React.createElement("td", {
    className: "a"
  }, "Always confirm \u201CDiscard changes?\u201D \u2014 Phani lost work once and we don\u2019t do that."))))));
}
Object.assign(window, {
  SystemRulesCard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "dialogs/system.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer-app/Screens.jsx
try { (() => {
// ui_kits/buyer-app/Screens.jsx
// All buyer-app screens with the new structure:
// - 4 landing tabs: Home (dashboard) / Catalog / Orders / Profile
// - Deep screens (Product, Cart, Placed) hide the tab bar
// - Sticky header + sticky footer via flex layout in .b-app
// - "View Cart" floating button on catalog + product when items > 0

// ---------- shared helpers ----------
function Bottle({
  hue
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `b-bottle ${hue}`
  });
}
function PageHeader({
  title,
  left,
  right,
  flat = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'b-header' + (flat ? ' is-flat' : '')
  }, left || /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-header-title"
  }, title), right || /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36
    }
  }));
}
function SectionRow({
  title,
  more,
  onMore
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "b-section-row"
  }, /*#__PURE__*/React.createElement("h3", null, title), more && /*#__PURE__*/React.createElement("span", {
    className: "more",
    onClick: onMore
  }, more, /*#__PURE__*/React.createElement(BIconChevR, {
    size: 14
  })));
}

// ===================================================================
//  LOGIN  (no tab bar)
// ===================================================================
function Login({
  onContinue
}) {
  const [step, setStep] = React.useState('phone');
  return /*#__PURE__*/React.createElement("div", {
    className: "b-login"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-login-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-login-logo"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "28",
    height: "28",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", null, "DealFlow")), /*#__PURE__*/React.createElement("h1", {
    className: "b-login-headline"
  }, "A curated shelf,", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("em", null, "from your distributor."))), /*#__PURE__*/React.createElement("div", {
    className: "b-login-form"
  }, step === 'phone' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Sign in with phone"), /*#__PURE__*/React.createElement("div", {
    className: "b-phone-input"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cc"
  }, "+91"), /*#__PURE__*/React.createElement("input", {
    type: "tel",
    defaultValue: "98103 47281",
    inputMode: "numeric"
  })), /*#__PURE__*/React.createElement("button", {
    className: "b-cta",
    onClick: () => setStep('otp')
  }, /*#__PURE__*/React.createElement("span", null, "Send OTP on WhatsApp"), /*#__PURE__*/React.createElement(BIconChevR, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-login-help"
  }, "No passwords. We'll send a one-time code to verify it's you.")), step === 'otp' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Code sent to +91 98103 47281"), /*#__PURE__*/React.createElement("div", {
    className: "b-otp"
  }, /*#__PURE__*/React.createElement("input", {
    maxLength: "1",
    defaultValue: "3"
  }), /*#__PURE__*/React.createElement("input", {
    maxLength: "1",
    defaultValue: "7"
  }), /*#__PURE__*/React.createElement("input", {
    maxLength: "1",
    defaultValue: "1"
  }), /*#__PURE__*/React.createElement("input", {
    maxLength: "1",
    defaultValue: "9"
  })), /*#__PURE__*/React.createElement("button", {
    className: "b-cta",
    onClick: onContinue
  }, /*#__PURE__*/React.createElement("span", null, "Continue"), /*#__PURE__*/React.createElement(BIconChevR, {
    size: 16
  })), /*#__PURE__*/React.createElement("button", {
    className: "b-cta ghost",
    onClick: () => setStep('phone')
  }, "Use a different number"))));
}

// ===================================================================
//  HOME — buyer dashboard (landing tab)
// ===================================================================
function Home({
  onOpenCatalog,
  onOpenProduct,
  onGoOrders
}) {
  const dist = BUYER_DISTRIBUTORS;
  const reorder = BUYER_DATA.products.filter(p => p.featured).slice(0, 4);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "b-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-page-head-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-eyebrow"
  }, "Good evening, Rajan"), /*#__PURE__*/React.createElement("h1", {
    className: "b-page-title",
    style: {
      fontSize: 26
    }
  }, "Your shelf, this month.")), /*#__PURE__*/React.createElement("div", {
    className: "actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "b-header-action",
    "aria-label": "Notifications"
  }, /*#__PURE__*/React.createElement(BIconBell, {
    size: 17
  })))), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-kpi feature"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-label"
  }, "Spend this year"), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-value"
  }, "\u20B918,54,000"), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-hint"
  }, "Across 3 distributors \xB7 47 orders")), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-label"
  }, "Open orders"), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-value"
  }, "4"), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-hint"
  }, "2 awaiting dispatch")), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-label"
  }, "Available credit"), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-value"
  }, "\u20B91,65,800"), /*#__PURE__*/React.createElement("div", {
    className: "b-kpi-hint"
  }, "of \u20B92,50,000 limit"))), /*#__PURE__*/React.createElement("div", {
    className: "b-section"
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "Your distributors",
    more: "See all"
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-dist-list"
  }, dist.map(d => /*#__PURE__*/React.createElement("div", {
    className: "b-dist-row",
    key: d.id
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-dist-avatar"
  }, d.initials), /*#__PURE__*/React.createElement("div", {
    className: "b-dist-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-dist-name"
  }, d.name), /*#__PURE__*/React.createElement("div", {
    className: "b-dist-sub"
  }, d.city, " \xB7 last order ", d.lastOrder)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "b-dist-spend"
  }, inrB(d.spend)), /*#__PURE__*/React.createElement("div", {
    className: 'b-dist-trend ' + (d.trend.startsWith('−') || d.trend.startsWith('-') ? 'down' : 'up')
  }, d.trend)))))), /*#__PURE__*/React.createElement("div", {
    className: "b-section"
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "Order again",
    more: "Browse all",
    onMore: onOpenCatalog
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-hscroll"
  }, reorder.map(p => /*#__PURE__*/React.createElement("div", {
    className: "b-reorder-card",
    key: p.id,
    onClick: () => onOpenProduct(p.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: `b-product-photo b-product-photo-${p.hue}`
  }, /*#__PURE__*/React.createElement(Bottle, {
    hue: p.hue
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-reorder-card-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-reorder-name"
  }, p.name, p.vintage ? ` ${p.vintage}` : ''), /*#__PURE__*/React.createElement("div", {
    className: "b-reorder-price"
  }, inrB(p.price), " / unit")))))), /*#__PURE__*/React.createElement("div", {
    className: "b-section"
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "New catalogs",
    more: "See all",
    onMore: onOpenCatalog
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-hscroll"
  }, BUYER_DATA.catalogs.map(c => /*#__PURE__*/React.createElement("div", {
    className: "b-catalog-mini",
    key: c.id,
    onClick: onOpenCatalog
  }, /*#__PURE__*/React.createElement("div", {
    className: `hero ${c.hero}`
  }, /*#__PURE__*/React.createElement("h4", null, c.name)), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)',
      fontWeight: 500
    }
  }, c.products), " products"), /*#__PURE__*/React.createElement("span", null, c.validUntil)))))), /*#__PURE__*/React.createElement("div", {
    className: "b-section",
    style: {
      paddingBottom: 24
    }
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "Recent activity",
    more: "See orders",
    onMore: onGoOrders
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-order-list"
  }, BUYER_DATA.orders.slice(0, 2).map(o => /*#__PURE__*/React.createElement("div", {
    className: "b-order-card",
    key: o.id,
    onClick: onGoOrders
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-order-id"
  }, o.id), /*#__PURE__*/React.createElement("span", {
    className: `b-status ${o.status}`
  }, BUYER_DATA.statusLabels[o.status])), /*#__PURE__*/React.createElement("div", {
    className: "b-order-catalog"
  }, o.catalog), /*#__PURE__*/React.createElement("div", {
    className: "b-order-foot"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, o.items, " products \xB7 ", o.placed), /*#__PURE__*/React.createElement("span", {
    className: "b-order-total"
  }, inrB(o.total)))))))));
}

// ===================================================================
//  CATALOG — standard catalog browser (landing tab)
// ===================================================================
function Catalog({
  onOpenProduct,
  onOpenList,
  onOpenLocation,
  location
}) {
  const [filter, setFilter] = React.useState('all');
  const filters = [{
    id: 'all',
    label: 'All'
  }, {
    id: 'wine',
    label: 'Wine'
  }, {
    id: 'spirits',
    label: 'Spirits'
  }, {
    id: 'beer',
    label: 'Beer'
  }, {
    id: 'new',
    label: 'New'
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "b-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-page-head-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-eyebrow"
  }, "Browse"), /*#__PURE__*/React.createElement("h1", {
    className: "b-page-title",
    style: {
      fontSize: 26
    }
  }, "Catalog")), /*#__PURE__*/React.createElement("div", {
    className: "actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "b-header-action",
    "aria-label": "Help"
  }, /*#__PURE__*/React.createElement(BIconHelp, {
    size: 17
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-search-bar"
  }, /*#__PURE__*/React.createElement(BIconSearch, {
    size: 16,
    className: "ico"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search brands, SKUs, products\u2026"
  }), /*#__PURE__*/React.createElement("kbd", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--cream-600)'
    }
  }, "\u2318K"))), /*#__PURE__*/React.createElement("div", {
    className: "b-location-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "b-location is-block",
    onClick: onOpenLocation
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-location-pin"
  }, /*#__PURE__*/React.createElement(BIconPin, {
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-location-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-location-eyebrow"
  }, "Deliver to"), /*#__PURE__*/React.createElement("div", {
    className: "b-location-name"
  }, location?.name, " \xB7 ", location?.address)), /*#__PURE__*/React.createElement(BIconChevD, {
    size: 14,
    style: {
      color: 'var(--cream-700)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "b-inline-tabs"
  }, filters.map(f => /*#__PURE__*/React.createElement("button", {
    key: f.id,
    className: 'b-inline-tab' + (filter === f.id ? ' is-on' : ''),
    onClick: () => setFilter(f.id)
  }, f.label))), /*#__PURE__*/React.createElement("div", {
    className: "b-section"
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "Catalogs from your sellers",
    more: "Show all",
    onMore: () => onOpenList?.({
      kind: 'catalog',
      id: 'c1',
      name: 'Summer Pours',
      subtitle: 'A curated selection from your private cellar'
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-hscroll"
  }, BUYER_DATA.catalogs.map(c => /*#__PURE__*/React.createElement("div", {
    className: "b-catalog-mini",
    key: c.id,
    onClick: () => onOpenList?.({
      kind: 'catalog',
      id: c.id,
      name: c.name,
      subtitle: c.subtitle
    })
  }, /*#__PURE__*/React.createElement("div", {
    className: `hero ${c.hero}`
  }, /*#__PURE__*/React.createElement("h4", null, c.name)), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)',
      fontWeight: 500
    }
  }, c.products), " products"), /*#__PURE__*/React.createElement("span", null, c.validUntil)))))), /*#__PURE__*/React.createElement("div", {
    className: "b-section"
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "Browse by category",
    more: "Show all"
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-cat-grid"
  }, BUYER_CATEGORIES.slice(0, 6).map(c => {
    const Ico = c.id === 'wine' ? BIconWine : c.id === 'beer' ? BIconBeer : c.id === 'spirits' ? BIconSpark : BIconGrid;
    return /*#__PURE__*/React.createElement("div", {
      className: "b-cat-tile",
      key: c.id,
      onClick: () => onOpenList?.({
        kind: 'category',
        id: c.id,
        name: c.name,
        subtitle: `${c.count} products from your distributors`
      })
    }, /*#__PURE__*/React.createElement("div", {
      className: `b-cat-icon ${c.hue}`
    }, /*#__PURE__*/React.createElement(Ico, {
      size: 22
    })), /*#__PURE__*/React.createElement("div", {
      className: "b-cat-name"
    }, c.name), /*#__PURE__*/React.createElement("div", {
      className: "b-cat-count"
    }, c.count));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "b-section"
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "Top brands",
    more: "Show all"
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-brand-row"
  }, BUYER_BRANDS.map(b => /*#__PURE__*/React.createElement("div", {
    className: "b-brand-chip",
    key: b.id,
    onClick: () => onOpenList?.({
      kind: 'brand',
      id: b.id,
      name: b.name,
      subtitle: 'Brand catalogue'
    })
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-brand-chip-avatar"
  }, b.initials), /*#__PURE__*/React.createElement("div", {
    className: "b-brand-chip-name"
  }, b.name))))), /*#__PURE__*/React.createElement("div", {
    className: "b-section"
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "The picks \xB7 this week",
    more: "Show all"
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-product-grid"
  }, BUYER_DATA.products.slice(0, 4).map(p => /*#__PURE__*/React.createElement("div", {
    className: `b-product-card ${p.featured ? 'featured' : ''}`,
    key: p.id,
    onClick: () => onOpenProduct(p.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: `b-product-photo b-product-photo-${p.hue}`
  }, p.featured && /*#__PURE__*/React.createElement("span", {
    className: "b-product-featured-badge"
  }, "Featured"), /*#__PURE__*/React.createElement(Bottle, {
    hue: p.hue
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-product-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-product-brand"
  }, p.brand), /*#__PURE__*/React.createElement("div", {
    className: "b-product-name"
  }, p.name, p.vintage ? ` ${p.vintage}` : ''), /*#__PURE__*/React.createElement("div", {
    className: "b-product-pack"
  }, p.pack), /*#__PURE__*/React.createElement("div", {
    className: "b-product-prices"
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-product-price"
  }, inrB(p.price)), /*#__PURE__*/React.createElement("span", {
    className: "b-product-mrp"
  }, inrB(p.mrp)))))))), /*#__PURE__*/React.createElement("div", {
    className: "b-section",
    style: {
      paddingBottom: 32
    }
  }, /*#__PURE__*/React.createElement(SectionRow, {
    title: "More from WineYard Vintners",
    more: "Show all"
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-product-grid"
  }, BUYER_DATA.products.slice(4, 8).map(p => /*#__PURE__*/React.createElement("div", {
    className: "b-product-card",
    key: p.id,
    onClick: () => onOpenProduct(p.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: `b-product-photo b-product-photo-${p.hue}`
  }, /*#__PURE__*/React.createElement(Bottle, {
    hue: p.hue
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-product-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-product-brand"
  }, p.brand), /*#__PURE__*/React.createElement("div", {
    className: "b-product-name"
  }, p.name, p.vintage ? ` ${p.vintage}` : ''), /*#__PURE__*/React.createElement("div", {
    className: "b-product-pack"
  }, p.pack), /*#__PURE__*/React.createElement("div", {
    className: "b-product-prices"
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-product-price"
  }, inrB(p.price)), /*#__PURE__*/React.createElement("span", {
    className: "b-product-mrp"
  }, inrB(p.mrp))))))))));
}

// ===================================================================
//  PRODUCT DETAIL — deep screen (no tab bar)
// ===================================================================
function Product({
  productId,
  onBack,
  onAdd
}) {
  const p = BUYER_DATA.products.find(x => x.id === productId) || BUYER_DATA.products[0];
  const [qty, setQty] = React.useState(12);
  const saved = p.mrp - p.price;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Product",
    left: /*#__PURE__*/React.createElement("button", {
      className: "b-header-back",
      onClick: onBack
    }, /*#__PURE__*/React.createElement(BIconBack, {
      size: 18
    })),
    right: /*#__PURE__*/React.createElement("button", {
      className: "b-header-action"
    }, /*#__PURE__*/React.createElement(BIconSearch, {
      size: 16
    }))
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: `b-pd-hero b-pd-hero-compact b-product-photo-${p.hue}`
  }, /*#__PURE__*/React.createElement(Bottle, {
    hue: p.hue
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-fav"
  }, /*#__PURE__*/React.createElement(BIconHeart, {
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-pd-brand"
  }, p.brand), /*#__PURE__*/React.createElement("h1", {
    className: "b-pd-title"
  }, p.name, " ", p.vintage && /*#__PURE__*/React.createElement("em", null, p.vintage)), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-sku"
  }, p.sku, " \xB7 ", p.pack), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-prices"
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-pd-price"
  }, inrB(p.price)), /*#__PURE__*/React.createElement("span", {
    className: "b-pd-mrp"
  }, "MRP ", inrB(p.mrp)), saved > 0 && /*#__PURE__*/React.createElement("span", {
    className: "b-pd-save"
  }, "Save ", inrB(saved), " / unit")), /*#__PURE__*/React.createElement("p", {
    className: "b-pd-note"
  }, p.note), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-attrs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-pd-attr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Pack"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, p.pack)), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-attr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "MOQ"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "12 units")), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-attr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "In stock"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "240 units")), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-attr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "l"
  }, "Delivery"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, "2\u20133 days"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24
    },
    className: "eyebrow b-eyebrow"
  }, "Product attributes"), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-spec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-pd-spec-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Region"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, p.vintage ? 'Nashik, India' : 'Pune, India')), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-spec-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "ABV"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, p.brand.includes('Brewing') ? '6.2%' : p.brand.includes('Spirits') ? '43%' : '13.5%')), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-spec-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Volume"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, p.pack)), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-spec-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "HSN code"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "22042100")), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-spec-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "GST rate"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "18%")), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-spec-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Master SKU"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, p.sku)), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-spec-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Best before"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "36 months"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24
    },
    className: "eyebrow b-eyebrow"
  }, "More from ", p.brand), /*#__PURE__*/React.createElement("div", {
    className: "b-hscroll",
    style: {
      padding: '12px 0 24px',
      marginLeft: -24,
      marginRight: -24,
      paddingLeft: 24,
      paddingRight: 24
    }
  }, BUYER_DATA.products.filter(x => x.brand === p.brand && x.id !== p.id).slice(0, 4).map(x => /*#__PURE__*/React.createElement("div", {
    className: "b-reorder-card",
    key: x.id,
    onClick: () => {/* swap product */}
  }, /*#__PURE__*/React.createElement("div", {
    className: `b-product-photo b-product-photo-${x.hue}`
  }, /*#__PURE__*/React.createElement(Bottle, {
    hue: x.hue
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-reorder-card-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-reorder-name"
  }, x.name, x.vintage ? ` ${x.vintage}` : ''), /*#__PURE__*/React.createElement("div", {
    className: "b-reorder-price"
  }, inrB(x.price)))))))), /*#__PURE__*/React.createElement("div", {
    className: "b-pd-cart-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-qty"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setQty(Math.max(12, qty - 12))
  }, /*#__PURE__*/React.createElement(BIconMinus, {
    size: 14
  })), /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, qty), /*#__PURE__*/React.createElement("button", {
    onClick: () => setQty(qty + 12)
  }, /*#__PURE__*/React.createElement(BIconPlus, {
    size: 14
  }))), /*#__PURE__*/React.createElement("button", {
    className: "b-cta",
    style: {
      flex: 1
    },
    onClick: () => onAdd(p, qty)
  }, /*#__PURE__*/React.createElement(BIconCart, {
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, "Add \xB7 ", inrB(p.price * qty)))));
}

// ===================================================================
//  CART — deep screen (no tab bar)
// ===================================================================
function Cart({
  items,
  onBack,
  onCheckout,
  onChange,
  location
}) {
  const [list, setList] = React.useState(items.length ? items : [{
    ...BUYER_DATA.products[0],
    qty: 24
  }, {
    ...BUYER_DATA.products[2],
    qty: 12
  }, {
    ...BUYER_DATA.products[4],
    qty: 36
  }]);
  const subtotal = list.reduce((s, x) => s + x.price * x.qty, 0);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;
  const updateQty = (id, delta) => {
    const next = list.map(x => x.id === id ? {
      ...x,
      qty: Math.max(12, x.qty + delta)
    } : x);
    setList(next);
    onChange?.(next);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Cart",
    left: /*#__PURE__*/React.createElement("button", {
      className: "b-header-back",
      onClick: onBack
    }, /*#__PURE__*/React.createElement(BIconBack, {
      size: 18
    }))
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-page-head",
    style: {
      padding: '12px 24px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-eyebrow"
  }, list.length, " products \xB7 ", list.reduce((s, x) => s + x.qty, 0), " units"), /*#__PURE__*/React.createElement("h1", {
    className: "b-page-title",
    style: {
      fontSize: 26
    }
  }, "Review & place")), /*#__PURE__*/React.createElement("div", {
    className: "b-cart-list"
  }, list.map(x => /*#__PURE__*/React.createElement("div", {
    className: "b-cart-row",
    key: x.id
  }, /*#__PURE__*/React.createElement("div", {
    className: `b-cart-thumb b-product-photo-${x.hue}`,
    style: {
      padding: 8
    }
  }, /*#__PURE__*/React.createElement(Bottle, {
    hue: x.hue
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-cart-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-cart-name"
  }, x.name, x.vintage ? ` ${x.vintage}` : ''), /*#__PURE__*/React.createElement("div", {
    className: "b-cart-sub"
  }, x.brand, " \xB7 ", x.pack), /*#__PURE__*/React.createElement("div", {
    className: "b-cart-line"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-cart-mini-qty"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => updateQty(x.id, -12)
  }, /*#__PURE__*/React.createElement(BIconMinus, {
    size: 12
  })), /*#__PURE__*/React.createElement("span", null, x.qty), /*#__PURE__*/React.createElement("button", {
    onClick: () => updateQty(x.id, 12)
  }, /*#__PURE__*/React.createElement(BIconPlus, {
    size: 12
  }))), /*#__PURE__*/React.createElement("div", {
    className: "b-cart-row-total"
  }, inrB(x.price * x.qty))))))), /*#__PURE__*/React.createElement("div", {
    className: "b-cart-summary"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-summary-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Subtotal"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inrB(subtotal))), /*#__PURE__*/React.createElement("div", {
    className: "b-summary-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "GST \xB7 18%"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inrB(tax))), /*#__PURE__*/React.createElement("div", {
    className: "b-summary-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Delivery"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "Included")), /*#__PURE__*/React.createElement("div", {
    className: "b-summary-row total"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inrB(total)))), /*#__PURE__*/React.createElement("div", {
    className: "b-deliver-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-deliver-icon"
  }, /*#__PURE__*/React.createElement(BIconPin, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-deliver-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-deliver-label"
  }, "Deliver to"), /*#__PURE__*/React.createElement("div", {
    className: "b-deliver-name"
  }, location?.name || 'Delhi Showroom'), /*#__PURE__*/React.createElement("div", {
    className: "b-deliver-addr"
  }, location?.address || 'Karol Bagh · 110005', " \xB7 2\u20133 days")), /*#__PURE__*/React.createElement("a", {
    className: "b-deliver-change"
  }, "Change ", /*#__PURE__*/React.createElement(BIconChevR, {
    size: 12
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 22
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-checkout-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "b-cta ember",
    onClick: onCheckout
  }, /*#__PURE__*/React.createElement(BIconCheck, {
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, "Place order \xB7 ", inrB(total)))));
}

// ===================================================================
//  ORDER PLACED — deep screen (no tab bar)
// ===================================================================
function Placed({
  onDone
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Order placed"
  }), /*#__PURE__*/React.createElement("div", {
    className: "b-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-placed",
    style: {
      padding: '48px 32px 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-placed-mark"
  }, /*#__PURE__*/React.createElement(BIconCheck, {
    size: 36,
    stroke: 2
  })), /*#__PURE__*/React.createElement("h1", {
    className: "b-placed-title"
  }, "Order placed."), /*#__PURE__*/React.createElement("p", {
    className: "b-placed-sub"
  }, "We've notified Phani Distribution. They typically confirm within an hour. You'll see updates here and on WhatsApp."), /*#__PURE__*/React.createElement("div", {
    className: "b-placed-receipt"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-order-id"
  }, "DF-2026-00472"), /*#__PURE__*/React.createElement("span", {
    className: "b-status received"
  }, "Received")), /*#__PURE__*/React.createElement("div", {
    className: "b-order-catalog"
  }, "Summer Pours \xB7 3 products"), /*#__PURE__*/React.createElement("div", {
    className: "b-order-foot"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, "Just now"), /*#__PURE__*/React.createElement("span", {
    className: "b-order-total"
  }, "\u20B91,72,260"))))), /*#__PURE__*/React.createElement("div", {
    className: "b-checkout-bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "b-cta",
    onClick: onDone
  }, /*#__PURE__*/React.createElement("span", null, "Back to catalog"))));
}

// ===================================================================
//  ORDERS — landing tab with sub-tabs (Orders / Enquiries / Invoices)
// ===================================================================
function OrdersList() {
  const [tab, setTab] = React.useState('orders');
  const [filter, setFilter] = React.useState('all');
  const filters = [{
    id: 'all',
    label: 'All'
  }, {
    id: 'received',
    label: 'Received'
  }, {
    id: 'confirmed',
    label: 'Confirmed'
  }, {
    id: 'dispatched',
    label: 'Dispatched'
  }, {
    id: 'delivered',
    label: 'Delivered'
  }];
  const subtabs = [{
    id: 'orders',
    label: 'Orders',
    count: BUYER_DATA.orders.length
  }, {
    id: 'enquiries',
    label: 'Enquiries',
    count: BUYER_DATA.enquiries.length
  }, {
    id: 'invoices',
    label: 'Invoices',
    count: BUYER_DATA.invoices.length
  }];
  const rows = filter === 'all' ? BUYER_DATA.orders : BUYER_DATA.orders.filter(o => o.status === filter);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "b-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-page-head-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-eyebrow"
  }, "Activity"), /*#__PURE__*/React.createElement("h1", {
    className: "b-page-title",
    style: {
      fontSize: 26
    }
  }, "Your orders")), /*#__PURE__*/React.createElement("div", {
    className: "actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "b-header-action",
    "aria-label": "Search"
  }, /*#__PURE__*/React.createElement(BIconSearch, {
    size: 17
  })))), /*#__PURE__*/React.createElement("div", {
    className: "b-subtabs"
  }, subtabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    className: 'b-subtab' + (tab === t.id ? ' is-on' : ''),
    onClick: () => setTab(t.id)
  }, /*#__PURE__*/React.createElement("span", null, t.label), /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, t.count)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-search-bar",
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement(BIconSearch, {
    size: 16,
    className: "ico"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: `Search ${tab}…`
  }))), tab === 'orders' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "b-inline-tabs"
  }, filters.map(f => /*#__PURE__*/React.createElement("button", {
    key: f.id,
    className: 'b-inline-tab' + (filter === f.id ? ' is-on' : ''),
    onClick: () => setFilter(f.id)
  }, f.label))), /*#__PURE__*/React.createElement("div", {
    className: "b-order-list",
    style: {
      paddingTop: 6,
      paddingBottom: 24
    }
  }, rows.map(o => /*#__PURE__*/React.createElement("div", {
    className: "b-order-card",
    key: o.id
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-order-id"
  }, o.id), /*#__PURE__*/React.createElement("span", {
    className: `b-status ${o.status}`
  }, BUYER_DATA.statusLabels[o.status])), /*#__PURE__*/React.createElement("div", {
    className: "b-order-catalog"
  }, o.catalog), /*#__PURE__*/React.createElement("div", {
    className: "b-order-foot"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, o.items, " products \xB7 ", o.placed), /*#__PURE__*/React.createElement("span", {
    className: "b-order-total"
  }, inrB(o.total))))))), tab === 'enquiries' && /*#__PURE__*/React.createElement("div", {
    className: "b-order-list",
    style: {
      paddingTop: 14,
      paddingBottom: 24
    }
  }, BUYER_DATA.enquiries.map(e => /*#__PURE__*/React.createElement("div", {
    className: "b-order-card",
    key: e.id
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-order-id"
  }, e.id), /*#__PURE__*/React.createElement("span", {
    className: `b-status ${e.status === 'open' ? 'received' : e.status === 'replied' ? 'confirmed' : 'delivered'}`
  }, BUYER_DATA.enquiryStatusLabels[e.status])), /*#__PURE__*/React.createElement("div", {
    className: "b-order-catalog"
  }, e.subject), /*#__PURE__*/React.createElement("div", {
    className: "b-order-foot"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, e.distributor, " \xB7 ", e.placed), /*#__PURE__*/React.createElement(BIconChevR, {
    size: 14,
    style: {
      color: 'var(--cream-600)'
    }
  }))))), tab === 'invoices' && /*#__PURE__*/React.createElement("div", {
    className: "b-order-list",
    style: {
      paddingTop: 14,
      paddingBottom: 24
    }
  }, BUYER_DATA.invoices.map(inv => /*#__PURE__*/React.createElement("div", {
    className: "b-order-card",
    key: inv.id
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-order-id"
  }, inv.id), /*#__PURE__*/React.createElement("span", {
    className: `b-status ${inv.status === 'paid' ? 'delivered' : inv.status === 'due' ? 'confirmed' : 'received'}`,
    style: inv.status === 'overdue' ? {
      background: '#F6E5DF',
      color: '#6B2615'
    } : null
  }, BUYER_DATA.invoiceStatusLabels[inv.status])), /*#__PURE__*/React.createElement("div", {
    className: "b-order-catalog"
  }, inrB(inv.amount)), /*#__PURE__*/React.createElement("div", {
    className: "b-order-foot"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, "Issued ", inv.issued, " \xB7 Due ", inv.due), /*#__PURE__*/React.createElement(BIconReceipt, {
    size: 14,
    style: {
      color: 'var(--cream-600)'
    }
  })))))));
}

// ===================================================================
//  PROFILE — landing tab (with bottom-sheet edit example)
// ===================================================================
function Profile({
  onLogout,
  onOpenSheet
}) {
  const p = BUYER_PROFILE;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "b-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-avatar"
  }, p.name.split(' ').map(s => s[0]).join('')), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-name"
  }, p.name), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-sub"
  }, p.business, " \xB7 ", p.tier)), /*#__PURE__*/React.createElement("div", {
    className: "b-section",
    style: {
      paddingTop: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow b-eyebrow",
    style: {
      padding: '0 22px 8px'
    }
  }, "Account"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row",
    onClick: () => onOpenSheet?.('business')
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon"
  }, /*#__PURE__*/React.createElement(BIconUser, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label"
  }, "Business details"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub"
  }, p.business)), /*#__PURE__*/React.createElement(BIconEdit, {
    size: 15,
    style: {
      color: 'var(--cream-600)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon"
  }, /*#__PURE__*/React.createElement(BIconShield, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label"
  }, "GSTIN"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, p.gstin)), /*#__PURE__*/React.createElement(BIconChevR, {
    size: 16,
    style: {
      color: 'var(--cream-600)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon ember"
  }, /*#__PURE__*/React.createElement(BIconCard, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label"
  }, "Credit limit"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub"
  }, inrB(p.used), " used of ", inrB(p.credit))), /*#__PURE__*/React.createElement(BIconChevR, {
    size: 16,
    style: {
      color: 'var(--cream-600)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon"
  }, /*#__PURE__*/React.createElement(BIconPin, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label"
  }, "Delivery locations"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub"
  }, "2 saved \xB7 Delhi, Gurugram")), /*#__PURE__*/React.createElement(BIconChevR, {
    size: 16,
    style: {
      color: 'var(--cream-600)'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "b-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow b-eyebrow",
    style: {
      padding: '0 22px 8px'
    }
  }, "Preferences"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon"
  }, /*#__PURE__*/React.createElement(BIconBell, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label"
  }, "Notifications"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub"
  }, "WhatsApp + push")), /*#__PURE__*/React.createElement("span", {
    className: "b-profile-row-value"
  }, "On")), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon"
  }, /*#__PURE__*/React.createElement(BIconGrid, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label"
  }, "Catalog view"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub"
  }, "Lookbook or grid")), /*#__PURE__*/React.createElement("span", {
    className: "b-profile-row-value"
  }, "Lookbook")), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon"
  }, /*#__PURE__*/React.createElement(BIconChat, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label"
  }, "Language"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub"
  }, "Display language")), /*#__PURE__*/React.createElement("span", {
    className: "b-profile-row-value"
  }, "English")), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon"
  }, /*#__PURE__*/React.createElement(BIconHelp, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label"
  }, "Help & support"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub"
  }, "Chat with us on WhatsApp")), /*#__PURE__*/React.createElement(BIconChevR, {
    size: 16,
    style: {
      color: 'var(--cream-600)'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "b-section",
    style: {
      paddingBottom: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-card",
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row",
    onClick: onLogout
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-icon danger"
  }, /*#__PURE__*/React.createElement(BIconLogout, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-label",
    style: {
      color: 'var(--danger-500)'
    }
  }, "Log out"), /*#__PURE__*/React.createElement("div", {
    className: "b-profile-row-sub"
  }, "You'll need a fresh OTP next time.")))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 16,
      fontSize: 11,
      color: 'var(--cream-700)',
      fontFamily: 'var(--font-mono)'
    }
  }, "DealFlow Buyer \xB7 v1.0.4"))));
}

// ===================================================================
//  VIEW CART floating button
// ===================================================================
function ViewCartButton({
  count,
  total,
  onView,
  noTabs = false
}) {
  if (!count) return null;
  return /*#__PURE__*/React.createElement("button", {
    className: 'b-view-cart' + (noTabs ? ' no-tabs' : ''),
    onClick: onView
  }, /*#__PURE__*/React.createElement("span", {
    className: "pill"
  }, count), /*#__PURE__*/React.createElement("span", null, "View cart"), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.6
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, inrB(total)), /*#__PURE__*/React.createElement(BIconChevR, {
    size: 16,
    className: "arrow"
  }));
}

// ===================================================================
//  PRODUCT LIST — deep screen (drill-down from category / catalog / brand)
// ===================================================================
function ProductList({
  source,
  onBack,
  onOpenProduct
}) {
  // source = { kind: 'category' | 'catalog' | 'brand', id, name, subtitle }
  const eyebrowLabel = source?.kind === 'category' ? 'Category' : source?.kind === 'catalog' ? 'Catalog' : source?.kind === 'brand' ? 'Brand' : 'List';
  const products = BUYER_DATA.products;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "b-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-pl-back-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "b-pl-back",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(BIconBack, {
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    className: "b-pl-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-pl-eyebrow"
  }, eyebrowLabel), /*#__PURE__*/React.createElement("h1", {
    className: "b-pl-title"
  }, source?.name || 'Products'), /*#__PURE__*/React.createElement("div", {
    className: "b-pl-sub"
  }, source?.subtitle || 'Curated from your distributors')), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 18px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-search-bar",
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement(BIconSearch, {
    size: 16,
    className: "ico"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search within this list\u2026"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "b-pl-toolbar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, products.length), /*#__PURE__*/React.createElement("span", null, "products"), /*#__PURE__*/React.createElement("button", {
    className: "b-pl-sort"
  }, /*#__PURE__*/React.createElement(BIconSort, {
    size: 14
  }), " Price \xB7 low to high")), /*#__PURE__*/React.createElement("div", {
    className: "b-product-grid",
    style: {
      paddingTop: 16,
      paddingBottom: 24
    }
  }, products.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    className: `b-product-card ${p.featured ? 'featured' : ''}`,
    onClick: () => onOpenProduct(p.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: `b-product-photo b-product-photo-${p.hue}`
  }, p.featured && /*#__PURE__*/React.createElement("span", {
    className: "b-product-featured-badge"
  }, "Featured"), /*#__PURE__*/React.createElement(Bottle, {
    hue: p.hue
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-product-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-product-brand"
  }, p.brand), /*#__PURE__*/React.createElement("div", {
    className: "b-product-name"
  }, p.name, p.vintage ? ` ${p.vintage}` : ''), /*#__PURE__*/React.createElement("div", {
    className: "b-product-pack"
  }, p.pack), /*#__PURE__*/React.createElement("div", {
    className: "b-product-prices"
  }, /*#__PURE__*/React.createElement("span", {
    className: "b-product-price"
  }, inrB(p.price)), /*#__PURE__*/React.createElement("span", {
    className: "b-product-mrp"
  }, inrB(p.mrp)))))))));
}

// ===================================================================
//  BOTTOM SHEET — generic, used for the Profile "edit business" example
// ===================================================================
function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'b-sheet-backdrop' + (open ? ' is-open' : ''),
    onClick: onClose
  }), /*#__PURE__*/React.createElement("div", {
    className: 'b-sheet' + (open ? ' is-open' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-sheet-handle"
  }), title && /*#__PURE__*/React.createElement("h2", {
    className: "b-sheet-title"
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "b-sheet-sub"
  }, subtitle), children, footer && /*#__PURE__*/React.createElement("div", {
    className: "b-sheet-actions"
  }, footer)));
}
function BusinessEditSheet({
  open,
  onClose,
  onSave
}) {
  const p = BUYER_PROFILE;
  return /*#__PURE__*/React.createElement(BottomSheet, {
    open: open,
    onClose: onClose,
    title: "Edit business details",
    subtitle: "These appear on every order placed and on invoices issued by your distributors.",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "b-cta secondary",
      onClick: onClose
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      className: "b-cta",
      onClick: onSave
    }, /*#__PURE__*/React.createElement(BIconCheck, {
      size: 16
    }), /*#__PURE__*/React.createElement("span", null, "Save changes")))
  }, /*#__PURE__*/React.createElement("div", {
    className: "b-sheet-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "l"
  }, "Business name"), /*#__PURE__*/React.createElement("input", {
    defaultValue: p.business
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-sheet-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "l"
  }, "Owner name"), /*#__PURE__*/React.createElement("input", {
    defaultValue: p.name
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-sheet-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "l"
  }, "Phone"), /*#__PURE__*/React.createElement("input", {
    defaultValue: p.phone
  })), /*#__PURE__*/React.createElement("div", {
    className: "b-sheet-field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "l"
  }, "Tier"), /*#__PURE__*/React.createElement("input", {
    defaultValue: p.tier,
    readOnly: true,
    style: {
      background: 'var(--cream-100)',
      color: 'var(--cream-700)'
    }
  })));
}
Object.assign(window, {
  Bottle,
  Login,
  Home,
  Catalog,
  Product,
  Cart,
  Placed,
  OrdersList,
  Profile,
  ProductList,
  BottomSheet,
  BusinessEditSheet,
  ViewCartButton,
  PageHeader
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer-app/Screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer-app/data.jsx
try { (() => {
// ui_kits/buyer-app/data.jsx
// Mock data + helpers for the buyer-app kit.

const buyerCatalogs = [{
  id: 'c1',
  name: 'Summer Pours',
  subtitle: 'A curated selection from our private cellar',
  distributor: 'Phani Distribution',
  products: 28,
  validUntil: '31 May 2026',
  hero: 'teal',
  isNew: true
}, {
  id: 'c2',
  name: 'New Arrivals · May',
  subtitle: 'Fresh stock landed this week',
  distributor: 'Phani Distribution',
  products: 14,
  validUntil: '15 Jun 2026',
  hero: 'ember',
  isNew: true
}, {
  id: 'c3',
  name: 'Premium Reserve',
  subtitle: 'Limited cases — for our A-class buyers',
  distributor: 'Phani Distribution',
  products: 42,
  validUntil: '30 Jun 2026',
  hero: 'cream',
  isNew: false
}];
const buyerProducts = [{
  id: 'p1',
  name: 'Cabernet Sauvignon',
  vintage: '2021',
  brand: 'WineYard Vintners',
  sku: 'VINO-CAB-750-2021',
  pack: '750ml',
  mrp: 2800,
  price: 2450,
  hue: 'teal',
  featured: true,
  note: 'A medium-bodied Nashik Cab with notes of black cherry, cedar, and a long warm finish.'
}, {
  id: 'p2',
  name: 'Cabernet Franc',
  vintage: '2020',
  brand: 'WineYard Vintners',
  sku: 'VINO-CFR-750-2020',
  pack: '750ml',
  mrp: 3400,
  price: 2980,
  hue: 'teal',
  featured: false,
  note: 'Reserve bottling. Limited to 600 cases — earthy, peppery, age-worthy.'
}, {
  id: 'p3',
  name: 'Chenin Blanc',
  vintage: '2022',
  brand: 'Maison Roussel',
  sku: 'MRSL-CB-750-2022',
  pack: '750ml',
  mrp: 1900,
  price: 1640,
  hue: 'cream',
  featured: true,
  note: 'Crisp, dry, slightly aromatic. Pairs with paneer tikka and grilled fish.'
}, {
  id: 'p4',
  name: 'Sauvignon Blanc',
  vintage: '2022',
  brand: 'Maison Roussel',
  sku: 'MRSL-SB-750-2022',
  pack: '750ml',
  mrp: 1800,
  price: 1550,
  hue: 'cream',
  featured: false,
  note: 'Bright citrus and gooseberry. Drink within the year.'
}, {
  id: 'p5',
  name: 'Indian Pale Ale',
  vintage: '',
  brand: 'Khanna Brewing Co.',
  sku: 'KHAN-IPA-330-006',
  pack: '330ml × 6',
  mrp: 720,
  price: 580,
  hue: 'ember',
  featured: true,
  note: 'Citrus-forward, 6.2% ABV. Brewed in Pune. Best chilled.'
}, {
  id: 'p6',
  name: 'Wheat Lager',
  vintage: '',
  brand: 'Khanna Brewing Co.',
  sku: 'KHAN-WHT-330-006',
  pack: '330ml × 6',
  mrp: 640,
  price: 520,
  hue: 'ember',
  featured: false,
  note: 'Light, cloudy, refreshing. 4.8% ABV.'
}, {
  id: 'p7',
  name: 'Single Malt 12 Year',
  vintage: '',
  brand: 'Tara Spirits',
  sku: 'TARA-SM12-750',
  pack: '750ml',
  mrp: 4800,
  price: 4280,
  hue: 'teal',
  featured: true,
  note: 'Aged 12 years in ex-bourbon casks. Smoky, soft, slightly sweet.'
}, {
  id: 'p8',
  name: 'Estate Reserve Red',
  vintage: '2019',
  brand: 'Aravalli Vineyards',
  sku: 'ARVL-ESR-750-2019',
  pack: '750ml',
  mrp: 3200,
  price: 2850,
  hue: 'ember',
  featured: false,
  note: 'Old-vine Shiraz blend. Velvety tannins.'
}];
const buyerOrders = [{
  id: 'DF-2026-00471',
  status: 'dispatched',
  total: 84200,
  items: 3,
  placed: '2 hours ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00466',
  status: 'delivered',
  total: 124300,
  items: 9,
  placed: '2 days ago',
  catalog: 'Premium Reserve'
}, {
  id: 'DF-2026-00451',
  status: 'delivered',
  total: 46500,
  items: 4,
  placed: 'Last week',
  catalog: 'New Arrivals · May'
}, {
  id: 'DF-2026-00444',
  status: 'confirmed',
  total: 218500,
  items: 12,
  placed: '8 days ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00432',
  status: 'delivered',
  total: 92800,
  items: 6,
  placed: '12 days ago',
  catalog: 'Premium Reserve'
}, {
  id: 'DF-2026-00421',
  status: 'delivered',
  total: 38400,
  items: 3,
  placed: '18 days ago',
  catalog: 'New Arrivals · April'
}, {
  id: 'DF-2026-00412',
  status: 'cancelled',
  total: 12800,
  items: 1,
  placed: '24 days ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00398',
  status: 'delivered',
  total: 156200,
  items: 8,
  placed: 'Last month',
  catalog: 'Monsoon Pre-Order'
}];
const buyerEnquiries = [{
  id: 'ENQ-2026-0042',
  subject: 'Bulk pricing on Cabernet Franc',
  status: 'open',
  distributor: 'Phani Distribution',
  placed: '3 hours ago'
}, {
  id: 'ENQ-2026-0041',
  subject: 'Stock check · Single Malt 12',
  status: 'replied',
  distributor: 'Kohli & Sons',
  placed: 'Yesterday'
}, {
  id: 'ENQ-2026-0039',
  subject: 'New cohort catalog · Diwali range',
  status: 'closed',
  distributor: 'Phani Distribution',
  placed: '4 days ago'
}];
const buyerInvoices = [{
  id: 'INV-2026-00128',
  amount: 124300,
  status: 'paid',
  issued: '2 days ago',
  due: '—'
}, {
  id: 'INV-2026-00121',
  amount: 46500,
  status: 'paid',
  issued: 'Last week',
  due: '—'
}, {
  id: 'INV-2026-00118',
  amount: 218500,
  status: 'due',
  issued: '8 days ago',
  due: 'In 22 days'
}, {
  id: 'INV-2026-00114',
  amount: 38400,
  status: 'overdue',
  issued: '18 days ago',
  due: '−4 days'
}];
const enquiryStatusLabels = {
  open: 'Open',
  replied: 'Replied',
  closed: 'Closed'
};
const invoiceStatusLabels = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue'
};
const buyerStatusLabels = {
  draft: 'Draft',
  received: 'Received',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
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
  BUYER_DATA: {
    catalogs: buyerCatalogs,
    products: buyerProducts,
    orders: buyerOrders,
    statusLabels: buyerStatusLabels,
    enquiries: buyerEnquiries,
    invoices: buyerInvoices,
    enquiryStatusLabels,
    invoiceStatusLabels
  },
  inrB: inr
});

// ---------- Dashboard + Catalog browsing data ----------

const buyerLocations = [{
  id: 'dl',
  name: 'Delhi Showroom',
  address: 'Karol Bagh · 110005',
  isDefault: true
}, {
  id: 'gu',
  name: 'Gurugram Outlet',
  address: 'Sector 29 · 122002',
  isDefault: false
}];
const buyerDistributors = [{
  id: 'phani',
  initials: 'PD',
  name: 'Phani Distribution',
  city: 'New Delhi',
  lastOrder: '2h ago',
  spend: 1240000,
  trend: '+12%'
}, {
  id: 'kohli',
  initials: 'KS',
  name: 'Kohli & Sons',
  city: 'Faridabad',
  lastOrder: '4d ago',
  spend: 428000,
  trend: '+4%'
}, {
  id: 'arasaka',
  initials: 'AR',
  name: 'Arasaka Wines',
  city: 'Noida',
  lastOrder: '2w ago',
  spend: 186000,
  trend: '−6%'
}];
const buyerCategories = [{
  id: 'wine',
  name: 'Wine',
  count: 184,
  hue: 'teal'
}, {
  id: 'spirits',
  name: 'Spirits',
  count: 92,
  hue: 'ember'
}, {
  id: 'beer',
  name: 'Beer',
  count: 64,
  hue: 'cream'
}, {
  id: 'mixers',
  name: 'Mixers',
  count: 38,
  hue: 'teal'
}, {
  id: 'cigars',
  name: 'Cigars',
  count: 14,
  hue: 'ember'
}, {
  id: 'snacks',
  name: 'Snacks',
  count: 72,
  hue: 'cream'
}];
const buyerBrands = [{
  id: 'wy',
  initials: 'WY',
  name: 'WineYard Vintners'
}, {
  id: 'mr',
  initials: 'MR',
  name: 'Maison Roussel'
}, {
  id: 'kh',
  initials: 'KH',
  name: 'Khanna Brewing'
}, {
  id: 'ts',
  initials: 'TS',
  name: 'Tara Spirits'
}, {
  id: 'av',
  initials: 'AV',
  name: 'Aravalli Vineyards'
}, {
  id: 'rg',
  initials: 'RG',
  name: 'Riverstone Gin'
}];
const buyerProfile = {
  name: 'Rajan Mehta',
  business: 'Rajan Wine Merchants',
  phone: '+91 98103 47281',
  gstin: '07AABCR1234M1Z5',
  tier: 'A-class',
  credit: 250000,
  used: 84200
};
Object.assign(window, {
  BUYER_LOCATIONS: buyerLocations,
  BUYER_DISTRIBUTORS: buyerDistributors,
  BUYER_CATEGORIES: buyerCategories,
  BUYER_BRANDS: buyerBrands,
  BUYER_PROFILE: buyerProfile
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer-app/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer-app/icons.jsx
try { (() => {
// ui_kits/buyer-app/icons.jsx
// Minimal icon set for the buyer app.

const BIcon = ({
  size = 22,
  stroke = 1.5,
  children,
  style
}) => React.createElement('svg', {
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: stroke,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  style
}, children);
const BIconCatalog = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M4 19V6a2 2 0 0 1 2-2h11l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'
}), React.createElement('path', {
  d: 'M8 9h8M8 13h8M8 17h5'
}));
const BIconGrid = p => React.createElement(BIcon, p, React.createElement('rect', {
  x: 3,
  y: 3,
  width: 7,
  height: 7,
  rx: 1
}), React.createElement('rect', {
  x: 14,
  y: 3,
  width: 7,
  height: 7,
  rx: 1
}), React.createElement('rect', {
  x: 3,
  y: 14,
  width: 7,
  height: 7,
  rx: 1
}), React.createElement('rect', {
  x: 14,
  y: 14,
  width: 7,
  height: 7,
  rx: 1
}));
const BIconCart = p => React.createElement(BIcon, p, React.createElement('circle', {
  cx: 9,
  cy: 20,
  r: 1.5
}), React.createElement('circle', {
  cx: 18,
  cy: 20,
  r: 1.5
}), React.createElement('path', {
  d: 'M3 4h2l3 12h11l2-8H6'
}));
const BIconBox = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'
}), React.createElement('path', {
  d: 'M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12'
}));
const BIconBack = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M15 6l-6 6 6 6'
}));
const BIconSearch = p => React.createElement(BIcon, p, React.createElement('circle', {
  cx: 11,
  cy: 11,
  r: 7
}), React.createElement('path', {
  d: 'M21 21l-4-4'
}));
const BIconClose = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M18 6L6 18M6 6l12 12'
}));
const BIconPlus = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M12 5v14M5 12h14'
}));
const BIconMinus = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M5 12h14'
}));
const BIconCheck = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M20 6L9 17l-5-5'
}));
const BIconChevR = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M9 6l6 6-6 6'
}));
const BIconChevD = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M6 9l6 6 6-6'
}));
const BIconHeart = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'
}));
const BIconUser = p => React.createElement(BIcon, p, React.createElement('circle', {
  cx: 12,
  cy: 8,
  r: 4
}), React.createElement('path', {
  d: 'M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2'
}));
const BIconChat = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'
}));
const BIconClock = p => React.createElement(BIcon, p, React.createElement('circle', {
  cx: 12,
  cy: 12,
  r: 9
}), React.createElement('path', {
  d: 'M12 7v5l3 2'
}));
const BIconHome = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
}), React.createElement('path', {
  d: 'M9 22V12h6v10'
}));
const BIconPin = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M12 22s8-7.58 8-13a8 8 0 0 0-16 0c0 5.42 8 13 8 13z'
}), React.createElement('circle', {
  cx: 12,
  cy: 9,
  r: 2.5
}));
const BIconWine = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M8 22h8M12 17v5M8 3h8l-1 6a4 4 0 0 1-3 4h0a4 4 0 0 1-3-4z'
}));
const BIconBeer = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M17 11h3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3'
}), React.createElement('rect', {
  x: 4,
  y: 7,
  width: 13,
  height: 14,
  rx: 1
}), React.createElement('path', {
  d: 'M8 7V4M12 7V4M16 7V4'
}));
const BIconSpark = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z'
}));
const BIconBell = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'
}), React.createElement('path', {
  d: 'M13.73 21a2 2 0 0 1-3.46 0'
}));
const BIconHelp = p => React.createElement(BIcon, p, React.createElement('circle', {
  cx: 12,
  cy: 12,
  r: 9
}), React.createElement('path', {
  d: 'M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17h.01'
}));
const BIconLogout = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'
}));
const BIconShield = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12z'
}));
const BIconCard = p => React.createElement(BIcon, p, React.createElement('rect', {
  x: 2,
  y: 5,
  width: 20,
  height: 14,
  rx: 2
}), React.createElement('path', {
  d: 'M2 10h20'
}));
const BIconReceipt = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M6 2h12v20l-3-2-3 2-3-2-3 2z'
}), React.createElement('path', {
  d: 'M9 7h6M9 11h6M9 15h4'
}));
const BIconEdit = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'
}), React.createElement('path', {
  d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'
}));
const BIconSort = p => React.createElement(BIcon, p, React.createElement('path', {
  d: 'M3 6h18M6 12h12M10 18h4'
}));
Object.assign(window, {
  BIconCatalog,
  BIconGrid,
  BIconCart,
  BIconBox,
  BIconBack,
  BIconSearch,
  BIconClose,
  BIconPlus,
  BIconMinus,
  BIconCheck,
  BIconChevR,
  BIconChevD,
  BIconHeart,
  BIconUser,
  BIconChat,
  BIconClock,
  BIconHome,
  BIconPin,
  BIconWine,
  BIconBeer,
  BIconSpark,
  BIconBell,
  BIconHelp,
  BIconLogout,
  BIconShield,
  BIconCard,
  BIconReceipt,
  BIconEdit,
  BIconSort
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer-app/icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer-app/ios-frame.jsx
try { (() => {
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer-app/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/Catalogs.jsx
try { (() => {
// ui_kits/cockpit/Catalogs.jsx
// Published catalogs grid (lookbook tiles).

function CatalogCard({
  c,
  onPick
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "catalog-card",
    onClick: onPick
  }, /*#__PURE__*/React.createElement("div", {
    className: 'catalog-hero catalog-hero-' + c.hue
  }, /*#__PURE__*/React.createElement("h3", null, c.name), /*#__PURE__*/React.createElement("span", {
    className: 'catalog-hero-badge ' + (c.status === 'draft' ? 'draft' : 'published')
  }, c.status === 'draft' ? 'DRAFT' : 'LIVE')), /*#__PURE__*/React.createElement("div", {
    className: "catalog-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "catalog-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", null, "Cohort"), /*#__PURE__*/React.createElement("strong", null, c.cohort)), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", null, "Products"), /*#__PURE__*/React.createElement("strong", null, c.products)), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", null, "Valid until"), /*#__PURE__*/React.createElement("strong", null, c.validUntil)))));
}
function Catalogs({
  onPublish
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHeader, {
    eyebrow: "Catalogs",
    title: "Published to your retailers",
    subtitle: "Catalogs are how retailers see what you're carrying this week. Each one is scoped to a cohort, buyer, or geography \u2014 and expires automatically.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary"
    }, /*#__PURE__*/React.createElement(IconExternal, {
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, "Open as a buyer")), /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-accent",
      onClick: onPublish
    }, /*#__PURE__*/React.createElement(IconPlus, {
      size: 15
    }), /*#__PURE__*/React.createElement("span", null, "New catalog")))
  }), /*#__PURE__*/React.createElement("div", {
    className: "catalog-grid"
  }, DF_DATA.catalogs.map(c => /*#__PURE__*/React.createElement(CatalogCard, {
    key: c.id,
    c: c,
    onPick: onPublish
  }))));
}
window.Catalogs = Catalogs;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/Catalogs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/Common.jsx
try { (() => {
// ui_kits/cockpit/Common.jsx
// Reusable small components: StatusPill, Avatar, Card, KPITile, EmptyState, PageHeader.

function StatusPill({
  status
}) {
  const m = DF_DATA.statusMeta[status] || {
    label: status,
    bg: '#EFE9DF',
    fg: '#3D3A35'
  };
  return /*#__PURE__*/React.createElement("span", {
    className: "status-pill",
    style: {
      background: m.bg,
      color: m.fg
    }
  }, m.label);
}
function BrandAvatar({
  initials,
  size = 40,
  hue = 'cream'
}) {
  const map = {
    cream: {
      bg: '#F4EFE6',
      fg: '#1F3A34',
      border: '#EFE9DF'
    },
    teal: {
      bg: '#EAF1EE',
      fg: '#1F3A34',
      border: '#C6DAD3'
    },
    ember: {
      bg: '#FBEFE3',
      fg: '#874720',
      border: '#F5DAB8'
    }
  };
  const c = map[hue] || map.cream;
  return /*#__PURE__*/React.createElement("div", {
    className: "brand-avatar",
    style: {
      width: size,
      height: size,
      background: c.bg,
      color: c.fg,
      borderColor: c.border,
      fontSize: size * 0.38
    }
  }, initials);
}
function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "page-header"
  }, /*#__PURE__*/React.createElement("div", null, eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    className: "page-title"
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "page-subtitle"
  }, subtitle)), actions && /*#__PURE__*/React.createElement("div", {
    className: "page-actions"
  }, actions));
}
function KPITile({
  label,
  value,
  delta,
  deltaTone = 'up',
  hint
}) {
  const isUp = deltaTone === 'up';
  return /*#__PURE__*/React.createElement("div", {
    className: "kpi-tile"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value"
  }, value), delta && /*#__PURE__*/React.createElement("div", {
    className: 'kpi-delta ' + (isUp ? 'is-up' : 'is-down')
  }, isUp ? /*#__PURE__*/React.createElement(IconArrowUp, {
    size: 12,
    stroke: 2
  }) : /*#__PURE__*/React.createElement(IconArrowDn, {
    size: 12,
    stroke: 2
  }), /*#__PURE__*/React.createElement("span", null, delta), hint && /*#__PURE__*/React.createElement("span", {
    className: "kpi-hint"
  }, hint)));
}
function ProductThumb({
  hue = 'cream',
  size = 56
}) {
  // Stylized bottle silhouette on tinted ground.
  const grounds = {
    teal: 'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
    ember: 'linear-gradient(180deg, #FBEFE3 0%, #F5DAB8 100%)',
    cream: 'linear-gradient(180deg, #F4EFE6 0%, #EFE9DF 100%)'
  };
  const bottle = {
    teal: 'linear-gradient(180deg, #1F3A34, #142823)',
    ember: 'linear-gradient(180deg, #874720, #4F2A12)',
    cream: 'linear-gradient(180deg, #6B6760, #3D3A35)'
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "product-thumb",
    style: {
      width: size,
      height: size,
      background: grounds[hue]
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "product-thumb-bottle",
    style: {
      width: size * 0.34,
      height: size * 0.78,
      background: bottle[hue]
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "product-thumb-label"
  })));
}
function EmptyState({
  illustration,
  title,
  body,
  cta
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, illustration && /*#__PURE__*/React.createElement("img", {
    src: illustration,
    alt: "",
    width: 180
  }), /*#__PURE__*/React.createElement("div", {
    className: "empty-state-text"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "empty-state-title"
  }, title), /*#__PURE__*/React.createElement("p", {
    className: "empty-state-body"
  }, body), cta));
}
Object.assign(window, {
  StatusPill,
  BrandAvatar,
  PageHeader,
  KPITile,
  ProductThumb,
  EmptyState
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/Common.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/Dashboard.jsx
try { (() => {
// ui_kits/cockpit/Dashboard.jsx
// Dashboard screen: KPI strip + brand performance + recent orders + empty/onboarding nudge.

function Dashboard({
  onNavigate
}) {
  const topBrands = DF_DATA.brands.slice(0, 5).map((b, i) => ({
    ...b,
    pct: [82, 64, 58, 41, 22][i],
    trend: b.gmvTrend
  }));
  const recent = DF_DATA.orders.slice(0, 5);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHeader, {
    eyebrow: "This week",
    title: "Good morning, Phani.",
    subtitle: "14 orders placed across 5 brands. Two catalogs went out yesterday. Singh Hospitality just received their Premium Reserve delivery.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary"
    }, /*#__PURE__*/React.createElement(IconCalendar, {
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, "Last 7 days"), /*#__PURE__*/React.createElement(IconChev, {
      size: 12
    })), /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-primary",
      onClick: () => onNavigate('catalogs')
    }, /*#__PURE__*/React.createElement(IconCatalog, {
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, "Go to catalogs")))
  }), /*#__PURE__*/React.createElement("div", {
    className: "kpi-grid"
  }, /*#__PURE__*/React.createElement(KPITile, {
    label: "Orders this week",
    value: "14",
    delta: "+3",
    hint: "vs last week",
    deltaTone: "up"
  }), /*#__PURE__*/React.createElement(KPITile, {
    label: "GMV this week",
    value: "\u20B910,84,420",
    delta: "+12%",
    hint: "vs last week",
    deltaTone: "up"
  }), /*#__PURE__*/React.createElement(KPITile, {
    label: "Active catalogs",
    value: "3",
    delta: "1 expiring",
    deltaTone: "down"
  }), /*#__PURE__*/React.createElement(KPITile, {
    label: "Low-stock alerts",
    value: "7",
    delta: "\u22122",
    hint: "resolved",
    deltaTone: "up"
  })), /*#__PURE__*/React.createElement("div", {
    className: "dash-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "panel-title"
  }, "Brand performance"), /*#__PURE__*/React.createElement("div", {
    className: "panel-subtitle"
  }, "GMV share this week \xB7 across 5 brand principals")), /*#__PURE__*/React.createElement("a", {
    className: "panel-link",
    onClick: () => onNavigate('brands')
  }, "All brands ", /*#__PURE__*/React.createElement(IconChevR, {
    size: 12
  }))), /*#__PURE__*/React.createElement("div", {
    className: "panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-list"
  }, topBrands.map((b, i) => /*#__PURE__*/React.createElement("div", {
    className: "brand-row",
    key: b.id
  }, /*#__PURE__*/React.createElement(BrandAvatar, {
    initials: b.initials,
    hue: ['teal', 'ember', 'cream', 'teal', 'ember'][i]
  }), /*#__PURE__*/React.createElement("div", {
    className: "brand-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-row-name"
  }, b.name), /*#__PURE__*/React.createElement("div", {
    className: "brand-row-sub"
  }, b.skus, " SKUs \xB7 ", b.cohorts, " cohorts")), /*#__PURE__*/React.createElement("div", {
    className: "brand-row-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-row-bar-fill",
    style: {
      width: b.pct + '%'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: 'brand-row-trend ' + (b.trend.startsWith('−') || b.trend.startsWith('-') ? 'down' : 'up')
  }, b.trend)))))), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "panel-title"
  }, "Latest orders"), /*#__PURE__*/React.createElement("div", {
    className: "panel-subtitle"
  }, "Across all buyers")), /*#__PURE__*/React.createElement("a", {
    className: "panel-link",
    onClick: () => onNavigate('orders')
  }, "All orders ", /*#__PURE__*/React.createElement(IconChevR, {
    size: 12
  }))), /*#__PURE__*/React.createElement("div", {
    className: "panel-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mini-list"
  }, recent.map(o => /*#__PURE__*/React.createElement("div", {
    className: "mini-row",
    key: o.id
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mini-row-id"
  }, o.id), /*#__PURE__*/React.createElement("div", {
    className: "mini-row-buyer"
  }, o.buyer)), /*#__PURE__*/React.createElement(StatusPill, {
    status: o.status
  }), /*#__PURE__*/React.createElement("div", {
    className: "mini-row-total"
  }, inr(o.total)))))))));
}
window.Dashboard = Dashboard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/Orders.jsx
try { (() => {
// ui_kits/cockpit/Orders.jsx
// Orders screen: status filter chips + table + inline detail panel.

function Orders() {
  const [filter, setFilter] = React.useState('all');
  const [selected, setSelected] = React.useState('DF-2026-00470');
  const filters = [{
    id: 'all',
    label: 'All',
    count: DF_DATA.orders.length
  }, {
    id: 'received',
    label: 'Received',
    count: DF_DATA.orders.filter(o => o.status === 'received').length
  }, {
    id: 'confirmed',
    label: 'Confirmed',
    count: DF_DATA.orders.filter(o => o.status === 'confirmed').length
  }, {
    id: 'dispatched',
    label: 'Dispatched',
    count: DF_DATA.orders.filter(o => o.status === 'dispatched').length
  }, {
    id: 'delivered',
    label: 'Delivered',
    count: DF_DATA.orders.filter(o => o.status === 'delivered').length
  }];
  const rows = filter === 'all' ? DF_DATA.orders : DF_DATA.orders.filter(o => o.status === filter);
  const detail = DF_DATA.orders.find(o => o.id === selected) || DF_DATA.orders[0];

  // Fake line items for the detail
  const lines = [{
    name: 'Cabernet Sauvignon 2021',
    brand: 'WineYard Vintners',
    sku: 'VINO-CAB-750-2021',
    qty: 48,
    price: 2450,
    hue: 'teal'
  }, {
    name: 'Chenin Blanc',
    brand: 'Maison Roussel',
    sku: 'MRSL-CB-750-2022',
    qty: 24,
    price: 1640,
    hue: 'cream'
  }, {
    name: 'Indian Pale Ale',
    brand: 'Khanna Brewing Co.',
    sku: 'KHAN-IPA-330-006',
    qty: 36,
    price: 580,
    hue: 'ember'
  }];
  const timeline = ['received', 'confirmed', 'dispatched', 'delivered'];
  const currentIdx = timeline.indexOf(detail.status);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHeader, {
    eyebrow: "Orders",
    title: "Order log",
    subtitle: "All orders across every buyer and cohort. Click a row to see the line items and status timeline.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary"
    }, /*#__PURE__*/React.createElement(IconFilter, {
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, "Filter")), /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary"
    }, /*#__PURE__*/React.createElement(IconExport, {
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, "Export Tally CSV")))
  }), /*#__PURE__*/React.createElement("div", {
    className: "toolbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "toolbar-tabs"
  }, filters.map(f => /*#__PURE__*/React.createElement("button", {
    key: f.id,
    className: 'toolbar-tab' + (filter === f.id ? ' is-active' : ''),
    onClick: () => setFilter(f.id)
  }, f.label, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)',
      marginLeft: 4
    }
  }, f.count)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, /*#__PURE__*/React.createElement(IconCalendar, {
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Last 30 days"), /*#__PURE__*/React.createElement(IconChev, {
    size: 12
  }))), /*#__PURE__*/React.createElement("div", {
    className: "data-table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "data-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Order"), /*#__PURE__*/React.createElement("th", null, "Buyer"), /*#__PURE__*/React.createElement("th", null, "Catalog"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Placed"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total"))), /*#__PURE__*/React.createElement("tbody", null, rows.map(o => /*#__PURE__*/React.createElement("tr", {
    key: o.id,
    className: selected === o.id ? 'is-selected' : '',
    onClick: () => setSelected(o.id)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "sku"
  }, o.id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--cream-700)'
    }
  }, o.items, " items")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 500
    }
  }, o.buyer)), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--cream-700)'
    }
  }, o.catalog), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusPill, {
    status: o.status
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--cream-700)',
      fontSize: 12
    }
  }, o.placed), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, inr(o.total))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24
    },
    className: "order-detail"
  }, /*#__PURE__*/React.createElement("div", {
    className: "order-detail-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "order-id"
  }, detail.id, " \xB7 placed ", detail.placed), /*#__PURE__*/React.createElement("div", {
    className: "order-buyer"
  }, detail.buyer), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--cream-700)',
      marginTop: 4
    }
  }, "Via catalog ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, detail.catalog))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-secondary cockpit-btn-sm"
  }, "Download invoice"), /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-primary cockpit-btn-sm"
  }, "Mark as dispatched"))), /*#__PURE__*/React.createElement("div", {
    className: "timeline"
  }, timeline.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s,
    className: 'timeline-step' + (i < currentIdx ? ' is-done' : '') + (i === currentIdx ? ' is-current' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, DF_DATA.statusMeta[s].label)))), /*#__PURE__*/React.createElement("div", {
    className: "order-lines"
  }, lines.map((l, i) => /*#__PURE__*/React.createElement("div", {
    className: "order-line",
    key: i
  }, /*#__PURE__*/React.createElement(ProductThumb, {
    hue: l.hue,
    size: 40
  }), /*#__PURE__*/React.createElement("div", {
    className: "order-line-meta"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--cream-900)'
    }
  }, l.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--cream-700)',
      fontFamily: 'var(--font-mono)',
      marginTop: 1
    }
  }, l.brand, " \xB7 ", l.sku)), /*#__PURE__*/React.createElement("div", {
    className: "order-line-qty"
  }, l.qty, " \xD7 ", inr(l.price)), /*#__PURE__*/React.createElement("div", {
    className: "order-line-total"
  }, inr(l.qty * l.price))))), /*#__PURE__*/React.createElement("div", {
    className: "order-totals"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Subtotal"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      marginTop: 4,
      color: 'var(--cream-700)'
    }
  }, inr(detail.total / 1.18))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "GST (18%)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      marginTop: 4,
      color: 'var(--cream-700)'
    }
  }, inr(detail.total - detail.total / 1.18))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Total"), /*#__PURE__*/React.createElement("div", {
    className: "total"
  }, inr(detail.total))))));
}
window.Orders = Orders;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/Orders.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/Publisher.jsx
try { (() => {
// ui_kits/cockpit/Publisher.jsx
// Catalog publisher: 3-step builder (Cohort → Products → Review).
// Self-contained state.

function Publisher({
  onDone,
  onCancel
}) {
  const [step, setStep] = React.useState(1);
  const [cohortId, setCohortId] = React.useState('ndla');
  const [selected, setSelected] = React.useState(['p1', 'p2', 'p7']);
  const [name, setName] = React.useState('Summer Reserve');
  const [valid, setValid] = React.useState('31 May 2026');
  const cohort = DF_DATA.cohorts.find(c => c.id === cohortId);
  const products = DF_DATA.products;
  const selectedProducts = products.filter(p => selected.includes(p.id));
  const subtotal = selectedProducts.reduce((sum, p) => sum + p.price, 0);
  const toggleSel = id => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };
  const steps = [{
    n: 1,
    label: 'Choose cohort',
    meta: cohort ? `${cohort.members} buyers` : 'Pick a cohort'
  }, {
    n: 2,
    label: 'Pick products',
    meta: `${selected.length} selected`
  }, {
    n: 3,
    label: 'Review & publish',
    meta: name
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHeader, {
    eyebrow: "New catalog",
    title: "Publish to your retailers",
    subtitle: "Three steps. Your buyers see the catalog within a minute of publishing.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-ghost",
      onClick: onCancel
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary"
    }, "Save as draft"), /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-primary",
      onClick: onDone
    }, /*#__PURE__*/React.createElement(IconCheck, {
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, "Publish catalog")))
  }), /*#__PURE__*/React.createElement("div", {
    className: "publisher"
  }, /*#__PURE__*/React.createElement("div", {
    className: "step-list"
  }, steps.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.n,
    className: 'step' + (step === s.n ? ' is-active' : '') + (step > s.n ? ' is-done' : ''),
    onClick: () => setStep(s.n)
  }, /*#__PURE__*/React.createElement("div", {
    className: "step-num"
  }, step > s.n ? /*#__PURE__*/React.createElement(IconCheck, {
    size: 12,
    stroke: 2
  }) : s.n), /*#__PURE__*/React.createElement("div", {
    className: "step-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "step-label"
  }, s.label), /*#__PURE__*/React.createElement("div", {
    className: "step-meta"
  }, s.meta))))), /*#__PURE__*/React.createElement("div", null, step === 1 && /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "panel-title"
  }, "Who should see this?"), /*#__PURE__*/React.createElement("div", {
    className: "panel-subtitle"
  }, "Cohorts are rule-based groups of buyers. You can pick a single buyer or a geography instead."))), /*#__PURE__*/React.createElement("div", {
    className: "panel-body"
  }, DF_DATA.cohorts.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    className: 'product-row' + (cohortId === c.id ? ' is-selected' : ''),
    onClick: () => setCohortId(c.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: 'product-check' + (cohortId === c.id ? ' is-on' : '')
  }, cohortId === c.id && /*#__PURE__*/React.createElement(IconCheck, {
    size: 11,
    stroke: 3
  })), /*#__PURE__*/React.createElement("div", {
    className: "product-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "product-row-name"
  }, c.name), /*#__PURE__*/React.createElement("div", {
    className: "product-row-sku"
  }, c.rules)), /*#__PURE__*/React.createElement("div", {
    className: "pill",
    style: {
      background: 'var(--cream-200)',
      color: 'var(--cream-800)'
    }
  }, c.members, " buyers"))))), step === 2 && /*#__PURE__*/React.createElement("div", {
    className: "product-picker"
  }, /*#__PURE__*/React.createElement("div", {
    className: "product-picker-head"
  }, /*#__PURE__*/React.createElement("h3", null, "Pick products"), /*#__PURE__*/React.createElement("div", {
    className: "product-picker-search"
  }, /*#__PURE__*/React.createElement(IconSearch, {
    size: 14
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search by SKU or name\u2026"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "chips",
    style: {
      padding: '10px 18px',
      borderBottom: '1px solid var(--cream-300)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "chip is-on"
  }, "All brands"), /*#__PURE__*/React.createElement("span", {
    className: "chip"
  }, "WineYard"), /*#__PURE__*/React.createElement("span", {
    className: "chip"
  }, "Maison Roussel"), /*#__PURE__*/React.createElement("span", {
    className: "chip"
  }, "Khanna Brewing"), /*#__PURE__*/React.createElement("span", {
    className: "chip"
  }, "Tara Spirits")), products.map(p => {
    const isOn = selected.includes(p.id);
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      className: 'product-row' + (isOn ? ' is-selected' : ''),
      onClick: () => toggleSel(p.id)
    }, /*#__PURE__*/React.createElement("div", {
      className: 'product-check' + (isOn ? ' is-on' : '')
    }, isOn && /*#__PURE__*/React.createElement(IconCheck, {
      size: 11,
      stroke: 3
    })), /*#__PURE__*/React.createElement(ProductThumb, {
      hue: p.hue,
      size: 44
    }), /*#__PURE__*/React.createElement("div", {
      className: "product-row-meta"
    }, /*#__PURE__*/React.createElement("div", {
      className: "product-row-name"
    }, p.name), /*#__PURE__*/React.createElement("div", {
      className: "product-row-brand"
    }, p.brand, " \xB7 ", p.pack)), /*#__PURE__*/React.createElement("div", {
      className: "product-row-sku"
    }, p.sku), /*#__PURE__*/React.createElement("div", {
      className: "product-row-price"
    }, /*#__PURE__*/React.createElement("div", null, inr(p.price)), /*#__PURE__*/React.createElement("div", {
      className: "product-row-mrp"
    }, "MRP ", inr(p.mrp))));
  })), step === 3 && /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "panel-title"
  }, "Review & publish"), /*#__PURE__*/React.createElement("div", {
    className: "panel-subtitle"
  }, "Give your catalog a name and confirm the validity window."))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "eyebrow",
    style: {
      display: 'block',
      marginBottom: 6
    }
  }, "Catalog name"), /*#__PURE__*/React.createElement("input", {
    value: name,
    onChange: e => setName(e.target.value),
    style: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid var(--cream-400)',
      borderRadius: 8,
      font: 'inherit',
      fontSize: 14
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "eyebrow",
    style: {
      display: 'block',
      marginBottom: 6
    }
  }, "Valid until"), /*#__PURE__*/React.createElement("input", {
    value: valid,
    onChange: e => setValid(e.target.value),
    style: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid var(--cream-400)',
      borderRadius: 8,
      font: 'inherit',
      fontSize: 14
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1 / -1'
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "eyebrow",
    style: {
      display: 'block',
      marginBottom: 6
    }
  }, "Message to your retailers"), /*#__PURE__*/React.createElement("textarea", {
    defaultValue: "A small curated selection from our private cellar — limited cases.",
    rows: 2,
    style: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid var(--cream-400)',
      borderRadius: 8,
      font: 'inherit',
      fontSize: 14,
      resize: 'vertical'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "preview-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "catalog-hero catalog-hero-teal"
  }, /*#__PURE__*/React.createElement("h3", null, name), /*#__PURE__*/React.createElement("span", {
    className: "catalog-hero-badge published"
  }, "PREVIEW")), /*#__PURE__*/React.createElement("div", {
    className: "catalog-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "catalog-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", null, "Cohort"), /*#__PURE__*/React.createElement("strong", null, cohort?.name)), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", null, "Products"), /*#__PURE__*/React.createElement("strong", null, selected.length)), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", null, "Valid until"), /*#__PURE__*/React.createElement("strong", null, valid))))))), /*#__PURE__*/React.createElement("div", {
    className: "publish-summary"
  }, /*#__PURE__*/React.createElement("h3", null, "Catalog summary"), /*#__PURE__*/React.createElement("div", {
    className: "summary-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Cohort"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13
    }
  }, cohort?.name)), /*#__PURE__*/React.createElement("div", {
    className: "summary-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Buyers reached"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, cohort?.members)), /*#__PURE__*/React.createElement("div", {
    className: "summary-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Products"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, selected.length)), /*#__PURE__*/React.createElement("div", {
    className: "summary-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Catalog value"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inr(subtotal))), /*#__PURE__*/React.createElement("div", {
    className: "summary-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Valid until"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13
    }
  }, valid)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      padding: 12,
      background: 'var(--cream-50)',
      borderRadius: 10,
      fontSize: 12,
      color: 'var(--cream-700)',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--cream-900)'
    }
  }, "What happens next"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, "Each buyer in the cohort receives a WhatsApp link. The catalog opens in their browser \u2014 no install needed.")))));
}
window.Publisher = Publisher;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/Publisher.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/Shell.jsx
try { (() => {
// ui_kits/cockpit/Shell.jsx
// Topbar + sidebar + content area. Active nav is controlled by parent.

function Shell({
  active,
  onNavigate,
  children
}) {
  const nav = [{
    id: 'dashboard',
    label: 'Dashboard',
    Icon: IconHome
  }, {
    id: 'brands',
    label: 'Brands',
    Icon: IconBrands,
    count: 5
  }, {
    id: 'products',
    label: 'Products',
    Icon: IconProduct,
    count: 357
  }, {
    id: 'buyers',
    label: 'Buyers',
    Icon: IconBuyers,
    count: 142
  }, {
    id: 'cohorts',
    label: 'Cohorts',
    Icon: IconCohort,
    count: 4
  }, {
    id: 'pricelists',
    label: 'Price lists',
    Icon: IconPrice
  }, {
    id: 'catalogs',
    label: 'Catalogs',
    Icon: IconCatalog,
    count: 4
  }, {
    id: 'orders',
    label: 'Orders',
    Icon: IconOrders,
    count: 28
  }, {
    id: 'exports',
    label: 'Exports',
    Icon: IconExport
  }, {
    id: 'settings',
    label: 'Settings',
    Icon: IconSettings
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "cockpit-shell"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "cockpit-sidebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "32",
    height: "32",
    alt: ""
  }), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-brand-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-brand-name"
  }, "DealFlow"), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-brand-sub"
  }, "Phani Distribution")), /*#__PURE__*/React.createElement("button", {
    className: "cockpit-tenant-switch",
    title: "Switch tenant"
  }, /*#__PURE__*/React.createElement(IconChev, {
    size: 14
  }))), /*#__PURE__*/React.createElement("nav", {
    className: "cockpit-nav"
  }, nav.map(item => /*#__PURE__*/React.createElement("button", {
    key: item.id,
    className: 'cockpit-nav-item' + (active === item.id ? ' is-active' : ''),
    onClick: () => onNavigate(item.id)
  }, /*#__PURE__*/React.createElement(item.Icon, {
    size: 17
  }), /*#__PURE__*/React.createElement("span", null, item.label), item.count != null && /*#__PURE__*/React.createElement("span", {
    className: "cockpit-nav-count"
  }, item.count)))), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-sidebar-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-avatar"
  }, "PR"), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-user"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-user-name"
  }, "Phani Raju"), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-user-role"
  }, "Seller admin")), /*#__PURE__*/React.createElement("button", {
    className: "cockpit-icon-btn",
    title: "Notifications"
  }, /*#__PURE__*/React.createElement(IconBell, {
    size: 16
  })))), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-main"
  }, /*#__PURE__*/React.createElement("header", {
    className: "cockpit-topbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cockpit-search"
  }, /*#__PURE__*/React.createElement(IconSearch, {
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search brands, products, buyers, orders\u2026"
  }), /*#__PURE__*/React.createElement("kbd", null, "\u2318K")), /*#__PURE__*/React.createElement("div", {
    className: "cockpit-topbar-right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-ghost"
  }, /*#__PURE__*/React.createElement(IconExternal, {
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Open buyer app")), /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-accent"
  }, /*#__PURE__*/React.createElement(IconPlus, {
    size: 15
  }), /*#__PURE__*/React.createElement("span", null, "Publish catalog")))), /*#__PURE__*/React.createElement("main", {
    className: "cockpit-content"
  }, children)));
}
window.Shell = Shell;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/data.jsx
try { (() => {
// ui_kits/cockpit/data.jsx
// In-memory mock data + helpers shared across cockpit screens.

const brands = [{
  id: 'wy',
  name: 'WineYard Vintners',
  initials: 'WY',
  skus: 82,
  cohorts: 4,
  gmvTrend: '+12%'
}, {
  id: 'mr',
  name: 'Maison Roussel',
  initials: 'MR',
  skus: 46,
  cohorts: 3,
  gmvTrend: '+4%'
}, {
  id: 'kh',
  name: 'Khanna Brewing Co.',
  initials: 'KH',
  skus: 124,
  cohorts: 6,
  gmvTrend: '+8%'
}, {
  id: 'ts',
  name: 'Tara Spirits',
  initials: 'TS',
  skus: 38,
  cohorts: 2,
  gmvTrend: '−2%'
}, {
  id: 'av',
  name: 'Aravalli Vineyards',
  initials: 'AV',
  skus: 67,
  cohorts: 4,
  gmvTrend: '+18%'
}];
const cohorts = [{
  id: 'ndla',
  name: 'North Delhi · A-class',
  members: 12,
  rules: 'state=DL · tier=A · zone=North'
}, {
  id: 'mh-prem',
  name: 'Maharashtra Premium',
  members: 28,
  rules: 'state=MH · tier∈[A,B] · brand_focus=WY,MR'
}, {
  id: 'south',
  name: 'South India Specialty',
  members: 41,
  rules: 'state∈[KA,TN,KL,AP] · brand_focus=KH,TS'
}, {
  id: 'all',
  name: 'All buyers',
  members: 142,
  rules: 'no filter — fallback list'
}];
const buyers = [{
  id: 'b1',
  name: 'Rajan Wine Merchants',
  city: 'New Delhi',
  tier: 'A',
  credit: 250000
}, {
  id: 'b2',
  name: 'Verma & Sons',
  city: 'Gurugram',
  tier: 'A',
  credit: 400000
}, {
  id: 'b3',
  name: 'Mehta Brothers',
  city: 'Mumbai',
  tier: 'B',
  credit: 150000
}, {
  id: 'b4',
  name: 'Singh Hospitality',
  city: 'Bengaluru',
  tier: 'A',
  credit: 600000
}, {
  id: 'b5',
  name: 'Kapoor Spirits',
  city: 'Pune',
  tier: 'B',
  credit: 120000
}];
const orders = [{
  id: 'DF-2026-00471',
  buyer: 'Rajan Wine Merchants',
  items: 3,
  status: 'dispatched',
  total: 84200,
  placed: '2h ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00470',
  buyer: 'Verma & Sons',
  items: 12,
  status: 'confirmed',
  total: 218500,
  placed: '5h ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00469',
  buyer: 'Mehta Brothers',
  items: 5,
  status: 'delivered',
  total: 46820,
  placed: 'Yesterday',
  catalog: 'New Arrivals · May'
}, {
  id: 'DF-2026-00468',
  buyer: 'Singh Hospitality',
  items: 28,
  status: 'received',
  total: 612400,
  placed: 'Yesterday',
  catalog: 'Premium Reserve'
}, {
  id: 'DF-2026-00467',
  buyer: 'Kapoor Spirits',
  items: 4,
  status: 'cancelled',
  total: 18900,
  placed: '2d ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00466',
  buyer: 'Rajan Wine Merchants',
  items: 9,
  status: 'delivered',
  total: 124300,
  placed: '2d ago',
  catalog: 'Premium Reserve'
}, {
  id: 'DF-2026-00465',
  buyer: 'Mehta Brothers',
  items: 6,
  status: 'dispatched',
  total: 78200,
  placed: '3d ago',
  catalog: 'New Arrivals · May'
}];
const catalogs = [{
  id: 'c1',
  name: 'Summer Pours',
  cohort: 'North Delhi · A-class',
  products: 28,
  validUntil: '31 May',
  status: 'published',
  hue: 'teal'
}, {
  id: 'c2',
  name: 'New Arrivals · May',
  cohort: 'Maharashtra Premium',
  products: 14,
  validUntil: '15 Jun',
  status: 'published',
  hue: 'ember'
}, {
  id: 'c3',
  name: 'Premium Reserve',
  cohort: 'South India Specialty',
  products: 42,
  validUntil: '30 Jun',
  status: 'published',
  hue: 'cream'
}, {
  id: 'c4',
  name: 'Monsoon Pre-Order',
  cohort: 'All buyers',
  products: 18,
  validUntil: '—',
  status: 'draft',
  hue: 'teal'
}];
const products = [{
  id: 'p1',
  name: 'Cabernet Sauvignon 2021',
  brand: 'WineYard Vintners',
  sku: 'VINO-CAB-750-2021',
  pack: '750ml',
  mrp: 2800,
  price: 2450,
  hue: 'teal'
}, {
  id: 'p2',
  name: 'Cabernet Franc Reserve',
  brand: 'WineYard Vintners',
  sku: 'VINO-CFR-750-2020',
  pack: '750ml',
  mrp: 3400,
  price: 2980,
  hue: 'teal'
}, {
  id: 'p3',
  name: 'Chenin Blanc',
  brand: 'Maison Roussel',
  sku: 'MRSL-CB-750-2022',
  pack: '750ml',
  mrp: 1900,
  price: 1640,
  hue: 'cream'
}, {
  id: 'p4',
  name: 'Sauvignon Blanc',
  brand: 'Maison Roussel',
  sku: 'MRSL-SB-750-2022',
  pack: '750ml',
  mrp: 1800,
  price: 1550,
  hue: 'cream'
}, {
  id: 'p5',
  name: 'Indian Pale Ale',
  brand: 'Khanna Brewing Co.',
  sku: 'KHAN-IPA-330-006',
  pack: '330ml × 6',
  mrp: 720,
  price: 580,
  hue: 'ember'
}, {
  id: 'p6',
  name: 'Wheat Lager',
  brand: 'Khanna Brewing Co.',
  sku: 'KHAN-WHT-330-006',
  pack: '330ml × 6',
  mrp: 640,
  price: 520,
  hue: 'ember'
}, {
  id: 'p7',
  name: 'Single Malt 12yr',
  brand: 'Tara Spirits',
  sku: 'TARA-SM12-750',
  pack: '750ml',
  mrp: 4800,
  price: 4280,
  hue: 'teal'
}, {
  id: 'p8',
  name: 'Estate Reserve Red',
  brand: 'Aravalli Vineyards',
  sku: 'ARVL-ESR-750-2019',
  pack: '750ml',
  mrp: 3200,
  price: 2850,
  hue: 'ember'
}];
const statusMeta = {
  draft: {
    label: 'Draft',
    bg: '#EAF1EE',
    fg: '#142823',
    dot: '#1F3A34'
  },
  received: {
    label: 'Received',
    bg: '#E7EEF1',
    fg: '#2A4B59',
    dot: '#3F6A7C'
  },
  confirmed: {
    label: 'Confirmed',
    bg: '#FBEFE3',
    fg: '#6B3818',
    dot: '#C26E3A'
  },
  dispatched: {
    label: 'Dispatched',
    bg: '#FBF1DC',
    fg: '#7A5519',
    dot: '#B07D2C'
  },
  delivered: {
    label: 'Delivered',
    bg: '#ECF3EC',
    fg: '#2F5733',
    dot: '#4A7C4E'
  },
  cancelled: {
    label: 'Cancelled',
    bg: '#F6E5DF',
    fg: '#6B2615',
    dot: '#9C3A22'
  }
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
  DF_DATA: {
    brands,
    cohorts,
    buyers,
    orders,
    catalogs,
    products,
    statusMeta
  },
  inr
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/cockpit/icons.jsx
try { (() => {
// ui_kits/cockpit/icons.jsx
// Inline Lucide-style SVG icons. Stroke 1.5, currentColor.
// Kept minimal; add more as needed.

const Icon = ({
  d,
  size = 18,
  stroke = 1.5,
  fill = 'none',
  children,
  style
}) => React.createElement('svg', {
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill,
  stroke: 'currentColor',
  strokeWidth: stroke,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  style
}, children || React.createElement('path', {
  d
}));
const IconHome = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
}), React.createElement('path', {
  d: 'M9 22V12h6v10'
}));
const IconBrands = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z'
}), React.createElement('path', {
  d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'
}));
const IconProduct = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'
}), React.createElement('path', {
  d: 'M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12'
}));
const IconBuyers = p => React.createElement(Icon, p, React.createElement('circle', {
  cx: 9,
  cy: 7,
  r: 4
}), React.createElement('path', {
  d: 'M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2'
}), React.createElement('path', {
  d: 'M19 8v6m-3-3h6'
}));
const IconCohort = p => React.createElement(Icon, p, React.createElement('rect', {
  x: 3,
  y: 3,
  width: 7,
  height: 7,
  rx: 1
}), React.createElement('rect', {
  x: 14,
  y: 3,
  width: 7,
  height: 7,
  rx: 1
}), React.createElement('rect', {
  x: 3,
  y: 14,
  width: 7,
  height: 7,
  rx: 1
}), React.createElement('rect', {
  x: 14,
  y: 14,
  width: 7,
  height: 7,
  rx: 1
}));
const IconPrice = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M21 11.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7'
}), React.createElement('path', {
  d: 'M3 10h18'
}), React.createElement('path', {
  d: 'M16 19h6m-3-3v6'
}));
const IconCatalog = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M4 19V6a2 2 0 0 1 2-2h11l3 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'
}), React.createElement('path', {
  d: 'M8 9h8M8 13h8M8 17h5'
}));
const IconOrders = p => React.createElement(Icon, p, React.createElement('circle', {
  cx: 9,
  cy: 20,
  r: 1.5
}), React.createElement('circle', {
  cx: 18,
  cy: 20,
  r: 1.5
}), React.createElement('path', {
  d: 'M3 4h2l3 12h11l2-8H6'
}));
const IconExport = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'
}), React.createElement('path', {
  d: 'M7 10l5 5 5-5'
}), React.createElement('path', {
  d: 'M12 15V3'
}));
const IconSettings = p => React.createElement(Icon, p, React.createElement('circle', {
  cx: 12,
  cy: 12,
  r: 3
}), React.createElement('path', {
  d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.32.77.92 1.3 1.51 1h.09a2 2 0 0 1 0 4h-.09c-.65 0-1.25.39-1.51 1z'
}));
const IconSearch = p => React.createElement(Icon, p, React.createElement('circle', {
  cx: 11,
  cy: 11,
  r: 7
}), React.createElement('path', {
  d: 'M21 21l-4-4'
}));
const IconChev = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M6 9l6 6 6-6'
}));
const IconChevR = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M9 6l6 6-6 6'
}));
const IconArrowUp = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M5 12l5-5 5 5M10 19V7'
}));
const IconArrowDn = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M5 12l5 5 5-5M10 5v14'
}));
const IconPlus = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M12 5v14M5 12h14'
}));
const IconCheck = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M20 6L9 17l-5-5'
}));
const IconBell = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'
}), React.createElement('path', {
  d: 'M13.73 21a2 2 0 0 1-3.46 0'
}));
const IconClose = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M18 6L6 18M6 6l12 12'
}));
const IconFilter = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z'
}));
const IconExternal = p => React.createElement(Icon, p, React.createElement('path', {
  d: 'M15 3h6v6M10 14L21 3M21 14v7H3V3h7'
}));
const IconCalendar = p => React.createElement(Icon, p, React.createElement('rect', {
  x: 3,
  y: 4,
  width: 18,
  height: 18,
  rx: 2
}), React.createElement('path', {
  d: 'M16 2v4M8 2v4M3 10h18'
}));
Object.assign(window, {
  IconHome,
  IconBrands,
  IconProduct,
  IconBuyers,
  IconCohort,
  IconPrice,
  IconCatalog,
  IconOrders,
  IconExport,
  IconSettings,
  IconSearch,
  IconChev,
  IconChevR,
  IconArrowUp,
  IconArrowDn,
  IconPlus,
  IconCheck,
  IconBell,
  IconClose,
  IconFilter,
  IconExternal,
  IconCalendar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cockpit/icons.jsx", error: String((e && e.message) || e) }); }

// v2/DetailsV2.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// v2/DetailsV2.jsx
// v2 entity detail chrome — 1440px wrap, 4-tile meta strip, varied tabs per entity.
//
// Reuses from v1:
//   DetailHeader, DetailTabs, DetailActions (from details/Shared.jsx)
//   BrandPerf, ProductPerf, CustomerPerf, CohortPerf, CatalogPerf (from details/Perf.jsx)
// Plus the BRAND_DETAIL / PRODUCT_DETAIL / etc. records from details/data.jsx.

/* ────────────────────────────────────────────────
   EntityPageV2 — width-capped wrapper
   ──────────────────────────────────────────────── */
function EntityPageV2({
  label,
  header,
  meta,
  tabs,
  active,
  body,
  mode
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "v2-page"
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "v2-page-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "v2-page-inner",
    style: {
      paddingTop: 28
    }
  }, /*#__PURE__*/React.createElement(DetailHeader, _extends({}, header, {
    actions: /*#__PURE__*/React.createElement(DetailActions, {
      mode: mode
    }),
    mode: mode
  })), /*#__PURE__*/React.createElement(MetaStrip4, {
    tiles: meta
  }), /*#__PURE__*/React.createElement(DetailTabs, {
    tabs: tabs,
    active: active,
    onChange: () => {}
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-detail-body"
  }, body)));
}

/* ────────────────────────────────────────────────
   MetaStrip4 — always 4 tiles, fixed grid
   ──────────────────────────────────────────────── */
function MetaStrip4({
  tiles
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "meta-strip",
    style: {
      gridTemplateColumns: 'repeat(4, 1fr)'
    }
  }, tiles.map((t, i) => /*#__PURE__*/React.createElement("div", {
    className: "meta-tile",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, t.label), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, t.value), t.sub && /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, t.sub))));
}

/* ════════════════════════════════════════════════
   ENTITY CONFIGS — trimmed meta strips, varied tabs
   ════════════════════════════════════════════════ */

/* ── BRAND · 5 tabs, 4 meta tiles ───────────────── */
const BRAND_V2_META = (() => {
  const p = BRAND_DETAIL.perf;
  return [{
    label: 'GMV · this month',
    value: inrShort(p.gmv),
    sub: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      className: "up"
    }, "\u2191 +", p.growth, "%"), " vs last month")
  }, {
    label: 'Active buyers',
    value: `${p.activeBuyers}/${p.totalBuyers}`,
    sub: 'bought this month'
  }, {
    label: 'Low-stock SKUs',
    value: p.lowStock,
    sub: 'reorder this week'
  }, {
    label: 'Catalog freshness',
    value: `${p.daysSinceCatalog}d ago`,
    sub: 'last sent Jun 24'
  }
  // dropped: Share of portfolio (35.5%) → demoted to header subtitle
  ];
})();
const BRAND_V2_TABS = [{
  id: 'details',
  label: 'Details'
}, {
  id: 'performance',
  label: 'Performance'
}, {
  id: 'buyers',
  label: 'Buyers',
  badge: BRAND_DETAIL.perf.activeBuyers
}, {
  id: 'catalogs',
  label: 'Catalogs',
  badge: 12
}, {
  id: 'activity',
  label: 'Activity'
}];
const BRAND_V2_HEADER = {
  crumbPath: [{
    label: 'Brands'
  }, {
    label: BRAND_DETAIL.name,
    current: true
  }],
  avatar: {
    kind: 'brand',
    initials: BRAND_DETAIL.initials,
    hue: BRAND_DETAIL.hue
  },
  title: BRAND_DETAIL.name,
  status: BRAND_DETAIL.status,
  subtitle: [BRAND_DETAIL.category, BRAND_DETAIL.region, `Carried since ${BRAND_DETAIL.carriedSince}`, `${BRAND_DETAIL.perf.skus} SKUs · ${BRAND_DETAIL.perf.share}% of portfolio`]
};

/* ── PRODUCT · 4 tabs, 4 meta tiles ─────────────── */
const PRODUCT_V2_META = (() => {
  const p = PRODUCT_DETAIL.perf;
  return [{
    label: 'Units · MTD',
    value: p.units,
    sub: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      className: "up"
    }, "\u2191 +", p.growth, "%"), " vs last month")
  }, {
    label: 'Days of cover',
    value: `${p.daysOfCover} d`,
    sub: 'at current pace'
  }, {
    label: 'On hand',
    value: p.onHand,
    sub: 'bottles'
  }, {
    label: 'Sell-through',
    value: `${p.sellThrough}%`,
    sub: 'last 30 days'
  }
  // dropped: Revenue (redundant with units × ASP)
  ];
})();
const PRODUCT_V2_TABS = [{
  id: 'details',
  label: 'Details'
}, {
  id: 'performance',
  label: 'Performance'
}, {
  id: 'pricing',
  label: 'Pricing & cohorts'
}, {
  id: 'activity',
  label: 'Activity'
}
// dropped: Stock — folded into Performance
];
const PRODUCT_V2_HEADER = {
  crumbPath: [{
    label: 'Products'
  }, {
    label: PRODUCT_DETAIL.name,
    current: true
  }],
  avatar: {
    kind: 'product'
  },
  title: PRODUCT_DETAIL.name,
  status: PRODUCT_DETAIL.status,
  subtitle: [PRODUCT_DETAIL.brand, PRODUCT_DETAIL.sku, PRODUCT_DETAIL.pack, `MRP ${inrFmt(PRODUCT_DETAIL.mrp)}`]
};

/* ── CUSTOMER · 4 tabs, 4 meta tiles ────────────── */
const CUSTOMER_V2_META = (() => {
  const p = CUSTOMER_DETAIL.perf;
  return [{
    label: 'Spend · MTD',
    value: inrShort(p.spend),
    sub: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      className: "up"
    }, "\u2191 +", p.growth, "%"), " vs last month")
  }, {
    label: 'Orders · MTD',
    value: p.orders,
    sub: `AOV ${inrShort(p.aov)}`
  }, {
    label: 'Last order',
    value: p.lastOrder,
    sub: 'Cabernet Sauvignon ×24'
  }, {
    label: 'Credit used',
    value: inrShort(CUSTOMER_DETAIL.creditUsed),
    sub: `of ${inrShort(CUSTOMER_DETAIL.creditLimit)} · 64%`
  }
  // dropped: Buyer since "5 yrs · loyal" — sentiment, not metric. Moved to header subtitle.
  ];
})();
const CUSTOMER_V2_TABS = [{
  id: 'details',
  label: 'Details'
}, {
  id: 'performance',
  label: 'Performance'
}, {
  id: 'orders',
  label: 'Orders',
  badge: CUSTOMER_DETAIL.perf.orders
}, {
  id: 'activity',
  label: 'Activity'
}
// dropped: Invoices — folded into Activity log
];
const CUSTOMER_V2_HEADER = {
  crumbPath: [{
    label: 'Customers'
  }, {
    label: CUSTOMER_DETAIL.name,
    current: true
  }],
  avatar: {
    kind: 'brand',
    initials: CUSTOMER_DETAIL.initials,
    hue: CUSTOMER_DETAIL.hue
  },
  title: CUSTOMER_DETAIL.name,
  status: CUSTOMER_DETAIL.status,
  subtitle: [/*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "pill",
    style: {
      background: 'var(--ember-50)',
      color: 'var(--ember-700)',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500
    }
  }, "Tier ", CUSTOMER_DETAIL.tier)), CUSTOMER_DETAIL.city, `Buyer since ${CUSTOMER_DETAIL.buyerSince} · 5 yrs loyal`, 'Net 21 terms']
};

/* ── COHORT · 3 tabs, 4 meta tiles ──────────────── */
const COHORT_V2_META = (() => {
  const p = COHORT_DETAIL.perf;
  return [{
    label: 'GMV · MTD',
    value: inrShort(p.gmv),
    sub: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      className: "up"
    }, "\u2191 +", p.growth, "%"), " vs last month")
  }, {
    label: 'Active members',
    value: `${p.activeMembers}/${COHORT_DETAIL.members}`,
    sub: 'ordered this month'
  }, {
    label: 'AOV',
    value: inrShort(p.avgOrderValue),
    sub: 'across this cohort'
  }, {
    label: 'Conversion',
    value: `${p.conversionRate}%`,
    sub: 'catalog → order'
  }
  // dropped: Members count — moved to header subtitle
  ];
})();
const COHORT_V2_TABS = [{
  id: 'details',
  label: 'Details & rules'
}, {
  id: 'performance',
  label: 'Performance'
}, {
  id: 'activity',
  label: 'Activity'
}
// dropped: Members (merged into Details), Catalogs (merged into Activity)
];
const COHORT_V2_HEADER = {
  crumbPath: [{
    label: 'Cohorts'
  }, {
    label: COHORT_DETAIL.name,
    current: true
  }],
  avatar: {
    kind: 'brand',
    initials: 'MP',
    hue: 'ember'
  },
  title: COHORT_DETAIL.name,
  status: COHORT_DETAIL.status,
  subtitle: [`${COHORT_DETAIL.members} of ${COHORT_DETAIL.totalBuyers} buyers`, COHORT_DETAIL.description.slice(0, 56) + '…', COHORT_DETAIL.createdBy]
};

/* ── CATALOG · 3 tabs, 4 meta tiles ─────────────── */
const CATALOG_V2_META = (() => {
  const p = CATALOG_DETAIL.perf;
  return [{
    label: 'GMV',
    value: inrShort(p.gmv),
    sub: /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      className: "up"
    }, "\u2191 +", p.growth, "%"), " vs previous catalog")
  }, {
    label: 'Orders',
    value: p.orders,
    sub: `${p.conversionRate}% conversion`
  }, {
    label: 'Unique viewers',
    value: `${p.uniqueViewers}/${CATALOG_DETAIL.cohortMembers}`,
    sub: 'opened in app'
  }, {
    label: 'Days left',
    value: `${CATALOG_DETAIL.daysLeft} d`,
    sub: `valid until ${CATALOG_DETAIL.validUntil}`
  }
  // dropped: Products count — moved to header subtitle
  ];
})();
const CATALOG_V2_TABS = [{
  id: 'details',
  label: 'Composition'
}, {
  id: 'performance',
  label: 'Performance'
}, {
  id: 'buyers',
  label: 'Buyers',
  badge: CATALOG_DETAIL.cohortMembers
}
// dropped: Activity — for catalogs the funnel IS the activity
];
const CATALOG_V2_HEADER = {
  crumbPath: [{
    label: 'Catalogs'
  }, {
    label: CATALOG_DETAIL.name,
    current: true
  }],
  avatar: {
    kind: 'catalog',
    initials: 'SP'
  },
  title: CATALOG_DETAIL.name,
  status: CATALOG_DETAIL.status,
  subtitle: [`${CATALOG_DETAIL.products} products · ${CATALOG_DETAIL.brandsCovered} brands`, `Cohort: ${CATALOG_DETAIL.cohort}`, `Valid ${CATALOG_DETAIL.validFrom} → ${CATALOG_DETAIL.validUntil}`, `Published by ${CATALOG_DETAIL.publishedBy}`]
};
Object.assign(window, {
  EntityPageV2,
  MetaStrip4,
  BRAND_V2_META,
  BRAND_V2_TABS,
  BRAND_V2_HEADER,
  PRODUCT_V2_META,
  PRODUCT_V2_TABS,
  PRODUCT_V2_HEADER,
  CUSTOMER_V2_META,
  CUSTOMER_V2_TABS,
  CUSTOMER_V2_HEADER,
  COHORT_V2_META,
  COHORT_V2_TABS,
  COHORT_V2_HEADER,
  CATALOG_V2_META,
  CATALOG_V2_TABS,
  CATALOG_V2_HEADER
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "v2/DetailsV2.jsx", error: String((e && e.message) || e) }); }

// v2/Lens.jsx
try { (() => {
// v2/Lens.jsx
// Lens-pair demos. The point: relational data viewed from inverse sides
// is NOT duplicate UI — each side answers a different question in its
// own context. This file renders four such pairs as side-by-side cards.

/* ────────────────────────────────────────────────
   LensPair — left card / arrow / right card
   ──────────────────────────────────────────────── */
function LensPair({
  leftEyebrow,
  leftTitle,
  leftBody,
  rightEyebrow,
  rightTitle,
  rightBody,
  joinNote
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "lens-pair"
  }, /*#__PURE__*/React.createElement("article", {
    className: "lens-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lens-card-eyebrow"
  }, leftEyebrow), /*#__PURE__*/React.createElement("h3", {
    className: "lens-card-title"
  }, leftTitle), /*#__PURE__*/React.createElement("div", {
    className: "lens-card-body"
  }, leftBody)), /*#__PURE__*/React.createElement("div", {
    className: "lens-join"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lens-join-line"
  }), /*#__PURE__*/React.createElement("div", {
    className: "lens-join-pill"
  }, joinNote), /*#__PURE__*/React.createElement("div", {
    className: "lens-join-line"
  })), /*#__PURE__*/React.createElement("article", {
    className: "lens-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lens-card-eyebrow"
  }, rightEyebrow), /*#__PURE__*/React.createElement("h3", {
    className: "lens-card-title"
  }, rightTitle), /*#__PURE__*/React.createElement("div", {
    className: "lens-card-body"
  }, rightBody)));
}

/* ────────────────────────────────────────────────
   List row helper for lens bodies
   ──────────────────────────────────────────────── */
function LensRow({
  avatar,
  name,
  sub,
  right
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "lens-row"
  }, avatar, /*#__PURE__*/React.createElement("div", {
    className: "lens-row-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lens-row-name"
  }, name), sub && /*#__PURE__*/React.createElement("div", {
    className: "lens-row-sub"
  }, sub)), /*#__PURE__*/React.createElement("div", {
    className: "lens-row-right"
  }, right));
}

/* ════════════════════════════════════════════════
   PAIR 1 — Brand · top buyers   vs.   Customer · top brands
   The Singh Hospitality × WineYard relationship from both sides.
   ════════════════════════════════════════════════ */
function LensBrandBuyers() {
  return /*#__PURE__*/React.createElement(LensPair, {
    leftEyebrow: "WineYard Vintners \u2192 Performance",
    leftTitle: "Top buyers of this brand",
    leftBody: /*#__PURE__*/React.createElement(React.Fragment, null, BRAND_DETAIL.perf.topBuyers.map((b, i) => /*#__PURE__*/React.createElement(LensRow, {
      key: i,
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-rank"
      }, i + 1),
      name: b.name,
      sub: `${b.city.toUpperCase()} · ${b.orders} orders`,
      right: /*#__PURE__*/React.createElement("span", {
        className: "lens-money"
      }, inrShort(b.spend))
    }))),
    joinNote: "One join, two views",
    rightEyebrow: "Singh Hospitality \u2192 Performance",
    rightTitle: "Brand mix \xB7 where the spend goes",
    rightBody: /*#__PURE__*/React.createElement(React.Fragment, null, CUSTOMER_DETAIL.perf.brandMix.map((b, i) => /*#__PURE__*/React.createElement(LensRow, {
      key: i,
      avatar: /*#__PURE__*/React.createElement(BrandAvatarSm, {
        initials: b.name === 'WineYard' ? 'WY' : b.name.slice(0, 2).toUpperCase(),
        hue: b.hue,
        size: 26
      }),
      name: b.name,
      sub: /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 60,
          height: 4,
          background: 'var(--cream-200)',
          borderRadius: 999,
          display: 'inline-block',
          overflow: 'hidden'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'block',
          height: '100%',
          width: b.share + '%',
          background: b.hue === 'ember' ? 'var(--ember-400)' : b.hue === 'cream' ? 'var(--cream-600)' : 'var(--teal-500)'
        }
      })), b.share, "% of spend"),
      right: /*#__PURE__*/React.createElement("span", {
        className: "lens-money"
      }, inrShort(CUSTOMER_DETAIL.perf.spend * b.share / 100))
    })))
  });
}

/* ════════════════════════════════════════════════
   PAIR 2 — Brand · top products   vs.   Product · which brand + siblings
   ════════════════════════════════════════════════ */
function LensBrandProducts() {
  return /*#__PURE__*/React.createElement(LensPair, {
    leftEyebrow: "WineYard Vintners \u2192 Performance",
    leftTitle: "Top SKUs",
    leftBody: /*#__PURE__*/React.createElement(React.Fragment, null, BRAND_DETAIL.perf.topSkus.map((s, i) => /*#__PURE__*/React.createElement(LensRow, {
      key: i,
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-bottle"
      }, /*#__PURE__*/React.createElement("i", null)),
      name: s.name,
      sub: /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5
        }
      }, s.sku),
      right: /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: 'right'
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "lens-money"
      }, inrShort(s.gmv)), /*#__PURE__*/React.createElement("div", {
        className: "lens-row-tiny"
      }, s.units, " units"))
    }))),
    joinNote: "Product belongs to brand",
    rightEyebrow: "Cabernet Sauvignon 2021 \u2192 Details",
    rightTitle: "Brand parent \xB7 sibling SKUs",
    rightBody: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "lens-parent"
    }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
      initials: "WY",
      hue: "teal",
      size: 32
    }), /*#__PURE__*/React.createElement("div", {
      className: "lens-parent-meta"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lens-parent-name"
    }, "WineYard Vintners"), /*#__PURE__*/React.createElement("div", {
      className: "lens-parent-sub"
    }, "Carried since Apr 2019 \xB7 82 SKUs \xB7 18% margin")), /*#__PURE__*/React.createElement("a", {
      className: "lens-parent-link"
    }, "Open brand \u2192")), /*#__PURE__*/React.createElement("div", {
      className: "lens-section-eyebrow"
    }, "Other SKUs in this brand"), BRAND_DETAIL.perf.topSkus.filter(s => s.sku !== PRODUCT_DETAIL.sku).map((s, i) => /*#__PURE__*/React.createElement(LensRow, {
      key: i,
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-bottle small"
      }, /*#__PURE__*/React.createElement("i", null)),
      name: s.name,
      sub: /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5
        }
      }, s.sku),
      right: /*#__PURE__*/React.createElement("span", {
        className: "lens-row-tiny"
      }, s.units, " units \xB7 ", inrShort(s.gmv))
    })))
  });
}

/* ════════════════════════════════════════════════
   PAIR 3 — Cohort · members   vs.   Customer · cohorts they're in
   ════════════════════════════════════════════════ */
function LensCohortMembers() {
  return /*#__PURE__*/React.createElement(LensPair, {
    leftEyebrow: "Maharashtra Premium \u2192 Details",
    leftTitle: "Members of this cohort",
    leftBody: /*#__PURE__*/React.createElement(React.Fragment, null, COHORT_DETAIL.perf.topMembers.map((m, i) => /*#__PURE__*/React.createElement(LensRow, {
      key: i,
      avatar: /*#__PURE__*/React.createElement(BrandAvatarSm, {
        initials: m.name.slice(0, 2).toUpperCase(),
        hue: i === 0 ? 'cream' : i === 1 ? 'teal' : 'ember',
        size: 26
      }),
      name: m.name,
      sub: `${m.city.toUpperCase()} · ${m.orders} orders`,
      right: /*#__PURE__*/React.createElement("span", {
        className: "lens-money"
      }, inrShort(m.spend))
    })), /*#__PURE__*/React.createElement("div", {
      className: "lens-footer"
    }, "+ 24 other members")),
    joinNote: "Many-to-many",
    rightEyebrow: "Mehta Brothers \u2192 Details",
    rightTitle: "Cohorts this buyer belongs to",
    rightBody: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(LensRow, {
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-cohort-dot",
        style: {
          background: 'var(--ember-400)'
        }
      }),
      name: "Maharashtra Premium",
      sub: "Geo + tier rule \xB7 A-class only",
      right: /*#__PURE__*/React.createElement("span", {
        className: "lens-row-primary"
      }, "Primary")
    }), /*#__PURE__*/React.createElement(LensRow, {
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-cohort-dot",
        style: {
          background: 'var(--teal-500)'
        }
      }),
      name: "Hospitality",
      sub: "Vertical rule \xB7 hotels & banquets",
      right: /*#__PURE__*/React.createElement("span", {
        className: "lens-row-tiny"
      }, "Secondary")
    }), /*#__PURE__*/React.createElement(LensRow, {
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-cohort-dot",
        style: {
          background: 'var(--cream-600)'
        }
      }),
      name: "Reserve allocation",
      sub: "Manual \xB7 Q3 premium drop list",
      right: /*#__PURE__*/React.createElement("span", {
        className: "lens-row-tiny"
      }, "Manual")
    }), /*#__PURE__*/React.createElement("div", {
      className: "lens-footer"
    }, "Price list applied: ", /*#__PURE__*/React.createElement("b", null, "MH Premium \xB7 FY26"), " (highest priority)"))
  });
}

/* ════════════════════════════════════════════════
   PAIR 4 — Catalog · who saw it   vs.   Customer · catalogs sent to them
   ════════════════════════════════════════════════ */
function LensCatalogBuyers() {
  return /*#__PURE__*/React.createElement(LensPair, {
    leftEyebrow: "Summer Pours \u2192 Buyers",
    leftTitle: "12 buyers received this catalog",
    leftBody: /*#__PURE__*/React.createElement(React.Fragment, null, CATALOG_DETAIL.perf.buyers.map((b, i) => /*#__PURE__*/React.createElement(LensRow, {
      key: i,
      avatar: /*#__PURE__*/React.createElement(BrandAvatarSm, {
        initials: b.name.slice(0, 2).toUpperCase(),
        hue: i % 3 === 0 ? 'teal' : i % 3 === 1 ? 'ember' : 'cream',
        size: 26
      }),
      name: b.name,
      sub: `${b.city.toUpperCase()} · ${b.opened === 'yes' ? 'Opened in app' : 'Not opened'}`,
      right: b.orders > 0 ? /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: 'right'
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "lens-money"
      }, inrShort(b.gmv)), /*#__PURE__*/React.createElement("div", {
        className: "lens-row-tiny"
      }, b.orders, " orders")) : /*#__PURE__*/React.createElement("span", {
        className: "lens-row-tiny",
        style: {
          color: 'var(--warning-700)'
        }
      }, "Did not order")
    }))),
    joinNote: "Same send, both sides",
    rightEyebrow: "Singh Hospitality \u2192 Activity",
    rightTitle: "Catalogs sent to this buyer",
    rightBody: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(LensRow, {
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-cat-thumb",
        style: {
          background: 'linear-gradient(135deg, #346A5C, #1F3A34)'
        }
      }),
      name: "Summer Pours",
      sub: "Jun 24 \xB7 Live \xB7 14 buyers in cohort",
      right: /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: 'right'
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "lens-money"
      }, inrShort(184000)), /*#__PURE__*/React.createElement("div", {
        className: "lens-row-tiny"
      }, "Ordered 3\xD7"))
    }), /*#__PURE__*/React.createElement(LensRow, {
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-cat-thumb",
        style: {
          background: 'linear-gradient(135deg, #DC9655, #C26E3A)'
        }
      }),
      name: "Premium Reserve",
      sub: "Jun 12 \xB7 Live \xB7 18 buyers in cohort",
      right: /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: 'right'
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "lens-money"
      }, inrShort(124000)), /*#__PURE__*/React.createElement("div", {
        className: "lens-row-tiny"
      }, "Ordered 2\xD7"))
    }), /*#__PURE__*/React.createElement(LensRow, {
      avatar: /*#__PURE__*/React.createElement("div", {
        className: "lens-cat-thumb",
        style: {
          background: 'linear-gradient(135deg, #C9BFAC, #A89E89)'
        }
      }),
      name: "Vintage Drop",
      sub: "May 30 \xB7 Ended \xB7 28 buyers in cohort",
      right: /*#__PURE__*/React.createElement("span", {
        className: "lens-row-tiny",
        style: {
          color: 'var(--warning-700)'
        }
      }, "Did not order")
    }), /*#__PURE__*/React.createElement("div", {
      className: "lens-footer"
    }, "Open-rate ", /*#__PURE__*/React.createElement("b", null, "4 of 4 last quarter"), " \xB7 order-rate 3 of 4"))
  });
}

/* ────────────────────────────────────────────────
   LensExplainer — a callout at the top of the lens
   section. Sets up the why.
   ──────────────────────────────────────────────── */
function LensExplainer() {
  return /*#__PURE__*/React.createElement("div", {
    className: "lens-explainer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-eyebrow",
    style: {
      color: 'var(--ember-700)'
    }
  }, "The repetition question"), /*#__PURE__*/React.createElement("h2", {
    className: "lens-explainer-title"
  }, "Same join, both sides. Each lens earns its place."), /*#__PURE__*/React.createElement("p", {
    className: "lens-explainer-body"
  }, "A buyer's orders show on the Customer detail page ", /*#__PURE__*/React.createElement("em", null, "and"), " on the Brand detail page ", /*#__PURE__*/React.createElement("em", null, "and"), " on the Catalog detail page. That's not duplication \u2014 it's the same relational data viewed from the side that matters in context. The pairs below show how each view answers a different question."));
}
Object.assign(window, {
  LensPair,
  LensRow,
  LensExplainer,
  LensBrandBuyers,
  LensBrandProducts,
  LensCohortMembers,
  LensCatalogBuyers
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "v2/Lens.jsx", error: String((e && e.message) || e) }); }

// v2/Modules.jsx
try { (() => {
// v2/Modules.jsx
// Six landing-page renderings, all sharing the same chrome.
// Each module returns a React node: a PageHeaderV2, an InsightStrip4,
// an AttentionRail, a FilterBar, and a body (list table OR tile grid).
//
// Defaults per module:
//   Brands     — List   (5 brands, but the rich row is the right read)
//   Products   — List   (357 items — must scan dense)
//   Customers  — List   (142 buyers — same)
//   Cohorts    — Grid   (4 — tiles do the work)
//   Catalogs   — Grid   (covers have visual identity)
//   Orders     — List   (transactional — table is correct)

/* ============================================================
   Helpers
   ============================================================ */
function fmtGrowth(g) {
  if (g > 0) return /*#__PURE__*/React.createElement("span", {
    className: "growth-up"
  }, "\u2191 +", g.toFixed(1), "%");
  if (g < 0) return /*#__PURE__*/React.createElement("span", {
    className: "growth-down"
  }, "\u2193 ", g.toFixed(1), "%");
  return /*#__PURE__*/React.createElement("span", {
    className: "growth-flat"
  }, "\xB7 flat");
}

/* ============================================================
   BRANDS
   ============================================================ */
function BrandsLandingV2() {
  const sorted = [...BRANDS_DATA].sort((a, b) => b.gmv - a.gmv);
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Brands \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Portfolio",
    title: "Brands",
    subtitle: "Five brand principals. Phani Distribution carries them across 142 buyers in 6 cohorts. This is your portfolio at a glance.",
    horizon: "This month",
    secondary: {
      label: 'Invite a principal',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "9",
        cy: "7",
        r: "4"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M19 8v6M22 11h-6"
      }))
    },
    primary: "Add a brand"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Portfolio GMV',
      value: inrShort(PORTFOLIO.gmv),
      delta: '+8.3%',
      deltaTone: 'up',
      sub: 'vs last month',
      tone: 'accent'
    }, {
      label: 'Brands carried',
      value: PORTFOLIO.brandsCarried,
      sub: `${PORTFOLIO.activeBuyersAcross} of ${PORTFOLIO.totalBuyers} buyers active`
    }, {
      label: 'Need attention',
      value: PORTFOLIO.brandsAtRisk,
      sub: '3 alerts open',
      tone: 'warn'
    }, {
      label: 'Catalog freshness',
      value: `${PORTFOLIO.catalogFresh} / ${PORTFOLIO.brandsCarried}`,
      sub: 'published in last 14 days'
    }]
  }), /*#__PURE__*/React.createElement(AttentionRail, {
    items: [{
      kind: 'risk',
      subject: 'Tara Spirits',
      title: 'GMV down 8% · stale catalog 28d',
      hint: 'Active buyers fell from 18 to 14. No new catalog since 2 May.',
      action: 'Call principal'
    }, {
      kind: 'opportunity',
      subject: 'Aravalli Vineyards',
      title: 'New peak, growth +18%',
      hint: 'Asked to expand Q3 allocation last call. Worth a follow-up.',
      action: 'Send proposal'
    }, {
      kind: 'info',
      subject: 'WineYard Vintners',
      title: '35.5% of portfolio · concentration risk',
      hint: 'One brand · ₹16.8 L this month. Loss of WY would halve your run rate.',
      action: 'See dependency'
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: "5 brands",
    searchPlaceholder: "Search brand or category\u2026",
    chips: ['All categories', 'Wines', 'Beer', 'Spirits', 'At risk'],
    activeChip: "All categories",
    view: "list",
    sortBy: "GMV (high \u2192 low)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 320
    }
  }, "Brand"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "GMV \xB7 MTD"), /*#__PURE__*/React.createElement("th", null, "Growth"), /*#__PURE__*/React.createElement("th", null, "Share of portfolio"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Active buyers"), /*#__PURE__*/React.createElement("th", null, "Catalog"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, sorted.map(b => /*#__PURE__*/React.createElement("tr", {
    key: b.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent"
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: b.initials,
    hue: b.hue,
    size: 38
  }), /*#__PURE__*/React.createElement("div", {
    className: "ent-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ent-name"
  }, b.name), /*#__PURE__*/React.createElement("div", {
    className: "ent-sub"
  }, b.category.toUpperCase(), " \xB7 ", b.region, " \xB7 ", b.skus, " SKUs")))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-display"
  }, inrShort(b.gmv))), /*#__PURE__*/React.createElement("td", null, fmtGrowth(b.growth)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "v2-share"
  }, /*#__PURE__*/React.createElement("div", {
    className: 'v2-share-bar' + (b.hue === 'ember' ? ' is-ember' : b.hue === 'cream' ? ' is-cream' : '')
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: b.share * 2.4 + '%'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "v2-share-num"
  }, b.share.toFixed(1), "% of \u20B947.3 L"))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, b.activeBuyers, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)'
    }
  }, " / ", b.totalBuyers)), /*#__PURE__*/React.createElement("td", null, b.daysSinceCatalog <= 14 ? /*#__PURE__*/React.createElement("span", {
    className: "v2-status is-success"
  }, b.daysSinceCatalog, "d ago") : /*#__PURE__*/React.createElement("span", {
    className: "v2-status is-warning"
  }, b.daysSinceCatalog, "d ago")), /*#__PURE__*/React.createElement("td", {
    className: "chev"
  }, "\u203A")))))));
}

/* ============================================================
   PRODUCTS
   ============================================================ */
function ProductsLandingV2() {
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Products \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Catalog",
    title: "Products",
    subtitle: "357 SKUs across 5 brands. 8 out of stock, 24 running low \u2014 those are the ones to chase this week.",
    horizon: "This month",
    secondary: {
      label: 'Bulk import',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M17 8l-5-5-5 5"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 3v12"
      }))
    },
    primary: "Add a product"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Active SKUs',
      value: PRODUCTS_AGG.active,
      sub: `${PRODUCTS_AGG.total} total · 23 archived`
    }, {
      label: 'Out of stock',
      value: PRODUCTS_AGG.outOfStock,
      sub: 'replenish urgently',
      tone: 'warn'
    }, {
      label: 'Low stock',
      value: PRODUCTS_AGG.lowStock,
      sub: '< 14 days of cover'
    }, {
      label: 'Revenue',
      value: inrShort(PRODUCTS_AGG.gmv),
      delta: '+8.3%',
      deltaTone: 'up',
      sub: 'vs last month'
    }]
  }), /*#__PURE__*/React.createElement(AttentionRail, {
    items: [{
      kind: 'risk',
      subject: 'Estate Chardonnay 2022',
      title: 'Out of stock · 9 days',
      hint: 'Sold 92 last month. Two buyers waiting on the next pour.',
      action: 'Reorder from WY'
    }, {
      kind: 'risk',
      subject: 'Cabernet Franc Reserve',
      title: '4 days of cover left',
      hint: 'Faster sell-through than expected — bumped 22%. Reserve more this cycle.',
      action: 'Bump allocation'
    }, {
      kind: 'info',
      subject: 'Aravalli Mead',
      title: 'Fastest mover · +34% units',
      hint: 'Doubled buyers in 60 days. Consider featuring in next catalog.',
      action: 'Feature in catalog'
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: `Showing 8 of ${PRODUCTS_AGG.total}`,
    searchPlaceholder: "Search product, SKU, brand\u2026",
    chips: ['All brands', 'Red wine', 'White wine', 'Beer', 'Spirits', 'Low stock'],
    activeChip: "All brands",
    view: "list",
    sortBy: "GMV (high \u2192 low)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 340
    }
  }, "Product"), /*#__PURE__*/React.createElement("th", null, "Brand"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "On hand"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Days cover"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Units \xB7 MTD"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Revenue"), /*#__PURE__*/React.createElement("th", null, "Growth"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, PRODUCTS_DATA.map(p => /*#__PURE__*/React.createElement("tr", {
    key: p.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 10,
      background: 'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      padding: '0 0 4px',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 10,
      height: 26,
      borderRadius: '20% 20% 8% 8% / 8% 8% 4% 4%',
      background: 'linear-gradient(180deg, #1F3A34, #142823)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "ent-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ent-name"
  }, p.name), /*#__PURE__*/React.createElement("div", {
    className: "ent-sub"
  }, p.sku, " \xB7 ", p.category)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: p.brandInitials,
    hue: p.brandHue,
    size: 22
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5
    }
  }, p.brand))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, p.onHand), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, p.daysCover === 0 ? /*#__PURE__*/React.createElement("span", {
    className: "growth-down"
  }, "0d") : p.daysCover < 7 ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--warning-700)',
      fontWeight: 600,
      fontFamily: 'var(--font-mono)'
    }
  }, p.daysCover, "d") : /*#__PURE__*/React.createElement("span", null, p.daysCover, "d")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, p.units), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-display"
  }, inrShort(p.gmv))), /*#__PURE__*/React.createElement("td", null, fmtGrowth(p.growth)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusTagV2, {
    label: p.status.label,
    tone: p.status.tone
  })), /*#__PURE__*/React.createElement("td", {
    className: "chev"
  }, "\u203A")))))));
}

/* ============================================================
   CUSTOMERS
   ============================================================ */
function CustomersLandingV2() {
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Customers \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Buyers",
    title: "Customers",
    subtitle: "142 retailers across 6 cohorts. 89 active this month. The Tier-A names buy 70% of revenue \u2014 that's where dues sit too.",
    horizon: "This month",
    secondary: {
      label: 'Invite buyer',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M22 2L11 13"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M22 2l-7 20-4-9-9-4 20-7z"
      }))
    },
    primary: "Add a customer"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Active buyers',
      value: `${CUSTOMERS_AGG.active}/${CUSTOMERS_AGG.total}`,
      sub: '62.7% of base ordered'
    }, {
      label: 'Spend · MTD',
      value: inrShort(CUSTOMERS_AGG.spend),
      delta: '+8.3%',
      deltaTone: 'up',
      sub: 'vs last month'
    }, {
      label: 'Dormant > 30d',
      value: CUSTOMERS_AGG.dormant,
      sub: 'haven\'t ordered in a month',
      tone: 'warn'
    }, {
      label: 'Outstanding dues',
      value: inrShort(CUSTOMERS_AGG.duesTotal),
      sub: 'across 7 buyers'
    }]
  }), /*#__PURE__*/React.createElement(AttentionRail, {
    items: [{
      kind: 'risk',
      subject: 'Capitol Spirits',
      title: 'Dormant 32 days · ₹92K dues',
      hint: 'Last order 5 weeks ago. Maxed credit line and stopped responding to catalogs.',
      action: 'Call buyer'
    }, {
      kind: 'opportunity',
      subject: 'Rajan Wine Merchants',
      title: 'Spend up 32% — tier upgrade ready',
      hint: '₹2.68 L this month, near A-class threshold (₹3 L over 3 months).',
      action: 'Promote to Tier A'
    }, {
      kind: 'info',
      subject: 'Singh Hospitality',
      title: 'Largest exposure · ₹3.84 L credit used',
      hint: '64% utilised. Always-on time historically. Just a number to keep an eye on.',
      action: 'View ledger'
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: `Showing 7 of ${CUSTOMERS_AGG.total}`,
    searchPlaceholder: "Search buyer, city, GSTIN\u2026",
    chips: ['All tiers', 'Tier A', 'Tier B', 'Dormant', 'Has dues'],
    activeChip: "All tiers",
    view: "list",
    sortBy: "Spend (high \u2192 low)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 320
    }
  }, "Buyer"), /*#__PURE__*/React.createElement("th", null, "Cohort"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Spend \xB7 MTD"), /*#__PURE__*/React.createElement("th", null, "Growth"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Orders"), /*#__PURE__*/React.createElement("th", null, "Last order"), /*#__PURE__*/React.createElement("th", null, "Credit"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, CUSTOMERS_DATA.map(c => /*#__PURE__*/React.createElement("tr", {
    key: c.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent"
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: c.initials,
    hue: c.hue,
    size: 38
  }), /*#__PURE__*/React.createElement("div", {
    className: "ent-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ent-name"
  }, c.name, /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 8,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--ember-700)',
      background: 'var(--ember-50)',
      padding: '1px 6px',
      borderRadius: 4,
      fontWeight: 600
    }
  }, c.tier)), /*#__PURE__*/React.createElement("div", {
    className: "ent-sub"
  }, c.city.toUpperCase())))), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 12.5,
      color: 'var(--cream-800)'
    }
  }, c.cohort), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-display"
  }, inrShort(c.spend))), /*#__PURE__*/React.createElement("td", null, fmtGrowth(c.growth)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, c.orders), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12
    }
  }, c.lastOrder), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-share-bar"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: Math.round(c.credit.used / c.credit.limit * 100) + '%',
      background: c.credit.used / c.credit.limit > 0.75 ? 'var(--warning-500)' : 'var(--teal-500)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "v2-share-num"
  }, inrShort(c.credit.used), " / ", inrShort(c.credit.limit)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusTagV2, {
    label: c.status.label,
    tone: c.status.tone
  })), /*#__PURE__*/React.createElement("td", {
    className: "chev"
  }, "\u203A")))))));
}

/* ============================================================
   COHORTS  (Grid default — small set)
   ============================================================ */
function CohortsLandingV2() {
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Cohorts \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Segmentation",
    title: "Cohorts",
    subtitle: "Four buyer groups defined by geo, tier, and brand affinity. Each one gets its own catalogs and price list.",
    horizon: "This month",
    secondary: {
      label: 'Publish catalog',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M4 4h16v16H4z"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M4 9h16"
      }))
    },
    primary: "New cohort"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Cohorts',
      value: COHORTS_AGG.total,
      sub: `covering ${COHORTS_AGG.members} of ${COHORTS_AGG.totalBuyers} buyers`
    }, {
      label: 'Combined GMV',
      value: inrShort(COHORTS_AGG.gmv),
      delta: '+11.2%',
      deltaTone: 'up',
      sub: 'vs last month',
      tone: 'accent'
    }, {
      label: 'Avg conversion',
      value: `${COHORTS_AGG.conversion}%`,
      sub: 'catalog → order'
    }, {
      label: 'Uncategorised',
      value: '62 buyers',
      sub: 'not in any cohort',
      tone: 'warn'
    }]
  }), /*#__PURE__*/React.createElement(AttentionRail, {
    items: [{
      kind: 'opportunity',
      subject: 'South India Specialty',
      title: 'Best mover · +18% MTD',
      hint: '14 of 18 members ordered, vs 9 last month. Worth a deeper push catalog.',
      action: 'Build catalog'
    }, {
      kind: 'risk',
      subject: 'Hospitality',
      title: 'Conversion 28% — below threshold',
      hint: 'Catalog last refreshed 6 weeks ago. Hotels expect monthly cadence.',
      action: 'Refresh catalog'
    }, {
      kind: 'info',
      subject: '62 buyers uncategorised',
      title: 'Sitting outside every cohort',
      hint: 'They get base price list only. Auto-suggest based on order history?',
      action: 'Review buyers'
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: "4 cohorts",
    searchPlaceholder: "Search cohort or rule\u2026",
    chips: ['All', 'Geo-based', 'Tier-based', 'Brand affinity'],
    activeChip: "All",
    view: "grid",
    sortBy: "GMV (high \u2192 low)"
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-grid-body"
  }, COHORTS_DATA.map(c => /*#__PURE__*/React.createElement("article", {
    key: c.id,
    className: "v2-coh-tile"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-head"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "v2-coh-name"
  }, c.name)), /*#__PURE__*/React.createElement(StatusTagV2, {
    label: c.status.label,
    tone: c.status.tone
  })), /*#__PURE__*/React.createElement("p", {
    className: "v2-coh-desc"
  }, c.description), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      color: 'var(--cream-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.04em'
    }
  }, "FOCUS:"), c.primaryBrands.map((b, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "v2-coh-chip"
  }, b))), /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "GMV \xB7 MTD"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, inrShort(c.gmv))), /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Growth"), /*#__PURE__*/React.createElement("div", {
    className: "value",
    style: {
      color: c.growth >= 10 ? 'var(--success-500)' : 'var(--cream-900)'
    }
  }, "+", c.growth, "%")), /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Members"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, c.active, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--cream-600)'
    }
  }, " / ", c.members))), /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Conversion"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, c.conversion, "%"))))))));
}

/* ============================================================
   CATALOGS  (Grid default — covers carry visual identity)
   ============================================================ */
function CatalogsLandingV2() {
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Catalogs \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Distribution",
    title: "Catalogs",
    subtitle: "The mailers your retailers see in the buyer app. Each one targets a cohort, runs for a validity window, and rolls up to one funnel.",
    horizon: "This month",
    secondary: {
      label: 'New from template',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "3",
        width: "7",
        height: "9",
        rx: "1.2"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "14",
        y: "3",
        width: "7",
        height: "5",
        rx: "1.2"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "14",
        y: "12",
        width: "7",
        height: "9",
        rx: "1.2"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "16",
        width: "7",
        height: "5",
        rx: "1.2"
      }))
    },
    primary: "Publish a catalog"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Live catalogs',
      value: CATALOGS_AGG.live,
      sub: `${CATALOGS_AGG.draft} in draft, ${CATALOGS_AGG.ended} ended`
    }, {
      label: 'GMV from catalogs',
      value: inrShort(CATALOGS_AGG.gmv),
      delta: '+14.2%',
      deltaTone: 'up',
      sub: 'vs last month',
      tone: 'accent'
    }, {
      label: 'Avg conversion',
      value: `${CATALOGS_AGG.conversion}%`,
      sub: 'opens → orders'
    }, {
      label: 'Orders attributed',
      value: CATALOGS_AGG.orders,
      sub: 'this month'
    }]
  }), /*#__PURE__*/React.createElement(AttentionRail, {
    items: [{
      kind: 'risk',
      subject: 'Summer Pours',
      title: '4 days left · 3 buyers haven\'t opened',
      hint: 'Live to 12 N-Delhi A-class buyers. Re-send to non-openers in last 48h?',
      action: 'Nudge non-openers'
    }, {
      kind: 'opportunity',
      subject: 'Monsoon Specials',
      title: 'Draft ready for 22 hospitality buyers',
      hint: '18 products selected, valid Jul 15 → Aug 14. Awaiting publish.',
      action: 'Review & publish'
    }, {
      kind: 'info',
      subject: 'Premium Reserve',
      title: 'Top performer · 50% conversion',
      hint: '11 orders from 18 buyers. Worth templating the layout for next cycle.',
      action: 'Save as template'
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: "4 catalogs",
    searchPlaceholder: "Search catalog or cohort\u2026",
    chips: ['All', 'Live', 'Draft', 'Ended'],
    activeChip: "All",
    view: "grid",
    sortBy: "Recently published"
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-grid-body"
  }, CATALOGS_DATA.map(c => {
    const badgeCls = c.status.tone === 'warning' ? 'is-draft' : c.status.tone === 'neutral' ? 'is-ended' : '';
    return /*#__PURE__*/React.createElement("article", {
      key: c.id,
      className: "v2-cat-tile"
    }, /*#__PURE__*/React.createElement("div", {
      className: 'v2-cat-hero h-' + c.hue
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, c.name), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-hero-meta"
    }, c.products, " products \xB7 ", c.brands, " brands")), /*#__PURE__*/React.createElement("span", {
      className: 'v2-cat-hero-badge ' + badgeCls
    }, c.status.label.toUpperCase())), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-body"
    }, /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-row"
    }, /*#__PURE__*/React.createElement("span", null, "Cohort"), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, c.cohort)), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-row"
    }, /*#__PURE__*/React.createElement("span", null, "GMV"), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, c.gmv > 0 ? inrShort(c.gmv) : '—')), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-row"
    }, /*#__PURE__*/React.createElement("span", null, "Orders"), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, c.orders > 0 ? `${c.orders} (${c.conversion}%)` : '—')), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-row",
      style: {
        borderTop: '1px dashed var(--cream-300)',
        paddingTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", null, c.status.label === 'Draft' ? 'Validity' : c.status.label === 'Ended' ? 'Ended' : 'Days left'), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, c.status.label === 'Live' ? `${c.daysLeft}d · until ${c.validUntil}` : c.validUntil))));
  }))));
}

/* ============================================================
   ORDERS  (List default — transactional)
   ============================================================ */
function OrdersLandingV2() {
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Orders \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Transactions",
    title: "Orders",
    subtitle: "28 orders this month from 22 buyers. 4 pending dispatch, 1 on hold, 18 already delivered. The list is your workboard.",
    horizon: "This month",
    secondary: {
      label: 'Sync to Tally',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M3 12a9 9 0 0 1 15.36-6.36L21 8"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M21 3v5h-5"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M21 12a9 9 0 0 1-15.36 6.36L3 16"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M3 21v-5h5"
      }))
    },
    primary: "Record an order"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Orders · MTD',
      value: ORDERS_AGG.total,
      delta: '+14%',
      deltaTone: 'up',
      sub: 'vs last month'
    }, {
      label: 'GMV',
      value: inrShort(ORDERS_AGG.gmv),
      sub: `AOV ${inrShort(ORDERS_AGG.aov)}`,
      tone: 'accent'
    }, {
      label: 'Pending dispatch',
      value: ORDERS_AGG.pendingDispatch,
      sub: 'awaiting confirmation',
      tone: 'warn'
    }, {
      label: 'On hold',
      value: ORDERS_AGG.holds,
      sub: 'credit limit issue'
    }]
  }), /*#__PURE__*/React.createElement(AttentionRail, {
    items: [{
      kind: 'risk',
      subject: 'DF-2026-00476',
      title: 'Kapoor Spirits · on hold 4 days',
      hint: 'Credit limit exceeded. Order value ₹38.2K — clear ₹14K dues to release.',
      action: 'Resolve hold'
    }, {
      kind: 'opportunity',
      subject: 'Friday dispatch batch',
      title: '4 orders for Mon delivery',
      hint: 'Bengaluru, Mumbai, Gurugram, New Delhi. Confirm all 4 to send pick-list.',
      action: 'Confirm batch'
    }, {
      kind: 'info',
      subject: 'AOV trending up',
      title: '₹44.6K · 12% above last month',
      hint: 'Largely Tier-A reorders. Singh Hospitality alone is ₹3.84 L over 4 orders.',
      action: 'See top buyers'
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: `Showing 8 of ${ORDERS_AGG.total}`,
    searchPlaceholder: "Search order ID, buyer, city\u2026",
    chips: ['All', 'Confirmed', 'In transit', 'Delivered', 'Hold', 'Cancelled'],
    activeChip: "All",
    view: "list",
    sortBy: "Recent first"
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Order"), /*#__PURE__*/React.createElement("th", null, "Buyer"), /*#__PURE__*/React.createElement("th", null, "Delivery"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Items"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "GMV"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Placed"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, ORDERS_DATA.map(o => /*#__PURE__*/React.createElement("tr", {
    key: o.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--cream-800)'
    }
  }, o.id)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent"
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: o.buyerInitials,
    hue: o.buyerHue,
    size: 30
  }), /*#__PURE__*/React.createElement("div", {
    className: "ent-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ent-name",
    style: {
      fontSize: 13
    }
  }, o.buyer)))), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 12.5
    }
  }, o.delivery), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, o.items), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-display"
  }, inrShort(o.gmv))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusTagV2, {
    label: o.status.label,
    tone: o.status.tone
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, o.placed), /*#__PURE__*/React.createElement("td", {
    className: "chev"
  }, "\u203A")))))));
}
Object.assign(window, {
  BrandsLandingV2,
  ProductsLandingV2,
  CustomersLandingV2,
  CohortsLandingV2,
  CatalogsLandingV2,
  OrdersLandingV2
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "v2/Modules.jsx", error: String((e && e.message) || e) }); }

// v2/OrdersV2.jsx
try { (() => {
// v2/Orders.jsx
// Order detail — three directions, all in Ember & Cream chrome:
//   B · OrderTransactional   — focused single-scroll page (recommended)
//   A · OrderTabbed          — forced into the v2 tabbed shell (shows why it doesn't fit)
//   C · OrderDrawer + list   — slide-in right panel, reusable app-wide
//   OrderStatesStrip         — compact "every state + its contextual actions" overview
//
// Reuses inr() + DF_DATA (cockpit), Crumb/StatusTag/MetaStrip4/DetailTabs/
// SectionCard (details + v2), FilterBar/PageHeaderV2 (v2), and the ORDER* data.

/* ── Icons ─────────────────────────────────────────────────── */
function OIcon({
  name,
  size = 14,
  sw = 1.7
}) {
  const P = {
    cart: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "20",
      r: "1.4"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "18",
      cy: "20",
      r: "1.4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M1 2h3.2l2.3 12.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.5L21 6H6"
    })),
    edit: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 20h9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"
    })),
    check: /*#__PURE__*/React.createElement("path", {
      d: "M20 6 9 17l-5-5"
    }),
    alert: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 9v4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 17h.01"
    })),
    truck: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "1",
      y: "5",
      width: "14",
      height: "11",
      rx: "1.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M15 8h4l4 4v4h-8z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "6",
      cy: "18.5",
      r: "2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "18",
      cy: "18.5",
      r: "2"
    })),
    home: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M9 21.5V13h6v8.5"
    })),
    x: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M18 6 6 18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 6l12 12"
    })),
    download: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 15V3"
    })),
    message: /*#__PURE__*/React.createElement("path", {
      d: "M21 11.5a8.4 8.4 0 0 1-12.8 7.5L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"
    }),
    package: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "m21 8-9-5-9 5v8l9 5 9-5z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 8l9 5 9-5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 13v8"
    })),
    pin: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "10",
      r: "2.6"
    })),
    note: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "3",
      width: "16",
      height: "18",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 8h8M8 12h8M8 16h5"
    })),
    bank: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "6",
      width: "20",
      height: "12",
      rx: "2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "2.2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 12h.01M18 12h.01"
    })),
    repeat: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M17 2l4 4-4 4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 11V9a4 4 0 0 1 4-4h14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 22l-4-4 4-4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M21 13v2a4 4 0 0 1-4 4H3"
    })),
    chev: /*#__PURE__*/React.createElement("path", {
      d: "M9 18l6-6-6-6"
    })
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, P[name]);
}
const PAY_TONE = {
  due: 'warning',
  paid: 'success',
  neutral: 'neutral',
  void: 'neutral'
};
function actionIcon(label) {
  const l = label.toLowerCase();
  if (l.includes('invoice') || l.includes('tally')) return 'download';
  if (l.includes('message')) return 'message';
  if (l.includes('track') || l.includes('dispatch')) return 'truck';
  if (l.includes('confirm') || l.includes('deliver')) return 'check';
  if (l.includes('reorder')) return 'repeat';
  if (l.includes('edit')) return 'edit';
  if (l.includes('cancel')) return 'x';
  if (l.includes('reason')) return 'note';
  return null;
}
function ActBtn({
  act,
  kind,
  sm
}) {
  const role = kind || act.kind || 'secondary';
  const base = role === 'primary' ? 'cockpit-btn cockpit-btn-primary' : role === 'danger' ? 'cockpit-btn cockpit-btn-ghost' : 'cockpit-btn cockpit-btn-secondary';
  const ic = actionIcon(act.label);
  return /*#__PURE__*/React.createElement("button", {
    className: base + (sm ? ' cockpit-btn-sm' : ''),
    style: role === 'danger' ? {
      color: 'var(--danger-700)'
    } : null
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, ic && /*#__PURE__*/React.createElement(OIcon, {
    name: ic,
    size: sm ? 12 : 13
  }), /*#__PURE__*/React.createElement("span", null, act.label)));
}

/* ── Status band: stepper + what's-next + the one primary action ── */
function OrderStepper({
  state
}) {
  const cfg = ORDER_STATE_CONFIG[state];
  let steps;
  if (state === 'cancelled') {
    steps = [{
      label: 'Received',
      cls: 'is-done',
      when: ORDER_STAGES[0].at,
      node: 'check'
    }, {
      label: 'Cancelled',
      cls: 'is-cancelled',
      when: ORDER_EVENTS.cancelled.at,
      node: 'x'
    }, {
      label: 'Dispatched',
      cls: 'is-skipped',
      when: ''
    }, {
      label: 'Delivered',
      cls: 'is-skipped',
      when: ''
    }];
  } else {
    steps = ORDER_STAGES.map((s, i) => ({
      label: s.label,
      cls: i < cfg.stepIdx ? 'is-done' : i === cfg.stepIdx ? 'is-current' : '',
      when: i <= cfg.stepIdx ? s.at : '',
      node: i < cfg.stepIdx ? 'check' : null
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: 'ord-stepper' + (state === 'cancelled' ? ' is-cancelled' : '')
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    className: 'ord-step ' + s.cls,
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "node"
  }, s.node && /*#__PURE__*/React.createElement(OIcon, {
    name: s.node,
    size: 12,
    sw: 2.4
  })), /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, s.label), /*#__PURE__*/React.createElement("div", {
    className: "when"
  }, s.when))));
}
function OrderStatusBand({
  state
}) {
  const cfg = ORDER_STATE_CONFIG[state];
  return /*#__PURE__*/React.createElement("div", {
    className: 'ord-band' + (state === 'cancelled' ? ' is-cancelled' : '')
  }, /*#__PURE__*/React.createElement(OrderStepper, {
    state: state
  }), /*#__PURE__*/React.createElement("div", {
    className: "ord-band-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-band-next"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "What's next"), cfg.nextLine), /*#__PURE__*/React.createElement("div", {
    className: "ord-band-cta"
  }, /*#__PURE__*/React.createElement(ActBtn, {
    act: cfg.primary,
    kind: cfg.primary.kind === 'secondary' ? 'secondary' : 'primary'
  }))));
}

/* ── Fulfilment alert ──────────────────────────────────────── */
function FulfilmentAlert() {
  const short = ORDER.shortLines;
  if (!short.length) return null;
  const l = short[0];
  return /*#__PURE__*/React.createElement("div", {
    className: "ord-alert"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(OIcon, {
    name: "alert",
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    className: "ord-alert-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-alert-title"
  }, short.length === 1 ? 'One line can’t be fully fulfilled' : `${short.length} lines can’t be fully fulfilled`), /*#__PURE__*/React.createElement("div", {
    className: "ord-alert-detail"
  }, /*#__PURE__*/React.createElement("b", null, l.name), " \u2014 ", l.onHand, " of ", l.qty, " in stock, ", /*#__PURE__*/React.createElement("b", null, l.qty - l.onHand, " short"), ". Confirm a partial, backorder the rest, or substitute.")), /*#__PURE__*/React.createElement("button", null, "Resolve stock"));
}

/* ── Line items + totals ───────────────────────────────────── */
function OrderLineItems({
  showStock
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ord-lines"
  }, ORDER.lines.map((l, i) => {
    const short = showStock && l.qty > l.onHand;
    return /*#__PURE__*/React.createElement("div", {
      className: 'ord-line' + (short ? ' is-short' : ''),
      key: i
    }, /*#__PURE__*/React.createElement("div", {
      className: 'ord-line-thumb ' + l.hue
    }, /*#__PURE__*/React.createElement("i", null)), /*#__PURE__*/React.createElement("div", {
      className: "ord-line-meta"
    }, /*#__PURE__*/React.createElement("div", {
      className: "ord-line-name"
    }, l.name), /*#__PURE__*/React.createElement("div", {
      className: "ord-line-sku"
    }, l.brand, " \xB7 ", l.sku), short && /*#__PURE__*/React.createElement("div", {
      className: "ord-line-stock"
    }, l.onHand, " of ", l.qty, " in stock \xB7 ", l.qty - l.onHand, " short")), /*#__PURE__*/React.createElement("div", {
      className: "ord-line-qty"
    }, l.qty, " \xD7 ", inr(l.price)), /*#__PURE__*/React.createElement("div", {
      className: "ord-line-total"
    }, inr(l.qty * l.price)));
  })), /*#__PURE__*/React.createElement("div", {
    className: "ord-tot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-tot-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Taxable value"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inr(ORDER.subtotal))), /*#__PURE__*/React.createElement("div", {
    className: "ord-tot-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "IGST @ 18%"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inr(ORDER.gst))), /*#__PURE__*/React.createElement("div", {
    className: "ord-tot-row grand"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Order total"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inr(ORDER.total)))));
}

/* ── Invoice block ─────────────────────────────────────────── */
function OrderInvoice({
  hasInvoice
}) {
  if (!hasInvoice) {
    return /*#__PURE__*/React.createElement("div", {
      className: "ord-inv-empty"
    }, /*#__PURE__*/React.createElement("span", {
      className: "ic"
    }, /*#__PURE__*/React.createElement(OIcon, {
      name: "package",
      size: 22
    })), /*#__PURE__*/React.createElement("span", null, "No invoice yet. ", /*#__PURE__*/React.createElement("b", null, "Confirm the order"), " to reserve stock and raise ", /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, "INV-2026-\u2026"), " automatically."));
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ord-inv-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ord-inv-no"
  }, ORDER.invoiceNo), /*#__PURE__*/React.createElement("div", {
    className: "ord-inv-date"
  }, "Raised ", ORDER.invoiceDate, " \xB7 ", ORDER.terms, " \xB7 IGST (inter-state)")), /*#__PURE__*/React.createElement(StatusTag, {
    label: "Tax invoice",
    tone: "accent"
  })), /*#__PURE__*/React.createElement("div", {
    className: "ord-inv-parties"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-inv-party"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, "Billed to"), /*#__PURE__*/React.createElement("div", {
    className: "nm"
  }, ORDER.buyer.name), /*#__PURE__*/React.createElement("div", {
    className: "ad"
  }, ORDER.buyer.city), /*#__PURE__*/React.createElement("div", {
    className: "gst"
  }, "GSTIN ", ORDER.buyer.gstin)), /*#__PURE__*/React.createElement("div", {
    className: "ord-inv-party"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, "Ship to"), /*#__PURE__*/React.createElement("div", {
    className: "nm"
  }, ORDER.buyer.name), /*#__PURE__*/React.createElement("div", {
    className: "ad"
  }, ORDER.delivery.address), /*#__PURE__*/React.createElement("div", {
    className: "gst"
  }, ORDER.delivery.mode))), /*#__PURE__*/React.createElement("div", {
    className: "ord-tot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-tot-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Taxable value"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inr(ORDER.subtotal))), /*#__PURE__*/React.createElement("div", {
    className: "ord-tot-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "IGST @ 18%"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inr(ORDER.gst))), /*#__PURE__*/React.createElement("div", {
    className: "ord-tot-row grand"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Invoice total"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, inr(ORDER.total)))));
}

/* ── Payment + credit ──────────────────────────────────────── */
function OrderPayment({
  state
}) {
  const cfg = ORDER_STATE_CONFIG[state];
  const pay = cfg.payment;
  const outstanding = cfg.hasInvoice && pay.tone === 'due' ? ORDER.total : 0;
  const used = ORDER.credit.usedBefore + outstanding;
  const pct = Math.round(used / ORDER.credit.limit * 100);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ord-pay-status"
  }, /*#__PURE__*/React.createElement(StatusTag, {
    label: pay.label,
    tone: PAY_TONE[pay.tone]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px 14px'
    }
  }, pay.amount ? /*#__PURE__*/React.createElement("div", {
    className: "ord-pay-amt"
  }, inr(ORDER.total)) : /*#__PURE__*/React.createElement("div", {
    className: "ord-pay-amt",
    style: {
      color: 'var(--cream-500)',
      fontSize: 20
    }
  }, "\u2014"), /*#__PURE__*/React.createElement("div", {
    className: "ord-pay-detail"
  }, pay.detail)), /*#__PURE__*/React.createElement("div", {
    className: "ord-pay-gauge"
  }, /*#__PURE__*/React.createElement("div", {
    className: "head"
  }, /*#__PURE__*/React.createElement("span", null, "Credit used"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, pct, "%"), " of ", inrShort(ORDER.credit.limit))), /*#__PURE__*/React.createElement("div", {
    className: 'gauge' + (pct >= 90 ? ' is-danger' : pct >= 80 ? ' is-warn' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "fill",
    style: {
      width: pct + '%'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "gauge-foot"
  }, /*#__PURE__*/React.createElement("span", null, inr(used), " used"), /*#__PURE__*/React.createElement("span", null, inr(ORDER.credit.limit - used), " available"))));
}

/* ── Delivery facts ────────────────────────────────────────── */
function OrderDelivery() {
  const d = ORDER.delivery;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Address"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      maxWidth: 200
    }
  }, d.address)), /*#__PURE__*/React.createElement("div", {
    className: "ord-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Window"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, d.window)), /*#__PURE__*/React.createElement("div", {
    className: "ord-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Mode"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, d.mode)), /*#__PURE__*/React.createElement("div", {
    className: "ord-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Contact"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, d.contact)));
}

/* ── Event log ─────────────────────────────────────────────── */
function OrderEventLog({
  state,
  limit
}) {
  const cfg = ORDER_STATE_CONFIG[state];
  let keys = cfg.events;
  if (limit) keys = keys.slice(0, limit);
  return /*#__PURE__*/React.createElement("div", {
    className: "ord-events"
  }, keys.map(k => {
    const e = ORDER_EVENTS[k];
    return /*#__PURE__*/React.createElement("div", {
      className: 'ord-event' + (e.tone ? ' tone-' + e.tone : ''),
      key: k
    }, /*#__PURE__*/React.createElement("div", {
      className: "ord-event-node"
    }, /*#__PURE__*/React.createElement(OIcon, {
      name: e.icon,
      size: 12
    })), /*#__PURE__*/React.createElement("div", {
      className: "ord-event-body"
    }, /*#__PURE__*/React.createElement("div", {
      className: "ord-event-title"
    }, e.title), /*#__PURE__*/React.createElement("div", {
      className: "ord-event-detail"
    }, e.detail), /*#__PURE__*/React.createElement("div", {
      className: "ord-event-meta"
    }, e.who, " \xB7 ", e.at)));
  }));
}

/* ── Order header (transactional) ──────────────────────────── */
function OrderHead({
  state
}) {
  const cfg = ORDER_STATE_CONFIG[state];
  const label = state.charAt(0).toUpperCase() + state.slice(1);
  return /*#__PURE__*/React.createElement("div", {
    className: "ord-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ord-head-id"
  }, ORDER.id), /*#__PURE__*/React.createElement("div", {
    className: "ord-head-row"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "ord-head-title"
  }, ORDER.buyer.name), /*#__PURE__*/React.createElement(StatusTag, {
    label: label,
    tone: ORDER_STATUS_TONE[state]
  })), /*#__PURE__*/React.createElement("div", {
    className: "ord-head-sub"
  }, /*#__PURE__*/React.createElement("span", null, "Placed ", ORDER.placedAt), /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, "via ", /*#__PURE__*/React.createElement("b", null, ORDER.catalog)), /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, ORDER.buyer.channel || ORDER.channel), /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, ORDER.lines.length, " lines \xB7 ", ORDER.units, " units"))), /*#__PURE__*/React.createElement("div", {
    className: "ord-actions"
  }, cfg.secondary.map((a, i) => /*#__PURE__*/React.createElement(ActBtn, {
    key: i,
    act: a,
    kind: "secondary",
    sm: true
  })), cfg.danger && /*#__PURE__*/React.createElement(ActBtn, {
    act: cfg.danger,
    kind: "danger",
    sm: true
  })));
}

/* ════════════════════════════════════════════════════════════
   DIRECTION B — Transactional single-scroll page (recommended)
   ════════════════════════════════════════════════════════════ */
function OrderTransactional({
  state = 'confirmed',
  label
}) {
  const cfg = ORDER_STATE_CONFIG[state];
  return /*#__PURE__*/React.createElement("div", {
    className: "v2-page"
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "v2-page-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "v2-page-inner",
    style: {
      paddingTop: 28
    }
  }, /*#__PURE__*/React.createElement(Crumb, {
    path: [{
      label: 'Orders'
    }, {
      label: ORDER.id,
      current: true
    }]
  }), /*#__PURE__*/React.createElement(OrderHead, {
    state: state
  }), /*#__PURE__*/React.createElement(OrderStatusBand, {
    state: state
  }), cfg.showFulfilment && /*#__PURE__*/React.createElement(FulfilmentAlert, null), /*#__PURE__*/React.createElement("div", {
    className: "ord-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-col"
  }, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Items",
    sub: `${ORDER.lines.length} lines · ${ORDER.units} units`,
    flush: true
  }, /*#__PURE__*/React.createElement(OrderLineItems, {
    showStock: cfg.showFulfilment
  })), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Invoice",
    sub: cfg.hasInvoice ? ORDER.invoiceNo : 'Generated on confirm',
    right: cfg.hasInvoice ? /*#__PURE__*/React.createElement("button", {
      className: "cockpit-btn cockpit-btn-secondary cockpit-btn-sm"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(OIcon, {
      name: "download",
      size: 12
    }), "Download")) : null,
    flush: true
  }, /*#__PURE__*/React.createElement(OrderInvoice, {
    hasInvoice: cfg.hasInvoice
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ord-col"
  }, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Payment",
    flush: true
  }, /*#__PURE__*/React.createElement(OrderPayment, {
    state: state
  })), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Delivery",
    flush: true
  }, /*#__PURE__*/React.createElement(OrderDelivery, null)), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Activity",
    sub: "Every change to this order",
    flush: true
  }, /*#__PURE__*/React.createElement(OrderEventLog, {
    state: state
  }))))));
}

/* ════════════════════════════════════════════════════════════
   DIRECTION A — Forced into the v2 tabbed shell
   ════════════════════════════════════════════════════════════ */
function OrderTabbed({
  active = 'summary',
  label
}) {
  const state = 'confirmed';
  const cfg = ORDER_STATE_CONFIG[state];
  const meta = [{
    label: 'Order total',
    value: inr(ORDER.total),
    sub: 'incl. IGST'
  }, {
    label: 'Items',
    value: ORDER.lines.length,
    sub: `${ORDER.units} units`
  }, {
    label: 'Status',
    value: 'Confirmed',
    sub: 'placed Jun 28'
  }, {
    label: 'Payment',
    value: `Due ${ORDER.dueDate}`,
    sub: ORDER.terms
  }];
  const tabs = [{
    id: 'summary',
    label: 'Summary'
  }, {
    id: 'timeline',
    label: 'Timeline'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "v2-page"
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "v2-page-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "v2-page-inner",
    style: {
      paddingTop: 28
    }
  }, /*#__PURE__*/React.createElement(Crumb, {
    path: [{
      label: 'Orders'
    }, {
      label: ORDER.id,
      current: true
    }]
  }), /*#__PURE__*/React.createElement(OrderHead, {
    state: state
  }), /*#__PURE__*/React.createElement(MetaStrip4, {
    tiles: meta
  }), /*#__PURE__*/React.createElement(DetailTabs, {
    tabs: tabs,
    active: active,
    onChange: () => {}
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-detail-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-thin-note"
  }, /*#__PURE__*/React.createElement("b", null, "Why this strains:"), " an order is one transaction, not a hub of relationships. Splitting it across tabs hides the timeline behind a click and leaves each tab thin. The transactional layout (B) keeps the whole story on one scroll."), active === 'summary' ? /*#__PURE__*/React.createElement("div", {
    className: "ord-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-col"
  }, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Items",
    sub: `${ORDER.lines.length} lines · ${ORDER.units} units`,
    flush: true
  }, /*#__PURE__*/React.createElement(OrderLineItems, {
    showStock: cfg.showFulfilment
  })), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Invoice",
    sub: ORDER.invoiceNo,
    flush: true
  }, /*#__PURE__*/React.createElement(OrderInvoice, {
    hasInvoice: true
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ord-col"
  }, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Payment",
    flush: true
  }, /*#__PURE__*/React.createElement(OrderPayment, {
    state: state
  })), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Delivery",
    flush: true
  }, /*#__PURE__*/React.createElement(OrderDelivery, null)))) : /*#__PURE__*/React.createElement(SectionCard, {
    title: "Timeline",
    sub: "Every change to this order",
    flush: true
  }, /*#__PURE__*/React.createElement(OrderEventLog, {
    state: state
  })))));
}

/* ════════════════════════════════════════════════════════════
   DIRECTION C — Slide-in drawer, shown over the orders list
   ════════════════════════════════════════════════════════════ */
function OrderDrawer({
  state = 'confirmed'
}) {
  const cfg = ORDER_STATE_CONFIG[state];
  const label = state.charAt(0).toUpperCase() + state.slice(1);
  return /*#__PURE__*/React.createElement("div", {
    className: "ord-drawer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-drawer-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-drawer-head-top"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ord-head-id"
  }, ORDER.id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: '-0.01em',
      color: 'var(--cream-900)',
      marginTop: 2
    }
  }, ORDER.buyer.name)), /*#__PURE__*/React.createElement("button", {
    className: "ord-drawer-close"
  }, /*#__PURE__*/React.createElement(OIcon, {
    name: "x",
    size: 15
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(StatusTag, {
    label: label,
    tone: ORDER_STATUS_TONE[state]
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, "Placed ", ORDER.placedAt), /*#__PURE__*/React.createElement("a", {
    style: {
      marginLeft: 'auto',
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--teal-500)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      cursor: 'pointer'
    }
  }, "Open full order ", /*#__PURE__*/React.createElement(OIcon, {
    name: "chev",
    size: 12
  })))), /*#__PURE__*/React.createElement("div", {
    className: "ord-drawer-body"
  }, /*#__PURE__*/React.createElement(OrderStepper, {
    state: state
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ord-mini-head"
  }, "Order"), /*#__PURE__*/React.createElement("div", {
    className: "ord-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Catalog"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, ORDER.catalog)), /*#__PURE__*/React.createElement("div", {
    className: "ord-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Delivery"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, ORDER.delivery.window)), /*#__PURE__*/React.createElement("div", {
    className: "ord-fact"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Payment"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, cfg.payment.label, " \xB7 ", ORDER.terms))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ord-mini-head"
  }, ORDER.lines.length, " items \xB7 ", ORDER.units, " units"), ORDER.lines.map((l, i) => /*#__PURE__*/React.createElement("div", {
    className: "ord-dline",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: 'ord-line-thumb ' + l.hue,
    style: {
      width: 28,
      height: 34
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 9,
      height: 21
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "ord-dline-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ord-dline-name"
  }, l.name), /*#__PURE__*/React.createElement("div", {
    className: "ord-dline-sub"
  }, l.qty, " \xD7 ", inr(l.price))), /*#__PURE__*/React.createElement("div", {
    className: "ord-dline-amt"
  }, inr(l.qty * l.price)))), /*#__PURE__*/React.createElement("div", {
    className: "ord-fact",
    style: {
      borderBottom: 'none',
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "l",
    style: {
      fontWeight: 600,
      color: 'var(--cream-900)'
    }
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    className: "v mono",
    style: {
      fontSize: 15
    }
  }, inr(ORDER.total)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ord-mini-head"
  }, "Recent activity"), /*#__PURE__*/React.createElement(OrderEventLog, {
    state: state,
    limit: 3
  })), /*#__PURE__*/React.createElement("div", {
    className: "ord-reuse-note"
  }, /*#__PURE__*/React.createElement("b", null, "Reusable shell."), " The same drawer hosts any entity quick-look \u2014 a buyer, a product, a catalog \u2014 opened from its list without leaving the page. Deep work still gets a full page.")), /*#__PURE__*/React.createElement("div", {
    className: "ord-drawer-foot"
  }, cfg.secondary[0] && /*#__PURE__*/React.createElement(ActBtn, {
    act: cfg.secondary[0],
    kind: "secondary"
  }), /*#__PURE__*/React.createElement(ActBtn, {
    act: cfg.primary,
    kind: cfg.primary.kind === 'secondary' ? 'secondary' : 'primary'
  })));
}
function OrdersListWithDrawer({
  label,
  state = 'confirmed'
}) {
  const rows = ORDERS_LIST;
  return /*#__PURE__*/React.createElement("div", {
    className: "ord-stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-page"
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "v2-page-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "v2-page-inner",
    style: {
      paddingTop: 28
    }
  }, /*#__PURE__*/React.createElement(Crumb, {
    path: [{
      label: 'Orders'
    }, {
      label: 'Order log',
      current: true
    }]
  }), /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Orders",
    title: "Order log",
    subtitle: "Every order across all buyers and cohorts. Click a row to open it in the side panel without losing your place in the list."
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: rows.length,
    countLabel: "orders",
    searchPlaceholder: "Search orders, buyers\u2026",
    chips: ['All', 'Received', 'Confirmed', 'Dispatched', 'Delivered'],
    activeChip: "All",
    sortBy: "Placed (newest)",
    hideViewToggle: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Order"), /*#__PURE__*/React.createElement("th", null, "Buyer"), /*#__PURE__*/React.createElement("th", null, "Catalog"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Placed"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total"))), /*#__PURE__*/React.createElement("tbody", null, rows.map(o => /*#__PURE__*/React.createElement("tr", {
    key: o.id,
    style: o.id === ORDER.id ? {
      background: 'var(--teal-50)'
    } : null
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent-sub",
    style: {
      marginTop: 0,
      fontSize: 12
    }
  }, o.id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--cream-700)',
      marginTop: 2
    }
  }, o.items, " items")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "ent-name"
  }, o.buyer)), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--cream-700)'
    }
  }, o.catalog), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusTag, {
    label: o.status.charAt(0).toUpperCase() + o.status.slice(1),
    tone: ORDER_STATUS_TONE[o.status]
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--cream-700)',
      fontSize: 12
    }
  }, o.placed), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, inr(o.total))))))))), /*#__PURE__*/React.createElement("div", {
    className: "ord-scrim"
  }), /*#__PURE__*/React.createElement(OrderDrawer, {
    state: state
  }));
}

/* ════════════════════════════════════════════════════════════
   ALL STATES — compact contextual-actions overview
   ════════════════════════════════════════════════════════════ */
function MiniStepper({
  state
}) {
  const cfg = ORDER_STATE_CONFIG[state];
  let segs;
  if (state === 'cancelled') segs = ['done', 'cancel', '', ''];else segs = [0, 1, 2, 3].map(i => i < cfg.stepIdx ? 'done' : i === cfg.stepIdx ? 'current' : '');
  return /*#__PURE__*/React.createElement("div", {
    className: "ord-mini"
  }, segs.map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: 'seg ' + s
  })));
}
function OrderStatesStrip() {
  const order = ['received', 'confirmed', 'dispatched', 'delivered', 'cancelled'];
  return /*#__PURE__*/React.createElement("div", {
    className: "ord-states"
  }, order.map(state => {
    const cfg = ORDER_STATE_CONFIG[state];
    const label = state.charAt(0).toUpperCase() + state.slice(1);
    return /*#__PURE__*/React.createElement("div", {
      className: "ord-state-card",
      key: state
    }, /*#__PURE__*/React.createElement("div", {
      className: "ord-state-id"
    }, /*#__PURE__*/React.createElement(StatusTag, {
      label: label,
      tone: ORDER_STATUS_TONE[state]
    }), /*#__PURE__*/React.createElement(MiniStepper, {
      state: state
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        color: 'var(--cream-700)'
      }
    }, cfg.payment.label)), /*#__PURE__*/React.createElement("div", {
      className: "ord-state-next"
    }, cfg.nextLine), /*#__PURE__*/React.createElement("div", {
      className: "ord-state-acts"
    }, cfg.danger && /*#__PURE__*/React.createElement(ActBtn, {
      act: cfg.danger,
      kind: "danger",
      sm: true
    }), cfg.secondary[0] && /*#__PURE__*/React.createElement(ActBtn, {
      act: cfg.secondary[0],
      kind: "secondary",
      sm: true
    }), /*#__PURE__*/React.createElement(ActBtn, {
      act: cfg.primary,
      kind: cfg.primary.kind === 'secondary' ? 'secondary' : 'primary',
      sm: true
    })));
  }));
}
Object.assign(window, {
  OIcon,
  OrderStepper,
  OrderStatusBand,
  FulfilmentAlert,
  OrderLineItems,
  OrderInvoice,
  OrderPayment,
  OrderDelivery,
  OrderEventLog,
  OrderHead,
  OrderTransactional,
  OrderTabbed,
  OrderDrawer,
  OrdersListWithDrawer,
  MiniStepper,
  OrderStatesStrip
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "v2/OrdersV2.jsx", error: String((e && e.message) || e) }); }

// v2/SharedV2.jsx
try { (() => {
// v2/Shared.jsx — v2 unified chrome for entity landing pages.
//
// The pattern, used identically across Brands / Products / Customers / Cohorts
// / Catalogs / Orders:
//
//   <PageHeaderV2>          eyebrow · title · subtitle · period · CTAs
//   <InsightStrip4>         exactly 4 KPI tiles
//   <AttentionRail>         always 3 callouts (mix actionable + informational)
//   <FilterBar>             inline search + filter chips + sort + view toggle
//   {body — table OR tile grid; default per module}

/* ────────────────────────────────────────────────
   Page header
   ──────────────────────────────────────────────── */
function PageHeaderV2({
  eyebrow,
  title,
  subtitle,
  horizon,
  primary,
  secondary
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "v2-page-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-page-header-text"
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "v2-eyebrow"
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    className: "v2-page-title"
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    className: "v2-page-subtitle"
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    className: "v2-page-actions"
  }, horizon && /*#__PURE__*/React.createElement("button", {
    className: "v2-horizon"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Showing"), /*#__PURE__*/React.createElement("span", null, horizon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      opacity: 0.6
    }
  }, "\u25BE")), secondary && /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-secondary"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, secondary.icon, /*#__PURE__*/React.createElement("span", null, secondary.label))), primary && /*#__PURE__*/React.createElement("button", {
    className: "cockpit-btn cockpit-btn-primary"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  })), /*#__PURE__*/React.createElement("span", null, primary)))));
}

/* ────────────────────────────────────────────────
   Insight strip — exactly 4 tiles
   tiles: [{ label, value, sub?, delta?, deltaTone? ('up'|'down'), tone? ('accent'|'warn') }]
   ──────────────────────────────────────────────── */
function InsightStrip4({
  tiles
}) {
  if (tiles.length !== 4) {
    console.warn('InsightStrip4 expects exactly 4 tiles, got', tiles.length);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "v2-strip"
  }, tiles.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'v2-strip-tile' + (t.tone === 'accent' ? ' is-accent' : t.tone === 'warn' ? ' is-warn' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-eyebrow sm"
  }, t.label), /*#__PURE__*/React.createElement("div", {
    className: "v2-strip-value"
  }, t.value), /*#__PURE__*/React.createElement("div", {
    className: "v2-strip-sub"
  }, t.delta && /*#__PURE__*/React.createElement("span", {
    className: t.deltaTone === 'down' ? 'down' : 'up'
  }, t.deltaTone === 'down' ? '↓' : '↑', " ", t.delta), t.sub && /*#__PURE__*/React.createElement("span", {
    className: "hint"
  }, t.sub)))));
}

/* ────────────────────────────────────────────────
   Attention rail — 3 callouts. Each is one of:
     kind: 'risk'        — actionable, danger tone
     kind: 'opportunity' — actionable, ember tone
     kind: 'info'        — informational (e.g. "highest dues"), neutral tone
   Each callout: { kind, title, subject, hint, action }
   ──────────────────────────────────────────────── */
function AttentionRail({
  items
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "v2-attention"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-eyebrow"
  }, "Today's read"), /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-hint"
  }, "3 things worth your time \xB7 refreshed 4 min ago")), /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-grid"
  }, items.map((it, i) => /*#__PURE__*/React.createElement("article", {
    key: i,
    className: 'v2-attention-card is-' + it.kind
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-card-tag"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, it.kind === 'risk' ? 'Needs a call' : it.kind === 'opportunity' ? 'Worth pushing' : 'Worth knowing')), /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-card-subject"
  }, it.subject), /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-card-title"
  }, it.title), it.hint && /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-card-hint"
  }, it.hint), /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-card-action"
  }, it.action, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2192"))))));
}

/* ────────────────────────────────────────────────
   Filter bar — inline search · filter chips · sort · view toggle
   ──────────────────────────────────────────────── */
function FilterBar({
  count,
  countLabel = 'items',
  searchPlaceholder,
  chips = [],
  activeChip,
  view = 'list',
  onView,
  sortBy = 'GMV (high → low)',
  hideViewToggle
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "v2-filter-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-search-inline"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 21l-4.3-4.3"
  })), /*#__PURE__*/React.createElement("input", {
    placeholder: searchPlaceholder || 'Search this page…'
  })), chips.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "v2-chips"
  }, chips.map((c, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: 'v2-chip' + (activeChip === c ? ' is-on' : '')
  }, c))), /*#__PURE__*/React.createElement("div", {
    className: "v2-filter-meta"
  }, count != null && /*#__PURE__*/React.createElement("span", {
    className: "v2-filter-count"
  }, count, " ", countLabel)), /*#__PURE__*/React.createElement("div", {
    className: "v2-filter-right"
  }, /*#__PURE__*/React.createElement("button", {
    className: "v2-sort"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l"
  }, "Sort"), /*#__PURE__*/React.createElement("span", null, sortBy), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      opacity: 0.6
    }
  }, "\u25BE")), !hideViewToggle && /*#__PURE__*/React.createElement("div", {
    className: "v2-view-toggle"
  }, /*#__PURE__*/React.createElement("button", {
    className: view === 'list' ? 'is-active' : '',
    onClick: () => onView && onView('list'),
    title: "List"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"
  }))), /*#__PURE__*/React.createElement("button", {
    className: view === 'grid' ? 'is-active' : '',
    onClick: () => onView && onView('grid'),
    title: "Grid"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3.5",
    y: "3.5",
    width: "7",
    height: "7",
    rx: "1.2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "13.5",
    y: "3.5",
    width: "7",
    height: "7",
    rx: "1.2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "3.5",
    y: "13.5",
    width: "7",
    height: "7",
    rx: "1.2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "13.5",
    y: "13.5",
    width: "7",
    height: "7",
    rx: "1.2"
  }))))));
}

/* ────────────────────────────────────────────────
   Status tag — quiet pill used across rows
   ──────────────────────────────────────────────── */
function StatusTagV2({
  label,
  tone = 'neutral'
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'v2-status is-' + tone
  }, label);
}

/* ────────────────────────────────────────────────
   Module title — small one above filter bar, naming
   the list. Optional; mostly the page title carries it.
   ──────────────────────────────────────────────── */
function ModuleNote({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "v2-module-note"
  }, children);
}

/* ────────────────────────────────────────────────
   Page wrap — width-capped at 1440px, centered.
   This is the v2 width decision.
   ──────────────────────────────────────────────── */
function PageWrap({
  children,
  label
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "v2-page"
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "v2-page-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "v2-page-inner"
  }, children));
}
Object.assign(window, {
  PageHeaderV2,
  InsightStrip4,
  AttentionRail,
  FilterBar,
  StatusTagV2,
  ModuleNote,
  PageWrap
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "v2/SharedV2.jsx", error: String((e && e.message) || e) }); }

// v2/data.jsx
try { (() => {
// v2/data.jsx
// Extended listing-level data for the 6 module landing pages.
// Reuses BRANDS_DATA, PORTFOLIO, inrFmt, inrShort from brands/data.jsx.

/* =========================================================
   PRODUCTS  — 357 in real life; we render 8 representative rows
   ========================================================= */
const PRODUCTS_DATA = [{
  id: 'p1',
  name: 'Cabernet Sauvignon 2021',
  brand: 'WineYard Vintners',
  brandInitials: 'WY',
  brandHue: 'teal',
  sku: 'VINO-CAB-750-2021',
  category: 'Red wine',
  mrp: 2800,
  base: 2450,
  onHand: 96,
  daysCover: 14,
  units: 412,
  gmv: 1009400,
  growth: 12,
  status: {
    label: 'In stock',
    tone: 'success'
  }
}, {
  id: 'p2',
  name: 'Indian Pale Ale',
  brand: 'Khanna Brewing Co.',
  brandInitials: 'KH',
  brandHue: 'ember',
  sku: 'KHAN-IPA-330-006',
  category: 'Beer',
  mrp: 220,
  base: 180,
  onHand: 1240,
  daysCover: 22,
  units: 1840,
  gmv: 331200,
  growth: 18,
  status: {
    label: 'In stock',
    tone: 'success'
  }
}, {
  id: 'p3',
  name: 'Chenin Blanc 2022',
  brand: 'Maison Roussel',
  brandInitials: 'MR',
  brandHue: 'cream',
  sku: 'MRSL-CB-750-2022',
  category: 'White wine',
  mrp: 3200,
  base: 2640,
  onHand: 42,
  daysCover: 28,
  units: 98,
  gmv: 258720,
  growth: 4,
  status: {
    label: 'In stock',
    tone: 'success'
  }
}, {
  id: 'p4',
  name: 'Cabernet Franc Reserve',
  brand: 'WineYard Vintners',
  brandInitials: 'WY',
  brandHue: 'teal',
  sku: 'VINO-CFR-750-2020',
  category: 'Red wine',
  mrp: 3800,
  base: 2980,
  onHand: 12,
  daysCover: 4,
  units: 168,
  gmv: 500640,
  growth: 22,
  status: {
    label: 'Low stock',
    tone: 'warning'
  }
}, {
  id: 'p5',
  name: 'Aravalli Mead',
  brand: 'Aravalli Vineyards',
  brandInitials: 'AV',
  brandHue: 'ember',
  sku: 'ARAV-MED-500-001',
  category: 'Mead',
  mrp: 1450,
  base: 1180,
  onHand: 86,
  daysCover: 18,
  units: 312,
  gmv: 368160,
  growth: 34,
  status: {
    label: 'In stock',
    tone: 'success'
  }
}, {
  id: 'p6',
  name: 'Tara Reserve Gin',
  brand: 'Tara Spirits',
  brandInitials: 'TS',
  brandHue: 'teal',
  sku: 'TARA-GIN-750-002',
  category: 'Spirits',
  mrp: 2200,
  base: 1820,
  onHand: 4,
  daysCover: 2,
  units: 84,
  gmv: 152880,
  growth: -12,
  status: {
    label: 'Low stock',
    tone: 'warning'
  }
}, {
  id: 'p7',
  name: 'Estate Chardonnay 2022',
  brand: 'WineYard Vintners',
  brandInitials: 'WY',
  brandHue: 'teal',
  sku: 'VINO-CHR-750-2022',
  category: 'White wine',
  mrp: 2200,
  base: 1850,
  onHand: 0,
  daysCover: 0,
  units: 92,
  gmv: 170200,
  growth: 6,
  status: {
    label: 'Out of stock',
    tone: 'danger'
  }
}, {
  id: 'p8',
  name: 'Khanna Wheat',
  brand: 'Khanna Brewing Co.',
  brandInitials: 'KH',
  brandHue: 'ember',
  sku: 'KHAN-WHT-330-002',
  category: 'Beer',
  mrp: 200,
  base: 165,
  onHand: 920,
  daysCover: 16,
  units: 1420,
  gmv: 234300,
  growth: 9,
  status: {
    label: 'In stock',
    tone: 'success'
  }
}];
const PRODUCTS_AGG = {
  total: 357,
  active: 312,
  outOfStock: 8,
  lowStock: 24,
  gmv: 4728600,
  growth: 8.3
};

/* =========================================================
   CUSTOMERS  — 142 buyers; we render 7
   ========================================================= */
const CUSTOMERS_DATA = [{
  id: 'c1',
  name: 'Singh Hospitality',
  initials: 'SH',
  hue: 'ember',
  city: 'Bengaluru',
  tier: 'A',
  cohort: 'South India Specialty',
  spend: 612000,
  growth: 26,
  orders: 6,
  lastOrder: '3d',
  credit: {
    used: 384000,
    limit: 600000
  },
  dues: 124000,
  status: {
    label: 'Active',
    tone: 'success'
  }
}, {
  id: 'c2',
  name: 'Verma & Sons',
  initials: 'VS',
  hue: 'teal',
  city: 'Gurugram',
  tier: 'A',
  cohort: 'North Delhi · A-class',
  spend: 484000,
  growth: 12,
  orders: 4,
  lastOrder: '6d',
  credit: {
    used: 220000,
    limit: 500000
  },
  dues: 86000,
  status: {
    label: 'Active',
    tone: 'success'
  }
}, {
  id: 'c3',
  name: 'Mehta Brothers',
  initials: 'MB',
  hue: 'cream',
  city: 'Mumbai',
  tier: 'A',
  cohort: 'Maharashtra Premium',
  spend: 384000,
  growth: 8,
  orders: 4,
  lastOrder: '4d',
  credit: {
    used: 180000,
    limit: 400000
  },
  dues: 0,
  status: {
    label: 'Active',
    tone: 'success'
  }
}, {
  id: 'c4',
  name: 'Rajan Wine Merchants',
  initials: 'RW',
  hue: 'ember',
  city: 'New Delhi',
  tier: 'B',
  cohort: 'North Delhi · A-class',
  spend: 268000,
  growth: 32,
  orders: 5,
  lastOrder: '2d',
  credit: {
    used: 132000,
    limit: 300000
  },
  dues: 42000,
  status: {
    label: 'Active',
    tone: 'success'
  }
}, {
  id: 'c5',
  name: 'Capitol Spirits',
  initials: 'CS',
  hue: 'teal',
  city: 'New Delhi',
  tier: 'B',
  cohort: 'North Delhi · A-class',
  spend: 92000,
  growth: -18,
  orders: 1,
  lastOrder: '32d',
  credit: {
    used: 92000,
    limit: 200000
  },
  dues: 92000,
  status: {
    label: 'Dormant',
    tone: 'warning'
  }
}, {
  id: 'c6',
  name: 'Hotel Lalit',
  initials: 'HL',
  hue: 'cream',
  city: 'New Delhi',
  tier: 'A',
  cohort: 'Hospitality',
  spend: 218000,
  growth: 4,
  orders: 3,
  lastOrder: '8d',
  credit: {
    used: 84000,
    limit: 250000
  },
  dues: 0,
  status: {
    label: 'Active',
    tone: 'success'
  }
}, {
  id: 'c7',
  name: 'Borivali Wines',
  initials: 'BW',
  hue: 'ember',
  city: 'Mumbai',
  tier: 'B',
  cohort: 'Maharashtra Premium',
  spend: 142000,
  growth: 14,
  orders: 3,
  lastOrder: '5d',
  credit: {
    used: 64000,
    limit: 200000
  },
  dues: 0,
  status: {
    label: 'Active',
    tone: 'success'
  }
}];
const CUSTOMERS_AGG = {
  total: 142,
  active: 89,
  dormant: 18,
  new30d: 6,
  spend: 4728600,
  growth: 8.3,
  atRisk: 4,
  duesTotal: 344000
};

/* =========================================================
   COHORTS  — 4 total (small set)
   ========================================================= */
const COHORTS_DATA = [{
  id: 'mh-prem',
  name: 'Maharashtra Premium',
  description: 'A & B class buyers in Maharashtra, focused on premium wines.',
  members: 28,
  totalBuyers: 142,
  gmv: 1140000,
  growth: 12,
  active: 19,
  aov: 124000,
  conversion: 38,
  catalogs: 3,
  hue: 'ember',
  primaryBrands: ['WY', 'MR'],
  status: {
    label: 'Active',
    tone: 'success'
  }
}, {
  id: 'nd-acl',
  name: 'North Delhi · A-class',
  description: 'Tier-1 buyers across North Delhi corridor.',
  members: 12,
  totalBuyers: 142,
  gmv: 968000,
  growth: 8,
  active: 9,
  aov: 142000,
  conversion: 52,
  catalogs: 4,
  hue: 'teal',
  primaryBrands: ['WY', 'KH'],
  status: {
    label: 'Active',
    tone: 'success'
  }
}, {
  id: 'sa-spec',
  name: 'South India Specialty',
  description: 'Hospitality & on-premise across BLR, Chennai, Hyderabad.',
  members: 18,
  totalBuyers: 142,
  gmv: 786000,
  growth: 18,
  active: 14,
  aov: 102000,
  conversion: 41,
  catalogs: 2,
  hue: 'cream',
  primaryBrands: ['WY', 'AV'],
  status: {
    label: 'Active',
    tone: 'success'
  }
}, {
  id: 'hosp',
  name: 'Hospitality',
  description: 'Hotels & banquet halls — slower cadence, larger orders.',
  members: 22,
  totalBuyers: 142,
  gmv: 642000,
  growth: 4,
  active: 12,
  aov: 162000,
  conversion: 28,
  catalogs: 1,
  hue: 'teal',
  primaryBrands: ['MR', 'KH'],
  status: {
    label: 'Active',
    tone: 'success'
  }
}];
const COHORTS_AGG = {
  total: 4,
  members: 80,
  totalBuyers: 142,
  conversion: 39.8,
  gmv: 3536000,
  growth: 11.2
};

/* =========================================================
   CATALOGS  — small visual set
   ========================================================= */
const CATALOGS_DATA = [{
  id: 'cat-summer',
  name: 'Summer Pours',
  cohort: 'North Delhi · A-class',
  cohortMembers: 12,
  products: 28,
  brands: 3,
  gmv: 412000,
  growth: 44,
  orders: 14,
  opens: 24,
  conversion: 50,
  daysLeft: 4,
  validUntil: 'May 31',
  publishedBy: 'Phani',
  hue: 'teal',
  status: {
    label: 'Live',
    tone: 'success'
  }
}, {
  id: 'cat-prem',
  name: 'Premium Reserve',
  cohort: 'South India Specialty',
  cohortMembers: 18,
  products: 14,
  brands: 2,
  gmv: 612000,
  growth: 18,
  orders: 11,
  opens: 22,
  conversion: 50,
  daysLeft: 12,
  validUntil: 'Jun 12',
  publishedBy: 'Phani',
  hue: 'ember',
  status: {
    label: 'Live',
    tone: 'success'
  }
}, {
  id: 'cat-vint',
  name: 'Vintage Drop',
  cohort: 'Maharashtra Premium',
  cohortMembers: 28,
  products: 22,
  brands: 4,
  gmv: 248000,
  growth: -6,
  orders: 8,
  opens: 19,
  conversion: 42,
  daysLeft: 0,
  validUntil: 'May 30',
  publishedBy: 'Phani',
  hue: 'cream',
  status: {
    label: 'Ended',
    tone: 'neutral'
  }
}, {
  id: 'cat-monsoon',
  name: 'Monsoon Specials',
  cohort: 'Hospitality',
  cohortMembers: 22,
  products: 18,
  brands: 3,
  gmv: 0,
  growth: 0,
  orders: 0,
  opens: 0,
  conversion: 0,
  daysLeft: 0,
  validUntil: 'Jul 15',
  publishedBy: 'Phani',
  hue: 'teal',
  status: {
    label: 'Draft',
    tone: 'warning'
  }
}];
const CATALOGS_AGG = {
  total: 4,
  live: 2,
  draft: 1,
  ended: 1,
  gmv: 1272000,
  growth: 14.2,
  orders: 33,
  conversion: 47.5
};

/* =========================================================
   ORDERS  — 28 this month; render 8
   ========================================================= */
const ORDERS_DATA = [{
  id: 'DF-2026-00482',
  buyer: 'Singh Hospitality',
  buyerInitials: 'SH',
  buyerHue: 'ember',
  placed: '4h ago',
  delivery: 'Mon · Bengaluru',
  items: 14,
  gmv: 184200,
  status: {
    label: 'Confirmed',
    tone: 'success'
  }
}, {
  id: 'DF-2026-00481',
  buyer: 'Rajan Wine Merchants',
  buyerInitials: 'RW',
  buyerHue: 'ember',
  placed: '6h ago',
  delivery: 'Tue · New Delhi',
  items: 8,
  gmv: 86400,
  status: {
    label: 'Confirmed',
    tone: 'success'
  }
}, {
  id: 'DF-2026-00480',
  buyer: 'Mehta Brothers',
  buyerInitials: 'MB',
  buyerHue: 'cream',
  placed: '1d ago',
  delivery: 'Wed · Mumbai',
  items: 24,
  gmv: 312000,
  status: {
    label: 'In transit',
    tone: 'accent'
  }
}, {
  id: 'DF-2026-00479',
  buyer: 'Verma & Sons',
  buyerInitials: 'VS',
  buyerHue: 'teal',
  placed: '1d ago',
  delivery: 'Tue · Gurugram',
  items: 6,
  gmv: 48600,
  status: {
    label: 'In transit',
    tone: 'accent'
  }
}, {
  id: 'DF-2026-00478',
  buyer: 'Hotel Lalit',
  buyerInitials: 'HL',
  buyerHue: 'cream',
  placed: '2d ago',
  delivery: 'Fri · New Delhi',
  items: 18,
  gmv: 218000,
  status: {
    label: 'Delivered',
    tone: 'neutral'
  }
}, {
  id: 'DF-2026-00477',
  buyer: 'Borivali Wines',
  buyerInitials: 'BW',
  buyerHue: 'ember',
  placed: '3d ago',
  delivery: 'Wed · Mumbai',
  items: 12,
  gmv: 142000,
  status: {
    label: 'Delivered',
    tone: 'neutral'
  }
}, {
  id: 'DF-2026-00476',
  buyer: 'Kapoor Spirits',
  buyerInitials: 'KS',
  buyerHue: 'teal',
  placed: '4d ago',
  delivery: 'Thu · Pune',
  items: 4,
  gmv: 38200,
  status: {
    label: 'Hold',
    tone: 'warning'
  }
}, {
  id: 'DF-2026-00475',
  buyer: 'Capitol Spirits',
  buyerInitials: 'CS',
  buyerHue: 'teal',
  placed: '5d ago',
  delivery: 'Fri · New Delhi',
  items: 2,
  gmv: 18400,
  status: {
    label: 'Cancelled',
    tone: 'danger'
  }
}];
const ORDERS_AGG = {
  total: 28,
  gmv: 1247800,
  growth: 14,
  aov: 44564,
  pendingDispatch: 4,
  holds: 1,
  deliveredMTD: 18
};
Object.assign(window, {
  PRODUCTS_DATA,
  PRODUCTS_AGG,
  CUSTOMERS_DATA,
  CUSTOMERS_AGG,
  COHORTS_DATA,
  COHORTS_AGG,
  CATALOGS_DATA,
  CATALOGS_AGG,
  ORDERS_DATA,
  ORDERS_AGG
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "v2/data.jsx", error: String((e && e.message) || e) }); }

// v2/orders-data.jsx
try { (() => {
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
    gstin: '06ABXFV4421K1Z2'
  },
  seller: {
    gststate: 'Delhi'
  },
  // inter-state vs Haryana → IGST
  catalog: 'Summer Pours',
  cohort: 'North Delhi · A-class',
  channel: 'Buyer app',
  placedAt: 'Jun 28, 9:42 am',
  invoiceDate: 'Jun 28',
  dueDate: 'Jul 19',
  // Net 21 from invoice date
  terms: 'Net 21',
  delivery: {
    address: 'Plot 14, Sector 18, Gurugram 122001',
    window: 'Mon 1 Jul · forenoon',
    mode: 'Distributor fleet',
    contact: 'Anil Verma · +91 98xx xx21'
  },
  credit: {
    limit: 600000,
    usedBefore: 180000
  },
  // onHand: bottles available right now. qty > onHand ⇒ can't fully fulfill.
  lines: [{
    name: 'Cabernet Sauvignon 2021',
    brand: 'WineYard Vintners',
    sku: 'VINO-CAB-750-2021',
    hue: 'teal',
    qty: 48,
    price: 2450,
    onHand: 96
  }, {
    name: 'Cabernet Franc Reserve',
    brand: 'WineYard Vintners',
    sku: 'VINO-CFR-750-2020',
    hue: 'teal',
    qty: 36,
    price: 2980,
    onHand: 22
  }, {
    name: 'Indian Pale Ale',
    brand: 'Khanna Brewing Co.',
    sku: 'KHAN-IPA-330-006',
    hue: 'ember',
    qty: 36,
    price: 580,
    onHand: 240
  }, {
    name: 'Chenin Blanc',
    brand: 'Maison Roussel',
    sku: 'MRSL-CB-750-2022',
    hue: 'cream',
    qty: 24,
    price: 1640,
    onHand: 180
  }]
};

// Derived money — computed once, tabular everywhere.
ORDER.subtotal = ORDER.lines.reduce((s, l) => s + l.qty * l.price, 0);
ORDER.gstRate = 0.18; // IGST (inter-state)
ORDER.gst = Math.round(ORDER.subtotal * ORDER.gstRate);
ORDER.total = ORDER.subtotal + ORDER.gst;
ORDER.units = ORDER.lines.reduce((s, l) => s + l.qty, 0);
ORDER.shortLines = ORDER.lines.filter(l => l.qty > l.onHand);

// The four lifecycle stages every order moves through.
const ORDER_STAGES = [{
  id: 'received',
  label: 'Received',
  at: 'Jun 28, 9:42 am'
}, {
  id: 'confirmed',
  label: 'Confirmed',
  at: 'Jun 28, 11:20 am'
}, {
  id: 'dispatched',
  label: 'Dispatched',
  at: 'Jun 29, 7:05 am'
}, {
  id: 'delivered',
  label: 'Delivered',
  at: 'Jul 1, 11:48 am'
}];

// The full event log — "every change to the order". Each state shows the
// events up to and including its point. Newest sits at the top when rendered.
const ORDER_EVENTS = {
  placed: {
    stage: 'received',
    icon: 'cart',
    title: 'Order placed',
    detail: '4 lines · 144 units · via Summer Pours catalog',
    who: 'Anil Verma · buyer app',
    at: 'Jun 28, 9:42 am'
  },
  edited: {
    stage: 'received',
    icon: 'edit',
    title: 'Line edited',
    detail: 'Indian Pale Ale 48 → 36 at buyer’s request',
    who: 'Phani Raju',
    at: 'Jun 28, 10:05 am'
  },
  confirmed: {
    stage: 'confirmed',
    icon: 'check',
    title: 'Order confirmed',
    detail: 'Stock reserved · invoice INV-2026-00470 generated',
    who: 'Phani Raju',
    at: 'Jun 28, 11:20 am',
    tone: 'accent'
  },
  short: {
    stage: 'confirmed',
    icon: 'alert',
    title: 'Short-stock flagged',
    detail: 'Cabernet Franc Reserve — 22 of 36 reserved, 14 on backorder',
    who: 'System',
    at: 'Jun 28, 11:20 am',
    tone: 'warn'
  },
  dispatched: {
    stage: 'dispatched',
    icon: 'truck',
    title: 'Dispatched',
    detail: 'Distributor fleet · expected Mon 1 Jul, forenoon',
    who: 'Warehouse · Rohit',
    at: 'Jun 29, 7:05 am'
  },
  delivered: {
    stage: 'delivered',
    icon: 'home',
    title: 'Delivered',
    detail: 'Signed by store manager at Sector 18',
    who: 'Driver · Sunil',
    at: 'Jul 1, 11:48 am',
    tone: 'ok'
  },
  paid: {
    stage: 'delivered',
    icon: 'rupee',
    title: 'Payment received',
    detail: '₹3,36,442 · UPI · auto-reconciled to invoice',
    who: 'System',
    at: 'Jul 3, 2:15 pm',
    tone: 'ok'
  },
  cancelled: {
    stage: 'cancelled',
    icon: 'x',
    title: 'Order cancelled',
    detail: 'Buyer cancelled before dispatch · stock released',
    who: 'Anil Verma · buyer app',
    at: 'Jun 28, 4:30 pm',
    tone: 'danger'
  }
};

// Per-state config: where we are on the stepper, what's next, the contextual
// actions, whether an invoice exists, payment posture, and which events show.
const ORDER_STATE_CONFIG = {
  received: {
    stepIdx: 0,
    nextLine: 'Confirm to reserve stock and generate the invoice. One line is short — resolve it first or confirm a partial.',
    primary: {
      label: 'Confirm order',
      kind: 'primary'
    },
    secondary: [{
      label: 'Edit order'
    }, {
      label: 'Message buyer'
    }],
    danger: {
      label: 'Cancel order'
    },
    hasInvoice: false,
    showFulfilment: true,
    payment: {
      tone: 'neutral',
      label: 'Not invoiced',
      amount: null,
      detail: 'Dues appear once you confirm and the invoice is raised.'
    },
    events: ['edited', 'placed']
  },
  confirmed: {
    stepIdx: 1,
    nextLine: 'Stock is reserved and the invoice is raised. Dispatch when the fleet is loaded.',
    primary: {
      label: 'Mark dispatched',
      kind: 'primary'
    },
    secondary: [{
      label: 'Download invoice'
    }, {
      label: 'Edit order'
    }],
    danger: {
      label: 'Cancel order'
    },
    hasInvoice: true,
    showFulfilment: true,
    payment: {
      tone: 'due',
      label: 'Payment due',
      amount: true,
      detail: 'Net 21 · due Jul 19'
    },
    events: ['short', 'confirmed', 'edited', 'placed']
  },
  dispatched: {
    stepIdx: 2,
    nextLine: 'On the road with the distributor fleet. Mark delivered once the buyer signs.',
    primary: {
      label: 'Mark delivered',
      kind: 'primary'
    },
    secondary: [{
      label: 'Track shipment'
    }, {
      label: 'Download invoice'
    }],
    danger: null,
    hasInvoice: true,
    showFulfilment: false,
    payment: {
      tone: 'due',
      label: 'Payment due',
      amount: true,
      detail: 'Net 21 · due Jul 19'
    },
    events: ['dispatched', 'confirmed', 'edited', 'placed']
  },
  delivered: {
    stepIdx: 3,
    nextLine: 'Delivered and paid in full. Nothing pending — reorder for this buyer in a tap.',
    primary: {
      label: 'Reorder for buyer',
      kind: 'secondary'
    },
    secondary: [{
      label: 'Download invoice'
    }, {
      label: 'Export to Tally'
    }],
    danger: null,
    hasInvoice: true,
    showFulfilment: false,
    payment: {
      tone: 'paid',
      label: 'Paid in full',
      amount: true,
      detail: 'Paid Jul 3 · UPI'
    },
    events: ['paid', 'delivered', 'dispatched', 'confirmed', 'edited', 'placed']
  },
  cancelled: {
    stepIdx: -1,
    cancelledAfter: 0,
    // cancelled while still "received"
    nextLine: 'Cancelled before dispatch. Reserved stock was released back to inventory.',
    primary: {
      label: 'Reorder for buyer',
      kind: 'secondary'
    },
    secondary: [{
      label: 'View reason'
    }],
    danger: null,
    hasInvoice: false,
    showFulfilment: false,
    payment: {
      tone: 'void',
      label: 'No charge',
      amount: null,
      detail: 'Order was cancelled — nothing billed.'
    },
    events: ['cancelled', 'placed']
  }
};

// Tone → status-pill tone used by StatusTag (success/warning/danger/accent/neutral)
const ORDER_STATUS_TONE = {
  received: 'neutral',
  confirmed: 'accent',
  dispatched: 'warning',
  delivered: 'success',
  cancelled: 'danger'
};

// The order-log rows behind the drawer (Direction C). Self-contained so this
// page doesn't depend on the cockpit kit's data module.
const ORDERS_LIST = [{
  id: 'DF-2026-00471',
  buyer: 'Rajan Wine Merchants',
  items: 3,
  status: 'dispatched',
  total: 84200,
  placed: '2h ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00470',
  buyer: 'Verma & Sons',
  items: 4,
  status: 'confirmed',
  total: 336442,
  placed: '5h ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00469',
  buyer: 'Mehta Brothers',
  items: 5,
  status: 'delivered',
  total: 46820,
  placed: 'Yesterday',
  catalog: 'New Arrivals · May'
}, {
  id: 'DF-2026-00468',
  buyer: 'Singh Hospitality',
  items: 28,
  status: 'received',
  total: 612400,
  placed: 'Yesterday',
  catalog: 'Premium Reserve'
}, {
  id: 'DF-2026-00467',
  buyer: 'Kapoor Spirits',
  items: 4,
  status: 'cancelled',
  total: 18900,
  placed: '2d ago',
  catalog: 'Summer Pours'
}, {
  id: 'DF-2026-00466',
  buyer: 'Rajan Wine Merchants',
  items: 9,
  status: 'delivered',
  total: 124300,
  placed: '2d ago',
  catalog: 'Premium Reserve'
}, {
  id: 'DF-2026-00465',
  buyer: 'Mehta Brothers',
  items: 6,
  status: 'dispatched',
  total: 78200,
  placed: '3d ago',
  catalog: 'New Arrivals · May'
}];

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
  ORDER,
  ORDER_STAGES,
  ORDER_EVENTS,
  ORDER_STATE_CONFIG,
  ORDER_STATUS_TONE,
  ORDERS_LIST,
  inr
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "v2/orders-data.jsx", error: String((e && e.message) || e) }); }

// v3/ModulesV3.jsx
try { (() => {
// v3/Modules.jsx
// v3 = v2 layout/chrome + v1-style 3-up "Today's read" rail.
//
// Differences from v2:
//   - the AttentionRail (single-item-per-card) is replaced with a
//     V3CalloutPanel that renders three v1-style multi-item callouts
//     (Needs attention / Top performers / Top risers) horizontally
//   - the FilterBar's list/grid toggle is hidden — each module has a
//     fixed default body (list for high-volume, grid for visual sets)
//
// Everything else (PageHeaderV2, InsightStrip4, FilterBar, body table/grid)
// is the unchanged v2 component set.

/* ============================================================
   V3CalloutPanel — three horizontal callout cards
   items: [{
     kind: 'risk' | 'opportunity' | 'info',
     eyebrow: string,         // e.g. 'Needs attention'
     hint: string|number,     // small mono caption (count or label)
     rows: [{ initials, hue, name, reason, trailing }]
   }] × 3
   ============================================================ */
function V3CalloutPanel({
  items
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "v2-attention"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-eyebrow"
  }, "Today's read"), /*#__PURE__*/React.createElement("div", {
    className: "v2-attention-hint"
  }, items.length, " groups \xB7 refreshed 4 min ago")), /*#__PURE__*/React.createElement("div", {
    className: "v3-callouts"
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'v3-callout is-' + it.kind
  }, /*#__PURE__*/React.createElement("div", {
    className: "v3-callout-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v3-callout-tag"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("span", null, it.eyebrow)), it.hint != null && it.hint !== '' && /*#__PURE__*/React.createElement("span", {
    className: "v3-callout-hint"
  }, it.hint)), /*#__PURE__*/React.createElement("div", {
    className: "v3-callout-list"
  }, (!it.rows || it.rows.length === 0) && /*#__PURE__*/React.createElement("div", {
    className: "v3-callout-empty"
  }, "None right now. Within thresholds."), it.rows && it.rows.map((r, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    className: "v3-callout-item"
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: r.initials,
    hue: r.hue || 'cream',
    size: 32
  }), /*#__PURE__*/React.createElement("div", {
    className: "col-meta"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, r.name), r.trailing != null && /*#__PURE__*/React.createElement("span", {
    className: "trailing"
  }, r.trailing)), /*#__PURE__*/React.createElement("div", {
    className: "reason"
  }, r.reason)))))))));
}

/* ============================================================
   Helpers
   ============================================================ */
function fmtGrowthV3(g) {
  if (g > 0) return /*#__PURE__*/React.createElement("span", {
    className: "growth-up"
  }, "\u2191 +", g.toFixed(1), "%");
  if (g < 0) return /*#__PURE__*/React.createElement("span", {
    className: "growth-down"
  }, "\u2193 ", g.toFixed(1), "%");
  return /*#__PURE__*/React.createElement("span", {
    className: "growth-flat"
  }, "\xB7 flat");
}

/* ============================================================
   BRANDS  (list default)
   ============================================================ */
function BrandsLandingV3() {
  const sorted = [...BRANDS_DATA].sort((a, b) => b.gmv - a.gmv);
  const top = [...BRANDS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const rising = [...BRANDS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = BRANDS_DATA.filter(b => b.alerts.length > 0);
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Brands \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Portfolio",
    title: "Brands",
    subtitle: "Five brand principals. Phani Distribution carries them across 142 buyers in 6 cohorts. This is your portfolio at a glance.",
    horizon: "This month",
    secondary: {
      label: 'Invite a principal',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "9",
        cy: "7",
        r: "4"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M19 8v6M22 11h-6"
      }))
    },
    primary: "Add a brand"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Portfolio GMV',
      value: inrShort(PORTFOLIO.gmv),
      delta: '+8.3%',
      deltaTone: 'up',
      sub: 'vs last month',
      tone: 'accent'
    }, {
      label: 'Brands carried',
      value: PORTFOLIO.brandsCarried,
      sub: `${PORTFOLIO.activeBuyersAcross} of ${PORTFOLIO.totalBuyers} buyers active`
    }, {
      label: 'Need attention',
      value: PORTFOLIO.brandsAtRisk,
      sub: '3 alerts open',
      tone: 'warn'
    }, {
      label: 'Catalog freshness',
      value: `${PORTFOLIO.catalogFresh} / ${PORTFOLIO.brandsCarried}`,
      sub: 'published in last 14 days'
    }]
  }), /*#__PURE__*/React.createElement(V3CalloutPanel, {
    items: [{
      kind: 'risk',
      eyebrow: 'Needs attention',
      hint: attention.length,
      rows: attention.map(b => ({
        initials: b.initials,
        hue: b.hue,
        name: b.name,
        reason: b.alerts.slice(0, 2).map(a => a.label).join(' · '),
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: b.growth
        })
      }))
    }, {
      kind: 'info',
      eyebrow: 'Top performers',
      hint: 'by GMV',
      rows: top.map(b => ({
        initials: b.initials,
        hue: b.hue,
        name: b.name,
        reason: `${b.share.toFixed(1)}% of portfolio · ${b.activeBuyers} buyers`,
        trailing: inrShort(b.gmv)
      }))
    }, {
      kind: 'opportunity',
      eyebrow: 'Top risers',
      hint: 'fastest growth',
      rows: rising.map(b => ({
        initials: b.initials,
        hue: b.hue,
        name: b.name,
        reason: `from ${inrShort(b.gmvPrior)} → ${inrShort(b.gmv)} this month`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: b.growth
        })
      }))
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: "5 brands",
    searchPlaceholder: "Search brand or category\u2026",
    chips: ['All categories', 'Wines', 'Beer', 'Spirits', 'At risk'],
    activeChip: "All categories",
    sortBy: "GMV (high \u2192 low)",
    hideViewToggle: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 320
    }
  }, "Brand"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "GMV \xB7 MTD"), /*#__PURE__*/React.createElement("th", null, "Growth"), /*#__PURE__*/React.createElement("th", null, "Share of portfolio"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Active buyers"), /*#__PURE__*/React.createElement("th", null, "Catalog"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, sorted.map(b => /*#__PURE__*/React.createElement("tr", {
    key: b.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent"
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: b.initials,
    hue: b.hue,
    size: 38
  }), /*#__PURE__*/React.createElement("div", {
    className: "ent-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ent-name"
  }, b.name), /*#__PURE__*/React.createElement("div", {
    className: "ent-sub"
  }, b.category.toUpperCase(), " \xB7 ", b.region, " \xB7 ", b.skus, " SKUs")))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-display"
  }, inrShort(b.gmv))), /*#__PURE__*/React.createElement("td", null, fmtGrowthV3(b.growth)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "v2-share"
  }, /*#__PURE__*/React.createElement("div", {
    className: 'v2-share-bar' + (b.hue === 'ember' ? ' is-ember' : b.hue === 'cream' ? ' is-cream' : '')
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: b.share * 2.4 + '%'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "v2-share-num"
  }, b.share.toFixed(1), "% of \u20B947.3 L"))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, b.activeBuyers, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--cream-600)'
    }
  }, " / ", b.totalBuyers)), /*#__PURE__*/React.createElement("td", null, b.daysSinceCatalog <= 14 ? /*#__PURE__*/React.createElement("span", {
    className: "v2-status is-success"
  }, b.daysSinceCatalog, "d ago") : /*#__PURE__*/React.createElement("span", {
    className: "v2-status is-warning"
  }, b.daysSinceCatalog, "d ago")), /*#__PURE__*/React.createElement("td", {
    className: "chev"
  }, "\u203A")))))));
}

/* ============================================================
   PRODUCTS  (list default)
   ============================================================ */
function ProductsLandingV3() {
  const top = [...PRODUCTS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const rising = [...PRODUCTS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = PRODUCTS_DATA.filter(p => p.status.tone === 'danger' || p.status.tone === 'warning' || p.growth < 0).slice(0, 3);
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Products \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Catalog",
    title: "Products",
    subtitle: "357 SKUs across 5 brands. 8 out of stock, 24 running low \u2014 those are the ones to chase this week.",
    horizon: "This month",
    secondary: {
      label: 'Bulk import',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M17 8l-5-5-5 5"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 3v12"
      }))
    },
    primary: "Add a product"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Active SKUs',
      value: PRODUCTS_AGG.active,
      sub: `${PRODUCTS_AGG.total} total · 23 archived`
    }, {
      label: 'Out of stock',
      value: PRODUCTS_AGG.outOfStock,
      sub: 'replenish urgently',
      tone: 'warn'
    }, {
      label: 'Low stock',
      value: PRODUCTS_AGG.lowStock,
      sub: '< 14 days of cover'
    }, {
      label: 'Revenue',
      value: inrShort(PRODUCTS_AGG.gmv),
      delta: '+8.3%',
      deltaTone: 'up',
      sub: 'vs last month'
    }]
  }), /*#__PURE__*/React.createElement(V3CalloutPanel, {
    items: [{
      kind: 'risk',
      eyebrow: 'Needs attention',
      hint: attention.length,
      rows: attention.map(p => ({
        initials: p.brandInitials,
        hue: p.brandHue,
        name: p.name,
        reason: `${p.status.label} · ${p.onHand} on hand · ${p.daysCover}d cover`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: p.growth
        })
      }))
    }, {
      kind: 'info',
      eyebrow: 'Top performers',
      hint: 'by GMV',
      rows: top.map(p => ({
        initials: p.brandInitials,
        hue: p.brandHue,
        name: p.name,
        reason: `${p.units.toLocaleString()} units · ${p.brand}`,
        trailing: inrShort(p.gmv)
      }))
    }, {
      kind: 'opportunity',
      eyebrow: 'Top risers',
      hint: 'fastest growth',
      rows: rising.map(p => ({
        initials: p.brandInitials,
        hue: p.brandHue,
        name: p.name,
        reason: `${p.brand} · ${inrShort(p.gmv)} MTD`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: p.growth
        })
      }))
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: `Showing 8 of ${PRODUCTS_AGG.total}`,
    searchPlaceholder: "Search product, SKU, brand\u2026",
    chips: ['All brands', 'Red wine', 'White wine', 'Beer', 'Spirits', 'Low stock'],
    activeChip: "All brands",
    sortBy: "GMV (high \u2192 low)",
    hideViewToggle: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 340
    }
  }, "Product"), /*#__PURE__*/React.createElement("th", null, "Brand"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "On hand"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Days cover"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Units \xB7 MTD"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Revenue"), /*#__PURE__*/React.createElement("th", null, "Growth"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, PRODUCTS_DATA.map(p => /*#__PURE__*/React.createElement("tr", {
    key: p.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 10,
      background: 'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      padding: '0 0 4px',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 10,
      height: 26,
      borderRadius: '20% 20% 8% 8% / 8% 8% 4% 4%',
      background: 'linear-gradient(180deg, #1F3A34, #142823)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "ent-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ent-name"
  }, p.name), /*#__PURE__*/React.createElement("div", {
    className: "ent-sub"
  }, p.sku, " \xB7 ", p.category)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: p.brandInitials,
    hue: p.brandHue,
    size: 22
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5
    }
  }, p.brand))), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, p.onHand), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, p.daysCover === 0 ? /*#__PURE__*/React.createElement("span", {
    className: "growth-down"
  }, "0d") : p.daysCover < 7 ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--warning-700)',
      fontWeight: 600,
      fontFamily: 'var(--font-mono)'
    }
  }, p.daysCover, "d") : /*#__PURE__*/React.createElement("span", null, p.daysCover, "d")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, p.units), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-display"
  }, inrShort(p.gmv))), /*#__PURE__*/React.createElement("td", null, fmtGrowthV3(p.growth)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusTagV2, {
    label: p.status.label,
    tone: p.status.tone
  })), /*#__PURE__*/React.createElement("td", {
    className: "chev"
  }, "\u203A")))))));
}

/* ============================================================
   CUSTOMERS  (list default)
   ============================================================ */
function CustomersLandingV3() {
  const top = [...CUSTOMERS_DATA].sort((a, b) => b.spend - a.spend).slice(0, 2);
  const rising = [...CUSTOMERS_DATA].filter(c => c.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = CUSTOMERS_DATA.filter(c => c.status.tone === 'warning' || c.status.tone === 'danger' || c.growth < 0 || c.dues > 80000).slice(0, 3);
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Customers \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Buyers",
    title: "Customers",
    subtitle: "142 retailers across 6 cohorts. 89 active this month. The Tier-A names buy 70% of revenue \u2014 that's where dues sit too.",
    horizon: "This month",
    secondary: {
      label: 'Invite buyer',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M22 2L11 13"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M22 2l-7 20-4-9-9-4 20-7z"
      }))
    },
    primary: "Add a customer"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Active buyers',
      value: `${CUSTOMERS_AGG.active}/${CUSTOMERS_AGG.total}`,
      sub: '62.7% of base ordered'
    }, {
      label: 'Spend · MTD',
      value: inrShort(CUSTOMERS_AGG.spend),
      delta: '+8.3%',
      deltaTone: 'up',
      sub: 'vs last month'
    }, {
      label: 'Dormant > 30d',
      value: CUSTOMERS_AGG.dormant,
      sub: 'haven\'t ordered in a month',
      tone: 'warn'
    }, {
      label: 'Outstanding dues',
      value: inrShort(CUSTOMERS_AGG.duesTotal),
      sub: 'across 7 buyers'
    }]
  }), /*#__PURE__*/React.createElement(V3CalloutPanel, {
    items: [{
      kind: 'risk',
      eyebrow: 'Needs a call',
      hint: attention.length,
      rows: attention.map(c => ({
        initials: c.initials,
        hue: c.hue,
        name: c.name,
        reason: c.dues > 0 ? `Last order ${c.lastOrder} · ${inrShort(c.dues)} dues` : `Last order ${c.lastOrder} · spend ${c.growth}% MoM`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: c.growth
        })
      }))
    }, {
      kind: 'info',
      eyebrow: 'Top spenders',
      hint: 'by GMV',
      rows: top.map(c => ({
        initials: c.initials,
        hue: c.hue,
        name: c.name,
        reason: `${c.orders} orders · ${c.city}`,
        trailing: inrShort(c.spend)
      }))
    }, {
      kind: 'opportunity',
      eyebrow: 'Top risers',
      hint: 'fastest growth',
      rows: rising.map(c => ({
        initials: c.initials,
        hue: c.hue,
        name: c.name,
        reason: `${c.city} · ${inrShort(c.spend)} this month`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: c.growth
        })
      }))
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: `Showing 7 of ${CUSTOMERS_AGG.total}`,
    searchPlaceholder: "Search buyer, city, GSTIN\u2026",
    chips: ['All tiers', 'Tier A', 'Tier B', 'Dormant', 'Has dues'],
    activeChip: "All tiers",
    sortBy: "Spend (high \u2192 low)",
    hideViewToggle: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 320
    }
  }, "Buyer"), /*#__PURE__*/React.createElement("th", null, "Cohort"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Spend \xB7 MTD"), /*#__PURE__*/React.createElement("th", null, "Growth"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Orders"), /*#__PURE__*/React.createElement("th", null, "Last order"), /*#__PURE__*/React.createElement("th", null, "Credit"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, CUSTOMERS_DATA.map(c => /*#__PURE__*/React.createElement("tr", {
    key: c.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent"
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: c.initials,
    hue: c.hue,
    size: 38
  }), /*#__PURE__*/React.createElement("div", {
    className: "ent-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ent-name"
  }, c.name, /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 8,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--ember-700)',
      background: 'var(--ember-50)',
      padding: '1px 6px',
      borderRadius: 4,
      fontWeight: 600
    }
  }, c.tier)), /*#__PURE__*/React.createElement("div", {
    className: "ent-sub"
  }, c.city.toUpperCase())))), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 12.5,
      color: 'var(--cream-800)'
    }
  }, c.cohort), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-display"
  }, inrShort(c.spend))), /*#__PURE__*/React.createElement("td", null, fmtGrowthV3(c.growth)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, c.orders), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12
    }
  }, c.lastOrder), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-share-bar"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: Math.round(c.credit.used / c.credit.limit * 100) + '%',
      background: c.credit.used / c.credit.limit > 0.75 ? 'var(--warning-500)' : 'var(--teal-500)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "v2-share-num"
  }, inrShort(c.credit.used), " / ", inrShort(c.credit.limit)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusTagV2, {
    label: c.status.label,
    tone: c.status.tone
  })), /*#__PURE__*/React.createElement("td", {
    className: "chev"
  }, "\u203A")))))));
}

/* ============================================================
   ORDERS  (list default)
   ============================================================ */
function OrdersLandingV3() {
  const top = [...ORDERS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const attention = ORDERS_DATA.filter(o => o.status.tone === 'warning' || o.status.tone === 'danger').slice(0, 3);
  const inTransit = ORDERS_DATA.filter(o => o.status.label === 'In transit').slice(0, 2);
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Orders \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Transactions",
    title: "Orders",
    subtitle: "28 orders this month from 22 buyers. 4 pending dispatch, 1 on hold, 18 already delivered. The list is your workboard.",
    horizon: "This month",
    secondary: {
      label: 'Sync to Tally',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M3 12a9 9 0 0 1 15.36-6.36L21 8"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M21 3v5h-5"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M21 12a9 9 0 0 1-15.36 6.36L3 16"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M3 21v-5h5"
      }))
    },
    primary: "Record an order"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Orders · MTD',
      value: ORDERS_AGG.total,
      delta: '+14%',
      deltaTone: 'up',
      sub: 'vs last month'
    }, {
      label: 'GMV',
      value: inrShort(ORDERS_AGG.gmv),
      sub: `AOV ${inrShort(ORDERS_AGG.aov)}`,
      tone: 'accent'
    }, {
      label: 'Pending dispatch',
      value: ORDERS_AGG.pendingDispatch,
      sub: 'awaiting confirmation',
      tone: 'warn'
    }, {
      label: 'On hold',
      value: ORDERS_AGG.holds,
      sub: 'credit limit issue'
    }]
  }), /*#__PURE__*/React.createElement(V3CalloutPanel, {
    items: [{
      kind: 'risk',
      eyebrow: 'Needs attention',
      hint: attention.length,
      rows: attention.map(o => ({
        initials: o.buyerInitials,
        hue: o.buyerHue,
        name: o.buyer,
        reason: `${o.id} · ${o.status.label} · ${o.delivery}`,
        trailing: /*#__PURE__*/React.createElement(StatusTagV2, {
          label: o.status.label,
          tone: o.status.tone
        })
      }))
    }, {
      kind: 'info',
      eyebrow: 'Biggest tickets',
      hint: 'this month',
      rows: top.map(o => ({
        initials: o.buyerInitials,
        hue: o.buyerHue,
        name: o.buyer,
        reason: `${o.id} · ${o.items} items · ${o.delivery}`,
        trailing: inrShort(o.gmv)
      }))
    }, {
      kind: 'opportunity',
      eyebrow: 'In motion',
      hint: 'dispatching now',
      rows: inTransit.map(o => ({
        initials: o.buyerInitials,
        hue: o.buyerHue,
        name: o.buyer,
        reason: `${o.id} · ${o.delivery} · ${inrShort(o.gmv)}`,
        trailing: /*#__PURE__*/React.createElement(StatusTagV2, {
          label: o.status.label,
          tone: o.status.tone
        })
      }))
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: `Showing 8 of ${ORDERS_AGG.total}`,
    searchPlaceholder: "Search order ID, buyer, city\u2026",
    chips: ['All', 'Confirmed', 'In transit', 'Delivered', 'Hold', 'Cancelled'],
    activeChip: "All",
    sortBy: "Recent first",
    hideViewToggle: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("table", {
    className: "v2-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Order"), /*#__PURE__*/React.createElement("th", null, "Buyer"), /*#__PURE__*/React.createElement("th", null, "Delivery"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Items"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "GMV"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Placed"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, ORDERS_DATA.map(o => /*#__PURE__*/React.createElement("tr", {
    key: o.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--cream-800)'
    }
  }, o.id)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ent"
  }, /*#__PURE__*/React.createElement(BrandAvatarSm, {
    initials: o.buyerInitials,
    hue: o.buyerHue,
    size: 30
  }), /*#__PURE__*/React.createElement("div", {
    className: "ent-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ent-name",
    style: {
      fontSize: 13
    }
  }, o.buyer)))), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 12.5
    }
  }, o.delivery), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, o.items), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-display"
  }, inrShort(o.gmv))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusTagV2, {
    label: o.status.label,
    tone: o.status.tone
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--cream-700)'
    }
  }, o.placed), /*#__PURE__*/React.createElement("td", {
    className: "chev"
  }, "\u203A")))))));
}

/* ============================================================
   COHORTS  (grid default — small set)
   ============================================================ */
function CohortsLandingV3() {
  const top = [...COHORTS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const rising = [...COHORTS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = [...COHORTS_DATA].sort((a, b) => a.conversion - b.conversion).slice(0, 2);
  const initials = n => n.split(' ').slice(0, 2).map(w => w[0]).join('');
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Cohorts \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Segmentation",
    title: "Cohorts",
    subtitle: "Four buyer groups defined by geo, tier, and brand affinity. Each one gets its own catalogs and price list.",
    horizon: "This month",
    secondary: {
      label: 'Publish catalog',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M4 4h16v16H4z"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M4 9h16"
      }))
    },
    primary: "New cohort"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Cohorts',
      value: COHORTS_AGG.total,
      sub: `covering ${COHORTS_AGG.members} of ${COHORTS_AGG.totalBuyers} buyers`
    }, {
      label: 'Combined GMV',
      value: inrShort(COHORTS_AGG.gmv),
      delta: '+11.2%',
      deltaTone: 'up',
      sub: 'vs last month',
      tone: 'accent'
    }, {
      label: 'Avg conversion',
      value: `${COHORTS_AGG.conversion}%`,
      sub: 'catalog → order'
    }, {
      label: 'Uncategorised',
      value: '62 buyers',
      sub: 'not in any cohort',
      tone: 'warn'
    }]
  }), /*#__PURE__*/React.createElement(V3CalloutPanel, {
    items: [{
      kind: 'risk',
      eyebrow: 'Low conversion',
      hint: attention.length,
      rows: attention.map(c => ({
        initials: initials(c.name),
        hue: c.hue,
        name: c.name,
        reason: `${c.conversion}% conversion · ${c.active} of ${c.members} active`,
        trailing: `${c.conversion}%`
      }))
    }, {
      kind: 'info',
      eyebrow: 'Top performers',
      hint: 'by GMV',
      rows: top.map(c => ({
        initials: initials(c.name),
        hue: c.hue,
        name: c.name,
        reason: `${c.members} buyers · AOV ${inrShort(c.aov)}`,
        trailing: inrShort(c.gmv)
      }))
    }, {
      kind: 'opportunity',
      eyebrow: 'Top risers',
      hint: 'fastest growth',
      rows: rising.map(c => ({
        initials: initials(c.name),
        hue: c.hue,
        name: c.name,
        reason: `${c.catalogs} catalogs live · ${c.active} active`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: c.growth
        })
      }))
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: "4 cohorts",
    searchPlaceholder: "Search cohort or rule\u2026",
    chips: ['All', 'Geo-based', 'Tier-based', 'Brand affinity'],
    activeChip: "All",
    sortBy: "GMV (high \u2192 low)",
    hideViewToggle: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-grid-body"
  }, COHORTS_DATA.map(c => /*#__PURE__*/React.createElement("article", {
    key: c.id,
    className: "v2-coh-tile"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-head"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "v2-coh-name"
  }, c.name)), /*#__PURE__*/React.createElement(StatusTagV2, {
    label: c.status.label,
    tone: c.status.tone
  })), /*#__PURE__*/React.createElement("p", {
    className: "v2-coh-desc"
  }, c.description), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      color: 'var(--cream-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.04em'
    }
  }, "FOCUS:"), c.primaryBrands.map((b, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "v2-coh-chip"
  }, b))), /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "GMV \xB7 MTD"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, inrShort(c.gmv))), /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Growth"), /*#__PURE__*/React.createElement("div", {
    className: "value",
    style: {
      color: c.growth >= 10 ? 'var(--success-500)' : 'var(--cream-900)'
    }
  }, "+", c.growth, "%")), /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Members"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, c.active, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--cream-600)'
    }
  }, " / ", c.members))), /*#__PURE__*/React.createElement("div", {
    className: "v2-coh-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, "Conversion"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, c.conversion, "%"))))))));
}

/* ============================================================
   CATALOGS  (grid default — covers carry visual identity)
   ============================================================ */
function CatalogsLandingV3() {
  const sorted = [...CATALOGS_DATA].sort((a, b) => b.gmv - a.gmv);
  const top = sorted.filter(c => c.status.tone === 'success').slice(0, 2);
  const rising = [...CATALOGS_DATA].sort((a, b) => b.growth - a.growth).filter(c => c.growth > 0).slice(0, 2);
  const attention = CATALOGS_DATA.filter(c => c.status.label === 'Draft' || c.status.label === 'Ended' || c.daysLeft != null && c.daysLeft <= 5 && c.daysLeft > 0).slice(0, 3);
  const initials = n => n.split(' ').slice(0, 2).map(w => w[0]).join('');
  return /*#__PURE__*/React.createElement(PageWrap, {
    label: "Catalogs \xB7 landing"
  }, /*#__PURE__*/React.createElement(PageHeaderV2, {
    eyebrow: "Distribution",
    title: "Catalogs",
    subtitle: "The mailers your retailers see in the buyer app. Each one targets a cohort, runs for a validity window, and rolls up to one funnel.",
    horizon: "This month",
    secondary: {
      label: 'New from template',
      icon: /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }, /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "3",
        width: "7",
        height: "9",
        rx: "1.2"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "14",
        y: "3",
        width: "7",
        height: "5",
        rx: "1.2"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "14",
        y: "12",
        width: "7",
        height: "9",
        rx: "1.2"
      }), /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "16",
        width: "7",
        height: "5",
        rx: "1.2"
      }))
    },
    primary: "Publish a catalog"
  }), /*#__PURE__*/React.createElement(InsightStrip4, {
    tiles: [{
      label: 'Live catalogs',
      value: CATALOGS_AGG.live,
      sub: `${CATALOGS_AGG.draft} in draft, ${CATALOGS_AGG.ended} ended`
    }, {
      label: 'GMV from catalogs',
      value: inrShort(CATALOGS_AGG.gmv),
      delta: '+14.2%',
      deltaTone: 'up',
      sub: 'vs last month',
      tone: 'accent'
    }, {
      label: 'Avg conversion',
      value: `${CATALOGS_AGG.conversion}%`,
      sub: 'opens → orders'
    }, {
      label: 'Orders attributed',
      value: CATALOGS_AGG.orders,
      sub: 'this month'
    }]
  }), /*#__PURE__*/React.createElement(V3CalloutPanel, {
    items: [{
      kind: 'risk',
      eyebrow: 'Needs attention',
      hint: attention.length,
      rows: attention.map(c => ({
        initials: initials(c.name),
        hue: c.hue,
        name: c.name,
        reason: c.status.label === 'Draft' ? 'Draft · not yet shipped to cohort' : c.status.label === 'Ended' ? `Ended ${c.validUntil} · ${c.orders} orders` : `Expires in ${c.daysLeft}d · ${c.orders} orders`,
        trailing: /*#__PURE__*/React.createElement(StatusTagV2, {
          label: c.status.label,
          tone: c.status.tone
        })
      }))
    }, {
      kind: 'info',
      eyebrow: 'Top performers',
      hint: 'by GMV',
      rows: top.map(c => ({
        initials: initials(c.name),
        hue: c.hue,
        name: c.name,
        reason: `${c.cohort} · ${c.orders} orders · ${c.conversion}% conv.`,
        trailing: inrShort(c.gmv)
      }))
    }, {
      kind: 'opportunity',
      eyebrow: 'Top risers',
      hint: 'fastest growth',
      rows: rising.map(c => ({
        initials: initials(c.name),
        hue: c.hue,
        name: c.name,
        reason: `${c.cohort} · expires in ${c.daysLeft}d`,
        trailing: /*#__PURE__*/React.createElement(GrowthPill, {
          value: c.growth
        })
      }))
    }]
  }), /*#__PURE__*/React.createElement(FilterBar, {
    count: "4 catalogs",
    searchPlaceholder: "Search catalog or cohort\u2026",
    chips: ['All', 'Live', 'Draft', 'Ended'],
    activeChip: "All",
    sortBy: "Recently published",
    hideViewToggle: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "v2-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "v2-grid-body"
  }, CATALOGS_DATA.map(c => {
    const badgeCls = c.status.tone === 'warning' ? 'is-draft' : c.status.tone === 'neutral' ? 'is-ended' : '';
    return /*#__PURE__*/React.createElement("article", {
      key: c.id,
      className: "v2-cat-tile"
    }, /*#__PURE__*/React.createElement("div", {
      className: 'v2-cat-hero h-' + c.hue
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, c.name), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-hero-meta"
    }, c.products, " products \xB7 ", c.brands, " brands")), /*#__PURE__*/React.createElement("span", {
      className: 'v2-cat-hero-badge ' + badgeCls
    }, c.status.label.toUpperCase())), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-body"
    }, /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-row"
    }, /*#__PURE__*/React.createElement("span", null, "Cohort"), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, c.cohort)), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-row"
    }, /*#__PURE__*/React.createElement("span", null, "GMV"), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, c.gmv > 0 ? inrShort(c.gmv) : '—')), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-row"
    }, /*#__PURE__*/React.createElement("span", null, "Orders"), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, c.orders > 0 ? `${c.orders} (${c.conversion}%)` : '—')), /*#__PURE__*/React.createElement("div", {
      className: "v2-cat-row",
      style: {
        borderTop: '1px dashed var(--cream-300)',
        paddingTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", null, c.status.label === 'Draft' ? 'Validity' : c.status.label === 'Ended' ? 'Ended' : 'Days left'), /*#__PURE__*/React.createElement("span", {
      className: "v"
    }, c.status.label === 'Live' ? `${c.daysLeft}d · until ${c.validUntil}` : c.validUntil))));
  }))));
}
Object.assign(window, {
  V3CalloutPanel,
  BrandsLandingV3,
  ProductsLandingV3,
  CustomersLandingV3,
  OrdersLandingV3,
  CohortsLandingV3,
  CatalogsLandingV3
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "v3/ModulesV3.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Calendar = __ds_scope.Calendar;

})();
