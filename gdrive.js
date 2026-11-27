/*
 * HERUPU LEGENDÁRIO — ligação com o Google Drive (API oficial, sem navegador e sem Claude).
 *
 * - Lê as artes e vídeos das pastas de marketing do Drive e transforma em modelos do piloto.
 * - Salva no Drive tudo o que o piloto cria (pasta "HERUPU LEGENDÁRIO / Posts gerados / AAAA-MM").
 *
 * Precisa de um "ID do cliente OAuth" do Google Cloud (tipo Aplicativo da Web), com a API do Google Drive ativada
 * e o URI de redirecionamento: https://ia.herupusistemas.com.br/mkt/google/retorno
 * O Client ID e o Client Secret são colados no painel (Ajustes → Google Drive) ou no .env:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PASTA_RAIZ = "HERUPU LEGENDÁRIO";
const PASTA_POSTS = "Posts gerados";
const PASTA_LANCAMENTO = "HERUPU Marketing - Lançamento Nacional";
const ESCOPO = "https://www.googleapis.com/auth/drive";

module.exports = function criarDrive({ DIR_DADOS, URL_PUBLICA }) {
  const ARQ = path.join(DIR_DADOS, "google.json");
  const ler = () => { try { return JSON.parse(fs.readFileSync(ARQ, "utf8")); } catch { return {}; } };
  let g = ler();
  const gravar = () => fs.writeFileSync(ARQ, JSON.stringify(g, null, 1), { mode: 0o600 });
  const id = () => g.clientId || process.env.GOOGLE_CLIENT_ID || "";
  const segredo = () => (g.clientId ? g.clientSecret : process.env.GOOGLE_CLIENT_SECRET) || "";
  const retorno = () => URL_PUBLICA() + "/mkt/google/retorno";

  function estado() {
    return {
      chaves: Boolean(id() && segredo()), conectado: Boolean(g.refresh), email: g.email || "", em: g.conectadoEm || null,
      pastas: g.pastas || [], ultimaSincronia: g.ultimaSincronia || null, avisoSincronia: g.avisoSincronia || "", redirect: retorno(),
    };
  }
  function salvarChaves({ clientId, clientSecret }) {
    clientId = String(clientId || "").trim(); clientSecret = String(clientSecret || "").trim();
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error("O Client ID do Google termina com .apps.googleusercontent.com. Confira se copiou o ID certo.");
    if (clientSecret.length < 15 || /\s/.test(clientSecret)) throw new Error("Client Secret inválido. Copie de novo no Google Cloud (Credenciais → seu cliente OAuth).");
    g.clientId = clientId; g.clientSecret = clientSecret; gravar();
  }

  // ------------------------------------------------------------ login
  const estados = new Map();
  function iniciar() {
    if (!id() || !segredo()) throw new Error("Faltam o Client ID e o Client Secret do Google. Cole em Ajustes → Google Drive.");
    const state = crypto.randomBytes(16).toString("hex");
    estados.set(state, Date.now() + 10 * 60e3);
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({ client_id: id(), redirect_uri: retorno(), response_type: "code", scope: ESCOPO + " openid email",
      access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  }
  async function token(params) {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(Object.assign({ client_id: id(), client_secret: segredo() }, params)), signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      if (j.error === "invalid_grant") { g.refresh = ""; gravar(); throw new Error("A conexão com o Google venceu ou foi removida. Conecte de novo em Ajustes → Google Drive."); }
      if (j.error === "redirect_uri_mismatch") throw new Error("O Google recusou o endereço de retorno. Cadastre " + retorno() + " no cliente OAuth.");
      throw new Error("Google: " + (j.error_description || j.error || r.status));
    }
    g.acesso = j.access_token; g.acessoAte = Date.now() + (Number(j.expires_in) || 3600) * 1000 - 120e3;
    if (j.refresh_token) g.refresh = j.refresh_token;
    gravar();
    return j;
  }
  async function receberRetorno(u) {
    const st = u.searchParams.get("state") || "", val = estados.get(st); estados.delete(st);
    if (!val || Date.now() > val) throw new Error("O pedido de conexão expirou. Toque em Conectar Google de novo.");
    if (u.searchParams.get("error")) throw new Error("A conexão foi cancelada no Google.");
    const j = await token({ code: u.searchParams.get("code") || "", grant_type: "authorization_code", redirect_uri: retorno() });
    if (!g.refresh) throw new Error("O Google não devolveu a autorização permanente. Remova o acesso em myaccount.google.com/permissions e conecte de novo.");
    if (!String(j.scope || "").includes("auth/drive")) throw new Error("A permissão do Google Drive não foi marcada no login. Conecte de novo e marque a caixa do Drive.");
    try { g.email = JSON.parse(Buffer.from(String(j.id_token).split(".")[1], "base64url").toString()).email || ""; } catch { /* sem e-mail */ }
    g.conectadoEm = new Date().toISOString(); g.pastas = []; gravar();
    return g;
  }
  async function acesso() {
    if (!g.refresh) throw new Error("Google Drive não conectado. Conecte em Ajustes → Google Drive.");
    if (g.acesso && Date.now() < (g.acessoAte || 0)) return g.acesso;
    await token({ grant_type: "refresh_token", refresh_token: g.refresh });
    return g.acesso;
  }
  async function api(caminho, opcoes = {}) {
    const r = await fetch(caminho.startsWith("http") ? caminho : "https://www.googleapis.com/drive/v3/" + caminho, Object.assign({}, opcoes, {
      headers: Object.assign({ Authorization: "Bearer " + (await acesso()) }, opcoes.headers || {}), signal: AbortSignal.timeout(opcoes.tempo || 60000),
    }));
    if (opcoes.bruto) { if (!r.ok) throw new Error("Drive respondeu " + r.status); return r; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = (j.error || {}), m = String(e.message || r.status);
      if (/has not been used|is disabled/i.test(m)) throw new Error("A API do Google Drive está desligada no projeto do Google Cloud. Ative em APIs e serviços → Biblioteca → Google Drive API.");
      throw new Error("Drive: " + m.slice(0, 200));
    }
    return j;
  }
  const q = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  async function listar(consulta) {
    const saida = []; let pagina = "";
    do {
      const u = "files?" + new URLSearchParams({ q: consulta + " and trashed=false", fields: "nextPageToken,files(id,name,mimeType,size,md5Checksum,parents)", pageSize: "1000", ...(pagina ? { pageToken: pagina } : {}) });
      const j = await api(u); saida.push(...(j.files || [])); pagina = j.nextPageToken || "";
    } while (pagina);
    return saida;
  }
  async function pastaPorNome(nome, pai) {
    const l = await listar(`mimeType='application/vnd.google-apps.folder' and name=${q(nome)}` + (pai ? ` and ${q(pai)} in parents` : ""));
    return l[0] || null;
  }
  async function garantirPasta(nome, pai) {
    const ja = await pastaPorNome(nome, pai);
    if (ja) return ja.id;
    const j = await api("files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", ...(pai ? { parents: [pai] } : {}) }) });
    return j.id;
  }

  // ------------------------------------------------------------ pastas de leitura (padrão: Lançamento Nacional + HERUPU LEGENDÁRIO/Modelos)
  const SEGMENTOS_PASTA = { "Captação de técnicos": "tecnicos", "Captação de clientes": "clientes", "Energia solar": "solar", "Segurança eletrônica": "seguranca", "Programação de sistemas": "programacao", "Qualquer segmento": "todos" };
  async function prepararPastas() {
    if (g.pastas && g.pastas.length) return g.pastas;
    const raiz = await garantirPasta(PASTA_RAIZ);
    const modelos = await garantirPasta("Modelos", raiz);
    for (const nome of Object.keys(SEGMENTOS_PASTA)) {
      const p = await garantirPasta(nome, modelos);
      await garantirPasta("Fundos limpos", p);
    }
    const pastas = [{ id: modelos, nome: PASTA_RAIZ + " / Modelos" }];
    const lanc = await pastaPorNome(PASTA_LANCAMENTO);
    if (lanc) pastas.push({ id: lanc.id, nome: PASTA_LANCAMENTO });
    g.raiz = raiz; g.pastas = pastas; gravar();
    return pastas;
  }
  function adicionarPasta(link) {
    const m = String(link || "").match(/folders\/([A-Za-z0-9_-]{10,})/) || String(link || "").match(/^([A-Za-z0-9_-]{10,})$/);
    if (!m) throw new Error("Cole o link de uma pasta do Drive (drive.google.com/drive/folders/...).");
    return api("files/" + m[1] + "?fields=id,name,mimeType").then((f) => {
      if (f.mimeType !== "application/vnd.google-apps.folder") throw new Error("Esse link não é de uma pasta.");
      g.pastas = (g.pastas || []).filter((p) => p.id !== f.id).concat([{ id: f.id, nome: f.name }]); gravar();
      return g.pastas;
    });
  }
  function removerPasta(idPasta) { g.pastas = (g.pastas || []).filter((p) => p.id !== idPasta); gravar(); return g.pastas; }

  // classifica pelo caminho no Drive: segmento, arte pronta x fundo limpo
  function classificar(caminho, nome, tipo) {
    const t = (caminho.join("/") + "/" + nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    let foco = "todos";
    for (const [pasta, f] of Object.entries(SEGMENTOS_PASTA)) if (caminho.includes(pasta)) foco = f;
    if (foco === "todos") {
      if (/cliente/.test(t)) foco = "clientes";
      else if (/tecnico|modalidade/.test(t)) foco = "tecnicos";
      else if (/solar|fotovolt/.test(t)) foco = "solar";
      else if (/seguranca|cftv|camera|alarme|cerca/.test(t)) foco = "seguranca";
      else if (/programa|sistema|software|aplicativo|automac/.test(t)) foco = "programacao";
    }
    const fundo = /fundos? limpos?|fundo|background|sem texto/.test(t);
    return { foco, pronta: tipo === "imagem" && !fundo };
  }
  // percorre as pastas (com subpastas) e devolve imagens e vídeos com o caminho
  async function arquivosDasPastas() {
    const pastas = await prepararPastas();
    const achados = [], vistos = new Set();
    async function andar(idPasta, caminho, nivel) {
      if (vistos.has(idPasta) || nivel > 5) return; vistos.add(idPasta);
      for (const f of await listar(`${q(idPasta)} in parents`)) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          if (/vers[aã]o antiga|antig[ao]s?\b|lixo|rascunho|posts gerados/i.test(f.name)) continue;
          await andar(f.id, caminho.concat(f.name), nivel + 1);
        } else if (/^image\/(jpeg|png|webp)$/.test(f.mimeType) || /^video\//.test(f.mimeType)) {
          if (Number(f.size || 0) > 300 * 1024 * 1024) continue;
          achados.push(Object.assign(f, { caminho, tipo: /^video\//.test(f.mimeType) ? "video" : "imagem" }));
        }
      }
    }
    for (const p of pastas) await andar(p.id, [p.nome], 0);
    return achados;
  }
  async function baixar(idArq, destino) {
    const r = await api("files/" + idArq + "?alt=media", { bruto: true, tempo: 300000 });
    fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  }

  // ------------------------------------------------------------ salvar no Drive
  async function enviar(arquivo, nome, mime) {
    const raiz = g.raiz || (await prepararPastas(), g.raiz);
    const posts = await garantirPasta(PASTA_POSTS, raiz);
    const mes = await garantirPasta(new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7), posts);
    const tam = fs.statSync(arquivo).size;
    const ini = await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
      method: "POST", bruto: true,
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(tam) },
      body: JSON.stringify({ name: nome, parents: [mes] }),
    });
    const local = ini.headers.get("location");
    if (!local) throw new Error("O Drive não abriu o envio.");
    const r = await fetch(local, { method: "PUT", headers: { "Content-Type": mime, "Content-Length": String(tam) }, body: fs.readFileSync(arquivo), signal: AbortSignal.timeout(300000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error("O Drive recusou o arquivo (" + r.status + ").");
    return j.id;
  }
  function anotarSincronia(aviso) { g.ultimaSincronia = new Date().toISOString(); g.avisoSincronia = aviso || ""; gravar(); }

  return { estado, salvarChaves, iniciar, receberRetorno, arquivosDasPastas, classificar, baixar, enviar, adicionarPasta, removerPasta, anotarSincronia,
    conectado: () => Boolean(g.refresh), desconectar: () => { g = { clientId: g.clientId, clientSecret: g.clientSecret }; gravar(); } };
};
