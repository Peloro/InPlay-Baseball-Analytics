# Glossário — InPlay

Definições de todos os termos técnicos e de domínio usados no projeto. Termos aparecem em inglês quando correspondem exatamente ao código-fonte, com tradução/explicação em português.

---

## Termos de Beisebol

| Termo | Sigla | Definição |
|-------|-------|-----------|
| At-Bat | AB | Turno oficial de rebatida que conta para cálculo de AVG. Não inclui BB, HBP, SF. |
| Plate Appearance | PA | Toda apresentação ao prato, incluindo AB + BB + HBP + SF. Denominador de K% e BB%. |
| Hit | H | Rebatida que resulta em base segura sem erro defensivo. |
| Single | — | Rebatida simples; rebatedor chega à 1ª base. |
| Double | 2B | Rebatida dupla; rebatedor chega à 2ª base. |
| Triple | 3B | Rebatida tripla; rebatedor chega à 3ª base. |
| Home Run | HR | Bola rebatida para fora do campo; todos os corredores em base marcam. |
| Strikeout | SO / K | 3 strikes; rebatedor é eliminado. |
| Walk | BB | 4 balls; rebatedor vai para 1ª base por bolas. |
| Hit by Pitch | HBP | Rebatedor é atingido pelo arremesso; avança para 1ª base. |
| Sacrifice Fly | SF | Bola de fly sacrificial: bola pega em fly com corredor em 3ª; corredor marca, rebatedor elimina-se (não conta como AB). |
| Stolen Base | SB | Corredor avança uma base durante o arremesso sem acerto. |
| Caught Stealing | CS | Corredor tentou roubar base mas foi eliminado. |
| Run | R | Ponto marcado por um corredor. |
| RBI | RBI | Runs Batted In — pontos impulsionados pelo rebatedor. |
| Out | OUT | Eliminação de um jogador da equipe atacante. 3 outs encerram o half-inning. |
| Double Play | DP | Jogada em que 2 outs são registrados na mesma ação. |
| Error | E | Falha defensiva que permite ao bateador/corredor avançar. Runs decorrentes de erros são inearneds. |
| Wild Pitch | WP | Arremesso incontrolável que permite a corredores avançarem. |
| Earned Run | ER | Ponto marcado sem erro defensivo na jogada. |
| Inning | — | Unidade do jogo; cada equipe tem 3 outs por half-inning. |
| Top (▲) | — | Primeira metade do inning; o time visitante (adversário) bate. |
| Bottom (▼) | — | Segunda metade do inning; o time da casa (NÓS) bate. |
| Inning Half | — | Top ou Bottom; `inningHalf` no gameState. |
| Side Switch | — | Quando os 3 outs são atingidos e os times trocam de papel (ataque ↔ defesa). |
| Pitch Count | PC | Total de arremessos lançados por um arremessador. |
| Innings Pitched | IP | Innings arremessados. Exibição: `outsPitched/3`.`outsPitched%3` (ex: 7 outs → "2.1"). |
| Outs Pitched | — | Quantidade bruta de outs obtidos pelo arremessador. Source of truth para IP e ERA. |
| ERA | ERA | Earned Run Average: (ER × 27) / outsPitched — taxa de pontos ganhos por 9 innings. |
| WHIP | WHIP | Walks + Hits per Inning Pitched: (BB + H) / (outsPitched / 3). |
| K/9 | K/9 | Strikeouts por 9 innings: (SO × 9) / (outsPitched / 3). |
| AVG | AVG | Batting Average: H / AB. |
| OBP | OBP | On-Base Percentage: (H + BB + HBP) / (AB + BB + HBP + SF). |
| SLG | SLG | Slugging Percentage: (H + 2B + 2×3B + 3×HR) / AB. |
| OPS | OPS | On-Base Plus Slugging: OBP + SLG. |
| K% | K% | Strikeout percentage: SO / PA × 100. |
| BB% | BB% | Walk percentage: BB / PA × 100. |
| Box Score | — | Tabela de placar por inning. Ex: `home: [0,1,3,0,...]`. |
| Lineup | — | Escalação titular: 9 jogadores + posições. |
| Batting Order | — | Ordem de rebatida: sequência dos 9 rebatedores. |
| Bench | — | Reservas; jogadores não na escalação titular. |
| Substitution | Sub | Troca de jogador durante o jogo. |
| Pitcher Repertoire | — | Tipos de arremesso dominados por um arremessador. |
| Walkoff | — | Vitória na última rebatida do jogo (bottom do último inning). |

---

## Termos Técnicos do Projeto

| Termo | Definição |
|-------|-----------|
| `gameState` | Objeto React que representa todo o estado em tempo real da partida. Persistido em localStorage. |
| `isAttacking` | `true` quando nosso time está rebatendo (atacando). `false` quando estamos arremessando (defendendo). |
| `homeScore` | Total de pontos do nosso time (sempre "home" na exibição). |
| `awayScore` | Total de pontos do adversário (sempre "away" na exibição). |
| `ourPitchCount` | Total de arremessos lançados pelo nosso arremessador atual. |
| `opponentPitchCount` | Total de arremessos lançados pelo arremessador adversário. |
| `pitchCounts` | Mapa `{pitcherId: number}` — contagem individual por arremessador. |
| `outsPitched` | Outs obtidos pelo arremessador. Source of truth para IP/ERA. Nunca somar `inningsPitched` diretamente. |
| `inningsPitched` | Valor de exibição derivado: `floor(outs/3) + (outs%3)/10`. Ex: 7 outs → 2.1 (dois e um terço). |
| `Local-first` | Estratégia de dados: escreve em localStorage primeiro; sync com backend é background opcional. |
| `syncQueue` | Fila de writes pendentes a serem enviados ao servidor quando online. |
| `upsert` | Operação que cria o registro se não existir ou atualiza se já existir. Usa chave composta (gameId, playerId). |
| `teamId` | Identificador da equipe; prefixo de todas as chaves localStorage e escopo de todos os dados no backend. |
| `preGameConfigured` | Flag que indica se lineup e batting order foram configurados para a partida. |
| `gameLog` | Array de eventos da partida para play-by-play (log de jogadas). |
| `substitutions` | Array de substituições registradas durante a partida. |
| `opposingBatters` | Mapa de estatísticas dos rebatedores adversários, indexado pelo número do jogador. |
| `opponentLineup` | Array de 9 posições registrando a ordem de rebatida do adversário conforme descoberta. |
| `statsRefreshKey` | Inteiro incrementado após cada escrita de stats; força re-fetch do HUD ao vivo. |
| `undoStack` | Pilha de até 80 snapshots de estado + stats para suporte a desfazer ações. |
| Role `coach` | Papel padrão de usuário; acesso total às funcionalidades de jogo. |
| Role `admin` | Administrador do sistema; só vê a aba Admin, sem acesso a jogos. |
| Status `pending` | Usuário registrado aguardando aprovação do admin. |
| Status `active` | Usuário aprovado e ativo. |
| `billingStatus` | Status de cobrança do time: `trial`, `paid`, `unpaid`. |
| Capacitor | Framework que transforma o app React em APK Android. |
| InPlay | Nome oficial do app. Branding: paleta indigo, tagline "Baseball Analytics". |

---

## Posições de Campo

| Código | Posição |
|--------|---------|
| P | Pitcher (Arremessador) |
| C | Catcher (Receptor) |
| 1B | First Baseman (1ª Base) |
| 2B | Second Baseman (2ª Base) |
| 3B | Third Baseman (3ª Base) |
| SS | Shortstop (Parador de Curta) |
| LF | Left Fielder (Esquerda) |
| CF | Center Fielder (Centro) |
| RF | Right Fielder (Direita) |
| DH | Designated Hitter (Rebatedor Designado) — não ocupa posição defensiva |

---

## Tipos de Arremesso

| Sigla | Nome |
|-------|------|
| FB | Fastball |
| CV | Curveball |
| SL | Slider |
| CH | Changeup |
| SI | Sinker |
| CT | Cutter |
| other | Outros |
