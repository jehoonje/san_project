// web/src/types/route.ts
export type SavedRoute = {
  id: string;
  title: string;
  coordinates: [number, number][];
  distance_meters: number | null;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string;
  created_at: string;
};