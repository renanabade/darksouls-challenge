# Plano: Frente 1, verdade do grafo

> Status: proposta. As 4 decisões da seção "Decisões" estão **pendentes de aprovação do Renan**. Não trate nenhuma delas como aprovada.

## Instruções para o agente

- Siga o `CLAUDE.md` do repositório.
- Trabalhe **um PR por vez**, na ordem da seção "Quebra em PRs". Use um branch por PR.
- Use Conventional Commits (o `commitlint.config.js` valida).
- Rode `pnpm test` (vitest), o lint e o typecheck antes de cada commit. Não abra PR com teste vermelho.
- **Não** mude `GENERATOR_VERSION` (`packages/core/src/generator/generate.ts`) nem `dataVersion` (`data/ds1/meta.json`) antes do PR final (PR 10).
- Nenhuma mudança de dado sem fonte. Cada override cita o resultado de verificação (`results-*.md`, no repositório ds1-planning, que é privado) ou um teste feito no jogo.
- Itens marcados como "pendente de teste no jogo" entram como aviso, nunca como bloqueio.

## Objetivo

Nenhuma ordem sorteada pode ser impossível ou sem sentido no jogo real. Hoje o grafo herda aproximações do DSAP e ignora o estado de NPCs e fogueiras. Por isso o gerador ainda sorteia desafios quebrados. Exemplo: "One bonfire: Firelink" depois dos dois sinos.

Critérios de pronto:
- Todo item E termina como Corrigido, Aviso ou Desativado, e cada um tem teste.
- O validador recusa uma ordem cujo alvo é inalcançável na configuração do desafio (classe, presente, Master Key).
- `pointless()` usa `reach()`.
- Fora do escopo: arquétipos, dificuldade contextual e rubrica (frentes 2 a 4).

## Onde corrigir: pipeline ou edição manual

**Recomendação: corrigir no pipeline.** O export do DSAP gera os dados e depois aplica overrides versionados em `data/ds1/overrides/*.json`. A edição manual do JSON gerado fica só como último recurso, e também precisa citar a fonte.

Motivos:
- Atualizar o DSAP não apaga as correções.
- Cada correção carrega sua fonte (flag, evento, linha do script).
- Cada override é testável: se o DSAP renomear uma região, o teste quebra.
- É coerente com o `docs/08` do ds1-planning (privado): na dúvida, valem os arquivos do jogo.

Observação: o repositório público não tem pasta `tools/`. Se o export do DSAP existe só no ds1-planning (privado), o PR 1 versiona esse pipeline aqui. O `meta.json` já lista "Hand corrections checked against the game's event scripts" como fonte.

Formato sugerido de override, uma entrada por correção:

```json
{ "id": "E11", "target": "bonfire:FS: Firelink Shrine Bonfire", "op": "condition",
  "value": { "unavailable": { "from": "both-bells", "until": "lautrec-dead" } },
  "source": "ds1-planning (privado): results-a.md Q1; m10 flags 812/813, 11500200" }
```

`op` aceita `replace`, `add`, `remove` ou `condition`. O pipeline aplica as entradas em ordem e falha se o alvo não existir.

## Status dos itens E

| Item | Assunto | Tratamento | Fonte | Certeza | PR |
|---|---|---|---|---|---|
| E1/E2 | Hydra / cadeia de eventos até a Dusk | Corrigir: condicionar a aresta à cadeia | relatório da rodada 1; ds1-planning (privado) | Alta | 3 |
| E3 | Regra de conforto do DSAP | Remover | relatório da rodada 1 | Alta | 3 |
| E4/E5 | Centipede / Gargoyles | Corrigir: obrigatoriedade por config | relatório da rodada 1 | Média | 4 |
| E6 | Taurus opcional com Master Key | Corrigir: obrigatório por config | `docs/05` do ds1-planning (privado); aresta watchtower-basement | Alta | 4 |
| E7 | Sets do Ornstein/Smough (Domhnall) | Corrigir: exclusivos | relatório da rodada 1 | Alta | 5 |
| E8 | Loja do Logan na Firelink ausente | Corrigir: adicionar região | relatório da rodada 1 | Alta | 5 |
| E9 | Domhnall vai à Firelink depois dos 2 sinos, não do Iron Golem | Corrigir o trigger | results-c.md Q28 (m10_00 Event_11000532, m10_02 Event_11020412; flags 11010700/11400200) | Alta | 5 |
| E10 | Darkmoon Seance Ring nas Catacombs | Nada: dado correto | relatório da rodada 1 | Alta | — |
| E11 | Fogueira da Firelink: Lautrec mata a Anastacia | Desativar já e modelar depois | results-a.md Q1 (flags 812/813, 11500200) | Alta | 2 e 6 |
| E12 | 1ª fogueira de Anor Londo (Knightess) | Desativar já e modelar depois | results-b.md Q13 (m15_01 Event_151) | Alta | 2 e 6 |
| E13 | Quelana: não depende do Laurentius e some se o Bed of Chaos morrer antes | Corrigir | results-b.md Q20; `docs/08` §5 | Alta (+10: média) | 5 |
| E14 | Logan nos Archives sem exigir o Seath | Corrigir | results-c.md Q24 (m17 Event_11700530/11700533) | Média-alta | 5 |
| E15 | Rhea: loja na Parish, morte pelo Petrus, compra de tudo | Corrigir e avisar | results-a.md Q3/Q4 | Média | 5 |
| E16 | Patches (armadilha da Tomb, flag 1624) | Aviso | results-b.md Q22 | Alta, impacto baixo | 7 |
| E17 | Solaire em Lost Izalith | Aviso | results-a.md Q10 | Média | 7 |
| E18 | Kaathe (recusar ou atacar o tira do jogo) | Aviso e conferir a região | results-a.md Q6 | Média | 7 |

Todos os `results-*.md` ficam em `knowledge/reading/verification/` no ds1-planning (privado). Os relatórios das rodadas 1 e 2 também estão lá.

## Passos em ordem

1. **Versionar o pipeline.** Script em `tools/` que exporta do DSAP para `data/ds1/*` e aplica `data/ds1/overrides/`. Teste: exportar sem overrides reproduz o JSON atual byte a byte.
2. **Contenção imediata (E11/E12).** Em `packages/core/src/orders/catalog.ts` e no sorteio (`generator/draw.ts`, `bonfiresByArea`), tirar a fogueira da Firelink e a 1ª de Anor Londo de `one-bonfire` e de `restAtBonfireBut`. `no-bonfire` pode continuar. Use uma lista de exclusão explícita com comentário citando E11/E12.
3. **Hydra e regra de conforto (E1/E2/E3).** Overrides em `data/ds1/entrances.json`. Depois, conferir que `reach()` alcança o Gwyn com todas as classes.
4. **Obrigatoriedade por configuração (E4/E5/E6).** `data/ds1/mandatory.json` deixa de ser uma lista fixa. A obrigatoriedade passa a ser calculada por `reach()` com a config (classe, presente, Master Key): um boss é obrigatório se, sem ele, o objetivo some. Arquivos: `packages/core/src/requirement.ts`, `reach.ts`, `world.ts`.
5. **NPCs e lojas (E7/E8/E9/E13/E14/E15).** Overrides em `entrances.json` e `merchants.json`:
   - Sets do Domhnall exclusivos.
   - Domhnall na Firelink depois dos 2 sinos.
   - Logan com loja na Firelink e loja nos Archives, sem exigir o Seath.
   - Quelana com a Pyromancy Flame, sem o Laurentius, e travada se o Bed of Chaos estiver morto.
   - Rhea com estados Parish e Firelink, e com perda pelo Petrus ou por compra total.
6. **Disponibilidade de fogueira.** Campo `unavailable` em `data/ds1/bonfires.json`, com janelas por milestone:
   - Firelink: dos 2 sinos até a morte do Lautrec.
   - Anor Londo 1: depois de a Gwynevere morrer ou de o Gwyndolin ficar hostil.

   O sorteio filtra por esse campo. A contenção do passo 2 só sai depois que os testes passarem. Atualizar o `docs/03` do ds1-planning (privado), que diz "Conduta = só peso".
7. **Avisos de NPC (E16/E17/E18).** Campo `warnings` na ordem ou na loja, exibido no manual do desafio. Conferir se a loja do Kaathe tem aresta de região.
8. **Validador de alcance.** Em `packages/core/src/validator.ts`, toda ordem com alvo (local, boss, fogueira, loja ou item) passa por `reach()` com a config do desafio. Se o alvo for inalcançável, a ordem é recusada com uma mensagem de erro clara.
9. **`pointless()` via `reach()`.** Em `packages/core/src/generator/generate.ts` (função `pointless`, perto da linha 341), trocar a heurística por uma consulta ao `reach()`. Uma ordem é inútil se o alvo é inalcançável ou se a restrição não muda nada.
10. **Auditoria das arestas de mão única.** Exemplos: a queda para Blighttown, Sen's → Anor Londo e o portal do DLC, que fecha com a flag 17 depois do Manus. Cada aresta vira override ou ganha teste. Uma ordem para voltar a uma área perdida nunca pode ser sorteada.
11. **Bump de versão (só no PR final).** `GENERATOR_VERSION` de "5" para "6" e `dataVersion` de 0.6.0 para 0.7.0. Os dois entram na seed do RNG, então os desafios antigos mudam. Registrar no CHANGELOG.

## Testes de regressão

- Snapshot da seed `ashen-one` e de cerca de 20 seeds fixas por classe e presente, antes e depois. Todo diff precisa ser explicado por algum item E.
- Propriedade: em 1000 seeds, toda ordem passa no validador de alcance.
- E11: com os 2 sinos tocados e o Lautrec vivo, `one-bonfire` nunca sorteia a Firelink.
- E12: com a Gwynevere morta, a 1ª fogueira de Anor Londo é inválida.
- E13: com Pyromancer, a Quelana é alcançável sem o Laurentius e inalcançável se o Bed of Chaos morreu antes.
- E6: com Thief ou com o presente Master Key, o Taurus não é obrigatório. Com as outras classes, é.
- E14/E8: a loja do Logan nos Archives é alcançável antes do Seath, e a loja dele na Firelink existe.
- E9/E7: o Domhnall só aparece na Firelink depois dos 2 sinos, e os sets dele são exclusivos.
- Overrides: cada entrada tem um teste de que o alvo existe.

## Quebra em PRs

| # | Título (Conventional Commits) | Conteúdo |
|---|---|---|
| 1 | `build(data): versionar export do DSAP com overrides` | Passo 1, sem mudar o dado |
| 2 | `fix(orders): desativar one-bonfire na Firelink e em Anor Londo` | Passo 2 (contenção) |
| 3 | `fix(data): cadeia da Hydra e remoção da regra de conforto` | E1/E2/E3 |
| 4 | `feat(core): obrigatoriedade de boss por configuração` | E4/E5/E6 |
| 5 | `fix(data): gatilhos e lojas de NPC conforme os scripts` | E7/E8/E9/E13/E14/E15 (pode ser dividido por NPC) |
| 6 | `feat(core): disponibilidade de fogueira por estado` | Passo 6; reverte a contenção do PR 2 |
| 7 | `feat(generator): avisos de NPC no manual` | E16/E17/E18 |
| 8 | `feat(core): validador de alcance e pointless via reach` | Passos 8 e 9 |
| 9 | `test(data): auditoria das arestas de mão única` | Passo 10 |
| 10 | `chore(release): GENERATOR_VERSION 6 e dataVersion 0.7.0` | Passo 11, sempre por último |

## ADR 0011 (proposta)

**Título:** O grafo de dados é o export do DSAP mais overrides que citam o jogo.

**Contexto:** O DSAP é uma aproximação feita para randomizer. Ele não modela estado de NPC nem de fogueira e inclui regras de conforto. A verificação nos scripts do jogo (ds1-planning, privado) contradiz o DSAP em vários pontos.

**Decisão:**
- Os dados são gerados pelo export mais overrides versionados.
- Override sem fonte (script ou teste no jogo) não entra.
- Estado de fogueira ou de NPC vira condição no grafo quando afeta o alcance. Quando afeta só a conduta, vira aviso.

**Consequências:**
- Os desafios antigos mudam por causa do bump de versão.
- O ADR 0003 (gerador estático) ganha uma regra: toda ordem precisa ser alcançável.

## Riscos

- **Explosão de estados no `reach()`.** Mitigação: só vira estado o que muda o alcance; o resto vira aviso.
- **Seeds compartilhadas quebram com o bump.** Mitigação: registrar no CHANGELOG e talvez manter o gerador v5 (decisão 3).
- **Override órfão quando o DSAP renomear uma região.** Mitigação: o teste de alvo existente.
- **Itens de certeza média (E4/E5, E15, Quelana +10) podem introduzir erro.** Mitigação: entram como aviso até o teste no jogo.
- **O PR 6 contradiz "Conduta = só peso"** (`docs/03`, ds1-planning, privado). Mitigação: atualizar o doc junto.

## Pendente de teste no jogo

1. A Quelana aparece com a Pyromancy Flame abaixo de +10?
2. As outras 3 fogueiras de Anor Londo (Sunlight Altar, Darkmoon Tomb, Chamber of the Princess) dependem da Knightess?
3. Rhea: a janela de 2 bosses para o Petrus matá-la conta a partir da chegada dela na Parish?
4. Kaathe: a loja existe no grafo, e recusar a oferta dele remove a loja na hora?

## Decisões (pendentes de aprovação do Renan)

1. Usar pipeline com overrides em vez de editar o JSON na mão. **Pendente de aprovação do Renan.**
2. Contenção já: tirar a Firelink e a 1ª fogueira de Anor Londo de `one-bonfire` até o PR 6. **Pendente de aprovação do Renan.**
3. Fazer um bump único no fim (v6 / 0.7.0), sem manter o gerador v5 em paralelo. **Pendente de aprovação do Renan.**
4. E15–E18 e a exigência de +10 da Quelana entram como aviso, não como bloqueio, até o teste no jogo. **Pendente de aprovação do Renan.**
