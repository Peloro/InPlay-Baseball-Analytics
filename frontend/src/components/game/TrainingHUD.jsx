import React from 'react'
import Button from '../ui/Button'
import CountDots from '../CountDots'

export default function TrainingHUD({
  computeBasePosition,
  setRunners,
  resetTraining,
  isMobile,
}) {
  if (isMobile) return null

  return (
    <aside className="field-hud training-hud">
      <div className="field-hud-block">
        <h3>Modo Treino</h3>
        <p>Mova jogadores e corredores, desenhe jogadas e limpe quando quiser.</p>
        <div className="hud-actions">
          <Button type="button" variant="primary" onClick={() => setRunners((current) => ({ ...current, first: { ...current.first, ...computeBasePosition('1B'), visible: true } }))}>
            + 1B
          </Button>
          <Button type="button" variant="primary" onClick={() => setRunners((current) => ({ ...current, second: { ...current.second, ...computeBasePosition('2B'), visible: true } }))}>
            + 2B
          </Button>
          <Button type="button" variant="primary" onClick={() => setRunners((current) => ({ ...current, third: { ...current.third, ...computeBasePosition('3B'), visible: true } }))}>
            + 3B
          </Button>
        </div>
        <Button type="button" className="full-width-btn" onClick={resetTraining}>
          Resetar treino
        </Button>
      </div>
    </aside>
  )
}
