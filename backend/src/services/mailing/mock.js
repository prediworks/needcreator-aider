/** Fournisseur factice pour les tests automatiques : tout en mémoire, aucune requête réseau */
const state = { lists: [], contacts: new Map(), blocklist: new Set(), replies: [], stats: new Map(), removed: [], sentReplies: [] };
export const mockState = state;
export default function mock() {
  return {
    name: 'mock',
    async verify() { return { ok: true, account: 'Mock', user: 'mock@needcreator.test', plan: 'test' }; },
    async listLists() { return state.lists.map(l => ({ ...l, contacts: (state.contacts.get(l.id) || []).length })); },
    async ensureList(name) { let l = state.lists.find(x => x.name === name); if (!l) { l = { id: `mock-${state.lists.length + 1}`, name }; state.lists.push(l); state.contacts.set(l.id, []); } return { ...l, contacts: (state.contacts.get(l.id) || []).length }; },
    async pushContacts(listId, contacts) { const arr = state.contacts.get(listId) || []; for (const c of contacts) if (!arr.some(x => x.email === c.email)) arr.push(c); state.contacts.set(listId, arr); return { added: contacts.length }; },
    async isBlocked(email) { return state.blocklist.has(email); },
    async blocklist() { return [...state.blocklist]; },
    async replies(since) { const all = [...state.contacts.values()].flat(); const simulated = all.filter(c => /\+reply@/.test(c.email)).map(c => ({ email: c.email, at: new Date(), text: 'Bonjour, oui ça m\'intéresse, comment ça marche ?', sequence: 'Mock' })); return [...state.replies, ...simulated].filter(r => !since || r.at >= new Date(since)); },
    async leadStats() { const all = [...state.contacts.values()].flat(); return [...state.stats.values(), ...all.map(c => ({ email: c.email, sent: 1, bounces: /\+bounce@/.test(c.email) ? 1 : 0, replies: 0, unsubscribes: 0 }))]; },
    async sequencesForList(listId) { return [{ id: `seq-${listId}`, name: 'Mock', paused: false }]; },
    async removeFromSequences(listId, email) { state.removed.push(email); return 1; },
    async listContact(listId, email) { return (state.contacts.get(listId) || []).find(c => c.email === email) || null; },
    async findThread(email) { return `thread-${email}`; },
    async sendReply(messageId, html) { state.sentReplies.push({ messageId, html, at: new Date() }); return { ok: true, id: `reply-${state.sentReplies.length}`, status: 'scheduled' }; },
  };
}
