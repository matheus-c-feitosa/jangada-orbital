import type { AreaSeries, Manifest } from './data/load'
import { Explainer } from './pages/Explainer'
import { SensorTimeline, ViirsAgreement } from './pages/MethodCharts'
import { OverpassChart, ValidationChart } from './pages/MethodData'
import { useI18n } from './i18n'

// text inside the cards: the design's 15 px reading size, lists and links in the page's colours
const prose = '[&_a]:text-link [&_a]:underline [&_h2]:m-0 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:text-ink-2 [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[15px] [&_p]:leading-normal [&_p]:text-ink-2 [&_strong]:text-ink [&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:text-[15px] [&_li]:leading-normal'

/** Method page (FR-012), design "Página Method": the charts as cards, then the steps, limits and sources. */
export function Method({ manifest, repo, brazil, phone }: { manifest: Manifest | null; repo: string; brazil: AreaSeries | null; phone?: boolean }) {
  const i = useI18n()
  const pt = i.lang === 'pt'
  const v = manifest?.validation
  const date = manifest?.data_date ?? (pt ? 'hoje' : 'today')
  const heldout = v?.heldout_years ?? '2021–2022'
  const shareStateYear = v ? i.pct(v.share_within_20pct_state_year) : null
  const grid = `grid gap-6 ${phone ? 'grid-cols-1 !gap-4' : 'grid-cols-2 max-[1100px]:grid-cols-1'}`

  return (
    <main className={`mx-auto flex w-full max-w-[1312px] flex-col ${phone ? 'gap-4 px-4 pt-6 pb-10' : 'gap-6 px-6 pt-10 pb-16'} ${prose}`}>
      <div className="flex flex-col gap-3">
        <h1 className={`m-0 font-bold leading-[1.15] tracking-[-0.01em] ${phone ? 'text-[26px]' : 'text-[34px]'}`}>
          {pt ? 'Como o calendário harmonizado é feito' : 'How the harmonized calendar is made'}
        </h1>
        {pt ? (
          <p className="!text-base">
            Cinco satélites contam focos de fogo sobre o Brasil desde 2000. Eles enxergam de jeitos diferentes, então
            convertemos toda contagem no que o Aqua MODIS teria visto: <strong>detecções equivalentes Aqua-MODIS</strong>.
            Estes gráficos mostram qual satélite é usado em cada período, por que deixamos de usar o Aqua em 2024 e quão perto a
            conversão chega.
          </p>
        ) : (
          <p className="!text-base">
            Five satellites have counted fires over Brazil since 2000. They see differently, so we convert every count to what
            Aqua MODIS would have seen: <strong>Aqua-MODIS-equivalent detections</strong>. These charts show which satellite is used
            when, why we stopped using Aqua in 2024, and how close the conversion gets.
          </p>
        )}
      </div>

      <SensorTimeline dataDate={manifest?.data_date ?? '2026-11-14'} />

      <div className={grid}>
        <OverpassChart />
        <ViirsAgreement brazil={brazil} />
        <ValidationChart />
        <Explainer brazil={brazil} manifest={manifest} />
      </div>

      <div className={grid}>
        <section className="me-card" aria-labelledby="steps-title">
          <h2 id="steps-title">{pt ? 'Passos' : 'Steps'}</h2>
          {pt ? (
            <ol>
              <li>Focos do NASA FIRMS no Brasil, de novembro de 2000 a {date}: só fogo em vegetação, sem detecções de baixa confiança.</li>
              <li>Pixels VIIRS do mesmo fogo e da mesma passagem a até ~1 km contam uma vez só, como um pixel MODIS de 1 km contaria.</li>
              <li>Contagens por célula de 0,1° (cerca de 11 km) e por mês; cada célula pertence a um estado.</li>
              <li>Um fator de calibração por estado e mês do ano, ajustado em 2012–2023, quando Aqua e VIIRS voaram juntos. Estados com pouco fogo usam o fator nacional.</li>
              <li>Série: Terra convertido para o Aqua até julho de 2002, Aqua observado até dezembro de 2023, VIIRS calibrado a partir de janeiro de 2024.</li>
              <li>Ajustado em 2012–2020 e testado em {heldout}, anos que o modelo nunca viu{shareStateYear ? `: ${shareStateYear} dos estados-ano ficam dentro de ±20%` : ''}.</li>
            </ol>
          ) : (
            <ol>
              <li>NASA FIRMS hotspots for Brazil, November 2000 to {date}: vegetation fires only, low-confidence detections removed.</li>
              <li>VIIRS pixels of the same fire and overpass within ~1 km count once, as a 1 km MODIS pixel would.</li>
              <li>Counts per 0.1° grid cell (about 11 km) and month; each cell belongs to one state.</li>
              <li>One calibration factor per state and month of the year, fitted on 2012–2023, when Aqua and VIIRS flew together. States with few fires lean on the national factor.</li>
              <li>Series: Terra scaled to Aqua until July 2002, Aqua observed until December 2023, VIIRS calibrated from January 2024.</li>
              <li>Fitted on 2012–2020 and tested on {heldout}, years the model never saw{shareStateYear ? `: ${shareStateYear} of state-years land within ±20%` : ''}.</li>
            </ol>
          )}
        </section>
        <section className="me-card" aria-labelledby="views-title">
          <h2 id="views-title">{pt ? 'Como cada visão é calculada' : 'How each view is computed'}</h2>
          {pt ? (
            <ul>
              <li><strong>Este ano até agora:</strong> detecções harmonizadas acumuladas desde janeiro contra a mediana e a faixa dos
                percentis 10 a 90 de todos os anos completos anteriores no mesmo ponto do ano. O mês corrente é comparado
                proporcionalmente (só dias completos).</li>
              <li><strong>Temporada:</strong> o ano de temporada começa no mês mais calmo da área, então temporadas que atravessam a
                virada do ano ficam inteiras. Início, meio e fim são os momentos em que a temporada atinge 10%, 50% e 90% das detecções.</li>
              <li><strong>Total por ano:</strong> a soma dos doze meses; nos anos convertidos (Terra, VIIRS) a barra fina é o intervalo
                P25–P75 da conversão. A linha é a mediana dos anos completos.</li>
              <li><strong>Este ano vs normal (mapa) e ranking:</strong> as detecções de cada área desde janeiro, comparadas com a mesma
                data em cada ano completo anterior. A cor é esse percentil.</li>
              <li><strong>Densidade:</strong> detecções por 1.000 km², usando a área geodésica da seleção.</li>
            </ul>
          ) : (
            <ul>
              <li><strong>This year so far:</strong> cumulative harmonized detections since January against the median and the
                10th–90th percentile range of all previous complete years at the same point of the year. The current month is
                compared pro rata (complete days only).</li>
              <li><strong>Season:</strong> a season year starts in the area's calmest month, so seasons that cross New
                Year stay whole. Start, middle and end are the moments the season reaches 10%, 50% and 90% of its detections.</li>
              <li><strong>Total per year:</strong> the sum of the twelve months; on converted years (Terra, VIIRS) the whisker is
                the P25–P75 range of the conversion. The line is the median of the complete years.</li>
              <li><strong>This year vs normal (map) and ranking:</strong> each area's detections since January, ranked against
                the same date in every previous complete year. The colour is that percentile.</li>
              <li><strong>Density:</strong> detections per 1,000 km², using the geodesic area of the selection.</li>
            </ul>
          )}
        </section>
        <section className="me-card" aria-labelledby="limits-title">
          <h2 id="limits-title">{pt ? 'Limitações' : 'Limitations'}</h2>
          {pt ? (
            <ul>
              <li>Valores de 2024 em diante e de antes de agosto de 2002 são estimativas; o calendário mostra esses anos em cinza e o CSV traz as contagens observadas de cada satélite.</li>
              <li>A partir de 2024 as órbitas do Aqua e do Terra derivaram para horários mais tarde, quando há mais fogo, então suas contagens brutas não são mais comparáveis com anos anteriores.</li>
              <li>O último mês é parcial e comparado proporcionalmente; os últimos dias usam dados quase em tempo real que ainda podem mudar.</li>
              <li>Áreas desenhadas e municípios são aproximados pelas células de 0,1° cujo centro fica dentro deles.</li>
            </ul>
          ) : (
            <ul>
              <li>Values from 2024 and before August 2002 are estimates; the calendar shows those years in grey and the CSV includes the observed counts of every satellite.</li>
              <li>From 2024 the Aqua and Terra orbits drifted to later hours, when more fires burn, so their raw counts are no longer comparable with earlier years.</li>
              <li>The last month is partial and compared pro rata; the last days use near-real-time data that may still change.</li>
              <li>Drawn areas and municipalities are approximated by the 0.1° cells whose centre falls inside them.</li>
            </ul>
          )}
        </section>
        <section className="me-card" aria-labelledby="sources-title">
          <h2 id="sources-title">{pt ? 'Fontes' : 'Sources'}</h2>
          <ul>
            <li>{pt ? 'NASA FIRMS (Fire Information for Resource Management System): dados de fogo ativo MODIS Coleção 6.1 e VIIRS 375 m.' : 'NASA FIRMS, Fire Information for Resource Management System: MODIS Collection 6.1 and VIIRS 375 m active fire data.'}</li>
            <li>{pt ? 'IBGE: limites oficiais do Brasil, dos estados e municípios, e o mapa de biomas (1:250.000, 2019).' : 'IBGE: official borders of Brazil, its states and municipalities, and the biomes map (1:250,000, 2019).'}</li>
            <li>{pt ? 'NOAA Climate Prediction Center: Índice Oceânico do Niño (ONI), para as marcas de El Niño / La Niña.' : 'NOAA Climate Prediction Center: Oceanic Niño Index (ONI), for the El Niño / La Niña marks.'}</li>
            <li>{pt ? 'Arquivos quase em tempo real do NASA FIRMS (últimos 7 dias) para a camada de detecções recentes.' : 'NASA FIRMS near-real-time files (last 7 days) for the map layer of recent detections.'}</li>
            <li>{pt ? 'Mapa base opcional: © colaboradores do OpenStreetMap, OpenMapTiles, OpenFreeMap.' : 'Optional basemap: © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap.'}</li>
          </ul>
          <p>{pt ? 'Método completo, código e pipeline de dados: ' : 'Full method, code and data pipeline: '}
            <a href={`${repo}/blob/main/docs/METHOD.md`} target="_blank" rel="noreferrer">{pt ? 'docs/METHOD.md no GitHub' : 'docs/METHOD.md on GitHub'}</a>.</p>
        </section>
      </div>
    </main>
  )
}
