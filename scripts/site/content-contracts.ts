/** Design contract reference. Keep runtime in existing Node ESM if preferred.
 * Seed slugs from actual current output before changing any display title.
 */
export interface Episode {
  episodeNumber: number;
  videoId: string;
  slug: string; // persistent, never derived anew from mutable title
  title: string;
  published: string; // verified ISO timestamp
  url: string; // validated YouTube watch URL
  thumbnail: string;
  summary?: string; // approved editorial text; omit rather than fabricate
  durationSeconds?: number; // only if sourced
  articleSlug?: string;
  transcriptHtml?: string; // reviewed corpus through existing trusted renderer
  chapters?: Array<{ title:string; seconds:number; source:string }>;
}
export interface FieldNote {
  slug: string;
  episodeNumber: number;
  title: string;
  cardTitle?: string; // explicit display-only override
  dek: string;
  body: string[]; // existing reviewed HTML paragraphs; preserve sanitization boundary
  published?: string; // omit if only source episode date is known
  updated?: string;
}
export interface SiteAvailability {
  emailReady: boolean;
  kitReady: boolean;
  kitItems: string[]; // actual checked deliverable contents only
  youtubeChannelUrl: string;
  youtubeSubscribeUrl: string;
  // No credentials, group IDs or private provider configuration in client payload.
}
export interface AskResponse {
  answer: string;
  speaker: string;
  citations: Array<{ episode:number; videoId?:string; timestamp?:string }>;
  handoff: { episode:number; url:string; label:string };
  poolId: string;
  fallbackUsed: boolean;
  mode: string; // preserve actual backend modes; do not use this to infer HTTP success
}
export type SubscribeState = 'unavailable' | 'idle' | 'invalid' | 'pending' | 'accepted' | 'error';
export type AskState = 'idle' | 'invalid' | 'pending' | 'answered' | 'fallback' | 'rate-limited' | 'error';
// POST /api/ask stays {question:string}; <=280 chars.
// Handoff telemetry stays {kind:'handoff-click',poolId:string}.
// Do not log raw questions or email addresses for redesign analytics.
