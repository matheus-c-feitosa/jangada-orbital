# Auditoria de performance do web/ (2026-11-15)

Relatório baseado em medição. Nenhum arquivo do app foi alterado nesta etapa.

- **Código analisado:** branch `feat/002-pipeline-data`, commit `fe53d73`.
- **Build:** `npm ci && npm run build` (Vite 8.3.8).
- **Script de medição:** fora do repositório. Usa Playwright 1.65.1 e o Chromium headless 1255.

## Resumo

| Hipótese do responsável | Veredito | Evidência principal |
|---|---|---|
| "O front está muito pesado" | **Confirmada em parte** | Um único bundle JS de 1,70 MB (483 KB gzip). Na primeira visita, com 4G e CPU 4x, os dados aparecem em 5,4 s e o mapa só fica ocioso em 17,3 s. |
| "Principalmente o mapa" | **Refutada para pan e zoom; confirmada para a montagem e as camadas** | Pan e zoom rodam a ~60 fps, sem tarefas longas. O custo do mapa está em montar de novo (página Method, troca de tema, breakpoint), em ligar a recorrência (tarefa longa de ~370 ms) e em mandar dados de camadas ocultas para o worker. |
| "Falta cache no front" | **Refutada em parte** | Já existem cache em memória e versão nas URLs. A segunda visita (cache quente) baixa 404 bytes e mostra os dados em 1,1 s. O que falta é cache entre visitas depois de 10 min (o Pages manda `max-age=600` e não há service worker). Há também um bug: uma falha de rede fica cacheada como `null` até recarregar a página. |
| "Dados precisam de normalização e otimização" | **Confirmada em parte; não é a causa da lentidão** | A primeira tela lê ~1,24 MB (gzip), não os 64 MB. Desses, ~542 KB são arquivos extras baixados sem necessidade na montagem. Dos 64 MB, 29 MB (`observed.parquet` e `harmonized.parquet`) e o `municipalities/index.json` nunca são lidos pelo app. Os tiles carregam 74 % de linhas redundantes. |

O ganho maior e mais barato é **não baixar nem processar na montagem o que a primeira tela não mostra**:

- arquivos extras: −542 KB gzip, ≈ −2,7 s em 4G;
- terra-draw, hyparquet e a página Method: ≈ −80 KB gzip de JS, estimado.

## Condições de medição

| Item | Valor |
|---|---|
| Máquina | Intel Core i3-10100F 3,6 GHz (4 núcleos / 8 threads), 32 GB de RAM, NVIDIA GTX 1070, Windows 11 Pro |
| Navegador | Chromium 1255 headless (Playwright 1.65.1), janela de 1440 × 900 e de 390 × 844 (celular) |
| Rede | Throttling via CDP: RTT de 150 ms, 1,6 Mbps de descida, 750 kbps de subida (perfil "4G" do Lighthouse) |
| CPU | `Emulation.setCPUThrottlingRate` 4x |
| Servidor | Servidor Node local servindo `web/dist` como o GitHub Pages: gzip (nível 6) para texto e `.parquet`, `Cache-Control: max-age=600`, ETag e 304 |
| Basemap | OpenFreeMap real, pela internet (estilo `fiord`) |
| Repetições | 3 rodadas completas; reporto a mediana e, entre parênteses, os três valores |

O `vite preview` serve sem compressão e com `Cache-Control: no-cache`. Por isso usei um servidor próprio que imita o Pages. Para inspeção visual usei o `vite preview` (porta 4173), pela configuração `web-preview` em `.claude/launch.json`, que é local e fica fora do git.

## 1. Medição real

### 1.1 Build (`npm run build`)

| Arquivo | Bruto | gzip |
|---|---|---|
| `assets/index-*.js` (todo o app num único chunk) | 1.703,6 KB | 483,2 KB |
| `assets/maplibre-gl-worker-*.mjs` | 519,5 KB | 146,7 KB |
| `assets/index-*.css` | 136,0 KB | 22,5 KB |
| Fonte Inter, 7 subconjuntos (só o latino é baixado, por `unicode-range`) | 10–85 KB cada | — |
| `dist/` total (inclui `data/`) | 66 MB | — |

Composição do chunk JS, estimada pelo tamanho do código-fonte no sourcemap (fração do total):

| Pacote | Fonte | Fração | Quando é necessário |
|---|---|---|---|
| maplibre-gl | 1.083 KB | 38,8 % | Montagem (mapa) |
| react-dom | 620 KB | 22,2 % | Montagem |
| terra-draw | 258 KB | 9,3 % | Só ao desenhar retângulo ou polígono |
| código do app | 206 KB | 7,4 % | Montagem; a página Method só no clique |
| hyparquet | 189 KB | 6,8 % | Só para área desenhada, círculo ou município |
| @radix-ui/react-select | 55 KB | 2,0 % | Montagem |
| `cn` (pacote npm) | 44 KB | 1,6 % | Duplica `src/lib/utils.ts`; os componentes importam `from "cn"` |

O Vite avisa que o chunk passa de 500 KB. Não há nenhum `import()` dinâmico nem `React.lazy` em `web/src`.

### 1.2 Primeira visita e segunda visita (desktop, Brasil)

| Métrica | 1ª visita (cache vazio) | 2ª visita (recarregar em até 10 min) |
|---|---|---|
| Dados prontos (aba Calendar visível) | **5,37 s** (5,91 / 5,28 / 5,37) | **1,15 s** (1,45 / 1,11 / 1,15) |
| LCP | **5,30 s** (5,92 / 5,23 / 5,30) | 1,09 s |
| Canvas do mapa criado | 5,38 s | — |
| Mapa ocioso (sem requisições por 1,5 s) | **17,3 s** (17,7 / 17,3 / 17,3) | 2,5 s (2,95 / 2,50 / 2,39) |
| Tarefas longas | 13 tarefas, total de **2,27 s**, maior de 763 ms | 8 tarefas, total de 1,28 s, maior de 367 ms |
| Tempo de script, CPU 4x | 2,08 s | — |
| Heap JS | 22,2 MB | 22,7 MB |
| Requisições | 26 de página + 1 do worker | 26, todas do cache HTTP (404 bytes de rede) |
| Bytes transferidos | 1.244 KB locais + 410 KB de basemap + 147 KB do worker ≈ **1,80 MB** | ≈ 0 |
| Nós DOM / listeners | 1.838 / 1.348 | — |

Bytes da primeira visita por arquivo (gzip, medidos):

| Arquivo | KB | Precisa na primeira tela? |
|---|---|---|
| `index-*.js` | 479 | Em parte (ver 1.1) |
| `recurrence.json` | 191 | Não: só com a camada "recorrência" |
| `biomes.geojson` | 156 | Não: só com bordas de bioma ligadas ou um bioma escolhido |
| `municipalities/ranking.json` | 88 | Não: só na aba Ranking, escopo municípios |
| `series.json` | 86 | Sim |
| `recent.json` | 71 | Não: só com a camada "últimos 7 dias" |
| `states.geojson` | 62 | Sim |
| `inter-latin` woff2 | 48 | Sim |
| `biome_series.json` | 23 | Não: só com bioma escolhido, ranking de biomas ou comparação |
| `index-*.css` | 23 | Sim |
| `intensity.json` | 12 | Não: só na aba Season |
| `manifest.json`, `oni.json`, `/` | 4 | Sim / não (`oni` só com "Climate context") |

Os arquivos que a primeira tela não usa somam **~542 KB gzip, 44 % dos bytes locais**. A 1,6 Mbps (~200 KB/s), isso dá ~2,7 s de link disputado com o basemap, o que explica boa parte dos 17,3 s até o mapa ficar ocioso.

Sobre a 2ª visita: dentro de 10 min, o navegador nem consulta o servidor. Depois de 10 min, faz 26 requisições condicionais (304). Em 4G, a 150 ms de RTT, com 6 conexões por host, são ≈ 0,7–1 s só de ida e volta. Fiz essa conta, não medi.

### 1.3 Interações (desktop, depois da 1ª visita; CPU 4x e 4G)

Os valores são a mediana de 3 rodadas.

| Passo | Tarefas longas (n / total / maior) | Script | Rede | Heap depois |
|---|---|---|---|---|
| Escolher estado (Pará) | 6 / 849 ms / 289 ms | 1.869 ms | 0 | 31,1 MB |
| Aba "2026 so far" | 1 / 110 ms | 66 ms | 0 | 26,1 MB |
| Aba Season | 1 / 115 ms | 61 ms | 0 | 25,7 MB |
| Aba Ranking | 1 / 100 ms | 73 ms | 0 | 27,0 MB |
| Aba Calendar | 1 / 117 ms | 68 ms | 0 | 26,2 MB |
| Camada anomalia (já ativa) | 0 | 0 | 0 | — |
| Camada recorrência | 2 / **376 ms** / 321 ms | 569 ms | 0 (já baixada) | 26,2 MB |
| Camada últimos 7 dias | 1 / 90 ms | 161 ms | 0 (já baixada) | 26,5 MB |
| Sem camada | 1 / 58 ms | 102 ms | 0 | 27,2 MB |
| Bordas de bioma | 1 / 183 ms | 157 ms | 0 | 24,0 MB |
| Escolher bioma (Cerrado) | 5 / 791 ms / 315 ms | 1.572 ms | 0 | 27,1 MB |
| Ponto + raio de 30 km (tiles) | 6 / 542 ms / 152 ms | 1.240 ms | 2 tiles, **217 KB** | **37,1 MB** (+10 MB) |
| Página Method | 1 / 115 ms | 149 ms | 2 arquivos, 2,5 KB | 37,0 MB |
| Voltar ao Calendar (mapa montado de novo) | 4 / **956 ms** / 289 ms | 516 ms | 6 (cache) | 31,4 MB |
| Pan e zoom por 10 s | **0** tarefas longas; 60,1 / 59,9 / 58,4 fps | 4,9–6,2 s de 10 s (CPU 4x) | — | — |
| 10 trocas de estado (heap depois de forçar o GC) | — | — | — | 30,2 → 32,7 MB (+2,5 MB) |
| 6 trocas de tema (mapa montado de novo a cada troca; heap depois do GC) | — | — | — | 32,7 → 30,5 MB; 1 canvas no DOM |

Leitura:

- **O pan e o zoom não são o gargalo.** Não há tarefas longas e o fps fica perto de 60. O script ocupa ~50 % do tempo com CPU 4x, mas em quadros curtos.
- **O custo do mapa está em remontar.** Voltar da página Method custa ~1 s de tarefas longas, porque o `MapView` é desmontado e criado de novo. Cada montagem cria um pool de workers: o Playwright contou **27 workers** numa rodada com 9 montagens, cerca de 3 por mapa.
- **Escolher estado ou bioma custa ~1,5–1,9 s de CPU com 4x (~0,4–0,5 s com CPU normal).** Os dados já estão em memória. O custo é o `fitBounds` animado de 600 ms mais o recálculo do calendário: 312 células, cada uma com `compareMonth`.
- **Não há vazamento.** Seis remontagens do mapa deixam 1 canvas e o heap estável. Dez trocas de área deixam +2,5 MB.
- **A área desenhada é a interação mais pesada em bytes e memória.** Cada tile vira dezenas de milhares de objetos JS com `Date`. Os tiles ficam num cache sem limite.

### 1.4 Celular, 390 px (SC-015)

`document.documentElement.scrollWidth` é igual a `clientWidth` (390) nas abas Calendar, 2026, Season e Ranking e na página Method. **O SC-015 é atendido.**

### 1.5 Critérios da spec 002

| Critério | Resultado |
|---|---|
| SC-012: Brasil em < 2 s em 4G | **Não atendido na 1ª visita** (dados em 5,4 s, LCP em 5,3 s). **Atendido na 2ª visita** (1,15 s). |
| SC-012: < 1 MB extra na 1ª visita | **Atendido em bytes** (extras de 542 KB gzip), mas esses bytes atrasam o critério de tempo e quase nenhum é usado na primeira tela. |
| SC-015: 390 px sem scroll horizontal | **Atendido.** |

## 2. Leitura do código: o que carrega, quando e quanto processa

| Módulo | Carrega | Quando | Processamento no cliente | Re-render |
|---|---|---|---|---|
| `main.tsx` | Fonte Inter, CSS e todo o app (import estático) | Montagem | — | — |
| `data/load.ts:83-100` | `manifest.json` (no-cache), depois `series.json` e `states.geojson` em paralelo | Montagem | Copia `months`/`source` para 28 áreas (barato) | — |
| `App.tsx:95-103` | **6 arquivos extras de uma vez** (biomes + biome_series, recurrence, recent, munis ranking, oni, intensity) | Logo depois dos dados principais, sempre | `decodeRows` (56 mil células) e `decodeRecent` (10 mil células) | Cada `.then(set…)` re-renderiza o App inteiro: são 6 re-renders do calendário e do mapa |
| `App.tsx:142-151` `standings` | — | `useMemo` sobre `data` | `ytdStanding` × 27 estados | Estável |
| `App.tsx:238-244, 297-375` | `MapView` em 3 árvores diferentes (desktop, tablet, celular) e `key={theme}` | Troca de breakpoint, de tema ou de página monta de novo | Novo WebGL, estilo, workers | — |
| `App.tsx:298` | A página Method substitui o corpo inteiro | Clique em Method | Desmonta o mapa | — |
| `DataPanel.tsx` | — | Toda mudança de estado do App | Sem `memo`; recebe props novas (por exemplo `onRange` inline em `App.tsx:234`) | Re-renderiza a aba ativa |
| `calendar/CalendarTable.tsx:38-66` | — | `useMemo` | 312 células × `compareMonth` (percorre o histórico) | `onMouseEnter`/`onFocus` (`:140-141`) fazem `setActive` a cada célula sob o mouse e re-renderizam as 312 `<button>` |
| `calendar/AnnualChart.tsx:32-33, 97` | — | `useMemo` | `annualRows` e `familyRows` | `onMouseEnter` por barra (26 barras; barato) |
| `rank/RankingTable.tsx:60-78` | — | `useMemo` (escopo, ordenação) | Municípios: 5.280 linhas mapeadas e ordenadas | Mostra no máximo 10 ou 200 linhas (`:83`); não precisa de virtualização |
| `rank/CompareChart.tsx:35-42` | — | `useMemo` | Até 4 séries | — |
| `data/queries.ts:275-288` | Tiles `h_`/`o_` de 2° (hyparquet) | Área desenhada, círculo ou município | `parquetReadObjects` cria 1 objeto por linha; `monthKey` cria um `Date` e chama `toISOString` por linha (`:290-293`) | Cache em `Map` sem limite (`:272`); a falha é removida do cache (`:284`), o que está correto |
| `data/extras.ts:108-117` | Arquivos extras | Na primeira chamada | — | **Bug: erro de rede vira `null` e fica cacheado para sempre** (`.catch(() => null)` sem `cache.delete`) |
| `pages/MethodData.tsx:18, 92` | `overpass.json`, `validation.json` | Ao abrir Method (sob demanda; correto) | Pequeno | — |
| `map/MapView.tsx:6-7` | terra-draw e o adaptador | Import estático na montagem; instanciado no `style.load` (`:234-248`) | — | — |
| `geo/aoi.ts:234-248` | — | Área desenhada ou município | Ponto-em-polígono para cada célula da caixa × vértices (Altamira: 463 vértices) | — |

Arquivos que o app **nunca lê**: `observed.parquet` (19,3 MB) e `harmonized.parquet` (9,9 MB), oferecidos como download no README, e `municipalities/index.json` (373 KB; nenhuma referência em `web/src`). Os `tiles/` (446 arquivos, 29,8 MB) só são lidos ao desenhar uma área, usar ponto e raio ou escolher um município.

Não há fetch de Parquet no caminho crítico. Não encontrei o mesmo arquivo buscado duas vezes (o cache por arquivo funciona). Nenhum estado do React muda a cada movimento do mapa: só `setPop(null)` no `dragstart`, em `MapView.tsx:265`.

## 3. Mapa (`src/map/MapView.tsx`)

| Fonte / camada | Criada | Dados | Tamanho / feições / vértices | Atualização |
|---|---|---|---|---|
| `states` + `anomaly-fill`, `states-hit`, `states-line`, `state-fill`, `state-line` | `style.load` (`:120-150`) | `states.geojson` | 62 KB gz, 27 feições, 9.541 vértices (2–4 casas decimais) | `setFilter` e `setPaintProperty` (com expressão `match` de 27 pares) |
| `recurrence` (imagem raster) | `style.load` | Canvas de 393 × ~400 px → `toDataURL` (`:82-107`) | 56.281 células | `updateImage` a cada mudança de período com a camada ativa (`:311-316`): tarefa longa de ~370 ms com CPU 4x |
| `area` (linha e preenchimento) | `style.load` | Anel desenhado | 1 feição | `setData` (`:286-289`) |
| `biomes` + `biomes-line`, `biome-fill`, `biome-line` | `style.load` | `biomes.geojson` | 156 KB gz, 6 feições, **25.526 vértices com 4 casas decimais** (`extras.py:205-208`) | **`setData` assim que o arquivo chega, mesmo com as bordas desligadas** (`:293-298`) |
| `recent` (círculos) | `style.load` | `recent.json` → GeoJSON montado na thread principal (`:109-118`) | **10.089 pontos** | **`setData` logo ao carregar, mesmo com a camada oculta** (`:318-322`) |
| Municípios | Não são camada do mapa: o contorno vira o anel da `area` | `municipalities/<UF>.geojson` | 5.570 feições, 137.401 vértices no total (PA 55 KB gz) | Sob demanda (correto) |

Sem `feature-state` (não seria necessário aqui) e sem `cluster` (a camada `recent` já vem agregada por célula de 0,1°).

Listeners:

- Os de `map.on` (`error`, `style.load`, `click`, `dragstart`) e o `ResizeObserver` são removidos no cleanup (`:266-273`, com `map.remove()`, `resize.disconnect()` e `draw.stop()`).
- O `ResizeObserver` chama `fitBounds` em todo resize (`:213-217`). Na animação da gaveta do celular, isso acontece a cada quadro.

Vazamento ao trocar área, aba, camada ou tema: **não encontrado**. A medição mostra 1 canvas e heap estável depois de 6 remontagens (seção 1.3). O custo está na **remontagem em si**: WebGL novo, estilo, sprites e glyphs (vêm do cache), ~3 workers novos e ~1 s de tarefas longas com CPU 4x.

Custo isolado por camada (CPU 4x, seção 1.3): anomalia ≈ 0; recorrência ≈ 376 ms de tarefas longas; últimos 7 dias ≈ 90 ms ao mostrar, mais o `setData` de 10 mil pontos já pago na montagem; bordas de bioma ≈ 183 ms; municípios: só a rede do arquivo da UF.

## 4. Dados (`web/public/data`, 64 MB)

| Arquivo | Gerado em | Bruto | gzip | brotli | Registros | Campos usados × exportados | Oportunidade |
|---|---|---|---|---|---|---|---|
| `series.json` | `export_web.py:44-87` | 369 KB | 86 KB | 67 KB | 28 áreas × 313 meses | Todos (`viirs_k` só no CSV) | Já compacto; 1 casa decimal. Formato colunar ou inteiro escalado renderia pouco (~20 %). |
| `states.geojson` | `export_web.py:121-136` | 187 KB | 62 KB | 35 KB | 27 / 9.541 vértices | Todos | Arredondar para 3 casas (~110 m, abaixo da simplificação de 0,01°) ou usar TopoJSON: −30 a −40 %. |
| `biomes.geojson` | `extras.py:144-166` | 500 KB | 157 KB | 85 KB | 6 / 25.526 vértices | `id`, `name`, `bbox`, `area_km2`, geometria | 4 casas é mais precisão do que a simplificação permite; 3 casas mais simplificação maior: −50 %. **Carregar só quando usado.** |
| `biome_series.json` | `extras.py:168-197` | 91 KB | 23 KB | 17 KB | 6 áreas | Todos | Carregar só quando usado. |
| `recurrence.json` | `extras.py:213-250` | 440 KB | 191 KB | 170 KB | 56.281 células | Todos | PNG RGBA com a máscara de 25 bits por pixel (decodificação nativa, sem `split`), ou carregar só quando a camada liga. |
| `recent.json` | `extras.py:366-442` | 289 KB | 71 KB | 62 KB | 10.089 células | Todos | Carregar só quando a camada liga. |
| `intensity.json` | `extras.py:453-495` | 32 KB | 12 KB | 10 KB | — | Todos | Carregar na aba Season. |
| `municipalities/ranking.json` | `extras.py:253-289` | 240 KB | 88 KB | 73 KB | 5.280 linhas | Todos | Carregar no escopo "municípios" do Ranking. |
| `municipalities/<UF>.geojson` (27) | `municipalities.py:64-99` | 3,39 MB | 871 KB | — | 5.570 / 137.401 vértices | `id`, contorno | Já sob demanda; 4 casas decimais. |
| `municipalities/index.json` | `municipalities.py:101` | 374 KB | 142 KB | 113 KB | 5.570 | **Nenhum** | Não é lido; remover do deploy ou usar na busca. |
| `oni.json`, `overpass.json`, `validation.json`, `manifest.json` | `extras.py`, `export_web.py:234` | 2–7 KB | ~1–2 KB | — | — | — | OK. |
| `tiles/h_*.parquet` (223) | `export_web.py:90-107` | 10,4 MB | ~8,8 MB* | — | 2.003.427 linhas | `cell_lat`, `cell_lon`, `month`, `value`, `lo`, `hi` (`source` não é lido) | **74 % das linhas têm `lo = hi = value`** (meses observados): exportar `lo`/`hi` só nos convertidos, ou anulá-los, e tirar `source`. |
| `tiles/o_*.parquet` (223) | `export_web.py:90-107` | 19,4 MB | ~16 MB* | — | 6.444.529 linhas | `n`; `n_1km` só para VIIRS | Agregar MODIS e VIIRS por família, ou tirar `n_1km` das linhas Terra/Aqua (2,74 M linhas). |
| `harmonized.parquet` | `export_web.py:167-176` | 9,9 MB | 8,8 MB | 5,4 MB | 2.003.427 | **Nenhum (download)** | Sem custo para quem visita o site; publicar como asset de Release reduziria o deploy. |
| `observed.parquet` | `export_web.py:167-176` | 19,3 MB | 16,1 MB | 15,2 MB | 6.444.529 | **Nenhum (download)** | Idem. |

\* Os tiles foram medidos por amostra: dois tiles de 30 km somaram 217 KB transferidos (h 57 KB, o 160 KB). O gzip quase não reduz Parquet que já vem comprimido com snappy.

Não é preciso dividir por estado: a primeira tela já usa `series.json`, que é pré-agregado.

## 5. Cache

| Camada | Hoje | Avaliação |
|---|---|---|
| HTTP (GitHub Pages) | `max-age=600` em tudo, ETag, gzip. Não dá para mudar cabeçalhos. | Assets com hash (`index-*.js`) poderiam ficar em cache por 1 ano, mas o Pages limita a 10 min. Depois disso cada visita revalida 26 URLs. |
| Versão nas URLs (`load.ts:70-87`) | `?v=` = 12 primeiros caracteres do SHA-256 de `harmonized.parquet`; o manifest é buscado com `no-cache` | Funciona para dados harmonizados. **Os arquivos extras que mudam sozinhos (por exemplo `recent.json`, refeito a cada download NRT) mantêm o mesmo `v`** e podem vir velhos por até 10 min. Melhor usar o SHA de cada arquivo, que já está no manifest. |
| Memória: tiles (`queries.ts:272-288`) | Promessa por tile; remove em caso de erro | Correto, mas sem limite de tamanho. Cada área nova acrescenta objetos parseados (+10 MB numa área de 30 km). |
| Memória: extras (`extras.ts:106-117`) | Promessa por arquivo | **Erro cacheado**: uma falha momentânea esconde a vista até recarregar a página. |
| Deduplicação em voo | Sim, pela promessa no `Map` (tiles e extras) | OK. |
| Entre visitas (service worker / Cache API) | **Não existe** | Com um SW (stale-while-revalidate para `data/` e cache-first para `assets/` com hash), a 2ª visita depois de 10 min ficaria em ~1,1 s, sem 26 revalidações. |
| Pré-busca | Nenhuma; extras baixados todos de uma vez sem prioridade | Trocar por carga sob demanda com `requestIdleCallback` depois de o mapa ficar ocioso. |

## 6. Achados, ordenados por impacto ÷ esforço

Esforço: P = horas, M = meio dia, G = mais de um dia.

| Id | Onde | Evidência medida | Impacto estimado | Esforço | Risco para números ou comportamento | Hipótese |
|---|---|---|---|---|---|---|
| F1 | `App.tsx:95-103` | 6 extras baixados e parseados na montagem; 542 KB gzip, 44 % dos bytes locais | −542 KB e ≈ −2,7 s de link em 4G; menos parse (`decodeRows`, `decodeRecent`) e 6 re-renders a menos | P | Nenhum nos números; as vistas aparecem um pouco depois ao abrir a aba ou a camada | Confirma "dados" e "pesado" |
| F2 | `MapView.tsx:293-298, 318-322` | `setData` de 10.089 pontos e de 25.526 vértices com as camadas ocultas | Menos trabalho no worker e na thread principal na montagem (não isolei; entra nas 2,27 s de tarefas longas) | P | Nenhum | Confirma "mapa" |
| F3 | `extras.ts:108-117` | `.catch(() => null)` fica cacheado | Corrige vistas que somem para sempre depois de uma falha | P | Nenhum | Confirma "cache" (bug) |
| F4 | `App.tsx:18`, `MapView.tsx:6-7`, `queries.ts:268` | Bundle único de 1,70 MB; terra-draw 9,3 % e hyparquet 6,8 % do código só são usados em interação | ≈ −70 a −90 KB gzip na 1ª visita (estimado pela fração do sourcemap) e menos parse de JS | P–M | Baixo (carga assíncrona ao desenhar; testar o e2e de desenho) | Confirma "pesado" |
| F5 | `load.ts:70-87` | `v` = hash de `harmonized.parquet` para todos os arquivos | Evita `recent.json` velho por até 10 min depois de um export | P | Nenhum | Cache |
| F6 | `package.json` (`cn`), `components/ui/*.tsx` | Pacote `cn` de 44 KB (1,6 %) duplicando `lib/utils.ts` | ≈ −10 KB gzip (estimado) | P | Baixo | Pesado |
| F7 | `App.tsx:238-244, 297-375` | Voltar da página Method: 956 ms de tarefas longas; ~3 workers por montagem (27 numa rodada) | −1 s de CPU (4x) por volta de Method, troca de tema e breakpoint | M | Médio (layout e foco; o e2e cobre parte) | Confirma "mapa" |
| F8 | `MapView.tsx:82-107, 311-316` | Ligar a recorrência: 376 ms de tarefas longas | −300 ms com PNG pré-gerado no pipeline ou cache por período | M | Baixo (as cores precisam bater com a rampa) | Mapa |
| F9 | `CalendarTable.tsx:140-141` e `:38-66`; `App.tsx:176-189` | Escolher estado ou bioma: 1,6–1,9 s de script com CPU 4x (inclui o `fitBounds` de 600 ms) | −30 a −50 % com `memo` nas células e `unusual` pré-calculado | M | Baixo | Pesado |
| F10 | Novo service worker | 2ª visita depois de 10 min revalida 26 URLs (calculado) | 2ª visita em ~1,1 s sempre; funciona offline | M | Médio (invalidação pelo manifest; testar a atualização) | Cache |
| F11 | `export_web.py:90-107` | 74 % das linhas `h` com `lo = hi = value`; `source` não é lido; `n_1km` inútil em 2,74 M linhas `o` | −30 a −40 % por tile (estimado), menos parse e heap por área desenhada | M | Médio (o pipeline e os testes de invariantes mudam) | Dados |
| F12 | `queries.ts:272, 282, 290-293` | Área de 30 km: +10 MB de heap e 1,24 s de script | Menos heap: ler colunas (`parquetRead` colunar), comparar mês como número, LRU de ~16 tiles | M | Baixo | Dados |
| F13 | `extras.py:205-208`, `export_web.py:128` | Biomas com 4 casas e 25,5 mil vértices; estados com 9,5 mil | −50 % no `biomes.geojson`; menos vértices no worker | P (pipeline) | Baixo (contornos um pouco mais grosseiros) | Dados |
| F14 | `municipalities.py:101`; `observed.parquet` e `harmonized.parquet` | 374 KB e 29 MB nunca lidos pelo app | Deploy 30 MB menor; nenhum ganho para quem visita | P | Baixo (o README cita os Parquet como download) | Refuta "64 MB pesam no front" |
| F15 | `MapView.tsx:213-217` | `fitBounds` em todo resize | Menos trabalho durante a animação da gaveta (não medido) | P | Baixo | Mapa |

### Fazer hoje, antes das 19h

São mudanças pequenas, sem alterar números e cobertas pelos testes atuais (vitest e Playwright):

1. **F1:** carregar extras sob demanda.
   - `recent` e `recurrence`: quando a camada liga.
   - `biomes` e `biome_series`: com bordas ligadas, bioma escolhido ou ranking de biomas.
   - `munis`: no escopo de municípios.
   - `intensity`: na aba Season.
   - `oni`: ao marcar "Climate context".
2. **F2:** só chamar `setData` em `recent` e `biomes` quando a camada estiver visível.
3. **F3:** não cachear a falha em `extras.ts`, ou seja, fazer `cache.delete` no erro, como já acontece em `queries.ts:284`.
4. **F4:** `React.lazy` para `Method`; `import()` de terra-draw no primeiro desenho; `import()` de hyparquet em `seriesForRing`.
5. **F5 e F6**, se sobrar tempo.

Depois de 1 a 4, medir de novo com o mesmo script. A expectativa (estimada) é a 1ª visita ficar em ~3–3,5 s até os dados e o mapa ociosar bem antes de 17 s. Ainda não atinge os 2 s do SC-012 a 1,6 Mbps, porque o JS essencial (maplibre e react-dom, ~400 KB gzip) sozinho leva ~2 s nesse link.

### Depois da submissão

F7 (manter o mapa montado entre páginas e layouts), F8, F9, F10 (service worker), F11–F15.

## 7. O que não consegui medir, e por quê

- **FPS com GPU real.** O Chromium headless usa renderização por software, e o painel do navegador do app estava oculto (rAF pausado). O fps (~60) e "nenhuma tarefa longa" valem para a thread principal; o custo de GPU em celulares fracos não foi medido.
- **Duração de cada passo de interação.** No Chromium, o pedido de rede de cada worker do maplibre nunca recebe `loadingFinished` pelo CDP. Por isso, a espera por "rede ociosa" bateu no limite de 20 s em todo passo. Reportei tarefas longas, tempo de script, bytes e heap, que não dependem disso. O tempo total de 10 trocas de área (~435 s) também não é confiável: inclui o `Select` do Radix sob CPU 4x e essas esperas.
- **GitHub Pages real.** Imitei os cabeçalhos (gzip, `max-age=600`, ETag) num servidor local; latência e CDN reais não foram medidos. A revalidação depois de 10 min foi calculada, não medida.
- **Aparelho celular real.** Medi só a largura de 390 px (SC-015); CPU e GPU de celular não foram medidas.
- **Custo isolado dos `setData` ocultos (F2).** Fica dentro das tarefas longas da montagem; não separei com um build alternativo, porque não podia alterar o código nesta etapa.
- **Ganho exato do code-splitting (F4).** Estimei pela fração do código-fonte no sourcemap, não por um build dividido.
- **Hover no calendário (F9).** O custo do `setActive` por célula foi identificado no código, mas não medido.
- **Municípios grandes** (ponto-em-polígono de Altamira com tiles): não foi exercitado no roteiro.

## Reprodução

O script fica fora do repositório. Ele sobe um servidor que imita o Pages a partir de `web/dist`, aplica o throttling 4G e CPU 4x via CDP e roda: 1ª visita, recarga, interações, pan e zoom por 10 s, 10 trocas de área, 6 trocas de tema e a verificação de 390 px. Repete 3 vezes. Se for útil, ele pode entrar em `web/perf/` numa próxima etapa.

## 8. Aplicado na `main` (2026-11-15, depois do PR #27)

O PR #28 partia de `feat/002-pipeline-data`, anterior ao novo layout do PR #27, e não entrava limpo na `main`. As
correções F1 a F5, F13 e parte de F7 e F8 foram refeitas sobre a `main`. A medição seguiu o mesmo método da seção 1:
servidor que imita o Pages, 4G (150 ms de RTT, 1,6 Mbps), CPU 4x e mediana de 3 rodadas.

O layout novo liga por padrão as bordas de bioma e a camada de recorrência. Por isso `biomes.geojson` e
`recurrence.json` continuam na primeira tela.

### Primeira visita

| Métrica | Desktop antes | Desktop depois | Celular antes | Celular depois |
|---|---|---|---|---|
| Dados prontos | 5,64 s | **3,18 s** | 5,49 s | **2,76 s** |
| LCP | 5,03 s | **3,00 s** | 4,79 s | **2,73 s** |
| Mapa ocioso | 8,95 s | 7,11 s* | 8,67 s | 6,70 s* |
| Tarefas longas (total) | 4,46 s | 3,44 s | 3,73 s | 2,45 s |
| Bytes | 1.207 KB | 1.061 KB* | 1.207 KB | 1.061 KB* |

\* Inclui o ranking de municípios e a tabela de intensidade, pré-buscados no tempo ocioso depois da primeira tela,
ainda dentro da janela medida. Sem eles, a primeira visita no desktop baixa 963 KB e o mapa fica ocioso em 6,5 s.

A segunda visita, dentro dos 10 minutos de cache, caiu de 1,02 s para 0,92 s até os dados no desktop, e de 1,08 s para
0,74 s no celular.

### Interações (desktop, tarefas longas com CPU 4x)

| Passo | Antes | Depois |
|---|---|---|
| Trocar o tema | 3,26 s (o mapa era recriado) | 1,16 s (recolore no lugar) |
| Ligar a recorrência de novo | 1,17 s | 0,35 s (imagem em cache) |
| Abrir a página Method | 0,11 s | 0 s |
| Voltar da página Method | 1,77 s | **0,32 s** (o mapa continua montado) |

### O que mudou

- **F1 (extras sob demanda).** Os biomas e o ONI carregam com os dados. A recorrência carrega com a sua camada ou no
  tempo ocioso. Os últimos 7 dias carregam com a sua camada. O ranking de municípios e a intensidade carregam com a
  sua aba, ou no tempo ocioso depois da primeira tela, para a opção "Município" aparecer sem abrir o Ranking.
- **F2 (sem dados para camada oculta).** Os pontos dos últimos 7 dias só vão para o mapa com a camada ligada.
- **F3 (falhas não ficam em cache).** Só um 404 fica guardado.
- **F4 (code splitting).**
  - O mapa (MapLibre) tem chunk próprio, pedido depois dos dados. Pedido junto com os dados, atrasava a resposta em
    0,4 s sem adiantar o mapa.
  - A página Method, o terra-draw (carregado no tempo ocioso ou no primeiro desenho) e o hyparquet têm chunks próprios.
  - O JS principal caiu de 493 KB para 136 KB gzip.
- **F5 (versão por arquivo).** Cada arquivo do manifest leva o seu próprio SHA na URL. O `recent.json` novo não fica
  mais preso no cache por 10 min.
- **F7.**
  - Trocar o tema recolore as camadas do mapa existente. Só o basemap opcional ainda recria o mapa.
  - A página do calendário fica montada, oculta, enquanto a Method aparece. Ao voltar, o mapa, a aba e a rolagem são
    os mesmos, e o `ResizeObserver` não reenquadra um mapa que volta do mesmo tamanho.
- **F9.** As células do calendário são memorizadas e os rótulos são calculados uma vez por grade. Passar o mouse
  re-renderiza 2 células, não 312.
- **Chunks apagados por um deploy.** Com code splitting, uma página aberta antes de um deploy pede chunks que não
  existem mais. O `vite:preloadError` recarrega a página uma vez, e um `LoadBoundary` mostra "Recarregar" em vez de
  uma tela em branco. A recarga fica limitada a uma por minuto, para não entrar em loop.
- **F8.** A imagem de recorrência é escrita direto num `ImageData`, sem 56 mil `fillRect`, e fica em cache por período
  e tema.
- **F13.**
  - `round_geometry` arredonda os contornos dos biomas para 3 casas (cerca de 110 m) e mantém as bordas
    compartilhadas.
  - O `biomes.geojson` caiu de 152 KB para 123 KB gzip.
  - O arquivo publicado foi reescrito com a mesma função, sem refazer a simplificação.
- **Mais três correções, achadas no perfil da nova UI:**
  - a divisão das bordas de bioma (`splitEdges`) usa chaves numéricas e é memorizada (~370 ms com CPU 4x a cada
    montagem do mapa);
  - os formatadores `Intl` do i18n são criados uma vez por idioma;
  - a busca de municípios usa um único `Intl.Collator`. `localeCompare` com locale criava um collator a cada
    comparação: 152 ms com CPU 4x para 5.280 nomes.

### Ainda não feito

- **F10:** service worker. Ficou de fora porque arrisca servir um app velho durante a avaliação. A segunda visita já
  baixa 0 KB por 10 minutos.
- **F11 e F12:** tiles mais leves e leitura colunar. Afetam só as áreas desenhadas.
- **Outras opções avaliadas:**
  - Archivo hospedado no próprio site, para tirar dois domínios de terceiros da primeira visita.
  - Recorrência em formato binário ou PNG gerado na pipeline (187 KB de JSON na primeira tela).
  - TopoJSON para estados e biomas, com as bordas compartilhadas guardadas uma vez só.
  - A divisão das bordas e a decodificação da recorrência num Web Worker.
