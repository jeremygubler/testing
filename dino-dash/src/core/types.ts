export type Action = 'left' | 'right' | 'jump' | 'duck' | 'confirm' | 'back' | 'pause';

export type PowerUpKind = 'magnet' | 'shield' | 'boost' | 'spring';

/** Every entity that travels down the path towards the camera. */
export interface Positioned {
  /** Lane index: -1, 0 or 1. */
  lane: number;
  /** Distance from the camera along the path. */
  z: number;
  /** Marked once the entity has been consumed or has passed the camera. */
  dead: boolean;
}

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  onAction?(action: Action): void;
  onTap?(x: number, y: number): void;
}
