export default function AliasSpreadModal({ isOpen, matchCount, displayName, onYes, onNo, onCancel }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#111', border: '1px solid #222',
        borderRadius: 16, padding: 32,
        width: '100%', maxWidth: 420,
      }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#fff' }}>
            Alias Spread Detected
          </h2>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6 }}>
            "{displayName}" matches <strong style={{ color: '#fff' }}>{matchCount}</strong> other transaction{matchCount !== 1 ? 's' : ''} outside your current selection.
          </p>
          <p style={{ color: '#666', fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
            Alias all matching transactions as "{displayName}"?
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onYes} style={{
            width: '100%', background: '#00c853', color: '#000',
            border: 'none', borderRadius: 8, padding: '12px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>
            Yes — Alias All Matches
          </button>
          <button onClick={onNo} style={{
            width: '100%', background: '#333', color: '#fff',
            border: '1px solid #444', borderRadius: 8, padding: '12px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>
            No — Only This Selection
          </button>
          <button onClick={onCancel} style={{
            width: '100%', background: 'transparent', color: '#555',
            border: 'none', padding: '10px', fontSize: 13, cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
