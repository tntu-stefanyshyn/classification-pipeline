import { config } from '../../../config/config';

const SECONDS_PER_UNIT: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** Parses `900`, `15m`, `12h` or `30d` into seconds. */
export const durationToSeconds = (value: string): number => {
  const match = /^(\d+)\s*([smhd]?)$/i.exec(value.trim());
  const amount = Number(match?.[1]);
  if (!match || !Number.isSafeInteger(amount) || amount < 1) {
    throw new Error(`Invalid duration: "${value}". Use a number of seconds or 15m, 12h, 30d.`);
  }
  return amount * SECONDS_PER_UNIT[(match[2] || 's').toLowerCase()];
};

export const accessTokenTtlSeconds = () => durationToSeconds(config.auth.accessTokenTtl);

export const refreshTokenTtlSeconds = () => durationToSeconds(config.auth.refreshTokenTtl);
