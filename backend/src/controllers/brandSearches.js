import { listBrandSearches, createLeadFromSearch, dismissSearch, searchersOf } from '../services/brandSearches.js';
import logger from '../utils/logger.js';

const send = (res, error, fallback) => { if (!error.status) logger.error(`brandSearches: ${error.message}`); res.status(error.status || 500).json({ error: error.status ? error.message : fallback }); };

/** Marques cherchées par les créateurs sans résultat (admin) */
export async function brandSearchesView(req, res) {
  try {
    const searches = await listBrandSearches();
    if (req.query.norm) return res.json({ searches, creators: await searchersOf(String(req.query.norm)) });
    res.json({ searches, open: searches.filter(s => s.status === 'open').length });
  } catch (error) { send(res, error, 'Liste indisponible'); }
}

export async function brandSearchAction(req, res) {
  try {
    const norm = String(req.body?.norm || '').trim();
    if (!norm) return res.status(400).json({ error: 'Il manque : la marque' });
    if (req.body?.action === 'dismiss') { const n = await dismissSearch(norm); return res.json({ message: `Recherche ignorée (${n} créateur(s))` }); }
    const r = await createLeadFromSearch(norm, { createdBy: req.user._id, name: req.body?.name === undefined ? undefined : String(req.body.name) });
    res.status(201).json({ lead: r.lead, message: `Fiche créée : ${r.lead.name}${r.tier === 'large' ? ' (grande marque, signalée)' : ''}. ${r.creators} créateur(s) prévenu(s) dans l'application et par email${r.reserved ? ', marque réservée dix jours à ce créateur' : ''}. Qualification en cours.` });
  } catch (error) { send(res, error, 'Action impossible'); }
}
