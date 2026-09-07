'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useAuth';
import {
  useAdminStats, usePendingCreators, useAdminUsers, useAdminCampaigns, useAdminDeliveries,
  useApproveCreator, useRejectCreator, useSuspendUser, useReactivateUser, useRunJobs,
  usePendingAmbassadors, useApproveAmbassador, useRejectAmbassador,
} from '@/hooks/useAdmin';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { Users, Briefcase, Package, Euro, Play, CheckCircle, XCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CAMPAIGN_STATUS, DELIVERY_STATUS, USER_STATUS, NICHES } from '@/lib/labels';
import { cn } from '@/lib/utils';

type Tab = 'pending' | 'ambassadors' | 'users' | 'campaigns' | 'deliveries';

export default function AdminPage() {
  const { ready } = useRequireAuth({ roles: ['admin'] });
  const [tab, setTab] = useState<Tab>('pending');
  const [userSearch, setUserSearch] = useState('');

  const { data: stats } = useAdminStats(ready);
  const { data: pending, isLoading: pendingLoading } = usePendingCreators(ready);
  const { data: users } = useAdminUsers({ search: userSearch || undefined, limit: 50 }, ready && tab === 'users');
  const { data: campaigns } = useAdminCampaigns(ready && tab === 'campaigns');
  const { data: deliveries } = useAdminDeliveries(ready && tab === 'deliveries');

  const { data: ambassadors } = usePendingAmbassadors(ready && tab === 'ambassadors');
  const approveAmb = useApproveAmbassador();
  const rejectAmb = useRejectAmbassador();
  const approve = useApproveCreator();
  const reject = useRejectCreator();
  const suspend = useSuspendUser();
  const reactivate = useReactivateUser();
  const runJobs = useRunJobs();

  if (!ready) return <Spinner />;

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'pending', label: 'Créateurs à valider', count: stats?.users?.pendingCreators },
    { key: 'ambassadors', label: 'Vidéos Ambassadeur' },
    { key: 'users', label: 'Utilisateurs' },
    { key: 'campaigns', label: 'Campagnes' },
    { key: 'deliveries', label: 'Livraisons' },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-1">Administration</h1>
            <p className="text-neutral-600">Validation des créateurs, supervision des campagnes et des paiements</p>
          </div>
          <Button variant="outline" onClick={() => runJobs.mutate()} isLoading={runJobs.isPending}>
            <Play className="w-4 h-4 mr-2" />
            Lancer les tâches planifiées
          </Button>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-neutral-600">Utilisateurs</span>
              <Users className="w-5 h-5 text-primary-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.users?.total ?? '—'}</div>
            <div className="text-xs text-neutral-500">{stats?.users?.creators ?? 0} créateurs · {stats?.users?.brands ?? 0} marques</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-neutral-600">Campagnes</span>
              <Briefcase className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.campaigns?.total ?? '—'}</div>
            <div className="text-xs text-neutral-500">{stats?.campaigns?.active ?? 0} ouvertes · {stats?.campaigns?.completed ?? 0} terminées</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-neutral-600">Livraisons</span>
              <Package className="w-5 h-5 text-orange-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.deliveries?.total ?? '—'}</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-neutral-600">Commissions encaissées</span>
              <Euro className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-2xl font-bold">{formatCurrency(stats?.revenue?.total || 0)}</div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition',
                tab === t.key ? 'bg-primary-500 text-white' : 'bg-white border border-neutral-200 text-neutral-700 hover:border-primary-300'
              )}
            >
              {t.label}{t.count ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {/* Pending creators */}
        {tab === 'pending' && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Créateurs en attente de validation</h2>
            {pendingLoading ? <Spinner fullScreen={false} /> : pending?.creators?.length ? (
              <div className="space-y-4">
                {pending.creators.map((c: any) => (
                  <div key={c._id} className="border border-neutral-200 rounded-lg p-4 flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-medium text-neutral-900">{c.profile?.name} <span className="text-neutral-500 font-normal">· {c.email}</span></div>
                      <div className="text-sm text-neutral-600 mt-1">{c.profile?.bio || 'Pas de bio'}</div>
                      <div className="text-xs text-neutral-500 mt-2 flex gap-2 flex-wrap">
                        <span>{c.profile?.portfolio?.length || 0} vidéo(s)</span>
                        <span>·</span>
                        <span>dès {c.profile?.pricing?.minPrice}€</span>
                        <span>·</span>
                        <span>{(c.profile?.niches || []).map((n: string) => NICHES[n] || n).join(', ')}</span>
                        <span>·</span>
                        <span>inscrit le {formatDate(c.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/admin/creators/${c._id}`}>
                        <Button size="sm" variant="outline">Voir le portfolio</Button>
                      </Link>
                      <Button size="sm" onClick={() => approve.mutate({ userId: c._id })} isLoading={approve.isPending}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Valider
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const reason = prompt('Motif du refus (envoyé dans les logs) :') || '';
                          reject.mutate({ userId: c._id, reason });
                        }}
                        isLoading={reject.isPending}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Refuser
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500 text-center py-8">Aucun créateur en attente 🎉</p>
            )}
          </Card>
        )}

        {/* Ambassadors */}
        {tab === 'ambassadors' && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-1">Vidéos « Parlez de NeedCreator » à vérifier</h2>
            <p className="text-sm text-neutral-500 mb-4">Validez si la vidéo parle bien de NeedCreator : le créateur obtient le badge Ambassadeur et l&apos;accès anticipé de 24 h.</p>
            {ambassadors?.creators?.length ? (
              <div className="space-y-3">
                {ambassadors.creators.map((c: any) => (
                  <div key={c._id} className="border border-neutral-200 rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium">{c.profile?.name} <span className="text-neutral-500 font-normal">· {c.email}</span></div>
                      <a href={c.profile.ambassador.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:underline break-all">{c.profile.ambassador.videoUrl}</a>
                      <div className="text-xs text-neutral-500">envoyée le {formatDate(c.profile.ambassador.submittedAt)}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approveAmb.mutate({ userId: c._id })} isLoading={approveAmb.isPending}><CheckCircle className="w-4 h-4 mr-1" /> Valider</Button>
                      <Button size="sm" variant="outline" onClick={() => rejectAmb.mutate({ userId: c._id, reason: prompt('Motif (visible par le créateur) :') || '' })} isLoading={rejectAmb.isPending}><XCircle className="w-4 h-4 mr-1" /> Refuser</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500 text-center py-8">Aucune vidéo en attente</p>
            )}
          </Card>
        )}

        {/* Users */}
        {tab === 'users' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <h2 className="text-xl font-semibold">Utilisateurs</h2>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Rechercher (email, nom, entreprise)"
                className="px-3 py-2 border border-neutral-300 rounded-lg text-sm w-72"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b">
                    <th className="py-2 pr-4">Nom</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Rôle</th>
                    <th className="py-2 pr-4">Statut</th>
                    <th className="py-2 pr-4">Inscrit le</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(users?.users || []).map((u: any) => (
                    <tr key={u._id} className="border-b border-neutral-100">
                      <td className="py-2 pr-4 font-medium">{u.profile?.companyName || u.profile?.name}</td>
                      <td className="py-2 pr-4 text-neutral-600">{u.email}</td>
                      <td className="py-2 pr-4">{u.role === 'creator' ? 'Créateur' : u.role === 'brand' ? 'Marque' : 'Admin'}</td>
                      <td className="py-2 pr-4"><Badge map={USER_STATUS} value={u.status} /></td>
                      <td className="py-2 pr-4 text-neutral-600">{formatDate(u.createdAt)}</td>
                      <td className="py-2 text-right">
                        {u.role !== 'admin' && (u.status === 'active' ? (
                          <Button size="sm" variant="ghost" onClick={() => suspend.mutate({ userId: u._id })}>Suspendre</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => reactivate.mutate({ userId: u._id })}>Activer</Button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Campaigns */}
        {tab === 'campaigns' && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Toutes les campagnes</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b">
                    <th className="py-2 pr-4">Titre</th>
                    <th className="py-2 pr-4">Marque</th>
                    <th className="py-2 pr-4">Statut</th>
                    <th className="py-2 pr-4">Budget</th>
                    <th className="py-2 pr-4">Candidatures</th>
                    <th className="py-2 pr-4">Créateur</th>
                    <th className="py-2">Créée le</th>
                  </tr>
                </thead>
                <tbody>
                  {(campaigns?.campaigns || []).map((c: any) => (
                    <tr key={c._id} className="border-b border-neutral-100">
                      <td className="py-2 pr-4 font-medium">{c.title}</td>
                      <td className="py-2 pr-4 text-neutral-600">{c.brandId?.profile?.companyName}</td>
                      <td className="py-2 pr-4"><Badge map={CAMPAIGN_STATUS} value={c.status} /></td>
                      <td className="py-2 pr-4">{formatCurrency(c.budget?.total)}</td>
                      <td className="py-2 pr-4">{c.analytics?.applications || 0}</td>
                      <td className="py-2 pr-4 text-neutral-600">{c.selectedCreator?.profile?.name || '—'}</td>
                      <td className="py-2 text-neutral-600">{formatDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Deliveries */}
        {tab === 'deliveries' && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Toutes les livraisons</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b">
                    <th className="py-2 pr-4">Campagne</th>
                    <th className="py-2 pr-4">Marque</th>
                    <th className="py-2 pr-4">Créateur</th>
                    <th className="py-2 pr-4">Statut</th>
                    <th className="py-2 pr-4">Montant</th>
                    <th className="py-2 pr-4">Paiement</th>
                    <th className="py-2">Auto-approbation</th>
                  </tr>
                </thead>
                <tbody>
                  {(deliveries?.deliveries || []).map((d: any) => (
                    <tr key={d._id} className="border-b border-neutral-100">
                      <td className="py-2 pr-4 font-medium">
                        <Link href={`/deliveries/${d._id}`} className="hover:text-primary-600">{d.campaignId?.title}</Link>
                      </td>
                      <td className="py-2 pr-4 text-neutral-600">{d.brandId?.profile?.companyName}</td>
                      <td className="py-2 pr-4 text-neutral-600">{d.creatorId?.profile?.name}</td>
                      <td className="py-2 pr-4"><Badge map={DELIVERY_STATUS} value={d.status} /></td>
                      <td className="py-2 pr-4">{formatCurrency(d.payment?.amount)}</td>
                      <td className="py-2 pr-4">{d.payment?.status}</td>
                      <td className="py-2 text-neutral-600">{d.autoApprovalDate ? formatDate(d.autoApprovalDate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
