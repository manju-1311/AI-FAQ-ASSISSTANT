import { aiApi, authApi, faqApi, getToken, setToken } from './api.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { user: null, faqs: [], filtered: [], category: 'All', query: '', draft: null, chart: null, editor: null, authMode: 'login' };
const categories = ['Technology', 'Education', 'Health', 'Banking', 'General'];
const commonQuestions = [
  'How do I reset my password?',
  'What is two-factor authentication?',
  'How can I update my account information?',
  'What is the difference between a login and a profile?',
  'How do I save a frequently asked question?',
  'Where can I find technology help?',
  'What should I do if I cannot access my account?',
  'How do I report a problem or request support?',
  'What are the common security best practices?',
  'How do I manage my FAQ content?' 
];

const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const textFromHtml = (value = '') => { const node = document.createElement('div'); node.innerHTML = value; return node.textContent || ''; };
const highlight = (value, query) => { const safe = escapeHtml(value); if (!query) return safe; const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return safe.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>'); };
const showToast = (message, type = 'success') => { const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = `<span>${type === 'success' ? '✓' : '!'}</span>${escapeHtml(message)}`; $('#toast-region').append(toast); setTimeout(() => toast.remove(), 3800); };

function getSuggestedQuestions(query = '') {
  const text = query.trim().toLowerCase();
  const source = [...new Set([...state.faqs.map((faq) => faq.question), ...commonQuestions].filter(Boolean))];
  if (!text) return source.slice(0, 6);
  return source.filter((question) => question.toLowerCase().includes(text)).slice(0, 6);
}

function renderSuggestionList(container, query, source = []) {
  if (!container) return;
  const normalized = query.trim();
  if (!source.length) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  container.dataset.query = normalized;
  container.innerHTML = source.map((question) => `<button type="button" class="suggestion-item" data-suggestion="${escapeHtml(question)}">${highlight(question, normalized)}</button>`).join('');
  container.hidden = false;
}

function updateSearchSuggestions(value = $('#search-input')?.value || '') {
  const container = $('#search-suggestions');
  const suggestions = getSuggestedQuestions(value);
  renderSuggestionList(container, value, suggestions);
}

function updateQuestionSuggestions(value = $('#faq-question')?.value || '') {
  const container = $('#faq-question-suggestions');
  const suggestions = getSuggestedQuestions(value);
  renderSuggestionList(container, value, suggestions);
}

function setView(view) { const protectedView = view === 'dashboard' || view === 'studio'; const safeView = protectedView && !state.user ? 'search' : view; $$('.view').forEach((element) => element.classList.toggle('active', element.id === `view-${safeView}`)); $$('.nav-link[data-view]').forEach((element) => element.classList.toggle('active', element.dataset.view === safeView)); $('#breadcrumb-title').textContent = safeView === 'search' ? 'Explore FAQs' : safeView === 'dashboard' ? 'My dashboard' : 'AI studio'; $('#sidebar').classList.remove('open'); if (safeView !== view) { window.location.hash = 'search'; setAuthMode('login'); openModal('auth-modal'); } }
function renderFaqs() { const grid = $('#faq-grid'); const empty = $('#faq-empty'); if (!state.filtered.length) { grid.innerHTML = ''; empty.hidden = false; $('#result-count').textContent = '0 answers'; return; } empty.hidden = true; $('#result-count').textContent = `${state.filtered.length} answer${state.filtered.length === 1 ? '' : 's'}`; grid.innerHTML = state.filtered.map((faq, index) => `<article class="faq-card" style="--delay:${index * 40}ms"><div class="faq-card-top"><span class="topic-tag topic-${faq.category.toLowerCase()}">${escapeHtml(faq.category)}</span><span class="faq-number">${String(index + 1).padStart(2, '0')}</span></div><h3>${highlight(faq.question, state.query)}</h3><div class="faq-answer">${faq.answer}</div><div class="faq-card-footer"><span>By ${escapeHtml(faq.createdBy?.name || 'Askly contributor')}</span><button class="text-button" data-read-id="${faq._id}">Read answer <span>↗</span></button></div></article>`).join(''); }
function applyFilters() { const query = state.query.toLowerCase(); state.filtered = state.faqs.filter((faq) => (state.category === 'All' || faq.category === state.category) && (!query || `${faq.question} ${textFromHtml(faq.answer)} ${faq.category}`.toLowerCase().includes(query))); renderFaqs(); }
async function loadFaqs() { $('#result-count').textContent = 'Connecting...'; try { const payload = await faqApi.list(); state.faqs = payload.data || []; applyFilters(); renderDashboard(); } catch (error) { $('#result-count').textContent = 'Unavailable'; $('#faq-grid').innerHTML = `<div class="error-card"><strong>Could not load the FAQ library</strong><p>${escapeHtml(error.message)}</p><button class="text-button" id="retry-faqs">Try again ↗</button></div>`; $('#retry-faqs').onclick = loadFaqs; } }
function renderDashboard() { const owned = state.user ? state.faqs.filter((faq) => String(faq.createdBy?._id || faq.createdBy) === String(state.user._id)) : []; $('#metric-total').textContent = state.faqs.length; $('#metric-owned').textContent = owned.length; $('#owned-count').textContent = `${owned.length} item${owned.length === 1 ? '' : 's'}`; const totals = categories.map((category) => ({ category, count: state.faqs.filter((faq) => faq.category === category).length })); const top = totals.reduce((best, item) => item.count > best.count ? item : best, { category: '—', count: 0 }); $('#metric-topic').textContent = top.count ? top.category : '—'; $('#metric-topic-count').textContent = top.count ? `${top.count} published answer${top.count === 1 ? '' : 's'}` : 'Build your library'; $('#owned-list').innerHTML = owned.length ? owned.map((faq) => `<article class="owned-item"><div><span class="topic-tag topic-${faq.category.toLowerCase()}">${faq.category}</span><h4>${escapeHtml(faq.question)}</h4><small>Updated ${new Date(faq.updatedAt || faq.createdAt).toLocaleDateString()}</small></div><div class="item-actions"><button class="icon-button" data-edit-id="${faq._id}" title="Edit FAQ">✎</button><button class="icon-button danger" data-delete-id="${faq._id}" title="Delete FAQ">×</button></div></article>`).join('') : '<div class="list-empty"><span>＋</span><p>Your authored FAQs will show up here.</p><button class="text-button" id="empty-new-faq">Create your first one ↗</button></div>'; const legend = $('#chart-legend'); legend.innerHTML = totals.map((item, index) => `<span><i class="legend-dot dot-${index}"></i>${item.category}<strong>${item.count}</strong></span>`).join(''); if (window.Chart) { if (state.chart) state.chart.destroy(); state.chart = new Chart($('#category-chart'), { type: 'doughnut', data: { labels: totals.map((item) => item.category), datasets: [{ data: totals.map((item) => item.count), backgroundColor: ['#5e9e78', '#ef9a70', '#7e9ac2', '#d3af62', '#a5aca6'], borderWidth: 0, hoverOffset: 5 }] }, options: { cutout: '73%', plugins: { legend: { display: false }, tooltip: { padding: 12, backgroundColor: '#1c2923', displayColors: false } } } }); } }
function updateAuthUI() {
  const authenticated = Boolean(state.user);
  $$('.auth-only').forEach((element) => { element.hidden = !authenticated; });
  $('#user-card').hidden = !authenticated;
  $('#auth-button').hidden = authenticated;
  $('#auth-button').innerHTML = 'Sign in <span>↗</span>';

  if (authenticated) {
    $('#user-name').textContent = state.user.name;
    $('#user-email').textContent = state.user.email;
    $('#user-avatar').textContent = state.user.name.charAt(0).toUpperCase();
  } else {
    $('#user-name').textContent = 'Guest';
    $('#user-email').textContent = 'Not signed in';
    $('#user-avatar').textContent = 'A';
  }

  renderDashboard();
}
function openModal(id) { $(`#${id}`).hidden = false; document.body.classList.add('modal-open'); }
function closeModal(id) { $(`#${id}`).hidden = true; if (!$$('.modal-backdrop:not([hidden])').length) document.body.classList.remove('modal-open'); }
function setSidebarOpen(open) { $('#sidebar').classList.toggle('open', open); $('#sidebar-overlay').classList.toggle('visible', open); $('#menu-button').setAttribute('aria-expanded', String(open)); $('#menu-button').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); }
function setAuthMode(mode) { state.authMode = mode; const register = mode === 'register'; $('#name-field').hidden = !register; $('#auth-name').required = register; $('#auth-password').autocomplete = register ? 'new-password' : 'current-password'; $('#auth-title').textContent = register ? 'Create your account' : 'Welcome back'; $('#auth-subtitle').textContent = register ? 'Make your knowledge useful to more people.' : 'Your knowledge workspace is waiting.'; $('#auth-submit').innerHTML = `${register ? 'Create account' : 'Sign in'} <span>↗</span>`; $$('.modal-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.authMode === mode)); }
function openEditor(faq = null) { if (!state.editor) { state.editor = new Quill('#answer-editor', { theme: 'snow', placeholder: 'Write a clear, helpful answer...', modules: { toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link']] } }); } $('#faq-id').value = faq?._id || ''; $('#faq-question').value = faq?.question || ''; $('#faq-category').value = faq?.category || 'General'; state.editor.root.innerHTML = faq?.answer || ''; $('#faq-modal-title').textContent = faq ? 'Edit FAQ' : 'Create a new FAQ'; openModal('faq-modal'); }
function openFaqReader(faq) { $('#reader-category').textContent = faq.category; $('#reader-title').textContent = faq.question; $('#reader-answer').innerHTML = faq.answer; $('#reader-author').textContent = `By ${faq.createdBy?.name || 'Askly contributor'}`; openModal('reader-modal'); }
async function handleAuth(event) { event.preventDefault(); const button = $('#auth-submit'); const data = { email: $('#auth-email').value.trim(), password: $('#auth-password').value }; if (state.authMode === 'register') Object.assign(data, { name: $('#auth-name').value.trim() }); button.disabled = true; $('#auth-error').hidden = true; try { const payload = state.authMode === 'login' ? await authApi.login(data) : await authApi.register(data); state.user = payload.data; setToken(payload.data.token); closeModal('auth-modal'); updateAuthUI(); showToast(state.authMode === 'login' ? 'Welcome back.' : 'Your account is ready.'); } catch (error) { $('#auth-error').textContent = error.message; $('#auth-error').hidden = false; } finally { button.disabled = false; } }
async function handleFaqSave(event) { event.preventDefault(); const question = $('#faq-question').value.trim(); const answer = state.editor.root.innerHTML.trim(); const category = $('#faq-category').value; if (!textFromHtml(answer).trim()) { $('#faq-error').textContent = 'Please add an answer.'; $('#faq-error').hidden = false; return; } const id = $('#faq-id').value; try { if (id) await faqApi.update(id, { question, answer, category }); else await faqApi.create({ question, answer, category }); closeModal('faq-modal'); showToast(id ? 'FAQ updated.' : 'FAQ published.'); await loadFaqs(); } catch (error) { $('#faq-error').textContent = error.message; $('#faq-error').hidden = false; } }
async function generateFaq(event) { event.preventDefault(); const topic = $('#topic-input').value.trim(); if (!topic) return; const button = $('#generate-form button'); button.disabled = true; $('#draft-status').textContent = 'Thinking...'; $('#draft-content').innerHTML = '<div class="draft-skeleton"><i></i><i></i><i></i></div>'; $('#draft-actions').hidden = true; try { const payload = await aiApi.generateFaq(topic); state.draft = payload; $('#draft-status').textContent = 'Draft ready'; $('#draft-content').innerHTML = `<div class="generated-copy"><span class="section-kicker">Suggested question</span><h3>${escapeHtml(payload.question)}</h3><span class="section-kicker">Suggested answer</span><div>${escapeHtml(payload.answer).replaceAll('\n', '<br />')}</div></div>`; $('#draft-actions').hidden = false; } catch (error) { $('#draft-content').innerHTML = `<div class="draft-placeholder error-copy"><span>!</span><p>${escapeHtml(error.message)}</p></div>`; $('#draft-status').textContent = 'Could not generate'; } finally { button.disabled = false; } }
document.addEventListener('click', async (event) => {
  const suggestion = event.target.closest('[data-suggestion]');
  if (suggestion) {
    const value = suggestion.dataset.suggestion;
    const searchInput = $('#search-input');
    const questionInput = $('#faq-question');
    if (document.activeElement === questionInput && !questionInput.hidden) {
      questionInput.value = value;
      updateQuestionSuggestions(value);
      return;
    }
    if (searchInput) {
      searchInput.value = value;
      state.query = value;
      updateSearchSuggestions(value);
      applyFilters();
    }
    return;
  }

  const viewLink = event.target.closest('[data-view]');
  if (viewLink) { event.preventDefault(); window.location.hash = viewLink.dataset.view; setView(viewLink.dataset.view); }
  const category = event.target.closest('[data-category]');
  if (category) { state.category = category.dataset.category; $$('.category-chip').forEach((chip) => chip.classList.toggle('active', chip === category)); applyFilters(); }
  const read = event.target.closest('[data-read-id]');
  if (read) { const faq = state.faqs.find((item) => item._id === read.dataset.readId); if (faq) openFaqReader(faq); }
  const edit = event.target.closest('[data-edit-id]');
  if (edit) openEditor(state.faqs.find((faq) => faq._id === edit.dataset.editId));
  const remove = event.target.closest('[data-delete-id]');
  if (remove && confirm('Delete this FAQ permanently?')) { try { await faqApi.remove(remove.dataset.deleteId); showToast('FAQ deleted.'); await loadFaqs(); } catch (error) { showToast(error.message, 'error'); } }
  const close = event.target.closest('[data-close-modal]');
  if (close) closeModal(close.dataset.closeModal);
  if (!event.target.closest('.suggestion-item') && !event.target.closest('.suggestion-list')) {
    $('#search-suggestions').hidden = true;
    $('#faq-question-suggestions').hidden = true;
  }
});
$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); state.query = $('#search-input').value.trim(); applyFilters(); $('#search-suggestions').hidden = true; });
$('#search-input').addEventListener('input', (event) => {
  const value = event.target.value;
  state.query = value.trim();
  updateSearchSuggestions(value);
  applyFilters();
});
$('#faq-question').addEventListener('input', (event) => {
  updateQuestionSuggestions(event.target.value);
}); $('#auth-button').onclick = () => state.user ? setView('dashboard') : (setAuthMode('login'), openModal('auth-modal')); $('#auth-form').addEventListener('submit', handleAuth); $('#faq-form').addEventListener('submit', handleFaqSave); $('#new-faq-button').onclick = () => openEditor(); $('#generate-form').addEventListener('submit', generateFaq); $('#discard-draft').onclick = () => { state.draft = null; $('#draft-actions').hidden = true; $('#draft-status').textContent = 'Waiting for a topic'; $('#draft-content').innerHTML = '<div class="draft-placeholder"><span>✧</span><p>Your generated question and answer will appear here.</p></div>'; }; $('#save-draft').onclick = () => openEditor({ question: state.draft.question, answer: `<p>${escapeHtml(state.draft.answer).replaceAll('\n', '<br />')}</p>`, category: 'General' }); $$('.modal-tab').forEach((tab) => { tab.onclick = () => setAuthMode(tab.dataset.authMode); }); $$('.suggested-topics button').forEach((button) => { button.onclick = () => { $('#topic-input').value = button.dataset.topic; $('#topic-input').focus(); }; }); $('#logout-button').onclick = () => { setToken(null); state.user = null; updateAuthUI(); setView('search'); showToast('You have been signed out.'); }; $('#menu-button').onclick = () => setSidebarOpen(!$('#sidebar').classList.contains('open')); $('#sidebar-close').onclick = () => setSidebarOpen(false); $('#sidebar-overlay').onclick = () => setSidebarOpen(false); $('#theme-toggle').onclick = () => { const dark = document.body.classList.toggle('dark'); localStorage.setItem('askly-theme', dark ? 'dark' : 'light'); $('#theme-label').textContent = dark ? 'Light mode' : 'Dark mode'; }; window.addEventListener('keydown', (event) => { if (event.key === 'Escape') setSidebarOpen(false); }); window.addEventListener('hashchange', () => setView(window.location.hash.slice(1) || 'search')); window.addEventListener('auth:expired', (event) => { const hadSession = Boolean(state.user || event.detail?.hadToken); state.user = null; updateAuthUI(); showToast(hadSession ? 'Your session expired. Please sign in again.' : 'Sign in to use this feature.', 'error'); });
if (localStorage.getItem('askly-theme') === 'dark') { document.body.classList.add('dark'); $('#theme-label').textContent = 'Light mode'; } updateAuthUI(); setView(window.location.hash.slice(1) || 'search'); updateSearchSuggestions(); updateQuestionSuggestions(); loadFaqs(); if (getToken()) authApi.profile().then((payload) => { state.user = payload.data; updateAuthUI(); }).catch(() => { setToken(null); state.user = null; updateAuthUI(); });
