# Prompts IA

Ces fichiers sont lus à chaque appel (pas besoin de redémarrer le backend pour tester une modification).

- `brief-system.md` : rôle et règles données au modèle (français, ton, format).
- `brief-user.md` : la demande, avec des variables `{{nom}}` remplacées par les informations saisies par la marque.

Variables disponibles dans `brief-user.md` : `{{productDescription}}`, `{{brandName}}`, `{{industry}}`, `{{videoType}}`, `{{videoTypeLabel}}`, `{{platforms}}`, `{{niches}}`, `{{goal}}`, `{{duration}}`, `{{deliverables}}`, `{{tone}}`.

## Fournisseur et modèle (`backend/.env`)

| Variable | Rôle |
|---|---|
| `AI_PROVIDER` | `anthropic`, `openai`, `groq`, ou un fournisseur compatible OpenAI : `novita`, `together`, `deepinfra`, `fireworks`, `openrouter`, `mistral`, `ollama`, `openai-compatible` |
| `AI_MODEL` | Identifiant du modèle chez le fournisseur (ex. `claude-opus-5`, `gpt-5`, `llama-3.3-70b-versatile`, `meta-llama/llama-3.1-70b-instruct`) |
| `AI_API_KEY` | Clé générique, quel que soit le fournisseur (sinon `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`) |
| `AI_BASE_URL` | Uniquement pour `openai-compatible` ou pour remplacer l'URL par défaut d'un fournisseur listé |

Exemples :

```env
# Groq
AI_PROVIDER=groq
AI_MODEL=llama-3.3-70b-versatile
GROQ_API_KEY=gsk_...

# Novita
AI_PROVIDER=novita
AI_MODEL=deepseek/deepseek-v4-flash
AI_API_KEY=...

# Fournisseur compatible OpenAI non listé
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.exemple.com/v1
AI_MODEL=nom-du-modele
AI_API_KEY=...
```

Le brief est demandé en JSON structuré : privilégiez des modèles récents et de taille suffisante (70B et plus chez Groq / Novita) pour un résultat fiable.
