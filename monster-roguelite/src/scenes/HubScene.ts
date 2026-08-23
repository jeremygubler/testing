import Phaser from 'phaser';
import { COLORS, VIEW_H, VIEW_W } from '../config/GameConfig';
import { getSpecies, WILD_SPECIES } from '../data/monsters';
import { RARITY_COLORS, RARITY_LABELS } from '../data/relics';
import { TYPE_COLORS, TYPE_LABELS } from '../data/types';
import {
  LOCKABLE_STARTERS,
  UPGRADE_DEFS,
  dexProgress,
  loadMeta,
  lockedRelics,
  resetMeta,
  saveMeta,
  upgradeCost,
  type MetaSave,
  type PermUpgrades,
} from '../meta/MetaSave';
import { Button, FONT, heading } from '../ui/Widgets';

type Tab = 'start' | 'shop' | 'dex';

/**
 * Der Hub zwischen zwei Runs: Start-Monster wählen, dauerhafte Upgrades und
 * Freischaltungen kaufen, Dex ansehen.
 *
 * Der Hub schreibt direkt in den Meta-Save — er ist der einzige Ort, an dem
 * Ätherstaub ausgegeben wird.
 */
export class HubScene extends Phaser.Scene {
  private meta!: MetaSave;
  private tab: Tab = 'start';
  private selectedStarter = '';
  /** Alles, was beim Tab-Wechsel weggeräumt wird. */
  private panel: Phaser.GameObjects.GameObject[] = [];
  private txtCurrency!: Phaser.GameObjects.Text;
  private txtHint!: Phaser.GameObjects.Text;

  constructor() {
    super('Hub');
  }

  create(): void {
    this.meta = loadMeta();
    this.selectedStarter = this.meta.unlockedStarters[0] ?? 'glutfuchs';
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.buildChrome();
    this.showTab('start');
  }

  // --- Rahmen ------------------------------------------------------------

  private buildChrome(): void {
    this.add
      .text(VIEW_W / 2, 34, 'AETHERBEASTS', {
        fontFamily: FONT,
        fontSize: '34px',
        color: '#8ad7ff',
      })
      .setOrigin(0.5);
    this.add
      .text(VIEW_W / 2, 62, 'Basislager', {
        fontFamily: FONT,
        fontSize: '14px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    this.txtCurrency = this.add
      .text(VIEW_W - 20, 20, '', { fontFamily: FONT, fontSize: '17px', color: '#fbbf24' })
      .setOrigin(1, 0);

    const dex = dexProgress(this.meta);
    this.add
      .text(20, 20, `Dex ${dex.caught}/${dex.total}   ·   Runs ${this.meta.lifetime.runs}   ·   Beste Etage ${this.meta.lifetime.bestFloor}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: COLORS.textDim,
      });

    const tabs: { key: Tab; label: string }[] = [
      { key: 'start', label: 'Run starten' },
      { key: 'shop', label: 'Shop' },
      { key: 'dex', label: 'Dex' },
    ];
    tabs.forEach((t, i) => {
      const btn = new Button(
        this,
        VIEW_W / 2 + (i - 1) * 150,
        98,
        t.label,
        { width: 142, height: 32, fontSize: '14px' },
        () => this.showTab(t.key),
      );
      btn.setName(`tab_${t.key}`);
    });

    this.txtHint = this.add
      .text(VIEW_W / 2, VIEW_H - 22, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    this.refreshCurrency();
  }

  private refreshCurrency(): void {
    this.txtCurrency.setText(`✦ ${this.meta.currency} Ätherstaub`);
    (['start', 'shop', 'dex'] as Tab[]).forEach((key) => {
      const btn = this.children.getByName(`tab_${key}`) as Button | null;
      btn?.setHighlight(key === this.tab);
    });
  }

  private hint(text: string, color: string = COLORS.textDim): void {
    this.txtHint.setText(text).setColor(color);
  }

  private clearPanel(): void {
    this.panel.forEach((o) => o.destroy());
    this.panel = [];
  }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.panel.push(obj);
    return obj;
  }

  private showTab(tab: Tab): void {
    this.tab = tab;
    this.clearPanel();
    this.refreshCurrency();
    if (tab === 'start') this.buildStartTab();
    else if (tab === 'shop') this.buildShopTab();
    else this.buildDexTab();
  }

  // --- Tab: Run starten --------------------------------------------------

  private buildStartTab(): void {
    this.track(heading(this, 60, 140, 'START-MONSTER WÄHLEN', VIEW_W - 120));

    const ids = this.meta.unlockedStarters;
    const perRow = 4;
    const cardW = 190;
    const cardH = 108;
    const gapX = 14;
    const gapY = 14;
    const totalW = Math.min(perRow, ids.length) * (cardW + gapX) - gapX;
    const startX = (VIEW_W - totalW) / 2 + cardW / 2;

    ids.forEach((id, i) => {
      const species = getSpecies(id);
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = startX + col * (cardW + gapX);
      const y = 226 + row * (cardH + gapY);

      const card = this.track(
        this.add.rectangle(x, y, cardW, cardH, 0x1a2036).setStrokeStyle(1, 0x3a4364),
      );
      card.setInteractive({ useHandCursor: true });
      card.setName(`card_${id}`);
      card.on('pointerdown', () => {
        this.selectedStarter = id;
        this.buildStartTab();
      });

      this.track(
        this.add
          .image(x - cardW / 2 + 32, y - 18, 'orb')
          .setTint(TYPE_COLORS[species.type])
          .setDisplaySize(30, 30),
      );
      this.track(
        this.add.text(x - cardW / 2 + 54, y - 32, species.name, {
          fontFamily: FONT,
          fontSize: '16px',
          color: COLORS.text,
        }),
      );
      this.track(
        this.add.text(x - cardW / 2 + 54, y - 12, TYPE_LABELS[species.type], {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#' + TYPE_COLORS[species.type].toString(16).padStart(6, '0'),
        }),
      );
      this.track(
        this.add.text(
          x - cardW / 2 + 12,
          y + 12,
          `HP ${species.maxHp}  ATK ${species.attack}  AS ${species.attackSpeed.toFixed(2)}/s\n${patternLabel(species.pattern)}`,
          { fontFamily: FONT, fontSize: '11px', color: COLORS.textDim, lineSpacing: 3 },
        ),
      );

      if (id === this.selectedStarter) card.setStrokeStyle(2, 0x8ad7ff);
    });

    const chosen = getSpecies(this.selectedStarter);
    this.track(
      this.add
        .text(VIEW_W / 2, VIEW_H - 116, chosen.blurb, {
          fontFamily: FONT,
          fontSize: '13px',
          color: COLORS.textDim,
          align: 'center',
          wordWrap: { width: 620 },
        })
        .setOrigin(0.5),
    );

    this.track(
      new Button(
        this,
        VIEW_W / 2,
        VIEW_H - 66,
        '▶  RUN STARTEN',
        { width: 240, height: 42, fill: 0x1f4d3a, hover: 0x2b6b50, fontSize: '17px' },
        () => {
          this.scene.start('Game', { starterId: this.selectedStarter });
        },
      ),
    );

    this.hint('Tipp: Schwäche Gegner unter 30 % HP und drücke E, um sie zu fangen.');
  }

  // --- Tab: Shop ---------------------------------------------------------

  private buildShopTab(): void {
    // Spalte 1: dauerhafte Stat-Upgrades.
    this.track(heading(this, 40, 140, 'DAUERHAFTE UPGRADES', 280));
    UPGRADE_DEFS.forEach((def, i) => {
      const level = this.meta.upgrades[def.key];
      const maxed = level >= def.maxLevel;
      const cost = upgradeCost(def.key, level);
      const y = 180 + i * 62;

      this.track(
        this.add.text(40, y, `${def.name}  ${level}/${def.maxLevel}`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: COLORS.text,
        }),
      );
      this.track(
        this.add.text(40, y + 18, def.desc, {
          fontFamily: FONT,
          fontSize: '11px',
          color: COLORS.textDim,
        }),
      );
      this.track(
        new Button(
          this,
          268,
          y + 14,
          maxed ? 'MAX' : `✦ ${cost}`,
          {
            width: 88,
            height: 30,
            fontSize: '13px',
            disabled: maxed || this.meta.currency < cost,
          },
          () => this.buyUpgrade(def.key, cost),
        ),
      );
    });

    // Spalte 2: neue Start-Monster.
    this.track(heading(this, 360, 140, 'NEUE START-MONSTER', 240));
    const lockedStarters = LOCKABLE_STARTERS.filter(
      (s) => !this.meta.unlockedStarters.includes(s.id),
    );
    if (lockedStarters.length === 0) {
      this.track(
        this.add.text(360, 180, 'Alle freigeschaltet ✓', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#4ade80',
        }),
      );
    }
    lockedStarters.slice(0, 5).forEach((entry, i) => {
      const species = getSpecies(entry.id);
      const y = 180 + i * 62;
      this.track(
        this.add
          .image(370, y + 10, 'orb')
          .setTint(TYPE_COLORS[species.type])
          .setDisplaySize(20, 20),
      );
      this.track(
        this.add.text(386, y, species.name, {
          fontFamily: FONT,
          fontSize: '14px',
          color: COLORS.text,
        }),
      );
      this.track(
        this.add.text(386, y + 18, `${TYPE_LABELS[species.type]} · ${patternLabel(species.pattern)}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: COLORS.textDim,
          wordWrap: { width: 140 },
        }),
      );
      this.track(
        new Button(
          this,
          586,
          y + 14,
          `✦ ${entry.cost}`,
          { width: 84, height: 30, fontSize: '13px', disabled: this.meta.currency < entry.cost },
          () => this.buyStarter(entry.id, entry.cost),
        ),
      );
    });

    // Spalte 3: Relikte für den Run-Pool.
    this.track(heading(this, 650, 140, 'RELIKTE FÜR DEN RUN-POOL', 270));
    const locked = lockedRelics(this.meta);
    if (locked.length === 0) {
      this.track(
        this.add.text(650, 180, 'Alle freigeschaltet ✓', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#4ade80',
        }),
      );
    }
    locked.slice(0, 5).forEach((relic, i) => {
      const y = 180 + i * 62;
      const cost = relic.unlockCost ?? 200;
      this.track(
        this.add.image(660, y + 10, 'orb').setTint(relic.color).setDisplaySize(18, 18),
      );
      this.track(
        this.add.text(674, y, relic.name, {
          fontFamily: FONT,
          fontSize: '14px',
          color: RARITY_COLORS[relic.rarity],
        }),
      );
      this.track(
        this.add.text(674, y + 18, relic.desc, {
          fontFamily: FONT,
          fontSize: '11px',
          color: COLORS.textDim,
          wordWrap: { width: 150 },
        }),
      );
      this.track(
        new Button(
          this,
          880,
          y + 14,
          `✦ ${cost}`,
          { width: 78, height: 30, fontSize: '13px', disabled: this.meta.currency < cost },
          () => this.buyRelic(relic.id, cost),
        ),
      );
    });

    this.track(
      new Button(
        this,
        VIEW_W - 80,
        VIEW_H - 52,
        'Spielstand löschen',
        { width: 150, height: 26, fontSize: '11px', fill: 0x3b1d1d, hover: 0x5c2a2a },
        () => {
          this.meta = resetMeta();
          this.selectedStarter = this.meta.unlockedStarters[0]!;
          this.scene.restart();
        },
      ),
    );

    this.hint('Ätherstaub verdienst du in Runs — er überlebt den Tod.');
  }

  private buyUpgrade(key: keyof PermUpgrades, cost: number): void {
    if (this.meta.currency < cost) return;
    this.meta.currency -= cost;
    this.meta.upgrades[key]++;
    saveMeta(this.meta);
    this.showTab('shop');
    this.hint('Upgrade gekauft.', '#4ade80');
  }

  private buyStarter(id: string, cost: number): void {
    if (this.meta.currency < cost || this.meta.unlockedStarters.includes(id)) return;
    this.meta.currency -= cost;
    this.meta.unlockedStarters.push(id);
    saveMeta(this.meta);
    this.showTab('shop');
    this.hint(`${getSpecies(id).name} freigeschaltet!`, '#4ade80');
  }

  private buyRelic(id: string, cost: number): void {
    if (this.meta.currency < cost || this.meta.unlockedRelics.includes(id)) return;
    this.meta.currency -= cost;
    this.meta.unlockedRelics.push(id);
    saveMeta(this.meta);
    this.showTab('shop');
    this.hint('Relikt ist ab jetzt im Run-Pool.', '#4ade80');
  }

  // --- Tab: Dex ----------------------------------------------------------

  private buildDexTab(): void {
    const progress = dexProgress(this.meta);
    this.track(
      heading(this, 60, 140, `MONSTER-DEX  —  ${progress.caught}/${progress.total} gefangen`, VIEW_W - 120),
    );

    const perRow = 5;
    const cellW = 168;
    const cellH = 74;
    const startX = (VIEW_W - perRow * cellW) / 2 + cellW / 2;

    WILD_SPECIES.forEach((species, i) => {
      const entry = this.meta.dex[species.id];
      const caught = (entry?.caught ?? 0) > 0;
      const seen = caught || (entry?.defeated ?? 0) > 0;
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = startX + col * cellW;
      const y = 200 + row * cellH;

      this.track(
        this.add
          .rectangle(x, y, cellW - 10, cellH - 10, 0x1a2036)
          .setStrokeStyle(1, caught ? 0x4ade80 : 0x3a4364, caught ? 0.9 : 0.6),
      );
      this.track(
        this.add
          .image(x - cellW / 2 + 28, y, 'orb')
          .setTint(seen ? TYPE_COLORS[species.type] : 0x2b3450)
          .setDisplaySize(26, 26),
      );
      this.track(
        this.add.text(x - cellW / 2 + 48, y - 20, seen ? species.name : '???', {
          fontFamily: FONT,
          fontSize: '14px',
          color: seen ? COLORS.text : '#4b5578',
        }),
      );
      this.track(
        this.add.text(
          x - cellW / 2 + 48,
          y - 2,
          seen ? TYPE_LABELS[species.type] : '—',
          {
            fontFamily: FONT,
            fontSize: '11px',
            color: seen ? '#' + TYPE_COLORS[species.type].toString(16).padStart(6, '0') : '#4b5578',
          },
        ),
      );
      this.track(
        this.add.text(
          x - cellW / 2 + 48,
          y + 14,
          seen
            ? `gefangen ${entry?.caught ?? 0} · besiegt ${entry?.defeated ?? 0}`
            : 'noch nie begegnet',
          { fontFamily: FONT, fontSize: '10px', color: COLORS.textDim },
        ),
      );
    });

    const lifetimeLine = `Insgesamt: ${this.meta.lifetime.kills} Siege · ${this.meta.lifetime.catches} Fänge · ${this.meta.lifetime.totalCurrencyEarned} Ätherstaub verdient`;
    this.track(
      this.add
        .text(VIEW_W / 2, VIEW_H - 56, lifetimeLine, {
          fontFamily: FONT,
          fontSize: '12px',
          color: COLORS.textDim,
        })
        .setOrigin(0.5),
    );

    this.hint(`Relikte im Pool: ${this.meta.unlockedRelics.length} · Seltenheiten: ${Object.values(RARITY_LABELS).join(', ')}`);
  }
}

function patternLabel(pattern: string): string {
  const map: Record<string, string> = {
    single: 'Einzelschuss',
    spread3: 'Dreifach-Fächer',
    burst3: 'Dreier-Salve',
    homing: 'Zielsuchend',
    melee: 'Nahkampf',
    lob: 'Bogenwurf (Fläche)',
  };
  return map[pattern] ?? pattern;
}
