// =====================================================================
// Painel admin do Instituto CVB. Cada aba escreve direto nas tabelas do
// Supabase que o site público lê — não precisa subir nada no GitHub
// pra refletir uma alteração de conteúdo.
// =====================================================================

const SECTION_LABELS = {
  conteudo_institucional: 'Conteúdo Institucional',
  projetos: 'Projetos',
  eventos_transparencia: 'Eventos & Transparência',
  parceiros: 'Parceiros',
  blog: 'Blog',
  banners: 'Banners',
  campanhas: 'Vaquinhas',
  rifa: 'Rifa',
};

const EDGE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

let CURRENT_PROFILE = null;
let CURRENT_SECTIONS = [];
let ACTIVE_TAB = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'admin-login.html';
    return null;
  }
  return session;
}

async function uploadImage(file) {
  const path = `uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  const { error } = await supabaseClient.storage.from('media').upload(path, file);
  if (error) throw error;
  const { data } = supabaseClient.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}

async function init() {
  const session = await requireSession();
  if (!session) return;

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    document.getElementById('adminContent').innerHTML = `<div class="admin-error">Não foi possível carregar seu perfil. Fale com o admin master.</div>`;
    return;
  }
  CURRENT_PROFILE = profile;
  document.getElementById('userLabel').textContent = `${profile.nome} (${profile.role === 'master' ? 'admin master' : 'editor'})`;

  if (profile.role === 'master') {
    CURRENT_SECTIONS = Object.keys(SECTION_LABELS);
  } else {
    const { data: perms } = await supabaseClient
      .from('section_permissions')
      .select('section')
      .eq('profile_id', session.user.id);
    CURRENT_SECTIONS = (perms || []).map(p => p.section);
  }

  renderTabs();
}

function renderTabs() {
  const tabsEl = document.getElementById('adminTabs');
  const tabs = CURRENT_SECTIONS.map(s => ({ key: s, label: SECTION_LABELS[s] }));
  if (CURRENT_PROFILE.role === 'master') tabs.push({ key: 'usuarios', label: 'Usuários' });

  if (tabs.length === 0) {
    document.getElementById('adminContent').innerHTML = `<div class="admin-error">Você ainda não tem nenhuma permissão de acesso. Fale com o admin master.</div>`;
    return;
  }

  tabsEl.innerHTML = tabs.map(t => `<button class="admin-tab" data-tab="${t.key}">${t.label}</button>`).join('');
  tabsEl.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
  });
  selectTab(tabs[0].key);
}

function selectTab(key) {
  ACTIVE_TAB = key;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === key));
  const content = document.getElementById('adminContent');
  content.innerHTML = 'Carregando...';

  if (key === 'conteudo_institucional') return renderConteudoInstitucional(content);
  if (key === 'projetos') return renderCrud(content, PROJETOS_CONFIG);
  if (key === 'eventos_transparencia') return renderCrud(content, EVENTOS_CONFIG);
  if (key === 'parceiros') return renderCrud(content, PARCEIROS_CONFIG);
  if (key === 'blog') return renderCrud(content, BLOG_CONFIG);
  if (key === 'banners') return renderCrud(content, BANNERS_CONFIG);
  if (key === 'campanhas') return renderCrud(content, CAMPANHAS_CONFIG);
  if (key === 'rifa') return renderRifa(content);
  if (key === 'usuarios') return renderUsuarios(content);
}

// =====================================================================
// CONTEÚDO INSTITUCIONAL (hero, stats, sobre, voluntariado, doar,
// contato, missão/visão/valores)
// =====================================================================
async function renderConteudoInstitucional(content) {
  const [{ data: blocksRows }, { data: mvvRows }] = await Promise.all([
    supabaseClient.from('content_blocks').select('key, value'),
    supabaseClient.from('mvv').select('*').order('ordem'),
  ]);
  const blocks = {};
  (blocksRows || []).forEach(r => { blocks[r.key] = r.value; });
  const hero = blocks.hero || {};
  const stats = blocks.stats || [{}, {}, {}, {}];
  const sobre = blocks.sobre || {};
  const voluntariado = blocks.voluntariado || {};
  const doar = blocks.doar || {};
  const contato = blocks.contato || {};
  const pix = blocks.pix || {};
  const mvv = mvvRows || [];

  content.innerHTML = `
    <div id="feedback"></div>

    <h3>Hero (topo do site)</h3>
    <div class="admin-field"><label>Chamada (eyebrow)</label><input id="hero_eyebrow" value="${escapeHtml(hero.eyebrow)}"></div>
    <div class="admin-field"><label>Título</label><input id="hero_titulo" value="${escapeHtml(hero.titulo)}"></div>
    <div class="admin-field"><label>Texto</label><textarea id="hero_texto" rows="3">${escapeHtml(hero.texto)}</textarea></div>
    <div class="admin-field"><label>Botão principal</label><input id="hero_cta_primario" value="${escapeHtml(hero.cta_primario)}"></div>
    <div class="admin-field"><label>Botão secundário</label><input id="hero_cta_secundario" value="${escapeHtml(hero.cta_secundario)}"></div>

    <h3>Números (stats)</h3>
    ${[0, 1, 2, 3].map(i => `
      <div class="admin-field" style="display:flex; gap:10px;">
        <input id="stat_num_${i}" placeholder="Número" value="${escapeHtml(stats[i]?.numero)}" style="flex:1;">
        <input id="stat_label_${i}" placeholder="Legenda" value="${escapeHtml(stats[i]?.label)}" style="flex:2;">
      </div>
    `).join('')}

    <h3>Sobre</h3>
    <div class="admin-field"><label>Chamada (eyebrow)</label><input id="sobre_eyebrow" value="${escapeHtml(sobre.eyebrow)}"></div>
    <div class="admin-field"><label>Título</label><input id="sobre_titulo" value="${escapeHtml(sobre.titulo)}"></div>
    <div class="admin-field"><label>Texto</label><textarea id="sobre_texto" rows="3">${escapeHtml(sobre.texto)}</textarea></div>

    <h3>Missão / Visão / Valores</h3>
    <p class="admin-hint">Pode usar imagem (cole a URL/nome do arquivo) ou texto — se a imagem estiver preenchida, ela tem prioridade.</p>
    ${mvv.map(m => `
      <div class="admin-field">
        <label>${escapeHtml(m.titulo)} — imagem</label>
        <input id="mvv_img_${m.id}" value="${escapeHtml(m.imagem_url)}" placeholder="ex: missao.png ou URL">
      </div>
      <div class="admin-field">
        <label>${escapeHtml(m.titulo)} — texto (usado só se a imagem acima estiver vazia)</label>
        <textarea id="mvv_texto_${m.id}" rows="2">${escapeHtml(m.texto)}</textarea>
      </div>
    `).join('')}

    <h3>Voluntariado</h3>
    <div class="admin-field"><label>Chamada</label><input id="vol_eyebrow" value="${escapeHtml(voluntariado.eyebrow)}"></div>
    <div class="admin-field"><label>Título</label><input id="vol_titulo" value="${escapeHtml(voluntariado.titulo)}"></div>
    <div class="admin-field"><label>Texto</label><textarea id="vol_texto" rows="3">${escapeHtml(voluntariado.texto)}</textarea></div>

    <h3>Como Ajudar / Doar</h3>
    <div class="admin-field"><label>Chamada</label><input id="doar_eyebrow" value="${escapeHtml(doar.eyebrow)}"></div>
    <div class="admin-field"><label>Título</label><input id="doar_titulo" value="${escapeHtml(doar.titulo)}"></div>
    <div class="admin-field"><label>Texto</label><textarea id="doar_texto" rows="3">${escapeHtml(doar.texto)}</textarea></div>

    <h3>Contato</h3>
    <div class="admin-field"><label>E-mail</label><input id="contato_email" value="${escapeHtml(contato.email)}"></div>
    <div class="admin-field"><label>WhatsApp (só números, com DDI+DDD)</label><input id="contato_whatsapp" value="${escapeHtml(contato.whatsapp)}"></div>
    <div class="admin-field"><label>WhatsApp (exibição)</label><input id="contato_whatsapp_display" value="${escapeHtml(contato.whatsapp_display)}"></div>
    <div class="admin-field"><label>Instagram</label><input id="contato_instagram" value="${escapeHtml(contato.instagram)}"></div>

    <h3>Pix (usado na Rifa e no reforço da seção Doar)</h3>
    <div class="admin-field"><label>Chave Pix</label><input id="pix_chave" value="${escapeHtml(pix.chave)}"></div>
    <div class="admin-field"><label>Tipo da chave</label><input id="pix_tipo" value="${escapeHtml(pix.tipo)}" placeholder="ex: CNPJ, e-mail, telefone, aleatória"></div>
    <div class="admin-field"><label>Nome do beneficiário</label><input id="pix_nome_beneficiario" value="${escapeHtml(pix.nome_beneficiario)}"></div>

    <button class="btn btn-primary" id="saveConteudoBtn">Salvar tudo</button>
  `;

  document.getElementById('saveConteudoBtn').addEventListener('click', async () => {
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = '';
    const val = (id) => document.getElementById(id).value;

    const updates = [
      { key: 'hero', value: { eyebrow: val('hero_eyebrow'), titulo: val('hero_titulo'), texto: val('hero_texto'), cta_primario: val('hero_cta_primario'), cta_secundario: val('hero_cta_secundario') } },
      { key: 'stats', value: [0, 1, 2, 3].map(i => ({ numero: val(`stat_num_${i}`), label: val(`stat_label_${i}`) })) },
      { key: 'sobre', value: { eyebrow: val('sobre_eyebrow'), titulo: val('sobre_titulo'), texto: val('sobre_texto') } },
      { key: 'voluntariado', value: { eyebrow: val('vol_eyebrow'), titulo: val('vol_titulo'), texto: val('vol_texto'), whatsapp_texto: voluntariado.whatsapp_texto || '' } },
      { key: 'doar', value: { eyebrow: val('doar_eyebrow'), titulo: val('doar_titulo'), texto: val('doar_texto'), whatsapp_texto: doar.whatsapp_texto || '' } },
      { key: 'contato', value: { email: val('contato_email'), whatsapp: val('contato_whatsapp'), whatsapp_display: val('contato_whatsapp_display'), instagram: val('contato_instagram') } },
      { key: 'pix', value: { chave: val('pix_chave'), tipo: val('pix_tipo'), nome_beneficiario: val('pix_nome_beneficiario') } },
    ];

    const { error: blocksError } = await supabaseClient.from('content_blocks').upsert(updates);

    const mvvUpdates = mvv.map(m => ({
      id: m.id,
      titulo: m.titulo,
      ordem: m.ordem,
      imagem_url: val(`mvv_img_${m.id}`) || null,
      texto: val(`mvv_texto_${m.id}`),
    }));
    const { error: mvvError } = await supabaseClient.from('mvv').upsert(mvvUpdates);

    if (blocksError || mvvError) {
      feedback.innerHTML = `<div class="admin-error">Erro ao salvar: ${escapeHtml((blocksError || mvvError).message)}</div>`;
    } else {
      feedback.innerHTML = `<div class="admin-success">Salvo! As mudanças já aparecem no site.</div>`;
    }
  });
}

// =====================================================================
// CRUD genérico (Projetos, Eventos, Parceiros, Blog)
// =====================================================================
const PROJETOS_CONFIG = {
  table: 'projetos',
  title: 'Projetos',
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'descricao', label: 'Descrição', type: 'textarea', required: true },
    { name: 'cor', label: 'Cor', type: 'select', options: ['green', 'blue', 'teal', 'yellow'] },
    { name: 'ordem', label: 'Ordem', type: 'number', default: 0 },
    { name: 'ativo', label: 'Ativo (aparece no site)', type: 'checkbox', default: true },
  ],
  listLabel: (row) => row.titulo,
  listMeta: (row) => row.ativo === false ? 'inativo' : row.cor,
};

const EVENTOS_CONFIG = {
  table: 'eventos',
  title: 'Eventos & Transparência',
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'categoria', label: 'Categoria', type: 'text', required: true },
    { name: 'cor', label: 'Cor do selo', type: 'select', options: ['green', 'blue', 'teal', 'yellow'] },
    { name: 'data', label: 'Data (texto, ex: Junho de 2026)', type: 'text' },
    { name: 'capa_url', label: 'Foto de capa', type: 'image' },
    { name: 'fotos', label: 'Fotos (galeria do evento)', type: 'images' },
    { name: 'descricao', label: 'Relato do evento', type: 'textarea' },
    { name: 'arrecadado', label: 'Arrecadado (R$)', type: 'number', default: 0 },
    { name: 'gasto', label: 'Gasto (R$)', type: 'number', default: 0 },
    { name: 'destino_gasto', label: 'Como o valor foi utilizado', type: 'textarea' },
    { name: 'ordem', label: 'Ordem', type: 'number', default: 0 },
  ],
  listLabel: (row) => row.titulo,
  listMeta: (row) => `${row.categoria} · arrecadado ${Number(row.arrecadado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
};

const PARCEIROS_CONFIG = {
  table: 'parceiros',
  title: 'Parceiros',
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true },
    { name: 'logo_url', label: 'Logo', type: 'image' },
    { name: 'ordem', label: 'Ordem', type: 'number', default: 0 },
  ],
  listLabel: (row) => row.nome,
  listMeta: () => '',
};

const BLOG_CONFIG = {
  table: 'blog_posts',
  title: 'Blog',
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'resumo', label: 'Resumo (aparece no card)', type: 'textarea', required: true },
    { name: 'corpo', label: 'Corpo completo (opcional)', type: 'textarea' },
    { name: 'data', label: 'Data', type: 'date' },
    { name: 'ordem', label: 'Ordem', type: 'number', default: 0 },
  ],
  listLabel: (row) => row.titulo,
  listMeta: (row) => row.data || '',
};

const BANNERS_CONFIG = {
  table: 'banners',
  title: 'Banners (carrossel de campanhas)',
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'texto', label: 'Texto', type: 'textarea' },
    { name: 'imagem_url', label: 'Imagem de fundo', type: 'image' },
    { name: 'botao_texto', label: 'Texto do botão', type: 'text' },
    { name: 'botao_link', label: 'Link do botão (URL ou #ancora, ex: #rifa)', type: 'text' },
    { name: 'ordem', label: 'Ordem', type: 'number', default: 0 },
    { name: 'ativo', label: 'Ativo (aparece no site)', type: 'checkbox', default: true },
  ],
  listLabel: (row) => row.titulo,
  listMeta: (row) => row.ativo === false ? 'inativo' : (row.botao_link || ''),
};

const CAMPANHAS_CONFIG = {
  table: 'campanhas',
  title: 'Vaquinhas',
  fields: [
    { name: 'titulo', label: 'Título', type: 'text', required: true },
    { name: 'descricao', label: 'Descrição', type: 'textarea', required: true },
    { name: 'meta', label: 'Meta (R$, deixe em branco se não tiver meta definida)', type: 'number' },
    { name: 'arrecadado', label: 'Arrecadado até agora (R$) — atualize conforme as doações chegam', type: 'number', default: 0 },
    { name: 'fotos', label: 'Fotos', type: 'images' },
    { name: 'video_url', label: 'Vídeo (URL do YouTube/Instagram, opcional)', type: 'text' },
    { name: 'whatsapp_texto', label: 'Mensagem pré-pronta do botão "Quero ajudar" (WhatsApp)', type: 'textarea' },
    { name: 'ordem', label: 'Ordem', type: 'number', default: 0 },
    { name: 'ativa', label: 'Ativa (aparece no site)', type: 'checkbox', default: true },
  ],
  listLabel: (row) => row.titulo,
  listMeta: (row) => row.ativa === false ? 'inativa' : `arrecadado ${Number(row.arrecadado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${row.meta ? ' de ' + Number(row.meta).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}`,
};

function fieldHtml(field, value, prefix) {
  const id = `${prefix}_${field.name}`;
  const v = value === undefined || value === null ? (field.default ?? '') : value;

  if (field.type === 'textarea') {
    return `<div class="admin-field"><label>${escapeHtml(field.label)}</label><textarea id="${id}" rows="3">${escapeHtml(v)}</textarea></div>`;
  }
  if (field.type === 'select') {
    return `<div class="admin-field"><label>${escapeHtml(field.label)}</label><select id="${id}">${field.options.map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
  }
  if (field.type === 'checkbox') {
    return `<div class="admin-checkbox-row"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}><label for="${id}">${escapeHtml(field.label)}</label></div>`;
  }
  if (field.type === 'number') {
    return `<div class="admin-field"><label>${escapeHtml(field.label)}</label><input type="number" id="${id}" value="${v}" step="0.01"></div>`;
  }
  if (field.type === 'date') {
    return `<div class="admin-field"><label>${escapeHtml(field.label)}</label><input type="date" id="${id}" value="${escapeHtml(v)}"></div>`;
  }
  if (field.type === 'image') {
    return `
      <div class="admin-field">
        <label>${escapeHtml(field.label)}</label>
        <input type="text" id="${id}" value="${escapeHtml(v)}" placeholder="URL ou nome de arquivo já existente no site">
        <input type="file" id="${id}_file" accept="image/*" style="margin-top:6px;">
      </div>
    `;
  }
  if (field.type === 'images') {
    const list = Array.isArray(v) ? v.join('\n') : (v || '');
    return `
      <div class="admin-field">
        <label>${escapeHtml(field.label)} (uma URL/arquivo por linha)</label>
        <textarea id="${id}" rows="3">${escapeHtml(list)}</textarea>
        <input type="file" id="${id}_file" accept="image/*" multiple style="margin-top:6px;">
      </div>
    `;
  }
  return `<div class="admin-field"><label>${escapeHtml(field.label)}</label><input type="text" id="${id}" value="${escapeHtml(v)}"></div>`;
}

async function readFieldValue(field, prefix) {
  const id = `${prefix}_${field.name}`;
  const el = document.getElementById(id);

  if (field.type === 'checkbox') return el.checked;
  if (field.type === 'number') return el.value === '' ? 0 : Number(el.value);

  if (field.type === 'image') {
    const fileInput = document.getElementById(`${id}_file`);
    if (fileInput && fileInput.files[0]) {
      return await uploadImage(fileInput.files[0]);
    }
    return el.value;
  }

  if (field.type === 'images') {
    let lines = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    const fileInput = document.getElementById(`${id}_file`);
    if (fileInput && fileInput.files.length) {
      for (const file of fileInput.files) {
        lines.push(await uploadImage(file));
      }
    }
    return lines;
  }

  return el.value;
}

async function renderCrud(content, config) {
  const { data: rows, error } = await supabaseClient.from(config.table).select('*').order('ordem', { ascending: true, nullsFirst: false });

  if (error) {
    content.innerHTML = `<div class="admin-error">Erro ao carregar: ${escapeHtml(error.message)}</div>`;
    return;
  }

  content.innerHTML = `
    <h3>${config.title}</h3>
    <div id="feedback"></div>
    <div id="crudList">
      ${(rows || []).map(row => `
        <div class="admin-list-item">
          <div>
            <strong>${escapeHtml(config.listLabel(row))}</strong>
            <div class="meta">${escapeHtml(config.listMeta(row))}</div>
          </div>
          <div class="admin-actions">
            <button class="admin-btn-sm admin-btn-edit" data-edit="${row.id}">Editar</button>
            <button class="admin-btn-sm admin-btn-danger" data-delete="${row.id}">Excluir</button>
          </div>
        </div>
      `).join('') || '<p class="admin-hint">Nada cadastrado ainda.</p>'}
    </div>

    <h3 id="formTitle">Adicionar novo</h3>
    <div id="crudForm"></div>
    <button class="btn btn-primary" id="crudSaveBtn">Salvar</button>
    <button class="btn btn-outline" id="crudCancelBtn" style="display:none; margin-left:10px;">Cancelar edição</button>
  `;

  let editingId = null;

  function renderForm(row) {
    document.getElementById('crudForm').innerHTML = config.fields.map(f => fieldHtml(f, row ? row[f.name] : undefined, 'crud')).join('');
    document.getElementById('formTitle').textContent = row ? `Editando: ${config.listLabel(row)}` : 'Adicionar novo';
    document.getElementById('crudCancelBtn').style.display = row ? 'inline-flex' : 'none';
  }
  renderForm(null);

  document.getElementById('crudCancelBtn').addEventListener('click', () => {
    editingId = null;
    renderForm(null);
  });

  content.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = rows.find(r => String(r.id) === btn.dataset.edit);
      editingId = row.id;
      renderForm(row);
      window.scrollTo({ top: document.getElementById('formTitle').offsetTop - 20, behavior: 'smooth' });
    });
  });

  content.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Tem certeza que quer excluir?')) return;
      const { error: delError } = await supabaseClient.from(config.table).delete().eq('id', btn.dataset.delete);
      if (delError) {
        document.getElementById('feedback').innerHTML = `<div class="admin-error">${escapeHtml(delError.message)}</div>`;
      } else {
        renderCrud(content, config);
      }
    });
  });

  document.getElementById('crudSaveBtn').addEventListener('click', async () => {
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = 'Salvando...';
    try {
      const payload = {};
      for (const f of config.fields) {
        payload[f.name] = await readFieldValue(f, 'crud');
      }
      let saveError;
      if (editingId) {
        ({ error: saveError } = await supabaseClient.from(config.table).update(payload).eq('id', editingId));
      } else {
        ({ error: saveError } = await supabaseClient.from(config.table).insert(payload));
      }
      if (saveError) {
        feedback.innerHTML = `<div class="admin-error">${escapeHtml(saveError.message)}</div>`;
      } else {
        feedback.innerHTML = `<div class="admin-success">Salvo!</div>`;
        editingId = null;
        renderCrud(content, config);
      }
    } catch (err) {
      feedback.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
    }
  });
}

// =====================================================================
// RIFA — criar rifas, ver a grade de números, confirmar pagamentos
// (fluxo manual: a pessoa reserva no site, paga por Pix e manda
// comprovante por WhatsApp; aqui é onde se confirma o pagamento).
// =====================================================================
async function renderRifa(content) {
  const { data: rifas } = await supabaseClient.from('rifas').select('*').order('criado_em', { ascending: false });

  content.innerHTML = `
    <h3>Rifas</h3>
    <div id="feedback"></div>
    <div id="rifasList">
      ${(rifas || []).map(r => `
        <div class="admin-list-item">
          <div>
            <strong>${escapeHtml(r.titulo)}</strong>
            <div class="meta">${escapeHtml(r.status)} · ${r.total_numeros} números a ${Number(r.preco_numero).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
          </div>
          <div class="admin-actions">
            <button class="admin-btn-sm admin-btn-edit" data-manage="${r.id}">Gerenciar</button>
          </div>
        </div>
      `).join('') || '<p class="admin-hint">Nenhuma rifa cadastrada ainda.</p>'}
    </div>
    <div id="rifaDetail"></div>

    <h3>Criar nova rifa</h3>
    <div class="admin-field"><label>Título</label><input id="newrifa_titulo" placeholder="ex: Rifa Solidária — Bike Elétrica"></div>
    <div class="admin-field"><label>Descrição</label><textarea id="newrifa_descricao" rows="3"></textarea></div>
    <div class="admin-field"><label>Imagem do prêmio</label><input type="text" id="newrifa_premio_imagem_url" placeholder="URL ou nome de arquivo"><input type="file" id="newrifa_premio_imagem_url_file" accept="image/*" style="margin-top:6px;"></div>
    <div class="admin-field"><label>Preço por número (R$)</label><input type="number" id="newrifa_preco" value="20" step="0.01"></div>
    <div class="admin-field"><label>Total de números</label><input type="number" id="newrifa_total" value="1000" step="1"></div>
    <button class="btn btn-primary" id="createRifaBtn">Criar rifa</button>
  `;

  content.querySelectorAll('[data-manage]').forEach(btn => {
    btn.addEventListener('click', () => renderRifaDetail(rifas.find(r => r.id === btn.dataset.manage)));
  });

  document.getElementById('createRifaBtn').addEventListener('click', async () => {
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = 'Criando...';
    try {
      let imagemUrl = document.getElementById('newrifa_premio_imagem_url').value;
      const fileInput = document.getElementById('newrifa_premio_imagem_url_file');
      if (fileInput.files[0]) imagemUrl = await uploadImage(fileInput.files[0]);

      const total = Number(document.getElementById('newrifa_total').value) || 0;
      const { data: novaRifa, error: rifaError } = await supabaseClient.from('rifas').insert({
        titulo: document.getElementById('newrifa_titulo').value,
        descricao: document.getElementById('newrifa_descricao').value,
        premio_imagem_url: imagemUrl || null,
        preco_numero: Number(document.getElementById('newrifa_preco').value) || 0,
        total_numeros: total,
        status: 'ativa',
      }).select().single();

      if (rifaError) throw rifaError;

      const { error: bilhetesError } = await supabaseClient.rpc('criar_bilhetes_rifa', { p_rifa_id: novaRifa.id, p_total: total });
      if (bilhetesError) throw bilhetesError;

      feedback.innerHTML = `<div class="admin-success">Rifa criada com ${total} números!</div>`;
      renderRifa(content);
    } catch (err) {
      feedback.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
    }
  });
}

async function renderRifaDetail(rifa) {
  const detail = document.getElementById('rifaDetail');
  detail.innerHTML = 'Carregando...';

  const [{ data: bilhetes }, { data: livres }] = await Promise.all([
    supabaseClient.from('rifa_bilhetes').select('*').eq('rifa_id', rifa.id).order('numero'),
    supabaseClient.from('rifa_contribuicoes_livres').select('*').eq('rifa_id', rifa.id).order('created_at', { ascending: false }),
  ]);

  const disponiveis = bilhetes.filter(b => b.status === 'disponivel').length;
  const reservados = bilhetes.filter(b => b.status === 'reservado');
  const pagos = bilhetes.filter(b => b.status === 'pago');
  const livresConfirmadas = (livres || []).filter(l => l.status === 'confirmado');
  const livresPendentes = (livres || []).filter(l => l.status === 'pendente');
  const totalArrecadado = pagos.length * Number(rifa.preco_numero) + livresConfirmadas.reduce((s, l) => s + Number(l.valor), 0);

  const statusColor = { disponivel: '#dfe6ee', reservado: '#F5B400', pago: '#3E7A1A' };

  detail.innerHTML = `
    <h3>${escapeHtml(rifa.titulo)}</h3>
    <p class="admin-hint">Disponíveis: ${disponiveis} · Reservados: ${reservados.length} · Pagos: ${pagos.length} · Arrecadado: ${totalArrecadado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>

    <h4>Reservas aguardando confirmação de pagamento</h4>
    ${reservados.length === 0 ? '<p class="admin-hint">Nenhuma no momento.</p>' : reservados.map(b => `
      <div class="admin-list-item">
        <div>
          <strong>Número ${String(b.numero).padStart(3, '0')}</strong>
          <div class="meta">${escapeHtml(b.comprador_nome)} · ${escapeHtml(b.comprador_telefone)} · reservado ${new Date(b.reservado_em).toLocaleString('pt-BR')}</div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn-sm admin-btn-edit" data-confirm-bilhete="${b.id}">Confirmar pagamento</button>
        </div>
      </div>
    `).join('')}

    <h4>Doações livres aguardando confirmação</h4>
    ${livresPendentes.length === 0 ? '<p class="admin-hint">Nenhuma no momento.</p>' : livresPendentes.map(l => `
      <div class="admin-list-item">
        <div>
          <strong>${l.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
          <div class="meta">${escapeHtml(l.nome)} · ${escapeHtml(l.telefone)} · ${new Date(l.created_at).toLocaleString('pt-BR')}</div>
        </div>
        <div class="admin-actions">
          <button class="admin-btn-sm admin-btn-edit" data-confirm-livre="${l.id}">Confirmar</button>
        </div>
      </div>
    `).join('')}

    <h4>Grade de números</h4>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(28px, 1fr)); gap:3px; max-width:700px;">
      ${bilhetes.map(b => `<div title="${String(b.numero).padStart(3, '0')} — ${b.status}" style="aspect-ratio:1; border-radius:4px; background:${statusColor[b.status]};"></div>`).join('')}
    </div>
  `;

  detail.querySelectorAll('[data-confirm-bilhete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const { error } = await supabaseClient.from('rifa_bilhetes').update({
        status: 'pago', confirmado_por: session.user.id, confirmado_em: new Date().toISOString(),
      }).eq('id', btn.dataset.confirmBilhete);
      if (!error) renderRifaDetail(rifa);
    });
  });

  detail.querySelectorAll('[data-confirm-livre]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const { error } = await supabaseClient.from('rifa_contribuicoes_livres').update({
        status: 'confirmado', confirmado_por: session.user.id, confirmado_em: new Date().toISOString(),
      }).eq('id', btn.dataset.confirmLivre);
      if (!error) renderRifaDetail(rifa);
    });
  });
}

// =====================================================================
// USUÁRIOS (só admin master)
// =====================================================================
async function renderUsuarios(content) {
  const { data: profiles } = await supabaseClient.from('profiles').select('*').order('criado_em');
  const { data: allPerms } = await supabaseClient.from('section_permissions').select('*');

  const permsByProfile = {};
  (allPerms || []).forEach(p => {
    permsByProfile[p.profile_id] = permsByProfile[p.profile_id] || [];
    permsByProfile[p.profile_id].push(p.section);
  });

  content.innerHTML = `
    <h3>Usuários</h3>
    <div id="feedback"></div>
    <div id="usersList">
      ${(profiles || []).map(p => `
        <div class="admin-list-item">
          <div>
            <strong>${escapeHtml(p.nome)}</strong>
            <div class="meta">${p.role === 'master' ? 'Admin master (acesso total)' : (permsByProfile[p.id] || []).map(s => SECTION_LABELS[s]).join(', ') || 'sem permissões'}</div>
          </div>
          <div class="admin-actions">
            ${p.id === CURRENT_PROFILE.id ? '<span class="meta">(você)</span>' : `<button class="admin-btn-sm admin-btn-danger" data-remove="${p.id}">Remover</button>`}
          </div>
        </div>
      `).join('')}
    </div>

    <h3>Cadastrar novo usuário</h3>
    <div class="admin-field"><label>Nome</label><input id="newuser_nome"></div>
    <div class="admin-field"><label>E-mail</label><input id="newuser_email" type="email"></div>
    <div class="admin-field"><label>Senha (mínimo 8 caracteres)</label><input id="newuser_password" type="text"></div>
    <div class="admin-field">
      <label>Tipo de acesso</label>
      <select id="newuser_role">
        <option value="editor">Editor (só seções escolhidas abaixo)</option>
        <option value="master">Admin master (acesso total, inclusive cadastrar usuários)</option>
      </select>
    </div>
    <div id="newuser_sections_wrap">
      <label style="display:block; font-size:13px; font-weight:600; margin-bottom:8px; color:var(--gray);">Seções que esse usuário pode editar</label>
      ${Object.entries(SECTION_LABELS).map(([key, label]) => `
        <div class="admin-checkbox-row">
          <input type="checkbox" id="newuser_section_${key}" value="${key}">
          <label for="newuser_section_${key}">${label}</label>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-primary" id="createUserBtn">Cadastrar usuário</button>
  `;

  document.getElementById('newuser_role').addEventListener('change', (e) => {
    document.getElementById('newuser_sections_wrap').style.display = e.target.value === 'master' ? 'none' : 'block';
  });

  content.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover esse usuário? Ele perde o acesso imediatamente.')) return;
      const { data: { session } } = await supabaseClient.auth.getSession();
      const res = await fetch(`${EDGE_FUNCTIONS_URL}/admin-delete-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: btn.dataset.remove }),
      });
      const result = await res.json();
      const feedback = document.getElementById('feedback');
      if (!res.ok) {
        feedback.innerHTML = `<div class="admin-error">${escapeHtml(result.error)}</div>`;
      } else {
        renderUsuarios(content);
      }
    });
  });

  document.getElementById('createUserBtn').addEventListener('click', async () => {
    const feedback = document.getElementById('feedback');
    feedback.innerHTML = 'Cadastrando...';
    const nome = document.getElementById('newuser_nome').value.trim();
    const email = document.getElementById('newuser_email').value.trim();
    const password = document.getElementById('newuser_password').value;
    const role = document.getElementById('newuser_role').value;
    const sections = Object.keys(SECTION_LABELS).filter(key => document.getElementById(`newuser_section_${key}`).checked);

    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(`${EDGE_FUNCTIONS_URL}/admin-create-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ nome, email, password, role, sections }),
    });
    const result = await res.json();
    if (!res.ok) {
      feedback.innerHTML = `<div class="admin-error">${escapeHtml(result.error)}</div>`;
    } else {
      feedback.innerHTML = `<div class="admin-success">Usuário cadastrado!</div>`;
      renderUsuarios(content);
    }
  });
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'admin-login.html';
});

init();
