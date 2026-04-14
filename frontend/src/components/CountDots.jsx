function CountDots({ label, value, max, color }) {
  const safeValue = Math.max(0, Math.min(Number(value || 0), Number(max || 0)))
  const dots = Array.from({ length: max }, (_, index) => index < safeValue)

  return (
    <div className="count-dots-row" aria-label={label}>
      <span className="count-dots-label">{label}</span>
      <div className="count-dots-track" role="img" aria-label={`${label}: ${safeValue} de ${max}`}>
        {dots.map((filled, index) => (
          <span
            key={`${label}-${index}`}
            className={`count-dot ${filled ? 'filled' : ''}`}
            style={{ '--count-dot-color': color }}
          />
        ))}
      </div>
    </div>
  )
}

export default CountDots