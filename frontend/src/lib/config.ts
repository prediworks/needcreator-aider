/** Règles métier partagées avec le backend (voir backend/.env : MIN_QUOTE_PRICE) */
export const MIN_QUOTE_PRICE = Number(process.env.NEXT_PUBLIC_MIN_QUOTE_PRICE || 50);
export const MAX_QUOTE_PRICE = 10000;
