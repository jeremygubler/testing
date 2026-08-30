// MapLibre 6 ships ESM with named exports and no default: importing a default
// yields undefined at runtime, not a build error.
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
} from '/viewer/vendor/maplibre-gl.mjs';

const API = '/api/v1/shared';

/** The token is the last path segment of /s/<token>. */
function tokenFromLocation() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

const dateFormat = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
const momentFormat = new Intl.DateTimeFormat('de-CH', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function formatDistance(metres) {
  if (!metres) return '–';
  return metres < 1000 ? `${Math.round(metres)} m` : `${Math.round(metres / 1000)} km`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStats(trip) {
  const list = document.querySelector('.stats');
  const entries = [
    [formatDistance(trip.route.distance_m), 'Distanz'],
    [String(trip.stops.length), 'Stops'],
    [String(trip.timeline.filter((i) => i.kind === 'journal').length), 'Einträge'],
  ];
  const countries = new Set(trip.stops.map((s) => s.country).filter(Boolean));
  if (countries.size) entries.push([String(countries.size), 'Länder']);

  for (const [value, label] of entries) {
    const item = el('li');
    item.append(el('span', 'value', value), el('span', 'label', label));
    list.append(item);
  }
}

function photoStrip(token, photos) {
  if (!photos || photos.length === 0) return null;
  const strip = el('div', 'photos');
  for (const photo of photos) {
    const image = new Image();
    image.loading = 'lazy';
    image.src = `${API}/${token}/photos/${photo.id}/file?variant=thumb`;
    image.alt = photo.caption ?? '';
    image.addEventListener('click', () => openLightbox(token, photo.id));
    strip.append(image);
  }
  return strip;
}

function openLightbox(token, photoId) {
  const box = document.getElementById('lightbox');
  const image = document.getElementById('lightbox-image');
  image.src = `${API}/${token}/photos/${photoId}/file?variant=original`;
  box.hidden = false;
}

function renderTimeline(token, trip) {
  const list = document.querySelector('.timeline');
  for (const item of trip.timeline) {
    const entry = el('li', `item ${item.kind}`);
    const card = el('div', 'card');
    card.append(el('p', 'when', momentFormat.format(new Date(item.at))));

    if (item.kind === 'stop' && item.stop) {
      card.append(el('h2', null, item.stop.name));
      if (item.stop.notes) card.append(el('p', null, item.stop.notes));
    } else if (item.kind === 'journal' && item.entry) {
      if (item.entry.title) card.append(el('h2', null, item.entry.title));
      if (item.entry.text) card.append(el('p', null, item.entry.text));
      const strip = photoStrip(token, item.entry.photos);
      if (strip) card.append(strip);
    } else {
      const count = item.photos.length;
      card.append(el('h2', null, count === 1 ? 'Ein Foto' : `${count} Fotos`));
      const strip = photoStrip(token, item.photos);
      if (strip) card.append(strip);
    }

    entry.append(card);
    list.append(entry);
  }
}

/** A style that needs no network, so the route stays visible when the tile
 * server is unreachable — which on a self-hosted setup is a Tuesday. */
const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8e8e3' } }],
};

async function resolveStyle(url) {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return BLANK_STYLE;
    return await response.json();
  } catch {
    return BLANK_STYLE;
  }
}

async function renderMap(trip) {
  const map = new MapLibreMap({
    container: 'map',
    style: await resolveStyle(trip.map_style_url),
    attributionControl: false,
  });
  map.addControl(new AttributionControl({ compact: true }));
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

  map.on('load', () => {
    if (trip.route.coordinates.length > 1) {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: trip.route.coordinates },
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2f6f4f', 'line-width': 4, 'line-opacity': 0.9 },
      });
    }

    for (const stop of trip.stops) {
      const marker = el('div', 'marker');
      marker.textContent = stop.name;
      Object.assign(marker.style, {
        background: 'var(--surface)', border: '2px solid #2f6f4f', borderRadius: '999px',
        padding: '2px 8px', font: '600 12px system-ui', color: 'var(--text)',
        whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      });
      new Marker({ element: marker }).setLngLat([stop.lon, stop.lat]).addTo(map);
    }

    // bounds arrive as [west, south, east, north] – exactly what fitBounds wants.
    if (trip.route.bounds) {
      map.fitBounds(trip.route.bounds, { padding: 48, duration: 0 });
    } else if (trip.stops.length > 0) {
      map.setCenter([trip.stops[0].lon, trip.stops[0].lat]);
      map.setZoom(9);
    }
    document.body.dataset.mapReady = 'true';
  });
}

function fail(message) {
  const app = document.getElementById('app');
  app.className = 'error';
  document.getElementById('status').textContent = message;
}

async function main() {
  const token = tokenFromLocation();
  let trip;
  try {
    const response = await fetch(`${API}/${token}`);
    if (!response.ok) {
      // Revoked, expired and never-existed all answer the same, on purpose.
      fail('Dieser Link ist nicht (mehr) gültig.');
      return;
    }
    trip = await response.json();
  } catch {
    fail('Die Reise konnte nicht geladen werden.');
    return;
  }

  const app = document.getElementById('app');
  app.className = '';
  app.replaceChildren(document.getElementById('tpl-page').content.cloneNode(true));

  document.title = `${trip.title} – reiseapp`;
  document.querySelector('.title').textContent = trip.title;
  const range = [trip.start_date, trip.end_date]
    .filter(Boolean)
    .map((value) => dateFormat.format(new Date(value)))
    .join(' – ');
  document.querySelector('.meta').textContent = [range, `von ${trip.owner_name}`]
    .filter(Boolean)
    .join(' · ');
  const description = document.querySelector('.description');
  if (trip.description) description.textContent = trip.description;
  else description.remove();

  renderStats(trip);
  renderTimeline(token, trip);
  await renderMap(trip);

  const box = document.getElementById('lightbox');
  box.addEventListener('click', () => { box.hidden = true; });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') box.hidden = true;
  });
}

void main();
