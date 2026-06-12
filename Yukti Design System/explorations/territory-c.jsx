// Territory C — "The Cleared Path" (the block of complexity, cut through)
const C = {
  ink: '#161A2B',
  paper: '#F4F4EF',
  hero: '#B7E018',     // graphic signal lime
  heroText: '#49640A', // text-safe moss
  cool: '#5B5F6E',
  line: '#E2E1D9',
  latin: '"Archivo", sans-serif',
  deva: '"Noto Sans Devanagari", sans-serif',
  arab: '"Noto Sans Arabic", sans-serif',
  body: '"Noto Sans", sans-serif',
};

// A solid square — the operational weight — with one clean diagonal channel
// cut through it, ascending left-to-right. The path is the negative space.
function MarkC({ size = 64, color = C.ink, channel }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Yukti mark — territory C">
      {channel ? <rect x="3" y="3" width="26" height="26" fill={channel}></rect> : null}
      <path d="M3 3 H22.5 L3 22.5 Z" fill={color}></path>
      <path d="M29 29 H9.5 L29 9.5 Z" fill={color}></path>
    </svg>
  );
}
function WordC({ size = 30, color = C.ink }) {
  return <span style={{ fontFamily: C.latin, fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', color, lineHeight: 1 }}>Yukti</span>;
}
function DevaC({ size = 28, color = C.ink }) {
  return <span style={{ fontFamily: C.deva, fontWeight: 700, fontSize: size, color, lineHeight: 1.2 }}>युक्ति</span>;
}

function CBoardMark() {
  return (
    <BoardPad>
      <BoardHead kicker="Territory C · The Cleared Path" title="The weight, with a way through."
        note="A solid block — the operational weight Yukti carries — cut by one clean ascending channel. The advantage is the negative space: the path the owner moves through while the platform holds the rest. The most abstract and most ownable of the three." />
      <div style={{ background: C.ink, borderRadius: 6, height: 168, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <MarkC size={88} color={C.paper} channel={C.ink} />
        <WordC size={56} color={C.paper} />
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <LockupCell label="Horizontal" grow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><MarkC size={38} /><WordC size={26} /></div>
        </LockupCell>
        <LockupCell label="Stacked">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><MarkC size={34} /><WordC size={17} /></div>
        </LockupCell>
        <LockupCell label="Symbol only"><MarkC size={48} /></LockupCell>
        <LockupCell label="Channel in hero" bg={C.ink}>
          <MarkC size={44} color={C.paper} channel={C.hero} />
        </LockupCell>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <LockupCell label="Devanagari secondary" grow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><MarkC size={34} /><DevaC size={25} /></div>
        </LockupCell>
        <LockupCell label="App icon (buyer PWA)" bg="#eaeae3">
          <div style={{ width: 64, height: 64, borderRadius: 15, background: C.hero, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MarkC size={44} color={C.ink} channel={C.hero} />
          </div>
        </LockupCell>
        <LockupCell label="Favicon · 16 px actual" bg="#eaeae3">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <MarkC size={16} /><MarkC size={16} color={C.heroText} />
          </div>
        </LockupCell>
        <LockupCell label="Monochrome reversed" bg={C.ink}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><MarkC size={32} color={C.paper} /><WordC size={22} color={C.paper} /></div>
        </LockupCell>
      </div>
      <div style={{ borderTop: '1px solid ' + C.line, paddingTop: 12, fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>
        <strong style={{ color: '#1c1b18' }}>Rationale:</strong> the unfair advantage as a cleared road — competitors push through the block; the Yukti owner moves through the cut.
      </div>
    </BoardPad>
  );
}

function CBoardColorType() {
  return (
    <BoardPad>
      <BoardHead kicker="Territory C · Color + Type" title="Signal Lime on Night Indigo"
        note="The most product-led palette: near-black indigo surfaces with one live lime signal — the cleared path, lit. Lime is strictly graphic; text always uses moss or paper. The coolest and most global-tech of the three directions." />
      <div style={{ display: 'flex', gap: 14 }}>
        <Sw c={C.ink} name="Night Indigo" role="Surfaces, text — deep but not navy-corporate" />
        <Sw c={C.paper} name="Bone" role="Light ground" />
        <Sw c={C.hero} name="Signal Lime" role="Graphic + the lit channel only" />
        <Sw c={C.heroText} name="Moss" role="Text-safe hero on light ground" />
        <Sw c={C.cool} name="Graphite" role="Secondary text" />
        <Sw c={C.line} name="Hairline" role="Dividers, card strokes" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <AABadge fg={C.ink} bg={C.paper} label="Indigo/Bone" />
        <AABadge fg={C.heroText} bg={C.paper} label="Moss/Bone" />
        <AABadge fg={C.hero} bg={C.ink} label="Lime/Indigo" />
        <AABadge fg={C.ink} bg={C.hero} label="Indigo/Lime" />
      </div>
      <div style={{ background: '#fff', border: '1px solid ' + C.line, borderRadius: 6, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 15 }}>
        <ScriptLine tag="Latin · display" font={C.latin} size={31} weight={800} text="You decide. Yukti makes it pay off." ls="-0.02em" color={C.ink} />
        <ScriptLine tag="Devanagari" font={C.deva} size={26} weight={700} text="फ़ैसला आपका। रफ़्तार युक्ति की।" color={C.ink} />
        <ScriptLine tag="Arabic · RTL" font={C.arab} size={25} weight={700} dir="rtl" text="القرار قرارك، والسرعة من يوكتي." color={C.ink} />
        <ScriptLine tag="Product UI" font={C.body} size={14.5} weight={500} color={C.cool} text="A better price for this cohort — apply it? · Your data, already clean. Review and file." />
        <ScriptLine tag="Numerals" font={C.body} size={19} weight={600} color={C.ink} text="₹1,24,50,000 (1.24 crore)  ·  AED 4,500,250  ·  €312,400" />
      </div>
      <div style={{ borderTop: '1px solid ' + C.line, paddingTop: 12, fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>
        <strong style={{ color: '#1c1b18' }}>Type:</strong> Archivo for the Latin display voice (marketing only), with the Noto Sans trio — Latin, Devanagari, Arabic — as the product workhorse so all three scripts are equals in the UI from day one.
      </div>
    </BoardPad>
  );
}

Object.assign(window, { CBoardMark, CBoardColorType, MarkC });
