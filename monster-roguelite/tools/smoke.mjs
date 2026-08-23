/**
 * Automatisierter Durchspiel-Test im echten Browser.
 *
 * Es gibt für dieses Projekt keinen Unit-Test-Runner — der Validator ist ein
 * Bot, der das Spiel wirklich spielt: Hub → Run starten → Räume räumen →
 * Türen nehmen → Truhe öffnen → Boss → Etage 2. Am Ende wird geprüft, dass
 * keine Konsolenfehler aufgetreten sind und die Progression funktioniert hat.
 *
 * Aufruf:  npm run smoke        (Dev-Server muss auf :5173 laufen)
 */
import { chromium } from 'playwright';

const SHOT_DIR = process.argv[2] ?? 'shots';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const CHROME =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// --- Hilfsfunktionen -------------------------------------------------------

/** Phaser-Koordinaten (960×600) in Seitenkoordinaten umrechnen. */
async function toPage(gx, gy) {
  const r = await page.evaluate(() => {
    const b = document.querySelector('canvas').getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  return { x: r.x + (gx / 960) * r.w, y: r.y + (gy / 600) * r.h };
}

async function clickGame(gx, gy) {
  const p = await toPage(gx, gy);
  await page.mouse.click(p.x, p.y);
}

async function aimAt(gx, gy) {
  const p = await toPage(gx, gy);
  await page.mouse.move(p.x, p.y);
}

/** Momentaufnahme des Spielzustands aus der Registry + Szene. */
const snapshot = () =>
  page.evaluate(() => {
    const g = window.__game;
    const scene = g.scene.getScene('Game');
    const run = g.registry.get('run');
    const plan = g.registry.get('plan');
    // Nach dem Run-Ende ist die Game-Szene abgebaut — dann gibt es nichts zu lesen.
    if (!run || !plan || !scene?.player?.active || !scene.enemies?.children) return null;
    const room = plan.rooms[run.roomIndex];
    const enemies = scene.enemies.getChildren().filter((e) => e.active);
    return {
      floor: run.floor,
      roomIndex: run.roomIndex,
      roomKind: room.kind,
      roomCleared: room.cleared,
      neighbors: room.neighbors,
      doors: room.tiles.doors,
      player: { x: Math.round(scene.player.x), y: Math.round(scene.player.y) },
      trainerHp: Math.round(scene.player.hp),
      trainerMaxHp: run.trainerMaxHp,
      enemies: enemies.map((e) => ({
        x: Math.round(e.x),
        y: Math.round(e.y),
        hp: Math.round(e.hp),
        ratio: +e.hpRatio.toFixed(2),
        id: e.species.id,
        boss: e.isBoss,
      })),
      companion: scene.companion
        ? { x: Math.round(scene.companion.x), y: Math.round(scene.companion.y), hp: Math.round(scene.companion.hp), maxHp: scene.companion.maxHp, id: scene.companion.species.id }
        : null,
      chest: scene.chest ? { x: Math.round(scene.chest.x), y: Math.round(scene.chest.y), opened: scene.chest.opened } : null,
      stands: (scene.stands ?? []).map((st) => ({
        x: Math.round(st.x), y: Math.round(st.y),
        price: st.offer.price, sold: st.offer.sold, name: st.offer.name,
      })),
      elites: enemies.filter((e) => e.isElite).length,
      portal: scene.portal ? { x: Math.round(scene.portal.x), y: Math.round(scene.portal.y) } : null,
      currency: run.currency,
      relics: [...run.relics.entries()],
      team: run.team.map((m) => `${m.speciesId} Lv${m.level}:${Math.round(m.hp)}`),
      stats: run.stats,
      roomsTotal: plan.rooms.length,
      roomsVisited: plan.rooms.filter((r) => r.visited).length,
      runOver: scene.runOver,
      scenes: g.scene.getScenes(true).map((s) => s.scene.key),
    };
  });

const KEY = { w: 'w', a: 'a', s: 's', d: 'd' };
let held = new Set();

async function setKeys(want) {
  for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
async function releaseAll() { await setKeys(new Set()); }

/** Läuft in Richtung eines Zielpunkts (Phaser-Koordinaten). */
async function steerTowards(tx, ty, px, py) {
  const want = new Set();
  if (tx - px > 8) want.add(KEY.d);
  else if (px - tx > 8) want.add(KEY.a);
  if (ty - py > 8) want.add(KEY.s);
  else if (py - ty > 8) want.add(KEY.w);
  await setKeys(want);
}

// Kacheln → Weltkoordinaten (muss zu GameConfig passen)
const TILE = 32, OFF_X = 80, OFF_Y = 74;
const tileWorld = (col, row) => ({ x: OFF_X + col * TILE + TILE / 2, y: OFF_Y + row * TILE + TILE / 2 });

// --- Testlauf --------------------------------------------------------------

const log = [];
const say = (m) => { log.push(m); console.log(m); };

say(`Szenen im Hub: ${(await page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key))).join(', ')}`);

// --- Generator-Check: viele Etagen erzeugen und die Struktur nachmessen ----
// Unabhängig davon, wie weit der Bot im Spiel kommt.
const gen = await page.evaluate(() => {
  const { generateFloor, Rng, DEFAULT_RELIC_IDS } = window.__debug;
  const out = { floors: 0, rooms: 0, kinds: {}, elites: 0, enemies: 0, unreachable: 0, shopOffers: 0, perFloor: {}, shopDist: 0, shopCount: 0, bossDist: 0, maxDist: 0 };
  for (let floor = 1; floor <= 8; floor++) {
    for (let seed = 1; seed <= 40; seed++) {
      const plan = generateFloor(new Rng(floor * 1000 + seed), floor, DEFAULT_RELIC_IDS);
      out.floors++;
      out.rooms += plan.rooms.length;
      out.perFloor[floor] = out.perFloor[floor] ?? { elites: 0, enemies: 0 };
      for (const r of plan.rooms) {
        out.kinds[r.kind] = (out.kinds[r.kind] ?? 0) + 1;
        out.enemies += r.enemies.length;
        const el = r.enemies.filter((e) => e.isElite).length;
        out.elites += el;
        out.perFloor[floor].enemies += r.enemies.length;
        out.perFloor[floor].elites += el;
        out.shopOffers += r.shop.length;
      }
      // Erreichbarkeit + Distanzen: ist jeder Raum vom Start aus erreichbar,
      // und wie weit liegen Laden und Boss vom Start entfernt?
      const d = new Array(plan.rooms.length).fill(-1);
      d[0] = 0;
      const queue = [0];
      while (queue.length) {
        const cur = queue.shift();
        for (const n of Object.values(plan.rooms[cur].neighbors)) {
          if (d[n] === -1) { d[n] = d[cur] + 1; queue.push(n); }
        }
      }
      if (d.some((x) => x === -1)) out.unreachable++;
      const shopIdx = plan.rooms.findIndex((r) => r.kind === 'laden');
      if (shopIdx >= 0) { out.shopDist += d[shopIdx]; out.shopCount++; }
      out.bossDist += d[plan.bossIndex];
      out.maxDist += Math.max(...d);
    }
  }
  return out;
});
say(`Generator: ${gen.floors} Etagen, ${gen.rooms} Räume, Typen ${JSON.stringify(gen.kinds)}`);
say(`Generator: ${gen.elites}/${gen.enemies} Gegner sind Elite (${(100 * gen.elites / gen.enemies).toFixed(1)} %), ${gen.shopOffers} Laden-Angebote`);
say(`Generator: Elite-Quote je Etage ${Object.entries(gen.perFloor).map(([f, v]) => `E${f}:${(100 * v.elites / v.enemies).toFixed(0)}%`).join(' ')}`);
say(`Generator: mittlere Start-Distanz — Laden ${(gen.shopDist / gen.shopCount).toFixed(1)}, Boss ${(gen.bossDist / gen.floors).toFixed(1)}, Etagen-Maximum ${(gen.maxDist / gen.floors).toFixed(1)}`);
say(`Generator: nicht erreichbare Etagen: ${gen.unreachable}${gen.unreachable === 0 ? ' ✓' : ' ✗'}`);
if ((gen.perFloor[1]?.elites ?? 0) > 0) errors.push('Elites auf Etage 1 — sollen erst ab Etage 2 auftauchen');
if (gen.unreachable > 0 || gen.elites === 0 || !gen.kinds.laden || !gen.kinds.boss) {
  errors.push('Generator-Check fehlgeschlagen: ' + JSON.stringify(gen));
}
await page.screenshot({ path: `${SHOT_DIR}/01-hub.png` });

await clickGame(480, 534); // RUN STARTEN
await page.waitForTimeout(1200);

let s = await snapshot();
if (!s) { console.error('FEHLER: Game-Szene nicht erreichbar'); await browser.close(); process.exit(1); }
say(`Run gestartet — Etage ${s.floor}, ${s.roomsTotal} Räume`);

let goal = null;            // aktuelles Ziel in Weltkoordinaten
let goalKind = '';
let step = 0;
let minTrainerHp = Infinity;
let minCompanionHp = Infinity;
let maxFloor = 1;
let lastGood = null;
let maxElitesSeen = 0;
let sawShop = false;
let maxLevel = 1;
const MAX_STEPS = Number(process.env.SMOKE_STEPS ?? 420);
const DEADLINE = Date.now() + Number(process.env.SMOKE_BUDGET_MS ?? 150000);
const visitedRooms = new Set();

// Optional direkt auf eine höhere Etage springen: Elites und Laden-Räume
// tauchen auf Etage 1 kaum auf, sollen aber trotzdem getestet werden.
const startFloor = Number(process.env.SMOKE_FLOOR ?? 1);
if (startFloor > 1) {
  await page.evaluate((target) => {
    const scene = window.__game.scene.getScene('Game');
    while (window.__game.registry.get('run').floor < target) scene.nextFloor();
  }, startFloor);
  await page.waitForTimeout(600);
  say(`Direkt auf Etage ${startFloor} gesprungen (SMOKE_FLOOR)`);
}

let firing = true;
await page.mouse.down();    // Dauerfeuer

while (step++ < MAX_STEPS && Date.now() < DEADLINE) {
  const next = await snapshot();
  if (!next) break;
  s = next;
  lastGood = s;
  if (s.runOver || !s.scenes.includes('Game')) {
    say(`Run vorbei (Trainer gefallen) — Etage ${lastGood?.floor}, Raum ${lastGood?.roomIndex} (${lastGood?.roomKind}), ${lastGood?.enemies.length ?? '?'} Gegner davon ${lastGood?.elites ?? 0} Elite`);
    break;
  }
  visitedRooms.add(`${s.floor}:${s.roomIndex}`);

  if (s.floor >= startFloor + 2) { say(`Etage ${s.floor} erreicht ✓`); break; }

  // Minima mitschreiben — belegt, dass Trainer UND Monster wirklich Schaden nehmen.
  minTrainerHp = Math.min(minTrainerHp, s.trainerHp);
  if (s.companion) minCompanionHp = Math.min(minCompanionHp, s.companion.hp);
  if (s.floor > maxFloor) { maxFloor = s.floor; say(`→ Etage ${s.floor}`); }
  maxElitesSeen = Math.max(maxElitesSeen, s.elites ?? 0);
  if (s.roomKind === 'laden') sawShop = true;
  maxLevel = Math.max(maxLevel, ...(s.team ?? ['x Lv1:0']).map((t) => Number(/Lv(\d+)/.exec(t)?.[1] ?? 1)));

  // 1a) Fangen wie ein Mensch: erst den Raum entschärfen, dann den letzten
  //     Gegner holen. Mitten im Gefecht das Feuer einzustellen ist Selbstmord
  //     — dieses Verhalten hätte sonst als "zu schwer" fehlinterpretiert.
  const catchable =
    (s.team ?? []).length < 4 && s.enemies.length === 1
      ? s.enemies.find((e) => !e.boss && e.ratio <= 0.34)
      : null;
  if (catchable) {
    await aimAt(catchable.x, catchable.y);
    const d = Math.hypot(catchable.x - s.player.x, catchable.y - s.player.y);
    if (d > 110) {
      if (firing) { await page.mouse.up(); firing = false; } // nicht weiterschiessen, sonst stirbt das Fangziel
      await steerTowards(catchable.x, catchable.y, s.player.x, s.player.y);
    } else {
      await releaseAll();
      // Unter der Fangschwelle (30 %) den Ball werfen, sonst warten, bis das
      // Begleitmonster weiter geschwächt hat.
      await page.keyboard.press('e');
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(70);
    continue;
  }
  if (!firing) { await page.mouse.down(); firing = true; }

  // 1b) Gegner da? → auf den nächsten zielen und draufhalten.
  if (s.enemies.length > 0) {
    const target = s.enemies.reduce((a, b) => {
      const da = Math.hypot(a.x - s.player.x, a.y - s.player.y);
      const db = Math.hypot(b.x - s.player.x, b.y - s.player.y);
      return da < db ? a : b;
    });
    await aimAt(target.x, target.y);


    // Wie ein Mensch spielen: Wunschdistanz halten UND seitlich ausweichen.
    // Ein still stehender Bot ist ein Strohmann — gegen den zu balancieren
    // würde das Spiel für echte Spieler zu leicht machen.
    const dist = Math.hypot(target.x - s.player.x, target.y - s.player.y);
    const ang = Math.atan2(target.y - s.player.y, target.x - s.player.x);
    const strafe = Math.sin(step / 6) > 0 ? 1 : -1;
    const radial = dist > 230 ? 1 : dist < 130 ? -1 : 0;
    const gx = s.player.x + Math.cos(ang) * 80 * radial + Math.cos(ang + Math.PI / 2) * 70 * strafe;
    const gy = s.player.y + Math.sin(ang) * 80 * radial + Math.sin(ang + Math.PI / 2) * 70 * strafe;
    await steerTowards(gx, gy, s.player.x, s.player.y);
    // Nebenbei fangen, falls das Ziel ohnehin geschwächt und nah genug ist.
    if (!target.boss && target.ratio <= 0.3 && dist <= 140 && (s.team ?? []).length < 4) {
      await page.keyboard.press('e');
    }
    goal = null;
    continue;
  }

  // 2a) Laden: bezahlbare Angebote mitnehmen.
  const buyable = (s.stands ?? []).find((st) => !st.sold && st.price <= s.currency);
  if (buyable) {
    if (firing) { await page.mouse.up(); firing = false; }
    // Gekauft wird per E, wenn man auf dem Podest steht (nicht durchs Laufen).
    const d = Math.hypot(buyable.x - s.player.x, buyable.y - s.player.y);
    if (d < 26) {
      await releaseAll();
      await page.keyboard.press('e');
      await page.waitForTimeout(160);
    } else {
      await steerTowards(buyable.x, buyable.y - 4, s.player.x, s.player.y);
    }
    await page.waitForTimeout(70);
    continue;
  }

  // 2b) Portal vorhanden? → hin.
  if (s.portal) { goal = s.portal; goalKind = 'portal'; }
  // 3) Truhe offen und unberührt? → hin.
  else if (s.chest && !s.chest.opened) { goal = s.chest; goalKind = 'truhe'; }
  // 4) Sonst: nächste unbesuchte Tür.
  else if (!goal || goalKind === 'tuer') {
    const dirs = Object.keys(s.doors);
    // Bevorzugt eine Tür in einen noch nicht besuchten Raum.
    const pick = dirs.find((d) => !visitedRooms.has(`${s.floor}:${s.neighbors[d]}`)) ?? dirs[step % dirs.length];
    const door = s.doors[pick];
    goal = tileWorld(door.col, door.row);
    goalKind = 'tuer';
  }

  if (goal) {
    await steerTowards(goal.x, goal.y, s.player.x, s.player.y);
    if (Math.hypot(goal.x - s.player.x, goal.y - s.player.y) < 14 && goalKind !== 'tuer') goal = null;
  }

  await page.waitForTimeout(70);
}

if (firing) await page.mouse.up();
await releaseAll();
await page.waitForTimeout(400);

const final = (await snapshot()) ?? lastGood ?? {};
await page.screenshot({ path: `${SHOT_DIR}/02-endzustand.png` });

say('---');
say(`Ergebnis:            ${final.runOver || !final.floor ? 'Trainer gefallen' : 'noch am Leben'}`);
say(`Schritte:            ${step}`);
say(`Räume besucht:       ${visitedRooms.size}`);
say(`Abbruchgrund:        ${step >= MAX_STEPS ? 'Schrittlimit' : Date.now() >= DEADLINE ? 'Zeitbudget' : 'Run beendet'}`);
say(`Etage erreicht:      ${final.floor ?? '—'}`);
say(`Gegner besiegt:      ${final.stats?.kills ?? 0}`);
say(`Monster gefangen:    ${final.stats?.catches ?? 0}`);
say(`Räume geräumt:       ${final.stats?.roomsCleared ?? 0}`);
say(`Bosse besiegt:       ${final.stats?.bossesDefeated ?? 0}`);
say(`Relikte:             ${JSON.stringify(final.relics ?? [])}`);
say(`Elites gleichzeitig: ${maxElitesSeen}`);
say(`Elites besiegt:      ${final.stats?.elitesDefeated ?? 0}`);
say(`Laden besucht:       ${sawShop ? 'ja' : 'nein'}`);
say(`Im Laden gekauft:    ${final.stats?.purchases ?? 0}`);
say(`Höchste Stufe:       ${maxLevel}`);
say(`Team:                ${JSON.stringify(final.team ?? [])}`);
say(`Ätherstaub:          ${final.currency ?? 0}`);
say(`Trainer-HP:          ${final.trainerHp ?? '—'}/${final.trainerMaxHp ?? '—'}  (Minimum ${minTrainerHp === Infinity ? '—' : minTrainerHp})`);
say(`Monster-HP-Minimum:  ${minCompanionHp === Infinity ? '—' : minCompanionHp}`);

// Gespeicherter Meta-Fortschritt (überlebt den Tod).
const meta = await page.evaluate(() => localStorage.getItem('monster-roguelite:save'));
say(`localStorage:        ${meta ?? '(leer)'}`);

say(`Konsolenfehler:      ${errors.length === 0 ? 'keine ✓' : JSON.stringify(errors.slice(0, 8), null, 1)}`);

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
