import { useCallback, useEffect, useRef, useState } from 'react'
import { gameStatsApi } from '../services/api'
import { safeNumber } from '../utils/number'
import { addInningRuns } from '../utils/stats'
import { detectPlayerType, getPlayerId, getMainPosition } from '../utils/player'
import { EMPTY_GAME_STAT, EMPTY_PITCHING } from '../constants/stats'
import { incrementPitcherCount, computeInningTransition } from '../utils/gameState'
import { HIT_LABELS } from '../constants/fieldGame'
import {
  makeLogEntry, updateOppBatter, oppBatterLabel, advanceOpponentLineup,
  applyRunnerAdvance, applyHitToBases, forceAdvanceToFirst, getNextBatterIndexFromState,
} from '../utils/fieldGame'
import { getDefaultFieldPosition } from '../data/defaultFieldPositions'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

function haptic(style) { Haptics.impact({ style }).catch(() => {}) }

export default function useGameActions({
  gameState,
  onUpdateGameState,
  players,
  setPlayers,
  playersById,
  onPitchAction,
  onStatsUpdated,
  setAnimatedBall,
  selectedPitchType,
}) {
  const [undoStack, setUndoStack] = useState([])
  const [invalidFeedback, setInvalidFeedback] = useState('')
  const isProcessingRef = useRef(false)

  const showInvalidAction = useCallback((message) => {
    setInvalidFeedback(message)
    window.setTimeout(() => setInvalidFeedback(''), 1400)
  }, [])

  const prevUndoLenRef = useRef(0)
  useEffect(() => {
    if (undoStack.length >= 75 && prevUndoLenRef.current < 75) {
      showInvalidAction('Histórico de desfazer quase cheio — ações antigas serão descartadas')
    }
    prevUndoLenRef.current = undoStack.length
  }, [undoStack.length, showInvalidAction])

  // ── Stat write helpers ──────────────────────────────────────────

  const upsertCurrentBatterStats = useCallback(async (playerId, patch = {}) => {
    if (!gameState.currentGameId || !playerId) return

    const found = await gameStatsApi.listByGame(gameState.currentGameId, playerId)
    const current = found.data?.[0]

    const payload = {
      type: detectPlayerType(playersById[playerId]),
      hitting: {
        atBats:      safeNumber(patch.hitting?.atBats      ?? current?.hitting?.atBats),
        hits:        safeNumber(patch.hitting?.hits        ?? current?.hitting?.hits),
        doubles:     safeNumber(patch.hitting?.doubles     ?? current?.hitting?.doubles),
        triples:     safeNumber(patch.hitting?.triples     ?? current?.hitting?.triples),
        homeRuns:    safeNumber(patch.hitting?.homeRuns    ?? current?.hitting?.homeRuns),
        strikeouts:  safeNumber(patch.hitting?.strikeouts  ?? current?.hitting?.strikeouts),
        outs:        safeNumber(patch.hitting?.outs        ?? current?.hitting?.outs),
        walks:       safeNumber(patch.hitting?.walks       ?? current?.hitting?.walks),
        runs:        safeNumber(patch.hitting?.runs        ?? current?.hitting?.runs),
        rbi:         safeNumber(patch.hitting?.rbi         ?? current?.hitting?.rbi),
        stolenBases: safeNumber(patch.hitting?.stolenBases ?? current?.hitting?.stolenBases),
      },
      pitching: {
        inningsPitched: safeNumber(current?.pitching?.inningsPitched),
        outsPitched:    safeNumber(current?.pitching?.outsPitched),
        earnedRuns:     safeNumber(current?.pitching?.earnedRuns),
        strikeouts:     safeNumber(current?.pitching?.strikeouts),
        walks:          safeNumber(current?.pitching?.walks),
        strikes:        safeNumber(current?.pitching?.strikes),
        balls:          safeNumber(current?.pitching?.balls),
        pitchCount:     safeNumber(current?.pitching?.pitchCount),
        hitsAllowed:    safeNumber(current?.pitching?.hitsAllowed),
        wins:           safeNumber(current?.pitching?.wins),
        losses:         safeNumber(current?.pitching?.losses),
        saves:          safeNumber(current?.pitching?.saves),
      },
      defense: {
        errors:      safeNumber(current?.defense?.errors),
        doublePlays: safeNumber(current?.defense?.doublePlays),
        flyOuts:     safeNumber(current?.defense?.flyOuts),
        groundOuts:  safeNumber(current?.defense?.groundOuts),
        lineOuts:    safeNumber(current?.defense?.lineOuts),
      },
    }

    gameStatsApi.upsert(gameState.currentGameId, playerId, payload)
  }, [gameState.currentGameId, playersById])

  const upsertPlayerStat = useCallback(async (playerId, patch = {}) => {
    if (!gameState.currentGameId || !playerId) return

    const found = await gameStatsApi.listByGame(gameState.currentGameId, playerId)
    const current = found.data?.[0]

    const payload = {
      type: detectPlayerType(playersById[playerId]),
      hitting: {
        atBats:      safeNumber(patch.hitting?.atBats      ?? current?.hitting?.atBats),
        hits:        safeNumber(patch.hitting?.hits        ?? current?.hitting?.hits),
        doubles:     safeNumber(patch.hitting?.doubles     ?? current?.hitting?.doubles),
        triples:     safeNumber(patch.hitting?.triples     ?? current?.hitting?.triples),
        homeRuns:    safeNumber(patch.hitting?.homeRuns    ?? current?.hitting?.homeRuns),
        strikeouts:  safeNumber(patch.hitting?.strikeouts  ?? current?.hitting?.strikeouts),
        outs:        safeNumber(patch.hitting?.outs        ?? current?.hitting?.outs),
        walks:       safeNumber(patch.hitting?.walks       ?? current?.hitting?.walks),
        runs:        safeNumber(patch.hitting?.runs        ?? current?.hitting?.runs),
        rbi:         safeNumber(patch.hitting?.rbi         ?? current?.hitting?.rbi),
        stolenBases: safeNumber(patch.hitting?.stolenBases ?? current?.hitting?.stolenBases),
      },
      pitching: {
        inningsPitched: safeNumber(patch.pitching?.inningsPitched ?? current?.pitching?.inningsPitched),
        outsPitched:    safeNumber(patch.pitching?.outsPitched    ?? current?.pitching?.outsPitched),
        earnedRuns:     safeNumber(patch.pitching?.earnedRuns     ?? current?.pitching?.earnedRuns),
        strikeouts:     safeNumber(patch.pitching?.strikeouts     ?? current?.pitching?.strikeouts),
        walks:          safeNumber(patch.pitching?.walks          ?? current?.pitching?.walks),
        strikes:        safeNumber(patch.pitching?.strikes        ?? current?.pitching?.strikes),
        balls:          safeNumber(patch.pitching?.balls          ?? current?.pitching?.balls),
        pitchCount:     safeNumber(patch.pitching?.pitchCount     ?? current?.pitching?.pitchCount),
        hitsAllowed:    safeNumber(patch.pitching?.hitsAllowed    ?? current?.pitching?.hitsAllowed),
        wins:           safeNumber(patch.pitching?.wins           ?? current?.pitching?.wins),
        losses:         safeNumber(patch.pitching?.losses         ?? current?.pitching?.losses),
        saves:          safeNumber(patch.pitching?.saves          ?? current?.pitching?.saves),
        pitchTypes:     patch.pitching?.pitchTypes ?? current?.pitching?.pitchTypes ?? EMPTY_PITCHING.pitchTypes,
      },
      defense: {
        errors:      safeNumber(patch.defense?.errors      ?? current?.defense?.errors),
        doublePlays: safeNumber(patch.defense?.doublePlays ?? current?.defense?.doublePlays),
        flyOuts:     safeNumber(patch.defense?.flyOuts     ?? current?.defense?.flyOuts),
        groundOuts:  safeNumber(patch.defense?.groundOuts  ?? current?.defense?.groundOuts),
        lineOuts:    safeNumber(patch.defense?.lineOuts    ?? current?.defense?.lineOuts),
      },
    }

    gameStatsApi.upsert(gameState.currentGameId, playerId, payload)
  }, [gameState.currentGameId, playersById])

  const syncDefensivePitcherEvent = useCallback(async ({ outsDelta = 0, earnedRunsDelta = 0, pitchCountDelta = 0, walksDelta = 0, strikeoutsDelta = 0, hitsAllowedDelta = 0 } = {}) => {
    if (gameState.isAttacking) return
    if (!gameState.currentGameId || !gameState.currentPitcherId) return

    const pitcherId = gameState.currentPitcherId
    const found = await gameStatsApi.listByGame(gameState.currentGameId, pitcherId)
    const current = found.data?.[0]

    const nextOutsPitched = safeNumber(current?.pitching?.outsPitched) + safeNumber(outsDelta)
    const patch = {
      pitching: {
        outsPitched: nextOutsPitched,
        inningsPitched: Math.floor(nextOutsPitched / 3) + ((nextOutsPitched % 3) / 10),
        earnedRuns: safeNumber(current?.pitching?.earnedRuns) + safeNumber(earnedRunsDelta),
        strikeouts: safeNumber(current?.pitching?.strikeouts) + safeNumber(strikeoutsDelta),
        walks: safeNumber(current?.pitching?.walks) + safeNumber(walksDelta),
        strikes: safeNumber(current?.pitching?.strikes),
        balls: safeNumber(current?.pitching?.balls),
        pitchCount: safeNumber(current?.pitching?.pitchCount) + safeNumber(pitchCountDelta),
        hitsAllowed: safeNumber(current?.pitching?.hitsAllowed) + safeNumber(hitsAllowedDelta),
        pitchTypes: current?.pitching?.pitchTypes ?? EMPTY_PITCHING.pitchTypes,
      },
    }

    await upsertPlayerStat(pitcherId, patch)
    onStatsUpdated?.()
  }, [gameState.currentGameId, gameState.currentPitcherId, gameState.isAttacking, upsertPlayerStat, onStatsUpdated])

  // ── Undo ───────────────────────────────────────────────────────

  const captureUndoSnapshot = useCallback(async () => {
    if (!gameState.currentGameId) return

    let statsSnapshot = []
    try {
      const response = await gameStatsApi.listByGame(gameState.currentGameId)
      statsSnapshot = (response.data || []).map((entry) => ({
        playerId: entry.playerId?._id || entry.playerId,
        type: entry.type,
        hitting: {
          atBats: safeNumber(entry.hitting?.atBats),
          hits: safeNumber(entry.hitting?.hits),
          strikeouts: safeNumber(entry.hitting?.strikeouts),
          outs: safeNumber(entry.hitting?.outs),
          walks: safeNumber(entry.hitting?.walks),
          runs: safeNumber(entry.hitting?.runs),
          rbi: safeNumber(entry.hitting?.rbi),
          homeRuns: safeNumber(entry.hitting?.homeRuns),
        },
        pitching: {
          inningsPitched: safeNumber(entry.pitching?.inningsPitched),
          outsPitched: safeNumber(entry.pitching?.outsPitched),
          earnedRuns: safeNumber(entry.pitching?.earnedRuns),
          strikeouts: safeNumber(entry.pitching?.strikeouts),
          walks: safeNumber(entry.pitching?.walks),
          strikes: safeNumber(entry.pitching?.strikes),
          balls: safeNumber(entry.pitching?.balls),
          pitchCount: safeNumber(entry.pitching?.pitchCount),
          hitsAllowed: safeNumber(entry.pitching?.hitsAllowed),
          pitchTypes: entry.pitching?.pitchTypes ?? EMPTY_PITCHING.pitchTypes,
        },
        defense: {
          errors: safeNumber(entry.defense?.errors),
          doublePlays: safeNumber(entry.defense?.doublePlays),
          flyOuts: safeNumber(entry.defense?.flyOuts),
          groundOuts: safeNumber(entry.defense?.groundOuts),
          lineOuts: safeNumber(entry.defense?.lineOuts),
        },
      }))
    } catch {
      statsSnapshot = []
    }

    const stateSnapshot = JSON.parse(JSON.stringify(gameState))
    setUndoStack((current) => [...current, { stateSnapshot, statsSnapshot }].slice(-80))
  }, [gameState])

  const handleUndo = useCallback(async () => {
    const latest = undoStack[undoStack.length - 1]
    if (!latest) {
      showInvalidAction('Nada para desfazer')
      return
    }

    setUndoStack((current) => current.slice(0, -1))
    onUpdateGameState(latest.stateSnapshot)

    if (!gameState.currentGameId) return

    try {
      const currentStatsResponse = await gameStatsApi.listByGame(gameState.currentGameId)
      const currentStats = currentStatsResponse.data || []
      const snapshotMap = {}
      for (const item of latest.statsSnapshot || []) {
        snapshotMap[item.playerId] = item
      }

      for (const currentEntry of currentStats) {
        const pid = currentEntry.playerId?._id || currentEntry.playerId
        const saved = snapshotMap[pid]

        if (saved) {
          await upsertPlayerStat(pid, saved)
          continue
        }

        await upsertPlayerStat(pid, {
          type: currentEntry.type,
          ...EMPTY_GAME_STAT,
        })
      }

      for (const saved of latest.statsSnapshot || []) {
        const alreadyExists = currentStats.some((item) => {
          const pid = item.playerId?._id || item.playerId
          return pid === saved.playerId
        })
        if (!alreadyExists) {
          await upsertPlayerStat(saved.playerId, saved)
        }
      }
    } catch {
      showInvalidAction('Falha ao restaurar stats')
    }
  }, [gameState.currentGameId, onUpdateGameState, showInvalidAction, undoStack, upsertPlayerStat])

  // ── Pitch / defensive-mode actions ────────────────────────────

  const handleDefensivePitch = useCallback(async (kind) => {
    if (!gameState.currentPitcherId) {
      showInvalidAction('Selecione o arremessador antes de registrar pitches')
      return
    }
    if ((gameState.onFieldPlayerIds || []).length < 9) {
      showInvalidAction('É necessário ter 9 jogadores em campo para arremessar')
      return
    }
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)
    await captureUndoSnapshot()
    onPitchAction?.(kind, { pitchType: selectedPitchType })
    haptic(ImpactStyle.Light)
  }, [captureUndoSnapshot, gameState.currentPitcherId, gameState.onFieldPlayerIds, onPitchAction, selectedPitchType, showInvalidAction])

  const handlePitcherSelect = useCallback((nextId) => {
    if (!nextId) return
    const nextPitcher = playersById[nextId]
    if (!nextPitcher) return

    const fieldIdSet = new Set(gameState.onFieldPlayerIds || [])
    const isOnField = fieldIdSet.has(nextId)
    const pitcherCoord = getDefaultFieldPosition('P')

    setPlayers(current =>
      current.map(p => getPlayerId(p) === nextId ? { ...p, x: pitcherCoord.x, y: pitcherCoord.y, activePosition: 'P' } : p)
    )

    if (isOnField) {
      onUpdateGameState(current => {
        const nextPitchCounts = { ...(current.pitchCounts || {}) }
        if (!Number.isFinite(nextPitchCounts[nextId])) nextPitchCounts[nextId] = 0
        const nextLineup = (current.lineup || []).map(l =>
          l.playerId === nextId ? { ...l, position: 'P' } : l
        )
        return { ...current, currentPitcherId: nextId, pitchCounts: nextPitchCounts, lineup: nextLineup }
      }, 'Arremessador alterado')
    } else {
      const oldPitcherId = gameState.currentPitcherId
      onUpdateGameState(current => {
        const currentOnField = current.onFieldPlayerIds || []
        const nextOnField = [...currentOnField.filter(id => id !== oldPitcherId), nextId]
        const nextPitchCounts = { ...(current.pitchCounts || {}) }
        if (!Number.isFinite(nextPitchCounts[nextId])) nextPitchCounts[nextId] = 0
        const battingOrder = [...(current.battingOrder || [])]
        if (oldPitcherId) {
          const idx = battingOrder.findIndex(id => id === oldPitcherId)
          if (idx >= 0) battingOrder[idx] = nextId
          else if (!battingOrder.includes(nextId)) battingOrder.push(nextId)
        } else if (!battingOrder.includes(nextId)) {
          battingOrder.push(nextId)
        }
        const nextLineup = [
          ...(current.lineup || []).filter(l => l.playerId !== oldPitcherId && l.playerId !== nextId),
          { playerId: nextId, position: 'P' },
        ]
        const bench = players.map(p => getPlayerId(p)).filter(id => !nextOnField.includes(id))
        const oldPitcherName = oldPitcherId ? (playersById[oldPitcherId]?.name || '?') : null
        const subRecord = {
          id: `sub_${Date.now()}`,
          ts: Date.now(),
          inning: current.inning || 1,
          half: current.inningHalf || 'top',
          playerInId: nextId,
          playerInName: nextPitcher?.name || '',
          position: 'P',
          playerOutId: oldPitcherId || null,
          playerOutName: oldPitcherName || '',
        }
        return {
          ...current,
          onFieldPlayerIds: Array.from(new Set(nextOnField)),
          battingOrder,
          lineup: nextLineup,
          bench,
          participantPlayerIds: [...nextOnField, ...bench],
          currentPitcherId: nextId,
          pitchCounts: nextPitchCounts,
          substitutions: [...(current.substitutions || []), subRecord],
          gameLog: [
            ...(current.gameLog || []),
            makeLogEntry(current, 'sub', `Sub pitcher: ${nextPitcher?.name || '?'}${oldPitcherName ? ` → ${oldPitcherName}` : ''}`),
          ],
        }
      }, `${nextPitcher?.name || 'Jogador'} entrou como pitcher`)
    }
  }, [playersById, gameState.onFieldPlayerIds, gameState.currentPitcherId, players, setPlayers, onUpdateGameState])

  // ── Plate appearance / offensive-mode actions ──────────────────

  const applyPlateAppearance = useCallback(async (kind) => {
    const order = gameState.battingOrder || []
    if (!order.length || !gameState.isAttacking) return
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    await captureUndoSnapshot()

    const batterIndex = Math.min(gameState.currentBatterIndex || 0, order.length - 1)
    const batterId = order[batterIndex]
    const isHit = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'homerun'

    if (isHit) {
      const preview = applyHitToBases(gameState.runners || { first: false, second: false, third: false }, kind)
      const bases = preview.bases || 1
      const destName = bases >= 4 ? 'C' : bases === 3 ? '3B' : bases === 2 ? '2B' : '1B'
      const homePos = getDefaultFieldPosition('C')
      const destPos = getDefaultFieldPosition(destName)

      setAnimatedBall({ visible: true, x: homePos.x, y: homePos.y })
      await new Promise((r) => setTimeout(r, 40))
      setAnimatedBall({ visible: true, x: destPos.x, y: destPos.y })
      await new Promise((r) => setTimeout(r, 480))
    }

    onUpdateGameState((current) => {
      const localOrder = current.battingOrder || []
      if (!localOrder.length) return current

      const currentIndex = Math.min(current.currentBatterIndex || 0, localOrder.length - 1)
      const nextIndex = (currentIndex + 1) % localOrder.length
      const isOut = kind === 'strikeout' || kind === 'out'
      const { nextOuts: outs, sideSwitch, nextHalf, nextInning } = computeInningTransition(current, isOut ? 1 : 0)

      let nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      let runs = 0

      if (isHit) {
        const hitResult = applyHitToBases(nextRunners, kind, localOrder[currentIndex])
        nextRunners = hitResult.nextRunners
        runs = hitResult.runs
      }

      const batterName = playersById[localOrder[currentIndex]]?.name || '?'
      const logDesc = kind === 'homerun'
        ? `${batterName}: Home Run${runs > 1 ? ` (${runs} pontos)` : ''}`
        : isHit
          ? `${batterName}: ${HIT_LABELS[kind] || kind}${runs > 0 ? ` (+${runs})` : ''}`
          : kind === 'strikeout'
            ? `${batterName}: K`
            : `${batterName}: Out`

      return {
        ...current,
        opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
        outs: sideSwitch ? 0 : outs,
        balls: 0,
        strikes: 0,
        currentBatterIndex: nextIndex,
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: nextInning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? runs : 0),
        inningScores: runs > 0 ? addInningRuns(current.inningScores, current.inning, current.isAttacking ? runs : 0, current.isAttacking ? 0 : runs) : (current.inningScores || { home: [], away: [] }),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, isHit ? `hit-${kind}` : 'out', logDesc)],
      }
    }, `Acao de bastao: ${kind}`)
    haptic(isHit ? ImpactStyle.Light : ImpactStyle.Medium)

    if (isHit) setAnimatedBall({ visible: false, x: 50, y: 87 })

    try {
      const endedAsOut = kind === 'strikeout' || kind === 'out'
      const isHitKind = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'homerun'
      const isHomeRun = kind === 'homerun'

      const hitPreview = isHitKind
        ? applyHitToBases(gameState.runners || { first: false, second: false, third: false }, kind)
        : null
      const runsOnHit = hitPreview?.runs || 0
      const rbiCredit = runsOnHit
      const batterRuns = isHomeRun ? 1 : 0

      const found = await gameStatsApi.listByGame(gameState.currentGameId, batterId)
      const current = found.data?.[0]
      const patch = {
        hitting: {
          atBats:    safeNumber(current?.hitting?.atBats)    + 1,
          hits:      safeNumber(current?.hitting?.hits)      + (isHitKind ? 1 : 0),
          doubles:   safeNumber(current?.hitting?.doubles)   + (kind === 'double'  ? 1 : 0),
          triples:   safeNumber(current?.hitting?.triples)   + (kind === 'triple'  ? 1 : 0),
          homeRuns:  safeNumber(current?.hitting?.homeRuns)  + (isHomeRun ? 1 : 0),
          strikeouts:safeNumber(current?.hitting?.strikeouts)+ (kind === 'strikeout' ? 1 : 0),
          outs:      safeNumber(current?.hitting?.outs)      + (endedAsOut ? 1 : 0),
          rbi:       safeNumber(current?.hitting?.rbi)       + rbiCredit,
          runs:      safeNumber(current?.hitting?.runs)      + batterRuns,
        },
      }
      await upsertCurrentBatterStats(batterId, patch)
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.battingOrder, gameState.currentBatterIndex, gameState.currentGameId, gameState.isAttacking, onUpdateGameState, upsertCurrentBatterStats, setAnimatedBall, gameState.runners, playersById])

  const applyDefensiveHit = useCallback(async (kind) => {
    if (gameState.isAttacking) return
    if (!gameState.currentPitcherId) {
      showInvalidAction('Selecione o arremessador antes de registrar o evento')
      return
    }
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    await captureUndoSnapshot()

    let runsScored = 0

    const preHitResult = applyHitToBases(gameState.runners || { first: false, second: false, third: false }, kind)
    const preRunsScored = preHitResult.runs

    const isHit = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'homerun'
    if (isHit) {
      const preview = preHitResult
      const bases = preview.bases || 1
      const destName = bases >= 4 ? 'C' : bases === 3 ? '3B' : bases === 2 ? '2B' : '1B'
      const homePos = getDefaultFieldPosition('C')
      const destPos = getDefaultFieldPosition(destName)

      setAnimatedBall({ visible: true, x: homePos.x, y: homePos.y })
      await new Promise((r) => setTimeout(r, 40))
      setAnimatedBall({ visible: true, x: destPos.x, y: destPos.y })
      await new Promise((r) => setTimeout(r, 480))
    }

    onUpdateGameState((current) => {
      if (current.isAttacking) return current

      const hitResult = applyHitToBases(current.runners || { first: false, second: false, third: false }, kind)
      runsScored = hitResult.runs

      const logDesc = `${oppBatterLabel(current)}: ${HIT_LABELS[kind] || kind}${hitResult.runs > 0 ? ` (+${hitResult.runs})` : ''}`

      return {
        ...current,
        balls: 0,
        strikes: 0,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: incrementPitcherCount(current),
        runners: hitResult.nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? hitResult.runs : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? hitResult.runs : 0),
        inningScores: hitResult.runs > 0 ? addInningRuns(current.inningScores, current.inning, current.isAttacking ? hitResult.runs : 0, current.isAttacking ? 0 : hitResult.runs) : (current.inningScores || { home: [], away: [] }),
        ...updateOppBatter(current, kind === 'homerun' ? 'homerun' : 'hit'),
        ...advanceOpponentLineup(current),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, `def-hit-${kind}`, logDesc)],
      }
    }, `Hit do adversario: ${kind}`)

    if (isHit) setAnimatedBall({ visible: false, x: 50, y: 87 })

    try {
      await syncDefensivePitcherEvent({
        pitchCountDelta: 1,
        earnedRunsDelta: preRunsScored,
        hitsAllowedDelta: 1,
      })
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.currentPitcherId, onUpdateGameState, syncDefensivePitcherEvent, setAnimatedBall, gameState.runners, showInvalidAction])

  const applyAttackCountAction = useCallback(async (kind) => {
    if (!gameState.isAttacking) return
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    await captureUndoSnapshot()

    const preStrikes = Number(gameState.strikes || 0)
    const preBalls = Number(gameState.balls || 0)
    const preNextStrikes = kind === 'strike' ? preStrikes + 1 : kind === 'foul' ? Math.min(2, preStrikes + 1) : preStrikes
    const preNextBalls = kind === 'ball' ? preBalls + 1 : preBalls
    const didStrikeout = preNextStrikes >= 3
    const didWalk = !didStrikeout && preNextBalls >= 4

    const preOrder = gameState.battingOrder || []
    const preBatterIndex = Math.min(gameState.currentBatterIndex || 0, Math.max(0, preOrder.length - 1))
    const batterId = preOrder[preBatterIndex] || null

    let preScoredRuns = 0
    if (didWalk) {
      const preRunners = { ...(gameState.runners || { first: false, second: false, third: false }) }
      preScoredRuns = forceAdvanceToFirst(preRunners).runs
    }

    onUpdateGameState((current) => {
      if (!current.isAttacking) return current

      const beforeStrikes = Number(current.strikes || 0)
      const beforeBalls = Number(current.balls || 0)
      const nextStrikesRaw = kind === 'strike'
        ? beforeStrikes + 1
        : kind === 'foul'
          ? Math.min(2, beforeStrikes + 1)
          : beforeStrikes
      const nextBallsRaw = kind === 'ball' ? beforeBalls + 1 : beforeBalls

      const cDidStrikeout = nextStrikesRaw >= 3
      const cDidWalk = !cDidStrikeout && nextBallsRaw >= 4
      const order = current.battingOrder || []

      let nextOuts = Number(current.outs || 0)
      let nextInning = Number(current.inning || 1)
      let nextHalf = current.inningHalf || 'top'
      let nextIsAttacking = current.isAttacking
      let nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      let scoredRuns = 0

      if (cDidStrikeout) {
        nextOuts += 1

        if (nextOuts >= 3) {
          nextOuts = 0
          nextIsAttacking = false
          nextHalf = current.inningHalf === 'top' ? 'bottom' : 'top'
          if (current.inningHalf === 'bottom') nextInning = Math.max(1, nextInning + 1)
          nextRunners = { first: false, second: false, third: false }
        }
      }

      if (cDidWalk) {
        const walkBatterId = order[Math.min(current.currentBatterIndex || 0, order.length - 1)]
        const forced = forceAdvanceToFirst(nextRunners, walkBatterId)
        nextRunners = forced.nextRunners
        scoredRuns = forced.runs
      }

      const shouldAdvanceBatter = order.length > 0 && (cDidStrikeout || cDidWalk)
      const nextBatterIndex = shouldAdvanceBatter
        ? getNextBatterIndexFromState(current)
        : Number(current.currentBatterIndex || 0)

      const logEntries = current.gameLog || []
      let newLog = logEntries
      if (cDidStrikeout || cDidWalk) {
        const batterIdx = Math.min(current.currentBatterIndex || 0, Math.max(0, order.length - 1))
        const batterName = playersById[order[batterIdx]]?.name || '?'
        const logDesc = cDidStrikeout ? `${batterName}: K` : `${batterName}: BB (base por bolas)`
        newLog = [...logEntries, makeLogEntry(current, cDidStrikeout ? 'out' : 'walk', logDesc)]
      }

      return {
        ...current,
        opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
        strikes: cDidStrikeout || cDidWalk ? 0 : nextStrikesRaw,
        balls: cDidStrikeout || cDidWalk ? 0 : nextBallsRaw,
        currentBatterIndex: nextBatterIndex,
        outs: nextOuts,
        inning: nextInning,
        inningHalf: nextHalf,
        isAttacking: nextIsAttacking,
        runners: nextRunners,
        homeScore: Number(current.homeScore || 0) + scoredRuns,
        awayScore: Number(current.awayScore || 0),
        inningScores: scoredRuns > 0 ? addInningRuns(current.inningScores, current.inning, scoredRuns, 0) : (current.inningScores || { home: [], away: [] }),
        gameLog: newLog,
      }
    }, `Contagem no ataque: ${kind}`)
    haptic(didStrikeout ? ImpactStyle.Medium : ImpactStyle.Light)

    if ((didStrikeout || didWalk) && batterId && gameState.currentGameId) {
      try {
        const found = await gameStatsApi.listByGame(gameState.currentGameId, batterId)
        const cur = found.data?.[0]
        await upsertCurrentBatterStats(batterId, {
          hitting: {
            atBats: safeNumber(cur?.hitting?.atBats) + (didStrikeout ? 1 : 0),
            hits: safeNumber(cur?.hitting?.hits),
            strikeouts: safeNumber(cur?.hitting?.strikeouts) + (didStrikeout ? 1 : 0),
            outs: safeNumber(cur?.hitting?.outs) + (didStrikeout ? 1 : 0),
            walks: safeNumber(cur?.hitting?.walks) + (didWalk ? 1 : 0),
            rbi: safeNumber(cur?.hitting?.rbi) + (didWalk ? preScoredRuns : 0),
          },
        })
      } catch {
        // Mantem fluxo local mesmo sem backend.
      }
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.strikes, gameState.balls, gameState.battingOrder, gameState.currentBatterIndex, gameState.currentGameId, gameState.runners, onUpdateGameState, upsertCurrentBatterStats, playersById])

  const applyDefensiveOutEvent = useCallback(async (outType = 'out', fielderId = '') => {
    if (gameState.isAttacking) return
    if (!gameState.currentPitcherId) {
      showInvalidAction('Selecione o arremessador antes de registrar o evento')
      return
    }
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    window.setTimeout(() => { isProcessingRef.current = false }, 700)

    await captureUndoSnapshot()

    onUpdateGameState((current) => {
      if (current.isAttacking) return current

      const { nextOuts: nextOutsRaw, sideSwitch, nextHalf, nextInning } = computeInningTransition(current)

      const outLabel = outType === 'strikeout' ? 'K' : outType === 'flyout' ? 'FO' : outType === 'groundout' ? 'GO' : outType === 'lineout' ? 'LO' : 'Out'
      const logDesc = `${oppBatterLabel(current)}: ${outLabel}`

      return {
        ...current,
        outs: sideSwitch ? 0 : nextOutsRaw,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: incrementPitcherCount(current),
        balls: 0,
        strikes: 0,
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: nextInning,
        runners: sideSwitch ? { first: false, second: false, third: false } : current.runners,
        ...updateOppBatter(current, outType === 'strikeout' ? 'strikeout' : 'out'),
        ...advanceOpponentLineup(current),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, 'def-out', logDesc)],
      }
    }, `Out defensivo: ${outType}`)
    haptic(ImpactStyle.Medium)

    try {
      await syncDefensivePitcherEvent({
        outsDelta: 1,
        pitchCountDelta: 1,
        strikeoutsDelta: outType === 'strikeout' ? 1 : 0,
      })

      if (fielderId && outType !== 'strikeout') {
        const found = await gameStatsApi.listByGame(gameState.currentGameId, fielderId)
        const cur = found.data?.[0]
        await upsertPlayerStat(fielderId, {
          defense: {
            errors: safeNumber(cur?.defense?.errors),
            doublePlays: safeNumber(cur?.defense?.doublePlays),
            flyOuts: safeNumber(cur?.defense?.flyOuts) + (outType === 'flyout' ? 1 : 0),
            groundOuts: safeNumber(cur?.defense?.groundOuts) + (outType === 'groundout' ? 1 : 0),
            lineOuts: safeNumber(cur?.defense?.lineOuts) + (outType === 'lineout' ? 1 : 0),
          },
        })
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.currentPitcherId, gameState.currentGameId, onUpdateGameState, syncDefensivePitcherEvent, upsertPlayerStat, showInvalidAction])

  const applyDoublePlayWithRunner = useCallback(async (runnerBase, defenderIds = []) => {
    if (!runnerBase) return

    await captureUndoSnapshot()

    const defenderLabel = defenderIds.length
      ? defenderIds
        .map((id) => playersById[id])
        .filter(Boolean)
        .map((player) => getMainPosition(player))
        .join(' -> ')
      : ''
    const defenderText = defenderLabel ? ` | defesa: ${defenderLabel}` : ''

    onUpdateGameState((current) => {
      const hasRunner = Boolean(current.runners?.[runnerBase])
      if (!hasRunner) return current

      const nextRunners = { ...(current.runners || { first: false, second: false, third: false }), [runnerBase]: false }
      const { nextOuts: nextOutsRaw, sideSwitch, nextHalf, nextInning } = computeInningTransition(current, 2)

      const dpSide = current.isAttacking ? 'Nós' : oppBatterLabel(current)
      const logDesc = `${dpSide}: Double Play em ${runnerBase}${defenderText ? ` (${defenderText})` : ''}`

      return {
        ...current,
        ...(current.isAttacking
          ? { opponentPitchCount: Number(current.opponentPitchCount || 0) + 1 }
          : { ourPitchCount: Number(current.ourPitchCount || 0) + 1, pitchCounts: incrementPitcherCount(current) }),
        outs: sideSwitch ? 0 : nextOutsRaw,
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: nextInning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
        ...(!current.isAttacking ? advanceOpponentLineup(current) : {}),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, 'double-play', logDesc)],
      }
    }, `Double play em ${runnerBase}${defenderText}`)
    haptic(ImpactStyle.Medium)

    try {
      if (!gameState.isAttacking) {
        await syncDefensivePitcherEvent({ outsDelta: 2, pitchCountDelta: 1 })

        for (const defenderId of defenderIds) {
          const found = await gameStatsApi.listByGame(gameState.currentGameId, defenderId)
          const current = found.data?.[0]
          await upsertPlayerStat(defenderId, {
            defense: {
              errors: safeNumber(current?.defense?.errors),
              doublePlays: safeNumber(current?.defense?.doublePlays) + 1,
              flyOuts: safeNumber(current?.defense?.flyOuts),
              groundOuts: safeNumber(current?.defense?.groundOuts),
              lineOuts: safeNumber(current?.defense?.lineOuts),
            },
          })
        }
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.currentGameId, onUpdateGameState, syncDefensivePitcherEvent, upsertPlayerStat, playersById])

  const applySacFly = useCallback(async () => {
    if (!gameState.runners?.third) {
      showInvalidAction('Nenhum corredor na terceira base para sac fly')
      return
    }

    await captureUndoSnapshot()

    let runScored = 0
    const preRunScored = 1

    onUpdateGameState((current) => {
      const hadRunnerOnThird = Boolean(current.runners?.third)
      const { nextOuts: nextOutsRaw, sideSwitch, nextHalf, nextInning } = computeInningTransition(current)

      const nextRunners = { ...(current.runners || { first: false, second: false, third: false }) }
      if (hadRunnerOnThird) {
        nextRunners.third = false
        runScored = 1
      }

      const sfOrder = current.battingOrder || []
      const sfIdx = Math.min(current.currentBatterIndex || 0, Math.max(0, sfOrder.length - 1))
      const sfWho = current.isAttacking
        ? (playersById[sfOrder[sfIdx]]?.name || '?')
        : oppBatterLabel(current)
      const sfLogDesc = `${sfWho}: Sac Fly${runScored > 0 ? ' (+1)' : ''}`

      return {
        ...current,
        ...(current.isAttacking
          ? { opponentPitchCount: Number(current.opponentPitchCount || 0) + 1 }
          : { ourPitchCount: Number(current.ourPitchCount || 0) + 1, pitchCounts: incrementPitcherCount(current) }),
        outs: sideSwitch ? 0 : nextOutsRaw,
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        isAttacking: sideSwitch ? !current.isAttacking : current.isAttacking,
        inningHalf: nextHalf,
        inning: nextInning,
        runners: sideSwitch ? { first: false, second: false, third: false } : nextRunners,
        homeScore: (current.homeScore || 0) + (current.isAttacking ? runScored : 0),
        awayScore: (current.awayScore || 0) + (!current.isAttacking ? runScored : 0),
        inningScores: runScored > 0 ? addInningRuns(current.inningScores, current.inning, current.isAttacking ? runScored : 0, current.isAttacking ? 0 : runScored) : (current.inningScores || { home: [], away: [] }),
        ...(!current.isAttacking ? updateOppBatter(current, 'sacfly') : {}),
        ...(!current.isAttacking ? advanceOpponentLineup(current) : {}),
        gameLog: [...(current.gameLog || []), makeLogEntry(current, 'sac-fly', sfLogDesc)],
      }
    }, 'Sac fly')
    haptic(ImpactStyle.Medium)

    try {
      if (!gameState.isAttacking) {
        await syncDefensivePitcherEvent({ outsDelta: 1, earnedRunsDelta: preRunScored, pitchCountDelta: 1 })
      } else {
        const order = gameState.battingOrder || []
        const batterIndex = Math.min(gameState.currentBatterIndex || 0, order.length - 1)
        const batterId = order[batterIndex]
        if (batterId && gameState.currentGameId) {
          const found = await gameStatsApi.listByGame(gameState.currentGameId, batterId)
          const cur = found.data?.[0]
          await upsertCurrentBatterStats(batterId, {
            hitting: {
              atBats:    safeNumber(cur?.hitting?.atBats),
              hits:      safeNumber(cur?.hitting?.hits),
              strikeouts:safeNumber(cur?.hitting?.strikeouts),
              outs:      safeNumber(cur?.hitting?.outs),
              walks:     safeNumber(cur?.hitting?.walks),
              runs:      safeNumber(cur?.hitting?.runs),
              rbi:       safeNumber(cur?.hitting?.rbi) + preRunScored,
              homeRuns:  safeNumber(cur?.hitting?.homeRuns),
            },
          })
        }
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.runners, gameState.battingOrder, gameState.currentBatterIndex, gameState.currentGameId, onUpdateGameState, syncDefensivePitcherEvent, upsertCurrentBatterStats, showInvalidAction, playersById])

  const applyHBP = useCallback(async () => {
    await captureUndoSnapshot()

    onUpdateGameState((current) => {
      const hbpOrder = current.battingOrder || []
      const hbpIdx = Math.min(current.currentBatterIndex || 0, Math.max(0, hbpOrder.length - 1))
      const hbpBatterId = hbpOrder[hbpIdx]
      const forced = forceAdvanceToFirst(current.runners || { first: false, second: false, third: false }, current.isAttacking ? hbpBatterId : null)

      const ourR = current.isAttacking ? forced.runs : 0
      const theirR = current.isAttacking ? 0 : forced.runs

      const hbpWho = current.isAttacking
        ? (playersById[hbpOrder[hbpIdx]]?.name || '?')
        : oppBatterLabel(current)
      const hbpLogEntry = makeLogEntry(current, 'hbp', `${hbpWho}: HBP`)

      if (current.isAttacking) {
        return {
          ...current,
          opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
          balls: 0,
          strikes: 0,
          currentBatterIndex: getNextBatterIndexFromState(current),
          runners: forced.nextRunners,
          homeScore: (current.homeScore || 0) + ourR,
          awayScore: (current.awayScore || 0) + theirR,
          inningScores: forced.runs > 0 ? addInningRuns(current.inningScores, current.inning, ourR, theirR) : (current.inningScores || { home: [], away: [] }),
          gameLog: [...(current.gameLog || []), hbpLogEntry],
        }
      }

      return {
        ...current,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: incrementPitcherCount(current),
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        runners: forced.nextRunners,
        homeScore: (current.homeScore || 0) + ourR,
        awayScore: (current.awayScore || 0) + theirR,
        inningScores: forced.runs > 0 ? addInningRuns(current.inningScores, current.inning, ourR, theirR) : (current.inningScores || { home: [], away: [] }),
        ...advanceOpponentLineup(current),
        gameLog: [...(current.gameLog || []), hbpLogEntry],
      }
    }, 'HBP')

    try {
      if (!gameState.isAttacking) {
        await syncDefensivePitcherEvent({ pitchCountDelta: 1 })
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, onUpdateGameState, syncDefensivePitcherEvent, playersById])

  const applyErrorEvent = useCallback(async (defenderId = '') => {
    const errPreOrder = gameState.battingOrder || []
    const errPreIdx = Math.min(gameState.currentBatterIndex || 0, Math.max(0, errPreOrder.length - 1))
    const errBatterId = gameState.isAttacking ? (errPreOrder[errPreIdx] || null) : null

    await captureUndoSnapshot()

    let runsScored = 0

    onUpdateGameState((current) => {
      const advanced = applyRunnerAdvance(current.runners || { first: false, second: false, third: false }, 1)
      const nextRunners = { ...advanced.nextRunners, first: true }
      runsScored = advanced.runs

      const errOurR = current.isAttacking ? advanced.runs : 0
      const errTheirR = current.isAttacking ? 0 : advanced.runs

      const errWho = current.isAttacking ? 'Erro do ADV' : `Erro: ${playersById[defenderId]?.name || 'defensor'}`
      const errLogEntry = makeLogEntry(current, 'error', errWho)

      if (current.isAttacking) {
        return {
          ...current,
          opponentPitchCount: Number(current.opponentPitchCount || 0) + 1,
          balls: 0,
          strikes: 0,
          currentBatterIndex: getNextBatterIndexFromState(current),
          runners: nextRunners,
          homeScore: (current.homeScore || 0) + errOurR,
          awayScore: (current.awayScore || 0) + errTheirR,
          inningScores: advanced.runs > 0 ? addInningRuns(current.inningScores, current.inning, errOurR, errTheirR) : (current.inningScores || { home: [], away: [] }),
          gameLog: [...(current.gameLog || []), errLogEntry],
        }
      }

      return {
        ...current,
        ourPitchCount: Number(current.ourPitchCount || 0) + 1,
        pitchCounts: incrementPitcherCount(current),
        balls: 0,
        strikes: 0,
        currentBatterIndex: getNextBatterIndexFromState(current),
        runners: nextRunners,
        homeScore: (current.homeScore || 0) + errOurR,
        awayScore: (current.awayScore || 0) + errTheirR,
        inningScores: advanced.runs > 0 ? addInningRuns(current.inningScores, current.inning, errOurR, errTheirR) : (current.inningScores || { home: [], away: [] }),
        ...updateOppBatter(current, 'error'),
        ...advanceOpponentLineup(current),
        gameLog: [...(current.gameLog || []), errLogEntry],
      }
    }, defenderId ? `Erro defensivo: ${defenderId}` : 'Erro defensivo')

    try {
      if (!gameState.isAttacking) {
        if (defenderId) {
          const found = await gameStatsApi.listByGame(gameState.currentGameId, defenderId)
          const current = found.data?.[0]
          await upsertPlayerStat(defenderId, {
            defense: {
              errors: safeNumber(current?.defense?.errors) + 1,
              doublePlays: safeNumber(current?.defense?.doublePlays),
              flyOuts: safeNumber(current?.defense?.flyOuts),
              groundOuts: safeNumber(current?.defense?.groundOuts),
              lineOuts: safeNumber(current?.defense?.lineOuts),
            },
          })
        }

        // Runs on errors are unearned — do NOT pass earnedRunsDelta
        await syncDefensivePitcherEvent({ pitchCountDelta: 1 })
      } else if (errBatterId && gameState.currentGameId) {
        const found = await gameStatsApi.listByGame(gameState.currentGameId, errBatterId)
        const cur = found.data?.[0]
        await upsertCurrentBatterStats(errBatterId, {
          hitting: {
            atBats: safeNumber(cur?.hitting?.atBats) + 1,
            hits: safeNumber(cur?.hitting?.hits),
            strikeouts: safeNumber(cur?.hitting?.strikeouts),
            outs: safeNumber(cur?.hitting?.outs),
            walks: safeNumber(cur?.hitting?.walks),
            rbi: safeNumber(cur?.hitting?.rbi),
          },
        })
      }
    } catch {
      // Mantem fluxo local mesmo sem backend.
    }
  }, [captureUndoSnapshot, gameState.isAttacking, gameState.battingOrder, gameState.currentBatterIndex, gameState.currentGameId, onUpdateGameState, syncDefensivePitcherEvent, upsertPlayerStat, upsertCurrentBatterStats, playersById])

  return {
    // state
    undoStack,
    invalidFeedback,
    // helpers
    showInvalidAction,
    captureUndoSnapshot,
    upsertPlayerStat,
    // actions
    handleUndo,
    handleDefensivePitch,
    handlePitcherSelect,
    applyPlateAppearance,
    applyDefensiveHit,
    applyAttackCountAction,
    applyDefensiveOutEvent,
    applyDoublePlayWithRunner,
    applySacFly,
    applyHBP,
    applyErrorEvent,
  }
}
