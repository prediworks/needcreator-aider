'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { FolderOpen, AlertTriangle } from 'lucide-react';

/** Tableau de bord marque : état du registre « Contenus & droits », pour y revenir avant une expiration */
export default function ContentsSummaryCard() {
  const { data } = useQuery({ queryKey: ['contents', '', ''], queryFn: async () => (await api.get('/contents')).data, staleTime: 60000 });
  const s = data?.summary;
  const urgent = s ? s.expiring + s.expired : 0;
  return (
    <Card className={`p-4 mb-6 ${urgent > 0 ? 'bg-orange-50 border-orange-200' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {urgent > 0 ? <AlertTriangle className="w-5 h-5 text-orange-600" /> : <FolderOpen className="w-5 h-5 text-primary-500" />}
          <div>
            <h3 className="font-semibold text-neutral-900">Contenus &amp; droits{s ? ` : ${s.total} contenu${s.total > 1 ? 's' : ''} suivi${s.total > 1 ? 's' : ''}` : ''}</h3>
            <p className="text-sm text-neutral-700">
              {!s ? 'Le registre de vos contenus et de leurs droits, missions NeedCreator et contenus achetés ailleurs.'
                : urgent > 0 ? `${s.expiring} expire${s.expiring > 1 ? 'nt' : ''} sous 30 jours, ${s.expired} expiré${s.expired > 1 ? 's' : ''} : vérifiez vos diffusions ou relancez les créateurs.`
                : s.total === 0 ? 'Vos missions validées y entreront automatiquement. Ajoutez aussi vos contenus achetés ailleurs pour suivre toutes vos échéances.'
                : 'Tous vos droits sont couverts. Ajoutez vos contenus achetés ailleurs pour ne rien oublier.'}
            </p>
          </div>
        </div>
        <Link href="/contents"><Button size="sm" variant={urgent > 0 ? 'primary' : 'outline'}>{urgent > 0 ? 'Voir les échéances' : 'Ouvrir le registre'}</Button></Link>
      </div>
    </Card>
  );
}
