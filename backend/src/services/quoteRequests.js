import Prospect from '../models/Prospect.js';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { notify } from './notifications.js';
import { notifyAdmins } from './adminAlerts.js';
import logger from '../utils/logger.js';

/**
 * « Demander un devis » sans compte, depuis la page publique d'un créateur : entreprise, email, le besoin en quelques lignes. La demande
 * entre dans le suivi de prospection du créateur (à traiter aujourd'hui), qui répond avec son outil de devis ; la marque n'a un compte que si
 * elle accepte le devis. L'équipe est prévenue, mais le client reste celui du créateur : pas de fiche de prospection NeedCreator.
 */
const MAX_PER_IP_HOUR = 5;
const esc = (v) => String(v || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fail = (status, message) => Object.assign(new Error(message), { status });

export async function createQuoteRequest(creatorId, body = {}, { ip = '' } = {}) {
  if (body.website2) throw fail(400, 'Demande refusée'); // champ caché : rempli seulement par les robots
  const company = String(body.company || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const contactName = String(body.contactName || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase();
  const need = String(body.need || '').trim().slice(0, 1500);
  const budget = String(body.budget || '').trim().slice(0, 60);
  const website = String(body.website || '').trim().slice(0, 300);
  const missing = [company.length < 2 && 'le nom de votre entreprise', !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && 'une adresse email valide', need.length < 20 && 'votre besoin en quelques lignes (20 caractères au moins)'].filter(Boolean);
  if (missing.length) throw fail(400, `Il manque : ${missing.join(', ')}`);
  if (!/^[a-f0-9]{24}$/i.test(String(creatorId))) throw fail(404, 'Créateur introuvable');
  const creator = await User.findOne({ _id: creatorId, role: 'creator', status: 'active' }).select('email profile.name').lean();
  if (!creator) throw fail(404, 'Créateur introuvable');
  if (ip && await Prospect.countDocuments({ 'request.ip': ip, 'request.at': { $gte: new Date(Date.now() - 3600000) } }) >= MAX_PER_IP_HOUR) throw fail(429, 'Trop de demandes envoyées depuis cette connexion : réessayez dans une heure');
  if (await Prospect.exists({ creatorId: creator._id, email, 'request.at': { $gte: new Date(Date.now() - 86400000) } })) throw fail(429, `Votre demande est déjà transmise à ${creator.profile?.name} : il vous répond par email`);
  const prospect = await Prospect.create({
    creatorId: creator._id, company, contactName, email, website, source: 'Demande de devis (page NeedCreator)', status: 'replied',
    nextFollowUpAt: new Date(), lastContactAt: new Date(), notes: [{ text: `Demande reçue : ${need}${budget ? ` · Budget indiqué : ${budget}` : ''}` }],
    request: { need, budget, at: new Date(), ip },
  });
  const params = new URLSearchParams({ prospect: String(prospect._id), company, contact: contactName, email, need: need.slice(0, 600) });
  const link = `${config.cors.origin}/quotes?${params}`;
  const first = String(creator.profile?.name || '').split(' ')[0];
  notify(creator._id, { type: 'quote', title: `Demande de devis de ${company}`, text: need.slice(0, 140), href: `/quotes?${params}` }).catch(() => {});
  const { sendQuoteRequestToCreator, sendQuoteRequestReceived } = await import('./email.js');
  sendQuoteRequestToCreator(creator.email, first, { company, contactName, email, need, budget, website }, link).catch(err => logger.warn(`Quote request email to creator: ${err.message}`));
  sendQuoteRequestReceived(email, contactName, creator.profile?.name || 'le créateur').catch(err => logger.warn(`Quote request receipt: ${err.message}`));
  notifyAdmins(`Demande de devis pour ${creator.profile?.name} : ${company}`, `<p><strong>${esc(company)}</strong> (${esc(email)}) demande un devis à ${esc(creator.profile?.name)} depuis sa page publique.</p><p>« ${esc(need.slice(0, 500))} »${budget ? ` · Budget : ${esc(budget)}` : ''}</p><p>Le créateur répond avec son outil de devis ; c'est son client.</p>`).catch(() => {});
  return { prospect, creatorName: creator.profile?.name || '' };
}
