import React from 'react'

export default function Runner({ pointStyle, onPointerDown, animate = false }) {
  return (
    <div
      className={`player-marker runner-marker ${animate ? 'runner-animate runner-score' : ''}`}
      style={pointStyle}
      onPointerDown={onPointerDown}
    />
  )
}
