import { VIEW } from './config';
import type { Action } from './types';

const SWIPE_THRESHOLD = 28;
const TAP_MAX_DISTANCE = 16;

/**
 * Collects keyboard and touch input into a queue of discrete actions plus a
 * queue of taps in view coordinates. Scenes drain both once per frame.
 */
export class Input {
  private actions: Action[] = [];
  private taps: { x: number; y: number }[] = [];
  private startX = 0;
  private startY = 0;
  private tracking = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Removes and returns everything queued since the last call. */
  drainActions(): Action[] {
    const drained = this.actions;
    this.actions = [];
    return drained;
  }

  drainTaps(): { x: number; y: number }[] {
    const drained = this.taps;
    this.taps = [];
    return drained;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const action = keyToAction(event.code);
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) this.actions.push(action);
  };

  private onPointerDown = (event: PointerEvent) => {
    this.tracking = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.tracking) return;
    this.tracking = false;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    if (Math.abs(dx) < TAP_MAX_DISTANCE && Math.abs(dy) < TAP_MAX_DISTANCE) {
      this.taps.push(this.toViewSpace(event.clientX, event.clientY));
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > SWIPE_THRESHOLD) this.actions.push(dx > 0 ? 'right' : 'left');
    } else if (Math.abs(dy) > SWIPE_THRESHOLD) {
      this.actions.push(dy > 0 ? 'duck' : 'jump');
    }
  };

  private onPointerCancel = () => {
    this.tracking = false;
  };

  /** Maps client coordinates onto the fixed internal resolution. */
  private toViewSpace(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW.W,
      y: ((clientY - rect.top) / rect.height) * VIEW.H,
    };
  }
}

function keyToAction(code: string): Action | null {
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'ArrowUp':
    case 'KeyW':
    case 'Space':
      return 'jump';
    case 'ArrowDown':
    case 'KeyS':
      return 'duck';
    case 'Enter':
      return 'confirm';
    case 'Escape':
      return 'back';
    case 'KeyP':
      return 'pause';
    default:
      return null;
  }
}
