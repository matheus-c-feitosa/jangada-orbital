# web/

The web app. Not scaffolded yet: the plan is React + Vite + TypeScript + MapLibre GL, published as a static site
(public link, no login) that reads the harmonized aggregates produced in `data/processed/`.

Planned features, from the challenge statement:

- choose an area (draw on the map or type latitude/longitude) and a date range;
- burning activity calendar (month × year) from 2000 to today;
- current month compared with the historical median, and anomalies;
- accessible color ramps;
- CSV download of the hotspots in the search.
