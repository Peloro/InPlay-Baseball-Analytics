import React, { useMemo } from 'react'

function CountDots({ label, value, max, color }) {
  const safeValue = useMemo(
    () => Math.max(0, Math.min(Number(value || 0), Number(max || 0))),
    [value, max],
  )
  const dots = useMemo(
    () => Array.from({ length: max }, (_, index) => index < safeValue),
    [max, safeValue],
  )
  const dotStyle = useMemo(() => ({ '--count-dot-color': color }), [color])

  return (
    <div className="count-dots-row" aria-label={label}>
      <span className="count-dots-label">{label}</span>
      <div className="count-dots-track" role="img" aria-label={`${label}: ${safeValue} de ${max}`}>
        {dots.map((filled, index) => (
          <span
            key={`${label}-${index}`}
            className={`count-dot ${filled ? 'filled' : ''}`}
            style={dotStyle}
          />
        ))}
      </div>
    </div>
  )
}

export default React.memo(CountDots)
