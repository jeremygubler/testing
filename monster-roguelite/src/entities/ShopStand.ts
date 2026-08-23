import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import type { ShopOffer } from '../world/FloorGenerator';

const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

/**
 * Ein Verkaufspodest im Laden-Raum.
 *
 * Bewusst ohne Physikkörper: Die Nähe wird in `GameScene` per Abstand geprüft,
 * nicht per Overlap-Callback. Ein Overlap-Flag hätte eine Frame-Abhängigkeit —
 * Phaser wertet die Physik vor `scene.update()` aus, der Tastendruck kommt
 * aber davor, und das Flag wäre beim Kauf immer schon zurückgesetzt.
 *
 * Das Podest kennt nur sein Angebot und seine Darstellung — ob gekauft werden
 * darf, entscheidet die `GameScene` (sie kennt den Kontostand).
 */
export class ShopStand extends Phaser.GameObjects.Sprite {
  readonly offer: ShopOffer;
  private label: Phaser.GameObjects.Text;
  private priceLabel: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, offer: ShopOffer) {
    super(scene, x, y, 'square');
    scene.add.existing(this);

    this.offer = offer;
    this.setDisplaySize(30, 14);
    this.setTint(0x3a4364);
    this.setDepth(9);

    this.icon = scene.add
      .image(x, y - 26, 'orb')
      .setTint(offer.color)
      .setDisplaySize(20, 20)
      .setDepth(11);
    scene.tweens.add({
      targets: this.icon,
      y: y - 32,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.label = scene.add
      .text(x, y - 52, offer.name, {
        fontFamily: FONT,
        fontSize: '12px',
        color: COLORS.text,
        align: 'center',
        stroke: '#000000',
        strokeThickness: 3,
        wordWrap: { width: 130 },
      })
      .setOrigin(0.5, 1)
      .setDepth(12);

    this.priceLabel = scene.add
      .text(x, y + 14, `✦ ${offer.price}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#fbbf24',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(12);
  }

  /**
   * Zustandsanzeige: bezahlbar (Farbe) und in Reichweite (Kaufhinweis).
   *
   * Nicht `setState` nennen — `Phaser.GameObjects.GameObject` hat bereits eine
   * Methode dieses Namens; sie zu überschreiben bricht die Typidentität des
   * Sprites und damit stillschweigend `scene.add.existing()`.
   *
   * Gekauft wird bewusst per Tastendruck, nicht durchs Drüberlaufen — die
   * Podeste stehen quer im Raum, und Ätherstaub ist die Meta-Währung. Ein
   * versehentlicher Kauf wäre nicht rückgängig zu machen.
   */
  refreshLabels(affordable: boolean, inRange: boolean): void {
    if (this.offer.sold) return;
    this.priceLabel.setColor(affordable ? '#fbbf24' : '#6b7280');
    this.icon.setAlpha(affordable ? 1 : 0.45);
    this.priceLabel.setText(
      inRange && affordable ? `✦ ${this.offer.price}  ·  E kaufen` : `✦ ${this.offer.price}`,
    );
    this.setTint(inRange ? 0x566494 : 0x3a4364);
  }

  markSold(): void {
    this.offer.sold = true;
    this.icon.destroy();
    this.label.setText('verkauft').setColor(COLORS.textDim);
    this.priceLabel.setText('').setVisible(false);
    this.setTint(0x252b3d);
  }

  override destroy(fromScene?: boolean): void {
    this.icon.destroy();
    this.label.destroy();
    this.priceLabel.destroy();
    super.destroy(fromScene);
  }
}
