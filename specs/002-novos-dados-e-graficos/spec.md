# Especificação de feature: novos dados e gráficos

**Branch da feature**: `002-novos-dados-e-graficos`
**Criada em**: 2026-11-14
**Status**: Rascunho (fase `/speckit.specify`; falta `/speckit.clarify` e `/speckit.plan`)
**Entrada**: "Verificar, no site atual e na nova UI planejada (artefato *Jangada Orbital — nova UI*), se há outros dados
que podemos rastrear e apresentar, se falta algum gráfico, e sugerir novos dados e formas de mostrá-los que combinem com
o projeto."

> Formato do GitHub spec-kit (`spec-template.md`): histórias de usuário priorizadas e testáveis de forma independente,
> requisitos funcionais (FR), critérios de sucesso mensuráveis (SC), entidades, casos de borda e no máximo três marcas
> `[NEEDS CLARIFICATION]`. A numeração continua a da spec 001 (último critério citado: SC-003; última tarefa: T048).

---

## Diagnóstico: o que existe, o que a nova UI promete, o que o pipeline já tem e não mostra

### Telas de hoje (site em `web/`) e da nova UI (artefato)

| Vista | Site atual | Nova UI (PC e celular) |
|---|---|---|
| Calendário mês × ano | sim | sim, com marca de anomalia (> p90) e mês em andamento hachurado |
| 2026 até agora (acumulado contra mediana e faixa p10–p90) | sim (T047) | sim |
| Ritmo da temporada (10 %, 50 %, 90 %) | sim (T040) | sim |
| Densidade por 1.000 km² | sim (T048) | sim, na caixa "About this area" |
| Explicador da harmonização (Aqua × S-NPP × harmonizado) | sim, página Method (T038) | não aparece nos boards |
| Camada "Detections, last 7 days" + toque numa chama | **não** | sim (boards *Phone-Cluster* e *Main*) |
| Marca "More than usual for this place and month" no mapa | **não** | sim (legenda do mapa) |
| Valor de um foco "As Aqua-MODIS 1.4 detections" | **não** | sim (cartão do foco) |

### Dados que o pipeline já calcula e o app não mostra

| Dado | Onde está | Situação |
|---|---|---|
| `lo` / `hi` (incerteza P25–P75 da conversão) | `harmonized.parquet`, `series.json` | só sai no CSV; **nenhum gráfico mostra a incerteza** |
| `n_day` (detecções diurnas) | `cell_month.parquet` | não exportado para a web |
| `frp_sum` (potência radiativa do fogo, MW) | `cell_month.parquet`, `brazil_month.csv` | não exportado para a web |
| `acq_time` (hora da passagem) | `data/interim/points/` | usado só implicitamente; é a prova da deriva de órbita de Aqua/Terra citada no METHOD |
| Classe de confiança (low/nominal/high) | pontos normalizados | `low` descartado; a proporção nunca é mostrada |
| Observado por satélite (Terra, Aqua, S-NPP, NOAA-20, NOAA-21) | `series.json` | só aparece no explicador e no CSV |

### Lacunas de gráfico

1. **Série temporal com incerteza.** O calendário mostra cor, não magnitude nem erro. Falta um gráfico de totais anuais (ou
   mensais) com a faixa `lo`–`hi`, que é o que um avaliador do desafio de harmonização vai procurar primeiro.
2. **Mapa analítico.** O mapa só serve para escolher área. Falta uma camada que responda "onde queima mais, ou mais do que
   o normal", que é o uso natural de um mapa de focos.
3. **Comparação entre regiões.** Não há ranking de estados ou municípios, nem forma de comparar duas áreas.
4. **Intensidade e horário do fogo.** O app conta focos, mas ignora o quão forte (FRP) e quando (dia/noite) eles queimam.
5. **Prova visual do método.** A deriva de órbita de Aqua/Terra e a concordância entre os três VIIRS estão só em texto e
   tabela no METHOD.

---

## Cenários de usuário e testes *(obrigatório)*

### História 1: ver o total de cada ano com sua incerteza (Prioridade: P1)

Quem estuda uma área quer saber se 2024 foi de fato maior que 2010, e com que margem, sem ler o CSV.
Um gráfico de barras dos totais anuais da área, com a faixa `lo`–`hi` sobre os anos convertidos (Terra 2000–2002, VIIRS
a partir de 2024) e sem faixa nos anos observados de Aqua, mostra magnitude, tendência e o efeito da harmonização juntos.

**Por que esta prioridade**: usa dados já exportados (`series.json` e tiles), é só front-end, e responde ao núcleo do
desafio: a série é comparável, e o quanto se pode confiar nela.

**Teste independente**: escolher Brasil e depois Ceará; o gráfico mostra 26 barras, as de 2024 em diante com bigodes, e
o valor de cada barra bate com a soma do calendário daquele ano.

**Cenários de aceitação**:

1. **Dado** uma área selecionada, **quando** o usuário abre a aba de calendário, **então** vê abaixo da grade os totais
   anuais em barras, a mediana dos anos completos como linha de referência, e o ano corrente marcado como parcial.
2. **Dado** um ano convertido, **quando** o usuário passa o mouse ou toca na barra, **então** lê "2024: 267 mil
   (faixa 241–290 mil), convertido de VIIRS".
3. **Dado** o modo "Observed", **então** as barras mostram o total por satélite (barras agrupadas ou empilhadas por
   família) e não há faixa de incerteza.

---

### História 2: mapa de onde o fogo volta todo ano e onde está acima do normal (Prioridade: P1)

Quem abre o app quer ver no mapa, antes de desenhar qualquer área, onde estão as regiões críticas.
Duas camadas novas, ligáveis no painel "Map layers" que a nova UI já tem:

- **Recorrência**: em quantos dos últimos N anos completos cada célula de 0,1° teve fogo (escala sequencial de
  laranja, a mesma rampa do calendário).
- **Anomalia do ano**: o acumulado do ano até hoje de cada estado (coroplético) ou célula, em percentil contra os anos
  anteriores no mesmo ponto do ano (mesma lógica de T047). Escala divergente azul–laranja, centrada na mediana.

**Por que esta prioridade**: o mapa é o elemento central da nova UI e hoje não mostra nenhum dado histórico; a camada de
anomalia por estado sai inteira de `series.json` (27 estados), sem pipeline novo.

**Teste independente**: ligar "Anomalia do ano"; os 27 estados aparecem coloridos e o estado mais escuro bate com o
primeiro do ranking da História 3.

**Cenários de aceitação**:

1. **Dado** o mapa do Brasil, **quando** o usuário liga "Recorrência", **então** cada célula mostra 0–N anos com fogo,
   com legenda e o período escrito ("2016–2025").
2. **Dado** a camada "Anomalia do ano", **quando** o usuário toca num estado, **então** lê "Pará: 41 mil focos até 14 nov,
   percentil 88 dos anos 2001–2025" e pode selecionar o estado como área.
3. **Dado** o celular, **então** as camadas ficam na gaveta de filtros e a legenda não cobre mais que 20 % do mapa.

---

### História 3: ranking e comparação de estados e municípios (Prioridade: P2)

Jornalistas e gestores querem a lista: quais estados ou municípios mais queimaram neste ano, e quais mais cresceram.
Uma tabela ordenável (total do ano, por 1.000 km², variação contra a mediana) com uma mini-barra por linha, e um modo
"comparar" que sobrepõe as curvas acumuladas (T047) de até três áreas.

**Por que esta prioridade**: estados saem de `series.json`; municípios precisam de agregação por município no pipeline
(as células já são atribuídas a estados em `jangada-regions`; falta o mesmo para municípios).

**Teste independente**: ordenar por densidade; o primeiro estado tem o maior valor de focos por 1.000 km² e o CSV da
tabela reproduz a ordem.

**Cenários de aceitação**:

1. **Dado** a aba "Ranking", **quando** o usuário ordena por "acima do normal", **então** a ordem segue o percentil do
   acumulado do ano.
2. **Dado** duas áreas escolhidas, **quando** o usuário ativa "comparar", **então** vê as duas curvas acumuladas
   normalizadas por área (por 1.000 km²), com cores que diferem em luminosidade e não só em matiz.

---

### História 4: intensidade e horário do fogo (FRP e dia/noite) (Prioridade: P2)

Contar focos não diz se o fogo foi mais forte. A potência radiativa (FRP) e a fração de focos noturnos indicam fogo
mais intenso ou mais seco (fogo que segue ativo à noite costuma ser de seca, não de manejo).

- **Gráfico de FRP mediano por foco**, por ano, separado por família de sensor (Aqua MODIS 2002–2023; VIIRS a partir de
  2012), com a sobreposição 2012–2023 visível. Não se mistura FRP entre sensores (pixels de 1 km e 375 m dão FRP
  diferentes).
- **Fração noturna** por mês ou ano, como linha fina sob o calendário ou como faixa no ritmo da temporada.

**Por que esta prioridade**: os dados existem no pipeline (`frp_sum`, `n_day`), mas precisam entrar no export
(`series.json` e tiles), e exigem uma frase de método para não serem lidos como "harmonizados".

**Teste independente**: para o Brasil, a fração noturna e o FRP mediano por ano aparecem com rótulo de sensor; os valores
batem com uma consulta DuckDB em `cell_month.parquet`.

**Cenários de aceitação**:

1. **Dado** uma área, **quando** o usuário abre "Intensidade", **então** vê duas séries de FRP rotuladas "Aqua MODIS" e
   "VIIRS (S-NPP/NOAA-20/21)", nunca uma série única.
2. **Dado** um mês com poucos focos (< 20), **então** o ponto aparece vazado e o texto avisa que a amostra é pequena.

---

### História 5: o método em gráficos (deriva de órbita e concordância entre satélites) (Prioridade: P2)

A página Method explica em texto por que Aqua deixa de ser a referência em 2024. Dois gráficos tornam isso visível para
os avaliadores:

- **Linha do tempo dos sensores** (swimlane): uma faixa por satélite (Terra, Aqua, S-NPP, NOAA-20, NOAA-21) de 2000 a
  hoje, colorida pela parte usada na série harmonizada (fonte 1, 0, 2 do METHOD).
- **Hora local mediana da passagem** de Aqua e Terra por ano, a partir de `acq_time`: a deriva pós-2020 explica a queda
  da razão VIIRS/Aqua em 2024.
- **Razão mensal NOAA-20/S-NPP e NOAA-21/S-NPP** com a linha `g = 0,981`.
- **Validação**: dispersão previsto × observado (Aqua) dos meses de teste 2021–2022, com a faixa ±20 % do SC-003.

**Por que esta prioridade**: reforça a credibilidade da harmonização, que é o tema do desafio; custo baixo (consultas
DuckDB pequenas exportadas como JSON).

**Teste independente**: a página Method mostra os quatro gráficos; a hora mediana de Aqua em 2012 fica perto de 13h30.

---

### História 6: biomas como recorte de área (Prioridade: P2)

Fogo no Brasil se discute por bioma (Amazônia, Cerrado, Caatinga, Mata Atlântica, Pantanal, Pampa). Adicionar biomas
IBGE como área selecionável, ao lado de Brasil, estados e municípios. O METHOD já lista "regions by biome" como melhoria
da calibração, então o mesmo recorte serve às duas coisas.

**Teste independente**: escolher "Pantanal"; o calendário mostra 2020 como o ano mais alto da série.

---

### História 7: contexto climático (Prioridade: P3)

Anos de fogo extremo coincidem com seca e El Niño (2015/16, 2023/24). Sugestões, da mais barata à mais cara:

- **ENSO (índice ONI da NOAA)**: faixa fina acima do calendário, colorida por El Niño / La Niña. Um CSV pequeno.
- **Anomalia de chuva (NASA GPM IMERG, mensal)** por estado: linha secundária no gráfico anual ou sombreado no
  calendário.
- **Área queimada (MODIS MCD64A1)**: comparação "focos × área queimada" por ano, como verificação independente.

**Por que esta prioridade**: muito alinhado à NASA, mas adiciona fontes, downloads e citações novas; depois do envio.

---

### História 8: dados que a nova UI já desenha e o pipeline ainda não entrega (Prioridade: P1, pré-requisito)

Os boards *Main* e *Phone-Cluster* mostram três coisas sem fonte de dados hoje:

1. **Focos dos últimos 7 dias** como pontos no mapa (o export só tem contagens mensais por célula).
2. **"More than usual for this place and month"**: precisa da mediana histórica por célula e mês do ano.
3. **"As Aqua-MODIS 1.4 detections"** num foco: precisa do fator de conversão por estado e mês (já existe em
   `harmonize.py`) disponível no front-end.

**Teste independente**: o arquivo `recent.geojson` (ou equivalente) existe no manifest, tem só focos dos últimos 7 dias
completos e cada foco traz satélite, data, hora, FRP e valor convertido.

---

### Casos de borda

- Mês corrente parcial: rankings e anomalias usam o mesmo critério pro rata de dias completos já usado em T047.
- Áreas pequenas (poucas células): anomalia e FRP com menos de 20 focos aparecem como "amostra pequena", não como cor.
- S-NPP termina em 2026-11-02: gráficos por satélite mostram o fim da faixa, não uma queda para zero.
- NRT sem `type`: os focos dos últimos 7 dias seguem o mesmo filtro de fontes estáticas do `jangada-aggregate`.
- FRP entre sensores: nunca somado nem comparado como série única.
- Celular: todo gráfico novo cabe em 390 px sem rolagem horizontal da página; tabelas largas rolam dentro da caixa.

---

## Requisitos *(obrigatório)*

### Requisitos funcionais

- **FR-020**: O app DEVE mostrar os totais anuais da área selecionada com a faixa `lo`–`hi` nos anos convertidos.
- **FR-021**: O gráfico anual DEVE distinguir ano completo, ano parcial e anos convertidos (Terra, VIIRS) sem depender só
  de cor.
- **FR-022**: O mapa DEVE oferecer uma camada de recorrência (anos com fogo por célula) para os últimos N anos completos.
  `[NEEDS CLARIFICATION: N = 10 anos (2016–2025) ou a série toda?]`
- **FR-023**: O mapa DEVE oferecer uma camada de anomalia do ano até hoje por estado, em percentil contra os anos
  completos anteriores.
- **FR-024**: O app DEVE oferecer um ranking ordenável de estados por total, densidade e percentil; municípios entram
  quando o pipeline agregar por município.
- **FR-025**: O pipeline DEVE exportar `n_day` e `frp_sum` por área e mês, por família de sensor, sem harmonizá-los.
- **FR-026**: O app DEVE rotular toda série de FRP com o sensor de origem.
- **FR-027**: A página Method DEVE mostrar a linha do tempo dos sensores, a hora mediana de passagem de Aqua/Terra, a
  razão entre os VIIRS e a dispersão da validação.
- **FR-028**: O pipeline DEVE atribuir células a biomas IBGE e exportar séries por bioma.
- **FR-029**: O pipeline DEVE exportar os focos dos últimos 7 dias completos com satélite, data, hora, FRP e valor em
  Aqua-MODIS equivalente, e a mediana histórica por célula e mês do ano.
  `[NEEDS CLARIFICATION: o site é estático e atualizado manualmente; os "últimos 7 dias" ficam congelados na data do
  export ou haverá uma Action agendada que roda o pipeline NRT?]`
- **FR-030**: Todo gráfico novo DEVE ter tabela equivalente para leitores de tela e entrar no CSV ou num CSV próprio.
- **FR-031**: Contexto climático (ONI, GPM IMERG, MCD64A1) PODE ser adicionado como camada opcional.
  `[NEEDS CLARIFICATION: entra antes do envio do hackathon (15 nov) ou fica para depois?]`

### Entidades

- **AnnualTotal**: área, ano, valor, lo, hi, fonte (0, 1, 2), completo/parcial.
- **CellRecurrence**: célula, período, anos com fogo, total no período.
- **AreaAnomaly**: área, data de corte, acumulado, mediana, percentil, anos de referência.
- **IntensitySeries**: área, mês, família de sensor, focos, focos diurnos, FRP total, FRP mediano por foco.
- **RecentDetection**: lat, lon, satélite, data, hora, FRP, fator de conversão, célula, acima do normal (sim/não).
- **SensorTimeline**: satélite, início, fim, papel na série harmonizada, hora mediana de passagem por ano.

---

## Critérios de sucesso *(obrigatório)*

- **SC-010**: Para o Brasil e os 27 estados, a soma das barras anuais difere da soma do calendário em menos de 0,1 %.
- **SC-011**: Um usuário novo identifica, em menos de 30 segundos e sem desenhar área, o estado mais acima do normal
  neste ano (teste de corredor com 3 pessoas).
- **SC-012**: Todos os gráficos novos carregam com o Brasil em menos de 2 s numa conexão 4G e adicionam menos de 1 MB
  aos dados baixados na primeira visita.
- **SC-013**: Nenhum gráfico mostra FRP ou fração noturna como série harmonizada única (revisão manual + teste vitest
  sobre os rótulos).
- **SC-014**: A hora mediana de passagem exportada para Aqua em 2012 fica entre 13h00 e 14h00 locais (sanidade do
  `acq_time`).
- **SC-015**: Todos os gráficos novos passam no Playwright a 390 px sem rolagem horizontal da página.

---

## Encaixe na nova UI

| História | Onde entra na nova UI | Forma |
|---|---|---|
| 1. Total anual com incerteza | aba Calendário, abaixo da grade (PC); rolagem da gaveta (celular) | barras + bigodes, linha da mediana |
| 2. Recorrência e anomalia | painel "Map layers" (já existe no board *Main*) e gaveta de filtros | coroplético por estado; grade de células |
| 3. Ranking e comparação | nova aba "Ranking" ao lado de Calendário / 2026 / Ritmo | tabela com mini-barras; curvas sobrepostas |
| 4. Intensidade | nova aba "Intensidade" ou seção do Ritmo | duas linhas por sensor; faixa de fração noturna |
| 5. Método em gráficos | página Method, junto ao explicador T038 | swimlane, linha de hora, dispersão |
| 6. Biomas | campo "Area" (lista ao lado de Brasil / Estado) | mesmo calendário |
| 7. Clima | faixa acima do calendário | faixa ONI; linha de chuva |
| 8. Últimos 7 dias | mapa e cartão do foco (já desenhados) | pontos agrupados em chamas |

## Ordem sugerida (insumo para `/speckit.tasks`)

1. História 1 e camada de anomalia por estado da História 2: só front-end, dados já existem.
2. História 8: sem ela, a nova UI promete dados que não existem.
3. História 5: gráficos do Method, consultas pequenas.
4. Histórias 3, 4 e 6.
5. História 7, depois do envio.
