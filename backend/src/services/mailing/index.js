import salesblink from './salesblink.js';
import mock from './mock.js';

/**
 * Outil de mailing interchangeable (MAILING_PROVIDER + MAILING_API_KEY) : SalesBlink aujourd'hui, un autre demain sans toucher au reste.
 * Contrat : verify, listLists, ensureList(name), pushContacts(listId, contacts), isBlocked(email), blocklist(), replies(since),
 * leadStats(from, to), sequencesForList(listId), removeFromSequences(listId, email), listContact(listId, email).
 */
const PROVIDERS = { salesblink, mock };
export function mailingConfig() {
  const provider = (process.env.MAILING_PROVIDER || '').toLowerCase().trim();
  const apiKey = process.env.MAILING_API_KEY || '';
  return { provider, configured: !!PROVIDERS[provider] && (provider === 'mock' || !!apiKey), known: Object.keys(PROVIDERS) };
}
export function mailingProvider() {
  const { provider, configured } = mailingConfig();
  if (!configured) return null;
  return PROVIDERS[provider]({ apiKey: process.env.MAILING_API_KEY || '' });
}
