export function DataTable(props) {
  var columns      = props.columns      || [];
  var rows         = props.rows         || [];
  var emptyLabel   = props.emptyLabel   != null ? props.emptyLabel   : 'No data yet.';
  var onRowClick   = props.onRowClick;
  var stickyHeader = props.stickyHeader != null ? props.stickyHeader : true;

  var wrapStyle = {
    border: '1px solid #EAE3D9',
    borderRadius: '14px',
    overflow: 'hidden',
    background: '#FFFFFF',
    width: '100%',
  };

  var tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '15px',
    WebkitFontSmoothing: 'antialiased',
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
    zIndex: 1,
  };

  var thNumStyle = Object.assign({}, thStyle, { textAlign: 'right' });

  var tdStyle = {
    padding: '11px 16px',
    color: '#221E1A',
    borderBottom: '1px solid #EAE3D9',
    verticalAlign: 'middle',
    lineHeight: 1.4,
    letterSpacing: '-0.005em',
  };

  var tdNumStyle = Object.assign({}, tdStyle, {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    fontFeatureSettings: '"tnum" 1',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13.5px',
  });

  if (!rows.length) {
    return (
      <div style={Object.assign({}, wrapStyle, { padding: '48px 32px', textAlign: 'center', color: '#64594E', fontSize: '14px' })}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {columns.map(function(col, i) {
              return <th key={i} style={col.numeric ? thNumStyle : thStyle}>{col.label || col.key}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(function(row, ri) {
            return (
              <TableRow
                key={ri} row={row} ri={ri} columns={columns}
                tdStyle={tdStyle} tdNumStyle={tdNumStyle}
                lastRow={ri === rows.length - 1}
                onRowClick={onRowClick}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* Extracted so each row can own its own hover state. */
function TableRow(props) {
  var row = props.row, ri = props.ri, columns = props.columns;
  var tdStyle = props.tdStyle, tdNumStyle = props.tdNumStyle;
  var lastRow = props.lastRow, onRowClick = props.onRowClick;
  var interactive = !!onRowClick;

  var hState  = React.useState(false);
  var hovered = hState[0], setHovered = hState[1];

  return (
    <tr
      onClick={interactive ? function() { onRowClick(row, ri); } : undefined}
      onMouseEnter={interactive ? function(){ setHovered(true); }  : undefined}
      onMouseLeave={interactive ? function(){ setHovered(false); } : undefined}
      style={{
        cursor:     interactive ? 'pointer' : 'default',
        background: (interactive && hovered) ? 'rgba(34,30,26,.035)' : 'transparent',
        transition: 'background 110ms ease',
      }}
    >
      {columns.map(function(col, ci) {
        var cell = typeof col.render === 'function'
          ? col.render(row[col.key], row, ri)
          : row[col.key];
        var base   = col.numeric ? tdNumStyle : tdStyle;
        var noLine = lastRow ? { borderBottom: 'none' } : {};
        return <td key={ci} style={Object.assign({}, base, noLine)}>{cell}</td>;
      })}
    </tr>
  );
}
