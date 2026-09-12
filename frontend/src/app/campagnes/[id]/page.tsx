import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Card from '@/components/ui/Card';
import PublicCampaignCta from '@/components/PublicCampaignCta';
import { NICHES, VIDEO_TYPES, PLATFORMS } from '@/lib/labels';
import { fetchPublicCampaign } from '@/lib/publicCampaigns';
import { fetchPublicConfig, plural } from '@/lib/publicConfig';
import { SITE_URL } from '@/lib/legal';
import { ArrowLeft, Video, Clock, Package, CheckCircle, Users } from 'lucide-react';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const c = await fetchPublicCampaign(params.id);
  if (!c) return { title: 'Campagne introuvable' };
  return {
    title: `${c.title} : campagne UGC ${c.brand.name}`,
    description: `${c.brand.name} cherche ${c.deliverables} vidéo${c.deliverables > 1 ? 's' : ''} UGC (${VIDEO_TYPES[c.videoType] || c.videoType}). ${c.description.slice(0, 140)}`,
    alternates: { canonical: `/campagnes/${c.id}` },
    robots: c.open ? undefined : { index: false },
  };
}

export default async function PublicCampaignPage({ params }: { params: { id: string } }) {
  const [c, cfg] = await Promise.all([fetchPublicCampaign(params.id), fetchPublicConfig()]);
  if (!c) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: c.title,
    description: c.description,
    datePosted: c.publishedAt,
    validThrough: c.applicationDeadline || undefined,
    employmentType: 'CONTRACTOR',
    hiringOrganization: { '@type': 'Organization', name: c.brand.name, sameAs: c.brand.website || undefined },
    jobLocationType: 'TELECOMMUTE',
    applicantLocationRequirements: { '@type': 'Country', name: 'France' },
    baseSalary: c.budget ? { '@type': 'MonetaryAmount', currency: 'EUR', value: { '@type': 'QuantitativeValue', value: c.budget, unitText: 'campaign' } } : undefined,
    url: `${SITE_URL}/campagnes/${c.id}`,
  };
  return (
    <div className="min-h-screen bg-neutral-50 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="container mx-auto px-4 max-w-4xl">
        <Link href="/campagnes" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 mb-6"><ArrowLeft className="w-4 h-4" /> Toutes les campagnes ouvertes</Link>
        <Card className="p-6 md:p-8 mb-6">
          <div className="text-sm text-primary-700 font-medium mb-1">{c.brand.name}{c.brand.industry ? ` · ${c.brand.industry}` : ''}</div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-3">{c.title}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-700 mb-5">
            <span className="flex items-center gap-1"><Video className="w-4 h-4 text-primary-500" /> {c.deliverables} vidéo{c.deliverables > 1 ? 's' : ''} · {VIDEO_TYPES[c.videoType] || c.videoType} · {c.duration} s</span>
            {c.type === 'gifting' ? <span className="flex items-center gap-1"><Package className="w-4 h-4 text-primary-500" /> Produit offert en échange</span> : <span>{c.budget ? `Budget indicatif ${c.budget} € HT` : 'Devis libre : vous fixez votre prix'}</span>}
            {c.creatorsWanted > 1 && <span className="flex items-center gap-1"><Users className="w-4 h-4 text-primary-500" /> {c.creatorsWanted} créateurs recherchés</span>}
            {c.applicationDeadline && <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-primary-500" /> Candidatures jusqu&apos;au {new Date(c.applicationDeadline).toLocaleDateString('fr-FR')}</span>}
            {c.productShipping && <span className="flex items-center gap-1"><Package className="w-4 h-4 text-primary-500" /> Produit envoyé au créateur</span>}
          </div>
          <div className="flex flex-wrap gap-1 mb-6">
            {c.niches.map((n) => <span key={n} className="px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs">{NICHES[n] || n}</span>)}
            {c.platforms.map((p) => <span key={p} className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-xs">{PLATFORMS[p] || p}</span>)}
          </div>
          <h2 className="font-semibold text-neutral-900 mb-2">Le brief</h2>
          <p className="text-neutral-700 whitespace-pre-line mb-6">{c.description}</p>
          {c.requirements.length > 0 && (
            <>
              <h2 className="font-semibold text-neutral-900 mb-2">Ce que la marque attend</h2>
              <ul className="space-y-1 mb-6">{c.requirements.map((r) => <li key={r} className="flex items-start gap-2 text-sm text-neutral-700"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />{r}</li>)}</ul>
            </>
          )}
          <PublicCampaignCta campaignId={c.id} open={c.open} />
        </Card>
        <Card className="p-6 bg-primary-50 border-primary-100">
          <h2 className="font-semibold text-neutral-900 mb-2">Comment ça se passe sur NeedCreator</h2>
          <ul className="text-sm text-neutral-700 space-y-1">
            <li>Vous envoyez un devis : votre prix HT, votre délai, les droits que vous cédez.</li>
            <li>Si la marque l&apos;accepte, le montant est bloqué avant que vous tourniez, et un contrat est généré.</li>
            <li>Vous livrez, la marque valide (ou validation automatique sous {plural(cfg.autoApprovalDays, 'jour')}), vous recevez {cfg.creatorSharePercent} % du devis par virement.</li>
            <li>Inscription gratuite, {cfg.minCreatorVideos} vidéos de portfolio suffisent. Aucun nombre d&apos;abonnés exigé.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
