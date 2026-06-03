import * as React from 'react';

export function OrderRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-1)',
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          {/* Row 1 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div
              className="animate-pulse"
              style={{
                height: 13,
                width: 120,
                borderRadius: 4,
                background: 'var(--bg-recessed)',
              }}
            />
            <div
              className="animate-pulse"
              style={{
                height: 11,
                width: 70,
                borderRadius: 100,
                background: 'var(--bg-recessed)',
              }}
            />
          </div>
          {/* Row 2 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div
              className="animate-pulse"
              style={{
                height: 11,
                width: 80,
                borderRadius: 4,
                background: 'var(--bg-recessed)',
              }}
            />
            <div
              className="animate-pulse"
              style={{
                height: 11,
                width: 90,
                borderRadius: 4,
                background: 'var(--bg-recessed)',
              }}
            />
          </div>
          {/* Row 3 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div
              className="animate-pulse"
              style={{
                height: 15,
                width: 65,
                borderRadius: 4,
                background: 'var(--bg-recessed)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
