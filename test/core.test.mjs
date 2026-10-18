import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, validateState, buildBracket, matchStatus, matchPlayers, makeWindow, wallToUTC, validDate, overlaps, scheduleMatch, suggestedTimes, recordResult, announcement, validateExtraction } from '../dist/core.js';

test('sample is valid, with one ready match, one waiting, one missing and one conflict', () => {
  const state = validateState(createDemo());
  assert.deepEqual(state.matches.slice(0, 4).map(m => matchStatus(state, m).key), ['ready', 'waiting', 'missing', 'conflict']);
  assert.deepEqual(state.matches.slice(0, 4).map(m => m.playerIds), [['p1', 'p8'], ['p4', 'p5'], ['p2', 'p7'], ['p3', 'p6']]);
  assert.equal(state.matches.length, 7);
});
test('date validation rejects impossible dates without throwing', () => {
  for (const date of ['2026-13-01', '2026-02-30', 'not-a-date', null, '2026-00-01']) assert.equal(validDate(date), false);
  assert.equal(validDate('2028-02-29'), true);
});
test('wall times respect time zones and reject daylight-saving gaps and ambiguities', () => {
  assert.equal(wallToUTC('2026-10-24', '18:00', 'Europe/London'), '2026-10-24T17:00:00.000Z');
  assert.equal(wallToUTC('2026-10-26', '18:00', 'Europe/London'), '2026-10-26T18:00:00.000Z');
  assert.equal(wallToUTC('2026-10-24', '18:00', 'Asia/Kolkata'), '2026-10-24T12:30:00.000Z');
  assert.throws(() => wallToUTC('2026-03-29', '01:30', 'Europe/London'), /does not exist/);
  assert.throws(() => wallToUTC('2026-10-25', '01:30', 'Europe/London'), /occurs twice/);
  assert.throws(() => makeWindow('2026-10-24', '22:00', '18:00', 'UTC'), /end must be later/);
});
test('a full series must fit in an availability intersection', () => {
  const a = [makeWindow('2026-10-24', '18:00', '20:00', 'Europe/London')];
  const b = [makeWindow('2026-10-24', '19:00', '21:00', 'Europe/Paris')];
  assert.equal(overlaps(a, b, 120).length, 1);
  assert.equal(overlaps(a, b, 121).length, 0);
});
test('proposing a new time clears confirmations and rejects partial windows', () => {
  const s = createDemo(), m = s.matches[0];
  scheduleMatch(s, 'q1', '2026-10-24T18:00:00Z');
  assert.deepEqual(m.confirmations, [false, false]);
  assert.equal(matchStatus(s, m).key, 'waiting');
  assert.throws(() => scheduleMatch(s, 'q1', '2026-10-24T19:30:00Z'), /full 90-minute/);
});
test('removing availability invalidates a scheduled match', () => {
  const s = createDemo(), m = s.matches[0];
  s.players[0].availability = [makeWindow('2026-10-24', '20:00', '23:00', 'Europe/London')];
  assert.equal(matchStatus(s, m).key, 'conflict');
});
test('valid scores advance winners, invalid scores leave the bracket untouched', () => {
  const s = createDemo();
  for (const score of [[1, 1], [2, 2], [3, 0], [-1, 2], [1.5, 2]]) {
    assert.throws(() => recordResult(s, 'q1', ...score), /best-of-3/);
    assert.equal(s.matches[0].score, null);
  }
  assert.equal(recordResult(s, 'q1', 2, 1), 'p1');
  assert.deepEqual(s.matches[4].playerIds, ['p1', null]);
  assert.equal(matchStatus(s, s.matches[4]).key, 'pending');
  assert.throws(() => recordResult(s, 'q1', 0, 2), /already locked/);
  recordResult(s, 'q2', 0, 2);
  assert.deepEqual(s.matches[4].playerIds, ['p1', 'p5']);
  assert.doesNotThrow(() => validateState(s));
});
test('a player cannot be scheduled in overlapping series across rounds', () => {
  const s = createDemo();
  recordResult(s, 'q1', 2, 0); recordResult(s, 'q2', 2, 0);
  assert.throws(() => scheduleMatch(s, 's1', '2026-10-24T18:00:00Z'), /overlaps|after.*finishes/);
  const suggestions = suggestedTimes(s, s.matches[4]);
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every(t => Date.parse(t) >= Date.parse('2026-10-24T19:30:00Z')));
});
test('later rounds cannot be scheduled before their prerequisite series', () => {
  const s = createDemo();
  for (const p of s.players) p.availability = [makeWindow('2026-10-24', '09:00', '23:00', 'UTC')];
  recordResult(s, 'q1', 2, 0); recordResult(s, 'q2', 2, 0);
  assert.throws(() => scheduleMatch(s, 's1', '2026-10-24T12:00:00Z'), /after.*finishes/);
});
test('the whole bracket advances through seven results to a champion', () => {
  const s = createDemo();
  for (const id of ['q1', 'q2', 'q3', 'q4', 's1', 's2', 'f1']) recordResult(s, id, 2, 0);
  assert.equal(s.matches.filter(m => m.score).length, 7);
  assert.equal(s.matches[6].playerIds[0], 'p1');
  assert.doesNotThrow(() => validateState(s));
});
test('seed input must be a permutation of 1 to 8', () => {
  const s = createDemo(); s.players[1].seed = 1;
  assert.throws(() => buildBracket(s.players), /exactly once/);
});
test('model output is converted to validated UTC windows; invalid fields are rejected', () => {
  const parsed = validateExtraction({ windows: [{ date: '2026-10-24', start: '18:00', end: '22:00', timezone: 'Europe/London' }], questions: [] });
  assert.equal(parsed.windows[0].start, '2026-10-24T17:00:00.000Z');
  for (const bad of [{ windows: [], questions: [false] }, { windows: [{ date: '2026-10-24', start: '19:00', end: '18:00', timezone: 'UTC' }], questions: [] }, { windows: [{ date: '2026-10-24', start: '19:00', end: '22:00', timezone: 'EST-ish' }], questions: [] }, {}]) assert.throws(() => validateExtraction(bad));
});
test('import rejects forged participants, score inconsistencies and unsafe links', () => {
  const cases = [
    s => { s.matches[4].playerIds[0] = 'p1'; },
    s => { s.matches[0].playerIds.reverse(); },
    s => { s.matches[0].score = [2, 2]; },
    s => { s.players[0].availability[0].end = 'not-a-time'; },
    s => { s.event.duration = 0; },
    s => { s.matches[0].draftUrl = 'javascript:alert(1)'; },
    s => { const old = s.players[0].id; s.players[0].id = 'p1" autofocus'; s.matches[0].playerIds[0] = s.players[0].id; },
  ];
  for (const mutate of cases) { const s = createDemo(); mutate(s); assert.throws(() => validateState(s)); }
});
test('Discord announcements include actual confirmation state and localised timestamps', () => {
  const s = createDemo();
  const text = announcement(s, s.matches[1]);
  assert.match(text, /Awaiting confirmation/);
  assert.match(text, /<t:\d+:F>/);
  s.players[3].name = '@everyone **hello**';
  assert.doesNotMatch(announcement(s, s.matches[1]), /@everyone/);
});
