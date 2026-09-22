'use client'

import React from 'react'
import { AGENTS, ALL_SEATS, type Agent, type SeatId } from '../_agents'

// The office art is a fixed 1408x768 illustration. Everything below is
// positioned in that same pixel space and scales with the viewBox, so overlay
// coordinates stay exact at any width.
const W = 1408
const H = 768

/**
 * Each seat is a worker in the art who already has a speech bubble drawn on
 * them. The artwork's bubbles say the wrong thing for us and can't be erased
 * from the JPEG, so `cover` is measured to sit exactly on top of the painted
 * one (rect + its tail), hiding it completely. Re-measure against the image
 * before changing these numbers.
 */
const SEATS: Record<SeatId, {
  /** Worker's head, for the spotlight. */
  head: { x: number; y: number }
  /** Bubble body that must fully cover the painted one. */
  cover: { x: number; y: number; w: number; h: number }
  /** Horizontal centre of the bubble tail. */
  tailX: number
}> = {
  A: { head: { x: 287, y: 325 }, cover: { x: 171, y: 243, w: 272, h: 50 }, tailX: 290 },
  B: { head: { x: 1096, y: 345 }, cover: { x: 997, y: 271, w: 190, h: 50 }, tailX: 1093 },
  C: { head: { x: 800, y: 500 }, cover: { x: 671, y: 436, w: 212, h: 50 }, tailX: 779 },
}

const CYCLE = 18 // seconds for one pass through an agent's activities

function Bubble({
  seat, lines, active,
}: { seat: SeatId; lines: string[]; active: boolean }) {
  const { cover, tailX } = SEATS[seat]
  const midY = cover.y + cover.h / 2 + 8
  const tailTop = cover.y + cover.h
  const fill = active ? '#ECEBE8' : '#DCDAD5'
  return (
    <g>
      {/* body — matches the art's bubble: pale fill, heavy dark outline */}
      <rect
        x={cover.x} y={cover.y} width={cover.w} height={cover.h} rx={8}
        fill={fill} stroke="#17150F" strokeWidth={4}
      />
      <polygon
        points={`${tailX - 11},${tailTop - 3} ${tailX + 11},${tailTop - 3} ${tailX},${tailTop + 13}`}
        fill={fill} stroke="#17150F" strokeWidth={4} strokeLinejoin="round"
      />
      {/* re-cover the seam the tail outline cuts across the body */}
      <rect x={tailX - 9} y={tailTop - 7} width={18} height={7} fill={fill} />
      {active ? (
        lines.map((t, i) => (
          <text
            key={t}
            x={cover.x + cover.w / 2} y={midY}
            textAnchor="middle"
            className="ag-say"
            style={{ animationName: `ag-say-${i}`, animationDuration: `${CYCLE}s` }}
          >
            {t}
          </text>
        ))
      ) : (
        <text
          x={cover.x + cover.w / 2} y={midY}
          textAnchor="middle" className="ag-say ag-say--idle"
        >
          Open role
        </text>
      )}
    </g>
  )
}

export default function Office({ selectedId }: { selectedId?: string }) {
  const seated = AGENTS.filter((a): a is Agent & { seat: SeatId } => !!a.seat)
  const bySeat = new Map<SeatId, Agent>(seated.map((a) => [a.seat, a]))
  const focus = seated.find((a) => a.id === selectedId) ?? seated[0]

  // Keyframes for the activity rotation — one per line, evenly spaced.
  const sayCss = (() => {
    const agent = seated[0]
    const n = agent?.activities?.length ?? 0
    if (!n) return ''
    const slot = 100 / n
    return Array.from({ length: n }, (_, i) => {
      const s = i * slot
      return `@keyframes ag-say-${i} {
0%, ${Math.max(0, s - 1).toFixed(2)}% { opacity: 0; }
${(s + 2).toFixed(2)}%, ${(s + slot - 4).toFixed(2)}% { opacity: 1; }
${(s + slot - 1).toFixed(2)}%, 100% { opacity: 0; }
}`
    }).join('\n')
  })()

  return (
    <div className="ag-stage">
      <style dangerouslySetInnerHTML={{ __html: sayCss }} />
      <svg className="ag-svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Pixel-art office; the Send Case agent sits at the left desk">
        <defs>
          <radialGradient id="ag-spot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFE9A8" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#FFE9A8" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#FFE9A8" stopOpacity="0" />
          </radialGradient>
        </defs>

        <image href="/agents/office.jpg" x={0} y={0} width={W} height={H} />

        {/* Spotlight: dim the room, then punch a hole over the selected seat.
            Without this the highlight was lost in the art's own lamp glow. */}
        {focus && (
          <>
            <defs>
              <mask id="ag-dim-mask">
                <rect x={0} y={0} width={W} height={H} fill="#fff" />
                <ellipse cx={SEATS[focus.seat].head.x} cy={SEATS[focus.seat].head.y + 18}
                  rx={168} ry={134} fill="#000" />
                <ellipse cx={SEATS[focus.seat].head.x} cy={SEATS[focus.seat].head.y + 18}
                  rx={224} ry={180} fill="#000" opacity={0.5} />
              </mask>
            </defs>
            <rect x={0} y={0} width={W} height={H} fill="#0B0814" opacity={0.34} mask="url(#ag-dim-mask)" />
            <ellipse cx={SEATS[focus.seat].head.x} cy={SEATS[focus.seat].head.y + 22}
              rx={96} ry={70} fill="url(#ag-spot)" className="ag-spot" />
            <ellipse cx={SEATS[focus.seat].head.x} cy={SEATS[focus.seat].head.y + 46}
              rx={46} ry={15} fill="none" stroke={focus.color} strokeWidth={4}
              opacity={0.9} className="ag-ring" />
          </>
        )}

        {ALL_SEATS.map((seat) => {
          const a = bySeat.get(seat)
          return (
            <Bubble key={seat} seat={seat} lines={a?.activities ?? []} active={!!a} />
          )
        })}
      </svg>
    </div>
  )
}
