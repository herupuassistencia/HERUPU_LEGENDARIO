/*
 * HERUPU LEGENDÁRIO — publicador do TikTok (Content Posting API oficial, sem navegador e sem Claude).
 *
 * Precisa das chaves do app do TikTok (as mesmas do app da Central de Marketing):
 *   TIKTOK_CLIENT_KEY (ou TIKTOK_CLIENT_ID) e TIKTOK_CLIENT_SECRET no .env,
 *   ou coladas no painel em Ajustes → TikTok.
 * No app do TikTok (developers.tiktok.com), em Login Kit, cadastre o Redirect URI:
 *   https://ia.herupusistemas.com.br/mkt/tiktok/retorno
 * e use os escopos user.info.basic, video.upload e video.publish (Content Posting API com Direct Post ligado).
 *
 * Enquanto o app do TikTok não passa pela auditoria, o TikTok só aceita posts PRIVADOS (SELF_ONLY).
 * O publicador escolhe "público" sozinho assim que o TikTok liberar.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API = "https://open.tiktokapis.com/v2";

module.exports = function criarTikTok({ DIR_DADOS, DIR_MIDIA, URL_PUBLICA }) {
  const ARQ_TOKEN = path.join(DIR_DADOS, "tiktok.json");
  const ARQ_APP = path.join(DIR_DADOS, "tiktok-app.json");
  const ler = (a) => { try { return JSON.parse(fs.readFileSync(a, "utf8")); } catch { return null; } };
  let conta = ler(ARQ_TOKEN);
  let app = ler(ARQ_APP) || {};
  const chave = () => process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID || app.chave || "";
  const segredo = () => process.env.TIKTOK_CLIENT_SECRET || app.segredo || "";
  const retorno = () => URL_PUBLICA() + "/mkt/tiktok/retorno";
  const salvarConta = () => fs.writeFileSync(ARQ_TOKEN, JSON.stringify(conta, null, 1), { mode: 0o600 });

  function estado() {
    return {
      chaves: Boolean(chave() && segredo()),
      conectado: Boolean(conta && conta.refresh_token && Date.now() < (conta.refreshAte || 0)),
      usuario: conta ? conta.usuario || "" : "",
      em: conta ? conta.conectadoEm : null,
      privado: conta ? conta.soPrivado !== false : true,
      redirect: retorno(),
    };
  }
  function salvarChaves({ chave: k, segredo: s }) {
    k = String(k || "").trim(); s = String(s || "").trim();
    if (!/^[A-Za-z0-9]{8,40}$/.test(k)) throw new Error("Client Key inválida: copie de developers.tiktok.com → seu app → Client key.");
    if (s.length < 16 || /\s/.test(s)) throw new Error("Client Secret inválido: copie de developers.tiktok.com → seu app → Client secret.");
    app = { chave: k, segredo: s, em: new Date().toISOString() };
    fs.writeFileSync(ARQ_APP, JSON.stringify(app), { mode: 0o600 });
  }

  // ------------------------------------------------------------ login (OAuth)
  const estados = new Map();
  function iniciar() {
    if (!chave() || !segredo()) throw new Error("Faltam as chaves do app do TikTok (Client Key e Client Secret). Cole em Ajustes → TikTok.");
    const state = crypto.randomBytes(16).toString("hex");
    estados.set(state, Date.now() + 10 * 60e3);
    const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
    u.searchParams.set("client_key", chave());
    u.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", retorno());
    u.searchParams.set("state", state);
    return u.toString();
  }
  async function token(params) {
    const r = await fetch(API + "/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams(Object.assign({ client_key: chave(), client_secret: segredo() }, params)),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error || !j.access_token) {
      const d = String(j.error_description || j.error || r.status);
      if (/redirect/i.test(d)) throw new Error("O TikTok recusou o endereço de retorno. Cadastre " + retorno() + " em Login Kit → Redirect URI do app.");
      if (/client/i.test(d)) throw new Error("O TikTok recusou as chaves do app (Client Key/Secret). Confira em developers.tiktok.com.");
      throw new Error("TikTok: " + d.slice(0, 200));
    }
    return j;
  }
  function guardarToken(j) {
    conta = Object.assign(conta || {}, {
      access_token: j.access_token, refresh_token: j.refresh_token || (conta && conta.refresh_token),
      openId: j.open_id || (conta && conta.openId), escopos: j.scope || (conta && conta.escopos),
      acessoAte: Date.now() + (Number(j.expires_in) || 86400) * 1000 - 5 * 60e3,
      refreshAte: Date.now() + (Number(j.refresh_expires_in) || 31536000) * 1000,
    });
    salvarConta();
  }
  async function receberRetorno(u) {
    const state = u.searchParams.get("state") || "";
    const val = estados.get(state); estados.delete(state);
    if (!val || Date.now() > val) throw new Error("O pedido de conexão expirou. Toque em Conectar TikTok de novo.");
    if (u.searchParams.get("error")) throw new Error("A conexão foi cancelada no TikTok.");
    const j = await token({ code: u.searchParams.get("code") || "", grant_type: "authorization_code", redirect_uri: retorno() });
    conta = { conectadoEm: new Date().toISOString() };
    guardarToken(j);
    if (!/video\.publish/.test(conta.escopos || "")) throw new Error("O login não liberou a permissão de publicar (video.publish). Ative o Content Posting API / Direct Post no app do TikTok e conecte de novo.");
    try {
      const i = await chamar("GET", "/user/info/?fields=open_id,display_name");
      conta.usuario = (i.user && i.user.display_name) || ""; salvarConta();
    } catch { /* sem nome: tudo bem */ }
    return conta;
  }
  async function acesso() {
    if (!conta || !conta.refresh_token) throw new Error("TikTok não conectado. Toque em Conectar TikTok em Ajustes.");
    if (Date.now() < (conta.acessoAte || 0)) return conta.access_token;
    if (Date.now() > (conta.refreshAte || 0)) throw new Error("A conexão com o TikTok venceu. Conecte de novo em Ajustes.");
    guardarToken(await token({ grant_type: "refresh_token", refresh_token: conta.refresh_token }));
    return conta.access_token;
  }
  async function chamar(metodo, caminho, corpo) {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: { Authorization: "Bearer " + (await acesso()), "Content-Type": "application/json; charset=UTF-8" },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json().catch(() => ({}));
    const e = j.error || {};
    if (!r.ok || (e.code && e.code !== "ok")) throw new Error(traduzir(e, r.status));
    return j.data || {};
  }
  function traduzir(e, status) {
    const c = String(e.code || ""), m = String(e.message || "");
    if (c === "access_token_invalid" || status === 401) return "A conexão com o TikTok caiu. Conecte de novo em Ajustes.";
    if (c === "scope_not_authorized") return "O app do TikTok não tem permissão para publicar (video.publish). Conecte de novo.";
    if (c === "spam_risk_too_many_posts" || c === "rate_limit_exceeded") return "O TikTok limitou a quantidade de posts por hoje. O próximo sai no horário seguinte.";
    if (c === "unaudited_client_can_only_post_to_private_accounts") return "App do TikTok ainda sem auditoria: o TikTok só aceita publicar com a conta em modo PRIVADO. Deixe a conta privada ou peça a auditoria do app.";
    if (c === "privacy_level_option_mismatch") return "O TikTok recusou o nível de privacidade escolhido.";
    return "TikTok: " + (m || c || status).toString().slice(0, 250);
  }

  // ------------------------------------------------------------ publicar vídeo
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  function tituloDe(legenda) {
    // título do TikTok: até 2200 caracteres; "link na bio" serve igual
    return String(legenda || "").slice(0, 2150);
  }
  async function publicar(post) {
    const video = post.video || post.videoTiktok;
    if (!video) throw new Error("O TikTok só publica vídeo: este post não tem Reel.");
    const arq = path.join(DIR_MIDIA, path.basename(video.arquivo));
    const tam = fs.statSync(arq).size;
    const info = await chamar("POST", "/post/publish/creator_info/query/");
    const opcoes = info.privacy_level_options || [];
    const privacidade = opcoes.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : (opcoes.includes("SELF_ONLY") ? "SELF_ONLY" : opcoes[0] || "SELF_ONLY");
    if (conta.soPrivado !== (privacidade !== "PUBLIC_TO_EVERYONE")) { conta.soPrivado = privacidade !== "PUBLIC_TO_EVERYONE"; salvarConta(); }
    // regra do TikTok: pedaços de 5 a 64 MB, quantidade = tamanho ÷ pedaço arredondado para baixo; o último leva o resto
    const pedaco = tam <= 64 * 1024 * 1024 ? tam : 10 * 1024 * 1024;
    const total = Math.max(1, Math.floor(tam / pedaco));
    const ini = await chamar("POST", "/post/publish/video/init/", {
      post_info: {
        title: tituloDe(post.legenda), privacy_level: privacidade,
        disable_comment: Boolean(info.comment_disabled), disable_duet: Boolean(info.duet_disabled), disable_stitch: Boolean(info.stitch_disabled),
        video_cover_timestamp_ms: 1000,
      },
      source_info: { source: "FILE_UPLOAD", video_size: tam, chunk_size: pedaco, total_chunk_count: total },
    });
    if (!ini.upload_url || !ini.publish_id) throw new Error("O TikTok não devolveu o endereço de envio.");
    const fd = fs.openSync(arq, "r");
    try {
      for (let i = 0; i < total; i++) {
        const inicio = i * pedaco, fim = i === total - 1 ? tam - 1 : inicio + pedaco - 1;
        const buf = Buffer.alloc(fim - inicio + 1);
        fs.readSync(fd, buf, 0, buf.length, inicio);
        const r = await fetch(ini.upload_url, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length), "Content-Range": `bytes ${inicio}-${fim}/${tam}` },
          body: buf, signal: AbortSignal.timeout(180000),
        });
        if (![200, 201, 206].includes(r.status)) throw new Error("O TikTok recusou o envio do vídeo (" + r.status + ").");
      }
    } finally { fs.closeSync(fd); }
    // espera o TikTok processar (até ~5 min)
    for (let i = 0; i < 60; i++) {
      await dormir(5000);
      const st = await chamar("POST", "/post/publish/status/fetch/", { publish_id: ini.publish_id });
      if (st.status === "PUBLISH_COMPLETE") {
        const idPub = (st.publicaly_available_post_id || [])[0];
        return { id: String(idPub || ini.publish_id), link: "", privado: privacidade !== "PUBLIC_TO_EVERYONE" };
      }
      if (st.status === "FAILED") throw new Error("O TikTok recusou o vídeo: " + (st.fail_reason || "sem motivo"));
    }
    // ainda processando: o TikTok termina sozinho; não reenviamos para nunca duplicar
    return { id: ini.publish_id, link: "", processando: true, privado: privacidade !== "PUBLIC_TO_EVERYONE" };
  }
  function desconectar() { conta = null; try { fs.rmSync(ARQ_TOKEN); } catch { /* já não havia */ } }

  return { estado, salvarChaves, iniciar, receberRetorno, publicar, desconectar };
};
