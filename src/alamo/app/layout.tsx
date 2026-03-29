// ==========================================================
// FILE: src/alamo/app/layout.tsx
// PURPOSE: Root layout for The Alamo.
// Sets Geist as the global font across all pages.
// Every page in The Alamo inherits this layout.
// ==========================================================

import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Alamo — Cactus',
  description: 'Cactus Logistics OS — Internal Admin',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body style={{
        fontFamily: 'var(--font-geist-sans)',
        background: '#F0EEE9',
        margin: 0,
        padding: 0,
      }}>
        {children}
      </body>
    </html>
  )
}