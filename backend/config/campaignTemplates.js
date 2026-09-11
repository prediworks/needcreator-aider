/**
 * Bibliothèque de modèles de campagne par secteur : pré-remplit le formulaire (la marque adapte ensuite).
 * Servie par GET /api/campaigns/templates.
 */
export const CAMPAIGN_TEMPLATES = [
  {
    key: 'beauty-testimonial', sector: 'Beauté et soins', title: 'Témoignage authentique sur un soin',
    videoType: 'testimonial', duration: 30, deliverables: 2, niches: ['beauty'], platforms: ['tiktok', 'instagram'], productShipping: true,
    description: 'Nous cherchons un témoignage sincère après une semaine d\'utilisation de notre soin. Parlez de votre routine, de la texture, du résultat que vous avez constaté, à la première personne, comme à une amie. Filmé chez vous, en lumière naturelle, produit en main au moins une fois.',
    requirements: ['Nommer le produit à voix haute dans les 5 premières secondes', 'Montrer la texture et l\'application', 'Pas de filtre beauté', 'Format vertical, sous-titres bienvenus'],
  },
  {
    key: 'ecommerce-unboxing', sector: 'E-commerce', title: 'Unboxing et première impression',
    videoType: 'unboxing', duration: 45, deliverables: 1, niches: ['lifestyle'], platforms: ['tiktok', 'instagram', 'youtube'], productShipping: true,
    description: 'Ouvrez le colis face caméra et partagez votre première impression : emballage, découverte du produit, premier essai. Ton spontané, réactions vraies. Nous voulons voir le moment de la découverte, pas une présentation lue.',
    requirements: ['Le colis fermé au début de la vidéo', 'Une phrase sur ce qui vous a surpris', 'Le produit utilisé au moins une fois', 'Vertical 9:16'],
  },
  {
    key: 'food-recipe', sector: 'Food et boissons', title: 'Recette rapide avec notre produit',
    videoType: 'demo', duration: 45, deliverables: 1, niches: ['food'], platforms: ['tiktok', 'instagram'], productShipping: true,
    description: 'Une recette simple, réalisable en moins de 10 minutes, où notre produit est l\'ingrédient clé. Plans rapprochés sur la préparation, résultat final appétissant, et votre avis en dégustation.',
    requirements: ['Le paquet visible en début de vidéo', 'Étapes filmées de haut ou en gros plan', 'Dégustation face caméra à la fin', 'Pas d\'autre marque visible'],
  },
  {
    key: 'tech-demo', sector: 'Tech et applications', title: 'Démo d\'usage en situation réelle',
    videoType: 'demo', duration: 60, deliverables: 1, niches: ['tech'], platforms: ['tiktok', 'youtube', 'linkedin'], productShipping: false,
    description: 'Montrez comment vous utilisez notre application ou notre appareil dans une situation concrète de votre quotidien : le problème, le geste, le résultat. Capture d\'écran ou filmé à l\'épaule, avec votre voix qui explique ce que vous faites.',
    requirements: ['Un cas d\'usage précis, un seul', 'Le nom du produit dit clairement', 'Interface lisible (pas de zoom flou)', 'Conclusion en une phrase : ce que ça change'],
  },
  {
    key: 'fashion-tryon', sector: 'Mode et accessoires', title: 'Essayage et mise en tenue',
    videoType: 'testimonial', duration: 30, deliverables: 2, niches: ['fashion'], platforms: ['tiktok', 'instagram'], productShipping: true,
    description: 'Essayez la pièce et intégrez-la dans deux tenues différentes. Parlez de la matière, de la coupe, de la taille prise. Filmé en pied, en lumière naturelle, avec un plan rapproché sur les détails.',
    requirements: ['Plan en pied et plan détail', 'Indiquer la taille portée', 'Deux tenues distinctes', 'Musique libre de droits ou sans musique'],
  },
  {
    key: 'service-tutorial', sector: 'Services et abonnements', title: 'Tutoriel : comment ça marche, de A à Z',
    videoType: 'tutorial', duration: 60, deliverables: 1, niches: ['lifestyle', 'business'], platforms: ['youtube', 'instagram', 'website'], productShipping: false,
    description: 'Guidez un nouvel utilisateur de l\'inscription au premier résultat obtenu avec notre service. Chaque étape est montrée à l\'écran et commentée. Vous terminez par ce que vous avez obtenu et pour qui c\'est utile.',
    requirements: ['Toutes les étapes visibles à l\'écran', 'Rythme soutenu, pas de temps mort', 'Mention du prix ou de l\'offre d\'essai si applicable', 'Format horizontal 16:9 accepté'],
  },
];
