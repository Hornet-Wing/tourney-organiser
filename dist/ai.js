import { extractionPrompt, validateExtraction } from './core.js';
export const MODEL = 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC';
// WebLLM 0.2.85 passes json_object.schema to XGrammar as a string.
// Omitting it reaches the WASM binding with undefined and fails before generation.
const AVAILABILITY_SCHEMA_JSON = JSON.stringify({
  type: 'object',
  properties: {
    windows: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
          start: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
          end: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
          timezone: { type: 'string' },
        },
        required: ['date', 'start', 'end', 'timezone'],
        additionalProperties: false,
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['windows', 'questions'],
  additionalProperties: false,
});
let engine;
let loading;
let worker;
export function aiReady() { return Boolean(engine); }
export async function loadAI(onProgress = () => {}) {
  if (engine) return engine;
  if (loading) return loading;
  loading = (async () => {
    if (!navigator.gpu) throw new Error('This browser does not support WebGPU. Try a current desktop Chrome or Edge, or enter availability manually.');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No compatible GPU is available. Enable hardware acceleration or use manual availability.');
    const { CreateWebWorkerMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.85');
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    const candidate = await CreateWebWorkerMLCEngine(worker, MODEL, {
      initProgressCallback: report => onProgress(report.text),
    });
    engine = candidate;
    return candidate;
  })();
  try { return await loading; }
  catch (error) { worker?.terminate(); worker = null; throw error; }
  finally { loading = null; }
}
export async function extractAvailability(text, referenceDate, timeZone, completionEngine = engine) {
  if (!completionEngine) throw new Error('Load the local model first, or enter availability manually.');
  if (!text.trim() || text.length > 2500) throw new Error('Paste a message between 1 and 2,500 characters.');
  const response = await completionEngine.chat.completions.create({
    messages: extractionPrompt(text, referenceDate, timeZone),
    temperature: 0,
    max_tokens: 700,
    response_format: { type: 'json_object', schema: AVAILABILITY_SCHEMA_JSON },
  });
  let raw;
  try { raw = JSON.parse(response.choices[0].message.content); }
  catch { throw new Error('The model did not return valid JSON. Try a shorter message or add the window manually.'); }
  return validateExtraction(raw);
}
