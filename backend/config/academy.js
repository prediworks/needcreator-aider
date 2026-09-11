/**
 * Académie NeedCreator : guides courts + quiz. Source unique (servie au front via GET /api/academy).
 * Le badge « Formé » est attribué quand ACADEMY_REQUIRED guides sont réussis (score ≥ 80 %).
 * Les réponses (answer = index de l'option correcte) ne sont jamais envoyées au front.
 */
export const GUIDES = [
  {
    slug: 'lire-un-brief',
    title: 'Lire un brief et livrer juste',
    minutes: 5,
    summary: 'Ce que la marque attend vraiment, et comment éviter la révision inutile.',
    sections: [
      ['Le brief est un contrat', 'Nombre de vidéos, durée, format, mentions obligatoires : tout ce qui est écrit dans le brief sera vérifié à la livraison, automatiquement puis par la marque. Avant de tourner, relisez-le et notez les points non négociables.'],
      ['Ce qui bloque le plus souvent', 'Une durée hors fourchette, un format horizontal quand un vertical était demandé, le produit jamais nommé à voix haute, un logo concurrent visible en arrière-plan. Ce sont les quatre causes principales de révision.'],
      ['Posez vos questions avant, pas après', 'La messagerie sert à ça. Une question posée avant le tournage évite une révision. « Vous voulez que je montre l\'emballage ? » prend dix secondes ; refaire la vidéo prend une soirée.'],
      ['Livrez ce qui est demandé, puis proposez', 'Respectez le brief à la lettre pour la livraison. Si vous avez une idée en plus, livrez-la comme bonus, pas à la place.'],
    ],
    quiz: [
      { q: 'Le brief demande une vidéo verticale de 30 secondes. Vous livrez une vidéo horizontale de 45 secondes très réussie. Que se passe-t-il ?', options: ['La marque valide, la qualité prime', 'Le contrôle de conformité signale deux écarts et la marque peut demander une révision', 'Rien, le format est un détail'], answer: 1 },
      { q: 'Vous avez un doute sur la façon de montrer le produit. Le bon réflexe :', options: ['Tourner deux versions et livrer les deux', 'Poser la question par messagerie avant de tourner', 'Choisir au hasard'], answer: 1 },
      { q: 'Le produit doit être « mentionné ». Cela signifie :', options: ['Le montrer à l\'écran suffit', 'Le nommer à voix haute ou en texte à l\'écran', 'Le mettre en description'], answer: 1 },
      { q: 'Vous avez une idée créative hors brief :', options: ['Vous la livrez à la place de ce qui est demandé', 'Vous la livrez en plus, après avoir respecté le brief', 'Vous abandonnez l\'idée'], answer: 1 },
    ],
  },
  {
    slug: 'lumiere-et-cadrage',
    title: 'Lumière et cadrage au téléphone',
    minutes: 6,
    summary: 'Sans matériel : la fenêtre, la hauteur des yeux, et la règle des tiers.',
    sections: [
      ['La lumière vient de face', 'Placez-vous face à une fenêtre, jamais dos à elle. La lumière du jour, diffuse, est la meilleure. Évitez le plein soleil direct qui creuse les ombres. Le soir, une lampe placée derrière le téléphone, légèrement décalée, suffit.'],
      ['Le téléphone à hauteur des yeux', 'Un téléphone posé sur une table filme vers le haut et déforme le visage. Calez-le à hauteur des yeux, à bout de bras ou sur un support. Objectif propre : un coup de tissu avant chaque prise.'],
      ['Cadrez large, puis recadrez', 'Filmez en vertical pour TikTok et Reels, en laissant de l\'espace au-dessus de la tête. Vous pourrez recadrer, pas l\'inverse. Évitez les zooms numériques qui dégradent l\'image.'],
      ['Le fond raconte quelque chose', 'Un fond simple et cohérent avec le produit : cuisine pour un ustensile, salle de bain pour un cosmétique. Rangez ce qui traîne, retirez les marques concurrentes du champ.'],
    ],
    quiz: [
      { q: 'La meilleure position par rapport à une fenêtre :', options: ['Dos à la fenêtre', 'Face à la fenêtre', 'Peu importe'], answer: 1 },
      { q: 'Le téléphone posé à plat sur une table filme :', options: ['Parfaitement', 'En contre-plongée, ce qui déforme le visage', 'Trop haut'], answer: 1 },
      { q: 'Pour une vidéo TikTok ou Reels, vous filmez :', options: ['En vertical, avec de l\'espace au-dessus de la tête', 'En horizontal puis vous recadrez', 'En carré'], answer: 0 },
      { q: 'Dans le champ, on aperçoit une bouteille d\'une marque concurrente :', options: ['Ce n\'est pas grave', 'Vous la retirez avant de tourner', 'Vous la floutez au montage'], answer: 1 },
    ],
  },
  {
    slug: 'son-propre',
    title: 'Un son propre, sans micro',
    minutes: 4,
    summary: 'Le son fait la moitié de la vidéo. Trois règles pour qu\'il soit net.',
    sections: [
      ['Une pièce qui absorbe', 'Rideaux, tapis, canapé : les tissus absorbent l\'écho. Une salle de bain ou une cuisine vide résonne. Faites un test de deux secondes et écoutez au casque.'],
      ['Près du micro, sans souffler dedans', 'Le micro du téléphone est en bas. Parlez à 30 ou 50 centimètres, articulez, et coupez tout ce qui ronronne : frigo, ventilateur, machine.'],
      ['Silence autour', 'Fenêtre fermée, téléphone en mode avion pour éviter les notifications, et personne qui parle derrière vous. Si un bruit passe, refaites la phrase : c\'est plus rapide que de nettoyer au montage.'],
      ['Contrôlez avant d\'envoyer', 'Réécoutez la vidéo au casque avant de la livrer. Le contrôle de conformité vérifie qu\'il y a une piste son, pas qu\'elle est belle. Ça, c\'est votre travail.'],
    ],
    quiz: [
      { q: 'La pièce idéale pour enregistrer :', options: ['Une salle de bain carrelée', 'Une pièce avec rideaux, tapis et canapé', 'Un couloir vide'], answer: 1 },
      { q: 'Le micro du téléphone se trouve :', options: ['En haut, près de la caméra', 'En bas', 'Sur le côté'], answer: 1 },
      { q: 'Un bruit de frigo s\'entend dans la prise :', options: ['On le laissera, personne ne remarquera', 'On coupe le frigo le temps de la prise', 'On monte le volume de la voix'], answer: 1 },
      { q: 'Avant d\'envoyer la vidéo :', options: ['On réécoute au casque', 'Le contrôle automatique s\'en charge', 'Inutile si la vidéo est bonne'], answer: 0 },
    ],
  },
  {
    slug: 'trois-premieres-secondes',
    title: 'Les trois premières secondes',
    minutes: 5,
    summary: 'Pourquoi une vidéo UGC se joue au début, et comment construire une accroche.',
    sections: [
      ['Le pouce décide en trois secondes', 'Sur TikTok ou Reels, la vidéo est jugée avant même que vous ayez fini votre première phrase. Commencez par le résultat, la question ou le problème, jamais par « bonjour, aujourd\'hui je vais vous parler de ».'],
      ['Trois accroches qui marchent', 'Le problème : « J\'avais la peau qui tirait tout l\'hiver ». La promesse : « Voilà ce qui a changé en dix jours ». La curiosité : « Personne ne m\'avait dit ça sur les crèmes ». Choisissez-en une et allez droit au but.'],
      ['Montrez le produit tôt', 'Le produit apparaît dans les cinq premières secondes, en main, en usage. Les marques regardent ce point en premier.'],
      ['Une seule idée par vidéo', 'Une vidéo de 30 secondes porte un seul message. Deux idées, c\'est deux vidéos. Terminez par une phrase courte qui invite à agir, sans ton publicitaire.'],
    ],
    quiz: [
      { q: 'La meilleure façon de commencer une vidéo UGC :', options: ['« Bonjour, aujourd\'hui je vais vous parler de… »', 'Par le problème, la promesse ou une question', 'Par une présentation de vous'], answer: 1 },
      { q: 'Le produit doit apparaître :', options: ['À la fin, pour la surprise', 'Dans les cinq premières secondes', 'Seulement en texte'], answer: 1 },
      { q: 'Une vidéo de 30 secondes doit porter :', options: ['Une seule idée', 'Deux ou trois idées pour être complète', 'Tous les avantages du produit'], answer: 0 },
      { q: 'Le ton d\'un UGC :', options: ['Publicitaire, pour rassurer la marque', 'Naturel, comme une recommandation à une amie', 'Neutre et technique'], answer: 1 },
    ],
  },
  {
    slug: 'rediger-un-devis',
    title: 'Rédiger un devis qui se vend',
    minutes: 5,
    summary: 'Prix, délai, droits : comment remplir un devis qui rassure la marque.',
    sections: [
      ['Le prix se justifie en une phrase', 'Un prix sans explication paraît cher. « 120 € pour 2 vidéos de 30 s, tournées chez moi avec le produit, livrées sous 5 jours » se comprend tout de suite. Indiquez ce qui est inclus.'],
      ['Le délai que vous tiendrez', 'Promettez un délai que vous tenez même avec un imprévu. Un retard déclenche la garantie de remplacement pour la marque. Mieux vaut 7 jours tenus que 3 jours dépassés.'],
      ['Les droits ont un prix', 'Un usage en publicité payante ou une durée longue vaut plus qu\'une publication organique un an. Adaptez votre prix aux droits que vous cédez : c\'est écrit dans le contrat.'],
      ['Le message d\'accompagnement', 'Deux phrases : pourquoi ce produit vous parle, et ce que vous proposez concrètement. Pas de copier-coller : la marque le voit tout de suite.'],
    ],
    quiz: [
      { q: 'Un bon devis indique :', options: ['Un prix, sans détail', 'Ce qui est inclus : nombre de vidéos, durée, délai', 'Uniquement le délai'], answer: 1 },
      { q: 'Vous hésitez entre promettre 3 jours ou 7 jours. Vous tenez 7 jours à coup sûr :', options: ['Promettez 3 jours pour être choisi', 'Promettez 7 jours', 'Ne mettez pas de délai'], answer: 1 },
      { q: 'La marque veut utiliser la vidéo en publicité payante pendant deux ans :', options: ['Même prix qu\'un usage organique', 'Un prix plus élevé, adapté aux droits cédés', 'C\'est interdit'], answer: 1 },
      { q: 'Le message d\'accompagnement du devis :', options: ['Le même pour toutes les campagnes, pour gagner du temps', 'Deux phrases personnalisées : pourquoi ce produit, ce que vous proposez', 'Inutile, le prix suffit'], answer: 1 },
    ],
  },
];

/** Version publique (sans les réponses) */
export function publicGuides() {
  return GUIDES.map(g => ({ slug: g.slug, title: g.title, minutes: g.minutes, summary: g.summary, sections: g.sections, quiz: g.quiz.map(q => ({ q: q.q, options: q.options })) }));
}
