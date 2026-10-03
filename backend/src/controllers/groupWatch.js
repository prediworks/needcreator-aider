import { addGroup, updateGroup, removeGroup, groupWatchOverview, decideGroupPost, createLeadFromPost, sendPostEmail, relayDraft } from '../services/groupWatch.js';
import logger from '../utils/logger.js';

/** Groupes Facebook suivis et demandes à répondre (admin). Les messages d'erreur du service sont rédigés pour être affichés tels quels. */
const send = (res, error, fallback) => { if (!error.status) logger.error(`groupWatch: ${error.message}`); res.status(error.status || 500).json({ error: error.status ? error.message : fallback }); };

export async function groupWatchView(req, res) {
  try { res.json(await groupWatchOverview()); }
  catch (error) { send(res, error, 'Groupes indisponibles'); }
}

export async function addGroupView(req, res) {
  try {
    const group = await addGroup({ url: req.body?.url, audience: req.body?.audience || 'creators', name: req.body?.name, createdBy: req.user._id });
    res.status(201).json({ group, message: 'Groupe ajouté. Il sera lu au prochain lot « Groupes Facebook », si le compte Facebook du profil de lecture en est membre.' });
  } catch (error) { send(res, error, 'Groupe non ajouté'); }
}

export async function updateGroupView(req, res) {
  try {
    const group = await updateGroup(req.params.id, req.body || {});
    res.json({ group, message: group.active ? 'Groupe suivi' : 'Groupe mis en pause : il ne sera plus lu' });
  } catch (error) { send(res, error, 'Groupe non modifié'); }
}

export async function removeGroupView(req, res) {
  try { await removeGroup(req.params.id); res.json({ message: 'Groupe retiré, avec ses demandes' }); }
  catch (error) { send(res, error, 'Groupe non retiré'); }
}

export async function decideGroupPostView(req, res) {
  try {
    const action = req.body?.action;
    if (action === 'lead') {
      const r = await createLeadFromPost(req.params.id, req.user._id);
      return res.status(201).json({ post: r.post, lead: r.lead, message: r.existing ? 'Fiche marque déjà connue par son adresse : la demande y est ajoutée. Relisez l\'email proposé, puis envoyez-le.' : 'Fiche marque créée. Relisez l\'email proposé, puis envoyez-le : il part de l\'adresse d\'envoi des vidéos.' });
    }
    if (action === 'send') {
      const r = await sendPostEmail(req.params.id, { subject: req.body?.subject, text: req.body?.text });
      return res.json({ post: r.post, lead: r.lead, message: `Email envoyé à ${r.lead.email}. La fiche est « Contactée » ; sans réponse, elle reviendra dans la file du jour dans sept jours.` });
    }
    if (action === 'relay') return res.json({ draft: await relayDraft(req.params.id), message: 'Message préparé : relisez-le dans « Messages aux inscrits », puis envoyez-le aux créateurs' });
    const post = await decideGroupPost(req.params.id, action);
    res.json({ post, message: post.status === 'answered' ? 'Noté : commentaire publié' : post.status === 'relayed' ? 'Noté : annonce relayée aux créateurs' : post.status === 'skipped' ? 'Demande passée' : 'Demande remise dans la file' });
  } catch (error) { send(res, error, 'Demande non modifiée'); }
}
