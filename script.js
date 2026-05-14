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
  patrao: {
    "Caixa de Sardinha": 14000,
    "Caixa de Robalo":   14500,
    "Caixa de Bacalhau": 20000,
    "Caixa de Tartaruga":65000,
    "Caixa de Tubarao":  90000,
    "Plastico/Sucata":      80,
    "Sardinha (Un)":       140,
    "Bacalhau (Un)":       280,
    "Robalo (Un)":         250,
    "Cana Grossa":         800,
    "Tubarao (Un)":       1800,
  },
  cliente_compra: {
    Sardinha:  100,
    Robalo:    170,
    Bacalhau:  175,
    Tartaruga: 1200,
    Tubarao:   1700,
    Iscas:      15,
    Cana:      200,
    Redes:     450,
  },
  cliente_venda: {
    Iscas:        15,
    Redes:       450,
    Cana:        200,
    "Cana Grossa":1000,
  },
};

// ══════════════════════════════════════════════════════════
//  UI — TABS / ITEMS / CÁLCULOS
// ══════════════════════════════════════════════════════════

function openTab(tabId, btn) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  btn.classList.add("active");
  renderAllTables();
}

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
    <button class="remove-btn" onclick="this.parentElement.remove(); updateCalculations();">X</button>`;
  container.appendChild(div);
  updateCalculations();
}

function updateCalculations() {
  let resC = calcStats("#compra-items .row", "#venda-items .row");
  document.getElementById("total-cliente").innerText = `${resC.dinheiro.toLocaleString("pt-PT")}$`;
  document.getElementById("stats-cliente").innerText  = `Peixes: ${resC.peixes} | Caixas: ${resC.caixas} | Outros: ${resC.outros}`;

  let resP = calcStats("#patrao-items .row");
  document.getElementById("total-patrao").innerText = `${resP.dinheiro.toLocaleString("pt-PT")}$`;
  document.getElementById("stats-patrao").innerText  = `Peixes: ${resP.peixes} | Caixas: ${resP.caixas} | Outros: ${resP.outros}`;
}

function calcStats(posId, negId = null) {
  let stats = { dinheiro: 0, peixes: 0, caixas: 0, outros: 0 };
  const process = (selector, mult) => {
    document.querySelectorAll(selector).forEach(r => {
      const sel  = r.querySelector(".prod-select");
      const name = sel.options[sel.selectedIndex].text;
      const qty  = parseInt(r.querySelector(".prod-qty").value) || 0;
      stats.dinheiro += parseFloat(sel.value) * qty * mult;
      if (name.toLowerCase().includes("caixa")) stats.caixas += qty;
      else if (name.match(/cana|isca|rede|plástico/i))  stats.outros += qty;
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

async function saveTransaction(tipo) {
  const stats = tipo === "Cliente"
    ? calcStats("#compra-items .row", "#venda-items .row")
    : calcStats("#patrao-items .row");

  const nome = tipo === "Cliente"
    ? document.getElementById("cliente-nome").value || "Anónimo"
    : document.getElementById("patrao-obs").value  || "Venda Geral";

  let itens = [];
  const extrair = (sel, pre = "") =>
    document.querySelectorAll(sel).forEach(r => {
      const s = r.querySelector(".prod-select");
      itens.push(`${pre}${r.querySelector(".prod-qty").value}x ${s.options[s.selectedIndex].text.split(" (")[0]}`);
    });

  if (tipo === "Cliente") {
    extrair("#compra-items .row");
    extrair("#venda-items .row", "[Extra] ");
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

  const isCliente = pedido.tipo === "Cliente";
  const tabName   = isCliente ? "cliente-tab" : "patrao-tab";
  const btnTab    = document.querySelectorAll(".tab-btn")[isCliente ? 0 : 1];
  openTab(tabName, btnTab);

  document.getElementById("compra-items").innerHTML = "";
  document.getElementById("venda-items").innerHTML  = "";
  document.getElementById("patrao-items").innerHTML = "";

  if (isCliente) {
    document.getElementById("cliente-nome").value = pedido.entidade;
    const { compraItems, vendaItems } = parseDetalhes(pedido.detalhes, "Cliente");
    compraItems.forEach(({ nome, qty }) => addItem("compra-items", "cliente_compra", encontrarNomeNaCategoria(nome, "cliente_compra"), qty));
    vendaItems.forEach( ({ nome, qty }) => addItem("venda-items",  "cliente_venda",  encontrarNomeNaCategoria(nome, "cliente_venda"),  qty));
    if (compraItems.length === 0) addItem("compra-items", "cliente_compra");
  } else {
    document.getElementById("patrao-obs").value = pedido.entidade;
    const { compraItems } = parseDetalhes(pedido.detalhes, "Patrão");
    compraItems.forEach(({ nome, qty }) => addItem("patrao-items", "patrao", encontrarNomeNaCategoria(nome, "patrao"), qty));
    if (compraItems.length === 0) addItem("patrao-items", "patrao");
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
  addItem("compra-items", "cliente_compra");
  addItem("patrao-items", "patrao");
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
      <td>${p.data}</td>
      <td><strong>${p.entidade}</strong></td>
      <td>${p.tipo}</td>
      <td>${p.detalhes}</td>
      <td class="${p.total >= 0 ? "val-pos" : "val-neg"}">${p.total.toLocaleString("pt-PT")}$</td>
      <td style="text-align:center">
        <button class="btn-edit-row"   onclick="editItem(${p.id})">✏️</button>
        <button class="btn-delete-row" onclick="deleteItem(${p.id})">🗑️</button>
      </td>`;

    const row = document.createElement("tr");
    row.innerHTML = trContent;

    if (fullBody)    fullBody.appendChild(row.cloneNode(true));
    if (p.tipo === "Cliente" && miniCliente && miniCliente.children.length < 5)
      miniCliente.appendChild(row.cloneNode(true));
    if (p.tipo === "Patrão"  && miniPatrao  && miniPatrao.children.length  < 5)
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

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  addItem("compra-items", "cliente_compra");
  addItem("patrao-items", "patrao");
  initAuth(); // Inicia auth só depois do DOM estar pronto
});