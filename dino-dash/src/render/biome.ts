import { clamp, lerp } from '../core/math';
import { mixColor } from './draw';

/**
 * Colour scheme for one stretch of the route. Every layer of the backdrop and
 * the path reads its colours from here, so a new biome is purely a matter of
 * numbers rather than new drawing code.
 */
export interface BiomePalette {
  name: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  sun: string;
  sunGlow: string;
  /** 0 hides the stars entirely, 1 shows them at full strength. */
  starAlpha: number;
  cloud: string;
  cloudAlpha: number;
  volcano: string;
  volcanoLit: string;
  lava: string;
  smoke: string;
  hills: string;
  treeLine: string;
  fern: string;
  grassFar: string;
  grassNear: string;
  pathLight: string;
  pathDark: string;
  pathEdge: string;
  rock: string;
  rockLit: string;
}

export const BIOMES: BiomePalette[] = [
  {
    name: 'Dschungeltag',
    skyTop: '#b8e6f5',
    skyMid: '#ffe9cf',
    skyHorizon: '#ffd3b8',
    sun: '#fff6d6',
    sunGlow: '#ffe9a8',
    starAlpha: 0,
    cloud: '#ffffff',
    cloudAlpha: 0.85,
    volcano: '#9c8aad',
    volcanoLit: '#b4a4c4',
    lava: '#ff9d63',
    smoke: '#d9d2e4',
    hills: '#a8dcc0',
    treeLine: '#74c79b',
    fern: '#63b98d',
    grassFar: '#7cc596',
    grassNear: '#8fd4a8',
    pathLight: '#eccfa6',
    pathDark: '#e0be92',
    pathEdge: '#c9a179',
    rock: '#b9b2c4',
    rockLit: '#cdc7d6',
  },
  {
    name: 'Abendglut',
    skyTop: '#7b6bb0',
    skyMid: '#ff9e7d',
    skyHorizon: '#ffc48f',
    sun: '#fff0c0',
    sunGlow: '#ff9d63',
    starAlpha: 0.18,
    cloud: '#ffd2bb',
    cloudAlpha: 0.7,
    volcano: '#6f5f8a',
    volcanoLit: '#8a78a8',
    lava: '#ff7a3d',
    smoke: '#b3a3c0',
    hills: '#a4909e',
    treeLine: '#5f8f7c',
    fern: '#527f6e',
    grassFar: '#5d9078',
    grassNear: '#6fa389',
    pathLight: '#d9b48f',
    pathDark: '#c9a37e',
    pathEdge: '#a8845f',
    rock: '#9c94ab',
    rockLit: '#b0a8bf',
  },
  {
    name: 'Sternennacht',
    skyTop: '#1f2a52',
    skyMid: '#35406e',
    skyHorizon: '#5b4a7a',
    sun: '#e8eeff',
    sunGlow: '#9fb4e8',
    starAlpha: 1,
    cloud: '#5f6690',
    cloudAlpha: 0.45,
    volcano: '#463f63',
    volcanoLit: '#5c5480',
    lava: '#ff7043',
    smoke: '#4a4566',
    hills: '#2e3f5c',
    treeLine: '#2b4750',
    fern: '#294540',
    grassFar: '#2f4a48',
    grassNear: '#3b5a52',
    pathLight: '#8b7a6a',
    pathDark: '#7a6a5c',
    pathEdge: '#5f5347',
    rock: '#6b6480',
    rockLit: '#7d7593',
  },
  {
    name: 'Morgengrauen',
    skyTop: '#9ec5e8',
    skyMid: '#ffd9e0',
    skyHorizon: '#ffe4c9',
    sun: '#fff8e6',
    sunGlow: '#ffd9a8',
    starAlpha: 0.3,
    cloud: '#ffffff',
    cloudAlpha: 0.8,
    volcano: '#8f83a8',
    volcanoLit: '#a89cc0',
    lava: '#ff9060',
    smoke: '#cfc7dd',
    hills: '#9bd3bb',
    treeLine: '#6fbd95',
    fern: '#5fae88',
    grassFar: '#77c093',
    grassNear: '#8ad0a4',
    pathLight: '#e8cba8',
    pathDark: '#dcba95',
    pathEdge: '#c2a07d',
    rock: '#aca4bd',
    rockLit: '#c0b9cf',
  },
];

/** Metres covered by one biome before the next begins. */
export const BIOME_LENGTH = 750;
/** Metres over which two biomes cross-fade into each other. */
const TRANSITION = 160;

/** The palette in force at the given distance, blended across transitions. */
export function biomeAt(distance: number): BiomePalette {
  const position = distance / BIOME_LENGTH;
  const index = Math.floor(position) % BIOMES.length;
  const next = (index + 1) % BIOMES.length;

  const into = (distance % BIOME_LENGTH) - (BIOME_LENGTH - TRANSITION);
  if (into <= 0) return BIOMES[index];

  return mixPalette(BIOMES[index], BIOMES[next], clamp(into / TRANSITION, 0, 1));
}

/** Name of the biome the player is heading into, for the transition banner. */
export function biomeIndexAt(distance: number): number {
  return Math.floor(distance / BIOME_LENGTH) % BIOMES.length;
}

function mixPalette(a: BiomePalette, b: BiomePalette, t: number): BiomePalette {
  const c = (from: string, to: string) => mixColor(from, to, t);
  return {
    name: t < 0.5 ? a.name : b.name,
    skyTop: c(a.skyTop, b.skyTop),
    skyMid: c(a.skyMid, b.skyMid),
    skyHorizon: c(a.skyHorizon, b.skyHorizon),
    sun: c(a.sun, b.sun),
    sunGlow: c(a.sunGlow, b.sunGlow),
    starAlpha: lerp(a.starAlpha, b.starAlpha, t),
    cloud: c(a.cloud, b.cloud),
    cloudAlpha: lerp(a.cloudAlpha, b.cloudAlpha, t),
    volcano: c(a.volcano, b.volcano),
    volcanoLit: c(a.volcanoLit, b.volcanoLit),
    lava: c(a.lava, b.lava),
    smoke: c(a.smoke, b.smoke),
    hills: c(a.hills, b.hills),
    treeLine: c(a.treeLine, b.treeLine),
    fern: c(a.fern, b.fern),
    grassFar: c(a.grassFar, b.grassFar),
    grassNear: c(a.grassNear, b.grassNear),
    pathLight: c(a.pathLight, b.pathLight),
    pathDark: c(a.pathDark, b.pathDark),
    pathEdge: c(a.pathEdge, b.pathEdge),
    rock: c(a.rock, b.rock),
    rockLit: c(a.rockLit, b.rockLit),
  };
}
