import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { generateObject } from 'ai';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Service IA indépendant du fournisseur (Vercel AI SDK).
 * Le fournisseur et le modèle se choisissent dans .env : AI_PROVIDER, AI_MODEL, clés API.
 * Les prompts sont dans backend/config/prompts/*.md (rechargés à chaque appel).
 */

const PROMPTS_DIR = path.resolve(process.cwd(), 'config/prompts');

const DEFAULT_MODELS = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
  groq: 'llama-3.3-70b-versatile',
  'openai-compatible': null, // AI_MODEL obligatoire (dépend du fournisseur)
};

// Fournisseurs "compatibles OpenAI" connus : URL de base pré-remplie si AI_BASE_URL est absent
const COMPATIBLE_BASE_URLS = {
  novita: 'https://api.novita.ai/v3/openai',
  together: 'https://api.together.xyz/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  mistral: 'https://api.mistral.ai/v1',
  ollama: 'http://localhost:11434/v1',
};

/**
 * Configuration IA lue dans .env :
 *  AI_PROVIDER = anthropic | openai | groq | novita | together | deepinfra | fireworks | openrouter | mistral | ollama | openai-compatible
 *  AI_MODEL    = identifiant du modèle chez le fournisseur
 *  AI_API_KEY  = clé générique (sinon ANTHROPIC_API_KEY / OPENAI_API_KEY / GROQ_API_KEY selon le fournisseur)
 *  AI_BASE_URL = URL de base pour un fournisseur compatible OpenAI non listé
 */
export function aiConfig() {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const keyByProvider = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    groq: process.env.GROQ_API_KEY,
  };
  const key = process.env.AI_API_KEY || keyByProvider[provider];
  const isCompatible = !['anthropic', 'openai', 'groq'].includes(provider);
  const baseURL = process.env.AI_BASE_URL || COMPATIBLE_BASE_URLS[provider] || null;
  const model = process.env.AI_MODEL || DEFAULT_MODELS[provider] || null;
  const needsKey = provider !== 'ollama';
  return {
    provider,
    model,
    baseURL: isCompatible ? baseURL : null,
    configured: !!model && (!needsKey || !!key) && (!isCompatible || !!baseURL),
    keyVar: process.env.AI_API_KEY ? 'AI_API_KEY' : (provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : provider === 'openai' ? 'OPENAI_API_KEY' : provider === 'groq' ? 'GROQ_API_KEY' : 'AI_API_KEY'),
  };
}

async function getModel() {
  const { provider, model, configured, baseURL, keyVar } = aiConfig();
  if (!configured) {
    const missing = !model ? 'AI_MODEL' : (!baseURL && !['anthropic', 'openai', 'groq'].includes(provider)) ? 'AI_BASE_URL' : keyVar;
    const err = new Error(`Fournisseur IA "${provider}" non configuré : ajoutez ${missing} dans backend/.env`);
    err.status = 503;
    throw err;
  }
  const apiKey = process.env.AI_API_KEY || undefined;
  if (provider === 'openai') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    return createOpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY })(model);
  }
  if (provider === 'anthropic') {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    return createAnthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY })(model);
  }
  if (provider === 'groq') {
    const { createGroq } = await import('@ai-sdk/groq');
    return createGroq({ apiKey: apiKey || process.env.GROQ_API_KEY })(model);
  }
  // Tout fournisseur exposant une API compatible OpenAI (Novita, Together, OpenRouter, Ollama…)
  const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
  return createOpenAICompatible({ name: provider, baseURL, apiKey: apiKey || 'no-key' })(model);
}

/**
 * Lit un prompt et remplace les {{variables}}
 */
export function loadPrompt(name, variables = {}) {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  let text = fs.readFileSync(file, 'utf8');
  for (const [k, v] of Object.entries(variables)) {
    text = text.replaceAll(`{{${k}}}`, v == null || v === '' ? 'non précisé' : String(v));
  }
  return text.replace(/\{\{[a-zA-Z]+\}\}/g, 'non précisé').trim();
}

export const briefSchema = z.object({
  title: z.string().min(10).max(100),
  description: z.string().min(50).max(1000),
  requirements: z.array(z.string().min(5)).min(3).max(10),
  dos: z.array(z.string()).max(6),
  donts: z.array(z.string()).max(6),
  hashtags: z.array(z.string()).max(8),
  suggestedDuration: z.number().int().min(15).max(180),
  suggestedDeliverables: z.number().int().min(1).max(10),
  rationale: z.string().max(400),
});

/**
 * Génère un brief structuré
 */
export async function generateBrief(variables) {
  const model = await getModel();
  const system = loadPrompt('brief-system', variables);
  const prompt = loadPrompt('brief-user', variables);
  const started = Date.now();
  const { object, usage } = await generateObject({ model, schema: briefSchema, system, prompt, maxRetries: 1 });
  logger.info(`AI brief generated in ${Date.now() - started} ms (${aiConfig().provider}/${aiConfig().model}, ${usage?.totalTokens ?? '?'} tokens)`);
  return object;
}
