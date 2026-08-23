import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';

/**
 * Truhe als Relikt-Quelle. Öffnet sich, wenn der Trainer sie berührt und der
 * Raum leergekämpft ist — sonst würde man Truhen im Kampf mitnehmen und die
 * Raum-Belohnung entwerten.
 */
export class Chest extends Phaser.Physics.Arcade.Sprite {
  opened = false;
  private glow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'chest');
    scene.add.existing(this);
    scene.physics.add.existing(this, true);

    this.setTint(COLORS.chest);
    this.setDepth(10);

    this.glow = scene.add
      .image(x, y, 'orb_big')
      .setTint(COLORS.gold)
      .setAlpha(0.18)
      .setDisplaySize(56, 56)
      .setDepth(9);
    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.1, to: 0.3 },
      duration: 900,
      yoyo: true,
      repeat: -1,
    });
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.setTint(0x555555);
    this.glow.destroy();
    (this.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.scene.tweens.add({
      targets: this,
      scaleY: 0.7,
      y: this.y + 4,
      duration: 180,
      ease: 'Quad.easeOut',
    });
  }

  override destroy(fromScene?: boolean): void {
    this.glow.destroy();
    super.destroy(fromScene);
  }
}
