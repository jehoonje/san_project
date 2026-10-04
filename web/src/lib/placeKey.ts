export function makePlaceKey(input: {
  providerId?: string | null;
  name: string;
  lat: number;
  lng: number;
}) {
  const providerId = input.providerId?.trim();
  if (providerId) return providerId;

  const normalizedName = input.name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);

  return [
    "manual",
    encodeURIComponent(normalizedName),
    input.lat.toFixed(4),
    input.lng.toFixed(4),
  ].join(":");
}
