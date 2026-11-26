/*
 * HERUPU LEGENDÁRIO — Bíblia: leitura, devocional diário e planos de leitura com estudo.
 *
 * Texto bíblico: bible-api.com (gratuito)
 *   almeida = João Ferreira de Almeida (português, domínio público)
 *   kjv     = King James Version (inglês, domínio público)
 * Estudos e devocionais: gerados pela mesma inteligência do assistente (Gemini).
 * Progresso dos planos e capítulos já baixados ficam guardados no próprio aparelho.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var IA = function () { return window.HerupuIA; };

  // ------------------------------------------------------------------ livros
  // [id, nome, capítulos]
  var LIVROS = [
    ["GEN", "Gênesis", 50], ["EXO", "Êxodo", 40], ["LEV", "Levítico", 27], ["NUM", "Números", 36],
    ["DEU", "Deuteronômio", 34], ["JOS", "Josué", 24], ["JDG", "Juízes", 21], ["RUT", "Rute", 4],
    ["1SA", "1 Samuel", 31], ["2SA", "2 Samuel", 24], ["1KI", "1 Reis", 22], ["2KI", "2 Reis", 25],
    ["1CH", "1 Crônicas", 29], ["2CH", "2 Crônicas", 36], ["EZR", "Esdras", 10], ["NEH", "Neemias", 13],
    ["EST", "Ester", 10], ["JOB", "Jó", 42], ["PSA", "Salmos", 150], ["PRO", "Provérbios", 31],
    ["ECC", "Eclesiastes", 12], ["SNG", "Cânticos", 8], ["ISA", "Isaías", 66], ["JER", "Jeremias", 52],
    ["LAM", "Lamentações", 5], ["EZK", "Ezequiel", 48], ["DAN", "Daniel", 12], ["HOS", "Oséias", 14],
    ["JOL", "Joel", 3], ["AMO", "Amós", 9], ["OBA", "Obadias", 1], ["JON", "Jonas", 4],
    ["MIC", "Miquéias", 7], ["NAM", "Naum", 3], ["HAB", "Habacuque", 3], ["ZEP", "Sofonias", 3],
    ["HAG", "Ageu", 2], ["ZEC", "Zacarias", 14], ["MAL", "Malaquias", 4],
    ["MAT", "Mateus", 28], ["MRK", "Marcos", 16], ["LUK", "Lucas", 24], ["JHN", "João", 21],
    ["ACT", "Atos", 28], ["ROM", "Romanos", 16], ["1CO", "1 Coríntios", 16], ["2CO", "2 Coríntios", 13],
    ["GAL", "Gálatas", 6], ["EPH", "Efésios", 6], ["PHP", "Filipenses", 4], ["COL", "Colossenses", 4],
    ["1TH", "1 Tessalonicenses", 5], ["2TH", "2 Tessalonicenses", 3], ["1TI", "1 Timóteo", 6],
    ["2TI", "2 Timóteo", 4], ["TIT", "Tito", 3], ["PHM", "Filemom", 1], ["HEB", "Hebreus", 13],
    ["JAS", "Tiago", 5], ["1PE", "1 Pedro", 5], ["2PE", "2 Pedro", 3], ["1JN", "1 João", 5],
    ["2JN", "2 João", 1], ["3JN", "3 João", 1], ["JUD", "Judas", 1], ["REV", "Apocalipse", 22]
  ];
  var INICIO_NT = 39;

  function normalizar(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }
  var APELIDOS = { "salmo": "PSA", "sl": "PSA", "cantares": "SNG", "cantico dos canticos": "SNG", "canticos dos canticos": "SNG",
    "apocalipse de joao": "REV", "atos dos apostolos": "ACT", "proverbio": "PRO", "primeira de joao": "1JN",
    "primeiro samuel": "1SA", "segundo samuel": "2SA", "primeiro reis": "1KI", "segundo reis": "2KI" };
  function acharLivro(nome) {
    var n = normalizar(nome).replace(/^(i|primeir[oa]) /, "1 ").replace(/^(ii|segund[oa]) /, "2 ").replace(/^(iii|terceir[oa]) /, "3 ");
    if (APELIDOS[n]) return indicePorId(APELIDOS[n]);
    for (var i = 0; i < LIVROS.length; i++) if (normalizar(LIVROS[i][1]) === n || LIVROS[i][0].toLowerCase() === n) return i;
    for (i = 0; i < LIVROS.length; i++) if (normalizar(LIVROS[i][1]).indexOf(n) === 0 && n.length >= 3) return i;
    return -1;
  }
  function indicePorId(id) { for (var i = 0; i < LIVROS.length; i++) if (LIVROS[i][0] === id) return i; return -1; }

  // todos os capítulos em ordem: [{livro, cap}]
  function capitulos(ini, fim) {
    var lista = [];
    for (var i = ini; i < fim; i++) for (var c = 1; c <= LIVROS[i][2]; c++) lista.push({ livro: i, cap: c });
    return lista;
  }

  // ------------------------------------------------------------------ armazenamento local
  function ler(chave, padrao) { try { var v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); }
    catch (e) { limparCache(); try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e2) { /* sem espaço */ } }
  }
  function limparCache() {
    try {
      var chaves = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^bib\.(cap|estudo)\./.test(k)) chaves.push(k); }
      chaves.slice(0, Math.ceil(chaves.length / 2)).forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ok */ }
  }
  function versao() { var c = IA() && IA().cfg(); var v = (c && c.bibliaVersao) || "livre"; return v === "almeida" ? "livre" : v; } // "almeida" antigo -> Bíblia Livre (português moderno)

  // ------------------------------------------------------------------ texto bíblico
  function baixarCapitulo(livro, cap) {
    var v = versao(), id = LIVROS[livro][0], chave = "bib.cap." + v + "." + id + "." + cap;
    var guardado = ler(chave, null);
    if (guardado) return Promise.resolve(guardado);
    return fetch("https://api.getbible.net/v2/" + v + "/" + (livro + 1) + "/" + cap + ".json")
      .then(function (r) {
        if (r.status === 429) throw new Error("Muitas leituras seguidas. Espere meio minuto e tente de novo.");
        if (!r.ok) throw new Error("Não consegui baixar este capítulo (erro " + r.status + ").");
        return r.json();
      })
      .then(function (j) {
        var lista = j.verses || (j.chapter && j.chapter.verses) || [];
        var versos = lista.map(function (x) { return [x.verse, String(x.text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()]; });
        if (!versos.length) throw new Error("Capítulo vazio.");
        gravar(chave, versos);
        return versos;
      })
      .catch(function (e) {
        if (e instanceof TypeError) throw new Error("Sem internet para baixar o capítulo.");
        throw e;
      });
  }
  function nomeCap(livro, cap) { return LIVROS[livro][1] + " " + cap; }

  // ------------------------------------------------------------------ inteligência
  var PROFESSOR = "Você é um professor de estudo bíblico cristão, acolhedor e fiel ao texto. " +
    "Escreva em português do Brasil, com linguagem simples e calorosa, para leitura pessoal e devocional. " +
    "Baseie-se no texto bíblico enviado; quando citar outro trecho, dê a referência (livro capítulo:versículo). " +
    "Não invente fatos históricos; quando houver mais de uma interpretação, diga isso com respeito. " +
    "Responda SOMENTE com JSON válido, sem texto fora do JSON.";

  function pedirJSON(instrucao, mensagem) {
    if (!IA()) return Promise.reject(new Error("Assistente não carregado."));
    return IA().consultar(PROFESSOR + " " + instrucao, mensagem).then(function (bruto) {
      var t = String(bruto || "").replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
      var a = t.indexOf("{"), b = t.lastIndexOf("}");
      if (a < 0 || b <= a) throw new Error("A inteligência respondeu num formato inesperado.");
      return JSON.parse(t.slice(a, b + 1));
    });
  }
  function textoDosVersos(versos) { return versos.map(function (v) { return v[0] + " " + v[1]; }).join(" "); }

  function gerarEstudo(titulo, texto) {
    var chave = "bib.estudo." + versao() + "." + normalizar(titulo).replace(/ /g, "_");
    var guardado = ler(chave, null);
    if (guardado) return Promise.resolve(guardado);
    return pedirJSON(
      'Formato: {"titulo":"","resumo":"","contexto":"","licoes":["","",""],"aplicacao":"","oracao":"","pergunta":""}. ' +
      "resumo: o que acontece no trecho (3 a 5 frases). contexto: quem escreveu, para quem, momento histórico (2 a 4 frases). " +
      "licoes: 3 lições principais, cada uma com 1 ou 2 frases. aplicacao: como viver isso hoje (2 a 4 frases). " +
      "oracao: uma oração curta em primeira pessoa. pergunta: uma pergunta para reflexão pessoal.",
      "Estudo de " + titulo + ".\nTexto:\n" + texto.slice(0, 12000)
    ).then(function (e) { gravar(chave, e); return e; });
  }

  // ------------------------------------------------------------------ devocional diário
  // versículos-base (só as referências; o texto vem da Almeida/KJV)
  var DEVOCIONAIS = [
    ["PSA", 23, 1, 6], ["JHN", 3, 16, 17], ["PHP", 4, 6, 7], ["ISA", 41, 10, 10], ["ROM", 8, 28, 28],
    ["PRO", 3, 5, 6], ["JER", 29, 11, 13], ["MAT", 11, 28, 30], ["PSA", 46, 1, 3], ["JOS", 1, 9, 9],
    ["2CO", 5, 17, 17], ["GAL", 2, 20, 20], ["PSA", 121, 1, 8], ["LAM", 3, 22, 24], ["MAT", 6, 33, 34],
    ["ROM", 12, 1, 2], ["HEB", 11, 1, 1], ["JAS", 1, 2, 5], ["1PE", 5, 6, 7], ["PSA", 37, 4, 5],
    ["ISA", 40, 29, 31], ["JHN", 14, 1, 6], ["EPH", 2, 8, 10], ["1CO", 13, 4, 7], ["PSA", 91, 1, 4],
    ["MAT", 5, 14, 16], ["PHP", 4, 13, 13], ["COL", 3, 23, 24], ["PSA", 1, 1, 3], ["JHN", 15, 4, 5],
    ["ROM", 5, 1, 5], ["2TI", 1, 7, 7], ["PSA", 139, 13, 16], ["MIC", 6, 8, 8], ["HEB", 12, 1, 2],
    ["1JN", 1, 9, 9], ["PSA", 51, 10, 12], ["ISA", 26, 3, 4], ["JHN", 16, 33, 33], ["DEU", 31, 6, 8],
    ["PRO", 16, 3, 3], ["ECC", 3, 1, 8], ["MAT", 7, 7, 11], ["ROM", 15, 13, 13], ["PSA", 34, 4, 8],
    ["NEH", 8, 10, 10], ["HAB", 3, 17, 19], ["EPH", 6, 10, 13], ["1TH", 5, 16, 18], ["PSA", 27, 1, 3]
  ];
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function diaDoAno() { var d = new Date(), i = new Date(d.getFullYear(), 0, 0); return Math.floor((d - i) / 864e5); }

  function devocionalDeHoje(forcar) {
    var chave = "bib.devocional." + versao();
    var g = ler(chave, null);
    if (g && g.data === hoje() && !forcar) return Promise.resolve(g);
    var base = DEVOCIONAIS[(diaDoAno() + (forcar ? Math.floor(Math.random() * 49) + 1 : 0)) % DEVOCIONAIS.length];
    var livro = indicePorId(base[0]);
    return baixarCapitulo(livro, base[1]).then(function (versos) {
      var trecho = versos.filter(function (v) { return v[0] >= base[2] && v[0] <= base[3]; });
      var ref = LIVROS[livro][1] + " " + base[1] + ":" + base[2] + (base[3] > base[2] ? "-" + base[3] : "");
      return pedirJSON(
        'Formato: {"titulo":"","reflexao":"","aplicacao":"","oracao":"","desafio":""}. ' +
        "Escreva um devocional diário. titulo: curto e inspirador. reflexao: 2 parágrafos curtos explicando o versículo. " +
        "aplicacao: como isso muda o dia de hoje (2 a 3 frases). oracao: oração curta em primeira pessoa. " +
        "desafio: uma atitude prática para hoje (1 frase).",
        "Versículo do dia: " + ref + "\n" + textoDosVersos(trecho)
      ).then(function (d) {
        var dev = { data: hoje(), ref: ref, versos: trecho, conteudo: d };
        gravar(chave, dev);
        return dev;
      });
    });
  }

  // ------------------------------------------------------------------ planos de leitura
  var PLANOS = [
    { id: "ano", nome: "Bíblia completa em 1 ano", desc: "Toda a Bíblia, de Gênesis a Apocalipse, em 365 dias.", dias: 365, caps: function () { return capitulos(0, 66); } },
    { id: "nt90", nome: "Novo Testamento em 90 dias", desc: "De Mateus a Apocalipse, cerca de 3 capítulos por dia.", dias: 90, caps: function () { return capitulos(INICIO_NT, 66); } },
    { id: "jesus30", nome: "A vida de Jesus em 30 dias", desc: "Os quatro Evangelhos: Mateus, Marcos, Lucas e João.", dias: 30, caps: function () { return capitulos(INICIO_NT, INICIO_NT + 4); } },
    { id: "sab60", nome: "Sabedoria: Salmos e Provérbios em 60 dias", desc: "Oração, louvor e conselhos para o dia a dia.", dias: 60, caps: function () { return capitulos(18, 20); } },
    { id: "cartas40", nome: "Cartas de Paulo em 40 dias", desc: "De Romanos a Filemom: fé, graça e vida na igreja.", dias: 40, caps: function () { return capitulos(44, 57); } }
  ];
  function plano(id) { for (var i = 0; i < PLANOS.length; i++) if (PLANOS[i].id === id) return PLANOS[i]; return null; }
  function leituraDoDia(p, dia) {
    var caps = p.caps(), n = caps.length;
    return caps.slice(Math.floor(dia * n / p.dias), Math.floor((dia + 1) * n / p.dias));
  }
  function descreverLeitura(lista) {
    var grupos = [];
    lista.forEach(function (x) {
      var u = grupos[grupos.length - 1];
      if (u && u.livro === x.livro && u.fim === x.cap - 1) u.fim = x.cap; else grupos.push({ livro: x.livro, ini: x.cap, fim: x.cap });
    });
    return grupos.map(function (g) { return LIVROS[g.livro][1] + " " + g.ini + (g.fim > g.ini ? "–" + g.fim : ""); }).join(", ");
  }
  function progresso() { return ler("bib.planos", { ativo: null, lidos: {} }); }
  function salvarProgresso(p) { gravar("bib.planos", p); }
  function diaAtual(p, prog) {
    var lidos = prog.lidos[p.id] || [];
    for (var d = 0; d < p.dias; d++) if (lidos.indexOf(d) < 0) return d;
    return p.dias;
  }

  // ------------------------------------------------------------------ tela
  var atual = { livro: indicePorId("JHN"), cap: 1, versos: null };
  var lendoEmVoz = false;

  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function carregando(alvo, msg) { alvo.innerHTML = ""; alvo.appendChild(el("p", "bib-carregando", msg || "Carregando...")); }
  function erro(alvo, e) { alvo.innerHTML = ""; alvo.appendChild(el("p", "bib-erro", e.message || String(e))); }

  function montarSeletores() {
    var sl = $("bibLivro");
    sl.innerHTML = "";
    var g1 = document.createElement("optgroup"); g1.label = "Antigo Testamento";
    var g2 = document.createElement("optgroup"); g2.label = "Novo Testamento";
    LIVROS.forEach(function (l, i) { var o = el("option", null, l[1]); o.value = i; (i < INICIO_NT ? g1 : g2).appendChild(o); });
    sl.appendChild(g1); sl.appendChild(g2);
    sl.value = atual.livro;
    montarCapitulos();
  }
  function montarCapitulos() {
    var sc = $("bibCap");
    sc.innerHTML = "";
    for (var c = 1; c <= LIVROS[atual.livro][2]; c++) { var o = el("option", null, "Capítulo " + c); o.value = c; sc.appendChild(o); }
    sc.value = atual.cap;
  }

  function abrirCapitulo(livro, cap, rolar) {
    pararVoz();
    atual.livro = livro; atual.cap = cap; atual.versos = null;
    gravar("bib.ultimo", { livro: livro, cap: cap });
    $("bibLivro").value = livro; montarCapitulos();
    $("bibTitulo").textContent = nomeCap(livro, cap);
    $("bibEstudo").hidden = true;
    var alvo = $("bibTexto");
    carregando(alvo, "Abrindo " + nomeCap(livro, cap) + "...");
    return baixarCapitulo(livro, cap).then(function (versos) {
      atual.versos = versos;
      alvo.innerHTML = "";
      versos.forEach(function (v) {
        var p = el("p", "verso");
        p.appendChild(el("sup", null, String(v[0])));
        p.appendChild(document.createTextNode(" " + v[1]));
        alvo.appendChild(p);
      });
      alvo.appendChild(el("p", "bib-fonte", versao() === "kjv" ? "King James Version, domínio público." : "Bíblia Livre, domínio público."));
      if (rolar !== false) alvo.scrollTop = 0;
      return versos;
    }).catch(function (e) { erro(alvo, e); });
  }
  function proximo(passo) {
    var l = atual.livro, c = atual.cap + passo;
    if (c < 1) { l = (l + LIVROS.length - 1) % LIVROS.length; c = LIVROS[l][2]; }
    else if (c > LIVROS[l][2]) { l = (l + 1) % LIVROS.length; c = 1; }
    abrirCapitulo(l, c);
  }

  function mostrarEstudo(alvo, e) {
    alvo.innerHTML = "";
    alvo.hidden = false;
    alvo.appendChild(el("h3", null, e.titulo || "Estudo"));
    [["Resumo", e.resumo], ["Contexto", e.contexto]].forEach(function (s) { if (s[1]) { alvo.appendChild(el("h4", null, s[0])); alvo.appendChild(el("p", null, s[1])); } });
    if (e.licoes && e.licoes.length) {
      alvo.appendChild(el("h4", null, "Lições"));
      var ul = el("ul"); e.licoes.forEach(function (x) { ul.appendChild(el("li", null, x)); }); alvo.appendChild(ul);
    }
    [["Para viver hoje", e.aplicacao], ["Oração", e.oracao], ["Para refletir", e.pergunta]].forEach(function (s) {
      if (s[1]) { alvo.appendChild(el("h4", null, s[0])); alvo.appendChild(el("p", s[0] === "Oração" ? "oracao" : null, s[1])); }
    });
    var b = el("button", "botao", "OUVIR ESTUDO"); b.type = "button";
    b.onclick = function () { lerEmVoz([e.titulo, e.resumo, e.contexto].concat(e.licoes || [], [e.aplicacao, "Vamos orar. " + e.oracao, e.pergunta]), b); };
    alvo.appendChild(b);
  }
  function estudarCapitulo() {
    if (!atual.versos) return;
    var alvo = $("bibEstudo");
    carregando(alvo, "Preparando o estudo de " + nomeCap(atual.livro, atual.cap) + "...");
    alvo.hidden = false;
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    gerarEstudo(nomeCap(atual.livro, atual.cap), textoDosVersos(atual.versos))
      .then(function (e) { mostrarEstudo(alvo, e); })
      .catch(function (e) { erro(alvo, e); });
  }

  // leitura em voz, em partes, com botão de parar
  function lerEmVoz(partes, botao) {
    if (lendoEmVoz) { pararVoz(); return; }
    var lista = partes.filter(Boolean).map(String);
    lendoEmVoz = true;
    var rotulo = botao ? botao.textContent : "";
    if (botao) { botao.textContent = "PARAR"; botao.dataset.ativo = "sim"; }
    var i = 0;
    (function seguinte() {
      if (!lendoEmVoz || i >= lista.length) { lendoEmVoz = false; if (botao) { botao.textContent = rotulo; botao.dataset.ativo = "nao"; } return; }
      IA().falar(lista[i++]).then(seguinte);
    })();
    pararVoz.botao = botao; pararVoz.rotulo = rotulo;
  }
  function pararVoz() {
    if (!lendoEmVoz) return;
    lendoEmVoz = false;
    if (IA()) IA().calar();
    if (pararVoz.botao) { pararVoz.botao.textContent = pararVoz.rotulo; pararVoz.botao.dataset.ativo = "nao"; }
  }
  function lerCapituloEmVoz(botao) {
    if (!atual.versos) return;
    var partes = [nomeCap(atual.livro, atual.cap) + "."], bloco = "";
    atual.versos.forEach(function (v) { bloco += v[1] + " "; if (bloco.length > 450) { partes.push(bloco); bloco = ""; } });
    if (bloco) partes.push(bloco);
    lerEmVoz(partes, botao || $("bibOuvir"));
  }

  function mostrarDevocional(forcar) {
    var alvo = $("bibDevTexto");
    carregando(alvo, "Preparando o devocional de hoje...");
    return devocionalDeHoje(forcar).then(function (d) {
      var c = d.conteudo || {};
      alvo.innerHTML = "";
      var dataTxt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
      alvo.appendChild(el("p", "bib-data", dataTxt.charAt(0).toUpperCase() + dataTxt.slice(1)));
      alvo.appendChild(el("h3", null, c.titulo || "Devocional"));
      var bloco = el("blockquote", "versiculo");
      bloco.appendChild(el("p", null, d.versos.map(function (v) { return v[1]; }).join(" ")));
      bloco.appendChild(el("cite", null, d.ref));
      alvo.appendChild(bloco);
      [["Reflexão", c.reflexao], ["Para hoje", c.aplicacao], ["Oração", c.oracao], ["Desafio do dia", c.desafio]].forEach(function (s) {
        if (s[1]) { alvo.appendChild(el("h4", null, s[0])); alvo.appendChild(el("p", s[0] === "Oração" ? "oracao" : null, s[1])); }
      });
      return d;
    }).catch(function (e) { erro(alvo, e); });
  }
  function ouvirDevocional(botao) {
    devocionalDeHoje(false).then(function (d) {
      var c = d.conteudo || {};
      lerEmVoz([c.titulo, d.ref + ". " + d.versos.map(function (v) { return v[1]; }).join(" "), c.reflexao, c.aplicacao, "Vamos orar. " + c.oracao, "Desafio de hoje: " + c.desafio], botao || $("bibDevOuvir"));
    }).catch(function () { /* erro já aparece na tela */ });
  }

  function mostrarPlanos() {
    var alvo = $("bibPlanosLista"), prog = progresso();
    alvo.innerHTML = "";
    var ativo = prog.ativo && plano(prog.ativo);
    if (ativo) alvo.appendChild(cartaoPlanoAtivo(ativo, prog));
    alvo.appendChild(el("h3", "bib-secao", ativo ? "Outros planos" : "Escolha um plano"));
    PLANOS.forEach(function (p) {
      if (ativo && p.id === ativo.id) return;
      var card = el("div", "plano");
      card.appendChild(el("strong", null, p.nome));
      card.appendChild(el("p", null, p.desc));
      var feitos = (prog.lidos[p.id] || []).length;
      if (feitos) card.appendChild(el("p", "plano-meta", feitos + " de " + p.dias + " dias lidos"));
      var b = el("button", "botao", feitos ? "CONTINUAR ESTE PLANO" : "COMEÇAR ESTE PLANO"); b.type = "button";
      b.onclick = function () { var pr = progresso(); pr.ativo = p.id; salvarProgresso(pr); mostrarPlanos(); };
      card.appendChild(b);
      alvo.appendChild(card);
    });
  }
  function cartaoPlanoAtivo(p, prog) {
    var dia = diaAtual(p, prog), lidos = (prog.lidos[p.id] || []).length;
    var pct = lidos ? Math.max(1, Math.round(lidos / p.dias * 100)) : 0;
    var card = el("div", "plano ativo");
    card.appendChild(el("span", "plano-etiqueta", "SEU PLANO"));
    card.appendChild(el("strong", null, p.nome));
    var barra = el("div", "barra-progresso"), cheio = el("span");
    cheio.style.width = (lidos / p.dias * 100) + "%";
    barra.appendChild(cheio); card.appendChild(barra);
    card.appendChild(el("p", "plano-meta", lidos + " de " + p.dias + " dias concluídos (" + pct + "%)"));
    if (dia >= p.dias) {
      card.appendChild(el("p", null, "Parabéns! Você concluiu este plano."));
      return card;
    }
    var lista = leituraDoDia(p, dia);
    card.appendChild(el("h4", null, "Dia " + (dia + 1) + ": " + descreverLeitura(lista)));
    var caps = el("div", "plano-caps");
    lista.forEach(function (x) {
      var b = el("button", "chip", nomeCap(x.livro, x.cap)); b.type = "button";
      b.onclick = function () { trocarAba("ler"); abrirCapitulo(x.livro, x.cap); };
      caps.appendChild(b);
    });
    card.appendChild(caps);
    var linha = el("div", "linha");
    var bEst = el("button", "botao", "ESTUDO DO DIA"); bEst.type = "button";
    var bOk = el("button", "botao principal", "MARCAR COMO LIDO"); bOk.type = "button";
    linha.appendChild(bEst); linha.appendChild(bOk); card.appendChild(linha);
    var estudo = el("div", "bib-estudo"); estudo.hidden = true; card.appendChild(estudo);
    bOk.onclick = function () {
      var pr = progresso(); pr.lidos[p.id] = pr.lidos[p.id] || [];
      if (pr.lidos[p.id].indexOf(dia) < 0) pr.lidos[p.id].push(dia);
      salvarProgresso(pr); mostrarPlanos();
    };
    bEst.onclick = function () {
      estudo.hidden = false;
      carregando(estudo, "Preparando o estudo do dia " + (dia + 1) + "...");
      Promise.all(lista.map(function (x) { return baixarCapitulo(x.livro, x.cap); }))
        .then(function (todos) {
          var texto = todos.map(function (v, i) { return nomeCap(lista[i].livro, lista[i].cap) + ": " + textoDosVersos(v); }).join("\n");
          return gerarEstudo(descreverLeitura(lista), texto);
        })
        .then(function (e) { mostrarEstudo(estudo, e); })
        .catch(function (e) { erro(estudo, e); });
    };
    var sair = el("button", "link", "Trocar de plano"); sair.type = "button";
    sair.onclick = function () { var pr = progresso(); pr.ativo = null; salvarProgresso(pr); mostrarPlanos(); };
    card.appendChild(sair);
    return card;
  }

  // ------------------------------------------------------------------ abas
  function trocarAba(aba) {
    ["ler", "devocional", "planos"].forEach(function (a) {
      $("bibAba-" + a).setAttribute("aria-selected", a === aba ? "true" : "false");
      $("bibPainel-" + a).hidden = a !== aba;
    });
    if (aba === "devocional" && !$("bibDevTexto").dataset.pronto) { $("bibDevTexto").dataset.pronto = "1"; mostrarDevocional(false); }
    if (aba === "planos") mostrarPlanos();
    if (aba === "ler" && !atual.versos) abrirCapitulo(atual.livro, atual.cap);
  }

  var iniciado = false;
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    var u = ler("bib.ultimo", null);
    if (u && LIVROS[u.livro]) { atual.livro = u.livro; atual.cap = u.cap; }
    montarSeletores();
    $("bibLivro").onchange = function () { abrirCapitulo(Number(this.value), 1); };
    $("bibCap").onchange = function () { abrirCapitulo(atual.livro, Number(this.value)); };
    $("bibAnterior").onclick = function () { proximo(-1); };
    $("bibProximo").onclick = function () { proximo(1); };
    $("bibOuvir").onclick = function () { lerCapituloEmVoz(this); };
    $("bibEstudar").onclick = estudarCapitulo;
    $("bibDevOuvir").onclick = function () { ouvirDevocional(this); };
    $("bibDevOutro").onclick = function () { mostrarDevocional(true); };
    ["ler", "devocional", "planos"].forEach(function (a) { $("bibAba-" + a).onclick = function () { trocarAba(a); }; });
  }

  // ------------------------------------------------------------------ comandos de voz do assistente
  // acao: {tipo:"biblia", livro, capitulo, ler} | {tipo:"devocional"} | {tipo:"plano"}
  function executar(acao, mostrarTela) {
    iniciar();
    if (mostrarTela) mostrarTela();
    if (acao.tipo === "devocional") {
      trocarAba("devocional");
      $("bibDevTexto").dataset.pronto = "1";
      return mostrarDevocional(false).then(function () { if (!acao.semVoz) ouvirDevocional(); });
    }
    if (acao.tipo === "plano") { trocarAba("planos"); return Promise.resolve(); }
    var i = acharLivro(acao.livro);
    if (i < 0) i = atual.livro;
    var cap = Math.max(1, Math.min(LIVROS[i][2], Number(acao.capitulo) || 1));
    trocarAba("ler");
    return abrirCapitulo(i, cap).then(function () { if (acao.ler) lerCapituloEmVoz(); });
  }

  // texto para a conversa ao vivo ler ou explicar
  function texto(livro, cap, ini, fim) {
    var i = acharLivro(livro);
    if (i < 0) return Promise.resolve("Não encontrei o livro " + livro + ".");
    var c = Math.max(1, Math.min(LIVROS[i][2], Number(cap) || 1));
    ini = Number(ini) || 0; fim = Number(fim) || ini;
    return baixarCapitulo(i, c).then(function (versos) {
      var v = ini ? versos.filter(function (x) { return x[0] >= ini && x[0] <= fim; }) : versos;
      var ref = LIVROS[i][1] + " " + c + (ini ? ":" + ini + (fim > ini ? "-" + fim : "") : "");
      return ref + " (" + (versao() === "kjv" ? "King James" : "Bíblia Livre") + "): " + textoDosVersos(v).slice(0, 7000);
    });
  }

  window.HerupuBiblia = {
    texto: texto,
    iniciar: function () { iniciar(); if (!atual.versos && !$("bibPainel-ler").hidden) abrirCapitulo(atual.livro, atual.cap); },
    executar: executar, pararVoz: pararVoz,
    // para testes
    _livros: LIVROS, _planos: PLANOS, _leituraDoDia: leituraDoDia, _acharLivro: acharLivro, _descrever: descreverLeitura
  };
})();
