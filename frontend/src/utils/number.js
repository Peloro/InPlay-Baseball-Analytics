export function safeNumber(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

export function toFixed3(value) {
  return Number(value || 0).toFixed(3)
}
