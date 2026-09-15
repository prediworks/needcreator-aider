import logger from '../../utils/logger.js';

const BASE = 'https://run.salesblink.io/api/public/v1.0.0';

/**
 * SalesBlink (salesblink.io) : listes de contacts + séquences rattachées aux listes.
 * Un contact ajouté à une liste entre automatiquement dans les séquences en cours rattachées à cette liste.
 */
export default function salesblink({ apiKey }) {
  async function call(method, path, { query, body } = {}) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const res = await fetch(url, { method, headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok || data.success === false) { const e = new Error(`SalesBlink ${method} ${path} → ${res.status} ${data.message || data.error || text.slice(0, 200)}`); e.status = res.status; throw e; }
    return data;
  }
  return {
    name: 'salesblink',
    async verify() { const d = await call('GET', '/account/verify'); return { ok: true, account: d.data?.account?.name, user: d.data?.user?.email, plan: d.data?.account?.plan }; },
    async listLists() { const d = await call('GET', '/lists', { query: { limit: 100 } }); return (d.data || []).map(l => ({ id: l.id, name: l.name, contacts: l.contacts_count })); },
    async ensureList(name) {
      const lists = await this.listLists();
      const hit = lists.find(l => l.name === name);
      if (hit) return hit;
      const d = await call('POST', '/lists', { body: { name } });
      logger.info(`SalesBlink list created: ${name} (${d.data?.id})`);
      return { id: d.data.id, name, contacts: 0 };
    },
    /** contacts : [{ email, first_name, last_name, company_name, ...champs snake_case }] ; 500 max par appel */
    async pushContacts(listId, contacts) {
      let added = 0;
      for (let i = 0; i < contacts.length; i += 500) {
        await call('POST', '/contacts', { body: { list_id: listId, contacts: contacts.slice(i, i + 500), remove_duplicates: true } });
        added += Math.min(500, contacts.length - i);
      }
      return { added };
    },
    async isBlocked(email) { try { const d = await call('GET', '/unsubscribe/check', { query: { email } }); const v = d.data; return v === true || v?.blocked === true || v?.exists === true || (Array.isArray(v) && v.length > 0); } catch { return false; } },
    async blocklist() { const out = []; for (let skip = 0; skip < 5000; skip += 500) { const d = await call('GET', '/unsubscribe', { query: { limit: 500, skip } }); const rows = Array.isArray(d.data) ? d.data : d.data?.entries || d.data?.data || []; out.push(...rows.map(r => (r.email || r.value || r.domain || '').toLowerCase()).filter(Boolean)); if (rows.length < 500) break; } return out; },
    /** Réponses depuis une date : [{ email, at, text, sequence }] */
    async replies(since) {
      const out = [];
      for (let page = 1; page <= 20; page++) {
        const d = await call('GET', '/replies', { query: { per_page: 100, page, since: since ? new Date(since).getTime() : undefined } });
        const rows = Array.isArray(d) ? d : d.data || [];
        for (const r of rows) out.push({ email: (r.email || '').toLowerCase(), at: r.time ? new Date(r.time) : null, text: r.message || '', sequence: r.sequence_name || r.sequence || '' });
        if (rows.length < 100) break;
      }
      return since ? out.filter(r => !r.at || r.at >= new Date(since)) : out;
    },
    /** Statistiques par contact sur une période : [{ email, sent, bounces, replies, unsubscribes }] */
    async leadStats(from, to) {
      const out = [];
      for (let skip = 0; skip < 20000; skip += 500) {
        const d = await call('GET', '/analytics/lead-stats', { query: { from: from ? new Date(from).getTime() : undefined, to: to ? new Date(to).getTime() : undefined, limit: 500, skip } });
        const rows = d.data || [];
        for (const r of rows) out.push({ email: String(r._id || '').toLowerCase(), sent: r.sent || 0, bounces: r.bounces || 0, replies: r.replies || 0, unsubscribes: r.unsubscribes || 0, lastActivity: r.last_activity ? new Date(r.last_activity) : null });
        if (rows.length < 500) break;
      }
      return out;
    },
    /** Séquences rattachées à une liste, et retrait d'un contact de ces séquences (inscrit ou à ne plus relancer) */
    async sequencesForList(listId) { const d = await call('GET', '/sequences', { query: { limit: 100 } }); return (d.data || []).filter(s => (s.lists || []).includes(listId) && !s.archived).map(s => ({ id: s.id, name: s.name, paused: !!s.paused })); },
    async removeFromSequences(listId, email) {
      let removed = 0;
      for (const seq of await this.sequencesForList(listId)) {
        for (let skip = 0; skip < 20000; skip += 500) {
          const d = await call('GET', `/sequences/${seq.id}/leads`, { query: { limit: 500, skip } });
          const rows = d.data || [];
          const hit = rows.find(l => (l.email || '').toLowerCase() === email);
          if (hit?.lead_id) { await call('POST', `/sequences/${seq.id}/leads/${hit.lead_id}/unsubscribe`); removed++; break; }
          if (rows.length < 500) break;
        }
      }
      return removed;
    },
    /** Fil de discussion d'un contact (boîte de réception unifiée) → identifiant pour répondre */
    async findThread(email) { const d = await call('GET', '/inbox', { query: { search: email, limit: 10 } }); const rows = d.data?.result || []; const hit = rows.find(t => JSON.stringify(t).toLowerCase().includes(email)) || rows[0]; return hit?.messageId || hit?.id || null; },
    /** Répond dans le fil, depuis l'expéditeur d'origine (contenu HTML) */
    async sendReply(messageId, html) { const d = await call('POST', `/inbox/${messageId}/reply`, { body: { content: html } }); return { ok: true, id: d.data?.id, status: d.data?.status }; },
    async listContact(listId, email) { const d = await call('GET', `/lists/${listId}/leads`, { query: { search: email, limit: 5 } }); return (d.data?.contacts || []).find(c => (c.email || c.Email || '').toLowerCase() === email) || null; },
  };
}
