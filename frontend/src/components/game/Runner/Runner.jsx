import React from 'react'

export default function Runner({ point, pointStyle, onPointerDown }) {
  return (
    <div
      className="player-marker runner-marker"
      style={pointStyle}
      onPointerDown={onPointerDown}
    />
  )
}
