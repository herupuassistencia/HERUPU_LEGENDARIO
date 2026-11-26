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
 *   META_IG_ID        ID da conta do Instagram profissional ligada à Página
 *   META_GRAPH_VERSAO versão da Graph API (padrão v23.0)
 *   MKT_URL_PUBLICA   endereço público deste servidor (padrão https://ia.herupusistemas.com.br)
 *
 * Os dados ficam em dados/marketing.json e as imagens em dados/midia/ (fora do Git).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function criarMarketing({ chamarCerebro, enviarJson, lerCorpo, TIPOS }) {
  const DIR_DADOS = path.join(__dirname, "dados");
  const DIR_MIDIA = path.join(DIR_DADOS, "midia");
  const ARQ = path.join(DIR_DADOS, "marketing.json");
  fs.mkdirSync(DIR_MIDIA, { recursive: true });

  const env = (k, padrao = "") => process.env[k] || padrao;
  const SENHA = () => env("MKT_SENHA");
  const V = () => env("META_GRAPH_VERSAO", "v23.0");
  const URL_PUBLICA = () => env("MKT_URL_PUBLICA", "https://ia.herupusistemas.com.br").replace(/\/+$/, "");
  const metaPronta = () => Boolean(env("META_PAGE_TOKEN") && (env("META_IG_ID") || env("META_PAGE_ID")));

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
  let db = Object.assign({ posts: [], respondidos: {}, config: {} }, carregar());
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
  function autorizado(req) {
    const senha = SENHA();
    if (!senha) return { ok: false, status: 503, erro: "Agente de marketing desligado: falta MKT_SENHA no .env do servidor." };
    const ip = String(req.headers["x-real-ip"] || req.socket.remoteAddress || "");
    const t = tentativas.get(ip);
    if (t && t.n >= 8 && Date.now() < t.ate) return { ok: false, status: 429, erro: "Muitas tentativas. Espere 15 minutos." };
    const dada = Buffer.from(String(req.headers["x-herupu-senha"] || ""));
    const certa = Buffer.from(senha);
    if (dada.length === certa.length && crypto.timingSafeEqual(dada, certa)) { tentativas.delete(ip); return { ok: true }; }
    const n = (t && Date.now() < t.ate ? t.n : 0) + 1;
    tentativas.set(ip, { n, ate: Date.now() + 15 * 60e3 });
    return { ok: false, status: 401, erro: "Senha do marketing incorreta." };
  }

  // ------------------------------------------------------------ Graph API (Meta)
  async function graph(metodo, caminho, params = {}) {
    const url = new URL(`https://graph.facebook.com/${V()}/${caminho}`);
    const corpo = new URLSearchParams();
    const alvo = metodo === "GET" ? url.searchParams : corpo;
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) alvo.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    alvo.append("access_token", env("META_PAGE_TOKEN"));
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
      const j = await graph("GET", id, { fields: "status_code,status" });
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
    if (!urls.length) throw new Error("O Instagram exige pelo menos uma imagem.");
    let criacao;
    if (urls.length === 1) {
      criacao = (await graph("POST", `${ig}/media`, { image_url: urls[0], caption: post.legenda })).id;
    } else {
      const filhos = [];
      for (const u of urls) filhos.push((await graph("POST", `${ig}/media`, { image_url: u, is_carousel_item: "true" })).id);
      for (const f of filhos) await esperarContainer(f);
      criacao = (await graph("POST", `${ig}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: post.legenda })).id;
    }
    await esperarContainer(criacao);
    const pub = await graph("POST", `${ig}/media_publish`, { creation_id: criacao });
    let link = "";
    try { link = (await graph("GET", pub.id, { fields: "permalink" })).permalink || ""; } catch { /* sem link */ }
    return { id: pub.id, link };
  }

  async function publicarFacebook(post) {
    const pg = env("META_PAGE_ID");
    if (!pg) throw new Error("Falta META_PAGE_ID no .env.");
    const urls = post.midias.map((m) => URL_PUBLICA() + "/midia/" + m.arquivo).slice(0, 10);
    let j;
    if (!urls.length) j = await graph("POST", `${pg}/feed`, { message: post.legenda });
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
    if (trabalhando || !SENHA()) return;
    trabalhando = true;
    try {
      const agora = Date.now();
      const vencidos = db.posts.filter((p) => p.status === "aprovado" && p.quando && Date.parse(p.quando) <= agora);
      for (const p of vencidos) await publicar(p).catch((e) => console.log("[HERUPU] agenda:", e.message));
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
    const sistema =
      "Você é o social media da empresa. " + ESTILO + " Contexto da empresa: " + db.config.contexto + " " +
      "Formato da legenda: 1ª linha é um gancho de no máximo 10 palavras; depois 3 a 6 linhas curtas de valor; " +
      "uma chamada para ação clara; no fim 3 a 5 hashtags relevantes. " +
      (rede === "facebook" ? "Para Facebook pode ser um pouco mais explicativa e com o link escrito por extenso. " : "No Instagram, o link vai como 'link na bio'. ") +
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
    if (!usuarioIG) usuarioIG = (await graph("GET", env("META_IG_ID"), { fields: "username" })).username || "";
    return usuarioIG;
  }
  async function comentariosPendentes() {
    const ig = env("META_IG_ID");
    if (!ig) throw new Error("Falta META_IG_ID no .env.");
    const eu = await meuUsuarioIG();
    const midias = (await graph("GET", `${ig}/media`, { fields: "id,caption,permalink,timestamp,comments_count", limit: 15 })).data || [];
    const saida = [];
    for (const m of midias.filter((x) => x.comments_count > 0)) {
      const cs = (await graph("GET", `${m.id}/comments`, { fields: "id,text,username,timestamp,replies{username}", limit: 50 })).data || [];
      for (const c of cs) {
        if (c.username === eu || db.respondidos[c.id]) continue;
        if ((c.replies && c.replies.data || []).some((r) => r.username === eu)) continue;
        saida.push({ id: c.id, texto: c.text, usuario: c.username, quando: c.timestamp, post: (m.caption || "").slice(0, 120), link: m.permalink });
      }
    }
    return saida.sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando));
  }
  async function responderComentario(id, texto) {
    await graph("POST", `${id}/replies`, { message: texto });
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
    const conta = await graph("GET", ig, { fields: "username,followers_count,media_count" });
    const midias = (await graph("GET", `${ig}/media`, { fields: "id,caption,timestamp,like_count,comments_count,permalink,media_type", limit: 20 })).data || [];
    for (const m of midias) {
      m.alcance = null;
      for (const metricas of ["reach,saved,shares", "reach"]) {
        try {
          const ins = (await graph("GET", `${m.id}/insights`, { metric: metricas })).data || [];
          for (const i of ins) m[{ reach: "alcance", saved: "salvos", shares: "compartilhamentos" }[i.name] || i.name] = i.values && i.values[0] ? i.values[0].value : i.total_value && i.total_value.value;
          break;
        } catch { /* métrica não disponível para esse tipo de post */ }
      }
      m.caption = (m.caption || "").slice(0, 90);
    }
    return { conta, midias };
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
    if (!/^[a-f0-9]{24}\.(jpg|png)$/.test(nome)) { res.writeHead(404); return res.end(); }
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
    p.atualizadoEm = new Date().toISOString();
    return p;
  }
  function problemasDoPost(p) {
    const lista = [];
    if (!p.legenda.trim()) lista.push("falta a legenda");
    if (p.redes.includes("instagram") && !p.midias.length) lista.push("o Instagram exige imagem");
    if (p.redes.includes("instagram") && p.midias.some((m) => !/\.jpg$/.test(m.arquivo))) lista.push("o Instagram só aceita JPG");
    return lista;
  }

  // ------------------------------------------------------------ rotas
  async function tratar(req, res, url) {
    const auth = autorizado(req);
    if (!auth.ok) return enviarJson(res, auth.status, { erro: auth.erro });
    const corpo = req.method === "POST" ? JSON.parse((await lerCorpo(req, 12 * 1024 * 1024)) || "{}") : {};

    if (url === "/api/mkt/estado") {
      return enviarJson(res, 200, {
        meta: metaPronta(), instagram: Boolean(env("META_IG_ID")), facebook: Boolean(env("META_PAGE_ID")),
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
    if (!url.startsWith("/api/mkt/")) return false;
    tratar(req, res, url).catch((e) => {
      console.log("[HERUPU] marketing:", e.message);
      enviarJson(res, e instanceof SyntaxError ? 400 : 502, { erro: e instanceof SyntaxError ? "Pedido inválido." : e.message });
    });
    return true;
  }

  return { rotear, publicar, rodarAgenda, _db: () => db };
};
