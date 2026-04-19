function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function capabilityBlock(c) {
  return `
    <article class="cap">
      <div class="cap-left">
        <div class="cap-name">${esc(c.name)}</div>
        <div class="cap-kind">capability</div>
      </div>
      <div class="cap-right">
        <p class="cap-desc">${esc(c.description || 'No description published.')}</p>
        <details class="schema" open>
          <summary>input schema · JSON-Schema</summary>
          <pre>${esc(JSON.stringify(c.input_schema, null, 2))}</pre>
        </details>
        <details class="schema">
          <summary>output schema · JSON-Schema</summary>
          <pre>${esc(JSON.stringify(c.output_schema, null, 2))}</pre>
        </details>
      </div>
    </article>
  `;
}

export function renderLanding(manifest, { registryUrl = 'http://localhost:4000' } = {}) {
  const caps = (manifest.capabilities || []).map(capabilityBlock).join('');
  const price =
    manifest.pricing && manifest.pricing.per_call
      ? `${manifest.pricing.per_call} ${manifest.pricing.currency}`
      : 'free · per call';

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>${esc(manifest.name)} · Web 4 agent service</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,0..100;1,9..144,300..900,0..100&family=JetBrains+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --paper: #f2ece0;
      --paper-2: #ebe3d2;
      --ink: #0b0b0b;
      --ink-2: #1a1a1a;
      --accent: #c9301d;
      --deep: #1f3a42;
      --mute: #6a655c;
      --rule: rgba(11, 11, 11, 0.16);
      --rule-strong: rgba(11, 11, 11, 0.5);
      --serif: 'Fraunces', 'Times New Roman', serif;
      --mono: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--paper); color: var(--ink);
      font-family: var(--mono); font-size: 14px; line-height: 1.55;
      min-height: 100vh; position: relative; overflow-x: hidden;
    }
    body::before {
      content: ''; position: fixed; inset: 0;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.04 0 0 0 0 0.04 0 0 0 0 0.04 0 0 0 0.13 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
      background-size: 180px 180px; opacity: .6;
      pointer-events: none; z-index: 1; mix-blend-mode: multiply;
    }
    nav, header, section, footer, main { position: relative; z-index: 2; }

    nav.bar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 40px; border-bottom: 1px solid var(--rule-strong);
      font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
    }
    nav.bar a {
      color: var(--ink); text-decoration: none;
      border-bottom: 1px solid transparent; transition: border-color .2s;
    }
    nav.bar a:hover { border-bottom-color: var(--accent); }
    nav.bar .mark {
      color: var(--accent); font-family: var(--serif); font-size: 18px;
      margin-right: 10px; vertical-align: -2px; display: inline-block;
      transform: rotate(-8deg);
    }
    nav.bar .right { color: var(--mute); display: flex; gap: 20px; }

    header.cover {
      padding: 80px 40px 50px;
      border-bottom: 1px solid var(--rule-strong);
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 60px; align-items: end;
    }
    .cover-kicker {
      font-family: var(--mono); font-size: 11px;
      letter-spacing: .24em; text-transform: uppercase;
      color: var(--accent); margin: 0 0 20px 0;
      display: flex; align-items: center; gap: 14px;
    }
    .cover-kicker::before {
      content: ''; width: 42px; height: 1px; background: var(--accent);
    }
    h1.cover-title {
      font-family: var(--serif);
      font-variation-settings: 'opsz' 144, 'SOFT' 30, 'wght' 380;
      font-size: clamp(52px, 8vw, 128px);
      line-height: .9; letter-spacing: -.03em;
      margin: 0; max-width: 14ch;
    }
    h1.cover-title em {
      font-style: italic; color: var(--accent);
      font-variation-settings: 'opsz' 144, 'SOFT' 100, 'wght' 300;
    }
    .cover-meta {
      border-left: 1px solid var(--rule-strong);
      padding: 20px 0 20px 30px;
      font-family: var(--mono); font-size: 11px;
      color: var(--mute); letter-spacing: .04em;
      line-height: 1.8; min-width: 240px;
    }
    .cover-meta strong {
      display: block; font-size: 9.5px; color: var(--ink);
      letter-spacing: .22em; text-transform: uppercase;
      margin: 0 0 4px 0; font-weight: 500;
    }
    .cover-meta span { display: block; margin-bottom: 12px; color: var(--ink-2); }
    .cover-meta span:last-child { margin-bottom: 0; }
    .cover-meta .endpoint {
      color: var(--deep); background: var(--paper-2);
      padding: 6px 10px; border-left: 2px solid var(--deep);
      display: inline-block; margin-top: 2px;
    }

    section.lede {
      padding: 50px 40px; border-bottom: 1px solid var(--rule);
      display: grid; grid-template-columns: 200px 1fr; gap: 40px;
    }
    .lede-label {
      font-family: var(--mono); font-size: 10px;
      letter-spacing: .24em; text-transform: uppercase; color: var(--mute);
    }
    .lede-text {
      font-family: var(--serif);
      font-variation-settings: 'opsz' 20, 'SOFT' 50, 'wght' 400;
      font-size: clamp(19px, 1.6vw, 26px); line-height: 1.45;
      color: var(--ink-2); margin: 0; max-width: 50ch;
    }

    section.caps-section {
      padding: 50px 40px 60px;
    }
    .caps-header {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 30px; flex-wrap: wrap; gap: 20px;
    }
    .caps-header h2 {
      font-family: var(--serif);
      font-variation-settings: 'opsz' 96, 'SOFT' 50, 'wght' 400;
      font-size: clamp(32px, 4vw, 52px); line-height: 1;
      letter-spacing: -.02em; margin: 0; font-style: italic;
    }
    .caps-header p {
      font-family: var(--mono); font-size: 12px;
      color: var(--mute); letter-spacing: .04em;
      max-width: 38ch; margin: 0;
    }

    .cap {
      display: grid; grid-template-columns: 200px 1fr;
      gap: 40px; padding: 32px 0;
      border-top: 1px solid var(--rule-strong);
    }
    .cap:last-child { border-bottom: 1px solid var(--rule-strong); }
    .cap-left { padding-top: 4px; }
    .cap-name {
      font-family: var(--serif);
      font-variation-settings: 'opsz' 48, 'SOFT' 30, 'wght' 500;
      font-style: italic; color: var(--accent);
      font-size: 28px; line-height: 1; letter-spacing: -.01em;
    }
    .cap-kind {
      font-family: var(--mono); font-size: 10px;
      color: var(--mute); letter-spacing: .2em;
      text-transform: uppercase; margin-top: 10px;
    }
    .cap-desc {
      font-family: var(--serif);
      font-variation-settings: 'opsz' 18, 'SOFT' 50, 'wght' 400;
      font-size: 17px; line-height: 1.5;
      color: var(--ink-2); margin: 0 0 20px 0; max-width: 55ch;
    }

    details.schema {
      border-top: 1px dotted var(--rule); padding-top: 10px; margin-top: 10px;
    }
    details.schema > summary {
      cursor: pointer; list-style: none;
      font-family: var(--mono); font-size: 10px;
      letter-spacing: .2em; text-transform: uppercase;
      color: var(--mute); display: flex; align-items: center; gap: 8px;
      user-select: none; transition: color .2s;
    }
    details.schema > summary::-webkit-details-marker { display: none; }
    details.schema > summary::before {
      content: '+'; font-family: var(--serif); font-size: 16px;
      color: var(--accent); transition: transform .25s;
      display: inline-block; line-height: 1;
    }
    details.schema[open] > summary::before { transform: rotate(45deg); }
    details.schema > summary:hover { color: var(--ink); }
    details.schema pre {
      font-family: var(--mono); font-size: 11.5px;
      background: var(--ink); color: #e6d9bf;
      padding: 16px 18px; margin: 12px 0 0 0;
      overflow-x: auto; line-height: 1.55;
      border-left: 2px solid var(--accent);
    }

    section.invoke {
      padding: 40px 40px 60px; border-top: 2px solid var(--ink);
      display: grid; grid-template-columns: 1.2fr 1fr; gap: 48px;
    }
    section.invoke h3 {
      font-family: var(--serif);
      font-variation-settings: 'opsz' 48, 'SOFT' 50, 'wght' 420;
      font-style: italic; font-size: 26px; line-height: 1;
      margin: 0 0 14px 0; letter-spacing: -.01em;
    }
    section.invoke p {
      font-family: var(--serif);
      font-variation-settings: 'opsz' 16, 'SOFT' 50, 'wght' 400;
      font-size: 15px; color: var(--ink-2); line-height: 1.55;
      margin: 0 0 16px 0; max-width: 52ch;
    }
    section.invoke pre {
      font-family: var(--mono); font-size: 12px;
      background: var(--ink); color: #e6d9bf;
      padding: 18px 20px; line-height: 1.6;
      overflow-x: auto; margin: 0;
      border-left: 3px solid var(--accent);
    }
    section.invoke code { font-family: var(--mono); color: var(--accent); }

    footer.foot {
      padding: 28px 40px 36px; border-top: 1px solid var(--rule-strong);
      font-family: var(--mono); font-size: 11px; color: var(--mute);
      display: flex; justify-content: space-between; align-items: center;
      letter-spacing: .04em; gap: 20px; flex-wrap: wrap;
    }
    footer.foot a {
      color: var(--ink); text-decoration: none;
      border-bottom: 1px solid var(--rule-strong);
    }
    footer.foot a:hover { border-bottom-color: var(--accent); color: var(--accent); }
    footer.foot .mark {
      color: var(--accent); font-family: var(--serif); font-size: 16px;
      margin-right: 6px; display: inline-block; transform: rotate(-8deg);
    }

    @media (max-width: 820px) {
      nav.bar { padding: 12px 20px; font-size: 10px; }
      header.cover { padding: 48px 20px 40px; grid-template-columns: 1fr; gap: 36px; }
      .cover-meta { border-left: none; border-top: 1px solid var(--rule-strong); padding: 24px 0 0 0; }
      section.lede { padding: 36px 20px; grid-template-columns: 1fr; gap: 16px; }
      section.caps-section { padding: 36px 20px 48px; }
      .cap { grid-template-columns: 1fr; gap: 16px; padding: 24px 0; }
      section.invoke { padding: 32px 20px 48px; grid-template-columns: 1fr; gap: 28px; }
      footer.foot { padding: 20px; }
    }
  </style>
</head>
<body>
  <nav class="bar">
    <div><span class="mark">◉</span>${esc(manifest.name)}</div>
    <div class="right">
      <a href="/manifest">/manifest.json</a>
      <a href="${esc(registryUrl)}" target="_blank">registry ↗</a>
    </div>
  </nav>

  <header class="cover">
    <div>
      <p class="cover-kicker">An agent-native service · Web 4</p>
      <h1 class="cover-title">${esc(manifest.name.split('-')[0])}<br><em>${esc(manifest.name.split('-').slice(1).join(' ') || 'service')}</em></h1>
    </div>
    <div class="cover-meta">
      <span><strong>Endpoint</strong><span class="endpoint">${esc(manifest.endpoint)}</span></span>
      <span><strong>Pricing</strong>${esc(price)}</span>
      <span><strong>Capabilities</strong>${(manifest.capabilities || []).length} published</span>
      <span><strong>Protocol</strong>HTTP + JSON · agent-ready</span>
    </div>
  </header>

  <section class="lede">
    <div class="lede-label">About<br>this service</div>
    <p class="lede-text">${esc(manifest.description || 'No description published.')}</p>
  </section>

  <section class="caps-section">
    <div class="caps-header">
      <h2>What it can do.</h2>
      <p>
        Each capability declares its input and output contract as JSON-Schema, so an
        agent can call this service without reading any documentation.
      </p>
    </div>
    ${caps || '<p style="color:var(--mute);font-style:italic;">No capabilities declared yet.</p>'}
  </section>

  <section class="invoke">
    <div>
      <h3>How to call it.</h3>
      <p>
        This page is the human-readable face. Agents use <code>GET /manifest</code> to
        discover capabilities and <code>POST /invoke</code> to execute them. No scraping,
        no vision, no fragile selectors.
      </p>
      <p>
        The service is also registered in the central registry, where it can be discovered
        by intent (${(manifest.capabilities || []).map(c => '<code>' + esc(c.name) + '</code>').join(', ') || '—'}) rather than by name.
      </p>
    </div>
    <div>
      <pre># Invoke one of the capabilities directly
curl -X POST ${esc(manifest.endpoint)}/invoke \\
  -H 'Content-Type: application/json' \\
  -d '{"capability":"${esc((manifest.capabilities && manifest.capabilities[0] && manifest.capabilities[0].name) || 'example')}","input":{...}}'</pre>
    </div>
  </section>

  <footer class="foot">
    <div><span class="mark">◉</span>Web 4 open-standard draft v0.1 · served by ${esc(manifest.name)}</div>
    <div>
      <a href="/manifest">manifest</a> ·
      <a href="${esc(registryUrl)}" target="_blank">registry dashboard</a>
    </div>
  </footer>
</body>
</html>`;
}
