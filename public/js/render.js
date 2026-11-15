export function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function imageOrFallback(url, name = '') {
  if (!url || !/^https:\/\//i.test(url)) return `<div class="device-fallback">${escapeHTML(name.slice(0, 1) || '◌')}</div>`;
  return `<img loading="lazy" src="${escapeHTML(url)}" alt="${escapeHTML(name)}" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
}

export function deviceCard(device) {
  const name = escapeHTML(device.name || 'Unknown device');
  const id = escapeHTML(device.id || '');
  return `<article class="device-card" data-device="${id}" tabindex="0" role="button" aria-label="View ${name}"><div class="device-card-image">${imageOrFallback(device.img || device.image, name)}</div><h3>${name}</h3><p>${escapeHTML(device.description || 'View specifications and details')}</p></article>`;
}

export function specGroups(device) {
  const groups = device.detailSpec || device.specifications || [];
  if (!Array.isArray(groups)) return '';
  return groups.map(group => {
    const rows = group.specifications || group.items || [];
    return `<section class="spec-group"><h3>${escapeHTML(group.category || group.name || 'Specifications')}</h3>${rows.map(row => `<div class="spec-row"><span>${escapeHTML(row.name || row.key || '')}</span><strong>${escapeHTML(row.value || row.val || '—')}</strong></div>`).join('')}</section>`;
  }).join('');
}
