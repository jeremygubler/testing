import Phaser from 'phaser';

export const FONT = 'Trebuchet MS, Segoe UI, sans-serif';

export interface ButtonStyle {
  width: number;
  height: number;
  fill?: number;
  hover?: number;
  textColor?: string;
  fontSize?: string;
  disabled?: boolean;
}

/**
 * Kleiner Button aus Rechteck + Text. Bewusst kein DOM: so bleibt die UI im
 * Canvas und skaliert automatisch mit dem Phaser-Scale-Manager mit.
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private style: Required<Omit<ButtonStyle, 'disabled'>> & { disabled: boolean };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    style: ButtonStyle,
    onClick: () => void,
  ) {
    super(scene, x, y);
    this.style = {
      width: style.width,
      height: style.height,
      fill: style.fill ?? 0x232a42,
      hover: style.hover ?? 0x36406a,
      textColor: style.textColor ?? '#e6e9f5',
      fontSize: style.fontSize ?? '15px',
      disabled: style.disabled ?? false,
    };

    this.bg = scene.add
      .rectangle(0, 0, this.style.width, this.style.height, this.style.fill)
      .setStrokeStyle(1, 0x4b5578, 0.9);
    this.label = scene.add
      .text(0, 0, text, {
        fontFamily: FONT,
        fontSize: this.style.fontSize,
        color: this.style.textColor,
        align: 'center',
        wordWrap: { width: this.style.width - 16 },
      })
      .setOrigin(0.5);

    this.add([this.bg, this.label]);
    scene.add.existing(this);

    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => {
      if (!this.style.disabled) this.bg.setFillStyle(this.style.hover);
    });
    this.bg.on('pointerout', () => this.bg.setFillStyle(this.style.fill));
    this.bg.on('pointerdown', () => {
      if (this.style.disabled) return;
      scene.tweens.add({ targets: this, scale: { from: 0.96, to: 1 }, duration: 110 });
      onClick();
    });

    this.applyDisabled();
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.style.disabled = disabled;
    this.applyDisabled();
    return this;
  }

  setHighlight(on: boolean): this {
    this.bg.setStrokeStyle(on ? 2 : 1, on ? 0x8ad7ff : 0x4b5578, on ? 1 : 0.9);
    return this;
  }

  private applyDisabled(): void {
    this.setAlpha(this.style.disabled ? 0.4 : 1);
    this.bg.setFillStyle(this.style.fill);
  }
}

/** Überschrift mit dünner Trennlinie darunter. */
export function heading(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  width: number,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: '13px',
    color: '#8b93b0',
  });
  scene.add.rectangle(x, y + 20, width, 1, 0x3a4364).setOrigin(0, 0);
  return t;
}
