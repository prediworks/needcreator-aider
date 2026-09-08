Rédige un brief de campagne UGC à partir de ces informations.

Marque : {{brandName}} (secteur : {{industry}})
Produit / service : {{productDescription}}
Type de vidéo souhaité : {{videoTypeLabel}}
Réseaux de diffusion : {{platforms}}
Cibles / niches : {{niches}}
Objectif de la marque : {{goal}}
Ton souhaité : {{tone}}
Durée visée : {{duration}} secondes · Nombre de vidéos : {{deliverables}}

Produis :
1. Un titre de campagne accrocheur (10 à 80 caractères), sans guillemets.
2. Une description (150 à 600 caractères) qui présente la marque, le produit et ce qu'on attend du créateur.
3. Entre 5 et 8 consignes précises (une phrase chacune) : accroche des 3 premières secondes, structure, bénéfices à mentionner, appel à l'action, format.
4. 3 à 5 choses à faire (dos) et 3 à 5 choses à éviter (donts), courtes.
5. 3 à 6 hashtags pertinents (sans le #).
6. Une durée recommandée en secondes (15 à 90) et un nombre de vidéos recommandé (1 à 5) avec une phrase d'explication.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises de code, en utilisant exactement ces clés (en anglais) :
{
  "title": "string (10 à 80 caractères)",
  "description": "string (150 à 600 caractères)",
  "requirements": ["string", "..."],
  "dos": ["string", "..."],
  "donts": ["string", "..."],
  "hashtags": ["string sans #", "..."],
  "suggestedDuration": 30,
  "suggestedDeliverables": 2,
  "rationale": "string (une phrase)"
}
Les valeurs (textes) sont en français.
