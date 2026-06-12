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
    background: '#FCFBF8',
    width: '100%',
  };

  var tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '14px',
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
    fontFamily: "'IBM Plex Mono', monospace",
    borderBottom: '1px solid #EAE3D9',
    background: '#FCFBF8',
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
    fontFamily: "'IBM Plex Mono', monospace",
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
            var lastRow = ri === rows.length - 1;
            return (
              <tr
                key={ri}
                onClick={onRowClick ? function() { onRowClick(row, ri); } : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {columns.map(function(col, ci) {
                  var cell = typeof col.render === 'function'
                    ? col.render(row[col.key], row, ri)
                    : row[col.key];
                  var base = col.numeric ? tdNumStyle : tdStyle;
                  var noLine = lastRow ? { borderBottom: 'none' } : {};
                  return <td key={ci} style={Object.assign({}, base, noLine)}>{cell}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


