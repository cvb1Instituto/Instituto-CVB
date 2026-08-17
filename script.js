// =====================================================================
// Site público do Instituto CVB — todo o conteúdo (textos, eventos,
// prestação de contas, projetos, parceiros, blog) vem do Supabase.
// Para atualizar esse conteúdo, use o painel admin (admin-login.html) —
// não é mais necessário editar este arquivo nem subir nada no GitHub
// pra mudar texto, eventos ou valores.
// =====================================================================

let EVENTOS = [];
let PIX_INFO = {};
let CURRENT_RIFA = null;
let RIFA_BILHETES = [];
let RIFA_SELECIONADOS = [];
let BANNER_TIMER = null;

function formatBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---- Menu mobile ----
function setupMenu() {
  const menuToggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  if (!menuToggle || !nav) return;
  menuToggle.addEventListener('click', () => nav.classList.toggle('open'));
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => nav.classList.remove('open'));
  });
}

// ---- Seletor de idioma (tradução automática, sem digitar nada extra no admin) ----
// Traduz o texto já renderizado na página chamando o mesmo serviço que o
// Google Tradutor usa, e troca os nós de texto na hora. Resultado fica em
// cache (memória + localStorage) pra não traduzir de novo a cada troca.
const TRANSLATE_CACHE = {};
let PENDING_LANG = null;

function loadTranslateCache() {
  try {
    const raw = localStorage.getItem('cvb_translate_cache');
    if (raw) Object.assign(TRANSLATE_CACHE, JSON.parse(raw));
  } catch (e) { /* localStorage indisponível, segue sem cache persistente */ }
}

function saveTranslateCache() {
  try { localStorage.setItem('cvb_translate_cache', JSON.stringify(TRANSLATE_CACHE)); } catch (e) {}
}

async function translateText(text, lang) {
  const key = `${lang}:${text}`;
  if (TRANSLATE_CACHE[key]) return TRANSLATE_CACHE[key];
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    const translated = data[0].map(part => part[0]).join('');
    TRANSLATE_CACHE[key] = translated;
    return translated;
  } catch (e) {
    return text;
  }
}

function getTranslatableTextNodes() {
  const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || skipTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('#langSwitcher')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

async function applyTranslation(lang) {
  const nodes = getTranslatableTextNodes();
  nodes.forEach(node => {
    if (node.__originalText === undefined) node.__originalText = node.nodeValue;
  });

  if (lang === 'pt') {
    nodes.forEach(node => { node.nodeValue = node.__originalText; });
    return;
  }

  await Promise.all(nodes.map(async (node) => {
    const original = node.__originalText;
    const trimmed = original.trim();
    if (!trimmed) return;
    const translated = await translateText(trimmed, lang);
    node.nodeValue = original.replace(trimmed, translated);
  }));
  saveTranslateCache();
}

function setupLangSwitcher() {
  const switcher = document.getElementById('langSwitcher');
  if (!switcher) return;
  loadTranslateCache();

  let savedLang = null;
  try { savedLang = localStorage.getItem('cvb_lang'); } catch (e) {}
  if (savedLang && savedLang !== 'pt') {
    switcher.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === savedLang));
    PENDING_LANG = savedLang;
  }

  switcher.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lang = btn.dataset.lang;
      switcher.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b === btn));
      try { localStorage.setItem('cvb_lang', lang); } catch (e) {}
      await applyTranslation(lang);
    });
  });
}

// ---- Header com sombra ao rolar + link ativo ----
function setupHeaderScroll() {
  const header = document.getElementById('header');
  const navLinks = document.querySelectorAll('.nav a[href^="#"]');
  const sections = Array.from(navLinks)
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
    let current = sections[0];
    for (const sec of sections) {
      if (window.scrollY + 120 >= sec.offsetTop) current = sec;
    }
    navLinks.forEach(a => {
      a.classList.toggle('active', current && a.getAttribute('href') === `#${current.id}`);
    });
  }
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ---- Animação de entrada ao rolar ----
function setupReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || els.length === 0) {
    els.forEach(el => el.classList.add('in-view'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => observer.observe(el));
}

// ---- Formulário de contato (abre cliente de e-mail) ----
function setupContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = form.nome.value;
    const email = form.email.value;
    const mensagem = form.mensagem.value;
    const subject = encodeURIComponent('Contato pelo site - Instituto CVB');
    const body = encodeURIComponent(`Nome: ${nome}\nE-mail: ${email}\n\n${mensagem}`);
    window.location.href = `mailto:cvbinstituto@gmail.com?subject=${subject}&body=${body}`;
  });
}

// ---- Fale com a gente (CRM) ----
function setupCrmForm() {
  const form = document.getElementById('crmForm');
  if (!form) return;
  const tipoSelect = document.getElementById('crmTipo');
  const curriculoWrap = document.getElementById('crmCurriculoWrap');

  tipoSelect.addEventListener('change', () => {
    curriculoWrap.style.display = tipoSelect.value === 'trabalhe_conosco' ? '' : 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = document.getElementById('crmFeedback');
    const submitBtn = form.querySelector('button[type="submit"]');
    const tipo = tipoSelect.value;
    const nome = form.nome.value.trim();
    const telefone = form.telefone.value.trim();
    const mensagem = form.mensagem.value.trim();
    const fileInput = document.getElementById('crmCurriculo');

    if (!tipo || !nome || !telefone) {
      feedback.innerHTML = `<div class="admin-error">Preencha o motivo, nome e WhatsApp.</div>`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    feedback.innerHTML = '';

    try {
      let curriculoUrl = null;
      if (tipo === 'trabalhe_conosco' && fileInput.files[0]) {
        const file = fileInput.files[0];
        const path = `uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
        const { error: uploadError } = await supabaseClient.storage.from('curriculos').upload(path, file);
        if (uploadError) throw uploadError;
        curriculoUrl = path;
      }

      const { error: insertError } = await supabaseClient.from('contatos_crm').insert({
        tipo, nome, telefone, mensagem, curriculo_url: curriculoUrl,
      });
      if (insertError) throw insertError;

      form.reset();
      curriculoWrap.style.display = 'none';
      feedback.innerHTML = `<div class="admin-success">Recebemos seu contato! Em breve alguém do instituto vai te responder.</div>`;
    } catch (err) {
      feedback.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar';
    }
  });
}

// ---- Renderização de cada seção ----
function renderHero(hero) {
  const el = document.getElementById('heroText');
  if (!el || !hero) return;
  el.innerHTML = `
    <span class="eyebrow">${escapeHtml(hero.eyebrow)}</span>
    <h1>${escapeHtml(hero.titulo)}</h1>
    <p>${escapeHtml(hero.texto)}</p>
    <div class="hero-actions">
      <a href="#doar" class="btn btn-primary">💚 ${escapeHtml(hero.cta_primario || 'Quero Ajudar')}</a>
      <a href="#sobre" class="btn btn-outline">🤝 ${escapeHtml(hero.cta_secundario || 'Conheça o Instituto')}</a>
    </div>
  `;
}

const STAT_ICONS = ['👥', '📋', '📍', '❤️'];

function renderStats(stats) {
  const el = document.getElementById('statsGrid');
  if (!el || !Array.isArray(stats)) return;
  el.innerHTML = stats.map((s, i) => `
    <div class="stat">
      <span class="stat-icon">${STAT_ICONS[i] || '⭐'}</span>
      <div class="stat-text">
        <span class="stat-number">${escapeHtml(s.numero)}</span>
        <span class="stat-label">${escapeHtml(s.label)}</span>
      </div>
    </div>
  `).join('');
}

function renderSobre(sobre) {
  const el = document.getElementById('sobreContent');
  if (!el || !sobre) return;
  el.innerHTML = `
    <div class="section-tag reveal">
      <span class="eyebrow">${escapeHtml(sobre.eyebrow)}</span>
      <h2>${escapeHtml(sobre.titulo)}</h2>
    </div>
    <div class="section-content reveal">
      <p>${escapeHtml(sobre.texto)}</p>
    </div>
  `;
}

function renderMvv(rows) {
  const el = document.getElementById('mvvGrid');
  if (!el || !Array.isArray(rows)) return;
  const icons = { missao: '🎯', visao: '🔭', valores: '💚' };
  el.innerHTML = rows.map(item => {
    if (item.imagem_url) {
      return `<div class="mvv-card"><img src="${escapeHtml(item.imagem_url)}" alt="${escapeHtml(item.titulo)}" class="mvv-img"></div>`;
    }
    return `
      <div class="mvv-card">
        <span class="mvv-icon">${icons[item.id] || '⭐'}</span>
        <h3>${escapeHtml(item.titulo)}</h3>
        <p>${escapeHtml(item.texto)}</p>
      </div>
    `;
  }).join('');
}

function renderProjetos(rows) {
  const el = document.getElementById('projetosGrid');
  if (!el || !Array.isArray(rows)) return;
  el.innerHTML = rows.filter(p => p.ativo !== false).map(p => `
    <article class="card">
      <span class="card-tag dot-${escapeHtml(p.cor || 'green')}"></span>
      <h3>${escapeHtml(p.titulo)}</h3>
      <p>${escapeHtml(p.descricao)}</p>
    </article>
  `).join('');
}

function renderVoluntariado(v) {
  const el = document.getElementById('voluntariadoContent');
  if (!el || !v) return;
  const msg = encodeURIComponent(v.whatsapp_texto || 'Olá! Quero ser voluntário do Instituto CVB.');
  el.innerHTML = `
    <div class="section-tag reveal">
      <span class="eyebrow">${escapeHtml(v.eyebrow)}</span>
      <h2>${escapeHtml(v.titulo)}</h2>
    </div>
    <div class="section-content reveal">
      <p>${escapeHtml(v.texto)}</p>
      <a href="https://wa.me/5527981067522?text=${msg}" target="_blank" rel="noopener" class="btn btn-primary">Quero ser voluntário</a>
    </div>
  `;
}

function renderDoar(d, hasRifa) {
  const el = document.getElementById('doarContent');
  if (!el || !d) return;
  const msg = encodeURIComponent(d.whatsapp_texto || 'Olá! Quero fazer uma doação para o Instituto CVB.');
  el.innerHTML = `
    <div class="section-tag reveal">
      <span class="eyebrow">${escapeHtml(d.eyebrow)}</span>
      <h2>${escapeHtml(d.titulo)}</h2>
    </div>
    <div class="section-content reveal">
      <p>${escapeHtml(d.texto)}</p>
      <div class="hero-actions">
        ${hasRifa ? '<a href="#rifa" class="btn btn-primary">🎟️ Participar da Rifa</a>' : `<a href="https://wa.me/5527981067522?text=${msg}" target="_blank" rel="noopener" class="btn btn-primary">Doar via WhatsApp</a>`}
        ${hasRifa ? `<a href="https://wa.me/5527981067522?text=${msg}" target="_blank" rel="noopener" class="btn btn-outline">Doar via WhatsApp</a>` : ''}
      </div>
    </div>
  `;
}

let PARCEIROS_CACHE = [];

function renderParceirosGrid(rows, gridId, prevId, nextId) {
  const el = document.getElementById(gridId);
  if (!el) return;
  const real = Array.isArray(rows) ? rows.map(p => {
    const inner = p.logo_url ? `<img src="${escapeHtml(p.logo_url)}" alt="${escapeHtml(p.nome)}" class="partner-logo">` : escapeHtml(p.nome);
    return `<button type="button" class="partner-box" data-parceiro="${p.id}">${inner}</button>`;
  }).join('') : '';
  el.innerHTML = real + `<div class="partner-box partner-cta">Sua empresa aqui</div>`;

  el.querySelectorAll('[data-parceiro]').forEach(btn => {
    btn.addEventListener('click', () => openParceiroModal(btn.dataset.parceiro));
  });

  document.getElementById(prevId)?.addEventListener('click', () => {
    el.scrollBy({ left: -240, behavior: 'smooth' });
  });
  document.getElementById(nextId)?.addEventListener('click', () => {
    el.scrollBy({ left: 240, behavior: 'smooth' });
  });
}

function renderParceiros(rows) {
  PARCEIROS_CACHE = rows || [];
  renderParceirosGrid(PARCEIROS_CACHE, 'partnersGridTop', 'partnersPrevTop', 'partnersNextTop');
  renderParceirosGrid(PARCEIROS_CACHE, 'partnersGrid', 'partnersPrev', 'partnersNext');
}

function openParceiroModal(id) {
  const p = PARCEIROS_CACHE.find(x => String(x.id) === String(id));
  if (!p) return;
  const content = document.getElementById('eventModalContent');
  const fotos = Array.isArray(p.fotos) ? p.fotos : [];
  const embed = youtubeEmbedUrl(p.video_url);

  const midiaHtml = embed
    ? `<div class="modal-hero" style="padding:0; overflow:hidden;"><iframe src="${embed}" title="${escapeHtml(p.nome)}" style="width:100%; height:100%; border:none;" allowfullscreen loading="lazy"></iframe></div>`
    : p.video_url
    ? `<video src="${escapeHtml(p.video_url)}" class="modal-hero" controls></video>`
    : fotos.length > 0
    ? `<img src="${escapeHtml(fotos[0])}" class="modal-hero" id="modalHeroImg" alt="${escapeHtml(p.nome)}">`
    : p.logo_url
    ? `<img src="${escapeHtml(p.logo_url)}" class="modal-hero" style="object-fit:contain; background:var(--light-bg);" alt="${escapeHtml(p.nome)}">`
    : '';

  content.innerHTML = `
    ${midiaHtml}
    ${fotos.length > 1 && !p.video_url ? `
      <div class="modal-thumbs">
        ${fotos.map((f, i) => `<img src="${escapeHtml(f)}" class="${i === 0 ? 'active' : ''}" data-src="${escapeHtml(f)}" alt="Foto ${i + 1} - ${escapeHtml(p.nome)}">`).join('')}
      </div>` : ''}
    <h2>${escapeHtml(p.nome)}</h2>
    ${p.descricao ? `<p>${escapeHtml(p.descricao)}</p>` : ''}
    <div class="modal-finance">
      ${p.contato ? `<p><strong>Contato:</strong> ${escapeHtml(p.contato)}</p>` : ''}
      ${p.link ? `<a href="${escapeHtml(p.link)}" target="_blank" rel="noopener" class="btn btn-primary">Visitar site</a>` : ''}
    </div>
  `;

  content.querySelectorAll('.modal-thumbs img').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.getElementById('modalHeroImg').src = thumb.dataset.src;
      content.querySelectorAll('.modal-thumbs img').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  const modal = document.getElementById('eventModal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderBlog(rows) {
  const el = document.getElementById('blogGrid');
  if (!el || !Array.isArray(rows)) return;
  el.innerHTML = rows.map(p => `
    <article class="card blog-card">
      <span class="blog-date">${formatDatePt(p.data)}</span>
      <h3>${escapeHtml(p.titulo)}</h3>
      <p>${escapeHtml(p.resumo)}</p>
    </article>
  `).join('');
}

function formatDatePt(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderContato(c) {
  const el = document.getElementById('contactList');
  if (!el || !c) return;
  el.innerHTML = `
    <li><strong>E-mail:</strong> <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></li>
    <li><strong>WhatsApp:</strong> <a href="https://wa.me/${escapeHtml(c.whatsapp)}" target="_blank" rel="noopener">${escapeHtml(c.whatsapp_display)}</a></li>
    <li><strong>Instagram:</strong> <a href="https://instagram.com/${escapeHtml((c.instagram || '').replace('@',''))}" target="_blank" rel="noopener">${escapeHtml(c.instagram)}</a></li>
  `;
}

// ---- Eventos + Transparência (derivada dos mesmos dados) ----
function renderEvents() {
  const grid = document.getElementById('eventsGrid');
  if (!grid) return;
  grid.innerHTML = EVENTOS.map(ev => `
    <div class="event-card" data-id="${ev.id}" tabindex="0" role="button" aria-label="Abrir evento ${escapeHtml(ev.titulo)}">
      <img src="${escapeHtml(ev.capa_url)}" alt="${escapeHtml(ev.titulo)}" loading="lazy">
      <span class="event-card-icon">📁</span>
      <div class="event-card-overlay">
        <span class="event-badge badge-${escapeHtml(ev.cor)}">${escapeHtml(ev.categoria)}</span>
        <h3>${escapeHtml(ev.titulo)}</h3>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => openEventModal(card.dataset.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openEventModal(card.dataset.id);
      }
    });
  });
}

function openEventModal(id) {
  const ev = EVENTOS.find(e => String(e.id) === String(id));
  if (!ev) return;
  const content = document.getElementById('eventModalContent');
  const saldo = Number(ev.arrecadado) - Number(ev.gasto);
  const fotos = Array.isArray(ev.fotos) && ev.fotos.length ? ev.fotos : [ev.capa_url];

  content.innerHTML = `
    <img src="${escapeHtml(fotos[0])}" class="modal-hero" id="modalHeroImg" alt="${escapeHtml(ev.titulo)}">
    ${fotos.length > 1 ? `
      <div class="modal-thumbs">
        ${fotos.map((f, i) => `<img src="${escapeHtml(f)}" class="${i === 0 ? 'active' : ''}" data-src="${escapeHtml(f)}" alt="Foto ${i + 1} - ${escapeHtml(ev.titulo)}">`).join('')}
      </div>` : ''}
    <span class="event-badge badge-${escapeHtml(ev.cor)}">${escapeHtml(ev.categoria)}</span>
    <h2>${escapeHtml(ev.titulo)}</h2>
    <p class="modal-date">${escapeHtml(ev.data)}</p>
    <p>${escapeHtml(ev.descricao)}</p>
    <div class="modal-finance">
      <h4>Prestação de Contas</h4>
      <div class="modal-finance-grid">
        <div class="modal-finance-item">
          <div class="label">Arrecadado</div>
          <div class="value value-in">${formatBRL(ev.arrecadado)}</div>
        </div>
        <div class="modal-finance-item">
          <div class="label">Gasto</div>
          <div class="value value-out">${formatBRL(ev.gasto)}</div>
        </div>
        <div class="modal-finance-item">
          <div class="label">Saldo</div>
          <div class="value value-balance">${formatBRL(saldo)}</div>
        </div>
      </div>
      <p><strong>Como o valor foi utilizado:</strong> ${escapeHtml(ev.destino_gasto)}</p>
    </div>
  `;

  content.querySelectorAll('.modal-thumbs img').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.getElementById('modalHeroImg').src = thumb.dataset.src;
      content.querySelectorAll('.modal-thumbs img').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  const modal = document.getElementById('eventModal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEventModal() {
  const modal = document.getElementById('eventModal');
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

function setupModal() {
  document.getElementById('eventModalClose')?.addEventListener('click', closeEventModal);
  document.getElementById('eventModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'eventModal') closeEventModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEventModal();
  });
}

const TIPO_LABELS = { evento: 'Evento', campanha: 'Vaquinha', rifa: 'Rifa', outro: 'Outro' };
const TIPO_ANCORA = { evento: '#eventos', campanha: '#vaquinhas', rifa: '#rifa' };

function renderTransparency(rows) {
  const tbody = document.querySelector('#transparencyTable tbody');
  if (!tbody) return;
  let totalArrecadado = 0;
  let totalGasto = 0;

  tbody.innerHTML = (rows || []).map(pc => {
    totalArrecadado += Number(pc.arrecadado);
    totalGasto += Number(pc.gasto);
    const saldo = Number(pc.arrecadado) - Number(pc.gasto);
    const temLink = TIPO_ANCORA[pc.tipo];
    return `<tr>
      <td>${escapeHtml(pc.projeto)}</td>
      <td><span class="event-badge badge-blue">${escapeHtml(TIPO_LABELS[pc.tipo] || pc.tipo)}</span></td>
      <td>${formatBRL(pc.arrecadado)}</td>
      <td>${formatBRL(pc.gasto)}</td>
      <td>${formatBRL(saldo)}</td>
      <td>${temLink ? `<span class="link-btn" data-tipo="${pc.tipo}" data-item="${pc.item_id || ''}">Ver detalhes</span>` : ''}</td>
    </tr>`;
  }).join('');

  const totalSaldo = totalArrecadado - totalGasto;
  document.getElementById('summaryArrecadado').textContent = formatBRL(totalArrecadado);
  document.getElementById('summaryGasto').textContent = formatBRL(totalGasto);
  document.getElementById('summarySaldo').textContent = formatBRL(totalSaldo);

  tbody.querySelectorAll('.link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tipo = btn.dataset.tipo;
      if (tipo === 'evento' && btn.dataset.item && EVENTOS.find(e => e.id === btn.dataset.item)) {
        openEventModal(btn.dataset.item);
      } else {
        document.querySelector(TIPO_ANCORA[tipo])?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

// ---- Carrossel de campanhas (banners) ----
function renderBannerCarousel(banners) {
  const wrap = document.getElementById('bannerCarousel');
  const section = document.getElementById('bannerCarouselSection');
  if (!wrap) return;
  const ativos = (banners || []).filter(b => b.ativo !== false);

  if (ativos.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  wrap.innerHTML = `
    ${ativos.map((b, i) => `
      <div class="banner-slide ${i === 0 ? 'active' : ''}" data-i="${i}">
        <div class="banner-slide-image" style="background-image:url('${escapeHtml(b.imagem_url)}')"></div>
        <div class="banner-slide-content">
          <span class="banner-badge">Participe e faça a diferença</span>
          <h3>${escapeHtml(b.titulo)}</h3>
          ${b.texto ? `<p>${escapeHtml(b.texto)}</p>` : ''}
          ${b.botao_texto && b.botao_link ? `<a href="${escapeHtml(b.botao_link)}" class="btn btn-primary">${escapeHtml(b.botao_texto)}</a>` : ''}
        </div>
      </div>
    `).join('')}
    ${ativos.length > 1 ? `
      <button class="banner-nav banner-nav-prev" aria-label="Anterior">&lsaquo;</button>
      <button class="banner-nav banner-nav-next" aria-label="Próximo">&rsaquo;</button>
      <div class="banner-dots">${ativos.map((_, i) => `<button class="banner-dot ${i === 0 ? 'active' : ''}" data-dot="${i}"></button>`).join('')}</div>
    ` : ''}
  `;

  let current = 0;
  function goTo(i) {
    current = (i + ativos.length) % ativos.length;
    wrap.querySelectorAll('.banner-slide').forEach(s => s.classList.toggle('active', Number(s.dataset.i) === current));
    wrap.querySelectorAll('.banner-dot').forEach(d => d.classList.toggle('active', Number(d.dataset.dot) === current));
  }
  wrap.querySelector('.banner-nav-prev')?.addEventListener('click', () => { goTo(current - 1); resetAutoplay(); });
  wrap.querySelector('.banner-nav-next')?.addEventListener('click', () => { goTo(current + 1); resetAutoplay(); });
  wrap.querySelectorAll('.banner-dot').forEach(dot => {
    dot.addEventListener('click', () => { goTo(Number(dot.dataset.dot)); resetAutoplay(); });
  });

  function resetAutoplay() {
    if (BANNER_TIMER) clearInterval(BANNER_TIMER);
    if (ativos.length > 1) BANNER_TIMER = setInterval(() => goTo(current + 1), 5000);
  }
  resetAutoplay();
  wrap.addEventListener('mouseenter', () => { if (BANNER_TIMER) clearInterval(BANNER_TIMER); });
  wrap.addEventListener('mouseleave', resetAutoplay);
}

// ---- Vaquinhas (campanhas) ----
function renderCampanhas(rows) {
  const section = document.getElementById('vaquinhas');
  const grid = document.getElementById('campanhasGrid');
  if (!grid) return;
  const ativas = (rows || []).filter(c => c.ativa !== false);
  if (section) section.style.display = ativas.length === 0 ? 'none' : '';

  grid.innerHTML = ativas.map(c => {
    const meta = c.meta ? Number(c.meta) : null;
    const arrecadado = Number(c.arrecadado || 0);
    const pct = meta ? Math.min(100, Math.round((arrecadado / meta) * 100)) : null;
    const capa = Array.isArray(c.fotos) && c.fotos[0];
    const msg = encodeURIComponent(c.whatsapp_texto || `Olá! Quero ajudar na campanha "${c.titulo}".`);
    return `
      <div class="campanha-card">
        ${capa ? `<div class="campanha-media"><img src="${escapeHtml(capa)}" alt="${escapeHtml(c.titulo)}" loading="lazy"></div>` : ''}
        <div class="campanha-body">
          <h3>${escapeHtml(c.titulo)}</h3>
          <p>${escapeHtml(c.descricao)}</p>
          ${meta ? `
            <div class="campanha-progress-track"><div class="campanha-progress-fill" style="width:${pct}%"></div></div>
            <div class="campanha-progress-label"><strong>${formatBRL(arrecadado)}</strong><span>meta ${formatBRL(meta)}</span></div>
          ` : `
            <div class="campanha-progress-label"><strong>${formatBRL(arrecadado)}</strong><span>arrecadados até agora</span></div>
          `}
          <a href="https://wa.me/5527981067522?text=${msg}" target="_blank" rel="noopener" class="btn btn-primary">Quero ajudar</a>
        </div>
      </div>
    `;
  }).join('');
}

// ---- Rifa solidária ----
let RIFAS_ATIVAS = [];

function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function rifaMediaHtml(rifa) {
  const embed = youtubeEmbedUrl(rifa.video_url);
  if (embed) {
    return `<div class="rifa-card-media"><iframe src="${embed}" title="${escapeHtml(rifa.titulo)}" loading="lazy" allowfullscreen></iframe></div>`;
  }
  if (rifa.video_url) {
    return `<div class="rifa-card-media"><video src="${escapeHtml(rifa.video_url)}" controls></video></div>`;
  }
  if (rifa.premio_imagem_url) {
    return `<div class="rifa-card-media"><img src="${escapeHtml(rifa.premio_imagem_url)}" alt="${escapeHtml(rifa.titulo)}" loading="lazy"></div>`;
  }
  return '';
}

function renderRifaSection(rifasAtivas) {
  const section = document.getElementById('rifa');
  const content = document.getElementById('rifaContent');
  if (!content) return;
  RIFAS_ATIVAS = rifasAtivas || [];
  if (RIFAS_ATIVAS.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';

  content.innerHTML = `
    <div class="section-header reveal">
      <span class="eyebrow">Rifa Solidária</span>
      <h2>${RIFAS_ATIVAS.length > 1 ? 'Rifas Ativas' : escapeHtml(RIFAS_ATIVAS[0].titulo)}</h2>
    </div>
    <div class="rifas-grid reveal" id="rifasGrid"></div>
    <div id="rifaExpandido"></div>
  `;

  const grid = document.getElementById('rifasGrid');
  grid.innerHTML = RIFAS_ATIVAS.map(rifa => {
    const dataSorteioHtml = rifa.data_sorteio
      ? `<p class="rifa-sorteio-data">🗓️ Sorteio em ${new Date(rifa.data_sorteio + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>`
      : '';
    return `
      <div class="rifa-card">
        ${rifaMediaHtml(rifa)}
        <div class="rifa-card-body">
          <h3>${escapeHtml(rifa.titulo)}</h3>
          <p>${escapeHtml(rifa.descricao)}</p>
          <span class="rifa-preco">Cada número: ${formatBRL(rifa.preco_numero)}</span>
          ${dataSorteioHtml}
          <div class="hero-actions" style="margin-top:16px;">
            <button class="btn btn-primary" data-ver-numeros="${rifa.id}">Ajudar / Escolher número</button>
            <button class="btn btn-outline" data-ajudar-livre="${rifa.id}">Ajudar com outro valor</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-ver-numeros]').forEach(btn => {
    btn.addEventListener('click', () => toggleRifaExpandida(btn.dataset.verNumeros));
  });
  grid.querySelectorAll('[data-ajudar-livre]').forEach(btn => {
    btn.addEventListener('click', () => {
      CURRENT_RIFA = RIFAS_ATIVAS.find(r => r.id === btn.dataset.ajudarLivre);
      openRifaLivreModal();
    });
  });
}

async function toggleRifaExpandida(rifaId) {
  const expandido = document.getElementById('rifaExpandido');
  if (!expandido) return;
  if (CURRENT_RIFA && CURRENT_RIFA.id === rifaId && expandido.dataset.aberto === '1') {
    expandido.innerHTML = '';
    expandido.dataset.aberto = '0';
    CURRENT_RIFA = null;
    return;
  }

  const rifa = RIFAS_ATIVAS.find(r => r.id === rifaId);
  if (!rifa) return;
  CURRENT_RIFA = rifa;
  RIFA_SELECIONADOS = [];

  expandido.dataset.aberto = '1';
  expandido.innerHTML = `
    <div class="rifa-numeros-wrap reveal">
      <h3>${escapeHtml(rifa.titulo)} — escolha seus números</h3>
      <div class="rifa-legend">
        <span><i style="background:var(--blue)"></i> Disponível</span>
        <span><i style="background:var(--yellow-dark)"></i> Reservado</span>
        <span><i style="background:var(--gray-light)"></i> Pago</span>
      </div>
      <div class="rifa-numeros-grid" id="rifaNumerosGrid"></div>
      <div class="rifa-selecao-bar" id="rifaSelecaoBar" style="display:none;">
        <span id="rifaSelecaoInfo"></span>
        <button class="btn btn-primary" id="rifaContinuarBtn">Continuar</button>
      </div>
    </div>
  `;
  document.getElementById('rifaContinuarBtn').addEventListener('click', openRifaMultiModal);

  const { data } = await supabaseClient.from('rifa_bilhetes').select('*').eq('rifa_id', rifaId).order('numero');
  RIFA_BILHETES = data || [];
  renderRifaGrid();
  expandido.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderRifaGrid() {
  const grid = document.getElementById('rifaNumerosGrid');
  if (!grid) return;
  RIFA_SELECIONADOS = RIFA_SELECIONADOS.filter(id => RIFA_BILHETES.find(b => b.id === id)?.status === 'disponivel');
  grid.innerHTML = RIFA_BILHETES.map(b => `
    <button class="rifa-numero ${b.status}${RIFA_SELECIONADOS.includes(b.id) ? ' selecionado' : ''}" data-id="${b.id}" ${b.status !== 'disponivel' ? 'disabled' : ''}>${String(b.numero).padStart(3, '0')}</button>
  `).join('');
  grid.querySelectorAll('.rifa-numero.disponivel').forEach(btn => {
    btn.addEventListener('click', () => toggleRifaNumero(btn.dataset.id));
  });
  updateRifaSelecaoBar();
}

function toggleRifaNumero(id) {
  const idx = RIFA_SELECIONADOS.indexOf(id);
  if (idx === -1) RIFA_SELECIONADOS.push(id); else RIFA_SELECIONADOS.splice(idx, 1);
  renderRifaGrid();
}

function updateRifaSelecaoBar() {
  const bar = document.getElementById('rifaSelecaoBar');
  const info = document.getElementById('rifaSelecaoInfo');
  if (!bar || !info) return;
  if (RIFA_SELECIONADOS.length === 0) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = '';
  const bilhetes = RIFA_SELECIONADOS
    .map(id => RIFA_BILHETES.find(b => b.id === id))
    .filter(Boolean)
    .sort((a, b) => a.numero - b.numero);
  const total = bilhetes.length * Number(CURRENT_RIFA.preco_numero);
  const numeros = bilhetes.map(b => String(b.numero).padStart(3, '0')).join(', ');
  info.innerHTML = `<strong>${bilhetes.length}</strong> número${bilhetes.length > 1 ? 's' : ''} selecionado${bilhetes.length > 1 ? 's' : ''}: ${numeros} — Total: <strong>${formatBRL(total)}</strong>`;
}

async function refreshRifaBilhetes() {
  if (!CURRENT_RIFA) return;
  const { data } = await supabaseClient.from('rifa_bilhetes').select('*').eq('rifa_id', CURRENT_RIFA.id).order('numero');
  RIFA_BILHETES = data || [];
  renderRifaGrid();
}

function pixInstructionsHtml(valor, referencia) {
  const msg = encodeURIComponent(`Olá! Fiz o pagamento Pix de ${formatBRL(valor)} referente a: ${referencia}. Segue o comprovante:`);
  return `
    <div class="rifa-pix-box">
      <p style="margin-bottom:10px;"><strong>Pague ${formatBRL(valor)} via Pix</strong></p>
      <p class="chave">${escapeHtml(PIX_INFO.chave || 'chave não configurada')}</p>
      <p style="margin:6px 0 16px;">${escapeHtml(PIX_INFO.tipo || '')} · ${escapeHtml(PIX_INFO.nome_beneficiario || '')}</p>
      <a href="https://wa.me/5527981067522?text=${msg}" target="_blank" rel="noopener" class="btn btn-primary">Enviar comprovante pelo WhatsApp</a>
    </div>
  `;
}

function openRifaMultiModal() {
  if (RIFA_SELECIONADOS.length === 0) return;
  const bilhetes = RIFA_SELECIONADOS
    .map(id => RIFA_BILHETES.find(b => b.id === id))
    .filter(Boolean)
    .sort((a, b) => a.numero - b.numero);
  if (bilhetes.length === 0) return;

  const ids = bilhetes.map(b => b.id);
  const numerosStr = bilhetes.map(b => String(b.numero).padStart(3, '0')).join(', ');
  const total = bilhetes.length * Number(CURRENT_RIFA.preco_numero);
  const plural = bilhetes.length > 1;

  const content = document.getElementById('rifaModalContent');
  content.innerHTML = `
    <div style="padding:28px;">
      <h2>${bilhetes.length} número${plural ? 's' : ''} selecionado${plural ? 's' : ''}</h2>
      <p>Números: <strong>${numerosStr}</strong></p>
      <p>Preencha seus dados para reservar por ${formatBRL(total)}.</p>
      <div class="rifa-form">
        <div class="admin-field"><label>Seu nome</label><input id="rifaNome" required></div>
        <div class="admin-field"><label>WhatsApp</label><input id="rifaTelefone" required placeholder="(27) 9####-####"></div>
        <div id="rifaFormFeedback"></div>
        <button class="btn btn-primary" id="rifaReservarBtn">Reservar ${plural ? 'estes números' : 'este número'}</button>
      </div>
    </div>
  `;
  document.getElementById('rifaModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  document.getElementById('rifaReservarBtn').addEventListener('click', async () => {
    const nome = document.getElementById('rifaNome').value.trim();
    const telefone = document.getElementById('rifaTelefone').value.trim();
    const feedback = document.getElementById('rifaFormFeedback');
    if (!nome || !telefone) {
      feedback.innerHTML = `<div class="admin-error">Preencha nome e WhatsApp.</div>`;
      return;
    }
    const { data, error } = await supabaseClient
      .from('rifa_bilhetes')
      .update({ status: 'reservado', comprador_nome: nome, comprador_telefone: telefone, reservado_em: new Date().toISOString() })
      .in('id', ids)
      .eq('status', 'disponivel')
      .select();

    if (error || !data || data.length !== ids.length) {
      if (data && data.length > 0) {
        await supabaseClient
          .from('rifa_bilhetes')
          .update({ status: 'disponivel', comprador_nome: null, comprador_telefone: null, reservado_em: null })
          .in('id', data.map(d => d.id));
      }
      feedback.innerHTML = `<div class="admin-error">Um ou mais números acabaram de ser reservados por outra pessoa. Feche e escolha outros.</div>`;
      RIFA_SELECIONADOS = [];
      refreshRifaBilhetes();
      return;
    }

    RIFA_SELECIONADOS = [];
    content.innerHTML = `
      <div style="padding:28px;">
        <h2>Número${plural ? 's' : ''} ${numerosStr} reservado${plural ? 's' : ''}!</h2>
        <p>Você tem 30 minutos para pagar antes que ${plural ? 'eles voltem' : 'ele volte'} a ficar disponível.</p>
        ${pixInstructionsHtml(total, `número${plural ? 's' : ''} ${numerosStr} da rifa`)}
      </div>
    `;
    refreshRifaBilhetes();
  });
}

function openRifaLivreModal() {
  const content = document.getElementById('rifaModalContent');
  content.innerHTML = `
    <div style="padding:28px;">
      <h2>Quero ajudar com outro valor</h2>
      <p>Sem escolher número — 100% do valor vai para a causa da rifa.</p>
      <div class="rifa-form">
        <div class="admin-field"><label>Seu nome</label><input id="rifaLivreNome" required></div>
        <div class="admin-field"><label>WhatsApp</label><input id="rifaLivreTelefone" required placeholder="(27) 9####-####"></div>
        <div class="admin-field"><label>Valor (R$)</label><input id="rifaLivreValor" type="number" min="1" step="0.01" required></div>
        <div id="rifaLivreFeedback"></div>
        <button class="btn btn-primary" id="rifaLivreSubmitBtn">Continuar</button>
      </div>
    </div>
  `;
  document.getElementById('rifaModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  document.getElementById('rifaLivreSubmitBtn').addEventListener('click', async () => {
    const nome = document.getElementById('rifaLivreNome').value.trim();
    const telefone = document.getElementById('rifaLivreTelefone').value.trim();
    const valor = Number(document.getElementById('rifaLivreValor').value);
    const feedback = document.getElementById('rifaLivreFeedback');
    if (!nome || !telefone || !valor || valor <= 0) {
      feedback.innerHTML = `<div class="admin-error">Preencha todos os campos com um valor válido.</div>`;
      return;
    }
    const { error } = await supabaseClient.from('rifa_contribuicoes_livres').insert({ rifa_id: CURRENT_RIFA.id, nome, telefone, valor });
    if (error) {
      feedback.innerHTML = `<div class="admin-error">${escapeHtml(error.message)}</div>`;
      return;
    }
    content.innerHTML = `
      <div style="padding:28px;">
        <h2>Obrigado, ${escapeHtml(nome)}!</h2>
        ${pixInstructionsHtml(valor, `contribuição livre para a ${escapeHtml(CURRENT_RIFA.titulo)}`)}
      </div>
    `;
  });
}

function setupRifaModal() {
  document.getElementById('rifaModalClose')?.addEventListener('click', closeRifaModal);
  document.getElementById('rifaModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'rifaModal') closeRifaModal();
  });
}

function closeRifaModal() {
  document.getElementById('rifaModal').classList.remove('open');
  document.body.style.overflow = '';
}

// ---- Carregamento dos dados do Supabase ----
async function loadContent() {
  const [
    { data: blocksRows },
    { data: mvvRows },
    { data: projetosRows },
    { data: eventosRows },
    { data: parceirosRows },
    { data: blogRows },
    { data: bannersRows },
    { data: campanhasRows },
    { data: rifasRows },
    { data: prestacaoRows },
  ] = await Promise.all([
    supabaseClient.from('content_blocks').select('key, value'),
    supabaseClient.from('mvv').select('*').order('ordem'),
    supabaseClient.from('projetos').select('*').order('ordem'),
    supabaseClient.from('eventos').select('*').order('ordem'),
    supabaseClient.from('parceiros').select('*').order('ordem'),
    supabaseClient.from('blog_posts').select('*').order('ordem'),
    supabaseClient.from('banners').select('*').order('ordem'),
    supabaseClient.from('campanhas').select('*').order('ordem'),
    supabaseClient.from('rifas').select('*').eq('status', 'ativa').order('criado_em', { ascending: false }),
    supabaseClient.from('prestacao_contas').select('*').order('ordem'),
  ]);

  const blocks = {};
  (blocksRows || []).forEach(row => { blocks[row.key] = row.value; });
  PIX_INFO = blocks.pix || {};

  renderHero(blocks.hero);
  renderStats(blocks.stats);
  renderSobre(blocks.sobre);
  renderMvv(mvvRows || []);
  renderProjetos(projetosRows || []);
  renderVoluntariado(blocks.voluntariado);
  renderDoar(blocks.doar, (rifasRows || []).length > 0);
  renderParceiros(parceirosRows || []);
  renderBlog(blogRows || []);
  renderContato(blocks.contato);
  renderBannerCarousel(bannersRows || []);
  renderCampanhas(campanhasRows || []);

  EVENTOS = eventosRows || [];
  renderEvents();
  renderTransparency(prestacaoRows || []);

  renderRifaSection(rifasRows || []);

  setupReveal();
}

// ---- Assistente VIVA ----
let VIVA_HISTORY = [];

function setupVivaChat() {
  const widget = document.getElementById('vivaWidget');
  const button = document.getElementById('vivaButton');
  const closeBtn = document.getElementById('vivaClose');
  const form = document.getElementById('vivaForm');
  const input = document.getElementById('vivaInput');
  const messages = document.getElementById('vivaMessages');
  if (!widget || !button || !form) return;

  function addMessage(text, who) {
    const div = document.createElement('div');
    div.className = `viva-msg viva-msg-${who}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function addTyping() {
    const div = document.createElement('div');
    div.className = 'viva-msg-typing';
    div.innerHTML = '<span class="viva-typing-dots"><span></span><span></span><span></span></span>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  let opened = false;
  button.addEventListener('click', () => {
    widget.classList.toggle('open');
    if (widget.classList.contains('open') && !opened) {
      opened = true;
      addMessage('Oi! Eu sou a VIVA, assistente virtual do Instituto CVB 💚 Posso te ajudar a conhecer nossos projetos, como ajudar, voluntariado, a rifa solidária ou qualquer dúvida sobre o instituto. Pode perguntar!', 'bot');
      input.focus();
    }
  });

  closeBtn?.addEventListener('click', () => widget.classList.remove('open'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage(text, 'user');
    VIVA_HISTORY.push({ role: 'user', text });

    const typingEl = addTyping();
    let lang = 'pt';
    try { lang = localStorage.getItem('cvb_lang') || 'pt'; } catch (e) {}

    try {
      const { data, error } = await supabaseClient.functions.invoke('chat-viva', {
        body: { message: text, history: VIVA_HISTORY.slice(0, -1), lang },
      });
      typingEl.remove();
      if (error || !data || data.error) {
        addMessage('Desculpe, não consegui responder agora. Tente novamente em instantes.', 'bot');
        return;
      }
      addMessage(data.reply, 'bot');
      VIVA_HISTORY.push({ role: 'model', text: data.reply });
    } catch (err) {
      typingEl.remove();
      addMessage('Desculpe, não consegui responder agora. Tente novamente em instantes.', 'bot');
    }
  });
}

document.getElementById('year').textContent = new Date().getFullYear();
setupMenu();
setupHeaderScroll();
setupContactForm();
setupCrmForm();
setupLangSwitcher();
setupModal();
setupRifaModal();
setupVivaChat();
loadContent().then(() => {
  if (PENDING_LANG) applyTranslation(PENDING_LANG);
  if (window.location.hash) {
    const alvo = document.querySelector(window.location.hash);
    if (alvo) setTimeout(() => alvo.scrollIntoView({ block: 'start' }), 50);
  }
});
