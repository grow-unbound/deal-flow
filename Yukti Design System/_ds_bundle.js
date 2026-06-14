/* @ds-bundle: {"format":3,"namespace":"YuktiDesignSystem_13a225","components":[{"name":"Alert","sourcePath":"Alert/Alert.jsx"},{"name":"Avatar","sourcePath":"Avatar/Avatar.jsx"},{"name":"Badge","sourcePath":"Badge/Badge.jsx"},{"name":"Button","sourcePath":"Button/Button.jsx"},{"name":"Card","sourcePath":"Card/Card.jsx"},{"name":"DataTable","sourcePath":"DataTable/DataTable.jsx"},{"name":"DatePicker","sourcePath":"DatePicker/DatePicker.jsx"},{"name":"EmptyState","sourcePath":"EmptyState/EmptyState.jsx"},{"name":"Input","sourcePath":"Input/Input.jsx"},{"name":"ProductCard","sourcePath":"ProductCard/ProductCard.jsx"},{"name":"SearchBar","sourcePath":"SearchBar/SearchBar.jsx"},{"name":"Select","sourcePath":"Select/Select.jsx"},{"name":"Stat","sourcePath":"Stat/Stat.jsx"},{"name":"StatusChip","sourcePath":"StatusChip/StatusChip.jsx"},{"name":"Tabs","sourcePath":"Tabs/Tabs.jsx"},{"name":"Toggle","sourcePath":"Toggle/Toggle.jsx"},{"name":"YuktiMark","sourcePath":"YuktiMark/YuktiMark.jsx"}],"sourceHashes":{"Alert/Alert.jsx":"bf1e99e20faf","Avatar/Avatar.jsx":"1b34f2449ecb","Badge/Badge.jsx":"7088b35e96e2","Button/Button.jsx":"9b5511433971","Card/Card.jsx":"2c0f59ebfaae","DataTable/DataTable.jsx":"123b7e3244aa","DatePicker/DatePicker.jsx":"5f86d813e014","EmptyState/EmptyState.jsx":"ec0a22b5b9d0","Input/Input.jsx":"40f392f01d87","ProductCard/ProductCard.jsx":"db9b5a9bead0","SearchBar/SearchBar.jsx":"4683a1ff01a7","Select/Select.jsx":"13fc9f2f625a","Stat/Stat.jsx":"96e3da02b966","StatusChip/StatusChip.jsx":"ec7aa0846545","Tabs/Tabs.jsx":"c99d22274b88","Toggle/Toggle.jsx":"35d5b7aa856f","YuktiMark/YuktiMark.jsx":"1df088d0de19","explorations/design-canvas.jsx":"bd8746af6e58","explorations/pushback.jsx":"28a68ca8f71a","explorations/shared.jsx":"31fbea16f6b8","explorations/status.jsx":"a54bd4185be4","explorations/territory-a.jsx":"d343399c64fd","explorations/territory-b.jsx":"eb7ba8559cbe","explorations/territory-c.jsx":"341d77c61226"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.YuktiDesignSystem_13a225 = window.YuktiDesignSystem_13a225 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// Alert/Alert.jsx
try { (() => {
var ALERT_CFG = {
  info: {
    color: '#2A5F8A',
    bg: 'rgba(42,95,138,.09)',
    border: 'rgba(42,95,138,.20)',
    icon: function (c) {
      return /*#__PURE__*/React.createElement("svg", {
        width: "16",
        height: "16",
        viewBox: "0 0 16 16",
        fill: "none"
      }, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6.5",
        stroke: c,
        strokeWidth: "1.5"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "5.2",
        r: ".8",
        fill: c
      }), /*#__PURE__*/React.createElement("line", {
        x1: "8",
        y1: "7.5",
        x2: "8",
        y2: "11.2",
        stroke: c,
        strokeWidth: "1.5",
        strokeLinecap: "round"
      }));
    }
  },
  success: {
    color: '#1F6B3A',
    bg: 'rgba(31,107,58,.09)',
    border: 'rgba(31,107,58,.20)',
    icon: function (c) {
      return /*#__PURE__*/React.createElement("svg", {
        width: "16",
        height: "16",
        viewBox: "0 0 16 16",
        fill: "none"
      }, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6.5",
        stroke: c,
        strokeWidth: "1.5"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M5 8.2L7.2 10.4L11 6",
        stroke: c,
        strokeWidth: "1.5",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }));
    }
  },
  warning: {
    color: '#8A5700',
    bg: 'rgba(138,87,0,.08)',
    border: 'rgba(138,87,0,.18)',
    icon: function (c) {
      return /*#__PURE__*/React.createElement("svg", {
        width: "16",
        height: "16",
        viewBox: "0 0 16 16",
        fill: "none"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M8 2L14.7 13.5H1.3Z",
        stroke: c,
        strokeWidth: "1.5",
        strokeLinejoin: "round",
        fill: "none"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "8",
        y1: "7",
        x2: "8",
        y2: "10.2",
        stroke: c,
        strokeWidth: "1.5",
        strokeLinecap: "round"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "11.8",
        r: ".8",
        fill: c
      }));
    }
  },
  error: {
    color: '#9C3026',
    bg: 'rgba(156,48,38,.08)',
    border: 'rgba(156,48,38,.18)',
    icon: function (c) {
      return /*#__PURE__*/React.createElement("svg", {
        width: "16",
        height: "16",
        viewBox: "0 0 16 16",
        fill: "none"
      }, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6.5",
        stroke: c,
        strokeWidth: "1.5"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "5.5",
        y1: "5.5",
        x2: "10.5",
        y2: "10.5",
        stroke: c,
        strokeWidth: "1.5",
        strokeLinecap: "round"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "10.5",
        y1: "5.5",
        x2: "5.5",
        y2: "10.5",
        stroke: c,
        strokeWidth: "1.5",
        strokeLinecap: "round"
      }));
    }
  }
};
function Alert(props) {
  var variant = props.variant != null ? props.variant : 'info';
  var title = props.title;
  var body = props.body;
  var children = props.children;
  var onDismiss = props.onDismiss;
  var cfg = ALERT_CFG[variant] || ALERT_CFG.info;
  var wrapStyle = {
    display: 'flex',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid ' + cfg.border,
    background: cfg.bg,
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased',
    alignItems: 'flex-start'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrapStyle,
    role: "alert"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
      paddingTop: '1px'
    }
  }, cfg.icon(cfg.color)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '3px'
    }
  }, title && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: '14px',
      fontWeight: 700,
      color: cfg.color,
      letterSpacing: '-0.01em',
      lineHeight: 1.3
    }
  }, title), body && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: '13.5px',
      lineHeight: 1.55,
      color: cfg.color,
      opacity: 0.85
    }
  }, body), children), onDismiss && /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    "aria-label": "Dismiss",
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: cfg.color,
      opacity: 0.55,
      padding: '1px',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "3",
    x2: "11",
    y2: "11",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "11",
    y1: "3",
    x2: "3",
    y2: "11",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }))));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Alert/Alert.jsx", error: String((e && e.message) || e) }); }

// Avatar/Avatar.jsx
try { (() => {
var AVATAR_SIZES = {
  xs: {
    px: 24,
    fontSize: '10px',
    radius: '6px'
  },
  sm: {
    px: 32,
    fontSize: '12px',
    radius: '8px'
  },
  md: {
    px: 40,
    fontSize: '14px',
    radius: '10px'
  },
  lg: {
    px: 52,
    fontSize: '18px',
    radius: '12px'
  },
  xl: {
    px: 72,
    fontSize: '24px',
    radius: '16px'
  }
};

// Warm palettes derived from name hash — no brand colour collisions
var AVATAR_PALETTES = [{
  bg: 'rgba(181,100,47,.16)',
  color: '#6a3d18'
}, {
  bg: 'rgba(31,107,58,.14)',
  color: '#1F6B3A'
}, {
  bg: 'rgba(42,95,138,.14)',
  color: '#1e4873'
}, {
  bg: 'rgba(100,89,78,.14)',
  color: '#4a4038'
}, {
  bg: 'rgba(138,87,0,.12)',
  color: '#6b4300'
}];
function hashName(name) {
  if (!name) return 0;
  var h = 0;
  for (var i = 0; i < name.length; i++) h = h * 31 + name.charCodeAt(i) | 0;
  return Math.abs(h);
}
function initials(name) {
  if (!name) return '?';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function Avatar(props) {
  var name = props.name;
  var src = props.src;
  var alt = props.alt;
  var size = props.size != null ? props.size : 'md';
  var shape = props.shape != null ? props.shape : 'circle';
  var sz = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  var pal = AVATAR_PALETTES[hashName(name) % AVATAR_PALETTES.length];
  var r = shape === 'circle' ? '50%' : sz.radius;
  var baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: sz.px,
    height: sz.px,
    borderRadius: r,
    flexShrink: 0,
    overflow: 'hidden',
    userSelect: 'none',
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased',
    border: '1px solid rgba(34,30,26,.10)' /* R11.1 — subtle ring reads cleaner than borderless */
  };
  if (src) {
    return /*#__PURE__*/React.createElement("div", {
      style: baseStyle
    }, /*#__PURE__*/React.createElement("img", {
      src: src,
      alt: alt || name || 'Avatar',
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({}, baseStyle, {
      background: pal.bg
    })
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: sz.fontSize,
      fontWeight: 700,
      letterSpacing: '.02em',
      color: pal.color,
      lineHeight: 1
    }
  }, initials(name)));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Avatar/Avatar.jsx", error: String((e && e.message) || e) }); }

// Badge/Badge.jsx
try { (() => {
// Badge — pill label with shape glyph + text.
// NEVER use colour alone. Every variant has a distinct SVG glyph.

var BADGE_GLYPHS = {
  copper: /*#__PURE__*/React.createElement("svg", {
    width: "7",
    height: "7",
    viewBox: "0 0 7 7",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3.5",
    cy: "3.5",
    r: "3.5",
    fill: "#B5642F"
  })),
  success: /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 9 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1.5 4.5L3.5 6.5L7.5 2.5",
    stroke: "#1F6B3A",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })),
  warning: /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 9 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4.5 1.5L8.2 7.5H.8Z",
    stroke: "#8A5700",
    strokeWidth: "1.4",
    strokeLinejoin: "round",
    fill: "none"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "4.5",
    y1: "3.8",
    x2: "4.5",
    y2: "5.6",
    stroke: "#8A5700",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "4.5",
    cy: "6.6",
    r: ".55",
    fill: "#8A5700"
  })),
  error: /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 9 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "2",
    y1: "2",
    x2: "7",
    y2: "7",
    stroke: "#9C3026",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "7",
    y1: "2",
    x2: "2",
    y2: "7",
    stroke: "#9C3026",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  })),
  neutral: /*#__PURE__*/React.createElement("svg", {
    width: "7",
    height: "7",
    viewBox: "0 0 7 7",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3.5",
    cy: "3.5",
    r: "3",
    stroke: "#6F665C",
    strokeWidth: "1.2",
    strokeDasharray: "2 1.4",
    fill: "none"
  }))
};
var BADGE_TOKENS = {
  copper: {
    color: '#6a3d18',
    bg: 'rgba(181,100,47,.14)',
    border: 'rgba(181,100,47,.22)'
  },
  success: {
    color: '#1F6B3A',
    bg: 'rgba(31,107,58,.12)',
    border: 'rgba(31,107,58,.22)'
  },
  warning: {
    color: '#8A5700',
    bg: 'rgba(138,87,0,.10)',
    border: 'rgba(138,87,0,.20)'
  },
  error: {
    color: '#9C3026',
    bg: 'rgba(156,48,38,.12)',
    border: 'rgba(156,48,38,.22)'
  },
  neutral: {
    color: '#64594E',
    bg: 'rgba(100,89,78,.08)',
    border: 'rgba(100,89,78,.18)'
  }
};
function Badge(props) {
  var variant = props.variant != null ? props.variant : 'neutral';
  var text = props.children || props.label;
  var tok = BADGE_TOKENS[variant] || BADGE_TOKENS.neutral;
  var glyph = BADGE_GLYPHS[variant];
  var style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '.09em',
    textTransform: 'uppercase',
    padding: '4px 9px',
    borderRadius: '9999px',
    border: '1px solid ' + tok.border,
    color: tok.color,
    background: tok.bg,
    whiteSpace: 'nowrap',
    userSelect: 'none'
  };
  return /*#__PURE__*/React.createElement("span", {
    style: style
  }, glyph && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    }
  }, glyph), text);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Badge/Badge.jsx", error: String((e && e.message) || e) }); }

// Button/Button.jsx
try { (() => {
var BTN_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontFamily: "'Mukta', sans-serif",
  fontWeight: 600,
  letterSpacing: '-0.01em',
  lineHeight: 1,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'background 140ms cubic-bezier(.22,1,.36,1), border-color 140ms ease, box-shadow 140ms ease, transform 90ms ease, opacity 120ms ease',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  WebkitFontSmoothing: 'antialiased',
  textDecoration: 'none',
  outline: 'none'
};

// R11.1 — base sizes follow the 16px body scale. md is the DEFAULT button.
var BTN_SIZES = {
  sm: {
    fontSize: '13px',
    padding: '0 13px',
    height: '34px',
    borderRadius: '8px',
    gap: '5px'
  },
  md: {
    fontSize: '16px',
    padding: '0 18px',
    height: '40px',
    borderRadius: '10px',
    gap: '7px'
  },
  lg: {
    fontSize: '17px',
    padding: '0 24px',
    height: '48px',
    borderRadius: '12px',
    gap: '8px'
  }
};

// Each variant carries a rest + hover surface. Hover shifts are deliberate but quiet.
var BTN_VARIANTS = {
  primary: {
    background: '#221E1A',
    hoverBackground: '#332D27',
    color: '#F8F6F2',
    borderColor: 'transparent',
    boxShadow: '0 1px 3px rgba(34,30,26,.22), inset 0 1px 0 rgba(255,255,255,.06)',
    hoverShadow: '0 3px 10px rgba(34,30,26,.26), inset 0 1px 0 rgba(255,255,255,.08)'
  },
  accent: {
    background: '#B5642F',
    hoverBackground: '#A1572A',
    color: '#F8F6F2',
    borderColor: 'transparent',
    boxShadow: '0 1px 3px rgba(181,100,47,.30), inset 0 1px 0 rgba(255,255,255,.10)',
    hoverShadow: '0 3px 12px rgba(181,100,47,.34), inset 0 1px 0 rgba(255,255,255,.12)'
  },
  secondary: {
    background: '#FCFBF8',
    hoverBackground: '#F2EDE4',
    color: '#221E1A',
    borderColor: '#EAE3D9',
    hoverBorderColor: '#DBD1C2',
    boxShadow: '0 1px 2px rgba(34,30,26,.06)',
    hoverShadow: '0 2px 6px rgba(34,30,26,.10)'
  },
  ghost: {
    background: 'transparent',
    hoverBackground: 'rgba(34,30,26,.05)',
    color: '#221E1A',
    borderColor: 'transparent',
    boxShadow: 'none',
    hoverShadow: 'none'
  },
  danger: {
    background: 'rgba(156,48,38,.10)',
    hoverBackground: 'rgba(156,48,38,.16)',
    color: '#9C3026',
    borderColor: 'rgba(156,48,38,.20)',
    hoverBorderColor: 'rgba(156,48,38,.32)',
    boxShadow: 'none',
    hoverShadow: 'none'
  }
};
function Button(props) {
  var variant = props.variant != null ? props.variant : 'primary';
  var size = props.size != null ? props.size : 'md';
  var label = props.label;
  var children = props.children;
  var disabled = props.disabled != null ? props.disabled : false;
  var loading = props.loading != null ? props.loading : false;
  var fullWidth = props.fullWidth != null ? props.fullWidth : false;
  var icon = props.icon;
  var type = props.type != null ? props.type : 'button';
  var onClick = props.onClick;
  var hoverState = React.useState(false);
  var hovered = hoverState[0],
    setHovered = hoverState[1];
  var pressState = React.useState(false);
  var pressed = pressState[0],
    setPressed = pressState[1];
  var sz = BTN_SIZES[size] || BTN_SIZES.md;
  var vr = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  var off = disabled || loading;
  var live = !off && hovered;
  var style = Object.assign({}, BTN_BASE, sz, {
    background: live && vr.hoverBackground ? vr.hoverBackground : vr.background,
    color: vr.color,
    borderColor: live && vr.hoverBorderColor ? vr.hoverBorderColor : vr.borderColor,
    boxShadow: live && vr.hoverShadow ? vr.hoverShadow : vr.boxShadow,
    width: fullWidth ? '100%' : undefined,
    opacity: off ? 0.45 : 1,
    cursor: off ? 'not-allowed' : 'pointer',
    transform: !off && pressed ? 'scale(0.97)' : 'scale(1)'
  });
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    style: style,
    disabled: off,
    onClick: onClick,
    onMouseEnter: function () {
      setHovered(true);
    },
    onMouseLeave: function () {
      setHovered(false);
      setPressed(false);
    },
    onMouseDown: function () {
      setPressed(true);
    },
    onMouseUp: function () {
      setPressed(false);
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    }
  }, icon), loading ? '…' : children || label);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Button/Button.jsx", error: String((e && e.message) || e) }); }

// Card/Card.jsx
try { (() => {
var CARD_PADDING = {
  none: '0',
  sm: '14px 16px',
  md: '24px 26px',
  lg: '32px 36px'
};
function Card(props) {
  var children = props.children;
  var padding = props.padding != null ? props.padding : 'md';
  var bordered = props.bordered != null ? props.bordered : true;
  var elevated = props.elevated != null ? props.elevated : false;
  var dark = props.dark != null ? props.dark : false;
  var onClick = props.onClick;
  var extStyle = props.style;
  var role = props.role;
  var bg = dark ? '#2B2825' : '#FFFFFF';
  var border = dark ? 'rgba(255,255,255,.08)' : '#EAE3D9';
  var hState = React.useState(false);
  var hovered = hState[0],
    setHovered = hState[1];
  var interactive = !!onClick;
  var restShadow = elevated ? '0 4px 14px rgba(34,30,26,.10), 0 2px 4px rgba(34,30,26,.06)' : undefined;
  var hoverShadow = '0 6px 18px rgba(34,30,26,.10), 0 2px 5px rgba(34,30,26,.06)';
  var style = Object.assign({
    background: bg,
    border: bordered ? '1px solid ' + (interactive && hovered && !dark ? '#DBD1C2' : border) : 'none',
    borderRadius: '14px',
    padding: CARD_PADDING[padding] || CARD_PADDING.md,
    boxShadow: interactive && hovered ? hoverShadow : restShadow,
    cursor: interactive ? 'pointer' : undefined,
    transform: interactive && hovered ? 'translateY(-2px)' : 'translateY(0)',
    transition: interactive ? 'box-shadow 160ms cubic-bezier(.22,1,.36,1), transform 160ms cubic-bezier(.22,1,.36,1), border-color 160ms ease' : undefined,
    fontFamily: "'Mukta', sans-serif",
    color: dark ? '#F3EEE6' : '#221E1A'
  }, extStyle);
  return /*#__PURE__*/React.createElement("div", {
    style: style,
    role: role,
    onClick: onClick,
    onMouseEnter: interactive ? function () {
      setHovered(true);
    } : undefined,
    onMouseLeave: interactive ? function () {
      setHovered(false);
    } : undefined
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Card/Card.jsx", error: String((e && e.message) || e) }); }

// DataTable/DataTable.jsx
try { (() => {
function DataTable(props) {
  var columns = props.columns || [];
  var rows = props.rows || [];
  var emptyLabel = props.emptyLabel != null ? props.emptyLabel : 'No data yet.';
  var onRowClick = props.onRowClick;
  var stickyHeader = props.stickyHeader != null ? props.stickyHeader : true;
  var wrapStyle = {
    border: '1px solid #EAE3D9',
    borderRadius: '14px',
    overflow: 'hidden',
    background: '#FFFFFF',
    width: '100%'
  };
  var tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '15px',
    WebkitFontSmoothing: 'antialiased'
  };
  var thStyle = {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '.10em',
    textTransform: 'uppercase',
    color: '#6F665C',
    whiteSpace: 'nowrap',
    fontFamily: "'JetBrains Mono', monospace",
    borderBottom: '1px solid #EAE3D9',
    background: '#FFFFFF',
    position: stickyHeader ? 'sticky' : 'static',
    top: 0,
    zIndex: 1
  };
  var thNumStyle = Object.assign({}, thStyle, {
    textAlign: 'right'
  });
  var tdStyle = {
    padding: '11px 16px',
    color: '#221E1A',
    borderBottom: '1px solid #EAE3D9',
    verticalAlign: 'middle',
    lineHeight: 1.4,
    letterSpacing: '-0.005em'
  };
  var tdNumStyle = Object.assign({}, tdStyle, {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    fontFeatureSettings: '"tnum" 1',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13.5px'
  });
  if (!rows.length) {
    return /*#__PURE__*/React.createElement("div", {
      style: Object.assign({}, wrapStyle, {
        padding: '48px 32px',
        textAlign: 'center',
        color: '#64594E',
        fontSize: '14px'
      })
    }, emptyLabel);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: wrapStyle
  }, /*#__PURE__*/React.createElement("table", {
    style: tableStyle
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(function (col, i) {
    return /*#__PURE__*/React.createElement("th", {
      key: i,
      style: col.numeric ? thNumStyle : thStyle
    }, col.label || col.key);
  }))), /*#__PURE__*/React.createElement("tbody", null, rows.map(function (row, ri) {
    return /*#__PURE__*/React.createElement(TableRow, {
      key: ri,
      row: row,
      ri: ri,
      columns: columns,
      tdStyle: tdStyle,
      tdNumStyle: tdNumStyle,
      lastRow: ri === rows.length - 1,
      onRowClick: onRowClick
    });
  }))));
}

/* Extracted so each row can own its own hover state. */
function TableRow(props) {
  var row = props.row,
    ri = props.ri,
    columns = props.columns;
  var tdStyle = props.tdStyle,
    tdNumStyle = props.tdNumStyle;
  var lastRow = props.lastRow,
    onRowClick = props.onRowClick;
  var interactive = !!onRowClick;
  var hState = React.useState(false);
  var hovered = hState[0],
    setHovered = hState[1];
  return /*#__PURE__*/React.createElement("tr", {
    onClick: interactive ? function () {
      onRowClick(row, ri);
    } : undefined,
    onMouseEnter: interactive ? function () {
      setHovered(true);
    } : undefined,
    onMouseLeave: interactive ? function () {
      setHovered(false);
    } : undefined,
    style: {
      cursor: interactive ? 'pointer' : 'default',
      background: interactive && hovered ? 'rgba(34,30,26,.035)' : 'transparent',
      transition: 'background 110ms ease'
    }
  }, columns.map(function (col, ci) {
    var cell = typeof col.render === 'function' ? col.render(row[col.key], row, ri) : row[col.key];
    var base = col.numeric ? tdNumStyle : tdStyle;
    var noLine = lastRow ? {
      borderBottom: 'none'
    } : {};
    return /*#__PURE__*/React.createElement("td", {
      key: ci,
      style: Object.assign({}, base, noLine)
    }, cell);
  }));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "DataTable/DataTable.jsx", error: String((e && e.message) || e) }); }

// DatePicker/DatePicker.jsx
try { (() => {
var YK_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var YK_MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var YK_DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
function ykParseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  var d = new Date(v);
  return isNaN(d) ? null : d;
}
function ykFmt(d) {
  if (!d) return '';
  return d.getDate() + ' ' + YK_MON_SHORT[d.getMonth()] + ' ' + d.getFullYear();
}
function ykIso(d) {
  var m = d.getMonth() + 1,
    day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}
function ykSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function DatePicker(props) {
  var label = props.label;
  var placeholder = props.placeholder != null ? props.placeholder : 'DD MMM YYYY';
  var value = props.value;
  var defaultValue = props.defaultValue;
  var hint = props.hint;
  var error = props.error;
  var disabled = props.disabled != null ? props.disabled : false;
  var required = props.required != null ? props.required : false;
  var name = props.name;
  var id = props.id;
  var minDate = ykParseDate(props.min);
  var maxDate = ykParseDate(props.max);
  var onChange = props.onChange;
  var hasError = !!error;
  var inputId = id || (label ? 'yk-dp-' + label.toLowerCase().replace(/\s+/g, '-') : undefined);
  var openState = React.useState(false);
  var open = openState[0],
    setOpen = openState[1];
  var hovState = React.useState(false);
  var hovered = hovState[0],
    setHovered = hovState[1];
  var internal = React.useState(ykParseDate(defaultValue));
  var curr = value != null ? ykParseDate(value) : internal[0];
  var today = new Date();
  var viewState = React.useState(curr || today);
  var view = viewState[0],
    setView = viewState[1];
  function pick(d) {
    if (value == null) internal[1](d);
    setView(d);
    setOpen(false);
    if (onChange) onChange(ykIso(d));
  }
  function shiftMonth(n) {
    setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  }
  function disabledDay(d) {
    if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    return false;
  }
  var border = hasError ? '#9C3026' : open ? '#B5642F' : hovered ? '#DBD1C2' : '#EAE3D9';
  var ring = hasError ? '0 0 0 3px rgba(156,48,38,.10)' : open ? '0 0 0 3px rgba(181,100,47,.14)' : undefined;

  // build calendar grid (Mon-first)
  var first = new Date(view.getFullYear(), view.getMonth(), 1);
  var startOffset = (first.getDay() + 6) % 7; // Mon=0
  var daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  var cells = [];
  for (var i = 0; i < startOffset; i++) cells.push(null);
  for (var d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  var wrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased'
  };
  var labelStyle = {
    fontSize: '12.5px',
    fontWeight: 600,
    letterSpacing: '.04em',
    color: '#64594E',
    userSelect: 'none',
    lineHeight: 1.3
  };
  var triggerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    width: '100%',
    height: '42px',
    background: disabled ? 'rgba(248,246,242,.6)' : '#FFFFFF',
    border: '1px solid ' + border,
    borderRadius: '10px',
    padding: '0 12px',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '15px',
    fontWeight: 400,
    color: curr ? '#221E1A' : '#6F665C',
    letterSpacing: '-0.01em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    boxShadow: ring,
    outline: 'none',
    textAlign: 'left',
    transition: 'border-color 140ms ease, box-shadow 140ms ease'
  };
  var hintStyle = {
    fontSize: '12.5px',
    color: hasError ? '#9C3026' : '#6F665C',
    lineHeight: 1.45
  };
  var navBtn = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: '#64594E',
    cursor: 'pointer'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrapStyle
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: labelStyle
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#9C3026',
      marginLeft: '2px'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "hidden",
    name: name,
    value: curr ? ykIso(curr) : ''
  }), /*#__PURE__*/React.createElement("button", {
    id: inputId,
    type: "button",
    style: triggerStyle,
    disabled: disabled,
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    onClick: function () {
      if (!disabled) setOpen(!open);
    },
    onMouseEnter: function () {
      setHovered(true);
    },
    onMouseLeave: function () {
      setHovered(false);
    },
    onBlur: function () {
      setTimeout(function () {
        setOpen(false);
      }, 140);
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums'
    }
  }, curr ? ykFmt(curr) : placeholder), /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      color: '#6F665C',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "3",
    width: "12",
    height: "11",
    rx: "2",
    stroke: "currentColor",
    strokeWidth: "1.7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2 6.5H14M5 1.5V4M11 1.5V4",
    stroke: "currentColor",
    strokeWidth: "1.7",
    strokeLinecap: "round"
  })))), open && !disabled && /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: 0,
      zIndex: 100,
      width: '278px',
      background: '#FFFFFF',
      border: '1px solid #EAE3D9',
      borderRadius: '14px',
      boxShadow: '0 12px 32px rgba(34,30,26,.12), 0 4px 8px rgba(34,30,26,.06)',
      padding: '12px',
      animation: 'ykDpIn 140ms cubic-bezier(.22,1,.36,1)'
    },
    onMouseDown: function (e) {
      e.preventDefault();
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes ykDpIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '10px'
    }
  }, /*#__PURE__*/React.createElement(NavBtn, {
    dir: "prev",
    style: navBtn,
    onClick: function () {
      shiftMonth(-1);
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      fontWeight: 700,
      letterSpacing: '-0.015em',
      color: '#221E1A'
    }
  }, YK_MONTHS[view.getMonth()], " ", view.getFullYear()), /*#__PURE__*/React.createElement(NavBtn, {
    dir: "next",
    style: navBtn,
    onClick: function () {
      shiftMonth(1);
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7,1fr)',
      gap: '2px',
      marginBottom: '4px'
    }
  }, YK_DOW.map(function (w, i) {
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        textAlign: 'center',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px',
        fontWeight: 500,
        color: '#6F665C',
        letterSpacing: '.04em',
        padding: '2px 0'
      }
    }, w);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7,1fr)',
      gap: '2px'
    }
  }, cells.map(function (c, i) {
    if (!c) return /*#__PURE__*/React.createElement("div", {
      key: i
    });
    return /*#__PURE__*/React.createElement(DayCell, {
      key: i,
      date: c,
      curr: curr,
      today: today,
      disabled: disabledDay(c),
      onPick: pick
    });
  })))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: hintStyle
  }, error || hint));
}
function NavBtn(props) {
  var hs = React.useState(false);
  var hov = hs[0],
    setHov = hs[1];
  var s = Object.assign({}, props.style, {
    background: hov ? 'rgba(34,30,26,.05)' : 'transparent',
    transition: 'background 110ms ease'
  });
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: s,
    onClick: props.onClick,
    onMouseEnter: function () {
      setHov(true);
    },
    onMouseLeave: function () {
      setHov(false);
    },
    "aria-label": props.dir === 'prev' ? 'Previous month' : 'Next month'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 15 15",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: props.dir === 'prev' ? 'M9 3.5L5 7.5L9 11.5' : 'M6 3.5L10 7.5L6 11.5',
    stroke: "currentColor",
    strokeWidth: "1.85",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
}
function DayCell(props) {
  var date = props.date,
    curr = props.curr,
    today = props.today,
    disabled = props.disabled,
    onPick = props.onPick;
  var hs = React.useState(false);
  var hov = hs[0],
    setHov = hs[1];
  var isSel = ykSameDay(date, curr);
  var isToday = ykSameDay(date, today);
  var bg = isSel ? '#B5642F' : hov && !disabled ? 'rgba(34,30,26,.05)' : 'transparent';
  var color = isSel ? '#F8F6F2' : disabled ? '#bcb3a8' : '#221E1A';
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: disabled,
    onClick: function () {
      if (!disabled) onPick(date);
    },
    onMouseEnter: function () {
      setHov(true);
    },
    onMouseLeave: function () {
      setHov(false);
    },
    style: {
      position: 'relative',
      height: '32px',
      borderRadius: '8px',
      border: 'none',
      background: bg,
      color: color,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12.5px',
      fontWeight: isSel ? 600 : 400,
      fontVariantNumeric: 'tabular-nums',
      transition: 'background 110ms ease',
      boxShadow: isSel ? '0 1px 3px rgba(181,100,47,.30)' : 'none'
    }
  }, date.getDate(), isToday && !isSel && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: '4px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '3px',
      height: '3px',
      borderRadius: '50%',
      background: '#B5642F'
    }
  }));
}
Object.assign(__ds_scope, { DatePicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "DatePicker/DatePicker.jsx", error: String((e && e.message) || e) }); }

// EmptyState/EmptyState.jsx
try { (() => {
// EmptyState — structural keystone-inspired SVG illustrations.
// Avoid ledgers, coins, compliance imagery (brand brief §10).

function EmptyIllustration(props) {
  var kind = props.kind;
  var cu = '#B5642F';
  var cf = 'rgba(181,100,47,.18)';
  var ln = '#EAE3D9';
  var bg = 'rgba(234,227,217,.35)';
  if (kind === 'orders') return /*#__PURE__*/React.createElement("svg", {
    width: "100",
    height: "76",
    viewBox: "0 0 100 76",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "18",
    width: "84",
    height: "50",
    rx: "5",
    fill: bg,
    stroke: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "18",
    y: "28",
    width: "30",
    height: "12",
    rx: "3",
    fill: cf,
    stroke: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "18",
    y: "44",
    width: "22",
    height: "6",
    rx: "2",
    fill: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "18",
    y: "54",
    width: "34",
    height: "4",
    rx: "2",
    fill: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "54",
    y: "26",
    width: "30",
    height: "34",
    rx: "3",
    fill: cf,
    stroke: ln
  }), /*#__PURE__*/React.createElement("path", {
    d: "M61 34L65.5 34L67 40.5L59 40.5Z",
    fill: cu,
    opacity: ".5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M55 40L59.5 40.8L61 47L56 47Z",
    fill: cu,
    opacity: ".3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M71 40L66.5 40.8L65 47L70 47Z",
    fill: cu,
    opacity: ".3"
  }));
  if (kind === 'catalog') return /*#__PURE__*/React.createElement("svg", {
    width: "100",
    height: "76",
    viewBox: "0 0 100 76",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "10",
    y: "10",
    width: "36",
    height: "52",
    rx: "4",
    fill: bg,
    stroke: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "16",
    y: "18",
    width: "24",
    height: "18",
    rx: "2",
    fill: cf,
    stroke: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "16",
    y: "40",
    width: "16",
    height: "4",
    rx: "2",
    fill: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "16",
    y: "48",
    width: "22",
    height: "4",
    rx: "2",
    fill: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "54",
    y: "16",
    width: "34",
    height: "46",
    rx: "4",
    fill: bg,
    stroke: ln
  }), /*#__PURE__*/React.createElement("rect", {
    x: "60",
    y: "24",
    width: "22",
    height: "18",
    rx: "2",
    fill: cf,
    stroke: ln
  }), /*#__PURE__*/React.createElement("path", {
    d: "M68 26L72.5 26L73.8 32L66.2 32Z",
    fill: cu,
    opacity: ".6"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "60",
    y: "46",
    width: "14",
    height: "4",
    rx: "2",
    fill: cu,
    opacity: ".4"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "60",
    y: "54",
    width: "20",
    height: "4",
    rx: "2",
    fill: ln
  }));
  if (kind === 'buyers') return /*#__PURE__*/React.createElement("svg", {
    width: "100",
    height: "76",
    viewBox: "0 0 100 76",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "36",
    cy: "28",
    r: "14",
    fill: cf,
    stroke: ln
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "36",
    cy: "23",
    r: "7",
    fill: cu,
    opacity: ".35"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 60C16 49.5 25 42 36 42C47 42 56 49.5 56 60",
    stroke: cu,
    strokeWidth: "2",
    strokeLinecap: "round",
    opacity: ".4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "68",
    cy: "28",
    r: "10",
    fill: bg,
    stroke: ln
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "68",
    cy: "24",
    r: "5",
    fill: cu,
    opacity: ".2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M54 56C54 48.3 60 43 68 43C76 43 82 48.3 82 56",
    stroke: ln,
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }));
  if (kind === 'search') return /*#__PURE__*/React.createElement("svg", {
    width: "100",
    height: "76",
    viewBox: "0 0 100 76",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "42",
    cy: "36",
    r: "22",
    stroke: ln,
    strokeWidth: "2",
    fill: bg
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "42",
    cy: "36",
    r: "14",
    fill: cf
  }), /*#__PURE__*/React.createElement("path", {
    d: "M39 30L45 30L46.5 37.5L37.5 37.5Z",
    fill: cu,
    opacity: ".5"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "59",
    y1: "53",
    x2: "72",
    y2: "66",
    stroke: ln,
    strokeWidth: "3",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "30",
    y1: "42",
    x2: "26",
    y2: "46",
    stroke: ln,
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }));

  // generic — arch / keystone structure
  return /*#__PURE__*/React.createElement("svg", {
    width: "100",
    height: "76",
    viewBox: "0 0 100 76",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 60L20 38C20 26 30 18 50 18C70 18 80 26 80 38L80 60",
    stroke: ln,
    strokeWidth: "2",
    strokeLinecap: "round",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "13",
    y: "58",
    width: "74",
    height: "10",
    rx: "4",
    fill: bg,
    stroke: ln
  }), /*#__PURE__*/React.createElement("path", {
    d: "M39 17.5L61 17.5L64.5 32L35.5 32Z",
    fill: cu,
    opacity: ".3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 34L35.5 36.8L39 50L22 50Z",
    fill: cu,
    opacity: ".15"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M80 34L64.5 36.8L61 50L78 50Z",
    fill: cu,
    opacity: ".15"
  }));
}
function EmptyState(props) {
  var kind = props.kind != null ? props.kind : 'generic';
  var title = props.title;
  var body = props.body;
  var action = props.action;
  var illustration = props.illustration;
  var wrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    padding: '48px 32px',
    textAlign: 'center',
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrapStyle
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '4px'
    }
  }, illustration || /*#__PURE__*/React.createElement(EmptyIllustration, {
    kind: kind
  })), title && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: '17px',
      fontWeight: 700,
      letterSpacing: '-0.01em',
      color: '#221E1A',
      lineHeight: 1.3
    }
  }, title), body && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: '14px',
      lineHeight: 1.6,
      color: '#64594E',
      maxWidth: '300px'
    }
  }, body), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '6px'
    }
  }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "EmptyState/EmptyState.jsx", error: String((e && e.message) || e) }); }

// Input/Input.jsx
try { (() => {
function Input(props) {
  var label = props.label;
  var placeholder = props.placeholder != null ? props.placeholder : '';
  var hint = props.hint;
  var error = props.error;
  var type = props.type != null ? props.type : 'text';
  var value = props.value;
  var defaultValue = props.defaultValue;
  var disabled = props.disabled != null ? props.disabled : false;
  var required = props.required != null ? props.required : false;
  var prefix = props.prefix;
  var suffix = props.suffix;
  var id = props.id;
  var name = props.name;
  var onChange = props.onChange;
  var onBlur = props.onBlur;
  var hasError = !!error;
  var inputId = id || (label ? 'yk-' + label.toLowerCase().replace(/\s+/g, '-') : undefined);
  var fState = React.useState(false);
  var focused = fState[0],
    setFocused = fState[1];
  var hState = React.useState(false);
  var hovered = hState[0],
    setHovered = hState[1];
  var wrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased'
  };
  var labelStyle = {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '.04em',
    color: '#64594E',
    userSelect: 'none',
    lineHeight: 1.3
  };
  var fieldBorder = hasError ? '#9C3026' : focused ? '#B5642F' : hovered ? '#DBD1C2' : '#EAE3D9';
  var fieldRing = hasError ? '0 0 0 3px rgba(156,48,38,.10)' : focused ? '0 0 0 3px rgba(181,100,47,.14)' : undefined;
  var fieldWrapStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: disabled ? 'rgba(248,246,242,.6)' : '#FFFFFF',
    border: '1px solid ' + fieldBorder,
    borderRadius: '10px',
    padding: '0 12px',
    height: '42px',
    transition: 'border-color 140ms ease, box-shadow 140ms ease',
    boxShadow: fieldRing,
    opacity: disabled ? 0.6 : 1
  };
  var inputStyle = {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '15px',
    fontWeight: 400,
    color: '#221E1A',
    letterSpacing: '-0.01em',
    lineHeight: 1.55,
    cursor: disabled ? 'not-allowed' : undefined,
    minWidth: 0
  };
  var affixStyle = {
    fontSize: '14px',
    color: '#6F665C',
    userSelect: 'none',
    flexShrink: 0,
    fontFamily: "'Mukta', sans-serif"
  };
  var hintStyle = {
    fontSize: '12px',
    color: hasError ? '#9C3026' : '#6F665C',
    lineHeight: 1.45,
    letterSpacing: '-0.005em'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrapStyle
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: labelStyle
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#9C3026',
      marginLeft: '2px'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: fieldWrapStyle,
    onMouseEnter: function () {
      setHovered(true);
    },
    onMouseLeave: function () {
      setHovered(false);
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: affixStyle
  }, prefix), /*#__PURE__*/React.createElement("input", {
    id: inputId,
    name: name,
    type: type,
    placeholder: placeholder,
    disabled: disabled,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    onBlur: function (e) {
      setFocused(false);
      if (onBlur) onBlur(e);
    },
    onFocus: function () {
      setFocused(true);
    },
    required: required,
    style: inputStyle
  }), suffix && /*#__PURE__*/React.createElement("span", {
    style: affixStyle
  }, suffix)), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: hintStyle
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Input/Input.jsx", error: String((e && e.message) || e) }); }

// ProductCard/ProductCard.jsx
try { (() => {
function ProductCard(props) {
  var name = props.name;
  var brand = props.brand;
  var sku = props.sku;
  var price = props.price;
  var mrp = props.mrp;
  var uom = props.uom;
  var imageUrl = props.imageUrl;
  var availability = props.availability != null ? props.availability : 'available';
  var isNew = props.isNew != null ? props.isNew : false;
  var onAddToCart = props.onAddToCart;
  var onClick = props.onClick;
  var isOOS = availability === 'out-of-stock';
  var isLimited = availability === 'limited';
  var hoverState = React.useState(false);
  var hovered = hoverState[0],
    setHovered = hoverState[1];
  var addState = React.useState(false);
  var addHover = addState[0],
    setAddHover = addState[1];
  function AvailBadge() {
    if (isLimited) return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '9px',
        fontWeight: 500,
        letterSpacing: '.07em',
        textTransform: 'uppercase',
        padding: '3px 7px',
        borderRadius: '99px',
        border: '1px solid rgba(138,87,0,.22)',
        background: 'rgba(138,87,0,.10)',
        color: '#8A5700',
        whiteSpace: 'nowrap'
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "6",
      height: "6",
      viewBox: "0 0 6 6",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M3 0.5L5.6 5H0.4Z",
      fill: "#8A5700"
    })), "Low stock");
    if (isOOS) return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '9px',
        fontWeight: 500,
        letterSpacing: '.07em',
        textTransform: 'uppercase',
        padding: '3px 7px',
        borderRadius: '99px',
        border: '1px solid rgba(100,89,78,.18)',
        background: 'rgba(100,89,78,.08)',
        color: '#64594E',
        whiteSpace: 'nowrap'
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "6",
      height: "6",
      viewBox: "0 0 6 6",
      fill: "none"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "0.5",
      y: "0.5",
      width: "5",
      height: "5",
      rx: "1",
      stroke: "#64594E",
      strokeWidth: "1"
    })), "Out of stock");
    return null;
  }
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: function () {
      setHovered(true);
    },
    onMouseLeave: function () {
      setHovered(false);
    },
    style: {
      background: '#FFFFFF',
      border: '1px solid ' + (hovered && !isOOS ? '#DBD1C2' : '#EAE3D9'),
      borderRadius: '12px',
      overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
      opacity: isOOS ? 0.72 : 1,
      fontFamily: "'Mukta', sans-serif",
      WebkitFontSmoothing: 'antialiased',
      display: 'flex',
      flexDirection: 'column',
      transition: 'box-shadow 160ms cubic-bezier(.22,1,.36,1), transform 160ms cubic-bezier(.22,1,.36,1), border-color 160ms ease',
      transform: hovered && !isOOS ? 'translateY(-2px)' : 'translateY(0)',
      boxShadow: hovered && !isOOS ? '0 6px 18px rgba(34,30,26,.10), 0 2px 5px rgba(34,30,26,.06)' : '0 1px 2px rgba(34,30,26,.04)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '120px',
      background: 'rgba(181,100,47,.07)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }
  }, imageUrl ? /*#__PURE__*/React.createElement("img", {
    src: imageUrl,
    alt: name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : /*#__PURE__*/React.createElement("svg", {
    width: "44",
    height: "44",
    viewBox: "0 0 44 44",
    fill: "none",
    style: {
      opacity: 0.35
    }
  }, /*#__PURE__*/React.createElement("rect", {
    x: "10",
    y: "6",
    width: "24",
    height: "32",
    rx: "4",
    fill: "#B5642F"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "12",
    width: "16",
    height: "10",
    rx: "2",
    fill: "#F8F6F2",
    opacity: ".7"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "28",
    width: "10",
    height: "4",
    rx: "2",
    fill: "#F8F6F2",
    opacity: ".5"
  })), isNew && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '8px',
      left: '8px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '9px',
      fontWeight: 500,
      letterSpacing: '.07em',
      textTransform: 'uppercase',
      padding: '3px 7px',
      borderRadius: '99px',
      border: '1px solid rgba(181,100,47,.22)',
      background: 'rgba(181,100,47,.14)',
      color: '#6a3d18'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "6",
    height: "6",
    viewBox: "0 0 6 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "3",
    fill: "#B5642F"
  })), "New"), !isNew && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: '8px',
      left: '8px'
    }
  }, /*#__PURE__*/React.createElement(AvailBadge, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 12px 12px',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    }
  }, (brand || sku) && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '10.5px',
      color: '#6F665C',
      letterSpacing: '.04em'
    }
  }, brand, brand && sku ? ' · ' : '', sku), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '15px',
      fontWeight: 600,
      color: '#221E1A',
      lineHeight: 1.3,
      letterSpacing: '-0.01em'
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: '6px',
      marginTop: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '16px',
      fontWeight: 500,
      color: isOOS ? '#6F665C' : '#221E1A',
      fontVariantNumeric: 'tabular-nums',
      display: 'inline-flex',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.72em',
      marginRight: '0.5px',
      opacity: 0.9
    }
  }, "\u20B9"), price), mrp && mrp !== price && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12px',
      color: '#6F665C',
      textDecoration: 'line-through',
      fontVariantNumeric: 'tabular-nums',
      display: 'inline-flex',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.78em',
      marginRight: '0.5px'
    }
  }, "\u20B9"), mrp)), uom && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '11.5px',
      color: '#64594E',
      letterSpacing: '-.005em'
    }
  }, uom), onAddToCart && /*#__PURE__*/React.createElement("button", {
    onClick: function (e) {
      e.stopPropagation();
      if (onAddToCart) onAddToCart();
    },
    onMouseEnter: function () {
      setAddHover(true);
    },
    onMouseLeave: function () {
      setAddHover(false);
    },
    disabled: isOOS,
    style: {
      width: '100%',
      marginTop: '10px',
      height: '38px',
      borderRadius: '9px',
      background: isOOS ? '#EAE3D9' : addHover ? '#332D27' : '#221E1A',
      color: isOOS ? '#6F665C' : '#F8F6F2',
      border: 'none',
      fontFamily: "'Mukta', sans-serif",
      fontSize: '14px',
      fontWeight: 600,
      cursor: isOOS ? 'not-allowed' : 'pointer',
      letterSpacing: '-0.01em',
      boxShadow: isOOS ? 'none' : addHover ? '0 3px 10px rgba(34,30,26,.24)' : '0 1px 3px rgba(34,30,26,.20)',
      transition: 'background 140ms ease, box-shadow 140ms ease'
    }
  }, isOOS ? 'Out of stock' : 'Add to cart')));
}
Object.assign(__ds_scope, { ProductCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "ProductCard/ProductCard.jsx", error: String((e && e.message) || e) }); }

// SearchBar/SearchBar.jsx
try { (() => {
function SearchBar(props) {
  var placeholder = props.placeholder != null ? props.placeholder : 'Search…';
  var value = props.value;
  var defaultValue = props.defaultValue;
  var shortcut = props.shortcut;
  var size = props.size != null ? props.size : 'md';
  var disabled = props.disabled != null ? props.disabled : false;
  var fullWidth = props.fullWidth != null ? props.fullWidth : false;
  var onChange = props.onChange;
  var onClear = props.onClear;
  var onSubmit = props.onSubmit;
  var heights = {
    sm: '32px',
    md: '38px',
    lg: '44px'
  };
  var fontSizes = {
    sm: '12.5px',
    md: '14px',
    lg: '15px'
  };
  var radii = {
    sm: '8px',
    md: '10px',
    lg: '11px'
  };
  var pads = {
    sm: '0 10px',
    md: '0 12px',
    lg: '0 14px'
  };
  var focState = React.useState(false);
  var focused = focState[0],
    setFocused = focState[1];
  var hovState = React.useState(false);
  var hovered = hovState[0],
    setHovered = hovState[1];
  var hasValue = value != null ? value.length > 0 : false;
  var borderColor = focused ? '#B5642F' : hovered ? '#DBD1C2' : '#EAE3D9';
  var ringStyle = focused ? '0 0 0 3px rgba(181,100,47,.14)' : undefined;
  function handleKeyDown(e) {
    if (e.key === 'Enter' && onSubmit) onSubmit(e.target.value);
  }
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: function () {
      if (!disabled) setHovered(true);
    },
    onMouseLeave: function () {
      setHovered(false);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: disabled ? 'rgba(248,246,242,.6)' : '#FFFFFF',
      border: '1px solid ' + borderColor,
      borderRadius: radii[size] || radii.md,
      padding: pads[size] || pads.md,
      height: heights[size] || heights.md,
      opacity: disabled ? 0.6 : 1,
      width: fullWidth ? '100%' : undefined,
      boxShadow: ringStyle,
      transition: 'border-color 140ms ease, box-shadow 140ms ease',
      fontFamily: "'Mukta', sans-serif"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    style: {
      flexShrink: 0,
      color: '#6F665C'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "4",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.5 9.5L12 12",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  })), /*#__PURE__*/React.createElement("input", {
    type: "search",
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    disabled: disabled,
    onChange: onChange,
    onFocus: function () {
      setFocused(true);
    },
    onBlur: function () {
      setFocused(false);
    },
    onKeyDown: handleKeyDown,
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: "'Mukta', sans-serif",
      fontSize: fontSizes[size] || fontSizes.md,
      color: '#221E1A',
      letterSpacing: '-0.01em',
      minWidth: 0,
      cursor: disabled ? 'not-allowed' : undefined
    }
  }), hasValue && onClear && /*#__PURE__*/React.createElement("button", {
    onClick: onClear,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: '#6F665C',
      padding: '1px',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 13 13",
    fill: "none"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "3",
    x2: "10",
    y2: "10",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "10",
    y1: "3",
    x2: "3",
    y2: "10",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }))), shortcut && !hasValue && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '10px',
      color: '#6F665C',
      background: '#EAE3D9',
      padding: '2px 6px',
      borderRadius: '4px',
      flexShrink: 0,
      letterSpacing: '.04em'
    }
  }, shortcut));
}
Object.assign(__ds_scope, { SearchBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "SearchBar/SearchBar.jsx", error: String((e && e.message) || e) }); }

// Select/Select.jsx
try { (() => {
function Select(props) {
  var label = props.label;
  var placeholder = props.placeholder != null ? props.placeholder : 'Select…';
  var options = props.options || [];
  var value = props.value;
  var defaultValue = props.defaultValue;
  var hint = props.hint;
  var error = props.error;
  var disabled = props.disabled != null ? props.disabled : false;
  var required = props.required != null ? props.required : false;
  var id = props.id;
  var name = props.name;
  var onChange = props.onChange;
  var hasError = !!error;
  var inputId = id || (label ? 'yk-sel-' + label.toLowerCase().replace(/\s+/g, '-') : undefined);
  var openState = React.useState(false);
  var open = openState[0],
    setOpen = openState[1];
  var hovState = React.useState(false);
  var hovered = hovState[0],
    setHovered = hovState[1];
  // uncontrolled internal value falls back to defaultValue
  var internal = React.useState(defaultValue != null ? defaultValue : '');
  var curr = value != null ? value : internal[0];
  function choose(v) {
    if (value == null) internal[1](v);
    setOpen(false);
    if (onChange) onChange(v);
  }
  var selected = options.filter(function (o) {
    return o.value === curr;
  })[0];
  var border = hasError ? '#9C3026' : open ? '#B5642F' : hovered ? '#DBD1C2' : '#EAE3D9';
  var ring = hasError ? '0 0 0 3px rgba(156,48,38,.10)' : open ? '0 0 0 3px rgba(181,100,47,.14)' : undefined;
  var wrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased'
  };
  var labelStyle = {
    fontSize: '12.5px',
    fontWeight: 600,
    letterSpacing: '.04em',
    color: '#64594E',
    userSelect: 'none',
    lineHeight: 1.3
  };
  var triggerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    width: '100%',
    height: '42px',
    background: disabled ? 'rgba(248,246,242,.6)' : '#FFFFFF',
    border: '1px solid ' + border,
    borderRadius: '10px',
    padding: '0 12px',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '15px',
    fontWeight: 400,
    color: selected ? '#221E1A' : '#6F665C',
    letterSpacing: '-0.01em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    boxShadow: ring,
    outline: 'none',
    textAlign: 'left',
    transition: 'border-color 140ms ease, box-shadow 140ms ease'
  };
  var hintStyle = {
    fontSize: '12.5px',
    color: hasError ? '#9C3026' : '#6F665C',
    lineHeight: 1.45,
    letterSpacing: '-0.005em'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrapStyle
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: labelStyle
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#9C3026',
      marginLeft: '2px'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "hidden",
    name: name,
    value: curr
  }), /*#__PURE__*/React.createElement("button", {
    id: inputId,
    type: "button",
    style: triggerStyle,
    disabled: disabled,
    "aria-haspopup": "listbox",
    "aria-expanded": open,
    onClick: function () {
      if (!disabled) setOpen(!open);
    },
    onMouseEnter: function () {
      setHovered(true);
    },
    onMouseLeave: function () {
      setHovered(false);
    },
    onBlur: function () {
      setTimeout(function () {
        setOpen(false);
      }, 120);
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, selected ? selected.label : placeholder), /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      color: '#6F665C',
      display: 'flex',
      alignItems: 'center',
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 160ms cubic-bezier(.22,1,.36,1)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3.5 5.5L7 9L10.5 5.5",
    stroke: "currentColor",
    strokeWidth: "1.85",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))), open && !disabled && /*#__PURE__*/React.createElement("div", {
    role: "listbox",
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: 0,
      right: 0,
      zIndex: 100,
      background: '#FFFFFF',
      border: '1px solid #EAE3D9',
      borderRadius: '12px',
      boxShadow: '0 12px 32px rgba(34,30,26,.12), 0 4px 8px rgba(34,30,26,.06)',
      padding: '5px',
      maxHeight: '264px',
      overflowY: 'auto',
      animation: 'ykSelIn 140ms cubic-bezier(.22,1,.36,1)'
    }
  }, /*#__PURE__*/React.createElement("style", null, '@keyframes ykSelIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'), options.map(function (opt, i) {
    var isSel = opt.value === curr;
    return /*#__PURE__*/React.createElement(Opt, {
      key: i,
      opt: opt,
      isSel: isSel,
      onPick: choose
    });
  }))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: hintStyle
  }, error || hint));
}
function Opt(props) {
  var opt = props.opt,
    isSel = props.isSel,
    onPick = props.onPick;
  var hs = React.useState(false);
  var hov = hs[0],
    setHov = hs[1];
  return /*#__PURE__*/React.createElement("div", {
    role: "option",
    "aria-selected": isSel,
    onMouseDown: function (e) {
      e.preventDefault();
      if (!opt.disabled) onPick(opt.value);
    },
    onMouseEnter: function () {
      setHov(true);
    },
    onMouseLeave: function () {
      setHov(false);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      padding: '9px 10px',
      borderRadius: '8px',
      fontFamily: "'Mukta', sans-serif",
      fontSize: '15px',
      letterSpacing: '-0.01em',
      color: opt.disabled ? '#9b9088' : isSel ? '#221E1A' : '#3a342e',
      fontWeight: isSel ? 600 : 400,
      background: opt.disabled ? 'transparent' : hov ? 'rgba(34,30,26,.05)' : isSel ? 'rgba(34,30,26,.07)' : 'transparent',
      cursor: opt.disabled ? 'not-allowed' : 'pointer',
      opacity: opt.disabled ? 0.5 : 1,
      transition: 'background 110ms ease'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, opt.label), isSel && /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2.5 7.5L5.5 10.5L11.5 4",
    stroke: "#221E1A",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Select/Select.jsx", error: String((e && e.message) || e) }); }

// Stat/Stat.jsx
try { (() => {
function Stat(props) {
  var value = props.value;
  var label = props.label;
  var trend = props.trend;
  var trendDir = props.trendDir != null ? props.trendDir : 'neutral';
  var trendContext = props.trendContext;
  var prefix = props.prefix;
  var icon = props.icon;
  var dark = props.dark != null ? props.dark : false;
  var bg = dark ? '#2B2825' : '#FFFFFF';
  var border = dark ? 'rgba(255,255,255,.08)' : '#EAE3D9';
  var ink = dark ? '#F3EEE6' : '#221E1A';
  var sub = dark ? 'rgba(243,238,230,.55)' : '#6F665C';
  var trendColor = trendDir === 'up' ? '#1F6B3A' : trendDir === 'down' ? '#9C3026' : '#64594E';
  function TrendArrow() {
    if (trendDir === 'up') return /*#__PURE__*/React.createElement("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 12 12",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M2 9L5 5.5L8 8L10.5 4.5",
      stroke: trendColor,
      strokeWidth: "2.0",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }));
    if (trendDir === 'down') return /*#__PURE__*/React.createElement("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 12 12",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M2 4.5L5 7L8 5L10.5 8.5",
      stroke: trendColor,
      strokeWidth: "2.0",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 12 12",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M2 6H10",
      stroke: trendColor,
      strokeWidth: "2.0",
      strokeLinecap: "round"
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      border: '1px solid ' + border,
      borderRadius: '12px',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      fontFamily: "'Mukta', sans-serif",
      WebkitFontSmoothing: 'antialiased',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '10px',
      letterSpacing: '.10em',
      textTransform: 'uppercase',
      color: sub
    }
  }, label), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sub,
      display: 'flex',
      alignItems: 'center'
    }
  }, icon)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '28px',
      fontWeight: 500,
      color: ink,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-0.02em',
      lineHeight: 1,
      display: 'flex',
      alignItems: 'baseline'
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.68em',
      fontWeight: 600,
      marginRight: '3px',
      letterSpacing: '0',
      opacity: 1
    }
  }, prefix), /*#__PURE__*/React.createElement("span", null, value)), trend && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    }
  }, /*#__PURE__*/React.createElement(TrendArrow, null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'Mukta', sans-serif",
      fontSize: '12px',
      fontWeight: 600,
      color: trendColor
    }
  }, trend), trendContext && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: sub
    }
  }, trendContext)));
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Stat/Stat.jsx", error: String((e && e.message) || e) }); }

// StatusChip/StatusChip.jsx
try { (() => {
// StatusChip — order lifecycle + catalog statuses.
// Every status = colour + shape glyph + label. Never colour alone.

var STATUS_MAP = {
  draft: {
    label: 'Draft',
    color: '#64594E',
    bg: 'rgba(100,89,78,.08)',
    border: 'rgba(100,89,78,.18)',
    glyph: 'dashed'
  },
  published: {
    label: 'Published',
    color: '#1A1714',
    bg: 'rgba(34,30,26,.10)',
    border: 'rgba(34,30,26,.20)',
    glyph: 'dot'
  },
  archived: {
    label: 'Archived',
    color: '#64594E',
    bg: 'rgba(100,89,78,.06)',
    border: 'rgba(100,89,78,.14)',
    glyph: 'square'
  },
  received: {
    label: 'Received',
    color: '#2A5F8A',
    bg: 'rgba(42,95,138,.10)',
    border: 'rgba(42,95,138,.20)',
    glyph: 'ring'
  },
  confirmed: {
    label: 'Confirmed',
    color: '#1E4D72',
    bg: 'rgba(42,95,138,.10)',
    border: 'rgba(42,95,138,.20)',
    glyph: 'check'
  },
  dispatched: {
    label: 'Dispatched',
    color: '#2A5F8A',
    bg: 'rgba(42,95,138,.12)',
    border: 'rgba(42,95,138,.22)',
    glyph: 'arrow'
  },
  delivered: {
    label: 'Delivered',
    color: '#1F6B3A',
    bg: 'rgba(31,107,58,.12)',
    border: 'rgba(31,107,58,.22)',
    glyph: 'check'
  },
  cancelled: {
    label: 'Cancelled',
    color: '#9C3026',
    bg: 'rgba(156,48,38,.10)',
    border: 'rgba(156,48,38,.20)',
    glyph: 'cross'
  },
  active: {
    label: 'Active',
    color: '#1F6B3A',
    bg: 'rgba(31,107,58,.12)',
    border: 'rgba(31,107,58,.22)',
    glyph: 'dot'
  },
  inactive: {
    label: 'Inactive',
    color: '#64594E',
    bg: 'rgba(100,89,78,.08)',
    border: 'rgba(100,89,78,.18)',
    glyph: 'dashed'
  },
  pending: {
    label: 'Pending',
    color: '#8A5700',
    bg: 'rgba(138,87,0,.10)',
    border: 'rgba(138,87,0,.20)',
    glyph: 'ring'
  }
};
function StatusGlyph(props) {
  var type = props.type;
  var color = props.color;
  var s = {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0
  };
  if (type === 'dot') return /*#__PURE__*/React.createElement("span", {
    style: s
  }, /*#__PURE__*/React.createElement("svg", {
    width: "7",
    height: "7",
    viewBox: "0 0 7 7"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3.5",
    cy: "3.5",
    r: "3.5",
    fill: color
  })));
  if (type === 'dashed') return /*#__PURE__*/React.createElement("span", {
    style: s
  }, /*#__PURE__*/React.createElement("svg", {
    width: "7",
    height: "7",
    viewBox: "0 0 7 7"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3.5",
    cy: "3.5",
    r: "3",
    stroke: color,
    strokeWidth: "1.2",
    strokeDasharray: "2 1.4",
    fill: "none"
  })));
  if (type === 'ring') return /*#__PURE__*/React.createElement("span", {
    style: s
  }, /*#__PURE__*/React.createElement("svg", {
    width: "7",
    height: "7",
    viewBox: "0 0 7 7"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3.5",
    cy: "3.5",
    r: "3",
    stroke: color,
    strokeWidth: "1.3",
    fill: "none"
  })));
  if (type === 'square') return /*#__PURE__*/React.createElement("span", {
    style: s
  }, /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "8",
    viewBox: "0 0 8 8"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "1",
    y: "1",
    width: "6",
    height: "6",
    rx: "1.5",
    stroke: color,
    strokeWidth: "1.2",
    fill: "none"
  })));
  if (type === 'check') return /*#__PURE__*/React.createElement("span", {
    style: s
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 9 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1.5 4.5L3.5 6.5L7.5 2.5",
    stroke: color,
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
  if (type === 'cross') return /*#__PURE__*/React.createElement("span", {
    style: s
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 9 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "2",
    y1: "2",
    x2: "7",
    y2: "7",
    stroke: color,
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "7",
    y1: "2",
    x2: "2",
    y2: "7",
    stroke: color,
    strokeWidth: "1.5",
    strokeLinecap: "round"
  })));
  if (type === 'arrow') return /*#__PURE__*/React.createElement("span", {
    style: s
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 9 9",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1.5 4.5H7.5M5 2L7.5 4.5L5 7",
    stroke: color,
    strokeWidth: "1.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
  return null;
}
function StatusChip(props) {
  var status = props.status || 'draft';
  var cfg = STATUS_MAP[status] || STATUS_MAP.draft;
  var text = props.label || cfg.label;
  var style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '12.5px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    padding: '4px 10px',
    borderRadius: '8px',
    border: '1px solid ' + cfg.border,
    color: cfg.color,
    background: cfg.bg,
    whiteSpace: 'nowrap',
    userSelect: 'none'
  };
  return /*#__PURE__*/React.createElement("span", {
    style: style
  }, /*#__PURE__*/React.createElement(StatusGlyph, {
    type: cfg.glyph,
    color: cfg.color
  }), text);
}
Object.assign(__ds_scope, { StatusChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "StatusChip/StatusChip.jsx", error: String((e && e.message) || e) }); }

// Tabs/Tabs.jsx
try { (() => {
function Tabs(props) {
  var items = props.items || [];
  var activeId = props.activeId;
  var onChange = props.onChange;
  var size = props.size != null ? props.size : 'md';
  var fontSize = size === 'sm' ? '13px' : '13.5px';
  var padding = size === 'sm' ? '8px 12px' : '10px 16px';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      borderBottom: '1px solid #EAE3D9',
      fontFamily: "'Mukta', sans-serif",
      WebkitFontSmoothing: 'antialiased'
    }
  }, items.map(function (item) {
    return /*#__PURE__*/React.createElement(TabBtn, {
      key: item.id,
      item: item,
      isActive: item.id === activeId,
      fontSize: fontSize,
      padding: padding,
      onChange: onChange
    });
  }));
}
function TabBtn(props) {
  var item = props.item,
    isActive = props.isActive;
  var fontSize = props.fontSize,
    padding = props.padding,
    onChange = props.onChange;
  var isDisabled = !!item.disabled;
  var hState = React.useState(false);
  var hovered = hState[0],
    setHovered = hState[1];
  var pState = React.useState(false);
  var pressed = pState[0],
    setPressed = pState[1];

  /* Active = ink text + copper underline (accent line only, not text colour).
     Hover  = warm-tint background + slightly darkened text.            */
  var textColor = isActive ? '#221E1A' : isDisabled ? '#C4B9AD' : hovered ? '#3D3128' : '#6F665C';
  var bg = !isActive && !isDisabled && hovered ? 'rgba(34,30,26,.05)' : 'transparent';
  return /*#__PURE__*/React.createElement("button", {
    disabled: isDisabled,
    onClick: function () {
      if (!isDisabled && onChange) onChange(item.id);
    },
    onMouseEnter: function () {
      if (!isDisabled) setHovered(true);
    },
    onMouseLeave: function () {
      setHovered(false);
      setPressed(false);
    },
    onMouseDown: function () {
      if (!isDisabled) setPressed(true);
    },
    onMouseUp: function () {
      setPressed(false);
    },
    style: {
      padding: padding,
      fontSize: fontSize,
      fontWeight: isActive ? 700 : 500,
      color: textColor,
      border: 'none',
      background: bg,
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      borderBottom: '2px solid ' + (isActive ? '#B5642F' : 'transparent'),
      marginBottom: '-1px',
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      borderRadius: '6px 6px 0 0',
      transform: pressed ? 'scale(0.98)' : 'scale(1)',
      transition: 'color 120ms ease, background 120ms ease, transform 80ms ease',
      whiteSpace: 'nowrap',
      fontFamily: "'Mukta', sans-serif",
      outline: 'none',
      userSelect: 'none'
    }
  }, item.label, item.count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '10px',
      fontWeight: 500,
      background: isActive ? 'rgba(34,30,26,.11)' : hovered ? 'rgba(34,30,26,.08)' : '#EAE3D9',
      color: isActive ? '#221E1A' : '#64594E',
      padding: '2px 6px',
      borderRadius: '99px',
      letterSpacing: '.02em',
      transition: 'background 120ms ease, color 120ms ease'
    }
  }, item.count));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Tabs/Tabs.jsx", error: String((e && e.message) || e) }); }

// Toggle/Toggle.jsx
try { (() => {
function Toggle(props) {
  var checked = props.checked != null ? props.checked : false;
  var disabled = props.disabled != null ? props.disabled : false;
  var label = props.label;
  var hint = props.hint;
  var size = props.size != null ? props.size : 'md';
  var onChange = props.onChange;
  var tHov = React.useState(false);
  var trackHovered = tHov[0],
    setTrackHovered = tHov[1];
  var sizes = {
    sm: {
      w: 32,
      h: 18,
      knob: 12,
      off: 3
    },
    md: {
      w: 40,
      h: 22,
      knob: 16,
      off: 3
    }
  };
  var sz = sizes[size] || sizes.md;
  var knobLeft = checked ? sz.w - sz.knob - sz.off : sz.off;
  function handleClick() {
    if (!disabled && onChange) onChange(!checked);
  }
  var track = /*#__PURE__*/React.createElement("div", {
    onClick: handleClick,
    role: "switch",
    "aria-checked": checked,
    tabIndex: disabled ? -1 : 0,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      width: sz.w,
      height: sz.h,
      borderRadius: '9999px',
      background: checked ? trackHovered && !disabled ? '#A1572A' : '#B5642F' : trackHovered && !disabled ? '#DBD4CB' : '#EAE3D9',
      border: '1px solid ' + (checked ? trackHovered && !disabled ? 'rgba(181,100,47,.65)' : 'rgba(181,100,47,.5)' : trackHovered && !disabled ? 'rgba(100,89,78,.35)' : 'rgba(100,89,78,.2)'),
      boxShadow: trackHovered && !disabled && !checked ? '0 0 0 3px rgba(34,30,26,.06)' : 'none',
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
      flexShrink: 0
    },
    onMouseEnter: function () {
      if (!disabled) setTrackHovered(true);
    },
    onMouseLeave: function () {
      setTrackHovered(false);
    },
    onKeyDown: function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleClick();
      }
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: knobLeft,
      width: sz.knob,
      height: sz.knob,
      borderRadius: '50%',
      background: checked ? '#F8F6F2' : '#FFFFFF',
      boxShadow: '0 1px 3px rgba(34,30,26,.2)',
      transition: 'left 150ms cubic-bezier(0.22,1,.36,1)'
    }
  }));
  if (!label) return track;
  return /*#__PURE__*/React.createElement("div", {
    onClick: handleClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: "'Mukta', sans-serif",
      WebkitFontSmoothing: 'antialiased'
    }
  }, track, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      fontWeight: 500,
      color: '#221E1A',
      lineHeight: 1.3,
      letterSpacing: '-0.01em'
    }
  }, label), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#64594E',
      lineHeight: 1.4
    }
  }, hint)));
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "Toggle/Toggle.jsx", error: String((e && e.message) || e) }); }

// YuktiMark/YuktiMark.jsx
try { (() => {
// Yukti — Voussoir keystone mark
// Frozen geometry from R10. Single-colour copper is the default.
// Two-tone (copper key + ink haunches) is expressive/hero only.

var VKEY = "M13 7.4L19 7.4L21.2 16.6L10.8 16.6Z"; /* keystone — projects above haunches */
var VHL = "M4.2 15.9L10.6 17.0L12.5 25.1L6.4 25.1Z"; /* left haunch  */
var VHR = "M27.8 15.9L21.4 17.0L19.5 25.1L25.6 25.1Z"; /* right haunch */

var YUKTIMARK_PALETTE = {
  copper: {
    key: '#B5642F',
    haunch: '#B5642F'
  },
  copperLt: {
    key: '#D9894C',
    haunch: '#D9894C'
  },
  ink: {
    key: '#221E1A',
    haunch: '#221E1A'
  },
  white: {
    key: '#F3EEE6',
    haunch: '#F3EEE6'
  },
  twoTone: {
    key: '#B5642F',
    haunch: '#221E1A'
  }
};
function YuktiMark(props) {
  var size = props.size != null ? props.size : 32;
  var variant = props.variant != null ? props.variant : 'copper';
  var ariaLabel = props.ariaLabel != null ? props.ariaLabel : 'Yukti';
  var c = YUKTIMARK_PALETTE[variant] || YUKTIMARK_PALETTE.copper;
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    role: "img",
    "aria-label": ariaLabel
  }, /*#__PURE__*/React.createElement("path", {
    fill: c.haunch,
    d: VHL
  }), /*#__PURE__*/React.createElement("path", {
    fill: c.haunch,
    d: VHR
  }), /*#__PURE__*/React.createElement("path", {
    fill: c.key,
    d: VKEY
  }));
}
Object.assign(__ds_scope, { YuktiMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "YuktiMark/YuktiMark.jsx", error: String((e && e.message) || e) }); }

// explorations/design-canvas.jsx
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
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/design-canvas.jsx", error: String((e && e.message) || e) }); }

// explorations/pushback.jsx
try { (() => {
// §15.5 — Where the brief fights good design (push-back, with resolutions)
const PB = {
  ink: '#1c1b18',
  sub: '#66645e',
  line: '#e6e3db',
  accent: '#8a5300'
};
function Flag({
  n,
  title,
  fight,
  fix
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid ' + PB.line,
      borderRadius: 6,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 11,
      color: '#b0a995'
    }
  }, String(n).padStart(2, '0')), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      color: PB.ink
    }
  }, title)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      lineHeight: 1.5,
      color: PB.sub
    }
  }, fight), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      lineHeight: 1.5,
      color: PB.ink
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: PB.accent
    }
  }, "Resolution \u2192 "), fix));
}
function PushbackBoard() {
  return /*#__PURE__*/React.createElement(BoardPad, null, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "\xA715.5 \xB7 Push-back",
    title: "Where the brief fights good design",
    note: "Per your instruction: a starting point, not a cage. Six tensions, each with the resolution already applied in these boards."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Flag, {
    n: 1,
    title: "\u201CEnergy through color\u201D vs. WCAG AA",
    fight: "Almost every hue saturated enough to read as momentum fails 4.5:1 as text. A single hero color cannot be both the energy and the ink.",
    fix: "Every territory ships the hero as a pair \u2014 a graphic tone (large marks, fills, the lit channel) and a text-safe tone. The badges on each color board are computed live, not claimed."
  }), /*#__PURE__*/React.createElement(Flag, {
    n: 2,
    title: "Growth-green vs. the status system",
    fight: "Green is the most natural growth color (Territory A) \u2014 but green is also the universal \u201Con track / done\u201D semantic. If the brand is green, status risks dissolving into brand.",
    fix: "Status hues are reserved and never decorative; states always carry shape + label. If Territory A is chosen, its hero green and the semantic greens are deliberately distant in lightness \u2014 or pick B/C, which dodge the collision entirely."
  }), /*#__PURE__*/React.createElement(Flag, {
    n: 3,
    title: "\u201CSymbolize momentum\u201D + the banned-clich\xE9 list",
    fight: "Arrows, swooshes, rising charts and connected dots are both the banned list and the entire visual vocabulary of momentum. Asked literally, the brief forbids its own subject.",
    fix: "Momentum is encoded structurally, not pictorially: a junction resolved (A), a baseline stepped up (B), a path cut through mass (C). No arrowheads anywhere."
  }), /*#__PURE__*/React.createElement(Flag, {
    n: 4,
    title: "Multi-script day one vs. display typography",
    fight: "Almost no characterful display face has Devanagari and Arabic siblings of equal quality. Demanding one font with personality across three scripts guarantees a compromise somewhere.",
    fix: "Superfamily strategy: Plex (A), Anek + Cairo (B), Archivo + Noto trio (C). Latin-only display flex is permitted in marketing, never in product \u2014 the UI is script-equal everywhere."
  }), /*#__PURE__*/React.createElement(Flag, {
    n: 5,
    title: "\u201CLike Ramp/Monzo, unlike any fintech\u201D",
    fight: "Ramp and Monzo define the current fintech look \u2014 citing them as the energy anchor while banning anything fintech-shaped is self-contradictory if taken visually.",
    fix: "Borrow their discipline, not their dress: one hero color, type-led layout, a single loud element per view. None of the three palettes or marks resembles either brand."
  }), /*#__PURE__*/React.createElement(Flag, {
    n: 6,
    title: "Devanagari as \u201Cconfident nod, never decoration\u201D",
    fight: "Taste is not a guardrail. Without a rule, \u092F\u0941\u0915\u094D\u0924\u093F will drift into pattern fills and festival posts \u2014 exactly the ethnic-decoration failure the brief fears.",
    fix: "A hard rule: Devanagari appears only as the complete secondary lockup, or as live copy in Hindi-language contexts. Never cropped, tilted, or used as texture."
  })));
}

// ── Intro board: the thesis, distilled to what the identity must do ──────
function IntroBoard() {
  const item = (k, v) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '110px 1fr',
      gap: 12,
      fontSize: 12.5,
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10.5,
      color: '#a09a8e',
      textTransform: 'uppercase',
      letterSpacing: '.08em',
      paddingTop: 2
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#44423d'
    }
  }, v));
  return /*#__PURE__*/React.createElement(BoardPad, null, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "Yukti \xB7 identity territories v1",
    title: "The brief, held to"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 16,
      lineHeight: 1.55,
      color: '#1c1b18',
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement("em", null, "\u201CYour unfair advantage to grow and win.\u201D"), " Each territory must look like ", /*#__PURE__*/React.createElement("strong", null, "the winning move \u2014 judgment in motion"), " \u2014 and unlike every other B2B mark. Bold about the owner's growth; exact about money."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
      borderTop: '1px solid #e6e3db',
      paddingTop: 14
    }
  }, item('A · Fork', 'Many paths resolve into one decisive line — the Y itself is the move. Hottest tie to the name.'), item('B · Step', 'Growth as a level gained and held — the warmest, most operator-rooted of the three.'), item('C · Path', 'The operational weight with a way cut through — the most abstract, most global-tech.'), item('Fixed core', 'The clarity-of-status grammar (§11) is identical across all three; only the chrome and the single next-action take the hero color.')), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#1c1b18',
      color: '#f5f4ef',
      borderRadius: 6,
      padding: '13px 16px',
      fontSize: 12.5,
      lineHeight: 1.5
    }
  }, "The decision test, applied to identity: ", /*#__PURE__*/React.createElement("strong", null, "does it make the owner look powerful \u2014 with them in control?"), " Every board below was checked against it."));
}
Object.assign(window, {
  PushbackBoard,
  IntroBoard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/pushback.jsx", error: String((e && e.message) || e) }); }

// explorations/shared.jsx
try { (() => {
// Shared helpers for the Yukti identity territory boards.

// ---- WCAG contrast math --------------------------------------------------
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
}
function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const l1 = lum(a),
    l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Small badge showing a computed contrast ratio + AA verdict
function AABadge({
  fg,
  bg,
  label
}) {
  const r = contrastRatio(fg, bg);
  const pass = r >= 4.5;
  const passLg = r >= 3;
  const verdict = pass ? 'AA' : passLg ? 'AA-large' : 'graphic only';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10.5,
      color: '#555',
      background: '#fff',
      border: '1px solid #e2e0da',
      borderRadius: 3,
      padding: '2px 7px',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 2,
      background: bg,
      border: '1px solid rgba(0,0,0,.12)',
      display: 'inline-block',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 2,
      background: fg,
      borderRadius: 1
    }
  })), label ? label + ' · ' : '', r.toFixed(1), ":1 ", verdict);
}

// Swatch row
function Sw({
  c,
  name,
  role,
  dark
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 64,
      borderRadius: 4,
      background: c,
      border: '1px solid rgba(0,0,0,.08)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: '#1c1b18'
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10.5,
      color: '#888'
    }
  }, c), role ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: '#777',
      lineHeight: 1.35
    }
  }, role) : null));
}

// Multi-script specimen line
function ScriptLine({
  tag,
  font,
  size = 26,
  weight = 600,
  dir,
  text,
  color = '#1c1b18',
  lh = 1.35,
  ls
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '120px 1fr',
      gap: 14,
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10,
      color: '#999',
      textTransform: 'uppercase',
      letterSpacing: '.06em'
    }
  }, tag), /*#__PURE__*/React.createElement("span", {
    dir: dir || 'ltr',
    style: {
      fontFamily: font,
      fontSize: size,
      fontWeight: weight,
      color,
      lineHeight: lh,
      letterSpacing: ls || 'normal',
      textAlign: dir === 'rtl' ? 'right' : 'left',
      display: 'block'
    }
  }, text));
}

// Board scaffolding -------------------------------------------------------
function BoardPad({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 28,
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      fontFamily: 'IBM Plex Sans, sans-serif',
      ...style
    }
  }, children);
}
function BoardHead({
  kicker,
  title,
  note
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: '#a09a8e'
    }
  }, kicker), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      fontWeight: 600,
      color: '#1c1b18'
    }
  }, title), note ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#777',
      lineHeight: 1.45,
      maxWidth: 640
    }
  }, note) : null);
}
function CellLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: '#999'
    }
  }, children);
}
// A framed lockup cell
function LockupCell({
  label,
  bg,
  children,
  grow
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      flex: grow ? 1.4 : 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg || '#fff',
      border: '1px solid #e7e4dd',
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 104,
      overflow: 'hidden'
    }
  }, children), /*#__PURE__*/React.createElement(CellLabel, null, label));
}
Object.assign(window, {
  contrastRatio,
  AABadge,
  Sw,
  ScriptLine,
  BoardPad,
  BoardHead,
  CellLabel,
  LockupCell
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/shared.jsx", error: String((e && e.message) || e) }); }

// explorations/status.jsx
try { (() => {
// §11 — The clarity-of-status grammar, shown in real product context.
// Core-neutral skin: the grammar is FIXED brand core; the territory hero color
// skins chrome and the single next-action, never the statuses themselves.
const ST = {
  ink: '#1A1B18',
  paper: '#F7F6F2',
  sub: '#6B6A64',
  line: '#E5E3DC',
  card: '#FFFFFF',
  attn: '#8A5300',
  attnBg: '#FAEFD7',
  attnIcon: '#C27A00',
  track: '#1E6E47',
  trackBg: '#EAF3EC',
  done: '#14532D',
  doneBg: '#E2EEE4',
  font: '"IBM Plex Sans", sans-serif'
};

// One shape per state — status is never color alone.
function StIcon({
  kind,
  size = 14
}) {
  if (kind === 'attn') return (
    /*#__PURE__*/
    // filled diamond — interrupts the eye
    React.createElement("svg", {
      width: size,
      height: size,
      viewBox: "0 0 16 16"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z",
      fill: ST.attnIcon
    }))
  );
  if (kind === 'track') return (
    /*#__PURE__*/
    // open ring — in motion, nothing owed
    React.createElement("svg", {
      width: size,
      height: size,
      viewBox: "0 0 16 16"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "8",
      cy: "8",
      r: "5.4",
      fill: "none",
      stroke: ST.track,
      strokeWidth: "2.4"
    }))
  );
  return (
    /*#__PURE__*/
    // filled circle + check — settled
    React.createElement("svg", {
      width: size,
      height: size,
      viewBox: "0 0 16 16"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "8",
      cy: "8",
      r: "6.6",
      fill: ST.done
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 8.2 L7.2 10.4 L11.2 6",
      stroke: "#fff",
      strokeWidth: "1.8",
      fill: "none"
    }))
  );
}
function StChip({
  kind,
  children
}) {
  const m = {
    attn: [ST.attn, ST.attnBg],
    track: [ST.track, ST.trackBg],
    done: [ST.done, ST.doneBg]
  }[kind];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: m[1],
      color: m[0],
      borderRadius: 4,
      padding: '4px 9px',
      fontSize: 12,
      fontWeight: 600,
      fontFamily: ST.font,
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement(StIcon, {
    kind: kind,
    size: 12
  }), children);
}
function NextAction({
  children,
  wide,
  hero
}) {
  return /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      border: 'none',
      cursor: 'pointer',
      background: hero || ST.ink,
      color: '#fff',
      fontFamily: ST.font,
      fontWeight: 600,
      fontSize: 14,
      borderRadius: 6,
      padding: '0 18px',
      height: 46,
      width: wide ? '100%' : 'auto',
      whiteSpace: 'nowrap'
    }
  }, children, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2192"));
}

// ── Board 1: the grammar itself ─────────────────────────────────────────
function GrammarRow({
  kind,
  name,
  when,
  pair
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '30px 150px 1fr 180px',
      gap: 12,
      alignItems: 'center',
      padding: '11px 0',
      borderBottom: '1px solid ' + ST.line
    }
  }, /*#__PURE__*/React.createElement(StIcon, {
    kind: kind,
    size: 18
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      color: ST.ink
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 10,
      color: '#999'
    }
  }, pair)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: ST.sub,
      lineHeight: 1.45
    }
  }, when), /*#__PURE__*/React.createElement(StChip, {
    kind: kind
  }, kind === 'attn' ? '3 prices need review' : kind === 'track' ? 'On the way' : 'Delivered'));
}
function StBoardGrammar() {
  const rules = [['Never color alone', 'Every state carries a shape and a label. A color-blind operator reads the diamond/ring/check before any hue.'], ['One loud element per view', 'Exactly one "do this next" affordance — it alone takes the territory hero color. Statuses never do.'], ['Attention sorts up, done settles down', 'Needs-attention always rises to the top of any list or tile; done collapses to a count.'], ['Reserved hues', 'Amber and the two greens are semantic-only — never decoration, never brand. The hero is never a status.'], ['RTL-ready', 'The next-action arrow and any directional icon mirror in Arabic layouts; shapes are symmetric by design.']];
  return /*#__PURE__*/React.createElement(BoardPad, null, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "\xA711 \xB7 Clarity of status \u2014 fixed brand core",
    title: "Diamond asks. Ring moves. Check settles.",
    note: "The promise is \"always know what matters and what to do next\" \u2014 so status gets one grammar, as protected as the logo. Three states, three shapes, one next-action."
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(GrammarRow, {
    kind: "attn",
    name: "Needs attention",
    pair: "#8A5300 on #FAEFD7",
    when: "Something is owed a decision. The only state allowed to interrupt; capped per view so it stays meaningful."
  }), /*#__PURE__*/React.createElement(GrammarRow, {
    kind: "track",
    name: "On track",
    pair: "#1E6E47 on #EAF3EC",
    when: "Moving as expected \u2014 visible, quiet, never animated. Nothing is owed."
  }), /*#__PURE__*/React.createElement(GrammarRow, {
    kind: "done",
    name: "Done",
    pair: "#14532D on #E2EEE4",
    when: "Settled and verifiable. Done is exact \u2014 it appears only when the books agree."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '4px 0 2px'
    }
  }, /*#__PURE__*/React.createElement(NextAction, null, "Review 3 prices"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: ST.sub,
      lineHeight: 1.45,
      maxWidth: 380
    }
  }, "The single ", /*#__PURE__*/React.createElement("strong", null, "do-this-next"), " affordance \u2014 Yukti recommends, the owner decides. It proposes; it never auto-applies.")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid ' + ST.line,
      paddingTop: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 7
    }
  }, rules.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: '190px 1fr',
      gap: 12,
      fontSize: 12,
      lineHeight: 1.45
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: ST.ink
    }
  }, r[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      color: ST.sub
    }
  }, r[1])))));
}

// ── Board 2: distributor dashboard tile ─────────────────────────────────
function StBoardTile() {
  const row = (kind, label, val) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '11px 0',
      borderBottom: '1px solid ' + ST.line
    }
  }, /*#__PURE__*/React.createElement(StIcon, {
    kind: kind,
    size: 15
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      color: ST.ink,
      flex: 1
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 12.5,
      color: ST.sub,
      whiteSpace: 'nowrap'
    }
  }, val));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: ST.paper,
      height: '100%',
      boxSizing: 'border-box',
      padding: 24,
      fontFamily: ST.font,
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: ST.sub
    }
  }, "Tuesday 10 June \xB7 Lakshmi Agencies, Hyderabad"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      color: ST.ink
    }
  }, "Here's what needs your attention today.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: ST.card,
      border: '1px solid ' + ST.line,
      borderRadius: 8,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: ST.ink
    }
  }, "Pricing"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: ST.sub
    }
  }, "updated 6:02 pm")), row('attn', '3 prices below floor margin', '₹42,300 at stake'), row('track', '18 SKUs repricing on schedule', 'next run 7 pm'), row('done', '42 prices updated and posted', 'books agree'), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement(NextAction, null, "Review 3 prices"))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: ST.sub,
      lineHeight: 1.5
    }
  }, "One tile, one ask. Money is exact to the rupee; the bold register is reserved for the action, not the numbers."));
}

// ── Board 3: buyer PWA — orders ──────────────────────────────────────────
function StBoardPwa() {
  const order = (kind, chip, name, meta) => /*#__PURE__*/React.createElement("div", {
    style: {
      background: ST.card,
      border: '1px solid ' + ST.line,
      borderRadius: 8,
      padding: '13px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minHeight: 44,
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: ST.ink
    }
  }, name), /*#__PURE__*/React.createElement(StChip, {
    kind: kind
  }, chip)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: ST.sub
    }
  }, meta));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: ST.paper,
      height: '100%',
      boxSizing: 'border-box',
      fontFamily: ST.font,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 16px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: ST.sub
    }
  }, "Sharma Traders \xB7 buyer app"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20,
      fontWeight: 600,
      color: ST.ink
    }
  }, "Orders")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      flex: 1
    }
  }, order('attn', 'Confirm 2 substitutions', 'Order #4811 · 36 items', 'Two SKUs out of stock — swaps proposed at the same price.'), order('track', 'On the way', 'Order #4807 · 18 items', 'Out for delivery · arriving today by 5 pm'), order('track', 'Packing', 'Order #4804 · 52 items', 'Picked 40 of 52 · on schedule'), order('done', 'Delivered', 'Order #4799 · 24 items', 'Delivered Mon · invoice ₹18,640 · books updated')), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px 16px',
      borderTop: '1px solid ' + ST.line,
      background: ST.paper
    }
  }, /*#__PURE__*/React.createElement(NextAction, {
    wide: true
  }, "Confirm 2 substitutions"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      textAlign: 'center',
      fontSize: 10.5,
      color: ST.sub,
      paddingTop: 8
    }
  }, "52 px action bar \xB7 all touch targets \u2265 44 px")));
}
Object.assign(window, {
  StBoardGrammar,
  StBoardTile,
  StBoardPwa,
  StChip,
  StIcon,
  NextAction
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/status.jsx", error: String((e && e.message) || e) }); }

// explorations/territory-a.jsx
try { (() => {
// Territory A — "The Fork, Resolved" (rotated-Y junction)
const A = {
  ink: '#10231B',
  paper: '#F7F6F1',
  hero: '#1DB868',
  // graphic momentum green
  heroText: '#0A6B43',
  // text-safe won green
  slate: '#5A6660',
  line: '#E3E1D8',
  latin: '"IBM Plex Sans", sans-serif',
  deva: '"IBM Plex Sans Devanagari", sans-serif',
  arab: '"IBM Plex Sans Arabic", sans-serif'
};

// Two branches converge; one heavier line continues. The Y, rotated into motion.
function MarkA({
  size = 64,
  color = A.ink,
  fwd
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    "aria-label": "Yukti mark \u2014 territory A"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 6.5 L14.5 16 L4 25.5",
    stroke: color,
    strokeWidth: "4.6",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13 16 H29",
    stroke: fwd || color,
    strokeWidth: "6.4",
    fill: "none"
  }));
}
function WordA({
  size = 30,
  color = A.ink
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: A.latin,
      fontWeight: 600,
      fontSize: size,
      letterSpacing: '-0.015em',
      color,
      lineHeight: 1
    }
  }, "yukti");
}
function DevaA({
  size = 28,
  color = A.ink
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: A.deva,
      fontWeight: 600,
      fontSize: size,
      color,
      lineHeight: 1.2
    }
  }, "\u092F\u0941\u0915\u094D\u0924\u093F");
}
function ABoardMark() {
  return /*#__PURE__*/React.createElement(BoardPad, null, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "Territory A \xB7 The Fork, Resolved",
    title: "Two paths in. One line out.",
    note: "The mark is the Y of Yukti rotated into motion: alternatives converge at a junction and resolve into a single, heavier forward stroke \u2014 judgment becoming momentum. No swoosh, no arrowhead, no nodes."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: A.ink,
      borderRadius: 6,
      height: 168,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 26
    }
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 92,
    color: A.paper,
    fwd: A.hero
  }), /*#__PURE__*/React.createElement(WordA, {
    size: 58,
    color: A.paper
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(LockupCell, {
    label: "Horizontal",
    grow: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13
    }
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 40,
    fwd: A.heroText
  }), /*#__PURE__*/React.createElement(WordA, {
    size: 27
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Stacked"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 36,
    fwd: A.heroText
  }), /*#__PURE__*/React.createElement(WordA, {
    size: 19
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Symbol only"
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 48,
    fwd: A.heroText
  })), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Monochrome"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11
    }
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 36
  }), /*#__PURE__*/React.createElement(WordA, {
    size: 24
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(LockupCell, {
    label: "Devanagari secondary",
    grow: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13
    }
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 36,
    fwd: A.heroText
  }), /*#__PURE__*/React.createElement(DevaA, {
    size: 26
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "App icon (buyer PWA)",
    bg: "#efeee8"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 15,
      background: A.ink,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 42,
    color: A.paper,
    fwd: A.hero
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Favicon \xB7 16 px actual",
    bg: "#efeee8"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 16
  }), /*#__PURE__*/React.createElement(MarkA, {
    size: 16,
    color: A.heroText
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Reversed on hero",
    bg: A.hero
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11
    }
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 34,
    color: A.ink
  }), /*#__PURE__*/React.createElement(WordA, {
    size: 23,
    color: A.ink
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid ' + A.line,
      paddingTop: 12,
      fontSize: 12.5,
      color: '#555',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#1c1b18'
    }
  }, "Rationale:"), " the unfair advantage made literal \u2014 many options, one decisive move; the owner's letterform is the junction where deciding turns into winning."));
}
function ABoardColorType() {
  return /*#__PURE__*/React.createElement(BoardPad, null, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "Territory A \xB7 Color + Type",
    title: "Won Green on Ledger Ink",
    note: "Green claimed as growth, not finance: a single hero used for the forward stroke, the one next-action per view, and nothing else. Discipline comes from near-black green ink and warm paper."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Sw, {
    c: A.ink,
    name: "Ink",
    role: "Surfaces, text \u2014 a green-black, not corporate navy"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: A.paper,
    name: "Paper",
    role: "Warm ground; never pure white"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: A.hero,
    name: "Momentum Green",
    role: "Graphic + large text only"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: A.heroText,
    name: "Won Green",
    role: "Text-safe hero for links, CTAs on paper"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: A.slate,
    name: "Slate Moss",
    role: "Secondary text"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: A.line,
    name: "Hairline",
    role: "Dividers, card strokes"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(AABadge, {
    fg: A.ink,
    bg: A.paper,
    label: "Ink/Paper"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: A.heroText,
    bg: A.paper,
    label: "Won/Paper"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: A.hero,
    bg: A.ink,
    label: "Hero/Ink"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: A.paper,
    bg: A.heroText,
    label: "Paper/Won"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid ' + A.line,
      borderRadius: 6,
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 15
    }
  }, /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Latin \xB7 display",
    font: A.latin,
    size: 31,
    weight: 600,
    text: "Run the business. Win the market.",
    ls: "-0.015em"
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Devanagari",
    font: A.deva,
    size: 27,
    weight: 600,
    text: "\u0938\u0939\u0940 \u092B\u093C\u0948\u0938\u0932\u0947\u0964 \u0905\u0938\u0932\u0940 \u092C\u0922\u093C\u0924\u0964"
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Arabic \xB7 RTL",
    font: A.arab,
    size: 26,
    weight: 600,
    dir: "rtl",
    text: "\u0642\u0631\u0627\u0631\u0627\u062A \u0635\u062D\u064A\u062D\u0629. \u0646\u0645\u0648\u0651 \u062D\u0642\u064A\u0642\u064A."
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Product UI",
    font: A.latin,
    size: 15,
    weight: 500,
    color: A.slate,
    text: "3 prices need review \xB7 18 SKUs on track \xB7 Books updated themselves at 6:02 pm"
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Numerals",
    font: A.latin,
    size: 19,
    weight: 600,
    text: "\u20B91,24,50,000 (1.24 crore)  \xB7  AED 4,500,250  \xB7  \u20AC312,400"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid ' + A.line,
      paddingTop: 12,
      fontSize: 12.5,
      color: '#555',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#1c1b18'
    }
  }, "Type:"), " IBM Plex Sans superfamily \u2014 Latin, Devanagari and Arabic drawn as true siblings, so one voice ships in three scripts on day one. Operator-grade and exact; zero personality-quirk where money is shown."));
}
Object.assign(window, {
  ABoardMark,
  ABoardColorType,
  MarkA
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/territory-a.jsx", error: String((e && e.message) || e) }); }

// explorations/territory-b.jsx
try { (() => {
// Territory B — "The Step Up" (rising baseline, level gained and held)
const B = {
  ink: '#26180F',
  paper: '#FAF5EC',
  hero: '#E14E1B',
  // graphic vermilion
  heroText: '#A93C10',
  // text-safe vermilion
  warm: '#6E5F52',
  line: '#EADFD0',
  latin: '"Anek Latin", sans-serif',
  deva: '"Anek Devanagari", sans-serif',
  arab: '"Cairo", sans-serif'
};

// One step up, then forward. Drawn as a single heavy stroke — a level gained and held.
function MarkB({
  size = 64,
  color = B.ink
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    "aria-label": "Yukti mark \u2014 territory B"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 24.8 H14.6 V10 H29",
    stroke: color,
    strokeWidth: "6",
    fill: "none"
  }));
}
function WordB({
  size = 30,
  color = B.ink
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: B.latin,
      fontWeight: 700,
      fontSize: size,
      letterSpacing: '0.045em',
      color,
      lineHeight: 1
    }
  }, "YUKTI");
}
function DevaB({
  size = 28,
  color = B.ink
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: B.deva,
      fontWeight: 700,
      fontSize: size,
      color,
      lineHeight: 1.2
    }
  }, "\u092F\u0941\u0915\u094D\u0924\u093F");
}
function BBoardMark() {
  return /*#__PURE__*/React.createElement(BoardPad, {
    style: {
      background: B.paper
    }
  }, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "Territory B \xB7 The Step Up",
    title: "A level gained \u2014 and held.",
    note: "Growth drawn as a floor that rises: one step up, then a long forward line. Not a chart, not a swoosh \u2014 a structural promise that every good decision permanently raises where the business stands. Reads at 16 px as a bold glyph."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: B.ink,
      borderRadius: 6,
      height: 168,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28
    }
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 92,
    color: B.hero
  }), /*#__PURE__*/React.createElement(WordB, {
    size: 52,
    color: B.paper
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(LockupCell, {
    label: "Horizontal",
    grow: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 38,
    color: B.heroText
  }), /*#__PURE__*/React.createElement(WordB, {
    size: 25
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Stacked"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 34,
    color: B.heroText
  }), /*#__PURE__*/React.createElement(WordB, {
    size: 16
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Symbol only"
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 48,
    color: B.heroText
  })), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Monochrome"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 34
  }), /*#__PURE__*/React.createElement(WordB, {
    size: 21
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(LockupCell, {
    label: "Devanagari secondary",
    grow: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 34,
    color: B.heroText
  }), /*#__PURE__*/React.createElement(DevaB, {
    size: 25
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "App icon (buyer PWA)",
    bg: "#f1e9dc"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 15,
      background: B.hero,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 42,
    color: B.paper
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Favicon \xB7 16 px actual",
    bg: "#f1e9dc"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 16
  }), /*#__PURE__*/React.createElement(MarkB, {
    size: 16,
    color: B.heroText
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Reversed on hero",
    bg: B.hero
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(MarkB, {
    size: 32,
    color: B.paper
  }), /*#__PURE__*/React.createElement(WordB, {
    size: 20,
    color: B.paper
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid ' + B.line,
      paddingTop: 12,
      fontSize: 12.5,
      color: '#5d4f43',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: B.ink
    }
  }, "Rationale:"), " the unfair advantage as compounding \u2014 each winning move steps the baseline up and the business never gives the ground back."));
}
function BBoardColorType() {
  return /*#__PURE__*/React.createElement(BoardPad, {
    style: {
      background: B.paper
    }
  }, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "Territory B \xB7 Color + Type",
    title: "Vermilion heat on warm paper",
    note: "The hottest of the three: a vermilion that is India-credible without being decoration, and reads as pure momentum in Dubai or Berlin. Caps-led Anek gives the voice its decisiveness; warmth comes from paper, not clutter."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Sw, {
    c: B.ink,
    name: "Roast Ink",
    role: "Text, dark surfaces \u2014 warm black"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: B.paper,
    name: "Chalk",
    role: "Warm cream ground"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: B.hero,
    name: "Vermilion",
    role: "Graphic + large text only"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: B.heroText,
    name: "Deep Vermilion",
    role: "Text-safe hero on paper"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: B.warm,
    name: "Clay",
    role: "Secondary text"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: B.line,
    name: "Sand line",
    role: "Dividers, card strokes"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(AABadge, {
    fg: B.ink,
    bg: B.paper,
    label: "Ink/Chalk"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: B.heroText,
    bg: B.paper,
    label: "DeepVerm/Chalk"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: B.hero,
    bg: B.ink,
    label: "Verm/Ink"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: B.paper,
    bg: B.heroText,
    label: "Chalk/DeepVerm"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid ' + B.line,
      borderRadius: 6,
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 15
    }
  }, /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Latin \xB7 display",
    font: B.latin,
    size: 31,
    weight: 800,
    text: "MAKE EVERY MOVE COUNT.",
    ls: "0.02em",
    color: B.ink
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Devanagari",
    font: B.deva,
    size: 27,
    weight: 700,
    text: "\u0939\u0930 \u092B\u093C\u0948\u0938\u0932\u093E, \u090F\u0915 \u0915\u0926\u092E \u090A\u092A\u0930\u0964",
    color: B.ink
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Arabic \xB7 RTL",
    font: B.arab,
    size: 26,
    weight: 700,
    dir: "rtl",
    text: "\u0643\u0644 \u0642\u0631\u0627\u0631 \u062E\u0637\u0648\u0629 \u0625\u0644\u0649 \u0627\u0644\u0623\u0639\u0644\u0649.",
    color: B.ink
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Product UI",
    font: B.latin,
    size: 15,
    weight: 500,
    color: B.warm,
    text: "Here's what needs your attention today \u2014 3 prices, 1 stuck order."
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Numerals",
    font: B.latin,
    size: 19,
    weight: 600,
    color: B.ink,
    text: "\u20B91,24,50,000 (1.24 crore)  \xB7  AED 4,500,250  \xB7  \u20AC312,400"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid ' + B.line,
      paddingTop: 12,
      fontSize: 12.5,
      color: '#5d4f43',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: B.ink
    }
  }, "Type:"), " Anek Latin + Anek Devanagari (one Ek Type superfamily, Indian-script-first by design) paired with Cairo for Arabic \u2014 bold caps for the loud register, regular weights stay exact for money and data."));
}
Object.assign(window, {
  BBoardMark,
  BBoardColorType,
  MarkB
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/territory-b.jsx", error: String((e && e.message) || e) }); }

// explorations/territory-c.jsx
try { (() => {
// Territory C — "The Cleared Path" (the block of complexity, cut through)
const C = {
  ink: '#161A2B',
  paper: '#F4F4EF',
  hero: '#B7E018',
  // graphic signal lime
  heroText: '#49640A',
  // text-safe moss
  cool: '#5B5F6E',
  line: '#E2E1D9',
  latin: '"Archivo", sans-serif',
  deva: '"Noto Sans Devanagari", sans-serif',
  arab: '"Noto Sans Arabic", sans-serif',
  body: '"Noto Sans", sans-serif'
};

// A solid square — the operational weight — with one clean diagonal channel
// cut through it, ascending left-to-right. The path is the negative space.
function MarkC({
  size = 64,
  color = C.ink,
  channel
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    "aria-label": "Yukti mark \u2014 territory C"
  }, channel ? /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "26",
    height: "26",
    fill: channel
  }) : null, /*#__PURE__*/React.createElement("path", {
    d: "M3 3 H22.5 L3 22.5 Z",
    fill: color
  }), /*#__PURE__*/React.createElement("path", {
    d: "M29 29 H9.5 L29 9.5 Z",
    fill: color
  }));
}
function WordC({
  size = 30,
  color = C.ink
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: C.latin,
      fontWeight: 800,
      fontSize: size,
      letterSpacing: '-0.02em',
      color,
      lineHeight: 1
    }
  }, "Yukti");
}
function DevaC({
  size = 28,
  color = C.ink
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: C.deva,
      fontWeight: 700,
      fontSize: size,
      color,
      lineHeight: 1.2
    }
  }, "\u092F\u0941\u0915\u094D\u0924\u093F");
}
function CBoardMark() {
  return /*#__PURE__*/React.createElement(BoardPad, null, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "Territory C \xB7 The Cleared Path",
    title: "The weight, with a way through.",
    note: "A solid block \u2014 the operational weight Yukti carries \u2014 cut by one clean ascending channel. The advantage is the negative space: the path the owner moves through while the platform holds the rest. The most abstract and most ownable of the three."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: C.ink,
      borderRadius: 6,
      height: 168,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 26
    }
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 88,
    color: C.paper,
    channel: C.ink
  }), /*#__PURE__*/React.createElement(WordC, {
    size: 56,
    color: C.paper
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(LockupCell, {
    label: "Horizontal",
    grow: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13
    }
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 38
  }), /*#__PURE__*/React.createElement(WordC, {
    size: 26
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Stacked"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 34
  }), /*#__PURE__*/React.createElement(WordC, {
    size: 17
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Symbol only"
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 48
  })), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Channel in hero",
    bg: C.ink
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 44,
    color: C.paper,
    channel: C.hero
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(LockupCell, {
    label: "Devanagari secondary",
    grow: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13
    }
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 34
  }), /*#__PURE__*/React.createElement(DevaC, {
    size: 25
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "App icon (buyer PWA)",
    bg: "#eaeae3"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 15,
      background: C.hero,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 44,
    color: C.ink,
    channel: C.hero
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Favicon \xB7 16 px actual",
    bg: "#eaeae3"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 16
  }), /*#__PURE__*/React.createElement(MarkC, {
    size: 16,
    color: C.heroText
  }))), /*#__PURE__*/React.createElement(LockupCell, {
    label: "Monochrome reversed",
    bg: C.ink
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11
    }
  }, /*#__PURE__*/React.createElement(MarkC, {
    size: 32,
    color: C.paper
  }), /*#__PURE__*/React.createElement(WordC, {
    size: 22,
    color: C.paper
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid ' + C.line,
      paddingTop: 12,
      fontSize: 12.5,
      color: '#555',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#1c1b18'
    }
  }, "Rationale:"), " the unfair advantage as a cleared road \u2014 competitors push through the block; the Yukti owner moves through the cut."));
}
function CBoardColorType() {
  return /*#__PURE__*/React.createElement(BoardPad, null, /*#__PURE__*/React.createElement(BoardHead, {
    kicker: "Territory C \xB7 Color + Type",
    title: "Signal Lime on Night Indigo",
    note: "The most product-led palette: near-black indigo surfaces with one live lime signal \u2014 the cleared path, lit. Lime is strictly graphic; text always uses moss or paper. The coolest and most global-tech of the three directions."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Sw, {
    c: C.ink,
    name: "Night Indigo",
    role: "Surfaces, text \u2014 deep but not navy-corporate"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: C.paper,
    name: "Bone",
    role: "Light ground"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: C.hero,
    name: "Signal Lime",
    role: "Graphic + the lit channel only"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: C.heroText,
    name: "Moss",
    role: "Text-safe hero on light ground"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: C.cool,
    name: "Graphite",
    role: "Secondary text"
  }), /*#__PURE__*/React.createElement(Sw, {
    c: C.line,
    name: "Hairline",
    role: "Dividers, card strokes"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(AABadge, {
    fg: C.ink,
    bg: C.paper,
    label: "Indigo/Bone"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: C.heroText,
    bg: C.paper,
    label: "Moss/Bone"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: C.hero,
    bg: C.ink,
    label: "Lime/Indigo"
  }), /*#__PURE__*/React.createElement(AABadge, {
    fg: C.ink,
    bg: C.hero,
    label: "Indigo/Lime"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid ' + C.line,
      borderRadius: 6,
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 15
    }
  }, /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Latin \xB7 display",
    font: C.latin,
    size: 31,
    weight: 800,
    text: "You decide. Yukti makes it pay off.",
    ls: "-0.02em",
    color: C.ink
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Devanagari",
    font: C.deva,
    size: 26,
    weight: 700,
    text: "\u092B\u093C\u0948\u0938\u0932\u093E \u0906\u092A\u0915\u093E\u0964 \u0930\u092B\u093C\u094D\u0924\u093E\u0930 \u092F\u0941\u0915\u094D\u0924\u093F \u0915\u0940\u0964",
    color: C.ink
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Arabic \xB7 RTL",
    font: C.arab,
    size: 25,
    weight: 700,
    dir: "rtl",
    text: "\u0627\u0644\u0642\u0631\u0627\u0631 \u0642\u0631\u0627\u0631\u0643\u060C \u0648\u0627\u0644\u0633\u0631\u0639\u0629 \u0645\u0646 \u064A\u0648\u0643\u062A\u064A.",
    color: C.ink
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Product UI",
    font: C.body,
    size: 14.5,
    weight: 500,
    color: C.cool,
    text: "A better price for this cohort \u2014 apply it? \xB7 Your data, already clean. Review and file."
  }), /*#__PURE__*/React.createElement(ScriptLine, {
    tag: "Numerals",
    font: C.body,
    size: 19,
    weight: 600,
    color: C.ink,
    text: "\u20B91,24,50,000 (1.24 crore)  \xB7  AED 4,500,250  \xB7  \u20AC312,400"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid ' + C.line,
      paddingTop: 12,
      fontSize: 12.5,
      color: '#555',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#1c1b18'
    }
  }, "Type:"), " Archivo for the Latin display voice (marketing only), with the Noto Sans trio \u2014 Latin, Devanagari, Arabic \u2014 as the product workhorse so all three scripts are equals in the UI from day one."));
}
Object.assign(window, {
  CBoardMark,
  CBoardColorType,
  MarkC
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/territory-c.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.DatePicker = __ds_scope.DatePicker;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.ProductCard = __ds_scope.ProductCard;

__ds_ns.SearchBar = __ds_scope.SearchBar;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.StatusChip = __ds_scope.StatusChip;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.YuktiMark = __ds_scope.YuktiMark;

})();
