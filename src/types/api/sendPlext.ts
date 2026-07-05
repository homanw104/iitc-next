export interface SendPlextPayload {
  message: string;
  latE6: number;
  lngE6: number;
  tab: string;
}

export interface SendPlextResponse {
  error?: unknown;
}
