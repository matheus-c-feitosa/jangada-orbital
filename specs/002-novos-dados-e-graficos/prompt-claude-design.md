Atualize o canvas "Jangada Orbital — nova UI" (https://claude.ai/artifact/4PMKjGnA39Dj4yGpnKmXef) com os novos dados e gráficos abaixo. Trabalhe sobre os boards que já existem, mantendo o mesmo visual, e mude só o que este pedido descreve.

## Contexto

Jangada Orbital é um app web estático do NASA Space Apps 2026 (desafio "Harmonization of MODIS and VIIRS Hot Spots"). Ele mostra um calendário de focos de fogo no Brasil (mês × ano, 2000 até hoje), com todos os satélites convertidos para "detecções equivalentes Aqua-MODIS". Não tem servidor nem login. Os dados de exemplo nos boards são fictícios; continue usando valores de exemplo plausíveis. Os únicos números reais são os da validação na página Method (seção 5).

## O que manter

- A paleta escura atual: fundo #0C1424 e #0F1A2E, superfícies #16233C e #13203A, bordas #2A3A5A, texto #E7ECF5, #C9D3E3 e #9AA8C0, destaque laranja #F97316 e #FB923C, foco #FDBA74.
- A rampa do calendário: #1B2843 → #4A2617 → #773113 → #A9420F → #DD5E0E → #F58634 → #FAB16F → #FDDDB3.
- A fonte Archivo.
- No desktop, as três colunas (filtros 300 px, mapa 680 px, dados 460 px) e as abas da coluna de dados.
- No celular, o mapa primeiro e os dados numa gaveta.
- No tablet, o mapa em cima e os dados embaixo.
- A hachura diagonal de "mês em andamento", reaproveitada para qualquer período parcial.
- O texto da interface continua em inglês, como nos boards atuais.

## O que sai do design

O app não vai ter dados de focos recentes. Remova:

- a camada "Detections, last 7 days" e os marcadores de chama no mapa;
- o cartão "Fire cluster near Iguatu" e o board "Celular: toque numa chama" (Phone-Cluster). Troque esse board pelo toque num estado da camada de anomalia (seção 3);
- a marca "More than usual for this place and month" e a frase "Select a flame to see its detections".

Também não entram potência radiativa (FRP) nem a fração de focos noturnos.

Observação: o `canvas.json` lista Phone-Draw, Tablet e Tablet-Filters, mas esses três arquivos não existem no canvas. Crie os três já com as mudanças abaixo.

## O que entra, em ordem de prioridade

### 1. Biomas como recorte de área (maior prioridade)

- No campo "Area", ofereça um seletor de escopo: Brazil, Biome, State, Municipality ou área desenhada.
- Os biomas são Amazônia, Cerrado, Caatinga, Mata Atlântica, Pantanal e Pampa. Mostre os nomes como o IBGE escreve.
- Nova camada "Biome borders" em "Map layers". Ao escolher um bioma, o mapa enquadra o bioma e destaca o contorno.
- A caixa "About this area" mostra área em km², estados abrangidos e densidade por 1.000 km².
- Calendário, "2026 so far" e "Season rhythm" funcionam igual para biomas.
- Mostre isso no desktop (board Main), no celular (gaveta de filtros) e no tablet.

### 2. Total anual com incerteza (aba Calendar, abaixo da grade)

- Gráfico de barras com um total por ano, de 2001 a 2026, com cerca de 160 px de altura na coluna de 460 px.
- Bigodes de incerteza (faixa P25–P75 da conversão) só nos anos convertidos: Terra até 2002 e VIIRS a partir de 2024. Os anos observados do Aqua (2003–2023) não têm bigode.
- Linha tracejada com a mediana dos anos completos.
- 2026 aparece hachurado como parcial.
- Os anos convertidos se distinguem por padrão ou contorno, não só por cor.
- Ao passar o mouse ou tocar numa barra, aparece um texto como "2024: 267k (range 241k–290k), converted from VIIRS".
- No modo "Observed", as barras ficam agrupadas por família de sensor (MODIS e VIIRS) e não têm bigode.
- Prever uma tabela equivalente para leitor de tela.
- No celular, o gráfico fica logo abaixo do calendário, dentro da gaveta.

### 3. Duas camadas de dados no mapa (painel "Map layers")

Só uma camada de dados fica ativa por vez (seleção do tipo rádio). As bordas continuam como caixas de marcar.

- **Fire recurrence**: quantos dos últimos 10 anos completos (2016–2025) cada célula de grade de cerca de 11 km teve fogo. Use a rampa laranja do calendário e uma legenda de 0 a 10 anos. Deixe o período visível e editável, porque o número de anos ainda pode mudar.
- **This year vs normal**: estados ou biomas pintados pelo percentil do acumulado de 2026 até hoje, comparado com 2001–2025 na mesma data. Use uma escala divergente azul ↔ laranja, centrada na mediana.
- Ao tocar num estado, aparece um popover com o texto "Pará: 41k detections by 14 Nov, 88th percentile of 2001–2025" e um botão "Select this area".
- A legenda fica no canto inferior esquerdo. No celular, ela ocupa no máximo 20 % do mapa.

### 4. Ranking e comparação (nova aba "Ranking")

- A quarta aba entra ao lado de Calendar, 2026 so far e Season rhythm. Se os rótulos não couberem em 460 px, encurte "Season rhythm" para "Season".
- Seletor de escopo: States, Biomes ou Municipalities.
- Tabela ordenável por total do ano, por 1.000 km² e por posição contra o normal (percentil). Cada linha tem uma mini-barra.
- Mostre os 10 primeiros e um botão "Show all", com a lista rolando dentro da caixa.
- Clicar numa linha seleciona a área.
- Uma caixa de marcar "Compare" por linha aceita até 3 áreas. As áreas marcadas aparecem sobrepostas na aba "2026 so far", com curvas acumuladas por 1.000 km².
- As cores das áreas comparadas diferem em luminosidade, não só em matiz.
- A aba tem um botão "Download CSV" e funciona no celular.

### 5. Página Method com gráficos (novo board desktop 1440 de largura, mais uma versão no celular)

Hoje o cabeçalho tem o link "Method", mas o canvas não tem essa página. Ela deve ter quatro blocos, cada um com uma frase curta de leitura:

- **Linha do tempo dos sensores**: uma faixa por satélite (Terra desde 2000, Aqua desde 2002, S-NPP de 2012 até 2 nov 2026, NOAA-20 desde 2018, NOAA-21 desde 2023). A faixa é colorida pelo papel do satélite na série harmonizada: Terra convertido de 2000-11 a 2002-07, Aqua observado de 2002-08 a 2023-12, e média NOAA-20/NOAA-21 convertida a partir de 2024.
- **Hora local da passagem de Aqua e Terra por ano**: mostra a deriva de órbita no fim da missão, que é o motivo para deixar o Aqua em 2024. Inclua uma linha de referência na hora original (Aqua por volta de 13h30).
- **Concordância entre os VIIRS**: razão mensal NOAA-20/S-NPP e NOAA-21/S-NPP, com uma linha de referência em g = 0,981.
- **Validação**: dispersão de valor previsto × valor observado do Aqua nos meses de teste 2021–2022, com a faixa de ±20 %. Use estes números reais:

  | Nível | Erro médio absoluto | Dentro de ±20 % |
  |---|---|---|
  | Nacional por mês | 13,5 % | 92 % dos meses |
  | Estado por ano | 8,3 % | 96 % |
  | Estado por mês | 22,1 % | 62 % |

  O viés total é −2,2 %.

Mantenha também o gráfico que já existe no site: totais anuais de Aqua, S-NPP e harmonizado, de 2012 em diante.

### 6. Contexto climático (condicional)

Entra só se couber sem poluir a tela nem pesar no app. Projete de forma que dê para cortar sem refazer nada.

- Um controle "Climate context", desligado por padrão.
- Quando ligado, cada ano do calendário ganha uma marca pequena de El Niño ou La Niña (índice ONI da NOAA) ao lado do rótulo do ano.
- Opcional: uma linha fina de anomalia de chuva (NASA GPM IMERG) sobre o gráfico de total anual.
- Se só uma das duas couber, fique com a marca do ONI.

## Regras gerais

- Contraste de 4,5:1 no texto, inclusive em rótulos pequenos.
- Nada que dependa só de cor.
- Alvos de toque de pelo menos 44 px.
- No celular (390 px), nenhuma rolagem horizontal da página. Tabelas largas rolam dentro da própria caixa.
- Botões, links e inputs reais.
- Cada gráfico novo tem título curto, legenda e uma frase que responde à pergunta do usuário em linguagem simples.

## Boards esperados

- **Atualizar:** Main (Calendar), Tab-Year, Tab-Rhythm, Phone, Phone-Calendar, Phone-Year, Phone-Rhythm e Phone-Filters.
- **Criar:**
  - Desktop: aba Ranking.
  - Desktop: página Method.
  - Celular: Ranking.
  - Celular: Method.
  - Celular: toque num estado (substitui Phone-Cluster).
  - Celular: escolher bioma.
  - Phone-Draw, Tablet e Tablet-Filters.
