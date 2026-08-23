import Phaser from 'phaser';
import { COLORS, VIEW_H, VIEW_W } from '../config/GameConfig';
import { bus } from '../core/EventBus';
import type { RunState } from '../core/RunState';
import { getSpecies } from '../data/monsters';
import { TYPE_COLORS, TYPE_LABELS } from '../data/types';
import type { FloorPlan } from '../world/FloorGenerator';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

/**
 * HUD als eigene, transparente Szene über dem Spiel.
 *
 * Sie liest ausschliesslich aus `RunState` (via Registry) und reagiert auf
 * Events — kein direkter Zugriff auf Entities. Dadurch kann das HUD neu
 * gebaut werden, ohne das Gameplay anzufassen.
 */
export class HudScene extends Phaser.Scene {
  private run!: RunState;
  private gfx!: Phaser.GameObjects.Graphics;

  private txtFloor!: Phaser.GameObjects.Text;
  private txtCurrency!: Phaser.GameObjects.Text;
  private txtMonster!: Phaser.GameObjects.Text;
  private txtTeam!: Phaser.GameObjects.Text;
  private txtRelicHeader!: Phaser.GameObjects.Text;
  private relicTexts: Phaser.GameObjects.Text[] = [];
  private logLines: { text: Phaser.GameObjects.Text; until: number }[] = [];
  private unsubscribes: (() => void)[] = [];

  constructor() {
    super({ key: 'Hud', active: false });
  }

  create(): void {
    this.run = this.registry.get('run') as RunState;
    this.gfx = this.add.graphics().setDepth(0);

    const dim = { fontFamily: FONT, fontSize: '13px', color: COLORS.textDim };
    const bright = { fontFamily: FONT, fontSize: '15px', color: COLORS.text };

    this.txtFloor = this.add.text(14, 10, '', bright).setDepth(2);
    this.txtCurrency = this.add
      .text(VIEW_W - 14, 10, '', { ...bright, color: '#fbbf24' })
      .setOrigin(1, 0)
      .setDepth(2);

    this.txtMonster = this.add.text(14, 52, '', dim).setDepth(2);
    this.txtTeam = this.add.text(14, VIEW_H - 26, '', dim).setDepth(2);

    this.txtRelicHeader = this.add
      .text(VIEW_W - 14, 92, 'RELIKTE', { ...dim, fontSize: '11px' })
      .setOrigin(1, 0)
      .setDepth(2);

    this.add
      .text(
        VIEW_W - 14,
        VIEW_H - 26,
        'WASD bewegen · Maus zielen/schiessen · E fangen · Q/1-4 Monster · M Ton',
        { ...dim, fontSize: '11px' },
      )
      .setOrigin(1, 0)
      .setDepth(2);

    this.bindEvents();
    this.refresh();
  }

  private bindEvents(): void {
    this.unsubscribes.push(
      bus.on('hud:dirty', () => this.refresh()),
      bus.on('room:changed', () => this.refresh()),
      bus.on('log', (p) => this.pushLog(p.text, p.color ?? COLORS.text)),
      bus.on('shake', (p) => {
        const game = this.scene.get('Game');
        game?.cameras.main.shake(p.duration, p.intensity);
      }),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribes.forEach((fn) => fn());
      this.unsubscribes = [];
    });
  }

  // --- Zeichnen ----------------------------------------------------------

  private refresh(): void {
    if (!this.run) return;
    const plan = this.registry.get('plan') as FloorPlan | undefined;

    this.txtFloor.setText(
      `ETAGE ${this.run.floor}   ·   Raum ${this.run.roomIndex + 1}/${plan?.rooms.length ?? '?'}`,
    );
    this.txtCurrency.setText(`✦ ${this.run.currency} Ätherstaub`);

    const species = this.run.activeSpecies;
    const active = this.run.active;
    if (species && active) {
      this.txtMonster.setText(
        `${species.name}  Lv ${active.level}  [${TYPE_LABELS[species.type]}]   ${Math.ceil(active.hp)}/${this.run.maxHpOf(active)}`,
      );
      this.txtMonster.setColor('#' + TYPE_COLORS[species.type].toString(16).padStart(6, '0'));
    } else {
      this.txtMonster.setText('Kein einsatzfähiges Monster');
      this.txtMonster.setColor('#f87171');
    }

    this.txtTeam.setText(
      'Team: ' +
        (this.run.team.length === 0
          ? '—'
          : this.run.team
              .map((m, i) => {
                const s = getSpecies(m.speciesId);
                const marker = i === this.run.activeIndex ? '▶' : ' ';
                return `${marker}${i + 1} ${s.name} Lv${m.level}${m.hp <= 0 ? ' (K.O.)' : ''}`;
              })
              .join('   ')),
    );

    this.drawRelicList();
    this.drawBars();
    if (plan) this.drawMinimap(plan);
  }

  private drawRelicList(): void {
    const relics = this.run.relicList();
    // Textobjekte wiederverwenden statt jedes Mal neu zu erzeugen.
    while (this.relicTexts.length < relics.length) {
      this.relicTexts.push(
        this.add
          .text(VIEW_W - 14, 0, '', { fontFamily: FONT, fontSize: '12px', color: COLORS.text })
          .setOrigin(1, 0)
          .setDepth(2),
      );
    }
    this.relicTexts.forEach((t, i) => {
      const entry = relics[i];
      if (!entry) {
        t.setVisible(false);
        return;
      }
      t.setVisible(true);
      t.setPosition(VIEW_W - 14, 108 + i * 16);
      t.setText(`${entry.relic.name}${entry.stacks > 1 ? ` ×${entry.stacks}` : ''}`);
      t.setColor('#' + entry.relic.color.toString(16).padStart(6, '0'));
    });
    this.txtRelicHeader.setVisible(relics.length > 0);
  }

  private drawBars(): void {
    const g = this.gfx;
    g.clear();

    // Halbtransparente Leisten oben/unten, damit Text über dem Raum lesbar bleibt.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, 0, VIEW_W, 46);
    g.fillRect(0, VIEW_H - 32, VIEW_W, 32);

    // Trainer-HP.
    const maxHp = this.run.trainerMaxHp;
    const ratio = Phaser.Math.Clamp(this.run.trainerHp / maxHp, 0, 1);
    const w = 200;
    const x = 14;
    const y = 30;
    g.fillStyle(0x1e2437, 1);
    g.fillRect(x, y, w, 12);
    g.fillStyle(ratio > 0.35 ? COLORS.hpGood : COLORS.hpBad, 1);
    g.fillRect(x, y, w * ratio, 12);
    g.lineStyle(1, 0x000000, 0.6);
    g.strokeRect(x, y, w, 12);

    // Monster-HP direkt darunter.
    const species = this.run.activeSpecies;
    const active = this.run.active;
    if (species && active) {
      const mRatio = Phaser.Math.Clamp(active.hp / this.run.maxHpOf(active), 0, 1);
      g.fillStyle(0x1e2437, 1);
      g.fillRect(x, y + 40, w, 8);
      g.fillStyle(TYPE_COLORS[species.type], 1);
      g.fillRect(x, y + 40, w * mRatio, 8);
    }
  }

  /** Minikarte oben rechts: besuchte Räume, aktueller Raum, Boss. */
  private drawMinimap(plan: FloorPlan): void {
    const g = this.gfx;
    const cell = 11;
    const gap = 3;
    const cols = plan.bounds.maxX - plan.bounds.minX + 1;
    const width = cols * (cell + gap);
    const originX = VIEW_W - 14 - width;
    const originY = 30;

    for (const room of plan.rooms) {
      const rx = originX + (room.gx - plan.bounds.minX) * (cell + gap);
      const ry = originY + (room.gy - plan.bounds.minY) * (cell + gap);
      const isCurrent = room.index === this.run.roomIndex;

      let color = 0x2b3450;
      if (room.visited) color = room.cleared ? 0x475569 : 0x7f1d1d;
      if (room.kind === 'boss' && room.visited) color = 0xb91c1c;
      if (room.kind === 'schatz' && room.visited) color = 0xb45309;
      if (room.kind === 'laden' && room.visited) color = 0xca8a04;
      if (isCurrent) color = 0x8ad7ff;

      g.fillStyle(color, room.visited || isCurrent ? 1 : 0.35);
      g.fillRect(rx, ry, cell, cell);

      // Verbindungen zu bereits besuchten Nachbarn andeuten.
      if (room.visited) {
        g.fillStyle(0x475569, 0.7);
        if (room.neighbors.east !== undefined) g.fillRect(rx + cell, ry + cell / 2 - 1, gap, 2);
        if (room.neighbors.south !== undefined) g.fillRect(rx + cell / 2 - 1, ry + cell, 2, gap);
      }
    }
  }

  // --- Log ---------------------------------------------------------------

  private pushLog(text: string, color: string): void {
    const line = this.add
      .text(VIEW_W / 2, 0, text, {
        fontFamily: FONT,
        fontSize: '14px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(5);

    this.logLines.push({ text: line, until: this.time.now + 3200 });
    // Maximal fünf Zeilen gleichzeitig.
    while (this.logLines.length > 5) {
      this.logLines.shift()?.text.destroy();
    }
    this.layoutLog();
  }

  private layoutLog(): void {
    this.logLines.forEach((entry, i) => {
      entry.text.setY(56 + i * 19);
      entry.text.setAlpha(1 - i * 0.12);
    });
  }

  override update(time: number): void {
    if (this.logLines.length === 0) return;
    let removed = false;
    for (let i = this.logLines.length - 1; i >= 0; i--) {
      if (time > this.logLines[i]!.until) {
        this.logLines[i]!.text.destroy();
        this.logLines.splice(i, 1);
        removed = true;
      }
    }
    if (removed) this.layoutLog();
  }
}
