// web/src/types/tracking.ts
export type TrackingStatus = "idle" | "recording" | "paused";

export type AppToWebMessage =
  | { type: "LOCATION_UPDATE"; coords: [number, number][] }
  | { type: "STATUS_ACK"; status: TrackingStatus };

export type WebToAppMessage =
  | { type: "START_TRACKING" }
  | { type: "PAUSE_TRACKING" }
  | { type: "STOP_TRACKING" };