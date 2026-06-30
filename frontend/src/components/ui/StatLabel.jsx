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
  E:     { name: 'Error',               desc: 'Erro defensivo: falha que prolonga o turno do rebatedor ou permite avanço de corredor.' },
  DP:    { name: 'Double Play',         desc: 'Jogada que elimina dois corredores no mesmo lance.' },
  FO:    { name: 'Fly Out',             desc: 'Out por bola aérea capturada pelo defensor.' },
  GO:    { name: 'Ground Out',          desc: 'Out por bola rasteira antes de chegar à base.' },
  LO:    { name: 'Line Out',            desc: 'Out por linha baixa capturada diretamente.' },
  FB:    { name: 'Fastball',            desc: 'Arremesso reto em alta velocidade, o mais comum no beisebol.' },
  CV:    { name: 'Curveball',           desc: 'Arremesso com curva descendente causada pelo efeito de rotação.' },
  SL:    { name: 'Slider',              desc: 'Arremesso com desvio lateral e queda, mais rápido que a curveball.' },
  CH:    { name: 'Changeup',            desc: 'Arremesso lento com garra de fastball para enganar o timing do rebatedor.' },
  SI:    { name: 'Sinker',              desc: 'Fastball com movimento descendente que induz bola rasteira.' },
  CT:    { name: 'Cutter',              desc: 'Fastball com desvio lateral próximo ao home plate.' },
  SLG:   { name: 'Slugging Percentage', desc: 'Média de bases por at-bat: (H + 2B + 2×3B + 3×HR) / AB.' },
  OPS:   { name: 'On-base Plus Slugging', desc: 'OBP + SLG. Mede a capacidade ofensiva geral do rebatedor.' },
  'FLD%':{ name: 'Fielding Percentage', desc: 'Porcentagem de chances defensivas concluídas sem erro: (TC − E) / TC.' },
  TC:    { name: 'Total Chances',       desc: 'Total de jogadas defensivas: FO + GO + LO + E.' },
  SB:    { name: 'Stolen Bases',        desc: 'Bases roubadas: quando o corredor avança para a próxima base sem rebatida.' },
  // Pitching
  W:     { name: 'Wins',                desc: 'Vitórias do pitcher: jogos em que o time venceu com ele como arremessador responsável.' },
  L:     { name: 'Losses',              desc: 'Derrotas do pitcher: jogos em que o time perdeu com ele como arremessador responsável.' },
  SV:    { name: 'Saves',               desc: 'Salvamentos: o pitcher finaliza o jogo mantendo a vantagem do time.' },
  Outs:  { name: 'Outs Pitchados',      desc: 'Total de eliminações conseguidas pelo pitcher. Cada 3 outs = 1 inning completo.' },
  // Shared hitting/pitching
  H:     { name: 'Hits',                desc: 'Hits (rebatidas): no batting, acertos do rebatedor; no pitching, hits cedidos ao adversário.' },
  SO:    { name: 'Strikeouts',          desc: 'Eliminações por strike: no batting, vezes que o rebatedor foi eliminado por strikes; no pitching, rebatedores eliminados pelo arremessador.' },
  // Batting
  AB:    { name: 'At Bats',             desc: 'Turnos de rebatida que contam para a média (excluem caminhadas, HBP e sacrifícios).' },
  '2B':  { name: 'Doubles',             desc: 'Rebatida dupla: o rebatedor chega à 2ª base sem erro defensivo.' },
  '3B':  { name: 'Triples',             desc: 'Rebatida tripla: o rebatedor chega à 3ª base sem erro defensivo.' },
  HR:    { name: 'Home Runs',           desc: 'Pontos-corrida: o rebatedor completa todas as bases em uma rebatida.' },
  R:     { name: 'Runs',                desc: 'Corridas marcadas: número de vezes que o jogador cruzou o home plate.' },
  OUT:   { name: 'Outs',                desc: 'Eliminações sofridas pelo rebatedor (exceto strikeouts).' },
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
