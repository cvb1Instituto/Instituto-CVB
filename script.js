// =====================================================================
// Site público do Instituto CVB — todo o conteúdo (textos, eventos,
// prestação de contas, projetos, parceiros, blog) vem do Supabase.
// Para atualizar esse conteúdo, use o painel admin (admin-login.html) —
// não é mais necessário editar este arquivo nem subir nada no GitHub
// pra mudar texto, eventos ou valores.
// =====================================================================

let EVENTOS = [];
let PIX_INFO = {};
let CONTATO_INFO = {};

// Como a rifa e as vaquinhas são pagas:
//   'checkout'   → página de pagamento do Mercado Pago (Pix, cartão ou boleto),
//                  também com confirmação automática.
//   'automatico' → Pix transparente do Mercado Pago. Bloqueado enquanto o cadastro
//                  da conta não for validado (403 PolicyAgent em /v1/payments).
//   'manual'     → sem API: o site reserva o número e mostra a chave Pix; a pessoa
//                  manda o comprovante no WhatsApp e o admin confirma no painel.
// Os quatro caminhos estão implementados — trocar de um para outro é só mudar aqui.
const MODO_PAGAMENTO_RIFA = 'checkout';

// Tempo que um número fica reservado esperando o pagamento.
const MINUTOS_DE_RESERVA = 10;
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
let REVEAL_OBSERVER = null;

function setupReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
    return;
  }
  REVEAL_OBSERVER = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        REVEAL_OBSERVER.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  observarReveal(document);
}

// Registra elementos .reveal criados DEPOIS do carregamento — como a grade de
// números da rifa, que só nasce quando o visitante clica em "Ajudar".
// Sem isso eles ficam presos no opacity:0 do .reveal e nunca aparecem.
function observarReveal(root) {
  if (!root || !root.querySelectorAll) return;
  const els = root.querySelectorAll('.reveal');
  if (!REVEAL_OBSERVER) {
    els.forEach(el => el.classList.add('in-view'));
    return;
  }
  els.forEach(el => REVEAL_OBSERVER.observe(el));
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
let CAMPANHAS_CACHE = [];

function renderCampanhas(rows) {
  const section = document.getElementById('vaquinhas');
  const grid = document.getElementById('campanhasGrid');
  if (!grid) return;
  const ativas = (rows || []).filter(c => c.ativa !== false);
  CAMPANHAS_CACHE = ativas;
  if (section) section.style.display = ativas.length === 0 ? 'none' : '';

  grid.innerHTML = ativas.map(c => {
    const meta = c.meta ? Number(c.meta) : null;
    const arrecadado = Number(c.arrecadado || 0);
    const pct = meta ? Math.min(100, Math.round((arrecadado / meta) * 100)) : null;
    const capa = Array.isArray(c.fotos) && c.fotos[0];
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
          <button type="button" class="btn btn-primary" data-campanha-ajudar="${c.id}">Quero ajudar</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-campanha-ajudar]').forEach(btn => {
    btn.addEventListener('click', () => openCampanhaModal(btn.dataset.campanhaAjudar));
  });
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

  // Quando só existe uma rifa, ela vira um card largo: imagem menor (sem corte) de
  // um lado e o texto do outro, pra caber tudo na tela sem cortar o cartaz.
  const unica = RIFAS_ATIVAS.length === 1;

  content.innerHTML = `
    <div class="section-header reveal">
      <span class="eyebrow">Rifa Solidária</span>
      <h2>${RIFAS_ATIVAS.length > 1 ? 'Rifas Ativas' : escapeHtml(RIFAS_ATIVAS[0].titulo)}</h2>
    </div>
    <div class="rifas-grid${unica ? ' rifas-grid--single' : ''} reveal" id="rifasGrid"></div>
    <div id="rifaExpandido"></div>
  `;

  const grid = document.getElementById('rifasGrid');
  grid.innerHTML = RIFAS_ATIVAS.map(rifa => {
    const dataSorteioHtml = rifa.data_sorteio
      ? `<p class="rifa-sorteio-data">🗓️ Sorteio em ${new Date(rifa.data_sorteio + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>`
      : '';
    return `
      <div class="rifa-card${unica ? ' rifa-card--wide' : ''}">
        ${rifaMediaHtml(rifa)}
        <div class="rifa-card-body">
          ${unica ? '' : `<h3>${escapeHtml(rifa.titulo)}</h3>`}
          <p${unica ? ' class="rifa-desc-clamp"' : ''}>${escapeHtml(rifa.descricao)}</p>
          ${unica ? '<button type="button" class="rifa-ler-mais" data-ler-mais>Ler mais</button>' : ''}
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

  grid.querySelectorAll('[data-ler-mais]').forEach(btn => {
    const p = btn.previousElementSibling;
    if (!p) { btn.remove(); return; }
    if (p.scrollHeight <= p.clientHeight + 2) {
      p.classList.remove('rifa-desc-clamp');
      btn.remove();
      return;
    }
    btn.addEventListener('click', () => {
      const recolhido = p.classList.toggle('rifa-desc-clamp');
      btn.textContent = recolhido ? 'Ler mais' : 'Ler menos';
    });
  });

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
      <h3>Escolha seus números</h3>
      <p class="rifa-numeros-hint">Cada número: <strong>${formatBRL(rifa.preco_numero)}</strong> — clique nos números que quiser (pode escolher vários) e depois em Continuar.</p>
      <div class="rifa-legend">
        <span><i style="background:var(--blue)"></i> Disponível</span>
        <span><i style="background:var(--yellow-dark)"></i> Reservado</span>
        <span><i style="background:var(--gray-light)"></i> Pago</span>
      </div>
      <div class="rifa-busca">
        <input id="rifaBuscaNumero" inputmode="numeric" placeholder="Buscar um número (ex.: 1234)">
        <button class="btn btn-outline" id="rifaSorteNumeroBtn" type="button">Número da sorte</button>
      </div>
      <div class="rifa-abas" id="rifaPaginacao"></div>
      <div class="rifa-numeros-grid" id="rifaNumerosGrid"></div>
      <div class="rifa-selecao-bar" id="rifaSelecaoBar" style="display:none;">
        <span id="rifaSelecaoInfo"></span>
        <button class="btn btn-primary" id="rifaContinuarBtn">Continuar</button>
      </div>
    </div>
  `;
  document.getElementById('rifaContinuarBtn').addEventListener('click', openRifaMultiModal);
  document.getElementById('rifaBuscaNumero').addEventListener('input', (e) => irParaNumero(e.target.value));
  document.getElementById('rifaSorteNumeroBtn').addEventListener('click', escolherNumeroDaSorte);
  observarReveal(expandido);

  // Antes de mostrar a grade, devolve os números que alguém reservou e não pagou
  // (passou dos 10 minutos), pra ninguém ver como ocupado o que já está livre.
  await supabaseClient.functions.invoke('liberar-reservas-expiradas').catch(() => {});

  const { data } = await supabaseClient.from('rifa_bilhetes').select('*').eq('rifa_id', rifaId).order('numero');
  RIFA_BILHETES = data || [];
  renderRifaGrid();
  scrollAbaixoDoHeader(expandido);
}

// Rola até o elemento descontando o header fixo, pra o painel aberto começar
// logo abaixo do menu e caber inteiro na tela.
function scrollAbaixoDoHeader(el) {
  if (!el) return;
  const header = document.querySelector('.header');
  const offset = (header ? header.offsetHeight : 0) + 12;
  const y = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

// A grade é dividida em abas de mil números (numa rifa de 10 mil, dez abinhas):
// desenhar tudo de uma vez travaria o navegador, principalmente no celular.
const RIFA_POR_PAGINA = 1000;
let RIFA_PAGINA = 0;

function digitosDoNumero() {
  const total = CURRENT_RIFA ? Number(CURRENT_RIFA.total_numeros) : 1000;
  return String(total).length;
}

function renderRifaGrid() {
  const grid = document.getElementById('rifaNumerosGrid');
  if (!grid) return;
  RIFA_SELECIONADOS = RIFA_SELECIONADOS.filter(id => RIFA_BILHETES.find(b => b.id === id)?.status === 'disponivel');

  const totalPaginas = Math.max(1, Math.ceil(RIFA_BILHETES.length / RIFA_POR_PAGINA));
  if (RIFA_PAGINA > totalPaginas - 1) RIFA_PAGINA = totalPaginas - 1;
  const inicio = RIFA_PAGINA * RIFA_POR_PAGINA;
  const pagina = RIFA_BILHETES.slice(inicio, inicio + RIFA_POR_PAGINA);
  const digitos = digitosDoNumero();

  grid.innerHTML = pagina.map(b => `
    <button class="rifa-numero ${b.status}${RIFA_SELECIONADOS.includes(b.id) ? ' selecionado' : ''}" data-id="${b.id}" ${b.status !== 'disponivel' ? 'disabled' : ''}>${String(b.numero).padStart(digitos, '0')}</button>
  `).join('');
  grid.querySelectorAll('.rifa-numero.disponivel').forEach(btn => {
    btn.addEventListener('click', () => toggleRifaNumero(btn.dataset.id));
  });

  renderRifaAbas(totalPaginas);
  updateRifaSelecaoBar();
}

// Uma abinha por faixa de mil números, com a contagem de selecionados na aba.
function renderRifaAbas(totalPaginas) {
  const nav = document.getElementById('rifaPaginacao');
  if (!nav) return;
  if (totalPaginas <= 1) { nav.innerHTML = ''; return; }

  const digitos = digitosDoNumero();
  nav.innerHTML = Array.from({ length: totalPaginas }, (_, i) => {
    const faixa = RIFA_BILHETES.slice(i * RIFA_POR_PAGINA, (i + 1) * RIFA_POR_PAGINA);
    if (faixa.length === 0) return '';
    const primeiro = String(faixa[0].numero).padStart(digitos, '0');
    const ultimo = String(faixa[faixa.length - 1].numero).padStart(digitos, '0');
    const escolhidos = faixa.filter(b => RIFA_SELECIONADOS.includes(b.id)).length;
    return `
      <button type="button" class="rifa-aba${i === RIFA_PAGINA ? ' ativa' : ''}" data-pagina="${i}">
        ${primeiro}–${ultimo}${escolhidos ? `<i>${escolhidos}</i>` : ''}
      </button>
    `;
  }).join('');

  nav.querySelectorAll('[data-pagina]').forEach(btn => {
    btn.addEventListener('click', () => {
      RIFA_PAGINA = Number(btn.dataset.pagina);
      renderRifaGrid();
      document.getElementById('rifaNumerosGrid')?.scrollTo({ top: 0 });
    });
  });
}

// Busca: leva direto para a página onde o número está e o destaca.
function irParaNumero(texto) {
  const alvo = Number(String(texto).replace(/\D/g, ''));
  if (!alvo) return;
  const indice = RIFA_BILHETES.findIndex(b => b.numero === alvo);
  if (indice === -1) return;
  RIFA_PAGINA = Math.floor(indice / RIFA_POR_PAGINA);
  renderRifaGrid();
  const botao = document.querySelector(`.rifa-numero[data-id="${RIFA_BILHETES[indice].id}"]`);
  if (botao) {
    botao.classList.add('destacado');
    botao.scrollIntoView({ block: 'center' });
  }
}

function escolherNumeroDaSorte() {
  const livres = RIFA_BILHETES.filter(b => b.status === 'disponivel' && !RIFA_SELECIONADOS.includes(b.id));
  if (livres.length === 0) return;
  const sorteado = livres[Math.floor(Math.random() * livres.length)];
  RIFA_SELECIONADOS.push(sorteado.id);
  RIFA_PAGINA = Math.floor(RIFA_BILHETES.findIndex(b => b.id === sorteado.id) / RIFA_POR_PAGINA);
  renderRifaGrid();
  document.querySelector(`.rifa-numero[data-id="${sorteado.id}"]`)?.scrollIntoView({ block: 'center' });
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
  const numeros = bilhetes.map(b => String(b.numero).padStart(digitosDoNumero(), '0')).join(', ');
  info.innerHTML = `<strong>${bilhetes.length}</strong> número${bilhetes.length > 1 ? 's' : ''} selecionado${bilhetes.length > 1 ? 's' : ''}: ${numeros} — Total: <strong>${formatBRL(total)}</strong>`;
}

async function refreshRifaBilhetes() {
  if (!CURRENT_RIFA) return;
  const { data } = await supabaseClient.from('rifa_bilhetes').select('*').eq('rifa_id', CURRENT_RIFA.id).order('numero');
  RIFA_BILHETES = data || [];
  renderRifaGrid();
}

// ---- Pagamento Pix (Mercado Pago) ----
let PIX_POLL_INTERVAL = null;

function stopPixPolling() {
  if (PIX_POLL_INTERVAL) { clearInterval(PIX_POLL_INTERVAL); PIX_POLL_INTERVAL = null; }
}

async function iniciarPagamentoPix(container, payload, onAprovado) {
  const gerando = document.createElement('p');
  gerando.className = 'admin-hint';
  gerando.id = 'pixGerando';
  gerando.textContent = 'Gerando Pix...';
  container.appendChild(gerando);

  const { data, error } = await supabaseClient.functions.invoke('create-pix-payment', { body: payload });
  document.getElementById('pixGerando')?.remove();

  if (error || !data || data.error) {
    const err = document.createElement('div');
    err.className = 'admin-error';
    err.textContent = (data && data.error) || 'Não foi possível gerar o Pix. Tente novamente.';
    container.appendChild(err);
    return;
  }

  const box = document.createElement('div');
  box.className = 'rifa-pix-box';
  box.id = 'pixBox';
  box.innerHTML = `
    <p style="margin-bottom:10px; text-align:center;"><strong>Pague ${formatBRL(data.valor)} via Pix</strong></p>
    <img src="data:image/png;base64,${data.qr_code_base64}" alt="QR Code Pix" style="width:200px;height:200px;display:block;margin:0 auto 14px;border-radius:8px;">
    <p style="font-size:12px;color:var(--gray-light);margin-bottom:6px;text-align:center;">Ou copie o código Pix (copia e cola):</p>
    <p class="chave" style="font-size:11px;word-break:break-all;">${escapeHtml(data.qr_code)}</p>
    <button class="btn btn-outline" id="pixCopiarBtn" type="button" style="margin-top:10px;width:100%;">Copiar código Pix</button>
    <p id="pixStatusMsg" style="margin-top:14px;font-size:13.5px;color:var(--gray);text-align:center;">⏳ Aguardando confirmação do pagamento...</p>
  `;
  container.appendChild(box);

  document.getElementById('pixCopiarBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(data.qr_code);
      const btn = document.getElementById('pixCopiarBtn');
      btn.textContent = 'Copiado!';
      setTimeout(() => { const b = document.getElementById('pixCopiarBtn'); if (b) b.textContent = 'Copiar código Pix'; }, 2000);
    } catch (e) { /* clipboard indisponível, usuário copia manualmente */ }
  });

  stopPixPolling();
  PIX_POLL_INTERVAL = setInterval(async () => {
    const { data: statusData } = await supabaseClient.functions.invoke('check-pix-status', { body: { pagamento_id: data.pagamento_id } });
    if (!statusData) return;
    const msgEl = document.getElementById('pixStatusMsg');
    if (statusData.status === 'aprovado') {
      stopPixPolling();
      const boxEl = document.getElementById('pixBox');
      if (boxEl) boxEl.innerHTML = `<p style="text-align:center; color:var(--green); font-weight:700;">✅ Pagamento confirmado! Muito obrigado.</p>`;
      if (onAprovado) onAprovado();
    } else if (statusData.status === 'expirado' || statusData.status === 'cancelado') {
      stopPixPolling();
      if (msgEl) msgEl.innerHTML = '⚠️ O Pix expirou ou foi cancelado. Feche e tente novamente.';
    }
  }, 4000);
}

function openRifaMultiModal() {
  if (RIFA_SELECIONADOS.length === 0) return;
  const bilhetes = RIFA_SELECIONADOS
    .map(id => RIFA_BILHETES.find(b => b.id === id))
    .filter(Boolean)
    .sort((a, b) => a.numero - b.numero);
  if (bilhetes.length === 0) return;

  const numerosArr = bilhetes.map(b => b.numero);
  const numerosStr = bilhetes.map(b => String(b.numero).padStart(digitosDoNumero(), '0')).join(', ');
  const total = bilhetes.length * Number(CURRENT_RIFA.preco_numero);
  const plural = bilhetes.length > 1;
  const rifaIdAtual = CURRENT_RIFA.id;

  const manual = MODO_PAGAMENTO_RIFA === 'manual';

  const content = document.getElementById('rifaModalContent');
  content.innerHTML = `
    <div style="padding:28px;">
      <h2>${bilhetes.length} número${plural ? 's' : ''} selecionado${plural ? 's' : ''}</h2>
      <p>Números: <strong>${numerosStr}</strong></p>
      <p>${manual
        ? `Preencha seus dados para reservar ${plural ? 'os números' : 'o número'} e pagar ${formatBRL(total)} via Pix.`
        : MODO_PAGAMENTO_RIFA === 'checkout'
          ? `Preencha seus dados para pagar ${formatBRL(total)} com Pix, cartão ou boleto.`
          : `Preencha seus dados para pagar ${formatBRL(total)} via Pix.`}</p>
      <div class="rifa-form">
        <div class="admin-field"><label>Seu nome</label><input id="rifaNome" required></div>
        <div class="admin-field"><label>WhatsApp</label><input id="rifaTelefone" required placeholder="(27) 9####-####"></div>
        ${MODO_PAGAMENTO_RIFA === 'automatico' ? '<div class="admin-field"><label>E-mail</label><input id="rifaEmail" type="email" required></div>' : ''}
        <div id="rifaFormFeedback"></div>
        <button class="btn btn-primary" id="rifaReservarBtn">${rotuloBotaoPagamento(true)}</button>
      </div>
    </div>
  `;
  document.getElementById('rifaModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  document.getElementById('rifaReservarBtn').addEventListener('click', async () => {
    const nome = document.getElementById('rifaNome').value.trim();
    const telefone = document.getElementById('rifaTelefone').value.trim();
    const emailEl = document.getElementById('rifaEmail');
    const email = emailEl ? emailEl.value.trim() : '';
    const feedback = document.getElementById('rifaFormFeedback');
    if (!nome || !telefone || (MODO_PAGAMENTO_RIFA === 'automatico' && !email)) {
      feedback.innerHTML = `<div class="admin-error">Preencha ${MODO_PAGAMENTO_RIFA === 'automatico' ? 'nome, WhatsApp e e-mail' : 'nome e WhatsApp'}.</div>`;
      return;
    }
    document.getElementById('rifaReservarBtn').disabled = true;
    feedback.innerHTML = '';

    if (manual) {
      await reservarNumerosManual(content, { bilhetes, nome, telefone });
      return;
    }

    if (MODO_PAGAMENTO_RIFA === 'checkout') {
      await iniciarCheckoutPro(content, {
        tipo: 'rifa_numero', rifa_id: rifaIdAtual, numeros: numerosArr, nome, telefone, email,
      });
      return;
    }

    await iniciarPagamentoPix(content, {
      tipo: 'rifa_numero', rifa_id: rifaIdAtual, numeros: numerosArr, nome, telefone, email,
    }, () => {
      RIFA_SELECIONADOS = [];
      refreshRifaBilhetes();
    });
  });
}

// ---- Checkout Pro (página de pagamento do Mercado Pago) ----

// Rótulo do botão que fecha o pedido, conforme o modo de pagamento.
function rotuloBotaoPagamento(comNumeros) {
  if (MODO_PAGAMENTO_RIFA === 'manual') return comNumeros ? 'Reservar meus números' : 'Continuar para o Pix';
  if (MODO_PAGAMENTO_RIFA === 'checkout') return 'Ir para o pagamento';
  return 'Gerar Pix';
}

async function iniciarCheckoutPro(container, payload) {
  const aviso = document.createElement('p');
  aviso.className = 'admin-hint';
  aviso.textContent = 'Abrindo o pagamento seguro do Mercado Pago...';
  container.appendChild(aviso);

  const { data, error } = await supabaseClient.functions.invoke('create-checkout-preference', { body: payload });
  aviso.remove();

  if (!error && data && data.init_point) {
    window.location.href = data.init_point;
    return;
  }

  // A mensagem específica (ex.: número já reservado) vem no corpo da resposta,
  // que o supabase-js entrega dentro de error.context quando o status não é 2xx.
  let msg = 'Não foi possível abrir o pagamento. Tente novamente.';
  if (data && data.error) {
    msg = data.error;
  } else if (error && error.context && typeof error.context.json === 'function') {
    try {
      const corpo = await error.context.json();
      if (corpo && corpo.error) msg = corpo.error;
    } catch (e) { /* resposta sem json: fica a mensagem genérica */ }
  }

  const err = document.createElement('div');
  err.className = 'admin-error';
  err.textContent = msg;
  container.appendChild(err);
  container.querySelectorAll('button[disabled]').forEach(b => { b.disabled = false; });
  refreshRifaBilhetes();
}

// ---- Pix manual (plano B, sem API) ----

// Reserva os números direto na tabela (a política de RLS deixa o visitante
// marcar como "reservado" só o que estiver disponível — é isso que impede duas
// pessoas de levarem o mesmo número). Se alguém pegar um número no meio do
// caminho, seguimos com os que sobraram em vez de perder a venda inteira.
async function reservarNumerosManual(container, { bilhetes, nome, telefone }) {
  const ids = bilhetes.map(b => b.id);
  const { data: reservados, error } = await supabaseClient
    .from('rifa_bilhetes')
    .update({
      status: 'reservado',
      reservado_em: new Date().toISOString(),
      comprador_nome: nome,
      comprador_telefone: telefone,
    })
    .in('id', ids)
    .eq('status', 'disponivel')
    .select('numero');

  if (error || !reservados || reservados.length === 0) {
    const feedback = document.getElementById('rifaFormFeedback');
    if (feedback) {
      feedback.innerHTML = `<div class="admin-error">Esses números acabaram de ser reservados por outra pessoa. Feche e escolha outros.</div>`;
    }
    const btn = document.getElementById('rifaReservarBtn');
    if (btn) btn.disabled = false;
    RIFA_SELECIONADOS = [];
    refreshRifaBilhetes();
    return;
  }

  const numerosOk = reservados.map(r => String(r.numero).padStart(digitosDoNumero(), '0')).sort();
  const perdidos = ids.length - reservados.length;
  const valor = reservados.length * Number(CURRENT_RIFA.preco_numero);

  RIFA_SELECIONADOS = [];
  refreshRifaBilhetes();

  container.innerHTML = `
    <div style="padding:28px;">
      <h2>✅ Número${numerosOk.length > 1 ? 's' : ''} reservado${numerosOk.length > 1 ? 's' : ''} no seu nome</h2>
      ${perdidos > 0 ? `<div class="admin-error">${perdidos} do${perdidos > 1 ? 's' : ''} número${perdidos > 1 ? 's' : ''} escolhido${perdidos > 1 ? 's' : ''} acabou de ser pego por outra pessoa. Reservamos os demais.</div>` : ''}
      <p>Número${numerosOk.length > 1 ? 's' : ''}: <strong>${numerosOk.join(', ')}</strong></p>
      ${boxPixManualHtml({ valor, nome, numeros: numerosOk.join(', ') })}
    </div>
  `;
  ativarBotoesPixManual({ valor, nome, numeros: numerosOk.join(', ') });
}

// ---- BR Code: o "copia e cola" do Pix, já com o valor da compra ----
// Monta o payload no padrão EMV do Banco Central (campo = id + tamanho + valor),
// para o app do banco abrir com o valor certo em vez de a pessoa digitar.

function campoEmv(id, valor) {
  return id + String(valor.length).padStart(2, '0') + valor;
}

// Só ASCII maiúsculo: acento e símbolo quebram a leitura em alguns bancos.
function limparTextoEmv(texto, maximo) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, maximo);
}

function crc16Pix(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function gerarBRCode({ chave, nome, cidade, valor, txid }) {
  if (!chave) return '';
  const merchantAccount = campoEmv('00', 'BR.GOV.BCB.PIX') + campoEmv('01', chave);
  const identificador = (txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  const semCrc =
    campoEmv('00', '01') +
    campoEmv('26', merchantAccount) +
    campoEmv('52', '0000') +
    campoEmv('53', '986') +
    campoEmv('54', Number(valor).toFixed(2)) +
    campoEmv('58', 'BR') +
    campoEmv('59', limparTextoEmv(nome, 25) || 'INSTITUTO CVB') +
    campoEmv('60', limparTextoEmv(cidade, 15) || 'VITORIA') +
    campoEmv('62', campoEmv('05', identificador)) +
    '6304';

  return semCrc + crc16Pix(semCrc);
}

function boxPixManualHtml({ valor, numeros }) {
  const chave = PIX_INFO.chave || '';
  const tipoChave = PIX_INFO.tipo || 'Chave Pix';
  const beneficiario = PIX_INFO.nome_beneficiario || 'Instituto CVB';
  return `
    <div class="rifa-pix-box">
      <p style="text-align:center; margin-bottom:14px;"><strong>Pague ${formatBRL(valor)} via Pix</strong></p>
      <div id="pixQrCanvas" class="rifa-pix-qr"></div>
      <p style="font-size:12.5px; color:var(--gray-light); text-align:center; margin-bottom:10px;">Aponte a câmera do app do banco — o valor já vai preenchido.</p>
      <button class="btn btn-primary" id="pixCopiarCodigoBtn" type="button" style="width:100%;">Copiar código Pix (copia e cola)</button>
      <p style="font-size:13px; color:var(--gray); margin:16px 0 4px;">Ou pague pela chave — ${escapeHtml(tipoChave)}, ${escapeHtml(beneficiario)}:</p>
      <p class="chave" id="pixChaveManual">${escapeHtml(chave)}</p>
      <button class="btn btn-outline" id="pixCopiarChaveBtn" type="button" style="margin-top:10px;width:100%;">Copiar chave Pix</button>
      <p style="font-size:13.5px; color:var(--gray); margin-top:16px;">
        Depois de pagar, <strong>envie o comprovante no WhatsApp</strong> para confirmarmos${numeros ? ' o seu número' : ' a sua contribuição'}.
        A reserva vale 30 minutos; assim que confirmarmos, o número passa a ser seu de vez.
      </p>
      <a class="btn btn-primary" id="pixWhatsBtn" href="#" target="_blank" rel="noopener" style="margin-top:12px;width:100%;text-align:center;">Enviar comprovante no WhatsApp</a>
    </div>
  `;
}

function ativarBotoesPixManual({ valor, nome, numeros }) {
  const chave = PIX_INFO.chave || '';

  const codigo = gerarBRCode({
    chave,
    nome: PIX_INFO.nome_beneficiario || 'Instituto CVB',
    cidade: PIX_INFO.cidade || 'Vitoria',
    valor,
    txid: numeros ? `RIFA${numeros.replace(/\D/g, '').slice(0, 20)}` : 'DOACAOCVB',
  });

  const areaQr = document.getElementById("pixQrCanvas");
  if (areaQr && codigo && window.QRCode) {
    new QRCode(areaQr, { text: codigo, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  } else if (areaQr) {
    areaQr.remove();
  }

  const copiarCodigo = document.getElementById('pixCopiarCodigoBtn');
  if (copiarCodigo) {
    if (!codigo) {
      copiarCodigo.remove();
    } else {
      copiarCodigo.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(codigo);
          copiarCodigo.textContent = 'Código copiado!';
          setTimeout(() => { copiarCodigo.textContent = 'Copiar código Pix (copia e cola)'; }, 2000);
        } catch (e) { /* sem clipboard: a pessoa usa o QR ou a chave */ }
      });
    }
  }

  const copiar = document.getElementById('pixCopiarChaveBtn');
  if (copiar) {
    copiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(chave);
        copiar.textContent = 'Copiado!';
        setTimeout(() => { copiar.textContent = 'Copiar chave Pix'; }, 2000);
      } catch (e) { /* sem clipboard: a pessoa copia manualmente */ }
    });
  }

  const whats = document.getElementById('pixWhatsBtn');
  if (whats) {
    const numero = (CONTATO_INFO.whatsapp || '5527981067522');
    const texto = numeros
      ? `Olá! Sou ${nome}. Reservei o(s) número(s) ${numeros} da rifa do Instituto CVB (total ${formatBRL(valor)}) e estou enviando o comprovante do Pix.`
      : `Olá! Sou ${nome}. Contribuí com ${formatBRL(valor)} para a rifa do Instituto CVB e estou enviando o comprovante do Pix.`;
    whats.href = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  }
}

function openRifaLivreModal() {
  const manual = MODO_PAGAMENTO_RIFA === 'manual';
  const content = document.getElementById('rifaModalContent');
  const rifaIdAtual = CURRENT_RIFA.id;
  content.innerHTML = `
    <div style="padding:28px;">
      <h2>Quero ajudar com outro valor</h2>
      <p>Sem escolher número — 100% do valor vai para a causa da rifa.</p>
      <div class="rifa-form">
        <div class="admin-field"><label>Seu nome</label><input id="rifaLivreNome" required></div>
        <div class="admin-field"><label>WhatsApp</label><input id="rifaLivreTelefone" required placeholder="(27) 9####-####"></div>
        ${manual ? '' : '<div class="admin-field"><label>E-mail</label><input id="rifaLivreEmail" type="email" required></div>'}
        <div class="admin-field"><label>Valor (R$)</label><input id="rifaLivreValor" type="number" min="1" step="0.01" required></div>
        <div id="rifaLivreFeedback"></div>
        <button class="btn btn-primary" id="rifaLivreSubmitBtn">${rotuloBotaoPagamento(false)}</button>
      </div>
    </div>
  `;
  document.getElementById('rifaModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  document.getElementById('rifaLivreSubmitBtn').addEventListener('click', async () => {
    const nome = document.getElementById('rifaLivreNome').value.trim();
    const telefone = document.getElementById('rifaLivreTelefone').value.trim();
    const emailEl = document.getElementById('rifaLivreEmail');
    const email = emailEl ? emailEl.value.trim() : '';
    const valor = Number(document.getElementById('rifaLivreValor').value);
    const feedback = document.getElementById('rifaLivreFeedback');
    if (!nome || !telefone || (!manual && !email) || !valor || valor <= 0) {
      feedback.innerHTML = `<div class="admin-error">Preencha todos os campos com um valor válido.</div>`;
      return;
    }
    document.getElementById('rifaLivreSubmitBtn').disabled = true;
    feedback.innerHTML = '';

    if (manual) {
      // Fica registrada como contribuição pendente — o admin confirma quando o
      // comprovante chegar ("Doações livres aguardando confirmação" no painel).
      const { error } = await supabaseClient.from('rifa_contribuicoes_livres').insert({
        rifa_id: rifaIdAtual, nome, telefone, valor, status: 'pendente',
      });
      if (error) {
        feedback.innerHTML = `<div class="admin-error">Não foi possível registrar agora. Tente novamente.</div>`;
        document.getElementById('rifaLivreSubmitBtn').disabled = false;
        return;
      }
      content.innerHTML = `
        <div style="padding:28px;">
          <h2>Falta só o Pix 💚</h2>
          <p>Obrigado, ${escapeHtml(nome)}! Sua contribuição foi registrada.</p>
          ${boxPixManualHtml({ valor, numeros: '' })}
        </div>
      `;
      ativarBotoesPixManual({ valor, nome, numeros: '' });
      return;
    }

    if (MODO_PAGAMENTO_RIFA === 'checkout') {
      await iniciarCheckoutPro(content, { tipo: 'rifa_livre', rifa_id: rifaIdAtual, valor, nome, telefone, email });
      return;
    }

    await iniciarPagamentoPix(content, { tipo: 'rifa_livre', rifa_id: rifaIdAtual, valor, nome, telefone, email }, null);
  });
}

function openCampanhaModal(id) {
  const c = CAMPANHAS_CACHE.find(x => String(x.id) === String(id));
  if (!c) return;
  const content = document.getElementById('rifaModalContent');
  content.innerHTML = `
    <div style="padding:28px;">
      <h2>Ajudar — ${escapeHtml(c.titulo)}</h2>
      <p>Contribua com qualquer valor ${MODO_PAGAMENTO_RIFA === 'checkout' ? 'via Pix, cartão ou boleto' : 'via Pix'}.</p>
      <div class="rifa-form">
        <div class="admin-field"><label>Seu nome</label><input id="campNome" required></div>
        <div class="admin-field"><label>WhatsApp</label><input id="campTelefone" required placeholder="(27) 9####-####"></div>
        ${MODO_PAGAMENTO_RIFA === 'manual' ? '' : '<div class="admin-field"><label>E-mail</label><input id="campEmail" type="email" required></div>'}
        <div class="admin-field"><label>Valor (R$)</label><input id="campValor" type="number" min="1" step="0.01" required></div>
        <div id="campFeedback"></div>
        <button class="btn btn-primary" id="campSubmitBtn">${rotuloBotaoPagamento(false)}</button>
      </div>
    </div>
  `;
  document.getElementById('rifaModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  document.getElementById('campSubmitBtn').addEventListener('click', async () => {
    const manual = MODO_PAGAMENTO_RIFA === 'manual';
    const nome = document.getElementById('campNome').value.trim();
    const telefone = document.getElementById('campTelefone').value.trim();
    const emailEl = document.getElementById('campEmail');
    const email = emailEl ? emailEl.value.trim() : '';
    const valor = Number(document.getElementById('campValor').value);
    const feedback = document.getElementById('campFeedback');
    if (!nome || !telefone || (!manual && !email) || !valor || valor <= 0) {
      feedback.innerHTML = `<div class="admin-error">Preencha todos os campos com um valor válido.</div>`;
      return;
    }
    document.getElementById('campSubmitBtn').disabled = true;
    feedback.innerHTML = '';

    if (manual) {
      content.innerHTML = `
        <div style="padding:28px;">
          <h2>Falta só o Pix 💚</h2>
          <p>Obrigado, ${escapeHtml(nome)}! Sua contribuição para <strong>${escapeHtml(c.titulo)}</strong> é de ${formatBRL(valor)}.</p>
          ${boxPixManualHtml({ valor, numeros: '' })}
        </div>
      `;
      ativarBotoesPixManual({ valor, nome, numeros: '' });
      return;
    }

    if (MODO_PAGAMENTO_RIFA === 'checkout') {
      await iniciarCheckoutPro(content, { tipo: 'campanha', campanha_id: c.id, valor, nome, telefone, email });
      return;
    }

    await iniciarPagamentoPix(content, { tipo: 'campanha', campanha_id: c.id, valor, nome, telefone, email }, null);
  });
}

// Quem volta do checkout do Mercado Pago chega com o resultado na URL
// (status=approved / pending / failure). Sem isso a pessoa pagava e voltava
// pra home sem nenhum sinal de que deu certo.
function mostrarRetornoDoPagamento() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') || params.get('collection_status');
  if (!status) return;

  const content = document.getElementById('rifaContent');
  if (!content) return;

  const avisos = {
    approved: { cor: 'var(--green)', texto: '✅ Pagamento confirmado! Seu número já está reservado no seu nome. Obrigado por ajudar 💚' },
    pending: { cor: 'var(--yellow-dark)', texto: '⏳ Pagamento em processamento. Assim que for aprovado, seu número é confirmado automaticamente.' },
    in_process: { cor: 'var(--yellow-dark)', texto: '⏳ Pagamento em processamento. Assim que for aprovado, seu número é confirmado automaticamente.' },
    failure: { cor: '#b3261e', texto: '⚠️ O pagamento não foi concluído. Você pode escolher seus números de novo abaixo.' },
    rejected: { cor: '#b3261e', texto: '⚠️ O pagamento não foi concluído. Você pode escolher seus números de novo abaixo.' },
  };
  const aviso = avisos[status];
  if (!aviso) return;

  const box = document.createElement('div');
  box.className = 'rifa-retorno-pagamento';
  box.style.borderColor = aviso.cor;
  box.innerHTML = `<strong style="color:${aviso.cor}">${escapeHtml(aviso.texto)}</strong>`;
  content.prepend(box);

  // Limpa a query pra não repetir o aviso se a pessoa recarregar a página.
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  scrollAbaixoDoHeader(box);
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
  stopPixPolling();
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
  CONTATO_INFO = blocks.contato || {};

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

// ---- Assistente Aninha ----
let VIVA_HISTORY = [];

// Leva a pessoa da conversa direto pra grade de números da rifa.
function abrirRifaParaCompra() {
  const rifa = RIFAS_ATIVAS[0];
  if (!rifa) return;
  const expandido = document.getElementById('rifaExpandido');
  const jaAberto = expandido && expandido.dataset.aberto === '1' && CURRENT_RIFA && CURRENT_RIFA.id === rifa.id;
  if (jaAberto) scrollAbaixoDoHeader(expandido);
  else toggleRifaExpandida(rifa.id);
}

function setupVivaChat() {
  const widget = document.getElementById('vivaWidget');
  const button = document.getElementById('vivaButton');
  const closeBtn = document.getElementById('vivaClose');
  const form = document.getElementById('vivaForm');
  const input = document.getElementById('vivaInput');
  const messages = document.getElementById('vivaMessages');
  if (!widget || !button || !form) return;

  // Deixa link (site/WhatsApp) clicável e **negrito** de verdade nas respostas da Aninha.
  function formatarResposta(texto) {
    return escapeHtml(texto)
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  // A Aninha marca [ABRIR_RIFA] quando está guiando a pessoa para a compra:
  // vira um botão que leva direto para a grade de números.
  function botaoRifa() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'viva-action';
    btn.textContent = '🎟️ Escolher meus números';
    btn.addEventListener('click', () => {
      widget.classList.remove('open');
      abrirRifaParaCompra();
    });
    return btn;
  }

  function addMessage(text, who) {
    const div = document.createElement('div');
    div.className = `viva-msg viva-msg-${who}`;
    if (who === 'bot') {
      const bruto = String(text ?? '');
      const guiandoCompra = bruto.includes('[ABRIR_RIFA]');
      div.innerHTML = formatarResposta(bruto.replace(/\[ABRIR_RIFA\]/g, '').trim());
      messages.appendChild(div);
      if (guiandoCompra && RIFAS_ATIVAS.length > 0) messages.appendChild(botaoRifa());
    } else {
      div.textContent = text;
      messages.appendChild(div);
    }
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
      // O selo "1" é só o chamariz inicial: some de vez depois da primeira abertura.
      widget.querySelector('.viva-button-badge')?.remove();
      addMessage('Oi! Eu sou a Aninha, assistente virtual do Instituto CVB 💚 Posso te ajudar a conhecer nossos projetos, como ajudar, voluntariado, a rifa solidária ou qualquer dúvida sobre o instituto. Pode perguntar!', 'bot');
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
  mostrarRetornoDoPagamento();
  if (window.location.hash) {
    const alvo = document.querySelector(window.location.hash);
    if (alvo) setTimeout(() => alvo.scrollIntoView({ block: 'start' }), 50);
  }
});
