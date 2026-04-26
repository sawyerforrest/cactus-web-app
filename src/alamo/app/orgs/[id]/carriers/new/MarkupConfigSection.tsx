'use client'

import { useState, type CSSProperties } from 'react'

interface Props {
  labelStyle: CSSProperties
  inputStyle: CSSProperties
}

export default function MarkupConfigSection({ labelStyle, inputStyle }: Props) {
  const [markupType, setMarkupType] = useState<'percentage' | 'flat'>('percentage')

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>Markup type</label>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--cactus-ink)', cursor: 'pointer' }}>
          <input
            type="radio"
            name="markup_type"
            value="percentage"
            checked={markupType === 'percentage'}
            onChange={() => setMarkupType('percentage')}
          />
          Percentage
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--cactus-ink)', cursor: 'pointer' }}>
          <input
            type="radio"
            name="markup_type"
            value="flat"
            checked={markupType === 'flat'}
            onChange={() => setMarkupType('flat')}
          />
          Flat fee
        </label>
      </div>

      {markupType === 'percentage' ? (
        <div style={{ position: 'relative' }}>
          <input
            name="markup_value"
            type="number"
            required
            step="0.01"
            min="0"
            max="100"
            defaultValue="15"
            placeholder="e.g. 15"
            style={{ ...inputStyle, paddingRight: 32 }}
          />
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 13, color: 'var(--cactus-muted)', pointerEvents: 'none',
          }}>%</span>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 13, color: 'var(--cactus-muted)', pointerEvents: 'none',
          }}>$</span>
          <input
            name="markup_value"
            type="number"
            required
            step="0.01"
            min="0"
            defaultValue="1.50"
            placeholder="e.g. 1.50"
            style={{ ...inputStyle, paddingLeft: 24 }}
          />
        </div>
      )}
    </div>
  )
}
