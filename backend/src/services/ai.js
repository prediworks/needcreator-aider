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
};

export function aiConfig() {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const key = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return {
    provider,
    model: process.env.AI_MODEL || DEFAULT_MODELS[provider] || DEFAULT_MODELS.anthropic,
    configured: !!key,
  };
}

async function getModel() {
  const { provider, model, configured } = aiConfig();
  if (!configured) {
    const err = new Error(`Fournisseur IA "${provider}" non configuré : ajoutez ${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} dans backend/.env`);
    err.status = 503;
    throw err;
  }
  if (provider === 'openai') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
  }
  const { createAnthropic } = await import('@ai-sdk/anthropic');
  return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(model);
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
