import { shade, tint } from '../render/draw';

export interface Skin {
  id: string;
  name: string;
  /** Eggs required to unlock. Zero means available from the start. */
  cost: number;
  body: string;
  belly: string;
  spike: string;
  blush: string;
  pupil: string;
  /** Adds a soft outer glow when drawn. */
  glow?: boolean;
  /** Cycles the body hue over time. */
  rainbow?: boolean;
}

export const SKINS: Skin[] = [
  {
    id: 'classic',
    name: 'Rex',
    cost: 0,
    body: '#7ed06a',
    belly: '#dcf3bd',
    spike: '#f2a65a',
    blush: '#ff9fb0',
    pupil: '#3b2a4a',
  },
  {
    id: 'berry',
    name: 'Beere',
    cost: 60,
    body: '#e88fc0',
    belly: '#ffdcee',
    spike: '#a86fd6',
    blush: '#ff7f9c',
    pupil: '#4a2a45',
  },
  {
    id: 'sky',
    name: 'Wölkchen',
    cost: 150,
    body: '#7bb8f0',
    belly: '#dcefff',
    spike: '#ffd36e',
    blush: '#ff9fb0',
    pupil: '#2a3a5a',
  },
  {
    id: 'sunny',
    name: 'Sonnenschein',
    cost: 300,
    body: '#f6c95c',
    belly: '#fff2cc',
    spike: '#ff8f5e',
    blush: '#ff8fa8',
    pupil: '#4a3a1a',
  },
  {
    id: 'mint',
    name: 'Minze',
    cost: 500,
    body: '#79dbc4',
    belly: '#d9fff4',
    spike: '#ff9ecb',
    blush: '#ff8fa8',
    pupil: '#255045',
  },
  {
    id: 'shadow',
    name: 'Schattenpfote',
    cost: 800,
    body: '#6b5b8a',
    belly: '#a294c4',
    spike: '#63e6d8',
    blush: '#9f8fc5',
    pupil: '#63e6d8',
    glow: true,
  },
  {
    id: 'rainbow',
    name: 'Regenbogen',
    cost: 1500,
    body: '#ff8fa8',
    belly: '#fff0f5',
    spike: '#ffd36e',
    blush: '#ff7f9c',
    pupil: '#3b2a4a',
    rainbow: true,
  },
];

export function getSkin(id: string): Skin {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0];
}

export interface ResolvedSkin {
  body: string;
  bodyDark: string;
  bodyLight: string;
  belly: string;
  spike: string;
  blush: string;
  pupil: string;
  glow: boolean;
}

/** Turns a skin definition into the concrete colours used for one frame. */
export function resolveSkin(skin: Skin, time: number): ResolvedSkin {
  const body = skin.rainbow ? `hsl(${(time * 60) % 360}, 78%, 70%)` : skin.body;
  const isHsl = body.startsWith('hsl');
  return {
    body,
    bodyDark: isHsl ? `hsl(${(time * 60) % 360}, 62%, 55%)` : shade(body, 0.18),
    bodyLight: isHsl ? `hsl(${(time * 60) % 360}, 90%, 82%)` : tint(body, 0.22),
    belly: skin.belly,
    spike: skin.spike,
    blush: skin.blush,
    pupil: skin.pupil,
    glow: skin.glow ?? false,
  };
}
