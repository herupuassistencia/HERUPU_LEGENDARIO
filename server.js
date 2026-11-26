/*
 * HERUPU LEGENDÁRIO — servidor único (roda no Contabo, atrás do nginx com HTTPS).
 *
 * Entrega o app (pasta site/) e três rotas, com a chave do Google guardada só aqui:
 *   POST /api/chat    cérebro (Gemini) para o modo por turnos
 *   POST /api/token   senha temporária para a conversa AO VIVO (Gemini Live)
 *   POST /api/falar   voz natural Antonio (Microsoft), a mesma do PC
 *   GET  /saude       diz se está no ar e se a chave está configurada
 *   /api/mkt/*        agente de marketing (ver marketing.js), protegido por MKT_SENHA
 *
 * Config por variáveis de ambiente (arquivo .env, formato CHAVE=valor):
 *   GEMINI_API_KEY         (obrigatória)
 *   PORTA                  (padrão 8790)
 *   HERUPU_VOZ             (padrão pt-BR-AntonioNeural)
 *   HERUPU_MODELO_AO_VIVO  (padrão gemini-3.8-live)
 *   HERUPU_MODELO_TEXTO    (padrão gemini-flash-lite-latest)
 *
 * Precisa só do Node 18+ e do pacote msedge-tts.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- lê o .env (CHAVE=valor), sem depender de pacote
const arqEnv = path.join(__dirname, ".env");
if (fs.existsSync(arqEnv)) {
  for (const linha of fs.readFileSync(arqEnv, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORTA = Number(process.env.PORTA || 8790);
const CHAVE = process.env.GEMINI_API_KEY || "";
const FREELLM_URL = process.env.FREELLMAPI_URL || "http://127.0.0.1:3011";
const FREELLM_KEY = process.env.FREELLMAPI_KEY || "";
const VOZ = process.env.HERUPU_VOZ || "pt-BR-AntonioNeural";
const VOZ_RATE = process.env.HERUPU_VOZ_RATE || "+3%";    // ritmo ágil e natural (nem lento, nem corrido)
const VOZ_PITCH = process.env.HERUPU_VOZ_PITCH || "-6Hz"; // um pouco mais grave, mas natural (forçar demais soa robótico)
const MODELO_AO_VIVO = process.env.HERUPU_MODELO_AO_VIVO || "gemini-3.8-live";
const MODELO_TEXTO = process.env.HERUPU_MODELO_TEXTO || "gemini-flash-lite-latest";
const MODELOS = [...new Set([MODELO_TEXTO, "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.8-flash"])];
const DIR_SITE = path.join(__dirname, "site");

if (!CHAVE) console.warn("[HERUPU] Atenção: GEMINI_API_KEY não definida no .env — o cérebro e a voz ao vivo não vão responder.");

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".map": "application/json",
};

function enviarJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
}

function lerCorpo(req, limiteBytes) {
  return new Promise((resolver, rejeitar) => {
    let tam = 0; const partes = [];
    req.on("data", (p) => { tam += p.length; if (tam > limiteBytes) { rejeitar(new Error("grande demais")); req.destroy(); } else partes.push(p); });
    req.on("end", () => resolver(Buffer.concat(partes).toString("utf8")));
    req.on("error", rejeitar);
  });
}

// descobre os modelos de texto disponíveis na conta (resiliente a renomeações/aposentadorias do Google)
let modelosTextoCache = null;
function pontModelo(n) {
  let p = 0;
  if (/flash-lite/.test(n)) p += 3; else if (/flash/.test(n)) p += 2; else if (/pro/.test(n)) p += 1;
  if (/latest/.test(n)) p += 1;
  if (/preview|exp|thinking/.test(n)) p -= 1;
  return p;
}
async function acharModelosTexto() {
  if (modelosTextoCache) return modelosTextoCache;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
      { headers: { "x-goog-api-key": CHAVE }, signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    const nomes = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")
        && /gemini/i.test(m.name) && !/tts|embedding|aqa|imagen|image|vision|live|learnlm/i.test(m.name))
      .map((m) => m.name.replace(/^models\//, ""));
    nomes.sort((a, b) => pontModelo(b) - pontModelo(a));
    modelosTextoCache = nomes.slice(0, 6);
    if (modelosTextoCache.length) console.log("[HERUPU] modelos de texto:", modelosTextoCache.join(", "));
  } catch (e) { modelosTextoCache = null; }
  return modelosTextoCache || [];
}

// ------------------------------------------------------------------ cérebro (modo por turnos)
async function rotaChat(req, res) {
  if (!CHAVE && !FREELLM_KEY) return enviarJson(res, 500, { fala: "O servidor ainda não tem a chave do Google configurada.", acao: null });
  let corpo;
  try { corpo = JSON.parse(await lerCorpo(req, 8 * 1024 * 1024)); } catch { return enviarJson(res, 400, { erro: "pedido inválido" }); }
  const conteudos = (Array.isArray(corpo.historico) ? corpo.historico : []).slice(-12)
    .filter((m) => m && (m.papel === "user" || m.papel === "model") && typeof m.texto === "string")
    .map((m) => ({ role: m.papel, parts: [{ text: m.texto.slice(0, 4000) }] }));
  const atual = { role: "user", parts: [{ text: String(corpo.mensagem || "").slice(0, 12000) }] };
  const img = corpo.imagem;
  if (img && /^image\/(jpeg|png|webp)$/.test(img.tipo || "") && typeof img.base64 === "string") {
    atual.parts.push({ inline_data: { mime_type: img.tipo, data: img.base64 } });
  }
  conteudos.push(atual);
  const pedido = {
    systemInstruction: { parts: [{ text: String(corpo.instrucoes || "").slice(0, 8000) }] },
    contents: conteudos,
    generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
  };
  const r = await chamarCerebro(pedido);
  if (r.ok) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(r.texto);
  }
  if (r.duro) return enviarJson(res, 502, { fala: "O cérebro não respondeu agora. Tente de novo.", acao: null });
  return enviarJson(res, 502, { fala: "A inteligência está com muita procura neste momento e recusou o pedido. Aguarde alguns segundos e tente de novo.", acao: null, detalhe: r.erro });
}

// Cérebro compartilhado (chat e agente de marketing): FreeLLMAPI primeiro (várias IAs grátis),
// depois os modelos do Google. Devolve { ok, texto } ou { ok:false, erro, duro }.
async function chamarCerebro(pedido) {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  let ultimoErro = "sem resposta";
  if (FREELLM_KEY) {
    try {
      const r = await fetch(FREELLM_URL + "/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": FREELLM_KEY },
        body: JSON.stringify(pedido),
        signal: AbortSignal.timeout(30000),
      });
      const j = await r.json().catch(() => ({}));
      const txt = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (r.ok && txt.trim()) return { ok: true, texto: txt };
      console.warn("[HERUPU] FreeLLMAPI falhou:", r.status, (j.error && j.error.message) || "");
    } catch (e) { console.warn("[HERUPU] FreeLLMAPI fora do ar:", e.message); }
  }
  if (!CHAVE) return { ok: false, erro: "sem chave do Google e FreeLLMAPI indisponível" };
  // modelos que a conta realmente tem agora + a lista fixa como reserva (resiliente a renomeações)
  const descobertos = await acharModelosTexto();
  const listaModelos = [...new Set([...descobertos, ...MODELOS])];
  // Se todos estiverem sobrecarregados ("high demand"), espera um pouco e tenta tudo de novo.
  for (let rodada = 0; rodada < 3; rodada++) {
    for (const modelo of listaModelos) {
      for (const extra of [{ thinkingConfig: { thinkingLevel: "low" } }, {}]) {
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": CHAVE },
            body: JSON.stringify({ ...pedido, generationConfig: { ...pedido.generationConfig, ...extra } }),
            signal: AbortSignal.timeout(20000),
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok) {
            const partes = j?.candidates?.[0]?.content?.parts || [];
            return { ok: true, texto: partes.map((p) => p.text || "").join("") };
          }
          ultimoErro = `${modelo} ${r.status}: ${(j.error && j.error.message) || ""}`.slice(0, 200);
          console.log("[HERUPU] cérebro:", ultimoErro);
          if (r.status === 429 || r.status >= 500) break; // sobrecarga/instável: passa para o próximo modelo
          if (r.status !== 400 && r.status !== 404) return { ok: false, erro: ultimoErro, duro: true };
        } catch (e) { ultimoErro = `${modelo}: ${e.message}`; console.log("[HERUPU] cérebro:", ultimoErro); break; }
      }
    }
    if (rodada < 2) await dormir(1200 * (rodada + 1));
  }
  modelosTextoCache = null; // falhou tudo: redescobre os modelos na próxima
  return { ok: false, erro: ultimoErro };
}

// ------------------------------------------------------------------ token da conversa ao vivo
async function rotaToken(req, res) {
  if (!CHAVE) return enviarJson(res, 500, { erro: "o servidor ainda não tem a chave do Google (GEMINI_API_KEY)" });
  let modelo = MODELO_AO_VIVO;
  try { const c = JSON.parse(await lerCorpo(req, 4096) || "{}"); if (c && /^[\w.-]{3,60}$/.test(c.modelo || "")) modelo = c.modelo; } catch { /* padrão */ }
  const agora = Date.now();
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const base = { uses: 1, expireTime: iso(agora + 30 * 60e3), newSessionExpireTime: iso(agora + 2 * 60e3) };
  let erro = "";
  for (const corpo of [{ ...base, liveConnectConstraints: { model: `models/${modelo}` } }, base]) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": CHAVE },
        body: JSON.stringify(corpo), signal: AbortSignal.timeout(8000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.name) return enviarJson(res, 200, { token: j.name, modelo });
      erro = `${r.status}: ${(j.error && j.error.message) || ""}`.slice(0, 200);
      console.log("[HERUPU] token:", erro);
    } catch (e) { erro = e.message; }
  }
  return enviarJson(res, 502, { erro: "não consegui liberar a conversa ao vivo (" + erro + ")" });
}

// ------------------------------------------------------------------ voz Antonio
let MsEdgeTTS, OUTPUT_FORMAT;
try { ({ MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts")); }
catch { console.warn("[HERUPU] pacote msedge-tts não instalado — rode: npm install"); }
const escapar = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// ---- voz da inteligência (Gemini, ex.: Algenib — a mesma do PC): usa a chave do servidor
let modeloVozIA = null;
async function acharModeloVozIA() {
  if (modeloVozIA) return modeloVozIA;
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
    { headers: { "x-goog-api-key": CHAVE }, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  const nomes = (j.models || [])
    .filter((m) => /tts/i.test(m.name) && (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  nomes.sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || (/preview/.test(a) - /preview/.test(b)) || b.localeCompare(a));
  if (!nomes.length) throw new Error("sem modelo de voz IA");
  modeloVozIA = nomes[0];
  console.log("[HERUPU] modelo de voz IA:", modeloVozIA);
  return modeloVozIA;
}
// corta o chiado ("rádio desligando") que às vezes vem depois da última palavra (mesmo corte do PC)
function limparFimDoAudioPcm(pcm, taxa) {
  const ab = new ArrayBuffer(pcm.length - (pcm.length % 2));
  new Uint8Array(ab).set(pcm.subarray(0, ab.byteLength));
  const amostras = new Int16Array(ab);           // PCM 16-bit little-endian
  const total = amostras.length;
  const janela = Math.round(taxa * 0.02) || 1;   // blocos de 20 ms
  const n = Math.floor(total / janela);
  if (n < 2) return pcm;
  const rms = new Float64Array(n), zcr = new Float64Array(n);
  let picoGeral = 0;
  for (let j = 0; j < n; j++) {
    let soma = 0, cruz = 0; const ini = j * janela;
    for (let k = ini; k < ini + janela; k++) {
      const v = amostras[k]; soma += v * v;
      if (k > ini && ((amostras[k] >= 0) !== (amostras[k - 1] >= 0))) cruz++;
    }
    rms[j] = Math.sqrt(soma / janela); zcr[j] = cruz / janela;
    if (rms[j] > picoGeral) picoGeral = rms[j];
  }
  // fim da fala = último bloco que é VOZ de verdade (tem energia E poucas oscilações).
  // O "ruído de rádio" é um chiado de banda larga = muitas oscilações (zcr alto), então é cortado mesmo se for alto.
  let ultimaVoz = -1;
  for (let j = n - 1; j >= 0; j--) { if (rms[j] > picoGeral * 0.12 && zcr[j] < 0.20) { ultimaVoz = j; break; } }
  if (ultimaVoz < 0) { for (let j = n - 1; j >= 0; j--) { if (rms[j] > picoGeral * 0.15) { ultimaVoz = j; break; } } }
  if (ultimaVoz < 0) ultimaVoz = n - 1;
  // margem curta depois da última voz (a longa reincluía o "desligar rádio")
  const fim = Math.min(total, (ultimaVoz + 1) * janela + Math.round(taxa * 0.04));
  const saida = amostras.slice(0, fim);
  // fade-out LONGO (120 ms): elimina qualquer estalo/chiado residual no fim
  const suave = Math.min(saida.length, Math.round(taxa * 0.12));
  for (let i = 0; i < suave; i++) { const idx = saida.length - 1 - i; saida[idx] = Math.round(saida[idx] * (i / suave)); }
  const entrada = Math.min(saida.length, Math.round(taxa * 0.01));
  for (let i = 0; i < entrada; i++) saida[i] = Math.round(saida[i] * (i / entrada));
  // 50 ms de silêncio no fim: o player não "estala" ao terminar o áudio
  const silencio = Math.round(taxa * 0.05);
  const comSilencio = new Int16Array(saida.length + silencio);
  comSilencio.set(saida, 0);
  return Buffer.from(comSilencio.buffer, comSilencio.byteOffset, comSilencio.byteLength);
}

// embrulha PCM 16-bit mono em WAV (o navegador toca WAV direto)
function wavDePcm(pcm, taxa) {
  const h = Buffer.alloc(44), n = pcm.length;
  h.write("RIFF", 0); h.writeUInt32LE(36 + n, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(taxa, 24); h.writeUInt32LE(taxa * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(n, 40);
  return Buffer.concat([h, pcm]);
}
async function vozIA(texto) {
  const dormir = (ms) => new Promise((x) => setTimeout(x, ms));
  const modelo = await acharModeloVozIA();
  let ultimo = "voz IA sem resposta";
  // insiste na voz Algenib: se vier sobrecarga (429/5xx), espera e tenta de novo antes de desistir
  for (let t = 0; t < 3; t++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": CHAVE },
      body: JSON.stringify({
        contents: [{ parts: [{ text: texto }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ_IA } } } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const parte = ((j.candidates?.[0]?.content?.parts) || []).find((p) => p.inlineData || p.inline_data);
      const dados = parte && (parte.inlineData || parte.inline_data);
      if (!dados || !dados.data) throw new Error("voz IA sem áudio");
      const taxa = Number((/rate=(\d+)/.exec(dados.mimeType || dados.mime_type || "") || [])[1]) || 24000;
      return wavDePcm(limparFimDoAudioPcm(Buffer.from(dados.data, "base64"), taxa), taxa);
    }
    ultimo = (j.error && j.error.message) || ("voz IA " + r.status);
    if (r.status === 404) { modeloVozIA = null; throw new Error(ultimo); } // modelo mudou: redescobre na próxima
    // 429 = cota estourada: NÃO adianta tentar de novo (só deixa lento). Cai pro Antonio na hora.
    if (r.status >= 500) { console.log("[HERUPU] voz IA instável, tentando de novo:", ultimo); await dormir(600 * (t + 1)); continue; }
    throw new Error(ultimo);
  }
  throw new Error(ultimo);
}

async function rotaFalar(req, res) {
  let texto = "";
  try { texto = String(JSON.parse(await lerCorpo(req, 64 * 1024)).texto || ""); } catch { /* vazio */ }
  texto = texto.replace(/https?:\/\/\S+/g, " ").replace(/[*_#`>~|[\]{}]/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 1500);
  if (!texto) return enviarJson(res, 400, { erro: "texto vazio" });
  // Voz única e ILIMITADA: Antonio (Microsoft/edge), ajustada para soar mais grave e másculina.
  if (!MsEdgeTTS) return enviarJson(res, 502, { erro: "voz indisponível (msedge-tts não instalado)" });
  try {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 4000, synthesisTimeoutMs: 8000 });
    await tts.setMetadata(VOZ, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3); // 96k = menos chiado/artefato que 48k
    const { audioStream } = tts.toStream(escapar(texto), { rate: VOZ_RATE, pitch: VOZ_PITCH });
    const pedacos = [];
    await new Promise((ok, falha) => {
      audioStream.on("data", (d) => pedacos.push(d));
      audioStream.on("close", ok); audioStream.on("end", ok); audioStream.on("error", falha);
    });
    try { tts.close(); } catch { /* ok */ }
    const audio = Buffer.concat(pedacos);
    if (!audio.length) throw new Error("áudio vazio");
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" });
    return res.end(audio);
  } catch (e) {
    console.log("[HERUPU] voz falhou:", e.message);
    return enviarJson(res, 502, { erro: "voz indisponível" });
  }
}

// ------------------------------------------------------------------ arquivos do app
function servirArquivo(req, res) {
  let caminho = decodeURIComponent((req.url.split("?")[0]) || "/");
  if (caminho === "/") caminho = "/index.html";
  const destino = path.join(DIR_SITE, path.normalize(caminho));
  if (!destino.startsWith(DIR_SITE)) { res.writeHead(403); return res.end("proibido"); }
  fs.readFile(destino, (err, dados) => {
    if (err) {
      // app de página única: cai no index
      return fs.readFile(path.join(DIR_SITE, "index.html"), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end("não encontrado"); }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(idx);
      });
    }
    const tipo = TIPOS[path.extname(destino).toLowerCase()] || "application/octet-stream";
    const cache = destino.endsWith("sw.js") ? "no-cache" : "public, max-age=300";
    res.writeHead(200, { "Content-Type": tipo, "Cache-Control": cache });
    res.end(dados);
  });
}

// ------------------------------------------------------------------ agente de marketing
const marketing = require("./marketing")({ chamarCerebro, enviarJson, lerCorpo, TIPOS });

const servidor = http.createServer((req, res) => {
  const url = (req.url || "").split("?")[0];
  if (marketing.rotear(req, res, url)) return;
  if (req.method === "GET" && url === "/saude") return enviarJson(res, 200, { ok: true, chave: Boolean(CHAVE), voz: Boolean(MsEdgeTTS) });
  if (req.method === "POST" && url === "/api/chat") return rotaChat(req, res).catch(() => enviarJson(res, 500, { erro: "falha" }));
  if (req.method === "POST" && url === "/api/token") return rotaToken(req, res).catch(() => enviarJson(res, 500, { erro: "falha" }));
  if (req.method === "POST" && url === "/api/falar") return rotaFalar(req, res).catch(() => enviarJson(res, 500, { erro: "falha" }));
  if (req.method === "GET") return servirArquivo(req, res);
  res.writeHead(404); res.end("não encontrado");
});

servidor.listen(PORTA, () => console.log(`[HERUPU] no ar na porta ${PORTA} — voz ${VOZ}, ao vivo ${MODELO_AO_VIVO}`));
