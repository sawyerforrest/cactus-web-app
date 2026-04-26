'use client'

import { useState, type CSSProperties } from 'react'
import MarkupConfigSection from './MarkupConfigSection'

interface Props {
  labelStyle: CSSProperties
  inputStyle: CSSProperties
}

export default function AccountConfigFields({ labelStyle, inputStyle }: Props) {
  const [isCactusAccount, setIsCactusAccount] = useState(true)
  const [useRateCard, setUseRateCard] = useState(false)

  const showMarkup = isCactusAccount && !useRateCard

  const noticeStyle: CSSProperties = {
    background: 'var(--cactus-canvas)',
    border: '0.5px solid var(--cactus-border)',
    borderLeft: '2px solid var(--cactus-amber)',
    borderRadius: '0 8px 8px 0',
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--cactus-ink)',
    lineHeight: 1.5,
    marginBottom: 20,
  }

  return (
    <>
      {/* Account ownership */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Account ownership</label>
        <select
          name="is_cactus_account"
          required
          value={String(isCactusAccount)}
          onChange={(e) => setIsCactusAccount(e.target.value === 'true')}
          style={{ ...inputStyle, appearance: 'none' }}
        >
          <option value="true">Cactus account — earn margin</option>
          <option value="false">Pass-through — no margin (client-owned)</option>
        </select>
      </div>

      {/* Rate-card billing toggle */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Billing source</label>
        <select
          name="use_rate_card"
          required
          value={String(useRateCard)}
          onChange={(e) => setUseRateCard(e.target.value === 'true')}
          style={{ ...inputStyle, appearance: 'none' }}
        >
          <option value="false">Live carrier rates + markup</option>
          <option value="true">Rate card</option>
        </select>
      </div>

      {/* Markup section — visible only for Cactus-owned, non-rate-card accounts */}
      {showMarkup ? (
        <MarkupConfigSection labelStyle={labelStyle} inputStyle={inputStyle} />
      ) : !isCactusAccount ? (
        <div style={noticeStyle}>
          <em>Client-owned accounts pass the carrier bill directly to the client. Cactus&apos;s value here is portal access, tracking, and claims — no markup is configured.</em>
        </div>
      ) : (
        <div style={noticeStyle}>
          <em>This account bills from a rate card. Configure rate-card pricing under Rate Cards. Markup is not set at the account level.</em>
        </div>
      )}
    </>
  )
}
