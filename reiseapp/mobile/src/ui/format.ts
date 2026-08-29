export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return `${km < 100 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString('de-CH');
}
