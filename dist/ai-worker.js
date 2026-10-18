// Loaded only after the organiser explicitly chooses to download the local model.
import { WebWorkerMLCEngineHandler } from 'https://esm.run/@mlc-ai/web-llm@0.2.85';
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = event => handler.onmessage(event);
