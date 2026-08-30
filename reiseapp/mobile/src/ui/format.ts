export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return `${km < 100 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString('de-CH');
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '–';
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) return `${Math.round(hours / 24)} d`;
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/** The dominant way this trip was covered, or null when nothing stands out. */
export function dominantMode(stats: {
  walking_m: number;
  cycling_m: number;
  vehicle_m: number;
}): string | null {
  const modes: [string, number][] = [
    ['zu Fuss', stats.walking_m],
    ['Rad', stats.cycling_m],
    ['Fahrzeug', stats.vehicle_m],
  ];
  const total = modes.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return null;
  const [label, value] = modes.reduce((best, current) => (current[1] > best[1] ? current : best));
  return `${label} ${Math.round((value / total) * 100)} %`;
}
