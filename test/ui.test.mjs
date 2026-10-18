// DOM adapter smoke tests exercise actual rendering and event handlers.
// They supplement the core tests; they are not a substitute for a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  innerHTML = ''; textContent = ''; hidden = true; open = false; dataset = {};
  classList = { add() {}, remove() {}, toggle() {} };
  children = new Map();
  querySelector(selector) { if (!this.children.has(selector)) this.children.set(selector, new Element()); return this.children.get(selector); }
  querySelectorAll() { return []; }
  setAttribute(key, value) { this[key] = value; }
  focus() {} select() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  addEventListener() {}
}
const root = new Element(), dialog = new Element(), toast = new Element();
const listeners = {};
const storage = new Map();
globalThis.document = {
  querySelector(selector) { return selector === '#app' ? root : selector === '#dialog' ? dialog : selector === '#toast' ? toast : dialog.querySelector(selector); },
  addEventListener(type, handler) { listeners[type] = handler; },
};
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) };
globalThis.FormData = class {
  constructor(form) { this.data = form.values; }
  get(key) { return this.data[key] ?? null; }
  has(key) { return key in this.data; }
};
await import('../dist/app.js');

async function click(action, data = {}) {
  const button = { dataset: { action, ...data } };
  await listeners.click({ target: { closest: () => button } });
}
async function submit(id, values, data = {}) {
  const form = new Element(); form.id = id; form.values = values; form.dataset = data;
  await listeners.submit({ target: form, preventDefault() {} });
}
const saved = () => JSON.parse(storage.get('town-centre-v1'));

test('initial desk renders the sample and all four first-round match cards', () => {
  assert.match(root.innerHTML, /October Open/);
  assert.match(root.innerHTML, /Sample tournament/);
  assert.equal((root.innerHTML.match(/<article class="match-card/g) || []).length, 4);
  assert.match(root.innerHTML, /No shared window/);
});
test('navigation and match filters render their corresponding views', async () => {
  await click('filter', { filter: 'ready' });
  assert.equal((root.innerHTML.match(/<article class="match-card/g) || []).length, 1);
  await click('navigate', { view: 'bracket' });
  assert.match(root.innerHTML, /The road to the title/);
  assert.equal((root.innerHTML.match(/class="bracket-match /g) || []).length, 7);
  await click('navigate', { view: 'players' });
  assert.match(root.innerHTML, /Edit players &amp; seeds|Edit players & seeds/);
  assert.match(root.innerHTML, /America\/Toronto/);
  await click('navigate', { view: 'desk' });
});
test('availability, proposal and recorded confirmations update the actual saved tournament', async () => {
  await click('availability', { id: 'p7' });
  assert.equal(dialog.open, true);
  assert.match(dialog.innerHTML, /Monk/);
  await submit('availability-form', { date: '2026-10-24', start: '18:00', end: '22:00', zone: 'Europe/London' }, { id: 'p7' });
  assert.equal(saved().players[6].availability.length, 1);
  await click('open-match', { id: 'q3' });
  assert.match(dialog.innerHTML, /Castle vs Monk/);
  assert.match(dialog.innerHTML, /Ready to schedule/);
  await submit('schedule-form', { date: '2026-10-24', time: '18:00', zone: 'Europe/London' }, { id: 'q3' });
  assert.equal(saved().matches[2].scheduledAt, '2026-10-24T17:00:00.000Z');
  await submit('confirm-form', { p0: 'on', p1: 'on' }, { id: 'q3' });
  assert.deepEqual(saved().matches[2].confirmations, [true, true]);
  assert.match(dialog.innerHTML, /Ready to play/);
});
test('invalid results show an error and valid results advance through the UI handler', async () => {
  await submit('result-form', { a: '2', b: '2' }, { id: 'q3' });
  assert.match(dialog.querySelector('.form-error').textContent, /needs one winner/);
  assert.equal(saved().matches[2].score, null);
  await submit('result-form', { a: '2', b: '1' }, { id: 'q3' });
  assert.equal(saved().matches[5].playerIds[0], 'p2');
  assert.match(dialog.innerHTML, /Castle wins 2–1/);
});
test('new event creation clears sample data and opens the player editor', async () => {
  await submit('settings-form', { name: 'Weekend Duel', date: '2026-11-01', zone: 'Europe/London', bestOf: '3', duration: '90', maps: 'Arabia', notes: 'Community rules apply.' }, { new: 'true' });
  const s = saved();
  assert.equal(s.isDemo, false);
  assert.equal(s.event.name, 'Weekend Duel');
  assert.ok(s.players.every(p => !p.availability.length && p.elo === 0));
  assert.ok(s.matches.every(m => !m.score && !m.scheduledAt));
  assert.match(dialog.innerHTML, /Players &amp; seeds/);
});
test('player text is escaped in the rendered dashboard', async () => {
  const values = {};
  for (let i = 1; i <= 8; i++) { values[`name-p${i}`] = i === 1 ? '<img src=x onerror=alert(1)>' : `Competitor ${i}`; values[`elo-p${i}`] = String(1800 - i * 100); }
  await submit('seed-form', values);
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  assert.match(root.innerHTML, /&lt;img src=x/);
});
test('reset requires its explicit confirmation before deleting results', async () => {
  await click('reset-bracket');
  assert.match(dialog.innerHTML, /confirm-reset-bracket/);
  await click('confirm-reset-bracket');
  assert.equal(dialog.open, false);
  assert.equal(saved().matches.length, 7);
});
test('AI remains visibly unloaded until a user requests the model', async () => {
  await click('read-message', { id: 'p1' });
  assert.match(dialog.innerHTML, /Download &amp; load local AI|Download & load local AI/);
  assert.match(dialog.innerHTML, /type="submit" class="button primary" disabled/);
  assert.match(dialog.innerHTML, /Enter availability manually/);
  dialog.close();
});
