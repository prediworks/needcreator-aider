# Prompts IA

Ces fichiers sont lus à chaque appel (pas besoin de redémarrer le backend pour tester une modification).

- `brief-system.md` : rôle et règles données au modèle (français, ton, format).
- `brief-user.md` : la demande, avec des variables `{{nom}}` remplacées par les informations saisies par la marque.

Variables disponibles dans `brief-user.md` : `{{productDescription}}`, `{{brandName}}`, `{{industry}}`, `{{videoType}}`, `{{videoTypeLabel}}`, `{{platforms}}`, `{{niches}}`, `{{goal}}`, `{{duration}}`, `{{deliverables}}`, `{{tone}}`.

Fournisseur et modèle : variables `AI_PROVIDER` (anthropic | openai), `AI_MODEL`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` dans `backend/.env`.
