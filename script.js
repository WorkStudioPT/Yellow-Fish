// ╔══════════════════════════════════════════════════════════╗
// ║  CONFIGURAÇÃO SUPABASE — muda estas duas linhas          ║
// ║  Settings > API > Project URL  e  anon/public key        ║
// ╚══════════════════════════════════════════════════════════╝
const SUPABASE_URL = "https://ymvbiprvqulecawiuscj.supabase.co";
const SUPABASE_KEY = "sb_publishable_tU1FQVAf25yXDS2jZ8tA2Q_vSmEqbvW";

const { createClient } = supabase; 
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Estado global ─────────────────────────────────────────
let historico = [];
let idEmEdicao = null;
let currentUser = null;

// Modos ativos por tab: 'Compra' ou 'Venda'
let clienteMode = "Compra";
let patraoMode = "Venda";

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════

async function doLogin() {
  const email = document.getElementById("auth-email").value.trim();
  const pass  = document.getElementById("auth-pass").value;
  setLoginError("");

  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) return setLoginError("❌ " + error.message);
}

async function doRegister() {
  const email = document.getElementById("auth-email").value.trim();
  const pass  = document.getElementById("auth-pass").value;
  setLoginError("");

  if (pass.length < 6) return setLoginError("❌ A palavra-passe deve ter pelo menos 6 caracteres.");

  const { error } = await db.auth.signUp({ email, password: pass });
  if (error) return setLoginError("❌ " + error.message);
  setLoginError("✅ Conta criada! Verifica o teu email para confirmar.", "success");
}

async function doReset() {
  const email = document.getElementById("auth-email").value.trim();
  if (!email) return setLoginError("❌ Insere o teu email primeiro.");
  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error) return setLoginError("❌ " + error.message);
  setLoginError("✅ Email de recuperação enviado!", "success");
}

async function doLogout() {
  await db.auth.signOut();
}

function setLoginError(msg, type = "error") {
  const el = document.getElementById("login-error");
  el.style.display = msg ? "block" : "none";
  el.textContent = msg;
  el.className = "login-error " + (type === "success" ? "login-success" : "");
}

// Mostra app ou login consoante o estado da sessão
async function mostrarEcra(session) {
  if (session?.user) {
    currentUser = session.user;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "block";
    
    await loadFromSupabase(); // 1. Vai buscar os dados à BD
    renderAllTables();        // 2. Só agora desenha no ecrã
  } else {
    currentUser = null;
    historico = [];
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("app-screen").style.display = "none";
  }
}

async function initAuth() {
  // 1. Verifica se já existe uma sessão guardada nos cookies assim que a página abre
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    console.log("Sessão recuperada no refresh:", session.user.email);
    await mostrarEcra(session);
  } else {
    await mostrarEcra(null);
  }

  // 2. Mantém o listener para mudanças futuras (login/logout)
  db.auth.onAuthStateChange(async (event, session) => {
    console.log("[Auth event]", event, session?.user?.email ?? "sem sessão");
    
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      await mostrarEcra(session);
    } else if (event === "SIGNED_OUT") {
      await mostrarEcra(null);
    }
  });
}

// ══════════════════════════════════════════════════════════
//  SUPABASE — CRUD
// ══════════════════════════════════════════════════════════

async function loadFromSupabase() {
  const { data, error } = await db
    .from("transacoes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro:", error);
    return;
  }
  
  // Isto garante que a variável global é preenchida
  historico = data || []; 
  console.log("Registos carregados:", historico.length);
}

async function insertSupabase(pedido) {
  const { data, error } = await db
    .from("transacoes")
    .insert([{
      user_id:  currentUser.id,
      data:     pedido.data,
      entidade: pedido.entidade,
      tipo:     pedido.tipo,
      detalhes: pedido.detalhes,
      total:    pedido.total,
    }])
    .select()
    .single();

  if (error) { alert("Erro Supabase: " + error.message); return null; }
  return data;
}

async function updateSupabase(id, campos) {
  const { error } = await db
    .from("transacoes")
    .update(campos)
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) { alert("Erro ao atualizar: " + error.message); return false; }
  return true;
}

async function deleteSupabase(id) {
  const { error } = await db
    .from("transacoes")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) { alert("Erro ao apagar: " + error.message); return false; }
  return true;
}

// ══════════════════════════════════════════════════════════
//  PREÇOS
// ══════════════════════════════════════════════════════════

const precos = {
  // ─── CLIENTE ──────────────────────────────────
  cliente_compra: {         // nós compramos AO cliente (ele traz peixe)
    Sardinha:  100,
    Robalo:    170,
    Bacalhau:  175,
    Tartaruga: 1200,
    Tubarao:   1700,
    "Plastico/Sucata (Un)": 80,
  },
  cliente_venda: {          // nós vendemos AO cliente (extras / deduções na compra)
    Iscas:      15,
    "Pedaços de Sardinha": 25,
    Cana:      200,
    Redes:     450,
    "Cana Grossa":1000,
  },
  cliente_venda_peixe: {    // nós vendemos peixe AO cliente
    Iscas:      15,
    "Pedaços de Sardinha": 25,
    Cana:      200,
    Redes:     450,
    "Cana Grossa": 1000,
  },

  // ─── PATRÃO ──────────────────────────────────
  patrao_compra: {          // nós compramos AO patrão
    "Cana Grossa (Un)":    800,
  },
  patrao_venda: {           // nós vendemos AO patrão
    "Caixa de Sardinha": 14000,
    "Caixa de Robalo":   14500,
    "Caixa de Bacalhau": 20000,
    "Caixa de Tartaruga":65000,
    "Caixa de Tubarao":  90000,
    "Sardinha (Un)":       140,
    "Robalo (Un)":         250,
    "Bacalhau (Un)":       280,
    "Tartaruga (Un)":     1700,
    "Tubarao (Un)":       1800,
    "Plastico/Sucata (Un)": 80,
  },

};

// ══════════════════════════════════════════════════════════
//  UI — TABS / ITEMS / CÁLCULOS
// ══════════════════════════════════════════════════════════

function openTab(tabId, btn) {
  // Guarda a tab atual no armazenamento do navegador
  localStorage.setItem('activeTab', tabId);

  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add("active");
  
  if (btn) {
      btn.classList.add("active");
  } else {
      // Caso a função seja chamada sem o elemento do botão (ex: no refresh), 
      // procura o botão que tem o onclick correspondente
      const allBtns = document.querySelectorAll(".tab-btn");
      allBtns.forEach(b => {
          if (b.getAttribute('onclick')?.includes(tabId)) {
              b.classList.add("active");
          }
      });
  }
  
  renderAllTables();
  // Se for a tab de craft, garante que os dados são renderizados
  if (tabId === 'craft-tab') renderCraftInfo();
}

// ── Modos Cliente ──────────────────────────────────────────
function setClienteMode(mode, btn) {
  clienteMode = mode;
  document.querySelectorAll("#cliente-mode-toggle .mode-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  const isCompra = mode === "Compra";
  document.getElementById("cliente-tab-title").textContent = isCompra ? "Registar Compra a Cliente" : "Registar Venda a Cliente";
  document.getElementById("cliente-add-btn").textContent   = isCompra ? "+ Peixe" : "+ Artigo";
  document.getElementById("extras-section").style.display  = isCompra ? "" : "none";

  // Limpa e re-inicializa itens com a categoria certa
  document.getElementById("compra-items").innerHTML = "";
  document.getElementById("venda-items").innerHTML  = "";
  addClienteItem();
  updateCalculations();
}

function addClienteItem() {
  const cat = clienteMode === "Compra" ? "cliente_compra" : "cliente_venda_peixe";
  addItem("compra-items", cat);
}

// ── Modos Patrão ──────────────────────────────────────────
function setPatraoMode(mode, btn) {
  patraoMode = mode;
  document.querySelectorAll("#patrao-mode-toggle .mode-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  const isCompra = mode === "Compra";
  document.getElementById("patrao-tab-title").textContent = isCompra ? "Registar Compra ao Patrão" : "Registar Venda ao Patrão";
  document.getElementById("patrao-add-btn").textContent   = isCompra ? "+ Adicionar Item" : "+ Adicionar Item";

  document.getElementById("patrao-items").innerHTML = "";
  addPatraoItem();
  updateCalculations();
}

function addPatraoItem() {
  const cat = patraoMode === "Compra" ? "patrao_compra" : "patrao_venda";
  addItem("patrao-items", cat);
}

// 1. Modifica a função addItem para incluir um marcador de preço por linha
function addItem(containerId, category, nomeSelecionado = null, qty = 1) {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = "row";

  const options = Object.keys(precos[category])
    .map(p => {
      const selected = (nomeSelecionado && p === nomeSelecionado) ? "selected" : "";
      return `<option value="${precos[category][p]}" ${selected}>${p} (${precos[category][p]}$)</option>`;
    }).join("");

  div.innerHTML = `
    <div class="col"><select class="prod-select" onchange="updateCalculations()">
      ${options}
    </select></div>
    <div class="col" style="max-width:80px;"><input type="number" class="prod-qty" value="${qty}" min="1" oninput="updateCalculations()"></div>
    <div class="item-line-total" style="min-width:70px; text-align:right; font-weight:700; color:var(--ocean);">0$</div>
    <button class="remove-btn" onclick="this.parentElement.remove(); updateCalculations();">X</button>`;
  container.appendChild(div);
  updateCalculations();
}

// 2. Atualiza o calcStats para calcular os valores individuais
function calcStats(posId, negId = null) {
  let stats = { dinheiro: 0, peixes: 0, caixas: 0, outros: 0 };
  const process = (selector, mult) => {
    document.querySelectorAll(selector).forEach(r => {
      const sel  = r.querySelector(".prod-select");
      const name = sel.options[sel.selectedIndex].text;
      const qty  = parseInt(r.querySelector(".prod-qty").value) || 0;
      const precoUnitario = parseFloat(sel.value) || 0;
      
      const subtotal = precoUnitario * qty;
      
      // Atualiza o total visual daquela linha específica
      const lineDisplay = r.querySelector(".item-line-total");
      if (lineDisplay) lineDisplay.innerText = `${subtotal.toLocaleString("pt-PT")}$`;

      stats.dinheiro += subtotal * mult;
      
      if (name.toLowerCase().includes("caixa")) stats.caixas += qty;
      else if (name.match(/cana|isca|rede|plástico/i))  stats.outros += qty;
      else stats.peixes += qty;
    });
  };
  process(posId, 1);
  if (negId) process(negId, -1);
  return stats;
}

function updateCalculations() {
  // Processar Cliente
  let resC = calcStats("#compra-items .row", "#venda-items .row");
  document.getElementById("total-cliente").innerText = `${resC.dinheiro.toLocaleString("pt-PT")}$`;
  
  // Criar string detalhada para o total de cada peixe/item
  let detalhesC = `Peixes: ${resC.peixes} | Caixas: ${resC.caixas} | Outros: ${resC.outros}`;
  document.getElementById("stats-cliente").innerText = detalhesC;

  // Processar Patrão
  let resP = calcStats("#patrao-items .row");
  document.getElementById("total-patrao").innerText = `${resP.dinheiro.toLocaleString("pt-PT")}$`;
  document.getElementById("stats-patrao").innerText = `Peixes: ${resP.peixes} | Caixas: ${resP.caixas} | Outros: ${resP.outros}`;
}

function calcStats(posId, negId = null) {
  let stats = { dinheiro: 0, peixes: 0, caixas: 0, outros: 0 };
  
  const process = (selector, mult) => {
    document.querySelectorAll(selector).forEach(r => {
      const sel = r.querySelector(".prod-select");
      const qtyInput = r.querySelector(".prod-qty");
      const lineTotalDisplay = r.querySelector(".item-line-total");
      
      const price = parseFloat(sel.value) || 0;
      const qty = parseInt(qtyInput.value) || 0;
      const lineTotal = price * qty;
      
      // Atualiza o total visual da linha se o elemento existir
      if (lineTotalDisplay) lineTotalDisplay.innerText = `${lineTotal.toLocaleString("pt-PT")}$`;
      
      stats.dinheiro += lineTotal * mult;
      
      const name = sel.options[sel.selectedIndex].text;
      if (name.toLowerCase().includes("caixa")) stats.caixas += qty;
      else if (name.match(/cana|isca|rede|plástico|sucata|pedaços/i)) stats.outros += qty;
      else stats.peixes += qty;
    });
  };

  process(posId, 1);
  if (negId) process(negId, -1);
  return stats;
}

// ══════════════════════════════════════════════════════════
//  GUARDAR / EDITAR
// ══════════════════════════════════════════════════════════

async function saveClienteTransaction() {
  const tipo = clienteMode === "Compra" ? "Cliente-Compra" : "Cliente-Venda";
  await saveTransaction(tipo);
}

async function savePatraoTransaction() {
  const tipo = patraoMode === "Compra" ? "Patrão-Compra" : "Patrão-Venda";
  await saveTransaction(tipo);
}

async function saveTransaction(tipo) {
  const isCliente = tipo.startsWith("Cliente");
  const isPatrao  = tipo.startsWith("Patrão");

  const stats = isCliente
    ? calcStats("#compra-items .row", tipo === "Cliente-Compra" ? "#venda-items .row" : null)
    : calcStats("#patrao-items .row");

  const nome = isCliente
    ? document.getElementById("cliente-nome").value || "Anónimo"
    : document.getElementById("patrao-obs").value  || "Venda Geral";

  let itens = [];
  const extrair = (sel, pre = "") =>
    document.querySelectorAll(sel).forEach(r => {
      const s = r.querySelector(".prod-select");
      itens.push(`${pre}${r.querySelector(".prod-qty").value}x ${s.options[s.selectedIndex].text.split(" (")[0]}`);
    });

  if (isCliente) {
    extrair("#compra-items .row");
    if (tipo === "Cliente-Compra") extrair("#venda-items .row", "[Extra] ");
  } else {
    extrair("#patrao-items .row");
  }

  if (itens.length === 0) return alert("Adicione itens primeiro!");

  if (idEmEdicao) {
    const campos = {
      entidade: nome,
      tipo,
      detalhes: itens.join(" | "),
      total:    stats.dinheiro,
    };
    const ok = await updateSupabase(idEmEdicao, campos);
    if (!ok) return;
    const index = historico.findIndex(p => p.id === idEmEdicao);
    if (index !== -1) Object.assign(historico[index], campos);
    alert("Pedido atualizado!");
  } else {
    const novoPedido = {
      data:     new Date().toLocaleString("pt-PT"),
      entidade: nome,
      tipo,
      detalhes: itens.join(" | "),
      total:    stats.dinheiro,
    };
    const inserted = await insertSupabase(novoPedido);
    if (!inserted) return;
    historico.unshift(inserted);
    alert("Pedido guardado!");
  }

  cancelEdit();
  renderAllTables();
}

async function deleteItem(idPedido) {
  if (!confirm("Desejas apagar apenas este pedido?")) return;
  const ok = await deleteSupabase(idPedido);
  if (!ok) return;
  historico = historico.filter(item => item.id !== idPedido);
  renderAllTables();
}

function editItem(idPedido) {
  const pedido = historico.find(p => p.id === idPedido);
  if (!pedido) return;

  idEmEdicao = idPedido;
  document.getElementById("edit-indicator").style.display = "block";
  document.getElementById("edit-id-label").innerText = pedido.entidade + " (" + pedido.data + ")";

  const isCliente = pedido.tipo.startsWith("Cliente");
  const tabName   = isCliente ? "cliente-tab" : "patrao-tab";
  const btnTab    = document.querySelectorAll(".tab-btn")[isCliente ? 0 : 1];
  openTab(tabName, btnTab);

  document.getElementById("compra-items").innerHTML = "";
  document.getElementById("venda-items").innerHTML  = "";
  document.getElementById("patrao-items").innerHTML = "";

  if (isCliente) {
    // Restaura o modo correto
    const modeBtn = document.querySelector(`#cliente-mode-toggle .mode-btn[data-mode="${pedido.tipo === "Cliente-Venda" ? "Venda" : "Compra"}"]`);
    if (modeBtn) setClienteMode(pedido.tipo === "Cliente-Venda" ? "Venda" : "Compra", modeBtn);

    document.getElementById("cliente-nome").value = pedido.entidade;
    const cat = clienteMode === "Compra" ? "cliente_compra" : "cliente_venda_peixe";
    const { compraItems, vendaItems } = parseDetalhes(pedido.detalhes, pedido.tipo);
    compraItems.forEach(({ nome, qty }) => addItem("compra-items", cat, encontrarNomeNaCategoria(nome, cat), qty));
    if (pedido.tipo === "Cliente-Compra") {
      vendaItems.forEach(({ nome, qty }) => addItem("venda-items", "cliente_venda", encontrarNomeNaCategoria(nome, "cliente_venda"), qty));
    }
    if (compraItems.length === 0) addClienteItem();
  } else {
    // Restaura o modo correto
    const modeBtn = document.querySelector(`#patrao-mode-toggle .mode-btn[data-mode="${pedido.tipo === "Patrão-Venda" ? "Venda" : "Compra"}"]`);
    if (modeBtn) setPatraoMode(pedido.tipo === "Patrão-Venda" ? "Venda" : "Compra", modeBtn);

    document.getElementById("patrao-obs").value = pedido.entidade;
    const cat = patraoMode === "Compra" ? "patrao_compra" : "patrao_venda";
    const { compraItems } = parseDetalhes(pedido.detalhes, pedido.tipo);
    compraItems.forEach(({ nome, qty }) => addItem("patrao-items", cat, encontrarNomeNaCategoria(nome, cat) || encontrarNomeNaCategoria(nome, "patrao"), qty));
    if (compraItems.length === 0) addPatraoItem();
  }

  updateCalculations();
  window.scrollTo(0, 0);
}

function cancelEdit() {
  idEmEdicao = null;
  document.getElementById("edit-indicator").style.display = "none";
  document.getElementById("cliente-nome").value = "";
  document.getElementById("patrao-obs").value   = "";
  document.getElementById("compra-items").innerHTML = "";
  document.getElementById("venda-items").innerHTML  = "";
  document.getElementById("patrao-items").innerHTML = "";
  addClienteItem();
  addPatraoItem();
  updateCalculations();
}

// ══════════════════════════════════════════════════════════
//  TABELAS
// ══════════════════════════════════════════════════════════

function renderAllTables() {
  const fullBody    = document.getElementById("db-body-full");
  const miniCliente = document.getElementById("mini-table-cliente-body");
  const miniPatrao  = document.getElementById("mini-table-patrao-body");

  if (fullBody)    fullBody.innerHTML    = "";
  if (miniCliente) miniCliente.innerHTML = "";
  if (miniPatrao)  miniPatrao.innerHTML  = "";

  historico.forEach(p => {
    const trContent = `
      <td data-label="Data">${p.data}</td>
      <td data-label="Entidade"><strong>${p.entidade}</strong></td>
      <td data-label="Tipo">${p.tipo}</td>
      <td data-label="Detalhes">${p.detalhes}</td>
      <td data-label="Total" class="${p.total >= 0 ? "val-pos" : "val-neg"}">${p.total.toLocaleString("pt-PT")}$</td>
      <td data-label="Ações">
        <button class="btn-edit-row" onclick="editItem(${p.id})">✏️</button>
        <button class="btn-delete-row" onclick="deleteItem(${p.id})">🗑️</button>
      </td>`;

    const row = document.createElement("tr");
    row.innerHTML = trContent;

    if (fullBody)    fullBody.appendChild(row.cloneNode(true));
    if (p.tipo.startsWith("Cliente") && miniCliente && miniCliente.children.length < 5)
      miniCliente.appendChild(row.cloneNode(true));
    if (p.tipo.startsWith("Patrão") && miniPatrao && miniPatrao.children.length < 5)
      miniPatrao.appendChild(row.cloneNode(true));
  });
}

// ══════════════════════════════════════════════════════════
//  PARSE / HELPERS
// ══════════════════════════════════════════════════════════

function parseDetalhes(detalhes, tipo) {
  const partes      = detalhes.split(" | ");
  const compraItems = [];
  const vendaItems  = [];

  partes.forEach(parte => {
    const isExtra = parte.startsWith("[Extra] ");
    const texto   = isExtra ? parte.replace("[Extra] ", "") : parte;
    const match   = texto.match(/^(\d+)x (.+)$/);
    if (!match) return;
    const qty  = parseInt(match[1]);
    const nome = match[2].trim();
    (isExtra ? vendaItems : compraItems).push({ nome, qty });
  });

  return { compraItems, vendaItems };
}

function encontrarNomeNaCategoria(nomeGuardado, categoria) {
  if (precos[categoria][nomeGuardado] !== undefined) return nomeGuardado;
  const chaves = Object.keys(precos[categoria]);
  return chaves.find(k => k.toLowerCase() === nomeGuardado.toLowerCase()) || null;
}

// ══════════════════════════════════════════════════════════
//  CSV EXPORT / IMPORT
// ══════════════════════════════════════════════════════════

function exportCSV() {
  let csv = "\uFEFFData,Entidade,Tipo,Detalhes,Total\n";
  historico.forEach(p => {
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    csv += `${esc(p.data)},${esc(p.entidade)},${esc(p.tipo)},${esc(p.detalhes)},${p.total}\n`;
  });
  const link = document.createElement("a");
  link.href  = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  link.download = "yellow_fish_backup.csv";
  link.click();
}

function detectSeparator(text) {
  const firstLine = text.split(/\r?\n/)[0];
  const semis  = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semis >= commas ? ";" : ",";
}

function parseCSVLine(line, sep) {
  const result = [];
  let current = "", inQuotes = false, i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i+1] === '"') { current += '"'; i += 2; }
      else if (ch === '"') { inQuotes = false; i++; }
      else { current += ch; i++; }
    } else {
      if (ch === '"')     { inQuotes = true; i++; }
      else if (ch === sep){ result.push(current.trim()); current = ""; i++; }
      else                { current += ch; i++; }
    }
  }
  result.push(current.trim());
  return result;
}

async function importCSV(e) {
  const reader = new FileReader();
  reader.onload = async (event) => {
    const text  = event.target.result;
    const lines = text.split(/\r?\n/);
    const sep   = detectSeparator(text);
    const dataLines = lines.slice(1);
    let novosRegistos = [];

    dataLines.forEach(line => {
      if (!line.trim()) return;
      const c = parseCSVLine(line, sep);
      if (c.length >= 5) {
        novosRegistos.push({
          data: c[0], entidade: c[1], tipo: c[2], detalhes: c[3], total: parseInt(c[4]) || 0
        });
      }
    });

    if (novosRegistos.length === 0) return alert("Nenhum registo válido encontrado.");

    // Deduplica
    const jaExiste = p => historico.some(h => h.data === p.data && h.entidade === p.entidade && h.detalhes === p.detalhes);
    const semDups  = novosRegistos.filter(p => !jaExiste(p));
    const nDups    = novosRegistos.length - semDups.length;

    // Insere em batch no Supabase
    let inseridos = 0;
    for (const p of semDups) {
      const inserted = await insertSupabase(p);
      if (inserted) { historico.unshift(inserted); inseridos++; }
    }

    renderAllTables();
    let msg = `Importação concluída!\n\n${inseridos} pedidos carregados.`;
    if (nDups > 0) msg += `\n${nDups} duplicado(s) ignorado(s).`;
    alert(msg);
  };
  reader.readAsText(e.target.files[0], "UTF-8");
  e.target.value = "";
}

async function clearHistory() {
  if (!confirm("ATENÇÃO: Isto vai apagar TODO o histórico do teu utilizador. Confirmar?")) return;
  const { error } = await db.from("transacoes").delete().eq("user_id", currentUser.id);
  if (error) return alert("Erro: " + error.message);
  historico = [];
  renderAllTables();
}





// Dados atualizados: Sem raridade e com Cana Grossa
// Atualiza esta parte no teu script.js
const dadosCraft = {
    precos: [
        { nome: "Sardinha", preco: "100€" },
        { nome: "Robalo", preco: "170€" },
        { nome: "Bacalhau", preco: "175€" },
        { nome: "Tartaruga", preco: "1200€" },
        { nome: "Tubarão", preco: "1700€" },
        { nome: "Iscas", preco: "15€" },
        { nome: "Pedaços de Sardinha", preco: "25€" },
        { nome: "Sucata/Plástico", preco: "80€" },
        { nome: "Cana", preco: "200€" },
        { nome: "Redes", preco: "450€" },
        { nome: "Cana Grossa", preco: "1000€" }
    ],
    receitas: [
        { item: "Caixa", produz: 10, materiais: "10x Fio de Nylon, 25x Plástico" },
        { item: "Cana Grossa", produz: 5, materiais: "5x Fio de Nylon, 5x Aço, 5x Borracha, 5x Tabúa" },
        { item: "Rede de Pesca", produz: 7, materiais: "5x Plástico, 15x Fio de Nylon" }
    ]
};

function renderCraftInfo() {
  const pBody = document.getElementById('market-prices-body');
  const rBody = document.getElementById('craft-recipes-body');
  const calcSelect = document.getElementById('calc-item-select');

  if (pBody) {
      pBody.innerHTML = dadosCraft.precos.map(p => `
          <tr>
              <td class="text-bold">${p.nome}</td>
              <td class="money-text" style="color: var(--success-dk); font-weight: 700;">${p.preco}</td>
          </tr>
      `).join('');
  }

  if (rBody) {
      rBody.innerHTML = dadosCraft.receitas.map(r => `
          <tr>
              <td class="text-bold" style="color: var(--navy);">${r.item} <small>(Faz ${r.produz}x)</small></td>
              <td class="text-mid" style="font-size: 13px; line-height: 1.4;">${r.materiais}</td>
          </tr>
      `).join('');
  }

  if (calcSelect) {
      calcSelect.innerHTML = dadosCraft.receitas.map((r, index) => 
          `<option value="${index}">${r.item} (Pack de ${r.produz})</option>`
      ).join('');
      
      // Forçamos o valor para o primeiro item (index 0) e calculamos
      calcSelect.value = "0"; 
      calcularRecursos();
  }
}

function calcularRecursos() {
    const itemIndex = document.getElementById('calc-item-select').value;
    const qtdDesejada = parseInt(document.getElementById('calc-qty').value) || 0;
    const resultDiv = document.getElementById('calc-result');
    const listaDiv = document.getElementById('recursos-lista');

    if (qtdDesejada <= 0) {
        resultDiv.style.display = 'none';
        return;
    }

    const receita = dadosCraft.receitas[itemIndex];
    
    // LÓGICA: Quantas vezes precisamos de fazer a receita?
    // Ex: Queres 20 caixas, receita faz 10 -> Precisas de 2 "crafts".
    // Usamos Math.ceil para arredondar para cima (se quiseres 11 caixas, tens de fazer 2 receitas).
    const vezesParaCraftar = Math.ceil(qtdDesejada / receita.produz);
    
    const materiais = receita.materiais.split(', ');
    
    let htmlGerado = `<div style="margin-bottom:8px; font-size:12px; color:var(--text-lt);">
                        Para obter ${qtdDesejada} unidades, terá de fabricar a receita <b>${vezesParaCraftar}x</b>.
                      </div>`;

    materiais.forEach(m => {
        const partes = m.match(/(\d+)x (.+)/);
        if (partes) {
            const qtdBase = parseInt(partes[1]);
            const nomeMaterial = partes[2];
            const totalNecessario = qtdBase * vezesParaCraftar;
            htmlGerado += `<div>• <b>${totalNecessario}x</b> ${nomeMaterial}</div>`;
        }
    });

    listaDiv.innerHTML = htmlGerado;
    resultDiv.style.display = 'block';
}


// ══════════════════════════════════════════════════════════
//  INIT UNIFICADO - Executa uma única vez no carregamento
// ══════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
    console.log("Yellow Fish Pro: Inicializando sistema...");

    // 1. Sincronizar Modos (Garante que o JS condiz com o HTML)
    clienteMode = "Compra";
    patraoMode  = "Venda"; // Define como Venda para o select não vir vazio ou errado

    // 2. Configurar Abas (Recuperar última aberta ou usar default)
    const activeTab = localStorage.getItem('activeTab') || 'cliente-tab';
    const savedBtn  = Array.from(document.querySelectorAll(".tab-btn"))
                           .find(b => b.getAttribute('onclick')?.includes(activeTab));
    
    openTab(activeTab, savedBtn);

    // 3. Inicializar Itens por Defeito (Preenche as tabelas vazias)
    addClienteItem();
    addPatraoItem();

    // 4. Renderizar Dados Estáticos (Preços, Receitas e Calculadora)
    renderCraftInfo();

    // 5. Iniciar Autenticação (Supabase)
    initAuth(); 
});
