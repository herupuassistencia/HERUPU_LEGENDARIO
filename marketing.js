/*
 * HERUPU LEGENDÁRIO — Agente de Marketing.
 *
 * Publica no Instagram e no Facebook pelas APIs oficiais da Meta (sem navegador, sem Claude),
 * guarda a fila de posts, publica sozinho no horário aprovado, lê comentários, sugere
 * respostas com a IA grátis do LEGENDÁRIO e monta o relatório da semana.
 *
 * Variáveis no .env:
 *   MKT_SENHA         senha do painel de marketing (obrigatória — sem ela o módulo fica desligado)
 *   META_PAGE_ID      ID da Página do Facebook
 *   META_PAGE_TOKEN   token de acesso da Página (de longa duração)
 *   META_IG_ID        ID da conta do Instagram profissional ligada à Página (aceita também META_IG_USER_ID)
 *   META_IG_TOKEN     opcional: token próprio do Instagram (se começar com "IG", usa graph.instagram.com)
 *   META_GRAPH_VERSAO versão da Graph API (padrão v23.0)
 *   MKT_URL_PUBLICA   endereço público deste servidor (padrão https://ia.herupusistemas.com.br)
 *
 * Em vez de colar tokens, dá para conectar pelo botão "Conectar Instagram/Facebook" do painel
 * (login da Meta). Para isso o .env precisa de META_APP_ID, META_APP_SECRET e, se houver,
 * META_LOGIN_CONFIG_ID (os mesmos do app da Central), e o endereço
 *   https://ia.herupusistemas.com.br/mkt/meta/retorno
 * cadastrado como "URI de redirecionamento OAuth válido" no app da Meta.
 *
 * Os dados ficam em dados/marketing.json, a conexão da Meta em dados/meta.json e as imagens
 * em dados/midia/ (tudo fora do Git).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PRODUTOS, PLAYBOOK, FORMATOS } = require("./estrategia");

module.exports = function criarMarketing({ chamarCerebro, enviarJson, lerCorpo, TIPOS, falarMp3 }) {
  const DIR_DADOS = path.join(__dirname, "dados");
  const DIR_MIDIA = path.join(DIR_DADOS, "midia");
  const ARQ = path.join(DIR_DADOS, "marketing.json");
  const ARQ_META = path.join(DIR_DADOS, "meta.json");
  fs.mkdirSync(DIR_MIDIA, { recursive: true });
  let estudio = null;
  try { estudio = require("./estudio")({ DIR_MIDIA, falarMp3 }); } catch (e) { console.log("[HERUPU] estúdio indisponível:", e.message); }

  // conexão feita pelo botão do painel: preenche o que o .env deixou vazio
  function aplicarConexaoMeta() {
    let c = {};
    try { c = JSON.parse(fs.readFileSync(ARQ_META, "utf8")); } catch { return null; }
    const usar = { META_PAGE_ID: c.pageId, META_PAGE_TOKEN: c.pageToken, META_IG_ID: c.igId };
    for (const [k, v] of Object.entries(usar)) if (v && !process.env["_ENV_" + k]) process.env[k] = v;
    return c;
  }
  // guarda o que veio do .env, para a conexão do painel não sobrescrever valores colocados à mão
  for (const k of ["META_PAGE_ID", "META_PAGE_TOKEN", "META_IG_ID"]) if (process.env[k]) process.env["_ENV_" + k] = "1";
  let conexaoMeta = aplicarConexaoMeta();
  // chave secreta do app colada pelo painel (guardada só no servidor)
  const ARQ_APP = path.join(DIR_DADOS, "meta-app.json");
  try {
    const a = JSON.parse(fs.readFileSync(ARQ_APP, "utf8"));
    if (a.segredo) process.env.META_APP_SECRET = a.segredo;
    if (a.appId && !process.env.META_APP_ID) process.env.META_APP_ID = a.appId;
    if (a.configId && !process.env.META_LOGIN_CONFIG_ID) process.env.META_LOGIN_CONFIG_ID = a.configId;
  } catch { /* ainda não colada */ }
  async function salvarSegredoApp(segredo) {
    segredo = String(segredo || "").replace(/\s+/g, "");
    if (!/^[0-9a-f]{32}$/.test(segredo)) throw new Error("Isso não parece a Chave Secreta: ela tem 32 caracteres, só números e letras de a até f. Confira se não copiou o ID do app.");
    const appId = env("META_APP_ID");
    if (!appId) throw new Error("Falta META_APP_ID no .env.");
    const r = await fetch(`https://graph.facebook.com/${V()}/oauth/access_token?` + new URLSearchParams({ client_id: appId, client_secret: segredo, grant_type: "client_credentials" }), { signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error("A Meta recusou essa Chave Secreta. Copie de novo em Configurações do app → Básico → Mostrar.");
    fs.writeFileSync(ARQ_APP, JSON.stringify({ appId, configId: env("META_LOGIN_CONFIG_ID"), segredo, em: new Date().toISOString() }), { mode: 0o600 });
    process.env.META_APP_SECRET = segredo;
  }

  const env = (k, padrao = "") => process.env[k] || padrao;
  const SENHA = () => env("MKT_SENHA");
  const V = () => env("META_GRAPH_VERSAO", env("META_GRAPH_VERSION", "v23.0"));
  if (!process.env.META_IG_ID && process.env.META_IG_USER_ID) process.env.META_IG_ID = process.env.META_IG_USER_ID;
  const URL_PUBLICA = () => env("MKT_URL_PUBLICA", "https://ia.herupusistemas.com.br").replace(/\/+$/, "");
  const metaPronta = () => Boolean((env("META_PAGE_TOKEN") || env("META_IG_TOKEN")) && (env("META_IG_ID") || env("META_PAGE_ID")));
  const IG = { ig: true };

  const CONTEXTO_PADRAO =
    "HERUPU é uma plataforma de atendimento por aplicativo, em lançamento nacional. " +
    "Técnicos e prestadores de serviço (eletricista, encanador, refrigeração, energia solar, segurança eletrônica, " +
    "informática, pedreiro, limpeza de piscina e outros) se cadastram de graça e recebem chamados de clientes perto deles. " +
    "Mais de 100 tipos de serviço em 13 áreas. O técnico vê o problema e a distância e decide se aceita. " +
    "O valor do serviço é combinado direto entre técnico e cliente. " +
    "Cadastro do técnico: tecnico.herupusistemas.com.br. App do cliente: cliente.herupusistemas.com.br. " +
    "Chamada principal: seja o primeiro na sua cidade. Mascote e marca: o leão HERUPU. " +
    "Instagram @herupuassistencia. WhatsApp (96) 98415-3280.";
  const KIT_PADRAO = [
    "Como faço o cadastro? -> É grátis: tecnico.herupusistemas.com.br (link na bio).",
    "Tem mensalidade / quanto custa? -> O cadastro é grátis.",
    "Funciona na minha cidade? -> O lançamento é nacional; quem se cadastra primeiro sai na frente na sua cidade.",
    "Quem define o preço? -> O valor do serviço você combina direto com o cliente.",
    "Sou cliente, como peço um técnico? -> Pelo app do cliente: cliente.herupusistemas.com.br.",
    "Dúvida mais específica -> Chama no WhatsApp (96) 98415-3280.",
  ].join("\n");

  // ------------------------------------------------------------ dados
  function carregar() {
    try { return JSON.parse(fs.readFileSync(ARQ, "utf8")); } catch { return {}; }
  }
  let db = Object.assign({ posts: [], respondidos: {}, config: {}, links: {} }, carregar());
  db.config = Object.assign({ contexto: CONTEXTO_PADRAO, kit: KIT_PADRAO, autoResponder: false }, db.config);
  function salvar() {
    const tmp = ARQ + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, ARQ);
  }
  const novoId = () => crypto.randomBytes(8).toString("hex");
  const acharPost = (id) => db.posts.find((p) => p.id === id);

  // ------------------------------------------------------------ segurança (senha + limite de tentativas)
  const tentativas = new Map(); // ip -> { n, ate }
  function senhaConfere(dada) {
    if (db.senha && db.senha.sal) {
      const h = crypto.scryptSync(String(dada), db.senha.sal, 32);
      const certo = Buffer.from(db.senha.hash, "hex");
      return h.length === certo.length && crypto.timingSafeEqual(h, certo);
    }
    const a = Buffer.from(String(dada)), b = Buffer.from(SENHA());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function autorizado(req) {
    const senha = SENHA() || (db.senha && db.senha.hash);
    if (!senha) return { ok: false, status: 503, erro: "Agente de marketing desligado: falta MKT_SENHA no .env do servidor." };
    const ip = String(req.headers["x-real-ip"] || req.socket.remoteAddress || "");
    const t = tentativas.get(ip);
    if (t && t.n >= 8 && Date.now() < t.ate) return { ok: false, status: 429, erro: "Muitas tentativas. Espere 15 minutos." };
    if (senhaConfere(req.headers["x-herupu-senha"] || "")) { tentativas.delete(ip); return { ok: true }; }
    const n = (t && Date.now() < t.ate ? t.n : 0) + 1;
    tentativas.set(ip, { n, ate: Date.now() + 15 * 60e3 });
    return { ok: false, status: 401, erro: "Senha do marketing incorreta." };
  }

  // ------------------------------------------------------------ Graph API (Meta)
  async function graph(metodo, caminho, params = {}, opcoes = {}) {
    // Instagram: usa o token próprio do Instagram se existir; token "IG..." (login do Instagram) fala com graph.instagram.com
    const token = opcoes.ig ? (env("META_IG_TOKEN") || env("META_PAGE_TOKEN")) : env("META_PAGE_TOKEN");
    if (!token) throw new Error(opcoes.ig ? "Falta o token do Instagram no .env." : "Falta META_PAGE_TOKEN no .env.");
    const host = opcoes.ig && /^IG/.test(token) ? "graph.instagram.com" : "graph.facebook.com";
    const url = new URL(`https://${host}/${V()}/${caminho}`);
    const corpo = new URLSearchParams();
    const alvo = metodo === "GET" ? url.searchParams : corpo;
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) alvo.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    alvo.append("access_token", token);
    const r = await fetch(url, { method: metodo, body: metodo === "GET" ? undefined : corpo, signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const e = j.error || {};
      throw new Error(traduzirErroMeta(e) || `Meta respondeu ${r.status}`);
    }
    return j;
  }
  function traduzirErroMeta(e) {
    const msg = String(e.error_user_msg || e.message || "");
    if (e.code === 190) return "O token da Meta expirou ou é inválido. Gere um novo token da Página e atualize META_PAGE_TOKEN no .env.";
    if (e.code === 10 || e.code === 200) return "A Meta negou a permissão (" + msg + "). Confira as permissões do app: instagram_content_publish, pages_manage_posts, instagram_manage_comments.";
    if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return "Limite de uso da Meta atingido. Tente de novo mais tarde.";
    if (e.code === 9004 || /media/i.test(msg) && /download|fetch|uri/i.test(msg)) return "A Meta não conseguiu baixar a imagem. Confira se o endereço público (MKT_URL_PUBLICA) abre de fora.";
    return msg.slice(0, 300);
  }
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  async function esperarContainer(id) {
    for (let i = 0; i < 30; i++) {
      const j = await graph("GET", id, { fields: "status_code,status" }, IG);
      if (j.status_code === "FINISHED") return;
      if (j.status_code === "ERROR" || j.status_code === "EXPIRED") throw new Error("O Instagram recusou a mídia: " + (j.status || j.status_code));
      await dormir(3000);
    }
    throw new Error("O Instagram demorou demais para processar a mídia.");
  }

  async function publicarInstagram(post) {
    const ig = env("META_IG_ID");
    if (!ig) throw new Error("Falta META_IG_ID no .env.");
    const urls = post.midias.map((m) => URL_PUBLICA() + "/midia/" + m.arquivo).slice(0, 10);
    let criacao;
    if (post.video) {
      criacao = (await graph("POST", `${ig}/media`, { media_type: "REELS", video_url: URL_PUBLICA() + "/midia/" + post.video.arquivo, caption: post.legenda, share_to_feed: "true" }, IG)).id;
      for (let i = 0; i < 40; i++) { // vídeo demora mais para processar
        const st = await graph("GET", criacao, { fields: "status_code,status" }, IG);
        if (st.status_code === "FINISHED") break;
        if (st.status_code === "ERROR") throw new Error("O Instagram recusou o vídeo: " + (st.status || ""));
        await dormir(5000);
      }
    } else if (!urls.length) throw new Error("O Instagram exige pelo menos uma imagem.");
    else if (urls.length === 1) {
      criacao = (await graph("POST", `${ig}/media`, { image_url: urls[0], caption: post.legenda }, IG)).id;
    } else {
      const filhos = [];
      for (const u of urls) filhos.push((await graph("POST", `${ig}/media`, { image_url: u, is_carousel_item: "true" }, IG)).id);
      for (const f of filhos) await esperarContainer(f);
      criacao = (await graph("POST", `${ig}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: post.legenda }, IG)).id;
    }
    if (!post.video) await esperarContainer(criacao);
    const pub = await graph("POST", `${ig}/media_publish`, { creation_id: criacao }, IG);
    let link = "";
    try { link = (await graph("GET", pub.id, { fields: "permalink" }, IG)).permalink || ""; } catch { /* sem link */ }
    return { id: pub.id, link };
  }

  async function publicarFacebook(post) {
    const pg = env("META_PAGE_ID");
    if (!pg) throw new Error("Falta META_PAGE_ID no .env.");
    const urls = post.midias.map((m) => URL_PUBLICA() + "/midia/" + m.arquivo).slice(0, 10);
    let j;
    if (post.video) j = await graph("POST", `${pg}/videos`, { file_url: URL_PUBLICA() + "/midia/" + post.video.arquivo, description: post.legenda });
    else if (!urls.length) j = await graph("POST", `${pg}/feed`, { message: post.legenda });
    else if (urls.length === 1) j = await graph("POST", `${pg}/photos`, { url: urls[0], message: post.legenda });
    else {
      const ids = [];
      for (const u of urls) ids.push((await graph("POST", `${pg}/photos`, { url: u, published: "false" })).id);
      const params = { message: post.legenda };
      ids.forEach((id, i) => { params[`attached_media[${i}]`] = { media_fbid: id }; });
      j = await graph("POST", `${pg}/feed`, params);
    }
    const idPost = j.post_id || j.id;
    return { id: idPost, link: idPost ? "https://www.facebook.com/" + idPost : "" };
  }

  const PUBLICADORES = { instagram: publicarInstagram, facebook: publicarFacebook };

  async function publicar(post) {
    if (!metaPronta()) throw new Error("A conexão com a Meta ainda não foi configurada no .env (META_PAGE_TOKEN, META_PAGE_ID, META_IG_ID).");
    post.status = "publicando"; post.resultados = post.resultados || {}; salvar();
    let falhou = false;
    for (const rede of post.redes) {
      if (post.resultados[rede] && post.resultados[rede].ok) continue; // já foi: nunca publica repetido
      try {
        const r = await PUBLICADORES[rede](post);
        post.resultados[rede] = { ok: true, id: r.id, link: r.link, em: new Date().toISOString() };
      } catch (e) {
        falhou = true;
        post.resultados[rede] = { ok: false, erro: e.message, em: new Date().toISOString() };
        console.log(`[HERUPU] marketing: falha no ${rede}:`, e.message);
      }
      salvar();
    }
    post.status = falhou ? "erro" : "publicado";
    post.atualizadoEm = new Date().toISOString();
    salvar();
    return post;
  }

  // ------------------------------------------------------------ agendador (a cada minuto)
  let trabalhando = false;
  async function rodarAgenda() {
    if (trabalhando || !(SENHA() || db.senha)) return;
    trabalhando = true;
    try {
      const agora = Date.now();
      const vencidos = db.posts.filter((p) => p.status === "aprovado" && p.quando && Date.parse(p.quando) <= agora);
      for (const p of vencidos) {
        const rep = await conferirRepetido(p).catch(() => "");
        if (rep) { p.status = "erro"; p.resultados = Object.assign(p.resultados || {}, { aviso: { ok: false, erro: rep, em: new Date().toISOString() } }); salvar(); continue; }
        await publicar(p).catch((e) => console.log("[HERUPU] agenda:", e.message));
      }
      if (db.config.autoResponder && metaPronta() && (!db.ultimaRonda || agora - db.ultimaRonda > 10 * 60e3)) {
        db.ultimaRonda = agora;
        await responderSozinho().catch((e) => console.log("[HERUPU] auto-resposta:", e.message));
      }
    } finally { trabalhando = false; }
  }
  // posts que ficaram "publicando" (servidor reiniciou no meio): volta para aprovado, sem repetir as redes que já foram
  db.posts.filter((p) => p.status === "publicando").forEach((p) => { p.status = "aprovado"; });
  setInterval(rodarAgenda, 60e3).unref();
  setTimeout(rodarAgenda, 15e3).unref();

  // ------------------------------------------------------------ IA (legendas e respostas)
  async function iaJson(sistema, texto, temperatura = 0.8) {
    const r = await chamarCerebro({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: "user", parts: [{ text: texto }] }],
      generationConfig: { responseMimeType: "application/json", temperature: temperatura },
    });
    if (!r.ok) throw new Error("A IA não respondeu agora (" + (r.erro || "sem detalhe") + ").");
    const bruto = String(r.texto || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const a = bruto.indexOf("{"), b = bruto.lastIndexOf("}");
    try { return JSON.parse(bruto.slice(a, b + 1)); } catch { throw new Error("A IA respondeu num formato inesperado. Tente de novo."); }
  }

  const ESTILO =
    "Escreva em português do Brasil, tom humano e direto, sem cara de IA. " +
    "Não use as palavras 'Descubra', 'Transforme', 'Revolucione', nem travessão longo. Poucos emojis (no máximo 2). " +
    "Nunca invente números, preços, promoções ou promessas que não estejam no contexto.";

  async function gerarLegenda({ tema, rede, extra }) {
    const recentes = (await legendasJaPublicadas().catch(() => [])).slice(0, 12).map((x) => "- " + String(x.texto).split("\n")[0].slice(0, 120)).join("\n");
    const sistema =
      "Você é o social media da empresa, especialista em conteúdo que viraliza. " + ESTILO + " Contexto da empresa: " + db.config.contexto + "\n" + PRODUTOS + "\n" + PLAYBOOK + "\n" +
      "Formato da legenda: 1ª linha é um gancho de no máximo 10 palavras; depois 3 a 6 linhas curtas de valor; " +
      "uma chamada para ação clara; no fim 3 a 5 hashtags relevantes. " +
      (rede === "facebook" ? "Para Facebook pode ser um pouco mais explicativa e com o link escrito por extenso. " : "No Instagram, o link vai como 'link na bio'. ") +
      "NUNCA repita conteúdo: use gancho, ângulo e informação diferentes destes posts já publicados (primeiras linhas):\n" + (recentes || "(nenhum ainda)") + "\n" +
      "Responda só com JSON: {\"legenda\": \"...\", \"ideia_imagem\": \"descrição curta da arte ideal\"}";
    const j = await iaJson(sistema, `Tema do post: ${tema}\n${extra ? "Observações: " + extra : ""}`);
    return { legenda: String(j.legenda || "").trim().slice(0, 2200), ideia_imagem: String(j.ideia_imagem || "").trim() };
  }

  async function sugerirResposta(comentario, legendaDoPost) {
    const sistema =
      "Você responde comentários no Instagram da empresa. " + ESTILO + " Contexto: " + db.config.contexto + " " +
      "Kit de respostas aprovado pelo dono (use como base, sem copiar robótico):\n" + db.config.kit + "\n" +
      "Regras: resposta curta (1 a 2 frases), educada, chamando a pessoa para o próximo passo quando houver interesse. " +
      "Se for crítica ou reclamação, responda com calma e convide para o WhatsApp. Se for spam ou ofensa, devolva resposta vazia. " +
      "Responda só com JSON: {\"resposta\": \"...\", \"tipo\": \"duvida|interesse|elogio|reclamacao|spam|outro\"}";
    const j = await iaJson(sistema, `Post: ${String(legendaDoPost || "").slice(0, 300)}\nComentário: ${comentario}`, 0.5);
    return { resposta: String(j.resposta || "").trim().slice(0, 600), tipo: String(j.tipo || "outro") };
  }

  // ------------------------------------------------------------ comentários
  let usuarioIG = null;
  async function meuUsuarioIG() {
    if (!usuarioIG) usuarioIG = (await graph("GET", env("META_IG_ID"), { fields: "username" }, IG)).username || "";
    return usuarioIG;
  }
  async function comentariosPendentes() {
    const ig = env("META_IG_ID");
    if (!ig) throw new Error("Falta META_IG_ID no .env.");
    const eu = await meuUsuarioIG();
    const midias = (await graph("GET", `${ig}/media`, { fields: "id,caption,permalink,timestamp,comments_count", limit: 15 }, IG)).data || [];
    const saida = [];
    for (const m of midias.filter((x) => x.comments_count > 0)) {
      const cs = (await graph("GET", `${m.id}/comments`, { fields: "id,text,username,timestamp,replies{username}", limit: 50 }, IG)).data || [];
      for (const c of cs) {
        if (c.username === eu || db.respondidos[c.id]) continue;
        if ((c.replies && c.replies.data || []).some((r) => r.username === eu)) continue;
        saida.push({ id: c.id, texto: c.text, usuario: c.username, quando: c.timestamp, post: (m.caption || "").slice(0, 120), link: m.permalink });
      }
    }
    return saida.sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando));
  }
  async function responderComentario(id, texto) {
    await graph("POST", `${id}/replies`, { message: texto }, IG);
    db.respondidos[id] = new Date().toISOString();
    salvar();
  }
  async function responderSozinho() {
    const lista = await comentariosPendentes();
    for (const c of lista.slice(0, 10)) {
      const s = await sugerirResposta(c.texto, c.post);
      if (!s.resposta || s.tipo === "spam" || s.tipo === "reclamacao") continue; // reclamação fica para o dono
      await responderComentario(c.id, s.resposta);
      await dormir(4000);
    }
  }

  // ------------------------------------------------------------ relatório
  async function relatorio() {
    const ig = env("META_IG_ID");
    if (!ig) throw new Error("Falta META_IG_ID no .env.");
    const conta = await graph("GET", ig, { fields: "username,followers_count,media_count" }, IG);
    const midias = (await graph("GET", `${ig}/media`, { fields: "id,caption,timestamp,like_count,comments_count,permalink,media_type", limit: 20 }, IG)).data || [];
    let erroMetricas = "";
    for (const m of midias) {
      m.alcance = null;
      for (const metricas of ["views,reach,saved,shares", "reach,saved,shares", "reach", "views"]) {
        try {
          const ins = (await graph("GET", `${m.id}/insights`, { metric: metricas }, IG)).data || [];
          for (const i of ins) m[{ reach: "alcance", saved: "salvos", shares: "compartilhamentos", views: "visualizacoes" }[i.name] || i.name] = i.values && i.values[0] ? i.values[0].value : i.total_value && i.total_value.value;
          break;
        } catch (e) { erroMetricas = erroMetricas || e.message; }
      }
      m.caption = (m.caption || "").slice(0, 90);
    }
    const semAlcance = midias.length && midias.every((m) => m.alcance == null);
    return { conta, midias, avisoMetricas: semAlcance ? "A Meta não liberou alcance/visualizações: " + erroMetricas : "" };
  }

  // ------------------------------------------------------------ estrategista viral
  function resumoParaIA(rel) {
    if (!rel) return "(sem dados de desempenho agora)";
    const linhas = rel.midias.slice(0, 15).map((m) =>
      `- ${String(m.timestamp).slice(0, 10)} ${m.media_type}: curtidas ${m.like_count || 0}, coment. ${m.comments_count || 0}` +
      (m.alcance != null ? `, alcance ${m.alcance}` : "") + (m.visualizacoes != null ? `, views ${m.visualizacoes}` : "") +
      (m.compartilhamentos != null ? `, compart. ${m.compartilhamentos}` : "") + ` | "${m.caption}"`);
    return `Conta @${rel.conta.username}: ${rel.conta.followers_count || 0} seguidores, ${rel.conta.media_count || 0} posts.\n` + linhas.join("\n");
  }
  function resumoLinks() {
    const l = Object.entries(db.links || {}).map(([c, x]) => `- ${x.nome} (/r/${c}): ${x.total || 0} cliques`);
    return l.length ? l.join("\n") : "(nenhum link rastreável criado ainda)";
  }
  async function diagnostico() {
    let rel = null; try { rel = await relatorio(); } catch { /* sem dados */ }
    const sistema = "Você é um estrategista de crescimento orgânico em Instagram e TikTok, direto e honesto. " + ESTILO + "\n" + PRODUTOS + "\n" + PLAYBOOK +
      "\nAnalise os números reais abaixo, sem inventar dados. Responda só com JSON: " +
      "{\"resumo\": \"2 frases sinceras sobre a situação\", \"problemas\": [\"até 5 causas prováveis\"], \"acoes\": [\"5 ações concretas para os próximos 7 dias, em ordem de impacto\"], \"metas\": [\"3 metas medíveis para 30 dias\"]}";
    const j = await iaJson(sistema, "DESEMPENHO DO INSTAGRAM:\n" + resumoParaIA(rel) + "\n\nLINKS RASTREÁVEIS:\n" + resumoLinks(), 0.4);
    return { resumo: String(j.resumo || ""), problemas: [].concat(j.problemas || []).map(String), acoes: [].concat(j.acoes || []).map(String), metas: [].concat(j.metas || []).map(String) };
  }
  const FOCOS = {
    tecnicos: "captar TÉCNICOS para o app HERUPU Técnico em todo o Brasil (público: prestadores de serviço autônomos)",
    clientes: "captar CLIENTES para pedirem técnicos pelo app HERUPU Cliente",
    solar: "vender energia solar da HERUPU em Macapá e no Amapá",
    sistemas: "vender o HERUPU SISTEMAS para malharias e comunicação visual (teste grátis 7 dias)",
    misto: "crescimento geral da marca, priorizando a captação de técnicos",
  };
  async function planoDaSemana({ foco, quantidade, inicio }) {
    const alvo = FOCOS[foco] || FOCOS.tecnicos;
    const n = Math.min(Math.max(Number(quantidade) || 7, 3), 10);
    let rel = null; try { rel = await relatorio(); } catch { /* sem dados */ }
    const ja = (await legendasJaPublicadas().catch(() => [])).slice(0, 20).map((x) => "- " + String(x.texto).split("\n")[0].slice(0, 100)).join("\n");
    const link = Object.keys(db.links || {}).find((c) => db.links[c].foco === foco) || "";
    const sistema = "Você é o estrategista e roteirista de conteúdo viral da HERUPU. " + ESTILO + "\n" + PRODUTOS + "\n" + PLAYBOOK +
      `\nObjetivo desta semana: ${alvo}.` +
      `\nCrie ${n} posts DIFERENTES entre si e diferentes dos já publicados. Pelo menos metade em formato reels. ` +
      "Misture objetivos: alcance (compartilhável), salvamento (útil), conversão (cadastro). Pense como o público pensa." +
      (link ? ` Na conversão, use o link rastreável ia.herupusistemas.com.br/r/${link}.` : "") +
      "\nPara reels: roteiro cena a cena com tempo, o que aparece, texto na tela e fala (curto, 7 a 25 s, gancho no primeiro segundo, final que dá vontade de rever ou mandar para alguém). " +
      "Para carrossel: o texto de cada slide (slide 1 = gancho, último = chamada). " +
      "Para imagem/story: o texto da arte. " +
      "\nResponda só com JSON: {\"posts\": [{\"dia\": 1, \"horario\": \"18:30\", \"formato\": \"reels|carrossel|imagem|story\", \"objetivo\": \"alcance|salvamento|conversao\", " +
      "\"titulo\": \"nome curto\", \"gancho\": \"primeira frase/tela\", \"roteiro\": [\"cena ou slide 1\", \"cena ou slide 2\"], " +
      "\"ideia_arte\": \"o que gravar ou desenhar, com o leão HERUPU quando fizer sentido\", \"legenda\": \"legenda pronta com CTA e 3 a 5 hashtags\"}]}";
    const j = await iaJson(sistema, "Desempenho recente:\n" + resumoParaIA(rel) + "\n\nJá publicados (não repetir):\n" + (ja || "(nenhum)"), 0.9);
    const lista = [].concat(j.posts || []).slice(0, n);
    if (!lista.length) throw new Error("A IA não devolveu o plano. Tente de novo.");
    const base = inicio && !isNaN(Date.parse(inicio)) ? new Date(inicio) : new Date(Date.now() + 864e5);
    const criados = [];
    lista.forEach((x, i) => {
      const dia = Math.min(Math.max(Number(x.dia) || i + 1, 1), 14) - 1;
      const [hh, mm] = String(x.horario || "18:30").split(":").map((v) => Number(v) || 0);
      // horário de Brasília (UTC-3), mesmo com o servidor em outro fuso
      const b3 = new Date(base.getTime() - 3 * 3600e3);
      const quando = new Date(Date.UTC(b3.getUTCFullYear(), b3.getUTCMonth(), b3.getUTCDate() + dia, hh + 3, mm));
      const p = limparPost({ tema: String(x.titulo || x.gancho || "").slice(0, 300), legenda: String(x.legenda || ""), redes: ["instagram"], quando: quando.toISOString() });
      p.formato = FORMATOS.includes(x.formato) ? x.formato : "imagem";
      p.objetivo = String(x.objetivo || "");
      p.gancho = String(x.gancho || "").slice(0, 300);
      p.roteiro = [].concat(x.roteiro || []).map((t) => String(t).slice(0, 400)).slice(0, 12);
      p.ideiaImagem = String(x.ideia_arte || "").slice(0, 500);
      p.origem = "plano"; p.foco = foco;
      db.posts.push(p); criados.push(p);
    });
    salvar();
    return criados;
  }

  // ------------------------------------------------------------ links rastreáveis (/r/codigo)
  function hojeLocal() { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
  function contarClique(codigo, res) {
    const l = db.links[codigo];
    if (!l) { res.writeHead(302, { Location: "https://tecnico.herupusistemas.com.br" }); return res.end(); }
    l.total = (l.total || 0) + 1;
    l.dias = l.dias || {}; l.dias[hojeLocal()] = (l.dias[hojeLocal()] || 0) + 1;
    salvar();
    const u = new URL(l.destino);
    if (!u.searchParams.has("utm_source")) { u.searchParams.set("utm_source", "herupu"); u.searchParams.set("utm_campaign", codigo); }
    res.writeHead(302, { Location: u.toString(), "Cache-Control": "no-store" });
    res.end();
  }
  function criarLink({ nome, destino, codigo, foco }) {
    let u;
    try { u = new URL(String(destino || "")); } catch { throw new Error("Endereço de destino inválido. Use https://..."); }
    if (u.protocol !== "https:") throw new Error("O destino precisa começar com https://");
    const cod = String(codigo || nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || crypto.randomBytes(3).toString("hex");
    if (db.links[cod]) throw new Error("Já existe um link com o código " + cod + ".");
    db.links[cod] = { nome: String(nome || cod).slice(0, 80), destino: u.toString(), foco: FOCOS[foco] ? foco : "", total: 0, dias: {}, criadoEm: new Date().toISOString() };
    salvar();
    return cod;
  }

  // ------------------------------------------------------------ mídia
  function salvarMidia(base64, tipo) {
    const ext = { "image/jpeg": "jpg", "image/png": "png" }[tipo];
    if (!ext) throw new Error("Envie a imagem em JPG ou PNG.");
    const dados = Buffer.from(base64, "base64");
    if (dados.length < 100) throw new Error("Imagem vazia.");
    const arquivo = crypto.randomBytes(12).toString("hex") + "." + ext;
    fs.writeFileSync(path.join(DIR_MIDIA, arquivo), dados);
    return { id: arquivo.split(".")[0], arquivo, url: "/midia/" + arquivo };
  }
  function servirMidia(res, url) {
    const nome = path.basename(url);
    if (!/^[a-f0-9]{24}\.(jpg|png|mp4)$/.test(nome)) { res.writeHead(404); return res.end(); }
    fs.readFile(path.join(DIR_MIDIA, nome), (err, d) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(nome)], "Cache-Control": "public, max-age=604800" });
      res.end(d);
    });
  }

  // ------------------------------------------------------------ posts
  function limparPost(entrada, existente) {
    const p = existente || { id: novoId(), criadoEm: new Date().toISOString(), status: "rascunho", resultados: {} };
    if (entrada.redes) p.redes = entrada.redes.filter((r) => PUBLICADORES[r]);
    if (!p.redes || !p.redes.length) p.redes = ["instagram"];
    if (typeof entrada.legenda === "string") p.legenda = entrada.legenda.slice(0, 2200);
    if (typeof entrada.tema === "string") p.tema = entrada.tema.slice(0, 300);
    if (Array.isArray(entrada.midias)) p.midias = entrada.midias.filter((m) => m && /^[a-f0-9]{24}\.(jpg|png)$/.test(m.arquivo)).slice(0, 10)
      .map((m) => ({ arquivo: m.arquivo, url: "/midia/" + m.arquivo }));
    if (!p.midias) p.midias = [];
    if (entrada.quando !== undefined) p.quando = entrada.quando && !isNaN(Date.parse(entrada.quando)) ? new Date(entrada.quando).toISOString() : null;
    if (p.legenda === undefined) p.legenda = "";
    if (typeof entrada.formato === "string" && FORMATOS.includes(entrada.formato)) p.formato = entrada.formato;
    p.atualizadoEm = new Date().toISOString();
    return p;
  }
  // ------------------------------------------------------------ nunca repetir conteúdo
  const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/#\S+/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/[^a-z0-9 ]/g, " ");
  const palavras = (t) => new Set(normalizar(t).split(/\s+/).filter((w) => w.length > 2));
  function parecido(a, b) {
    const A = palavras(a), B = palavras(b);
    if (A.size < 4 || B.size < 4) return 0;
    let comum = 0; A.forEach((w) => { if (B.has(w)) comum++; });
    return comum / Math.min(A.size, B.size);
  }
  let legendasIG = { em: 0, lista: [] };
  async function legendasJaPublicadas() {
    const daqui = db.posts.filter((p) => p.status === "publicado").map((p) => ({ texto: p.legenda, onde: "post publicado em " + new Date(p.atualizadoEm).toLocaleDateString("pt-BR") }));
    if (env("META_IG_ID") && metaPronta() && Date.now() - legendasIG.em > 10 * 60e3) {
      try {
        const d = (await graph("GET", `${env("META_IG_ID")}/media`, { fields: "caption,timestamp", limit: 40 }, IG)).data || [];
        legendasIG = { em: Date.now(), lista: d.map((m) => ({ texto: m.caption || "", onde: "Instagram em " + new Date(m.timestamp).toLocaleDateString("pt-BR") })) };
      } catch { /* sem acesso agora: usa só o histórico local */ }
    }
    return daqui.concat(legendasIG.lista);
  }
  async function conferirRepetido(post) {
    const ja = await legendasJaPublicadas();
    for (const x of ja) {
      if (parecido(post.legenda, x.texto) >= 0.7) return "Essa legenda é quase igual a um " + x.onde + ". Para não repetir conteúdo, mude o texto (ou gere outro com a IA).";
    }
    const imgs = new Set(post.midias.map((m) => m.arquivo));
    const mesmaImagem = db.posts.find((p) => p !== post && p.status === "publicado" && p.midias.length && p.midias.every((m) => imgs.has(m.arquivo)) && p.midias.length === post.midias.length);
    if (mesmaImagem) return "Essas mesmas imagens já foram publicadas. Use uma arte nova.";
    return "";
  }

  function problemasDoPost(p) {
    const lista = [];
    if (!p.legenda.trim()) lista.push("falta a legenda");
    if (p.redes.includes("instagram") && !p.midias.length && !p.video) lista.push("o Instagram exige imagem ou vídeo (toque em ✦ Gerar arte ou ✦ Gerar Reel)");
    if (p.redes.includes("instagram") && p.midias.some((m) => !/\.jpg$/.test(m.arquivo))) lista.push("o Instagram só aceita JPG");
    if (p.formato === "reels" && !p.video) lista.push("é um Reel: toque em ✦ Gerar Reel para o agente montar o vídeo com narração");
    if (p.formato === "story") lista.push("é um story: publique pelo app do Instagram (a API não agenda stories com figurinhas)");
    return lista;
  }

  // ------------------------------------------------------------ conectar pela Meta (login)
  const estadosOAuth = new Map(); // state -> validade
  const urlRetorno = () => URL_PUBLICA() + "/mkt/meta/retorno";
  function iniciarConexaoMeta() {
    if (!env("META_APP_ID") || !env("META_APP_SECRET")) throw new Error("Faltam META_APP_ID e META_APP_SECRET no .env do servidor.");
    const state = crypto.randomBytes(16).toString("hex");
    estadosOAuth.set(state, Date.now() + 10 * 60e3);
    const u = new URL(`https://www.facebook.com/${V()}/dialog/oauth`);
    u.searchParams.set("client_id", env("META_APP_ID"));
    u.searchParams.set("redirect_uri", urlRetorno());
    u.searchParams.set("state", state);
    if (env("META_LOGIN_CONFIG_ID")) u.searchParams.set("config_id", env("META_LOGIN_CONFIG_ID"));
    else u.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights,business_management");
    return u.toString();
  }
  async function trocarCodigo(code) {
    const base = `https://graph.facebook.com/${V()}`;
    const pedir = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(traduzirErroMeta(j.error || {}) || "Meta " + r.status); return j; };
    const q = (o) => new URLSearchParams(o).toString();
    const curto = await pedir(`${base}/oauth/access_token?` + q({ client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET"), redirect_uri: urlRetorno(), code }));
    const longo = await pedir(`${base}/oauth/access_token?` + q({ grant_type: "fb_exchange_token", client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET"), fb_exchange_token: curto.access_token }));
    // token de Página obtido de um token de usuário de longa duração não expira
    const paginas = (await pedir(`${base}/me/accounts?` + q({ fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50", access_token: longo.access_token }))).data || [];
    if (!paginas.length) throw new Error("Nenhuma Página do Facebook foi liberada no login. Refaça e marque a Página da empresa.");
    const pg = paginas.find((p) => p.instagram_business_account && /herupu/i.test(p.name)) || paginas.find((p) => p.instagram_business_account) || paginas[0];
    const c = {
      pageId: pg.id, pageNome: pg.name, pageToken: pg.access_token,
      igId: pg.instagram_business_account ? pg.instagram_business_account.id : "",
      igUsuario: pg.instagram_business_account ? pg.instagram_business_account.username : "",
      conectadoEm: new Date().toISOString(),
    };
    fs.writeFileSync(ARQ_META, JSON.stringify(c, null, 1), { mode: 0o600 });
    for (const k of ["META_PAGE_ID", "META_PAGE_TOKEN", "META_IG_ID"]) delete process.env["_ENV_" + k];
    process.env.META_IG_TOKEN = ""; // a conexão do painel usa o token da Página também para o Instagram
    conexaoMeta = aplicarConexaoMeta();
    usuarioIG = null;
    return c;
  }
  function paginaRetorno(res, ok, texto) {
    const destino = "/marketing.html?meta=" + (ok ? "ok" : "erro") + "&msg=" + encodeURIComponent(texto);
    res.writeHead(302, { Location: destino, "Cache-Control": "no-store" });
    res.end();
  }
  async function retornoMeta(req, res) {
    const u = new URL(req.url, "http://x");
    const state = u.searchParams.get("state") || "";
    const validade = estadosOAuth.get(state);
    estadosOAuth.delete(state);
    if (!validade || Date.now() > validade) return paginaRetorno(res, false, "O pedido de conexão expirou. Toque em Conectar de novo.");
    if (u.searchParams.get("error")) return paginaRetorno(res, false, "A conexão foi cancelada na Meta.");
    try {
      const c = await trocarCodigo(u.searchParams.get("code") || "");
      return paginaRetorno(res, true, `Conectado: Página ${c.pageNome}` + (c.igUsuario ? ` e Instagram @${c.igUsuario}` : " (sem Instagram ligado a essa Página)"));
    } catch (e) {
      console.log("[HERUPU] conexão Meta:", e.message);
      return paginaRetorno(res, false, e.message);
    }
  }

  // ------------------------------------------------------------ rotas
  async function tratar(req, res, url) {
    const auth = autorizado(req);
    if (!auth.ok) return enviarJson(res, auth.status, { erro: auth.erro });
    const corpo = req.method === "POST" ? JSON.parse((await lerCorpo(req, 12 * 1024 * 1024)) || "{}") : {};

    if (url === "/api/mkt/estado") {
      return enviarJson(res, 200, {
        meta: metaPronta(), instagram: Boolean(env("META_IG_ID")), facebook: Boolean(env("META_PAGE_ID")),
        conexao: conexaoMeta ? { pagina: conexaoMeta.pageNome, instagram: conexaoMeta.igUsuario, em: conexaoMeta.conectadoEm } : null,
        podeConectar: Boolean(env("META_APP_ID") && env("META_APP_SECRET")),
        temAppId: Boolean(env("META_APP_ID")),
        urlPublica: URL_PUBLICA(), config: db.config,
        posts: db.posts.slice().sort((a, b) => Date.parse(b.atualizadoEm) - Date.parse(a.atualizadoEm)).slice(0, 200)
          .map((p) => Object.assign({}, p, { problemas: problemasDoPost(p) })),
      });
    }
    if (url === "/api/mkt/midia") return enviarJson(res, 200, salvarMidia(String(corpo.base64 || ""), String(corpo.tipo || "")));
    if (url === "/api/mkt/salvar") {
      const existente = corpo.id ? acharPost(corpo.id) : null;
      if (existente && ["publicando", "publicado"].includes(existente.status)) return enviarJson(res, 409, { erro: "Esse post já foi publicado e não pode ser alterado." });
      const p = limparPost(corpo, existente);
      if (existente && existente.status === "aprovado") p.status = "rascunho"; // mudou: precisa aprovar de novo
      if (!existente) db.posts.push(p);
      salvar();
      return enviarJson(res, 200, Object.assign({}, p, { problemas: problemasDoPost(p) }));
    }
    if (url === "/api/mkt/acao") {
      const p = acharPost(String(corpo.id || ""));
      if (!p) return enviarJson(res, 404, { erro: "Post não encontrado." });
      const acao = String(corpo.acao || "");
      if (acao === "excluir") {
        if (p.status === "publicando") return enviarJson(res, 409, { erro: "Está publicando agora. Espere terminar." });
        db.posts = db.posts.filter((x) => x !== p); salvar(); return enviarJson(res, 200, { ok: true });
      }
      if (acao === "duplicar") {
        const c = limparPost({ redes: p.redes, legenda: p.legenda, tema: p.tema, midias: p.midias, quando: null });
        db.posts.push(c); salvar(); return enviarJson(res, 200, c);
      }
      if (acao === "desaprovar" && p.status === "aprovado") { p.status = "rascunho"; salvar(); return enviarJson(res, 200, p); }
      const prob = problemasDoPost(p);
      if (prob.length) return enviarJson(res, 400, { erro: "Antes de aprovar: " + prob.join(", ") + "." });
      if (acao === "aprovar" || acao === "publicar") {
        const rep = p.status === "erro" ? "" : await conferirRepetido(p); // "tentar de novo" de um post com erro não é repetição
        if (rep) return enviarJson(res, 409, { erro: rep });
      }
      if (acao === "aprovar") {
        if (!p.quando) return enviarJson(res, 400, { erro: "Escolha a data e hora, ou use Publicar agora." });
        p.status = "aprovado"; salvar(); return enviarJson(res, 200, p);
      }
      if (acao === "publicar") {
        if (p.status === "publicando") return enviarJson(res, 409, { erro: "Já está publicando." });
        if (p.status === "publicado") return enviarJson(res, 409, { erro: "Esse post já foi publicado." });
        const r = await publicar(p);
        return enviarJson(res, 200, r);
      }
      return enviarJson(res, 400, { erro: "Ação desconhecida." });
    }
    if (url === "/api/mkt/legenda") return enviarJson(res, 200, await gerarLegenda({ tema: String(corpo.tema || "").slice(0, 500), rede: corpo.rede, extra: String(corpo.extra || "").slice(0, 500) }));
    if (url === "/api/mkt/rascunho-voz") {
      const tema = String(corpo.tema || "").slice(0, 500);
      if (!tema) return enviarJson(res, 400, { erro: "Falta o tema do post." });
      const g = await gerarLegenda({ tema, rede: (corpo.redes || [])[0] });
      const p = limparPost({ tema, legenda: g.legenda, redes: corpo.redes, quando: corpo.quando || null });
      p.origem = "voz"; p.ideiaImagem = g.ideia_imagem;
      db.posts.push(p); salvar();
      return enviarJson(res, 200, p);
    }
    if (url === "/api/mkt/comentarios") return enviarJson(res, 200, { comentarios: await comentariosPendentes() });
    if (url === "/api/mkt/sugerir") return enviarJson(res, 200, await sugerirResposta(String(corpo.texto || "").slice(0, 1000), String(corpo.post || "")));
    if (url === "/api/mkt/responder") {
      const texto = String(corpo.texto || "").trim().slice(0, 1000);
      if (!texto) return enviarJson(res, 400, { erro: "Resposta vazia." });
      await responderComentario(String(corpo.id || ""), texto);
      return enviarJson(res, 200, { ok: true });
    }
    if (url === "/api/mkt/ignorar") { db.respondidos[String(corpo.id || "")] = "ignorado"; salvar(); return enviarJson(res, 200, { ok: true }); }
    if (url === "/api/mkt/relatorio") return enviarJson(res, 200, await relatorio());
    if (url === "/api/mkt/arte" || url === "/api/mkt/reel") {
      if (!estudio) return enviarJson(res, 503, { erro: "Estúdio indisponível no servidor (rode: npm install e apt-get install -y ffmpeg fonts-montserrat)." });
      const p = acharPost(String(corpo.id || ""));
      if (!p) return enviarJson(res, 404, { erro: "Post não encontrado." });
      if (["publicando", "publicado"].includes(p.status)) return enviarJson(res, 409, { erro: "Post já publicado." });
      const roteiro = (p.roteiro && p.roteiro.length ? p.roteiro : [p.gancho || p.tema || p.legenda.split("\n")[0]]).filter(Boolean);
      const limpar = (t) => String(t).replace(/^\s*(\d+[-–]?\d*\s*s?:|slide\s*\d+:|cena\s*\d+:)\s*/i, "").trim();
      if (url === "/api/mkt/arte") {
        const titulo = limpar(p.gancho || roteiro[0] || p.tema);
        const m = await estudio.arte({ titulo, destaque: "", texto: roteiro.slice(p.gancho ? 0 : 1, 4).map(limpar).join(" · ").slice(0, 220), chamada: p.foco === "clientes" ? "Peça seu técnico pelo app" : "Cadastro grátis · link na bio" });
        p.midias = (p.midias || []).concat([m]).slice(-10);
      } else {
        // cada linha do roteiro vira uma cena: texto grande na tela + o Antonio narrando
        const cenas = roteiro.slice(0, 7).map((t) => {
          const txt = limpar(t), fala = (txt.match(/fala:\s*(.+)$/i) || [])[1] || txt.replace(/texto:\s*/i, "");
          const tela = ((txt.match(/texto(?: na tela)?:\s*([^—|]+)/i) || [])[1] || txt).split(/fala:/i)[0].slice(0, 90);
          return { tela: tela.trim(), fala: fala.trim().slice(0, 300) };
        });
        p.video = await estudio.reel(cenas, p.foco === "clientes" ? "Peça pelo app HERUPU" : "Cadastro grátis · link na bio");
        p.formato = "reels";
      }
      if (p.status === "aprovado") p.status = "rascunho";
      p.atualizadoEm = new Date().toISOString(); salvar();
      return enviarJson(res, 200, Object.assign({}, p, { problemas: problemasDoPost(p) }));
    }
    if (url === "/api/mkt/diagnostico") return enviarJson(res, 200, await diagnostico());
    if (url === "/api/mkt/plano") return enviarJson(res, 200, { posts: await planoDaSemana({ foco: corpo.foco, quantidade: corpo.quantidade, inicio: corpo.inicio }) });
    if (url === "/api/mkt/links") return enviarJson(res, 200, { links: db.links, base: URL_PUBLICA() + "/r/" });
    if (url === "/api/mkt/link") return enviarJson(res, 200, { codigo: criarLink(corpo) });
    if (url === "/api/mkt/link-excluir") { delete db.links[String(corpo.codigo || "")]; salvar(); return enviarJson(res, 200, { ok: true }); }
    if (url === "/api/mkt/meta/segredo") { await salvarSegredoApp(corpo.segredo); return enviarJson(res, 200, { ok: true }); }
    if (url === "/api/mkt/meta/iniciar") return enviarJson(res, 200, { url: iniciarConexaoMeta() });
    if (url === "/api/mkt/senha") {
      const nova = String(corpo.nova || "");
      if (nova.length < 6) return enviarJson(res, 400, { erro: "A senha nova precisa ter pelo menos 6 caracteres." });
      const sal = crypto.randomBytes(16).toString("hex");
      db.senha = { sal, hash: crypto.scryptSync(nova, sal, 32).toString("hex"), em: new Date().toISOString() };
      salvar();
      return enviarJson(res, 200, { ok: true });
    }
    if (url === "/api/mkt/config") {
      if (typeof corpo.contexto === "string") db.config.contexto = corpo.contexto.slice(0, 4000) || CONTEXTO_PADRAO;
      if (typeof corpo.kit === "string") db.config.kit = corpo.kit.slice(0, 4000) || KIT_PADRAO;
      if (typeof corpo.autoResponder === "boolean") db.config.autoResponder = corpo.autoResponder;
      salvar();
      return enviarJson(res, 200, db.config);
    }
    return enviarJson(res, 404, { erro: "rota de marketing desconhecida" });
  }

  function rotear(req, res, url) {
    if (req.method === "GET" && url.startsWith("/midia/")) { servirMidia(res, url); return true; }
    if (req.method === "GET" && /^\/r\/[a-z0-9-]{1,30}$/.test(url)) { contarClique(url.slice(3), res); return true; }
    if (req.method === "GET" && url === "/mkt/meta/retorno") {
      retornoMeta(req, res).catch((e) => paginaRetorno(res, false, e.message));
      return true;
    }
    if (!url.startsWith("/api/mkt/")) return false;
    tratar(req, res, url).catch((e) => {
      console.log("[HERUPU] marketing:", e.message);
      enviarJson(res, e instanceof SyntaxError ? 400 : 502, { erro: e instanceof SyntaxError ? "Pedido inválido." : e.message });
    });
    return true;
  }

  return { rotear, publicar, rodarAgenda, _db: () => db };
};
