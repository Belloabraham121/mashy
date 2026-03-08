// types.ts – Config and types for perps signals CRE workflow.

import { z } from "zod";

const perpsConfigSchema = z.object({
  /** Base URL of the Marshmallow backend (e.g. http://localhost:3001). */
  backendBaseUrl: z.string().url(),
  /** Optional shared secret for POST /api/perps/cre-signal (sent as X-CRE-Secret). */
  creWebhookSecret: z.string().optional(),
});

export type PerpsConfig = z.infer<typeof perpsConfigSchema>;
export const configSchema = perpsConfigSchema;

export type PriceResponse = {
  price: string;
  updatedAt: number;
};

export type CreSignalBody = {
  signal?: string;
  fundingRateBps?: number;
  price?: string;
  updatedAt?: number;
};
