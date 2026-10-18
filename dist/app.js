import { ZONES, createDemo, validateState, player, matchPlayers, matchStatus, suggestedTimes, scheduleMatch, recordResult, buildBracket, wallToUTC, makeWindow, formatTime, localFields, announcement, validZone, validDate } from './core.js';
import { loadAI, aiReady, extractAvailability } from './ai.js';

const KEY = 'town-centre-v1';
const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let storageWarning = '';
let state;
try {
  const saved = localStorage.getItem(KEY);
  state = saved ? validateState(JSON.parse(saved)) : createDemo();
} catch {
  state = createDemo();
  storageWarning = 'Saved data could not be read. The sample is open; use Import backup to recover a saved tournament.';
}
let view = 'desk';
let filter = 'all';
let selectedMatch = null;
let extraction = null;
let aiBusy = false;
let modelProgress = '';
let toastTimer;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = {
  castle: '<path d="M4 20V7h4v4h3V5h2v6h3V7h4v13H4Zm6 0v-5h4v5M3 20h18M5 4v3m14-3v3"/>',
  desk: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  bracket: '<path d="M3 3v5h5V3M3 16v5h5v-5M8 6h5v12H8m5-6h7m0-4v8"/>',
  players: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  flag: '<path d="M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
  message: '<path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-5 2 2-5a9 9 0 1 1 16-5Z"/><path d="M8 9h8M8 13h5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.flag}</svg>`;
const badge = status => `<span class="status ${status.key}"><i></i>${status.label}</span>`;
const zoneOptions = selected => [...new Set([selected, ...ZONES])].filter(Boolean).map(z => `<option ${z === selected ? 'selected' : ''}>${esc(z)}</option>`).join('');
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 5000);
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { storageWarning = 'Browser storage is unavailable or full. Export a backup before closing this tab.'; }
}
function commit(fn, message) {
  const previous = structuredClone(state);
  try { fn(); validateState(state); persist(); render(); if (message) toast(message); }
  catch (error) { state = previous; throw error; }
}
function errorInDialog(error) {
  const target = dialog.querySelector('.form-error');
  if (target) { target.textContent = error.message || String(error); target.hidden = false; target.focus(); }
  else toast(error.message || String(error));
}
function openDialog(html, wide = false) {
  dialog.classList.toggle('wide', wide);
  dialog.innerHTML = `${html}<p class="form-error" role="alert" tabindex="-1" hidden></p>`;
  if (!dialog.open) dialog.showModal();
}
const dialogHeader = (title, subtitle = '') => `<div class="dialog-head"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div>`;

function render() {
  const qfs = state.matches.filter(m => m.round === 0);
  const complete = state.matches.filter(m => m.score).length;
  const ready = state.matches.filter(m => matchStatus(state, m).key === 'ready').length;
  const needs = state.matches.filter(m => ['conflict', 'missing', 'schedule'].includes(matchStatus(state, m).key)).length;
  root.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#desk" aria-label="Town Centre tournament desk"><span class="brand-mark">${icon('castle')}</span><span>Town Centre<small>Tournament organiser</small></span></a>
      <div class="sidebar-event"><span class="event-monogram">${icon('flag')}</span><div><strong>${esc(state.event.name)}</strong><small>Age of Empires II: DE</small></div></div>
      <nav aria-label="Tournament navigation">${[['desk', 'desk', 'Tournament desk'], ['bracket', 'bracket', 'Bracket'], ['players', 'players', 'Players']].map(([id, ico, label]) => `<button class="nav-item ${view === id ? 'active' : ''}" data-action="navigate" data-view="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(ico)}${label}${id === 'players' ? '<span class="nav-count">8</span>' : ''}</button>`).join('')}</nav>
      <div class="sidebar-bottom"><button class="nav-item" data-action="settings">${icon('settings')}Event settings</button><button class="nav-item" data-action="backup">${icon('download')}Backup & restore</button><button class="model-card" data-action="ai-settings"><span class="model-orb">${icon('sparkle')}</span><span><strong>Private AI reader</strong><small>${aiReady() ? 'Model ready on this device' : 'Runs on your device'}</small></span>${icon('chevron')}</button><small class="sidebar-foot">Built for the community.<br>Independent of World's Edge.</small></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb">${icon(view === 'bracket' ? 'bracket' : view === 'players' ? 'players' : 'desk')}<span>${view === 'bracket' ? 'Bracket' : view === 'players' ? 'Players' : 'Tournament desk'}</span><span class="crumb-divider">/</span><strong>${esc(state.event.name)}</strong></div><span class="save-status"><i></i>${storageWarning ? 'Export to save' : 'Saved on this browser'}</span><div class="mobile-tools"><button class="icon-button" data-action="settings" aria-label="Event settings">${icon('settings')}</button><button class="icon-button" data-action="backup" aria-label="Backup and restore">${icon('download')}</button></div></header>
      <main id="main" tabindex="-1">
        ${storageWarning ? `<div class="notice warning">${esc(storageWarning)}</div>` : ''}
        ${state.isDemo ? `<div class="sample-bar"><span><strong>Sample tournament</strong> Explore with eight fictional players. Your changes are saved locally.</span><button data-action="new-event">Create your tournament ${icon('plus')}</button></div>` : ''}
        <section class="event-heading"><div><p class="game-label">Age of Empires II: Definitive Edition</p><h1>${esc(state.event.name)}</h1><div class="event-meta"><span>${icon('clock')}${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(state.event.date + 'T12:00Z'))}</span><span>8 players</span><span>1v1 · Best of ${state.event.bestOf}</span><span>Single elimination</span></div></div><button class="button primary" data-action="read-message">${icon('sparkle')}Read a player message</button></section>
        ${view === 'desk' ? deskView(ready, needs, complete) : view === 'bracket' ? bracketView() : playersView()}
        <footer class="page-foot"><span>${icon('castle')}Town Centre</span><span>Times shown in ${esc(state.event.timeZone)} · Messages stay on your device.</span></footer>
      </main>
    </div>`;
}
function deskView(ready, needs, complete) {
  const waiting = state.matches.filter(m => matchStatus(state, m).key === 'waiting').length;
  const activeRound = state.matches.some(m => m.round === 0 && !m.score) ? 0 : state.matches.some(m => m.round === 1 && !m.score) ? 1 : 2;
  const matches = state.matches.filter(m => m.round === activeRound);
  const shown = matches.filter(m => filter === 'all' || (filter === 'attention' ? ['missing', 'conflict', 'schedule'].includes(matchStatus(state, m).key) : matchStatus(state, m).key === filter));
  const final = state.matches.find(m => m.id === 'f1');
  const champion = final.score ? player(state, final.playerIds[final.score[0] > final.score[1] ? 0 : 1]) : null;
  return `<div class="desk-layout"><div class="desk-primary">
    <section class="readiness"><div class="readiness-title"><span class="round-emblem">${icon(champion ? 'flag' : 'bracket')}</span><div><h2>${champion ? `${esc(champion.name)} takes the title.` : ['The quarterfinals await.', 'The field narrows to four.', 'One series. One champion.'][activeRound]}</h2><p>${champion ? 'All seven series are complete. Export a backup to keep your tournament record.' : 'Keep the bracket moving, one confirmed match at a time.'}</p></div></div><div class="stat-strip"><div><strong>${ready}</strong><span><i class="dot green"></i>Ready to play</span></div><div><strong>${waiting}</strong><span><i class="dot blue"></i>Awaiting confirmation</span></div><div><strong>${needs}</strong><span><i class="dot amber"></i>Need attention</span></div><div><strong>${complete}<small>/7</small></strong><span>Series complete</span></div></div></section>
    <section class="match-section"><div class="section-heading"><div><h2>${['Quarterfinals', 'Semifinals', 'Grand final'][activeRound]}</h2><p>${['Four series to find the final four.', 'Two places in the grand final.', 'The last step to the title.'][activeRound]}</p></div><button class="text-button" data-action="navigate" data-view="bracket">View full bracket ${icon('chevron')}</button></div><div class="filter-row" role="group" aria-label="Filter matches">${[['all', 'All matches'], ['attention', 'Need attention'], ['ready', 'Ready to play'], ['waiting', 'Awaiting confirmation']].map(([id, label]) => `<button data-action="filter" data-filter="${id}" class="filter ${filter === id ? 'selected' : ''}" aria-pressed="${filter === id}">${label}</button>`).join('')}</div><div class="match-grid">${shown.length ? shown.map(matchCard).join('') : '<div class="empty-state">No matches in this view. Choose another filter to see the rest.</div>'}</div></section>
    </div><aside class="desk-secondary"><section class="attention-panel"><div class="section-heading"><h2>At the organiser’s desk</h2>${icon('flag')}</div>${attentionItems()}<div class="desk-tip">A proposed time becomes ready only when you record both players’ confirmations.</div></section><section class="ai-panel"><span class="ai-symbol">${icon('message')}</span><h2>Less chasing.<br>More playing.</h2><p>Turn “Tuesday after seven” into availability you can review and use.</p><button class="button light" data-action="read-message">Read a player message ${icon('sparkle')}</button><small>Open-weight AI. Private on your device.</small></section><section class="progress-panel"><h3>Road to the title</h3>${[['Quarterfinals', 0, 4], ['Semifinals', 1, 2], ['Grand final', 2, 1]].map(([label, round, total]) => { const done = state.matches.filter(m => m.round === round && m.score).length; return `<div class="round-progress"><span class="round-node ${done === total ? 'done' : activeRound === round ? 'current' : ''}">${done === total ? icon('check') : round + 1}</span><span>${label}</span><small>${done}/${total}</small></div>`; }).join('')}</section></aside></div>`;
}
function attentionItems() {
  const actionable = state.matches.filter(m => ['missing', 'conflict', 'waiting', 'schedule'].includes(matchStatus(state, m).key));
  if (!actionable.length) return '<p class="all-clear">No loose ends. Your next matches are ready.</p>';
  return actionable.slice(0, 4).map(m => {
    const status = matchStatus(state, m);
    const [a, b] = matchPlayers(state, m);
    let message = status.key === 'missing' ? `${!a.availability.length ? a.name : b.name} needs to share availability` : status.key === 'waiting' ? `Waiting for ${[a, b].filter((p, i) => !m.confirmations[i]).map(p => p.name).join(' and ')}` : status.key === 'conflict' ? `${a.name} and ${b.name} need a new window` : `${a.name} vs ${b.name} can be scheduled`;
    return `<button class="attention-item" data-action="open-match" data-id="${m.id}"><span class="attention-dot ${status.key}"></span><span><strong>${esc(message)}</strong><small>${m.label}</small></span>${icon('chevron')}</button>`;
  }).join('');
}
function matchCard(match) {
  const status = matchStatus(state, match);
  const participants = matchPlayers(state, match);
  return `<article class="match-card ${status.key}"><div class="match-card-top"><span>${match.label}</span>${badge(status)}</div><div class="match-players">${participants.map((p, i) => `<div class="match-player"><span class="seed">${p?.seed || '—'}</span><span class="player-avatar tone-${(p?.seed || 1) % 4}">${esc(p?.name.slice(0, 1) || '?')}</span><strong>${esc(p?.name || 'Awaiting winner')}</strong><small>${p ? (p.elo ? `${p.elo} Elo` : 'Unrated') : ''}</small>${match.score ? `<b class="score">${match.score[i]}</b>` : ''}</div>`).join('<div class="versus-rule"><span>vs</span></div>')}</div><div class="match-card-bottom"><span>${icon('clock')}${match.scheduledAt ? esc(formatTime(match.scheduledAt, state.event.timeZone)) : 'Time to be agreed'}</span><button class="button small ${['missing', 'conflict'].includes(status.key) ? 'outline' : ''}" data-action="open-match" data-id="${match.id}">${match.score ? 'View result' : status.key === 'ready' ? 'Manage match' : 'Arrange match'}${icon('chevron')}</button></div></article>`;
}
function bracketView() {
  return `<section class="bracket-section"><div class="section-heading"><div><h2>The road to the title</h2><p>Seeds are organiser-approved. Recording a result advances the winner.</p></div><button class="button outline" data-action="reset-bracket">Reset bracket</button></div><div class="bracket-scroll"><div class="bracket-board">${[['Quarterfinals', 0], ['Semifinals', 1], ['Grand final', 2]].map(([label, round]) => `<div class="bracket-column round-${round}"><h3>${label}<small>Best of ${state.event.bestOf}</small></h3><div class="bracket-matches">${state.matches.filter(m => m.round === round).map(m => { const ps = matchPlayers(state, m); return `<button class="bracket-match ${m.score ? 'finished' : ''}" data-action="open-match" data-id="${m.id}"><span class="bracket-label">${m.label}</span>${ps.map((p, i) => `<span class="bracket-player ${m.score && m.score[i] > m.score[1 - i] ? 'winner' : ''}"><small>${p?.seed || '—'}</small><strong>${esc(p?.name || `Winner of ${round === 1 ? `QF ${Number(m.id[1]) * 2 - 1 + i}` : `SF ${i + 1}`}`)}</strong><b>${m.score ? m.score[i] : '—'}</b></span>`).join('')}<span class="bracket-status">${badge(matchStatus(state, m))}</span></button>`; }).join('')}</div></div>`).join('')}</div></div><p class="subtle">Match slots reserve ${state.event.duration} minutes. Later rounds can be arranged once their players are known.</p></section>`;
}
function playersView() {
  return `<section class="players-section"><div class="section-heading"><div><h2>The field</h2><p>Manage names, 1v1 ratings, and availability for all eight players.</p></div><button class="button outline" data-action="seed-settings">Edit players & seeds</button></div><div class="table-wrap"><table><thead><tr><th>Seed</th><th>Player</th><th>1v1 Elo</th><th>Time zone</th><th>Availability</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${[...state.players].sort((a, b) => a.seed - b.seed).map(p => `<tr><td><span class="seed">${p.seed}</span></td><td><span class="table-player"><span class="player-avatar tone-${p.seed % 4}">${esc(p.name.slice(0, 1))}</span><strong>${esc(p.name)}</strong></span></td><td>${p.elo || 'Unrated'}</td><td>${esc(p.timeZone)}</td><td><span class="availability-label ${p.availability.length ? 'has' : ''}">${p.availability.length ? `${p.availability.length} window${p.availability.length === 1 ? '' : 's'}` : 'Not shared'}</span></td><td><button class="text-button" data-action="availability" data-id="${esc(p.id)}">Edit availability ${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div><div class="notice">Ratings are entered manually. Review seeds before starting; changing them resets matches and results.</div></section>`;
}

function showMatch(id) {
  selectedMatch = id;
  const m = state.matches.find(m => m.id === id);
  const [a, b] = matchPlayers(state, m);
  const status = matchStatus(state, m);
  if (!a || !b) return openDialog(`${dialogHeader(m.label)}<div class="notice">This match is waiting for winners from the previous round. Record those results to continue.</div><button class="button primary" data-action="close-dialog">Back to bracket</button>`);
  const fields = localFields(m.scheduledAt || `${state.event.date}T18:00:00Z`, state.event.timeZone);
  const suggestions = suggestedTimes(state, m);
  openDialog(`${dialogHeader(`${a.name} vs ${b.name}`, `${m.label} · Best of ${state.event.bestOf}`)}<div class="dialog-status">${badge(status)}</div>
    <div class="player-windows">${[a, b].map(p => `<div><strong>${esc(p.name)}</strong><small>${esc(p.timeZone)}</small>${p.availability.length ? p.availability.map(w => `<p>${esc(formatTime(w.start, p.timeZone))}<br><span>until ${esc(formatTime(w.end, p.timeZone))}</span></p>`).join('') : '<p class="warn-text">Availability not shared</p>'}<button class="text-button" data-action="availability" data-id="${esc(p.id)}">Edit availability</button></div>`).join('')}</div>
    ${!m.score ? `<section class="dialog-section"><h3>Agree a match time</h3><p>Reserve ${state.event.duration} minutes within both players’ availability.</p>${suggestions.length ? `<div class="time-suggestions">${suggestions.map(t => `<button class="time-option" data-action="use-time" data-time="${t}">${esc(formatTime(t, state.event.timeZone))}</button>`).join('')}</div>` : '<p class="notice">No valid suggestions yet. Add or adjust availability for both players.</p>'}<form id="schedule-form" data-id="${m.id}"><div class="form-row"><label>Date<input name="date" type="date" required value="${fields.date}"></label><label>Start time<input name="time" type="time" required value="${fields.time}"></label></div><label>Time zone<select name="zone">${zoneOptions(state.event.timeZone)}</select></label><button class="button primary" type="submit">${m.scheduledAt ? 'Update proposed time' : 'Propose match time'}</button><small class="field-help">Changing the proposed time clears both confirmations.</small></form></section>
    ${m.scheduledAt ? `<section class="dialog-section"><h3>Player confirmations</h3><p>Record confirmations you have received from the players.</p><form id="confirm-form" data-id="${m.id}"><div class="confirm-grid">${[a, b].map((p, i) => `<label class="check-label"><input type="checkbox" name="p${i}" ${m.confirmations[i] ? 'checked' : ''}>${esc(p.name)} confirmed</label>`).join('')}</div><button class="button outline" type="submit">Save confirmations</button></form></section>` : ''}
    <section class="dialog-section"><h3>Map & civilization draft</h3><form id="draft-form" data-id="${m.id}"><label>Draft link (optional)<input type="url" name="url" placeholder="https://aoe2cm.net/…" value="${esc(m.draftUrl)}" maxlength="2000"></label><button class="button outline" type="submit">Save draft link</button></form></section>
    <section class="dialog-section"><h3>Record series result</h3><p>Enter the result after the series. The winner advances and this result locks.</p><form id="result-form" data-id="${m.id}"><div class="form-row"><label>${esc(a.name)}<input type="number" name="a" min="0" max="${(state.event.bestOf + 1) / 2}" required value="0"></label><label>${esc(b.name)}<input type="number" name="b" min="0" max="${(state.event.bestOf + 1) / 2}" required value="0"></label></div><button class="button primary" type="submit">Record result & advance winner</button></form></section>` : `<div class="result-banner">${icon('flag')}<div><strong>${esc(m.score[0] > m.score[1] ? a.name : b.name)} wins ${Math.max(...m.score)}–${Math.min(...m.score)}</strong><p>The result is recorded in your bracket.</p></div></div>`}
    <section class="dialog-section"><h3>Discord announcement</h3><textarea id="announcement-text" rows="8" readonly aria-label="Discord match announcement">${esc(announcement(state, m))}</textarea><button class="button outline" data-action="copy-announcement">Copy announcement</button><small class="field-help">Copying does not post to Discord. Discord displays timestamps in each reader’s local time.</small></section>`, true);
}
function showAvailability(id) {
  const p = player(state, id);
  openDialog(`${dialogHeader(`${p.name}’s availability`, 'Review windows before using them to arrange a match.')}<div class="availability-list">${p.availability.length ? p.availability.map((w, i) => `<div class="window-item"><span>${icon('clock')}<span>${esc(formatTime(w.start, p.timeZone))}<small>until ${esc(formatTime(w.end, p.timeZone))}</small></span></span><button class="icon-button" data-action="remove-window" data-id="${esc(id)}" data-index="${i}" aria-label="Remove availability window ${i + 1}">${icon('close')}</button></div>`).join('') : '<div class="empty-state compact">No availability shared yet. Add a window or read a player message.</div>'}</div><form id="availability-form" data-id="${esc(id)}"><h3>Add an availability window</h3><label>Date<input name="date" type="date" required value="${state.event.date}"></label><div class="form-row"><label>From<input name="start" type="time" required value="18:00"></label><label>Until<input name="end" type="time" required value="22:00"></label></div><label>Time zone<select name="zone">${zoneOptions(p.timeZone)}</select></label><button class="button primary" type="submit">${icon('plus')}Add window</button></form><div class="dialog-section"><button class="button outline" data-action="read-message" data-id="${esc(id)}">${icon('sparkle')}Read this player’s message</button>${selectedMatch ? `<button class="text-button" data-action="open-match" data-id="${selectedMatch}">Back to match</button>` : ''}</div>`);
}
function showReader(id) {
  extraction = null;
  const selected = player(state, id) || state.players.find(p => !p.availability.length) || state.players[0];
  openDialog(`${dialogHeader('Read a player message', 'Extract availability, review the interpretation, then save.')}<div class="privacy-note">${icon('sparkle')}The model runs locally. Your message stays on this device.</div><form id="reader-form"><div class="form-row"><label>Player<select name="playerId">${state.players.map(p => `<option value="${esc(p.id)}" ${p.id === selected.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label>Reference date<input type="date" name="referenceDate" required value="${state.event.date}"></label></div><label>Player’s declared time zone<select name="zone"><option value="">Unknown — ask the player</option>${zoneOptions(selected.timeZone)}</select></label><label>Availability message<textarea name="message" maxlength="2500" rows="5" required placeholder="I can play on 24 October 2026, 6–10pm UK time."></textarea></label><div class="reader-actions"><button type="submit" class="button primary" ${aiReady() ? '' : 'disabled'}>${icon('sparkle')}Extract availability</button><button type="button" class="text-button" data-action="reader-example">Use example message</button></div><div id="reader-model">${aiReady() ? '<p class="model-ready">Local model ready.</p>' : `<p class="field-help">Load the open-weight model once to use AI. A several-hundred-MB download and a WebGPU-capable browser are required; allow about 1.1 GB of GPU memory.</p><button type="button" class="button outline" data-action="load-ai">Download & load local AI</button>`}</div><p id="model-progress" role="status" aria-live="polite"></p></form><div id="extraction-result"></div><div class="dialog-section"><p class="subtle">Missing dates, end times, or time zones need clarification. AI suggestions never change your schedule automatically.</p><button class="text-button" data-action="availability" data-id="${esc(selected.id)}" id="manual-reader">Enter availability manually</button></div>`, true);
}
function showExtraction(result) {
  const target = document.querySelector('#extraction-result');
  target.innerHTML = `<section class="dialog-section"><h3>Review the interpretation</h3>${result.windows.map(w => `<div class="window-item"><span>${icon('clock')}<span>${esc(w.date)} · ${esc(w.startTime)}–${esc(w.endTime)}<small>${esc(w.timeZone)}</small></span></span></div>`).join('')}${result.questions.length ? `<div class="notice warning"><strong>Ask the player</strong><ul>${result.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}${result.windows.length ? `<p>Check these dates and times against the original message. You can edit availability after saving.</p><button class="button primary" data-action="accept-extraction">I’ve reviewed it — save availability</button>` : '<p>No complete windows were found. Clarify the message or enter availability manually.</p>'}</section>`;
}
function showAISettings() {
  openDialog(`${dialogHeader('Private AI reader', 'Open-weight Qwen2.5, running on your device.')}<div class="privacy-note">${icon('sparkle')}Player messages are processed locally in your browser.</div><p>The first load downloads the WebLLM runtime and Qwen2.5 0.5B model from public CDNs. Model files are cached by your browser for later use.</p><p>A current desktop Chrome or Edge with WebGPU and about 1.1 GB of available GPU memory is recommended. Smaller models can misunderstand messages: always review their output.</p><p>You can manage every tournament feature with manual availability even if AI is unavailable.</p><button class="button primary" data-action="load-ai" ${aiReady() ? 'disabled' : ''}>${aiReady() ? 'Local model ready' : 'Download & load local AI'}</button><p id="model-progress" role="status" aria-live="polite"></p>`);
}
function showSettings(isNew = false) {
  openDialog(`${dialogHeader(isNew ? 'Create your tournament' : 'Event settings', isNew ? 'Replace the sample with your own eight-player event.' : 'Settings apply to the entire tournament.')}<form id="settings-form" data-new="${isNew}"><label>Tournament name<input name="name" maxlength="80" required value="${isNew ? '' : esc(state.event.name)}" placeholder="Your community cup"></label><div class="form-row"><label>Event date<input type="date" name="date" required value="${state.event.date}"></label><label>Series format<select name="bestOf">${[1, 3, 5, 7].map(n => `<option value="${n}" ${n === state.event.bestOf ? 'selected' : ''}>Best of ${n}</option>`).join('')}</select></label></div><label>Organiser’s time zone<select name="zone">${zoneOptions(state.event.timeZone)}</select></label><label>Reserved minutes per series<input type="number" name="duration" min="15" max="480" step="1" required value="${state.event.duration}"></label><small class="field-help">Your scheduling estimate, including drafts and breaks. Games may run longer.</small><label>Map pool<input name="maps" maxlength="500" value="${esc(state.event.mapPool)}" placeholder="Enter your tournament’s maps"></label><label>Lobby & handbook notes<textarea name="notes" rows="3" maxlength="2000">${esc(state.event.lobbyNotes)}</textarea></label>${isNew ? '<div class="notice warning">Creating an event clears the sample’s availability, match times, and results. You’ll enter player names next.</div>' : '<p class="field-help">Changing the series format resets the bracket. Changing slot duration clears match times and confirmations. Existing availability keeps its original dates.</p>'}<button class="button primary" type="submit">${isNew ? 'Create event & enter players' : 'Save event settings'}</button></form>`);
}
function showSeedSettings() {
  openDialog(`${dialogHeader('Players & seeds', 'Enter the eight players in your approved seed order.')}<form id="seed-form"><div class="seed-editor-head"><span>Seed</span><span>Player name</span><span>1v1 Elo</span></div>${[...state.players].sort((a, b) => a.seed - b.seed).map(p => `<div class="seed-editor-row"><span class="seed">${p.seed}</span><label><span class="sr-only">Seed ${p.seed} player name</span><input name="name-${p.id}" required maxlength="80" value="${esc(p.name)}"></label><label><span class="sr-only">Seed ${p.seed} 1v1 Elo</span><input name="elo-${p.id}" type="number" min="0" max="5000" required value="${p.elo}"></label></div>`).join('')}<p class="field-help">Use 0 for unrated. Ratings are informational; seed order is your decision. Changing names or ratings keeps the current bracket.</p><button class="button primary" type="submit">Save players</button></form><section class="dialog-section"><h3>Reseed by rating</h3><p>Sort players by their entered 1v1 Elo, highest first. This resets every result, match time, and confirmation.</p><button class="button outline" data-action="reseed">Reseed & reset bracket</button></section>`, true);
}
function showBackup() {
  openDialog(`${dialogHeader('Backup & restore', 'Your tournament is stored in this browser, on this device.')}<p>Export a JSON backup to move your tournament to another browser or keep a copy. This prototype does not sync between organisers or collect player confirmations online.</p><button class="button primary" data-action="export">${icon('download')}Export tournament backup</button><section class="dialog-section"><h3>Restore a backup</h3><p>Importing replaces the current tournament. Export it first if you want to keep it.</p><label class="file-label">Choose a Town Centre JSON backup<input id="import-file" type="file" accept=".json,application/json"></label></section><section class="dialog-section"><h3>Explore again</h3><p>Replace the current tournament with the eight-player sample.</p><button class="button outline" data-action="reset-demo">Reload sample tournament</button></section>`);
}
function confirmAction(title, text, action) {
  openDialog(`${dialogHeader(title)}<p>${esc(text)}</p><div class="dialog-actions"><button class="button outline" data-action="close-dialog">Cancel</button><button class="button danger" data-action="${action}">Confirm ${esc(title.toLowerCase())}</button></div>`);
}
async function startModel() {
  if (aiBusy || aiReady()) return;
  aiBusy = true;
  const buttons = [...dialog.querySelectorAll('[data-action="load-ai"]')];
  buttons.forEach(b => { b.disabled = true; });
  const progress = message => { modelProgress = message; const el = document.querySelector('#model-progress'); if (el) el.textContent = message; };
  try {
    progress('Checking this device and loading the model. The first download can take a few minutes…');
    await loadAI(progress);
    progress('Local model ready. Player messages can now be read on this device.');
    buttons.forEach(b => { b.textContent = 'Local model ready'; });
    const submit = document.querySelector('#reader-form button[type="submit"]');
    if (submit) submit.disabled = false;
    render(); toast('Local AI model loaded.');
  } catch (error) { progress('Model could not load. Manual availability remains available.'); buttons.forEach(b => { b.disabled = false; }); errorInDialog(error); }
  finally { aiBusy = false; }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'navigate') { view = button.dataset.view; filter = 'all'; render(); }
    else if (action === 'filter') { filter = button.dataset.filter; render(); }
    else if (action === 'close-dialog') dialog.close();
    else if (action === 'open-match') showMatch(id);
    else if (action === 'availability') showAvailability(id);
    else if (action === 'read-message') showReader(id);
    else if (action === 'ai-settings') showAISettings();
    else if (action === 'load-ai') await startModel();
    else if (action === 'settings') showSettings();
    else if (action === 'new-event') showSettings(true);
    else if (action === 'seed-settings') showSeedSettings();
    else if (action === 'backup') showBackup();
    else if (action === 'use-time') {
      const form = document.querySelector('#schedule-form');
      const fields = localFields(button.dataset.time, state.event.timeZone);
      form.elements.date.value = fields.date; form.elements.time.value = fields.time; form.elements.zone.value = state.event.timeZone;
      dialog.querySelectorAll('.time-option').forEach(b => b.classList.toggle('selected', b === button));
    } else if (action === 'remove-window') {
      commit(() => { player(state, id).availability.splice(Number(button.dataset.index), 1); for (const m of state.matches) if (m.playerIds.includes(id) && !m.score) m.confirmations = [false, false]; }, 'Availability removed. Affected confirmations were cleared.'); showAvailability(id);
    } else if (action === 'copy-announcement') {
      const text = document.querySelector('#announcement-text');
      try { await navigator.clipboard.writeText(text.value); toast('Announcement copied. Paste it into your tournament channel.'); }
      catch { text.focus(); text.select(); toast('Select and copy the announcement with your keyboard.'); }
    } else if (action === 'reader-example') {
      const form = document.querySelector('#reader-form');
      form.elements.message.value = `I can play on ${state.event.date} from 18:00 to 22:00, ${form.elements.zone.value || 'time zone not yet confirmed'}.`;
    } else if (action === 'accept-extraction') {
      if (!extraction) return;
      commit(() => {
        const p = player(state, extraction.playerId);
        const seen = new Set(p.availability.map(w => `${w.start}/${w.end}`));
        for (const w of extraction.result.windows) if (!seen.has(`${w.start}/${w.end}`)) { p.availability.push({ start: w.start, end: w.end }); seen.add(`${w.start}/${w.end}`); }
      }, 'Reviewed availability saved.'); showAvailability(extraction.playerId);
    } else if (action === 'export') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'town-centre-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Tournament backup exported.');
    } else if (action === 'reset-bracket') confirmAction('Reset bracket', 'This clears all results, match times, confirmations, and draft links. Player details and availability are kept.', 'confirm-reset-bracket');
    else if (action === 'confirm-reset-bracket') { commit(() => { state.matches = buildBracket(state.players); }, 'Bracket reset.'); dialog.close(); }
    else if (action === 'reseed') confirmAction('Reseed bracket', 'This sorts players by their entered rating and clears all results, match times, confirmations, and draft links.', 'confirm-reseed');
    else if (action === 'confirm-reseed') { commit(() => { [...state.players].sort((a, b) => b.elo - a.elo || a.seed - b.seed).forEach((p, i) => { p.seed = i + 1; }); state.matches = buildBracket(state.players); }, 'Players reseeded and bracket reset.'); dialog.close(); }
    else if (action === 'reset-demo') confirmAction('Reload sample', 'This replaces the current tournament. Export a backup first if you need to keep it.', 'confirm-reset-demo');
    else if (action === 'confirm-reset-demo') { state = createDemo(); persist(); view = 'desk'; selectedMatch = null; render(); dialog.close(); toast('Sample tournament loaded.'); }
  } catch (error) { errorInDialog(error); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  event.preventDefault();
  const data = new FormData(form);
  const id = form.dataset.id;
  dialog.querySelector('.form-error')?.setAttribute('hidden', '');
  try {
    if (form.id === 'schedule-form') {
      const time = wallToUTC(data.get('date'), data.get('time'), data.get('zone'));
      commit(() => scheduleMatch(state, id, time), 'Match time proposed. Record each player’s confirmation next.'); showMatch(id);
    } else if (form.id === 'confirm-form') {
      commit(() => { const m = state.matches.find(m => m.id === id); if (matchStatus(state, m).key === 'conflict') throw new Error('Resolve the schedule conflict before confirming.'); m.confirmations = [data.has('p0'), data.has('p1')]; }, 'Confirmations saved.'); showMatch(id);
    } else if (form.id === 'draft-form') {
      const url = String(data.get('url')).trim();
      if (url && !/^https?:\/\//i.test(url)) throw new Error('Use a draft link beginning with https:// or http://.');
      commit(() => { state.matches.find(m => m.id === id).draftUrl = url; }, 'Draft link saved.'); showMatch(id);
    } else if (form.id === 'result-form') {
      commit(() => recordResult(state, id, Number(data.get('a')), Number(data.get('b'))), 'Result recorded. Winner advanced.'); showMatch(id);
    } else if (form.id === 'availability-form') {
      const w = makeWindow(data.get('date'), data.get('start'), data.get('end'), data.get('zone'));
      commit(() => { const p = player(state, id); if (p.availability.some(old => old.start === w.start && old.end === w.end)) throw new Error('This availability window is already saved.'); p.availability.push(w); p.timeZone = data.get('zone'); }, 'Availability window added.'); showAvailability(id);
    } else if (form.id === 'settings-form') {
      const isNew = form.dataset.new === 'true';
      const name = String(data.get('name')).trim();
      if (!name || !validDate(data.get('date')) || !validZone(data.get('zone'))) throw new Error('Enter a tournament name, valid date, and time zone.');
      commit(() => {
        const reset = Number(data.get('bestOf')) !== state.event.bestOf;
        const durationChanged = Number(data.get('duration')) !== state.event.duration;
        state.event = { name, date: data.get('date'), timeZone: data.get('zone'), bestOf: Number(data.get('bestOf')), duration: Number(data.get('duration')), mapPool: String(data.get('maps')).trim(), lobbyNotes: String(data.get('notes')).trim() };
        if (isNew) { state.isDemo = false; state.players.forEach(p => { p.name = `Player ${p.seed}`; p.elo = 0; p.availability = []; p.timeZone = state.event.timeZone; }); }
        if (reset || isNew) state.matches = buildBracket(state.players);
        else if (durationChanged) for (const m of state.matches) if (!m.score) { m.scheduledAt = null; m.confirmations = [false, false]; }
      }, isNew ? 'Tournament created. Enter your players.' : 'Event settings saved.');
      if (isNew) { selectedMatch = null; showSeedSettings(); } else dialog.close();
    } else if (form.id === 'seed-form') {
      commit(() => { for (const p of state.players) { p.name = String(data.get(`name-${p.id}`)).trim(); p.elo = Number(data.get(`elo-${p.id}`)); } if (new Set(state.players.map(p => p.name.toLowerCase())).size !== 8) throw new Error('Use a distinct name for each player.'); }, 'Player details saved.'); dialog.close();
    } else if (form.id === 'reader-form') {
      if (aiBusy) return;
      if (!validDate(data.get('referenceDate'))) throw new Error('Enter a valid reference date.');
      extraction = null; document.querySelector('#extraction-result').innerHTML = '';
      aiBusy = true; const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Reading availability…';
      try {
        const result = await extractAvailability(String(data.get('message')), data.get('referenceDate'), data.get('zone'));
        if (!form.isConnected) return;
        const current = new FormData(form);
        if (['playerId', 'message', 'referenceDate', 'zone'].some(key => current.get(key) !== data.get(key))) throw new Error('The message or player changed while reading. Extract it again before saving.');
        // An unknown zone is never silently accepted, even if the model invents one.
        if (!data.get('zone') && result.windows.length) { result.windows = []; result.questions.push('Confirm the player’s IANA time zone before saving availability.'); }
        extraction = { playerId: data.get('playerId'), result };
        showExtraction(result);
      } finally { aiBusy = false; submit.disabled = false; submit.textContent = 'Extract availability'; }
    }
  } catch (error) { errorInDialog(error); }
});
document.addEventListener('change', async event => {
  if (event.target.matches('#reader-form [name="playerId"]')) {
    const p = player(state, event.target.value);
    document.querySelector('#reader-form [name="zone"]').value = p.timeZone;
    document.querySelector('#manual-reader').dataset.id = p.id;
  }
  if (event.target.closest('#reader-form') && extraction) { extraction = null; document.querySelector('#extraction-result').innerHTML = ''; }
  if (event.target.id !== 'import-file') return;
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 500000) throw new Error('That backup is too large. Choose a Town Centre JSON file under 500 KB.');
    const imported = validateState(JSON.parse(await file.text()));
    state = imported; persist(); selectedMatch = null; view = 'desk'; filter = 'all'; render(); dialog.close(); toast('Tournament backup restored.');
  } catch (error) { errorInDialog(error); }
});
document.addEventListener('input', event => {
  if (event.target.closest('#reader-form') && extraction) { extraction = null; document.querySelector('#extraction-result').innerHTML = ''; }
});
dialog.addEventListener('click', event => { if (event.target === dialog && !event.target.closest('.dialog-head')) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (['desk', 'players', 'bracket'].includes(next)) { view = next; render(); } });
render();
