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

function renderDoar(d) {
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
        <a href="https://wa.me/5527981067522?text=${msg}" target="_blank" rel="noopener" class="btn btn-primary">Doar via WhatsApp</a>
        <a href="mailto:cvbinstituto@gmail.com" class="btn btn-outline">Doar por e-mail</a>
      </div>
    </div>
  `;
}

function renderParceiros(rows) {
  const el = document.getElementById('partnersGrid');
  if (!el) return;
  const real = Array.isArray(rows) ? rows.map(p => {
    const inner = p.logo_url ? `<img src="${escapeHtml(p.logo_url)}" alt="${escapeHtml(p.nome)}" class="partner-logo">` : escapeHtml(p.nome);
    return p.link
      ? `<a href="${escapeHtml(p.link)}" target="_blank" rel="noopener" class="partner-box">${inner}</a>`
      : `<div class="partner-box">${inner}</div>`;
  }).join('') : '';
  el.innerHTML = real + `<div class="partner-box partner-cta">Sua empresa aqui</div>`;

  document.getElementById('partnersPrev')?.addEventListener('click', () => {
    el.scrollBy({ left: -240, behavior: 'smooth' });
  });
  document.getElementById('partnersNext')?.addEventListener('click', () => {
    el.scrollBy({ left: 240, behavior: 'smooth' });
  });
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
function renderRifaSection(rifa, bilhetes) {
  const section = document.getElementById('rifa');
  const content = document.getElementById('rifaContent');
  if (!content) return;
  if (!rifa) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';

  CURRENT_RIFA = rifa;
  RIFA_BILHETES = bilhetes;

  const dataSorteioHtml = rifa.data_sorteio
    ? `<p class="rifa-sorteio-data">🗓️ Sorteio em ${new Date(rifa.data_sorteio + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>`
    : '';

  content.innerHTML = `
    <div class="rifa-header">
      ${rifa.premio_imagem_url ? `<img src="${escapeHtml(rifa.premio_imagem_url)}" alt="${escapeHtml(rifa.titulo)}" class="rifa-premio-img">` : ''}
      <div class="rifa-info reveal">
        <span class="eyebrow">Rifa Solidária</span>
        <h2>${escapeHtml(rifa.titulo)}</h2>
        <p>${escapeHtml(rifa.descricao)}</p>
        <span class="rifa-preco">Cada número: ${formatBRL(rifa.preco_numero)}</span>
        ${dataSorteioHtml}
        <div class="hero-actions" style="margin-top:20px;">
          <button class="btn btn-primary" id="rifaAjudarBtn">Ajudar / Escolher número</button>
          <button class="btn btn-outline" id="rifaLivreBtn">Ajudar com outro valor</button>
        </div>
      </div>
    </div>
    <div class="rifa-numeros-wrap" id="rifaNumerosWrap" style="display:none;">
      <div class="rifa-legend reveal">
        <span><i style="background:var(--blue)"></i> Disponível</span>
        <span><i style="background:var(--yellow-dark)"></i> Reservado</span>
        <span><i style="background:var(--gray-light)"></i> Pago</span>
      </div>
      <div class="rifa-numeros-grid reveal" id="rifaNumerosGrid"></div>
    </div>
  `;

  renderRifaGrid();
  document.getElementById('rifaLivreBtn').addEventListener('click', openRifaLivreModal);
  document.getElementById('rifaAjudarBtn').addEventListener('click', () => {
    const wrap = document.getElementById('rifaNumerosWrap');
    const showing = wrap.style.display !== 'none';
    wrap.style.display = showing ? 'none' : '';
    document.getElementById('rifaAjudarBtn').textContent = showing ? 'Ajudar / Escolher número' : 'Ocultar números';
    if (!showing) wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function renderRifaGrid() {
  const grid = document.getElementById('rifaNumerosGrid');
  if (!grid) return;
  grid.innerHTML = RIFA_BILHETES.map(b => `
    <button class="rifa-numero ${b.status}" data-id="${b.id}" ${b.status !== 'disponivel' ? 'disabled' : ''}>${String(b.numero).padStart(3, '0')}</button>
  `).join('');
  grid.querySelectorAll('.rifa-numero.disponivel').forEach(btn => {
    btn.addEventListener('click', () => openRifaNumeroModal(btn.dataset.id));
  });
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

function openRifaNumeroModal(bilheteId) {
  const bilhete = RIFA_BILHETES.find(b => b.id === bilheteId);
  if (!bilhete) return;
  const content = document.getElementById('rifaModalContent');
  content.innerHTML = `
    <div style="padding:28px;">
      <h2>Número ${String(bilhete.numero).padStart(3, '0')}</h2>
      <p>Preencha seus dados para reservar este número por ${formatBRL(CURRENT_RIFA.preco_numero)}.</p>
      <div class="rifa-form">
        <div class="admin-field"><label>Seu nome</label><input id="rifaNome" required></div>
        <div class="admin-field"><label>WhatsApp</label><input id="rifaTelefone" required placeholder="(27) 9####-####"></div>
        <div id="rifaFormFeedback"></div>
        <button class="btn btn-primary" id="rifaReservarBtn">Reservar este número</button>
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
      .eq('id', bilheteId)
      .select();

    if (error || !data || data.length === 0) {
      feedback.innerHTML = `<div class="admin-error">Esse número acabou de ser reservado por outra pessoa. Feche e escolha outro.</div>`;
      refreshRifaBilhetes();
      return;
    }

    content.innerHTML = `
      <div style="padding:28px;">
        <h2>Número ${String(bilhete.numero).padStart(3, '0')} reservado!</h2>
        <p>Você tem 30 minutos para pagar antes que o número volte a ficar disponível.</p>
        ${pixInstructionsHtml(CURRENT_RIFA.preco_numero, `número ${String(bilhete.numero).padStart(3, '0')} da rifa`)}
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
    supabaseClient.from('rifas').select('*').eq('status', 'ativa').order('criado_em', { ascending: false }).limit(1),
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
  renderDoar(blocks.doar);
  renderParceiros(parceirosRows || []);
  renderBlog(blogRows || []);
  renderContato(blocks.contato);
  renderBannerCarousel(bannersRows || []);
  renderCampanhas(campanhasRows || []);

  EVENTOS = eventosRows || [];
  renderEvents();
  renderTransparency(prestacaoRows || []);

  const rifaAtiva = (rifasRows || [])[0] || null;
  if (rifaAtiva) {
    const { data: bilhetes } = await supabaseClient.from('rifa_bilhetes').select('*').eq('rifa_id', rifaAtiva.id).order('numero');
    renderRifaSection(rifaAtiva, bilhetes || []);
  } else {
    renderRifaSection(null, []);
  }

  setupReveal();
}

document.getElementById('year').textContent = new Date().getFullYear();
setupMenu();
setupHeaderScroll();
setupContactForm();
setupCrmForm();
setupLangSwitcher();
setupModal();
setupRifaModal();
loadContent().then(() => {
  if (PENDING_LANG) applyTranslation(PENDING_LANG);
});
