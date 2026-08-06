(function () {
  if ((location.pathname.replace(/\/$/, '') || '/') !== '/capability-search') {
    // Remove any leftover capability search content from other pages
    var leftover = document.querySelector('.cap-page');
    if (leftover) leftover.remove();
    document.body.classList.remove('cap-search-active');
    return;
  }
  document.body.classList.add('cap-search-active');

  const apiBase = String(window.AVIASAFE_API_BASE || '').replace(/\/$/, '');
  const escapeHtml = value => {
    const node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  };
  const request = async params => {
    const response = await fetch(apiBase + '/api/v1/capabilities?' + params.toString());
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Search API unavailable');
    return data;
  };

  function pageMarkup() {
    return `<main class="cap-page">
      <section class="cap-hero">
        <div class="cap-wrap">
          <span class="cap-kicker">DGCA APPROVED MRO SUPPORT</span>
          <h1>Capability Search</h1>
          <p>Search AviaSafe's aircraft safety equipment capabilities by part number, manufacturer, description, aircraft or chapter.</p>
        </div>
      </section>
      <section class="cap-content">
        <div class="cap-wrap">
          <div class="cap-search-card">
            <div class="cap-card-heading">
              <div><span>FIND A CAPABILITY</span><h2>What can we support?</h2></div>
              <p>Use one or more fields. Matching capabilities will appear below.</p>
            </div>
            <form id="cap-page-form">
              <label class="cap-field cap-field-wide"><span>Search</span><input name="q" type="search" placeholder="Part #, manufacturer or description"></label>
              <label class="cap-field"><span>Aircraft</span><select name="aircraft"><option value="">All aircraft</option></select></label>
              <label class="cap-field"><span>Chapter</span><select name="chapter"><option value="">All chapters</option></select></label>
              <div class="cap-actions"><button type="submit">Search capabilities <b>→</b></button><button type="reset">Reset</button></div>
            </form>
          </div>
          <div class="cap-results-head"><div><span>SEARCH RESULTS</span><h2 id="cap-result-title">Available capabilities</h2></div><strong id="cap-result-count">Loading…</strong></div>
          <div id="cap-results" class="cap-results" aria-live="polite"><div class="cap-loading">Loading capabilities…</div></div>
        </div>
      </section>
    </main>`;
  }

  function renderResults(data) {
    const results = data.results || [];
    document.querySelector('#cap-result-count').textContent = `${results.length} ${results.length === 1 ? 'result' : 'results'}`;
    const container = document.querySelector('#cap-results');
    if (!results.length) {
      container.innerHTML = `<div class="cap-empty"><span>⌕</span><h3>No matching capability found</h3><p>Try a different part number, aircraft or chapter, or contact our MRO team.</p><a href="/contact">Contact our team</a></div>`;
      return;
    }
    container.innerHTML = results.map(item => `<article class="cap-result">
      <div class="cap-result-top"><span>${escapeHtml(item.chapter)}</span><small>${escapeHtml(item.aircraft)}</small></div>
      <h3>${escapeHtml(item.description)}</h3>
      <dl><div><dt>Part Number</dt><dd>${escapeHtml(item.partNumber)}</dd></div><div><dt>Manufacturer</dt><dd>${escapeHtml(item.manufacturer)}</dd></div></dl>
      <a href="${item.serviceSlug ? '/service/' + encodeURIComponent(item.serviceSlug) : '/contact'}">View service details <b>→</b></a>
    </article>`).join('');
  }

  async function search(form) {
    const params = new URLSearchParams(new FormData(form));
    document.querySelector('#cap-results').innerHTML = '<div class="cap-loading">Searching database…</div>';
    document.querySelector('#cap-result-count').textContent = 'Searching…';
    try { renderResults(await request(params)); }
    catch (error) {
      document.querySelector('#cap-result-count').textContent = 'API error';
      document.querySelector('#cap-results').innerHTML = `<div class="cap-empty"><h3>Search is temporarily unavailable</h3><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  async function init() {
    const oldMain = document.querySelector('main');
    if (!oldMain) return setTimeout(init, 100);
    oldMain.outerHTML = pageMarkup();
    const form = document.querySelector('#cap-page-form');
    try {
      const data = await request(new URLSearchParams());
      const aircraft = form.elements.aircraft;
      const chapter = form.elements.chapter;
      (data.filters?.aircraft || []).forEach(value => aircraft.add(new Option(value, value)));
      (data.filters?.chapters || []).forEach(value => chapter.add(new Option(value, value)));
      renderResults(data);
    } catch (error) {
      document.querySelector('#cap-results').innerHTML = `<div class="cap-empty"><h3>Search API unavailable</h3><p>${escapeHtml(error.message)}</p></div>`;
      document.querySelector('#cap-result-count').textContent = 'API error';
    }
    form.addEventListener('submit', event => { event.preventDefault(); search(form); });
    form.addEventListener('reset', () => setTimeout(() => search(form), 0));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
