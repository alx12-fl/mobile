import api from './api.js';
import { escapeHTML, deviceCard, specGroups, imageOrFallback } from './render.js';

const $ = selector => document.querySelector(selector);
const app = $('#app');
const toast = $('#toast');
const dialog = $('#device-dialog');
let toastTimer;
let lastSearch = '';
let brandsCache = [];
let topCache = [];
let selectedCompare = [];

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function setStatus(message, good = true) {
  const node = $('#api-status');
  node.textContent = message;
  node.style.color = good ? 'var(--muted)' : 'var(--orange)';
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.list)) return value.list;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function renderTop(data) {
  const groups = normalizeList(data);
  const devices = groups.flatMap(group => Array.isArray(group.list) ? group.list : [group]);
  topCache = devices.filter(item => item && item.id).slice(0, 9);
  $('#top-devices').innerHTML = topCache.slice(0, 3).map((item, index) => `
    <article class="trend-card" data-device="${escapeHTML(item.id)}" tabindex="0" role="button">
      <div class="trend-top"><span>0${index + 1} / TRENDING</span><span>${escapeHTML(item.position ? `#${item.position}` : 'POPULAR')}</span></div>
      <div class="trend-image">${imageOrFallback(item.img, item.name)}</div>
      <div><div class="trend-name">${escapeHTML(item.name)}</div><div class="trend-hits">${item.dailyHits ? `${Number(item.dailyHits).toLocaleString()} daily views` : 'Explore device'}</div></div>
    </article>`).join('') || '<div class="loading-card">No popular devices were returned.</div>';
}

function renderBrands(data) {
  brandsCache = normalizeList(data).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const featured = brandsCache.filter(item => /apple|samsung|google|xiaomi|oneplus|motorola|sony|nothing|huawei|oppo|vivo|realme|honor|asus|tecno|infinix/i.test(item.name)).slice(0, 18);
  const display = featured.length ? featured : brandsCache.slice(0, 18);
  $('#brand-list').innerHTML = display.map(brand => `<button class="brand-tile" data-brand="${escapeHTML(brand.id)}"><span class="brand-name">${escapeHTML(brand.name)}</span><span class="brand-count">${Number(brand.devices || 0).toLocaleString()} devices ↗</span></button>`).join('') || '<div class="loading-card">No brands were returned.</div>';
}

function renderDeals(data) {
  const deals = normalizeList(data);
  $('#deal-list').innerHTML = deals.slice(0, 6).map(item => `<a class="deal-card" href="${escapeHTML(item.url || '#')}" target="_blank" rel="noreferrer"><img loading="lazy" src="${escapeHTML(item.img || '')}" alt="${escapeHTML(item.name)}" onerror="this.style.visibility='hidden'"><div><div class="deal-name">${escapeHTML(item.name)}</div><div class="deal-description">${escapeHTML(item.deal?.memory || item.description || 'View listing')}</div><div class="deal-price">${item.deal?.currency || ''}${item.deal?.price ?? 'View deal'} ${item.deal?.discount ? `· ${item.deal.discount}% off` : ''}</div></div></a>`).join('') || '<div class="loading-card">No deals were returned.</div>';
}

async function loadHome() {
  const results = await Promise.allSettled([api.top(), api.brands(), api.deals(), api.health()]);
  if (results[0].status === 'fulfilled') renderTop(results[0].value);
  else $('#top-devices').innerHTML = `<div class="loading-card">${escapeHTML(results[0].reason.message)}</div>`;
  if (results[1].status === 'fulfilled') renderBrands(results[1].value);
  else $('#brand-list').innerHTML = `<div class="loading-card">${escapeHTML(results[1].reason.message)}</div>`;
  if (results[2].status === 'fulfilled') renderDeals(results[2].value);
  else $('#deal-list').innerHTML = `<div class="loading-card">${escapeHTML(results[2].reason.message)}</div>`;
  if (results[3].status === 'fulfilled') setStatus('INDEX ONLINE');
  else setStatus('API CONNECTION ISSUE', false);
}

async function runSearch(query) {
  const q = query.trim();
  if (q.length < 2) return notify('Enter at least two characters.');
  lastSearch = q;
  $('#quick-search-results').hidden = false;
  $('#search-title').textContent = `Results for “${q}”`;
  $('#search-results').innerHTML = '<div class="loading-card"><span class="spinner"></span>Searching the catalog…</div>';
  $('#quick-search-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const data = await api.search(q);
    const items = normalizeList(data);
    $('#search-results').innerHTML = items.map(deviceCard).join('') || '<div class="loading-card">No matching devices were returned.</div>';
  } catch (error) {
    $('#search-results').innerHTML = `<div class="loading-card">${escapeHTML(error.message)}</div>`;
  }
}

async function openDevice(id) {
  if (!id) return;
  $('#device-detail').innerHTML = '<div class="loading-card"><span class="spinner"></span>Loading specifications…</div>';
  dialog.showModal();
  try {
    const device = await api.device(id);
    const quick = (device.quickSpec || []).map(item => `<div class="spec-row"><span>${escapeHTML(item.name)}</span><strong>${escapeHTML(item.value)}</strong></div>`).join('');
    $('#device-detail').innerHTML = `
      <div class="detail-header"><img src="${escapeHTML(device.img || '')}" alt="${escapeHTML(device.name)}" onerror="this.style.visibility='hidden'"><div><span class="section-index">DEVICE SPECIFICATION</span><h2>${escapeHTML(device.name || 'Device')}</h2><p>Source: GSMArena · <a href="https://www.gsmarena.com/${escapeHTML(id)}.php" target="_blank" rel="noreferrer">Open source ↗</a></p><button class="compare-add" data-add-compare="${escapeHTML(id)}">Add to comparison +</button></div></div>
      ${quick ? `<section class="spec-group"><h3>At a glance</h3>${quick}</section>` : ''}
      ${specGroups(device) || '<p class="section-subtitle">No detailed specifications were returned.</p>'}`;
    api.enriched(device.name || id).then(extra => {
      const data = extra.data || extra;
      const target = $('#device-detail');
      if (!target || !dialog.open) return;
      const scores = data.dxomark || data.dxomarkScores || data.scores || null;
      const samples = data.cameraSamples || data.camera_samples || [];
      const scoreMarkup = scores ? `<section class="spec-group"><h3>Independent testing · DXOMARK</h3><pre class="data-pre">${escapeHTML(JSON.stringify(scores, null, 2))}</pre></section>` : '';
      const sampleMarkup = Array.isArray(samples) && samples.length ? `<section class="spec-group"><h3>Camera samples</h3><div class="sample-grid">${samples.flatMap(group => (group.images || []).map(sample => `<a href="${escapeHTML(sample.url)}" target="_blank" rel="noreferrer"><img loading="lazy" src="${escapeHTML(sample.url)}" alt="${escapeHTML(sample.caption || group.label || 'Camera sample')}"><span>${escapeHTML(sample.caption || group.label || 'Open sample')} ↗</span></a>`)).join('')}</div></section>` : '';
      if (scoreMarkup || sampleMarkup) target.insertAdjacentHTML('beforeend', `<div class="provider-note">ENRICHED BY SECONDARY MOBILE DATA SOURCE</div>${scoreMarkup}${sampleMarkup}`);
    }).catch(() => {});
  } catch (error) {
    $('#device-detail').innerHTML = `<div class="loading-card">${escapeHTML(error.message)}</div>`;
  }
}

function showView(name) {
  $('.desktop-nav').classList.remove('open');
  document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === name));
  if (name === 'discover') { $('#discover').scrollIntoView({ behavior: 'smooth' }); return; }
  if (name === 'brands') { showDirectoryView('brands'); return; }
  if (name === 'deals') { showDirectoryView('deals'); return; }
  if (name === 'top') { showDirectoryView('top'); return; }
  const existing = $('#dynamic-view');
  if (existing) existing.remove();
  const view = document.createElement('section');
  view.id = 'dynamic-view';
  view.className = 'mobile-view';
  if (name === 'compare') {
    view.innerHTML = `<span class="section-index">07 / SIDE BY SIDE</span><h1>Compare phones<span class="orange-dot">.</span></h1><p class="section-subtitle">Search for devices and add them to your comparison. Up to four devices.</p><div class="view-tools"><input id="compare-search" placeholder="Find a device to compare…"><button id="compare-search-button">Search</button></div><div id="compare-search-results" class="device-grid"></div><div id="compare-selected" class="compare-layout"></div><div id="compare-table"></div>`;
  } else if (name === 'glossary') {
    view.innerHTML = `<span class="section-index">08 / REFERENCE</span><h1>Glossary<span class="orange-dot">.</span></h1><p class="section-subtitle">Mobile technology, explained.</p><div id="glossary-list" class="brand-grid"><div class="loading-card"><span class="spinner"></span>Loading glossary…</div></div>`;
  }
  app.append(view);
  view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (name === 'compare') setupCompare(view);
  if (name === 'glossary') loadGlossary(view);
}

async function showDirectoryView(kind) {
  const existing = $('#dynamic-view');
  if (existing) existing.remove();
  const titles = { brands: ['THE MAKERS', 'Every brand'], deals: ['THE MARKET', 'Current deals'], top: ['RIGHT NOW', 'Most viewed'] };
  const [eyebrow, title] = titles[kind];
  const view = document.createElement('section');
  view.id = 'dynamic-view';
  view.className = 'mobile-view';
  view.innerHTML = `<span class="section-index">${eyebrow}</span><h1>${title}<span class="orange-dot">.</span></h1><div class="view-tools"><input id="directory-filter" placeholder="Filter ${kind === 'brands' ? 'brands' : 'results'}…"></div><div id="directory-results" class="${kind === 'brands' ? 'brand-grid' : kind === 'deals' ? 'deal-grid' : 'device-grid'}"><div class="loading-card"><span class="spinner"></span>Loading…</div></div>`;
  app.append(view);
  view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    let items;
    if (kind === 'brands') items = brandsCache.length ? brandsCache : normalizeList(await api.brands());
    else if (kind === 'deals') items = normalizeList(await api.deals());
    else {
      const raw = await api.top();
      items = normalizeList(raw).flatMap(group => Array.isArray(group.list) ? group.list : [group]);
    }
    const render = list => {
      const target = $('#directory-results');
      if (!target) return;
      if (kind === 'brands') target.innerHTML = list.map(brand => `<button class="brand-tile" data-brand="${escapeHTML(brand.id)}"><span class="brand-name">${escapeHTML(brand.name)}</span><span class="brand-count">${Number(brand.devices || 0).toLocaleString()} devices ↗</span></button>`).join('');
      else if (kind === 'deals') target.innerHTML = list.map(item => `<a class="deal-card" href="${escapeHTML(item.url || '#')}" target="_blank" rel="noreferrer"><img loading="lazy" src="${escapeHTML(item.img || '')}" alt="${escapeHTML(item.name)}" onerror="this.style.visibility='hidden'"><div><div class="deal-name">${escapeHTML(item.name)}</div><div class="deal-description">${escapeHTML(item.deal?.memory || item.description || 'View listing')}</div><div class="deal-price">${item.deal?.currency || ''}${item.deal?.price ?? 'View deal'}</div></div></a>`).join('');
      else target.innerHTML = list.map(deviceCard).join('');
      if (!list.length) target.innerHTML = '<div class="loading-card">No results.</div>';
    };
    render(items);
    $('#directory-filter').addEventListener('input', event => {
      const q = event.target.value.toLowerCase();
      render(items.filter(item => `${item.name || ''} ${item.description || ''}`.toLowerCase().includes(q)));
    });
  } catch (error) {
    $('#directory-results').innerHTML = `<div class="loading-card">${escapeHTML(error.message)}</div>`;
  }
}

async function showBrand(id) {
  const brand = brandsCache.find(item => item.id === id);
  const existing = $('#dynamic-view');
  if (existing) existing.remove();
  const view = document.createElement('section');
  view.id = 'dynamic-view';
  view.className = 'mobile-view';
  view.innerHTML = `<span class="section-index">BRAND DIRECTORY</span><h1>${escapeHTML(brand?.name || 'Brand')}<span class="orange-dot">.</span></h1><p class="section-subtitle">Browse the devices listed for this manufacturer.</p><div id="brand-devices" class="device-grid"><div class="loading-card"><span class="spinner"></span>Loading catalog…</div></div>`;
  app.append(view);
  view.scrollIntoView({ behavior: 'smooth' });
  try {
    const data = await api.brand(id);
    const items = normalizeList(data);
    $('#brand-devices').innerHTML = items.map(deviceCard).join('') || '<div class="loading-card">No devices were returned for this brand.</div>';
  } catch (error) { $('#brand-devices').innerHTML = `<div class="loading-card">${escapeHTML(error.message)}</div>`; }
}

async function loadGlossary(view) {
  try {
    const data = normalizeList(await api.glossary());
    $('#glossary-list').innerHTML = data.map(group => `<div class="brand-tile"><span class="brand-name">${escapeHTML(group.letter || '')}</span><span class="brand-count">${(group.list || []).length} terms</span></div>${(group.list || []).map(term => `<button class="brand-tile glossary-term" data-term="${escapeHTML(term.id)}"><span class="brand-name">${escapeHTML(term.name)}</span><span class="brand-count">Read definition ↗</span></button>`).join('')}`).join('') || '<div class="loading-card">No glossary terms were returned.</div>';
  } catch (error) { $('#glossary-list').innerHTML = `<div class="loading-card">${escapeHTML(error.message)}</div>`; }
}

function setupCompare(view) {
  const search = async () => {
    const q = $('#compare-search').value.trim();
    if (q.length < 2) return;
    $('#compare-search-results').innerHTML = '<div class="loading-card"><span class="spinner"></span>Searching…</div>';
    try { $('#compare-search-results').innerHTML = normalizeList(await api.search(q)).map(deviceCard).join('') || '<div class="loading-card">No devices found.</div>'; }
    catch (error) { $('#compare-search-results').innerHTML = `<div class="loading-card">${escapeHTML(error.message)}</div>`; }
  };
  $('#compare-search-button').addEventListener('click', search);
  $('#compare-search').addEventListener('keydown', event => { if (event.key === 'Enter') search(); });
  renderCompareSelection();
}

function renderCompareSelection() {
  const target = $('#compare-selected');
  if (!target) return;
  target.innerHTML = [0,1,2,3].map((index) => `<div class="compare-slot"><span class="section-index">DEVICE 0${index + 1}</span><p>${selectedCompare[index] ? escapeHTML(selectedCompare[index].name) : 'No device selected'}</p>${selectedCompare[index] ? `<button class="text-button" data-remove-compare="${index}">Remove ×</button>` : '<span class="section-subtitle">Search above and add a phone.</span>'}</div>`).join('');
  const table = $('#compare-table');
  if (table) table.innerHTML = selectedCompare.length >= 2 ? `<button class="compare-add" id="run-comparison">Compare selected devices ↗</button>` : '';
}

async function runComparison() {
  try {
    const result = await api.compare(selectedCompare.map(item => item.id));
    const devices = result.filter(item => item.ok).map(item => item.data);
    const rows = new Map();
    for (const device of devices) for (const group of device.detailSpec || []) for (const spec of group.specifications || []) rows.set(`${group.category} · ${spec.name}`, rows.get(`${group.category} · ${spec.name}`) || []);
    for (const [key, values] of rows) {
      const [category, name] = key.split(' · ');
      values.push(category, name);
      for (const device of devices) {
        const group = (device.detailSpec || []).find(item => item.category === category);
        const item = (group?.specifications || []).find(spec => spec.name === name);
        values.push(item?.value || '—');
      }
    }
    $('#compare-table').innerHTML = `<table class="compare-table"><thead><tr><th>Specification</th>${devices.map(device => `<th>${escapeHTML(device.name)}</th>`).join('')}</tr></thead><tbody>${[...rows].map(([key, values]) => `<tr><td>${escapeHTML(key)}</td>${values.slice(2).map(value => `<td>${escapeHTML(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } catch (error) { notify(error.message); }
}

$('#search-form').addEventListener('submit', event => { event.preventDefault(); runSearch($('#search-input').value); });
$('#search-input').addEventListener('keydown', event => { if (event.key === 'Escape') { $('#search-input').value = ''; $('#quick-search-results').hidden = true; } });
$('#clear-search').addEventListener('click', () => { $('#quick-search-results').hidden = true; $('#search-input').value = ''; });
$('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#theme-toggle').addEventListener('click', () => { document.body.classList.toggle('dark'); localStorage.setItem('alx-mobile-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); });
if (localStorage.getItem('alx-mobile-theme') === 'dark') document.body.classList.add('dark');
$('#menu-toggle').addEventListener('click', () => $('.desktop-nav').classList.toggle('open'));

document.addEventListener('click', event => {
  const device = event.target.closest('[data-device]');
  if (device) openDevice(device.dataset.device);
  const brand = event.target.closest('[data-brand]');
  if (brand) showBrand(brand.dataset.brand);
  const nav = event.target.closest('[data-view]');
  if (nav) { event.preventDefault(); showView(nav.dataset.view); }
  const add = event.target.closest('[data-add-compare]');
  if (add) {
    const id = add.dataset.addCompare;
    if (selectedCompare.some(item => item.id === id)) return notify('That device is already selected.');
    if (selectedCompare.length >= 4) return notify('The comparison supports up to four devices.');
    selectedCompare.push({ id, name: $('#device-detail h2')?.textContent || id });
    dialog.close();
    showView('compare');
    renderCompareSelection();
    notify('Added to comparison.');
  }
  const remove = event.target.closest('[data-remove-compare]');
  if (remove) { selectedCompare.splice(Number(remove.dataset.removeCompare), 1); renderCompareSelection(); }
  if (event.target.closest('#run-comparison')) runComparison();
  const term = event.target.closest('[data-term]');
  if (term) api.term(term.dataset.term).then(data => { const title = escapeHTML(data.title || 'Glossary entry'); const template = document.createElement('template'); template.innerHTML = data.html || ''; const definition = escapeHTML(template.content.textContent || 'No definition was returned.'); $('#device-detail').innerHTML = `<div class="section-index">GLOSSARY / REFERENCE</div><h2 style="font-size:34px;margin:16px 0">${title}</h2><p style="line-height:1.8;color:var(--muted)">${definition}</p><p class="section-subtitle">Source: GSMArena</p>`; dialog.showModal(); }).catch(error => notify(error.message));
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search-input').focus(); }
  if (event.key === 'Enter' && event.target.matches('[data-device]')) openDevice(event.target.dataset.device);
});

loadHome();
