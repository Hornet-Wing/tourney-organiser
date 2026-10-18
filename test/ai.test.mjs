import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAvailability } from '../dist/ai.js';

const input = '24 October 2026 from 18:00 to 22:00 Europe/London';
const output = { windows: [{ date: '2026-10-24', start: '18:00', end: '22:00', timezone: 'Europe/London' }], questions: [] };
// The engine boundary is supplied explicitly so tests need no browser, GPU or download.
function fakeEngine(content, inspect = () => {}) {
  return { chat: { completions: { async create(request) {
    // Model the actual WebLLM 0.2.85 -> XGrammar string boundary. The original
    // request reproduced the reported error here, before any model output.
    if (typeof request.response_format?.schema !== 'string') {
      throw new Error('GrammarMatcherInitError: Cannot pass non-string to std::string');
    }
    inspect(request);
    return { choices: [{ message: { content } }] };
  } } } };
}

test('extraction sends a serialized schema to the grammar compiler and validates the result', async () => {
  let called = false;
  const engine = fakeEngine(JSON.stringify(output), request => {
    called = true;
    assert.equal(request.response_format.type, 'json_object');
    const schema = JSON.parse(request.response_format.schema);
    assert.deepEqual(schema.required, ['windows', 'questions']);
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.windows.type, 'array');
    assert.deepEqual(schema.properties.windows.items.required, ['date', 'start', 'end', 'timezone']);
    for (const field of ['date', 'start', 'end', 'timezone']) assert.equal(schema.properties.windows.items.properties[field].type, 'string');
    assert.equal(schema.properties.questions.items.type, 'string');
    assert.equal(request.messages.at(-1).content, input);
  });
  const result = await extractAvailability(input, '2026-10-24', 'Europe/London', engine);
  assert.equal(called, true);
  assert.equal(result.windows[0].start, '2026-10-24T17:00:00.000Z');
  assert.equal(result.windows[0].end, '2026-10-24T21:00:00.000Z');
});

test('grammar output still goes through semantic date and time validation', async () => {
  const invalid = structuredClone(output);
  invalid.windows[0].date = '2026-02-30';
  await assert.rejects(extractAvailability(input, '2026-10-24', 'Europe/London', fakeEngine(JSON.stringify(invalid))), /valid date/);
});

test('malformed or truncated model output is rejected without accepting availability', async () => {
  await assert.rejects(extractAvailability(input, '2026-10-24', 'Europe/London', fakeEngine('{"windows":[')), /did not return valid JSON/);
});

test('incomplete messages can return clarification questions without inventing a window', async () => {
  const clarification = { windows: [], questions: ['What is the latest time you can finish?'] };
  const result = await extractAvailability('after seven', '2026-10-24', 'Europe/London', fakeEngine(JSON.stringify(clarification)));
  assert.deepEqual(result, clarification);
});
