// settings/SettingsLocations.jsx

function SettingsLocations() {
  const { useState } = React;

  const [locs, setLocs] = useState([
    { id: 1, name: 'Mumbai Warehouse', type: 'warehouse',     city: 'Mumbai',    state: 'MH', pincode: '400013', line1: '402, Trade Centre, Lower Parel', inv: true,  def: true,  status: 'active' },
    { id: 2, name: 'Delhi Branch',     type: 'branch',        city: 'New Delhi', state: 'DL', pincode: '110001', line1: 'B-12, Connaught Place',         inv: false, def: false, status: 'active' },
  ]);
  const [panel, setPanel]     = useState(false);   // slide-over open?
  const [editId, setEditId]   = useState(null);
  const [form, setForm]       = useState({});

  const TYPE_META = {
    warehouse:     { label: 'Warehouse',     cls: 'loc-badge--warehouse',     icon: 'warehouse' },
    dispatch_point:{ label: 'Dispatch Point',cls: 'loc-badge--dispatch_point',icon: 'package'   },
    branch:        { label: 'Branch',        cls: 'loc-badge--branch',        icon: 'building'  },
  };

  function openAdd() {
    setForm({ name: '', type: 'warehouse', line1: '', city: '', state: '', pincode: '', inv: true, def: false });
    setEditId(null); setPanel(true);
  }
  function openEdit(loc) {
    setForm({ ...loc }); setEditId(loc.id); setPanel(true);
  }
  function save() {
    if (!form.name) return;
    if (editId) {
      setLocs(locs.map(l => {
        if (l.id === editId) return { ...l, ...form };
        return form.def ? { ...l, def: false } : l;  // enforce single default
      }));
    } else {
      const newLoc = { ...form, id: Date.now(), status: 'active' };
      setLocs(locs.map(l => form.def ? { ...l, def: false } : l).concat(newLoc));
    }
    setPanel(false);
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="settings-page-header">
        <h1 className="settings-page-title">Locations</h1>
        <p className="settings-page-sub">Warehouses, dispatch points, and branches. Inventory is tracked per location.</p>
      </div>

      {/* ── Locations table ── */}
      <div className="s-card">
        {/* toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--cream-50)', borderBottom: '1px solid var(--cream-300)', borderRadius: '14px 14px 0 0' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--cream-900)' }}>
            Locations
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cream-600)', marginLeft: 8 }}>{locs.length}</span>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <SI name="plus" size={13} color="#fff" /> Add location
          </button>
        </div>

        <table className="dp-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>City</th>
              <th>Inventory tracking</th>
              <th>Status</th>
              <th style={{ width: 64 }}></th>
            </tr>
          </thead>
          <tbody>
            {locs.map(loc => {
              const tm = TYPE_META[loc.type] || TYPE_META.branch;
              return (
                <tr key={loc.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: loc.type === 'warehouse' ? 'var(--teal-50)' : 'var(--cream-100)', color: loc.type === 'warehouse' ? 'var(--teal-600)' : 'var(--cream-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <SI name={tm.icon} size={14} stroke={1.5} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--cream-900)', display: 'flex', alignItems: 'center', gap: 7 }}>
                          {loc.name}
                          {loc.def && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '1px 7px', borderRadius: 999, background: 'var(--ember-50)', color: 'var(--ember-700)', border: '1px solid var(--ember-100)' }}>
                              Default
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--cream-600)', marginTop: 1 }}>{loc.line1}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`loc-badge ${tm.cls}`}>{tm.label}</span></td>
                  <td style={{ color: 'var(--cream-700)', fontSize: 13 }}>{loc.city}, {loc.state}</td>
                  <td>
                    {loc.inv
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--success-700)' }}><SI name="check" size={13} stroke={2.5} color="var(--success-500)" /> Tracked</span>
                      : <span style={{ fontSize: 12.5, color: 'var(--cream-500)' }}>Not tracked</span>
                    }
                  </td>
                  <td><StatusPill status={loc.status} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <IBtn icon="edit" title="Edit location" onClick={() => openEdit(loc)} />
                    <IBtn icon="moreVert" title="More options" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Add / Edit slide-over ── */}
      {panel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          {/* scrim */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,26,0.38)', backdropFilter: 'blur(2px)' }}
            onClick={() => setPanel(false)} />
          {/* panel */}
          <div className="slideover" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 500 }}>
            <div className="slideover-head">
              <div className="title-block">
                <h2 className="ov-title">{editId ? 'Edit location' : 'Add location'}</h2>
                <p className="ov-sub">{editId ? "Update this location's details." : 'Add a warehouse, dispatch point, or branch.'}</p>
              </div>
              <button className="ov-close" onClick={() => setPanel(false)}>
                <SI name="x" size={16} />
              </button>
            </div>

            <div className="slideover-body" style={{ overflowY: 'auto', gap: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column' }}>
              <FRow label="Location name" required>
                <input autoFocus className="field-input" value={form.name || ''}
                  onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mumbai Warehouse" />
              </FRow>

              <SSelect label="Type" value={form.type || 'warehouse'} onChange={v => setForm({ ...form, type: v })}
                options={[
                  { value: 'warehouse',      label: 'Warehouse — holds stock' },
                  { value: 'dispatch_point', label: 'Dispatch Point — ships orders' },
                  { value: 'branch',         label: 'Branch — sales or admin office' },
                ]} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream-600)' }}>Address</div>
                <FRow label="Street address">
                  <input className="field-input" value={form.line1 || ''} onChange={e => setForm({ ...form, line1: e.target.value })} placeholder="Building / street" />
                </FRow>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 106px', gap: 10 }}>
                  <FRow label="City"><input className="field-input" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} /></FRow>
                  <FRow label="State"><input className="field-input" value={form.state || ''} onChange={e => setForm({ ...form, state: e.target.value })} maxLength={2} /></FRow>
                  <FRow label="Pincode"><input className="field-input" style={{ fontFamily: 'var(--font-mono)' }} value={form.pincode || ''} onChange={e => setForm({ ...form, pincode: e.target.value })} maxLength={6} /></FRow>
                </div>
              </div>

              <div style={{ background: 'var(--cream-50)', border: '1px solid var(--cream-300)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--cream-900)', marginBottom: 2 }}>Track inventory here</div>
                    <div style={{ fontSize: 12, color: 'var(--cream-700)', lineHeight: 1.4 }}>Stock levels will be tracked at this location. Turn off for offices that don't hold goods.</div>
                  </div>
                  <Toggle value={!!form.inv} onChange={v => setForm({ ...form, inv: v })} />
                </div>
                <div style={{ height: 1, background: 'var(--cream-300)' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--cream-900)', marginBottom: 2 }}>Set as default location</div>
                    <div style={{ fontSize: 12, color: 'var(--cream-700)', lineHeight: 1.4 }}>Pre-fills location on new orders. Only one location can be the default.</div>
                  </div>
                  <Toggle value={!!form.def} onChange={v => setForm({ ...form, def: v })} />
                </div>
              </div>
            </div>

            <div className="slideover-foot">
              <div className="spacer" />
              <button className="btn btn-ghost" onClick={() => setPanel(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{editId ? 'Save changes' : 'Add location'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.SettingsLocations = SettingsLocations;
