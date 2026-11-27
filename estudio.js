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
const png = (svg) => new Resvg(svg, { font: { fontFiles: FONTES, loadSystemFonts: false, defaultFontFamily: "Poppins" } }).render().asPng();
const rodar = (args) => new Promise((ok, falha) => execFile("ffmpeg", ["-y", "-loglevel", "error", ...args], { timeout: 180000 }, (e, _o, err) => e ? falha(new Error("ffmpeg: " + (err || e.message).slice(0, 200))) : ok()));
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

  // cenas: [{ tela: "texto grande", fala: "o que o Antonio narra" }]
  async function reel(cenas, chamada, chavePexels) {
    const d = tmp(), partes = [];
    for (let i = 0; i < cenas.length; i++) {
      const c = cenas[i], img = path.join(d, `c${i}.png`), voz = path.join(d, `v${i}.mp3`), seg = path.join(d, `s${i}.mp4`);
      const ult = i === cenas.length - 1;
      const fundo = await buscarPexels(c.busca || "", chavePexels, d, i);
      if (fundo) fs.writeFileSync(img, png(svgSobreposicao({ tela: c.tela, chamada: ult ? chamada : "" })));
      else fs.writeFileSync(img, png(svgArte({ titulo: c.tela, destaque: c.destaque || "", texto: "", chamada: ult ? chamada : "", largura: 1080, altura: 1920, cena: `${i + 1}/${cenas.length}` })));
      let dur = 2.5, temVoz = false;
      if (c.fala) { try { fs.writeFileSync(voz, await falarMp3(c.fala)); dur = (await duracao(voz)) + 0.35; temVoz = true; } catch { /* sem voz nessa cena */ } }
      const fr = Math.ceil(dur * 30);
      const zoom = `scale=2160:3840,zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1080x1920:fps=30,format=yuv420p`;
      const entradaAudio = temVoz ? ["-i", voz] : ["-f", "lavfi", "-t", String(dur), "-i", "anullsrc=r=44100:cl=stereo"];
      const saidaV = ["-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", "-shortest", seg];
      if (fundo && fundo.tipo === "video") {
        // vídeo real de fundo, preenchendo a tela vertical, com o texto por cima e a narração
        await rodar(["-stream_loop", "-1", "-i", fundo.arq, "-i", img, ...entradaAudio, "-filter_complex",
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
    const lista = path.join(d, "lista.txt"), arq = nome("mp4");
    fs.writeFileSync(lista, partes.map((p) => `file '${p}'`).join("\n"));
    await rodar(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", "-movflags", "+faststart", path.join(DIR_MIDIA, arq)]);
    fs.rmSync(d, { recursive: true, force: true });
    return { arquivo: arq, url: "/midia/" + arq };
  }
  return { arte, reel };
};
