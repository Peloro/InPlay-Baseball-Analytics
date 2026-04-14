export const DEFAULT_FIELD_POSITIONS = {
  P: { x: 50, y: 63 },
  C: { x: 50, y: 87 },
  '1B': { x: 58, y: 62 },
  '2B': { x: 53, y: 50 },
  '3B': { x: 42, y: 62 },
  SS: { x: 45, y: 48 },
  LF: { x: 37, y: 30 },
  CF: { x: 50, y: 18 },
  RF: { x: 63, y: 30 },
  DH: { x: 50, y: 55 },
}

export function getDefaultFieldPosition(activePosition) {
  return DEFAULT_FIELD_POSITIONS[activePosition] || DEFAULT_FIELD_POSITIONS.DH
}
