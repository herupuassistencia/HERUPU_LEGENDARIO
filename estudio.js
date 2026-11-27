/*
 * HERUPU LEGENDÁRIO — Estúdio: cria artes (JPG) e Reels (MP4 9:16 com narração do Antonio) no próprio servidor.
 * Grátis e sem Claude: SVG -> PNG (resvg), vídeo com ffmpeg, voz com msedge-tts.
 * Requer no servidor: apt-get install -y ffmpeg (a fonte Poppins vem na pasta marca/)
 */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { execFile } = require("child_process");
const { Resvg } = require("@resvg/resvg-js");

const LEAO = "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, "marca", "leao.jpg")).toString("base64");
const FONTES = ["Poppins-Bold.ttf", "Poppins-ExtraBold.ttf", "Poppins-SemiBold.ttf"].map((f) => path.join(__dirname, "marca", f)).filter((f) => fs.existsSync(f));
const esc = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function quebrar(texto, max) {
  const linhas = []; let atual = "";
  for (const p of String(texto || "").split(/\s+/)) {
    if ((atual + " " + p).trim().length > max && atual) { linhas.push(atual); atual = p; } else atual = (atual + " " + p).trim();
  }
  if (atual) linhas.push(atual);
  return linhas;
}
// arte no padrão HERUPU: fundo azul-noite, leão, título branco com destaque verde, rodapé com chamada
function svgArte({ titulo, destaque, texto, chamada, largura = 1080, altura = 1350, cena }) {
  const tam = altura > 1500 ? 92 : 84, max = altura > 1500 ? 16 : 19;
  const l1 = quebrar(titulo, max), l2 = quebrar(destaque, max);
  let y = altura > 1500 ? 520 : 330, out = "";
  for (const l of l1) { out += `<text x="80" y="${y}" class="t">${esc(l)}</text>`; y += tam * 1.12; }
  for (const l of l2) { out += `<text x="80" y="${y}" class="t" style="fill:#22c55e">${esc(l)}</text>`; y += tam * 1.12; }
  y += 40;
  for (const l of quebrar(texto, 34).slice(0, 7)) { out += `<text x="80" y="${y}" class="s">${esc(l)}</text>`; y += 58; }
  const cta = chamada ? `<rect x="80" y="${altura - 190}" width="${largura - 160}" height="110" rx="24" fill="#22c55e"/>
    <text x="${largura / 2}" y="${altura - 118}" text-anchor="middle" class="c">${esc(chamada)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
  <style>.t{font-family:Poppins;font-size:${tam}px;font-weight:800;fill:#fff}.s{font-family:Poppins;font-size:42px;font-weight:600;fill:#cbd5e1}.c{font-family:Poppins;font-size:46px;font-weight:800;fill:#0b1020}.m{font-family:Poppins;font-size:40px;font-weight:800;fill:#fff}</style>
  <defs><radialGradient id="g" cx="80%" cy="10%" r="90%"><stop offset="0" stop-color="#123a2a"/><stop offset=".55" stop-color="#0b1020"/></radialGradient>
  <clipPath id="r"><rect x="80" y="80" width="96" height="96" rx="22"/></clipPath></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <image href="${LEAO}" x="80" y="80" width="96" height="96" clip-path="url(#r)"/>
  <text x="200" y="142" class="m">HERUPU</text>${cena ? `<text x="${largura - 80}" y="142" text-anchor="end" class="s">${esc(cena)}</text>` : ""}
  ${out}${cta}</svg>`;
}
// texto por cima do vídeo (fundo transparente): selo HERUPU no alto, frase grande no meio-baixo, faixa verde no fim
function svgSobreposicao({ tela, chamada, cena }) {
  const linhas = quebrar(tela, 18).slice(0, 4);
  let y = 1180, txt = "";
  for (const l of linhas) { txt += `<text x="540" y="${y}" text-anchor="middle" class="t">${esc(l)}</text>`; y += 100; }
  const cta = chamada ? `<rect x="80" y="1700" width="920" height="110" rx="24" fill="#22c55e"/><text x="540" y="1772" text-anchor="middle" class="c">${esc(chamada)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <style>.t{font-family:Poppins;font-size:84px;font-weight:800;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:10px;stroke-linejoin:round}.c{font-family:Poppins;font-size:46px;font-weight:800;fill:#0b1020}.m{font-family:Poppins;font-size:40px;font-weight:800;fill:#fff}</style>
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".25" stop-color="#000" stop-opacity="0"/>
  <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></linearGradient>
  <clipPath id="r"><rect x="60" y="70" width="96" height="96" rx="22"/></clipPath></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <image href="${LEAO}" x="60" y="70" width="96" height="96" clip-path="url(#r)"/><text x="180" y="132" class="m">HERUPU</text>
  ${txt}${cta}</svg>`;
}
// banco gratuito Pexels: vídeo vertical (ou foto) que combina com a cena
async function buscarPexels(busca, chave, pasta, i) {
  if (!chave || !busca) return null;
  const h = { Authorization: chave };
  try {
    const v = await (await fetch("https://api.pexels.com/videos/search?" + new URLSearchParams({ query: busca, orientation: "portrait", size: "medium", per_page: "8" }), { headers: h, signal: AbortSignal.timeout(15000) })).json();
    const cand = (v.videos || []).flatMap((x) => (x.video_files || []).filter((f) => f.file_type === "video/mp4" && f.height >= f.width && f.height >= 1000 && f.height <= 2600))
      .sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
    const usar = cand[Math.floor(Math.random() * Math.min(3, cand.length))];
    if (usar) { const arq = path.join(pasta, `b${i}.mp4`); fs.writeFileSync(arq, Buffer.from(await (await fetch(usar.link, { signal: AbortSignal.timeout(60000) })).arrayBuffer())); return { tipo: "video", arq }; }
    const f = await (await fetch("https://api.pexels.com/v1/search?" + new URLSearchParams({ query: busca, orientation: "portrait", per_page: "5" }), { headers: h, signal: AbortSignal.timeout(15000) })).json();
    const foto = (f.photos || [])[0];
    if (foto) { const arq = path.join(pasta, `b${i}.jpg`); fs.writeFileSync(arq, Buffer.from(await (await fetch(foto.src.large2x || foto.src.portrait, { signal: AbortSignal.timeout(30000) })).arrayBuffer())); return { tipo: "foto", arq }; }
  } catch (e) { console.log("[HERUPU] pexels:", e.message); }
  return null;
}
// cena de assinatura: o mascote oficial (Leão HERUPU) de corpo inteiro apresentando a chamada
const MASCOTE = fs.existsSync(path.join(__dirname, "marca", "mascote.jpg"))
  ? "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, "marca", "mascote.jpg")).toString("base64") : LEAO;
function svgAssinatura({ frase, chamada }) {
  let y = 300, txt = "";
  for (const l of quebrar(frase, 18).slice(0, 3)) { txt += `<text x="540" y="${y}" text-anchor="middle" class="t">${esc(l)}</text>`; y += 96; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <style>.t{font-family:Poppins;font-size:80px;font-weight:800;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:8px;stroke-linejoin:round}.c{font-family:Poppins;font-size:46px;font-weight:800;fill:#0b1020}.m{font-family:Poppins;font-size:44px;font-weight:800;fill:#22c55e;letter-spacing:6px}</style>
  <defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#145c43"/><stop offset=".7" stop-color="#0b1020"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <image href="${MASCOTE}" x="190" y="${y + 50}" width="700" height="1240" preserveAspectRatio="xMidYMax meet"/>
  <text x="540" y="${y + 20}" text-anchor="middle" class="m">LEÃO HERUPU</text>
  ${txt}
  <rect x="80" y="1700" width="920" height="110" rx="24" fill="#22c55e"/><text x="540" y="1772" text-anchor="middle" class="c">${esc(chamada)}</text></svg>`;
}
// telas do app HERUPU num celular (mostram o produto funcionando): pedido, chamado, mapa, avaliação
function svgApp({ tipo, tela, servico, local, cena }) {
  const sv = esc(servico || "Instalação elétrica"), lc = esc(local || "Centro");
  let y = 190, topo = "";
  for (const l of quebrar(tela, 20).slice(0, 3)) { topo += `<text x="540" y="${y}" text-anchor="middle" class="t">${esc(l)}</text>`; y += 84; }
  const X = 250, Y = 470, W = 580, H = 1230; // tela do celular
  let ui = "";
  const botao = (yy, txt, cor = "#22c55e", tc = "#0b1020") => `<rect x="${X + 40}" y="${yy}" width="${W - 80}" height="96" rx="22" fill="${cor}"/><text x="540" y="${yy + 62}" text-anchor="middle" class="b" fill="${tc}">${txt}</text>`;
  if (tipo === "app_pedido") {
    ui = `<text x="${X + 40}" y="${Y + 190}" class="h">Do que você precisa?</text>` +
      ["Elétrica", "Ar-cond.", "Encanador", "Informática"].map((c, i) => `<rect x="${X + 40 + (i % 2) * 255}" y="${Y + 240 + Math.floor(i / 2) * 120}" width="235" height="96" rx="20" fill="${i === 0 ? "#22c55e" : "#1e293b"}"/><text x="${X + 157 + (i % 2) * 255}" y="${Y + 300 + Math.floor(i / 2) * 120}" text-anchor="middle" class="p" fill="${i === 0 ? "#0b1020" : "#e2e8f0"}">${c}</text>`).join("") +
      `<rect x="${X + 40}" y="${Y + 510}" width="${W - 80}" height="230" rx="22" fill="#1e293b"/><text x="${X + 70}" y="${Y + 570}" class="p" fill="#94a3b8">Descreva o problema</text><text x="${X + 70}" y="${Y + 630}" class="p">${sv}</text><text x="${X + 70}" y="${Y + 690}" class="p" fill="#94a3b8">${lc}</text>` +
      botao(Y + 800, "Pedir técnico agora");
  } else if (tipo === "app_chamado") {
    ui = `<rect x="${X + 30}" y="${Y + 150}" width="${W - 60}" height="560" rx="30" fill="#0f2a1e" stroke="#22c55e" stroke-width="4"/>
      <text x="${X + 70}" y="${Y + 220}" class="s" fill="#22c55e">NOVO CHAMADO</text><text x="${X + 70}" y="${Y + 300}" class="h">${sv}</text>
      <text x="${X + 70}" y="${Y + 380}" class="p">${lc} · 2,3 km</text><text x="${X + 70}" y="${Y + 440}" class="p" fill="#94a3b8">Cliente avaliado: nota 4,9</text>
      <text x="${X + 70}" y="${Y + 500}" class="p" fill="#94a3b8">Valor você combina com o cliente</text>` +
      botao(Y + 560, "Aceitar chamado") + botao(Y + 760, "Recusar", "#1e293b", "#e2e8f0");
  } else if (tipo === "app_mapa") {
    let grade = ""; for (let i = 0; i < 9; i++) grade += `<line x1="${X}" y1="${Y + 120 + i * 90}" x2="${X + W}" y2="${Y + 160 + i * 90}" stroke="#1e3a5f" stroke-width="10"/><line x1="${X + i * 75}" y1="${Y + 100}" x2="${X + i * 75 + 40}" y2="${Y + 900}" stroke="#1e3a5f" stroke-width="10"/>`;
    ui = `<rect x="${X}" y="${Y + 100}" width="${W}" height="800" fill="#0d1b2a"/>${grade}
      <polyline points="${X + 120},${Y + 800} ${X + 170},${Y + 610} ${X + 330},${Y + 560} ${X + 380},${Y + 360} ${X + 460},${Y + 260}" fill="none" stroke="#22c55e" stroke-width="16" stroke-linecap="round" stroke-dasharray="1 0"/>
      <circle cx="${X + 120}" cy="${Y + 800}" r="26" fill="#3b82f6" stroke="#fff" stroke-width="6"/><circle cx="${X + 460}" cy="${Y + 260}" r="30" fill="#ef4444" stroke="#fff" stroke-width="6"/>
      <rect x="${X + 30}" y="${Y + 930}" width="${W - 60}" height="250" rx="26" fill="#1e293b"/><text x="${X + 70}" y="${Y + 1000}" class="s" fill="#22c55e">TÉCNICO A CAMINHO</text>
      <text x="${X + 70}" y="${Y + 1070}" class="h">Chega em 8 min</text><text x="${X + 70}" y="${Y + 1130}" class="p" fill="#94a3b8">${sv} · ${lc}</text>`;
  } else {
    ui = `<circle cx="540" cy="${Y + 330}" r="110" fill="#22c55e"/><path d="M490 ${Y + 330} l35 38 l70 -80" fill="none" stroke="#0b1020" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="540" y="${Y + 540}" text-anchor="middle" class="h">Serviço concluído</text>${[0,1,2,3,4].map((k) => `<polygon transform="translate(${340 + k * 100},${Y + 600}) scale(1.6)" points="0,-22 6,-7 22,-7 9,3 14,19 0,9 -14,19 -9,3 -22,-7 -6,-7" fill="#facc15"/>`).join("")}
      <rect x="${X + 40}" y="${Y + 700}" width="${W - 80}" height="200" rx="22" fill="#1e293b"/><text x="${X + 70}" y="${Y + 770}" class="p">"Chegou rápido e resolveu</text><text x="${X + 70}" y="${Y + 830}" class="p">na hora. Recomendo!"</text>` +
      botao(Y + 960, "Avaliação do cliente", "#1e293b", "#e2e8f0");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <style>.t{font-family:Poppins;font-size:70px;font-weight:800;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:8px}.h{font-family:Poppins;font-size:50px;font-weight:800;fill:#fff}.p{font-family:Poppins;font-size:36px;font-weight:600;fill:#e2e8f0}.s{font-family:Poppins;font-size:32px;font-weight:800;letter-spacing:4px}.b{font-family:Poppins;font-size:40px;font-weight:800}.e{font-family:'DejaVu Sans';font-size:80px;fill:#facc15}.m{font-family:Poppins;font-size:34px;font-weight:800;fill:#fff}</style>
  <defs><radialGradient id="g" cx="50%" cy="60%" r="80%"><stop offset="0" stop-color="#145c43"/><stop offset=".75" stop-color="#0b1020"/></radialGradient><clipPath id="r"><rect x="${X + 40}" y="${Y + 50}" width="64" height="64" rx="14"/></clipPath></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>${topo}
  <rect x="${X - 22}" y="${Y - 22}" width="${W + 44}" height="${H + 44}" rx="80" fill="#000" stroke="#334155" stroke-width="6"/>
  <rect x="${X}" y="${Y}" width="${W}" height="${H}" rx="62" fill="#0b1020"/>
  <image href="${LEAO}" x="${X + 40}" y="${Y + 50}" width="64" height="64" clip-path="url(#r)"/><text x="${X + 125}" y="${Y + 95}" class="m">HERUPU ${tipo === "app_pedido" ? "Cliente" : "Técnico"}</text>
  ${ui}</svg>`;
}
// texto da arte por cima de uma foto/arte modelo: escurece o fundo e escreve no padrão HERUPU
function svgSobreArte({ titulo, texto, chamada, largura = 1080, altura = 1350 }) {
  const l1 = quebrar(titulo, 19).slice(0, 4);
  let y = altura - 230 - 58 * Math.min(quebrar(texto, 34).length, 3) - 92 * l1.length, out = "";
  for (const l of l1) { out += `<text x="80" y="${y}" class="t">${esc(l)}</text>`; y += 92; }
  y += 20;
  for (const l of quebrar(texto, 34).slice(0, 3)) { out += `<text x="80" y="${y}" class="s">${esc(l)}</text>`; y += 58; }
  const cta = chamada ? `<rect x="80" y="${altura - 190}" width="${largura - 160}" height="110" rx="24" fill="#22c55e"/>
    <text x="${largura / 2}" y="${altura - 118}" text-anchor="middle" class="c">${esc(chamada)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
  <style>.t{font-family:Poppins;font-size:80px;font-weight:800;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:6px;stroke-linejoin:round}.s{font-family:Poppins;font-size:42px;font-weight:600;fill:#e2e8f0;paint-order:stroke;stroke:#000;stroke-width:4px}.c{font-family:Poppins;font-size:46px;font-weight:800;fill:#0b1020}.m{font-family:Poppins;font-size:40px;font-weight:800;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:5px}</style>
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".22" stop-color="#000" stop-opacity="0"/>
  <stop offset=".42" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#05070d" stop-opacity=".92"/></linearGradient>
  <clipPath id="r"><rect x="80" y="70" width="96" height="96" rx="22"/></clipPath></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <image href="${LEAO}" x="80" y="70" width="96" height="96" clip-path="url(#r)"/><text x="200" y="132" class="m">HERUPU</text>
  ${out}${cta}</svg>`;
}
const png = (svg) => new Resvg(svg, { font: { fontFiles: FONTES, loadSystemFonts: false, defaultFontFamily: "Poppins" } }).render().asPng();
const rodar = (args) => new Promise((ok, falha) => execFile("ffmpeg", ["-y", "-loglevel", "error", ...args], { timeout: 180000 }, (e, _o, err) => e ? falha(new Error("ffmpeg: " + (err || e.message).slice(0, 200))) : ok()));
const temAudio = (arq) => new Promise((ok) => execFile("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", arq], (e, o) => ok(Boolean(String(o || "").trim()))));
const duracao = (arq) => new Promise((ok) => execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq], (e, o) => ok(Number(o) || 3)));

module.exports = function criarEstudio({ DIR_MIDIA, falarMp3 }) {
  const tmp = () => fs.mkdtempSync(path.join(require("os").tmpdir(), "herupu-"));
  const nome = (ext) => crypto.randomBytes(12).toString("hex") + "." + ext;

  async function arte(dados) {
    const d = tmp(), p = path.join(d, "a.png"), arq = nome("jpg");
    fs.writeFileSync(p, png(svgArte(dados)));
    await rodar(["-i", p, "-q:v", "3", path.join(DIR_MIDIA, arq)]);
    fs.rmSync(d, { recursive: true, force: true });
    return { arquivo: arq, url: "/midia/" + arq };
  }

  // arte nova a partir de uma imagem modelo (enquadra em 4:5 e escreve o texto novo por cima)
  async function arteModelo(modeloArquivo, dados) {
    const fundo = path.join(DIR_MIDIA, path.basename(modeloArquivo));
    if (!fs.existsSync(fundo)) return arte(dados);
    const d = tmp(), p = path.join(d, "t.png"), arq = nome("jpg");
    fs.writeFileSync(p, png(svgSobreArte(dados)));
    // pequeno zoom/recorte diferente a cada uso: a mesma foto nunca sai idêntica
    const z = (1 + Math.random() * 0.12).toFixed(3), ox = Math.random().toFixed(3), oy = Math.random().toFixed(3);
    await rodar(["-i", fundo, "-i", p, "-filter_complex",
      `[0:v]scale=1080*${z}:1350*${z}:force_original_aspect_ratio=increase,crop=1080:1350:(iw-1080)*${ox}:(ih-1350)*${oy},setsar=1[f];[f][1:v]overlay=0:0`,
      "-frames:v", "1", "-q:v", "3", path.join(DIR_MIDIA, arq)]);
    fs.rmSync(d, { recursive: true, force: true });
    return { arquivo: arq, url: "/midia/" + arq };
  }

  // cenas: [{ tela: "texto grande", fala: "o que o Antonio narra" }]
  async function reel(cenas, chamada, chavePexels, assinatura) {
    const d = tmp(), partes = [];
    for (let i = 0; i < cenas.length; i++) {
      const c = cenas[i], img = path.join(d, `c${i}.png`), voz = path.join(d, `v${i}.mp3`), seg = path.join(d, `s${i}.mp4`);
      const ult = false; // a chamada final fica na cena do Leão HERUPU
      // clipe enviado (ex.: gerado no Flow com o Leão HERUPU): usa o vídeo e a fala dele, com o texto por cima
      if (c.clipe && fs.existsSync(path.join(DIR_MIDIA, c.clipe))) {
        const clipe = path.join(DIR_MIDIA, c.clipe);
        fs.writeFileSync(img, png(svgSobreposicao({ tela: c.tela, chamada: "" })));
        const somDoClipe = await temAudio(clipe);
        let durC = Math.min(await duracao(clipe), 10), audioArgs;
        if (somDoClipe) audioArgs = ["-map", "0:a"];
        else {
          let temV = false;
          if (c.fala) { try { fs.writeFileSync(voz, await falarMp3(c.fala)); durC = Math.max(durC, (await duracao(voz)) + 0.3); temV = true; } catch { /* sem voz */ } }
          audioArgs = temV ? ["-i", voz, "-map", "2:a"] : ["-f", "lavfi", "-t", String(durC), "-i", "anullsrc=r=44100:cl=stereo", "-map", "2:a"];
        }
        const extra = somDoClipe ? [] : audioArgs.slice(0, audioArgs.indexOf("-map"));
        await rodar(["-stream_loop", "-1", "-i", clipe, "-i", img, ...extra, "-filter_complex",
          "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[f];[f][1:v]overlay=0:0,format=yuv420p[v]",
          "-map", "[v]", ...audioArgs.slice(audioArgs.indexOf("-map")), "-t", durC.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
          "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", seg]);
        partes.push(seg); continue;
      }
      // arte pronta (já tem texto): aparece inteira sobre um fundo desfocado dela mesma, sem texto por cima
      if (c.modelo && c.modelo.inteira && fs.existsSync(path.join(DIR_MIDIA, c.modelo.arquivo))) {
        const arteP = path.join(DIR_MIDIA, c.modelo.arquivo);
        let dur = 3.2, temVoz = false;
        if (c.fala) { try { fs.writeFileSync(voz, await falarMp3(c.fala)); dur = Math.max(dur, (await duracao(voz)) + 0.35); temVoz = true; } catch { /* sem voz */ } }
        const fr = Math.ceil(dur * 30);
        await rodar(["-loop", "1", "-i", arteP, ...(temVoz ? ["-i", voz] : ["-f", "lavfi", "-t", String(dur), "-i", "anullsrc=r=44100:cl=stereo"]), "-filter_complex",
          `[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:3,eq=brightness=-0.15[f];` +
          `[b]scale=1000:1780:force_original_aspect_ratio=decrease[p];[f][p]overlay=(W-w)/2:(H-h)/2,scale=2160:3840,` +
          `zoompan=z='min(zoom+0.0007,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1080x1920:fps=30,format=yuv420p[v];[1:a]apad[au]`,
          "-map", "[v]", "-map", "[au]", "-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", seg]);
        partes.push(seg); continue;
      }
      const ehApp = /^app_/.test(c.tipo || "");
      const doModelo = !ehApp && c.modelo && fs.existsSync(path.join(DIR_MIDIA, c.modelo.arquivo))
        ? { tipo: /\.mp4$/.test(c.modelo.arquivo) ? "video" : "foto", arq: path.join(DIR_MIDIA, c.modelo.arquivo), inicio: Number(c.modelo.inicio) || 0 } : null;
      const fundo = ehApp ? null : doModelo || await buscarPexels(c.busca || "", chavePexels, d, i);
      if (ehApp) fs.writeFileSync(img, png(svgApp(c)));
      else if (fundo) fs.writeFileSync(img, png(svgSobreposicao({ tela: c.tela, chamada: ult ? chamada : "" })));
      else fs.writeFileSync(img, png(svgArte({ titulo: c.tela, destaque: c.destaque || "", texto: "", chamada: ult ? chamada : "", largura: 1080, altura: 1920, cena: `${i + 1}/${cenas.length}` })));
      let dur = 2.5, temVoz = false;
      if (c.fala) { try { fs.writeFileSync(voz, await falarMp3(c.fala)); dur = (await duracao(voz)) + 0.35; temVoz = true; } catch { /* sem voz nessa cena */ } }
      const fr = Math.ceil(dur * 30);
      const zoom = `scale=2160:3840,zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1080x1920:fps=30,format=yuv420p`;
      const entradaAudio = temVoz ? ["-i", voz] : ["-f", "lavfi", "-t", String(dur), "-i", "anullsrc=r=44100:cl=stereo"];
      const saidaV = ["-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-shortest", seg];
      if (fundo && fundo.tipo === "video") {
        // vídeo real de fundo, preenchendo a tela vertical, com o texto por cima e a narração
        await rodar([...(fundo.inicio ? ["-ss", fundo.inicio.toFixed(2)] : []), "-stream_loop", "-1", "-i", fundo.arq, "-i", img, ...entradaAudio, "-filter_complex",
          "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[f];[f][1:v]overlay=0:0,format=yuv420p[v];[2:a]apad[a]",
          "-map", "[v]", "-map", "[a]", ...saidaV]);
        partes.push(seg); continue;
      }
      if (fundo && fundo.tipo === "foto") {
        await rodar(["-loop", "1", "-i", fundo.arq, "-loop", "1", "-i", img, ...entradaAudio, "-filter_complex",
          `[0:v]scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1080x1920:fps=30[f];[f][1:v]overlay=0:0,format=yuv420p[v];[2:a]apad[a]`,
          "-map", "[v]", "-map", "[a]", ...saidaV]);
        partes.push(seg); continue;
      }
      await rodar(["-loop", "1", "-i", img, ...entradaAudio, "-vf", zoom, "-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-af", "apad", "-shortest", seg]);
      partes.push(seg);
    }
    // assinatura da marca: o Leão HERUPU fecha todo Reel
    {
      const img = path.join(d, "assinatura.png"), voz = path.join(d, "assinatura.mp3"), seg = path.join(d, "assinatura.mp4");
      const frase = assinatura || "Seja o primeiro da sua cidade";
      fs.writeFileSync(img, png(svgAssinatura({ frase, chamada })));
      let dur = 3, temVoz = false;
      try { fs.writeFileSync(voz, await falarMp3("Eu sou o Leão HERUPU. " + frase + ". " + chamada.replace("·", ","))); dur = (await duracao(voz)) + 0.5; temVoz = true; } catch { /* sem voz */ }
      const fr = Math.ceil(dur * 30);
      await rodar(["-loop", "1", "-i", img, ...(temVoz ? ["-i", voz] : ["-f", "lavfi", "-t", String(dur), "-i", "anullsrc=r=44100:cl=stereo"]),
        "-vf", `scale=2160:3840,zoompan=z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1080x1920:fps=30,format=yuv420p`,
        "-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-af", "apad", "-shortest", seg]);
      partes.push(seg);
    }
    const lista = path.join(d, "lista.txt"), arq = nome("mp4");
    fs.writeFileSync(lista, partes.map((p) => `file '${p}'`).join("\n"));
    await rodar(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", "-movflags", "+faststart", path.join(DIR_MIDIA, arq)]);
    fs.rmSync(d, { recursive: true, force: true });
    return { arquivo: arq, url: "/midia/" + arq };
  }
  return { arte, arteModelo, reel, duracao };
};
