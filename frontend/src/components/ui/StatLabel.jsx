import React, { useState, useRef, useEffect } from 'react'

const GLOSSARY = {
  OBP:   { name: 'On-Base Percentage',  desc: 'Fração de vezes que o rebatedor chegou a uma base (hit, caminhada ou HBP).' },
  ERA:   { name: 'Earned Run Average',  desc: 'Média de corridas sofridas por 9 entradas arremessadas.' },
  WHIP:  { name: 'Walks + Hits / IP',   desc: 'Quantos rebatedores chegam à base por entrada arremessada.' },
  'K/9': { name: 'Strikeouts por 9',    desc: 'Média de strikeouts a cada 9 entradas arremessadas.' },
  IP:    { name: 'Innings Pitched',     desc: 'Entradas arremessadas. Ex: 5.2 = 5 entradas e 2 outs adicionais.' },
  ER:    { name: 'Earned Runs',         desc: 'Corridas marcadas sem erros defensivos envolvidos.' },
  PC:    { name: 'Pitch Count',         desc: 'Total de arremessos realizados no jogo.' },
  STR:   { name: 'Strikes',             desc: 'Arremessos na zona de strike ou que resultaram em foul ball.' },
  BAL:   { name: 'Balls',               desc: 'Arremessos fora da zona de strike não rebatidos.' },
  RBI:   { name: 'Runs Batted In',      desc: 'Corridas marcadas como resultado de uma rebatida do jogador.' },
  BB:    { name: 'Base on Balls',       desc: 'Caminhada: 4 arremessos fora da zona garantem passagem à 1ª base.' },
  AVG:   { name: 'Batting Average',     desc: 'Média de rebatidas: hits divididos pelo total de at-bats (H / AB).' },
  DP:    { name: 'Double Play',         desc: 'Jogada que elimina dois corredores no mesmo lance.' },
  FO:    { name: 'Fly Out',             desc: 'Out por bola aérea capturada pelo defensor.' },
  GO:    { name: 'Ground Out',          desc: 'Out por bola rasteira antes de chegar à base.' },
  LO:    { name: 'Line Out',            desc: 'Out por linha baixa capturada diretamente.' },
  FB:    { name: 'Fastball',            desc: 'Arremesso reto em alta velocidade, o mais comum no beisebol.' },
  CV:    { name: 'Curveball',           desc: 'Arremesso com curva descendente causada pelo efeito de rotação.' },
  SL:    { name: 'Slider',             desc: 'Arremesso com desvio lateral e queda, mais rápido que a curveball.' },
  CH:    { name: 'Changeup',           desc: 'Arremesso lento com garra de fastball para enganar o timing do rebatedor.' },
  SI:    { name: 'Sinker',             desc: 'Fastball com movimento descendente que induz bola rasteira.' },
  CT:    { name: 'Cutter',             desc: 'Fastball com desvio lateral próximo ao home plate.' },
  SLG:   { name: 'Slugging Percentage', desc: 'Média de bases por at-bat: (H + 2B + 2×3B + 3×HR) / AB.' },
  OPS:   { name: 'On-base Plus Slugging', desc: 'OBP + SLG. Mede a capacidade ofensiva geral do rebatedor.' },
  'FLD%':{ name: 'Fielding Percentage', desc: 'Porcentagem de chances defensivas concluídas sem erro: (TC − E) / TC.' },
  TC:    { name: 'Total Chances',       desc: 'Total de jogadas defensivas: FO + GO + LO + E.' },
  SB:    { name: 'Stolen Bases',        desc: 'Bases roubadas: quando o corredor avança para a próxima base sem rebatida.' },
}

export default function StatLabel({ abbr }) {
  const def = GLOSSARY[abbr]
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [open])

  // After the tooltip renders, nudge it back inside the viewport if it overflows
  useEffect(() => {
    if (!open || !ref.current) return
    const tooltip = ref.current.querySelector('[role="tooltip"]')
    if (!tooltip) return
    requestAnimationFrame(() => {
      const box = tooltip.getBoundingClientRect()
      const margin = 8
      if (box.left < margin) {
        tooltip.style.left = '0'
        tooltip.style.transform = 'none'
      } else if (box.right > window.innerWidth - margin) {
        tooltip.style.left = 'auto'
        tooltip.style.right = '0'
        tooltip.style.transform = 'none'
      }
    })
  }, [open])

  if (!def) return abbr

  return (
    <span
      ref={ref}
      className={`stat-label${open ? ' stat-label--open' : ''}`}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
      aria-expanded={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setOpen(o => !o)}
    >
      {abbr}
      {open && (
        <span className="stat-tooltip" role="tooltip">
          <span className="stat-tooltip__name">{def.name}</span>
          <span className="stat-tooltip__desc">{def.desc}</span>
        </span>
      )}
    </span>
  )
}
