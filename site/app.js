/*
 * HERUPU Mobile — app de voz para celular (PWA).
 *
 * Estados:  parado → vigia (esperando palmas/frase) → acordando (música + saudação)
 *           → ouvindo (comando) → pensando (cérebro) → falando → ouvindo ... → vigia
 *
 * Limite do navegador: a escuta só funciona com o app ABERTO e a tela LIGADA.
 * O app pede para a tela não apagar enquanto está em vigia.
 */
(function () {
  "use strict";
  var N = window.HerupuNucleo;
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------------ configuração
  var PADRAO = {
    nome: "HERUPU LEGENDÁRIO",
    frase: "legendário",
    saudacao: "Sim, Legendário Aécio. O que posso lhe ajudar?",
    negocio: "Herupu Assistência: energia solar em Macapá e em todo o Amapá (interior com preço diferenciado). " +
      "Concessionária: CEA Equatorial. Nunca prometa conta zerada: existe taxa mínima, Fio B e iluminação pública.",
    cerebro: "gemini",
    chave: "",
    modelo: "gemini-flash-lite-latest",
    servidor: "",
    modo: "ambos",
    sensibilidade: 5,
    voz: "padrao",
    conversa: "aovivo",
    haUrl: "",
    haToken: "",
    modeloAoVivo: "gemini-3.8-live",
    vozAoVivo: "Algenib",
    bibliaVersao: "almeida"
  };
  var cfg = carregar();

  function carregar() {
    try { return Object.assign({}, PADRAO, JSON.parse(localStorage.getItem("herupu.cfg") || "{}")); }
    catch (e) { return Object.assign({}, PADRAO); }
  }
  function salvar() {
    try { localStorage.setItem("herupu.cfg", JSON.stringify(cfg)); } catch (e) { /* armazenamento bloqueado */ }
  }
  // sensibilidade 1..10 → energia mínima da palma (10 = mais sensível)
  function energiaDaSensibilidade(s) { return [0.30, 0.22, 0.16, 0.12, 0.09, 0.07, 0.055, 0.045, 0.035, 0.028][10 - s] || 0.09; }

  // ------------------------------------------------------------------ estado e tela
  var estado = "parado";
  var historico = []; // [{papel:'user'|'model', texto}]
  function mudarEstado(novo) {
    estado = novo;
    var nomes = { parado: "Parado", vigia: "Escutando", acordando: "Acordando", ouvindo: "Ouvindo", pensando: "Pensando", falando: "Falando" };
    $("estado").textContent = (novo === "parado" ? "○ " : "● ") + (nomes[novo] || novo);
    $("estado").dataset.estado = novo;
    $("reator").dataset.estado = novo;
    if (NAT) nativo("estado", { estado: novo }).catch(function () { /* ok */ });
    var ef = $("esferaFlutuante");
    if (ef) { ef.dataset.estado = novo; ef.setAttribute("aria-label", "HERUPU: " + (nomes[novo] || novo) + ". Toque para voltar ao assistente"); }
    document.title = (novo === "parado" ? "" : "● ") + cfg.nome;
    $("reatorTexto").textContent = novo === "parado" ? "Toque para ligar" : novo === "vigia" ? "Aguardando o chamado" : nomes[novo];
    var aoVivo = window.HerupuAoVivo && window.HerupuAoVivo.ativo();
    $("botaoFalar").textContent = aoVivo ? "ENCERRAR CONVERSA" : "FALAR AGORA";
    $("botaoFalar").dataset.ativo = aoVivo ? "sim" : "nao";
  }
  function aviso(texto) {
    $("aviso").textContent = texto || "";
    $("aviso").hidden = !texto;
  }
  function adicionarMensagem(quem, texto, extra) {
    var li = document.createElement("li");
    li.className = quem === "eu" ? "eu" : "ia";
    var rot = document.createElement("span");
    rot.className = "quem";
    rot.textContent = quem === "eu" ? "Você" : cfg.nome;
    li.appendChild(rot);
    li.appendChild(document.createTextNode(texto));
    if (extra && extra.imagem) { var img = document.createElement("img"); img.src = extra.imagem; img.alt = "Foto enviada"; li.appendChild(img); }
    if (extra && extra.link) {
      var a = document.createElement("a"); a.href = extra.link; a.textContent = " Abrir"; a.target = "_blank"; a.rel = "noopener";
      li.appendChild(a);
    }
    var lista = $("conversa");
    lista.appendChild(li);
    while (lista.children.length > 30) lista.removeChild(lista.firstChild);
    li.scrollIntoView({ block: "end", behavior: "smooth" });
  }
  function aplicarIdentidade() {
    var n = $("nomeAssistente"); if (n) n.textContent = cfg.nome.toUpperCase();
    var fd = $("fraseDica"); if (fd) fd.textContent = "“" + cfg.frase + "”"; // pode não existir (texto da tela mudou)
    document.title = cfg.nome;
  }

  // ------------------------------------------------------------------ áudio de entrada (palmas + nível)
  var audioCtx = null, fluxo = null, processador = null, detector = null, nivelAtual = 0;

  function iniciarMicrofone() {
    if (fluxo) return Promise.resolve();
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (s) {
      fluxo = s;
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var fonte = audioCtx.createMediaStreamSource(s);
      processador = audioCtx.createScriptProcessor(1024, 1, 1);
      detector = new N.DetectorPalmas({ taxaAmostragem: audioCtx.sampleRate, energiaMinima: energiaDaSensibilidade(cfg.sensibilidade) });
      processador.onaudioprocess = function (e) {
        var dados = e.inputBuffer.getChannelData(0);
        var ativou = detector.processarBloco(dados);
        nivelAtual = nivelAtual * 0.7 + detector.ultimoRms * 0.3;
        if (ativou && estado === "vigia" && cfg.modo !== "voz") acordar("2 palmas");
      };
      fonte.connect(processador);
      processador.connect(audioCtx.destination); // necessário para o processador rodar (sai em silêncio)
    });
  }
  function pararMicrofone() {
    if (processador) { processador.disconnect(); processador.onaudioprocess = null; processador = null; }
    if (fluxo) { fluxo.getTracks().forEach(function (t) { t.stop(); }); fluxo = null; }
  }

  // ------------------------------------------------------------------ app Android (APK): recursos do celular
  var CAP = window.Capacitor;
  var NAT = CAP && CAP.isNativePlatform && CAP.isNativePlatform()
    ? (CAP.registerPlugin ? CAP.registerPlugin("HerupuNativo") : CAP.Plugins && CAP.Plugins.HerupuNativo) : null;
  // No navegador (celular/PC), a conversa "ao vivo" do Google usa OUTRA voz (Algenib) e costuma falhar
  // sem o app nativo. Então, no navegador, usamos sempre o modo por turnos, com a voz natural do Antonio
  // (a mesma do PC) e sem a escuta contínua que fica "piscando" o microfone.
  if (!NAT) cfg.conversa = "turnos";
  // no APK, pede a permissão do microfone ao Android antes de o app começar a ouvir
  function permissaoMicrofone() {
    if (!NAT || !NAT.requestPermissions) return Promise.resolve(true);
    return NAT.requestPermissions({ permissions: ["microfone"] })
      .then(function (r) { return !r || r.microfone === "granted"; })
      .catch(function () { return true; });
  }
  function nativo(metodo, args) {
    if (!NAT || !NAT[metodo]) return Promise.reject(new Error("recurso disponível só no app Android"));
    return NAT[metodo](args || {});
  }

  // ------------------------------------------------------------------ reconhecimento de voz
  var Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recVigia = null, recComando = null, vozDeVigiaFalhou = false;

  function iniciarVigiaDeVoz() {
    if (NAT) { // no APK, quem ouve a palavra/palmas é SEMPRE o Android nativo (nunca a escuta contínua da web, que fica piscando o microfone)
      if (cfg.modo !== "palmas") nativo("vigiaPalavra", { ligar: true, frases: [cfg.frase] }).catch(function () { /* ok */ });
      return;
    }
    if (!NAT) return; // navegador: SEM escuta contínua (sem modo Alexa). O usuário toca na esfera para falar.
    // eslint-disable-next-line no-unreachable
    if (!Reconhecimento || vozDeVigiaFalhou || recVigia) return;
    var r = new Reconhecimento();
    r.lang = "pt-BR"; r.continuous = true; r.interimResults = true;
    r.onresult = function (e) {
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (N.fraseBate(e.results[i][0].transcript, [cfg.frase], 0.75)) { acordar("voz"); return; }
      }
    };
    r.onerror = function (e) {
      if (e.error === "audio-capture" || e.error === "not-allowed" || e.error === "service-not-allowed") {
        vozDeVigiaFalhou = true;
        aviso(cfg.modo === "voz"
          ? "Este celular não liberou a frase de ativação. Use as palmas ou o botão do microfone."
          : "A frase de ativação não funcionou junto com as palmas neste celular. As palmas continuam ativas.");
      }
    };
    r.onend = function () { recVigia = null; if (estado === "vigia") setTimeout(iniciarVigiaDeVoz, 300); };
    try { r.start(); recVigia = r; } catch (e) { recVigia = null; }
  }
  function pararVigiaDeVoz() {
    if (NAT) nativo("vigiaPalavra", { ligar: false }).catch(function () { /* ok */ });
    if (recVigia) { var r = recVigia; recVigia = null; r.onend = null; try { r.abort(); } catch (e) { /* já parado */ } }
  }

  // ouve UMA frase e devolve o texto ("" se ninguém falou)
  function ouvirUmaFrase(limiteMs) {
    if (NAT && !Reconhecimento) {
      marcarMicrofone(true);
      return nativo("ouvir").then(function (r) { marcarMicrofone(false); return String((r && r.texto) || "").trim(); })
        .catch(function () { marcarMicrofone(false); return ""; });
    }
    return new Promise(function (resolver) {
      if (!Reconhecimento) { aviso("Este navegador não reconhece voz. Use o Chrome no Android ou digite."); resolver(""); return; }
      if (recComando) { try { recComando.abort(); } catch (e) { /* ok */ } recComando = null; } // libera uma escuta anterior
      var r = new Reconhecimento(), finalTexto = "", parcial = "", terminou = false, falou = false;
      // escuta contínua: deixa a pessoa falar devagar e em frases longas sem ser cortada
      r.lang = "pt-BR"; r.continuous = true; r.interimResults = true;
      var ESPERA_INICIO = limiteMs || 12000; // tempo para a 1ª fala começar
      var PAUSA_FIM = 1500;                   // silêncio (ms) que entende que você terminou de falar (menor = responde mais rápido)
      var MAX_TOTAL = 45000;                  // trava de segurança
      var tInicio = null, tPausa = null, tMax = null;
      function encerrar() { try { r.stop(); } catch (e) { /* ok */ } }
      function finalizar() {
        if (terminou) return; terminou = true;
        clearTimeout(tInicio); clearTimeout(tPausa); clearTimeout(tMax);
        recComando = null; marcarMicrofone(false);
        resolver((finalTexto + " " + parcial).trim());
      }
      function adiarFim() { clearTimeout(tPausa); tPausa = setTimeout(encerrar, PAUSA_FIM); }
      r.onresult = function (e) {
        var f = "", p = "";
        for (var i = 0; i < e.results.length; i++) {
          var seg = (e.results[i][0] && e.results[i][0].transcript) || "";
          if (e.results[i].isFinal) f += seg + " "; else p += seg;
        }
        finalTexto = f; parcial = p;
        if (!falou && (f.trim() || p.trim())) { falou = true; clearTimeout(tInicio); } // começou a falar
        adiarFim(); // enquanto fala, adia o encerramento
      };
      r.onerror = function () { /* trata no onend */ };
      r.onend = finalizar;
      tInicio = setTimeout(encerrar, ESPERA_INICIO); // ninguém falou: desiste
      tMax = setTimeout(encerrar, MAX_TOTAL);
      var tentou = false;
      function comecar() {
        try { r.start(); recComando = r; marcarMicrofone(true); }
        catch (e) { if (!tentou) { tentou = true; setTimeout(comecar, 400); } else resolver(""); } // reinicia se o microfone ainda estava ocupado
      }
      comecar();
    });
  }
  function marcarMicrofone(ativo) { $("botaoFalar").dataset.ativo = ativo ? "sim" : "nao"; }

  // ------------------------------------------------------------------ voz de saída
  function vozEscolhida() {
    var vozes = speechSynthesis.getVoices();
    return vozes.find(function (v) { return v.voiceURI === cfg.voz; }) ||
      vozes.find(function (v) { return /pt[-_]BR/i.test(v.lang); }) ||
      vozes.find(function (v) { return /^pt/i.test(v.lang); }) || null;
  }
  // Voz natural (neural) vinda do servidor HERUPU; se não houver, usa a voz do aparelho.
  var vozNaturalFalhou = false, audioFala = null;
  function urlVozNatural() {
    if (cfg.cerebro !== "servidor" || !cfg.servidor || vozNaturalFalhou) return null;
    return /\/api\/chat\/?$/.test(cfg.servidor) ? cfg.servidor.replace(/\/api\/chat\/?$/, "/api/falar") : null;
  }
  // ---- voz da inteligência (a mesma do PC: Gemini, voz Algenib), com a chave do Google
  var VOZES_IA = [["Algenib", "Algenib: a mesma do PC"], ["Charon", "Charon: informativa"], ["Orus", "Orus: firme"],
    ["Puck", "Puck: animada"], ["Sadaltager", "Sadaltager: experiente"], ["Kore", "Kore: feminina e firme"], ["Sulafat", "Sulafat: calorosa"]];
  var modeloVoz = null, vozIaFalhou = 0, fonteVoz = null, ctxVoz = null, falaAtual = 0;
  function vozPadrao(v) { return !v || v === "padrao" || v === "gemini:Algenib" && !cfg.vozEscolhida; }
  function vozDaIA() {
    var v = vozPadrao(cfg.voz) ? (urlVozNatural() ? null : "gemini:Algenib") : cfg.voz;
    if (!v || v.indexOf("gemini:") !== 0 || cfg.cerebro !== "gemini" || !cfg.chave) return null;
    if (vozIaFalhou && Date.now() - vozIaFalhou < 10 * 60 * 1000) return null; // limite atingido: tenta de novo em 10 min
    return v.slice(7);
  }
  function acharModeloVoz() {
    if (modeloVoz) return Promise.resolve(modeloVoz);
    try { var g = localStorage.getItem("herupu.modeloVoz"); if (g) { modeloVoz = g; return Promise.resolve(g); } } catch (e) { /* ok */ }
    return fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": cfg.chave } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var nomes = (j.models || []).filter(function (m) {
          return /tts/i.test(m.name) && (m.supportedGenerationMethods || []).indexOf("generateContent") >= 0;
        }).map(function (m) { return m.name.replace(/^models\//, ""); });
        nomes.sort(function (a, b) { return (/flash/.test(b) - /flash/.test(a)) || (/preview/.test(a) - /preview/.test(b)) || b.localeCompare(a); });
        if (!nomes.length) throw new Error("sem modelo de voz");
        modeloVoz = nomes[0];
        try { localStorage.setItem("herupu.modeloVoz", modeloVoz); } catch (e) { /* ok */ }
        return modeloVoz;
      });
  }
  function gerarAudioIA(texto, voz) {
    return acharModeloVoz().then(function (modelo) {
      return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelo) + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.chave },
        body: JSON.stringify({
          contents: [{ parts: [{ text: limparParaFala(texto) }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } }
        })
      });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 404) { modeloVoz = null; try { localStorage.removeItem("herupu.modeloVoz"); } catch (e) { /* ok */ } }
        if (!r.ok) throw new Error((j.error && j.error.message) || "voz " + r.status);
        var parte = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])
          .filter(function (p) { return p.inlineData || p.inline_data; })[0];
        var dados = parte && (parte.inlineData || parte.inline_data);
        if (!dados) throw new Error("sem áudio");
        var taxa = Number((/rate=(\d+)/.exec(dados.mimeType || dados.mime_type || "") || [])[1]) || 24000;
        var bin = atob(dados.data), n = bin.length >> 1, amostras = new Float32Array(n);
        for (var i = 0; i < n; i++) { var v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; amostras[i] = v / 32768; }
        return { amostras: limparFimDoAudio(amostras, taxa), taxa: taxa };
      });
    });
  }
  // tira símbolos que a voz leria em voz alta
  function limparParaFala(t) {
    return String(t || "").replace(/[*_#`>~|\[\]{}]/g, " ").replace(/https?:\/\/\S+/g, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s+/g, " ").trim();
  }
  // corta o chiado ("rádio desligando") que às vezes vem depois da última palavra
  function limparFimDoAudio(a, taxa) {
    var janela = Math.round(taxa * 0.02), n = Math.floor(a.length / janela), ultimaVoz = -1, picoGeral = 0;
    var rms = new Float32Array(n), zcr = new Float32Array(n);
    for (var j = 0; j < n; j++) {
      var soma = 0, cruz = 0, ini = j * janela;
      for (var k = ini; k < ini + janela; k++) { soma += a[k] * a[k]; if (k > ini && (a[k] >= 0) !== (a[k - 1] >= 0)) cruz++; }
      rms[j] = Math.sqrt(soma / janela); zcr[j] = cruz / janela;
      if (rms[j] > picoGeral) picoGeral = rms[j];
    }
    // "voz" = trecho com volume e frequência de fala (o chiado tem muitas oscilações)
    for (j = n - 1; j >= 0; j--) if (rms[j] > picoGeral * 0.08 && zcr[j] < 0.22) { ultimaVoz = j; break; }
    if (ultimaVoz < 0) return a;
    var fim = Math.min(a.length, (ultimaVoz + 1) * janela + Math.round(taxa * 0.18)); // deixa o final das palavras (ex.: "s")
    var saida = a.slice(0, fim), suave = Math.min(saida.length, Math.round(taxa * 0.08));
    for (var i = 0; i < suave; i++) saida[saida.length - 1 - i] *= i / suave;           // termina sem estalo
    var entrada = Math.min(saida.length, Math.round(taxa * 0.01));
    for (i = 0; i < entrada; i++) saida[i] *= i / entrada;
    return saida;
  }
  function tocarAmostras(a, minhaFala) {
    return new Promise(function (resolver) {
      if (minhaFala !== falaAtual) { resolver(); return; }
      ctxVoz = ctxVoz || audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctxVoz.state === "suspended") ctxVoz.resume();
      var buf = ctxVoz.createBuffer(1, a.amostras.length, a.taxa);
      buf.getChannelData(0).set(a.amostras);
      var src = ctxVoz.createBufferSource();
      src.buffer = buf; src.connect(ctxVoz.destination);
      src.onended = function () { if (fonteVoz === src) fonteVoz = null; resolver(); };
      fonteVoz = src; src.start();
    });
  }
  // divide textos longos em partes (menos pedidos e começa a falar mais rápido)
  function partesDoTexto(texto) {
    var frases = String(texto).match(/[^.!?;]+[.!?;]*\s*/g) || [texto], partes = [], atual = "";
    frases.forEach(function (f) { if ((atual + f).length > 900 && atual) { partes.push(atual); atual = ""; } atual += f; });
    if (atual.trim()) partes.push(atual);
    return partes;
  }
  function falarIA(texto, voz) {
    var minhaFala = ++falaAtual, partes = partesDoTexto(texto), i = 0;
    var proximo = gerarAudioIA(partes[0], voz);
    function seguinte() {
      if (minhaFala !== falaAtual || i >= partes.length) return Promise.resolve();
      var atual = proximo; i++;
      if (i < partes.length) proximo = gerarAudioIA(partes[i], voz); // já prepara a próxima parte
      return atual.then(function (a) { return tocarAmostras(a, minhaFala); }).then(seguinte);
    }
    return seguinte().catch(function (e) {
      if (minhaFala !== falaAtual) return;
      vozIaFalhou = Date.now();
      if (!falarIA.avisou) { falarIA.avisou = true; aviso("A voz da inteligência atingiu o limite grátis de agora. Usando a voz do celular por alguns minutos."); }
      return falarAparelho(partes.slice(Math.max(0, i - 1)).join(" "));
    });
  }

  function falar(texto) {
    var vozIa = texto ? vozDaIA() : null;
    if (vozIa) return falarIA(texto, vozIa);
    var vozDoCelular = cfg.voz && !vozPadrao(cfg.voz) && cfg.voz.indexOf("gemini:") !== 0;
    var url = vozDoCelular ? null : urlVozNatural();
    if (!url || !texto) return falarAparelho(texto);
    return falarServidor(texto, url);
  }
  // divide em frases curtas (~220 caracteres) para começar a falar a 1ª enquanto gera as próximas
  function partesParaVoz(texto) {
    var frases = String(texto).match(/[^.!?;:]+[.!?;:]*\s*/g) || [texto], partes = [], atual = "";
    frases.forEach(function (f) { if ((atual + f).length > 500 && atual) { partes.push(atual); atual = ""; } atual += f; });
    if (atual.trim()) partes.push(atual);
    return partes;
  }
  function pedirAudioServidor(url, texto) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: texto }) })
      .then(function (r) { if (!r.ok) throw new Error("voz " + r.status); return r.blob(); });
  }
  function tocarBlob(blob, minhaFala) {
    return new Promise(function (resolver) {
      if (minhaFala !== falaAtual) { resolver(); return; }
      if (audioFala) { try { audioFala.pause(); } catch (e) { /* ok */ } }
      audioFala = new Audio(URL.createObjectURL(blob));
      audioFala.onended = function () { resolver(); };
      audioFala.onerror = function () { resolver(); };
      audioFala.play().catch(function () { resolver(); });
    });
  }
  function falarServidor(texto, url) {
    var minhaFala = ++falaAtual, partes = partesParaVoz(texto), i = 0;
    var proximo = pedirAudioServidor(url, partes[0]);          // já pede a 1ª frase
    function seguinte() {
      if (minhaFala !== falaAtual || i >= partes.length) return Promise.resolve();
      var atual = proximo; i++;
      if (i < partes.length) proximo = pedirAudioServidor(url, partes[i]); // adianta a próxima enquanto toca a atual
      return atual.then(function (blob) { return tocarBlob(blob, minhaFala); }).then(seguinte);
    }
    return seguinte().catch(function () {
      if (minhaFala !== falaAtual) return;
      vozNaturalFalhou = true;
      return falarAparelho(partes.slice(Math.max(0, i - 1)).join(" "));
    });
  }
  function falarAparelho(texto) {
    return new Promise(function (resolver) {
      if (!("speechSynthesis" in window) || !texto) { resolver(); return; }
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(texto);
      var v = vozEscolhida(); if (v) u.voice = v;
      u.lang = (v && v.lang) || "pt-BR"; u.rate = 1.05;
      var fim = function () { clearTimeout(seguranca); resolver(); };
      var seguranca = setTimeout(fim, 4000 + texto.length * 90); // alguns celulares não avisam o fim
      u.onend = fim; u.onerror = fim;
      speechSynthesis.speak(u);
    });
  }
  function preencherVozes() {
    var sel = $("cfgVoz"), vozes = ("speechSynthesis" in window ? speechSynthesis.getVoices() : []).filter(function (v) { return /^pt/i.test(v.lang); });
    sel.innerHTML = "";
    var g0 = document.createElement("optgroup"); g0.label = "Igual ao computador";
    var pad = document.createElement("option"); pad.value = "padrao"; pad.textContent = "Antonio: a mesma voz do PC"; g0.appendChild(pad);
    sel.appendChild(g0);
    var g1 = document.createElement("optgroup"); g1.label = "Vozes da inteligência do Google";
    VOZES_IA.forEach(function (v) { var o = document.createElement("option"); o.value = "gemini:" + v[0]; o.textContent = v[1].replace(": a mesma do PC", ": rouca"); g1.appendChild(o); });
    var g2 = document.createElement("optgroup"); g2.label = "Voz do próprio celular";
    var auto = document.createElement("option"); auto.value = "aparelho"; auto.textContent = "Automática do celular"; g2.appendChild(auto);
    vozes.forEach(function (v) { var o = document.createElement("option"); o.value = v.voiceURI; o.textContent = v.name; g2.appendChild(o); });
    sel.appendChild(g1); sel.appendChild(g2);
    sel.value = vozPadrao(cfg.voz) ? "padrao" : cfg.voz;
    if (!sel.value) sel.value = "padrao";
  }

  // ------------------------------------------------------------------ música de abertura
  function bancoMusica(modo, valor) {
    return new Promise(function (resolver) {
      try {
        var pedido = indexedDB.open("herupu", 1);
        pedido.onupgradeneeded = function () { pedido.result.createObjectStore("arquivos"); };
        pedido.onerror = function () { resolver(null); };
        pedido.onsuccess = function () {
          var tx = pedido.result.transaction("arquivos", modo === "ler" ? "readonly" : "readwrite");
          var loja = tx.objectStore("arquivos");
          var op = modo === "ler" ? loja.get("musica") : modo === "apagar" ? loja.delete("musica") : loja.put(valor, "musica");
          op.onsuccess = function () { resolver(op.result || null); };
          op.onerror = function () { resolver(null); };
        };
      } catch (e) { resolver(null); }
    });
  }
  var tocador = null;
  function tocarAbertura() {
    return bancoMusica("ler").then(function (blob) {
      if (blob) {
        tocador = new Audio(URL.createObjectURL(blob));
        tocador.volume = 0.9;
        tocador.play().catch(function () { /* sem permissão de áudio */ });
        setTimeout(baixarMusica, 9000, 0);
        return;
      }
      somPadrao();
    });
  }
  function baixarMusica(vol) {
    if (!tocador) return;
    if (vol === 0) {
      var t = tocador, passos = 20, i = 0;
      var int = setInterval(function () { i++; t.volume = Math.max(0, 0.9 * (1 - i / passos)); if (i >= passos) { clearInterval(int); t.pause(); } }, 100);
      tocador = null;
    } else tocador.volume = vol;
  }
  // som de "ligando os sistemas", criado na hora (sem arquivo e sem direitos autorais)
  function somPadrao() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    var ctx = audioCtx, t0 = ctx.currentTime + 0.05, saida = ctx.createGain();
    saida.gain.value = 0.18; saida.connect(ctx.destination);
    var sobe = ctx.createOscillator(), gs = ctx.createGain();
    sobe.type = "sawtooth"; sobe.frequency.setValueAtTime(110, t0); sobe.frequency.exponentialRampToValueAtTime(880, t0 + 1.2);
    gs.gain.setValueAtTime(0, t0); gs.gain.linearRampToValueAtTime(0.5, t0 + 0.3); gs.gain.linearRampToValueAtTime(0, t0 + 1.3);
    sobe.connect(gs); gs.connect(saida); sobe.start(t0); sobe.stop(t0 + 1.35);
    [261.6, 329.6, 392, 523.3].forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + 1.3 + i * 0.09;
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      o.connect(g); g.connect(saida); o.start(t); o.stop(t + 1.7);
    });
  }

  // ------------------------------------------------------------------ cérebro
  function instrucoes() {
    return "Você é " + cfg.nome + ", o assistente pessoal GERAL do Aécio, falando pelo celular dele. " +
      "Você ajuda com QUALQUER assunto: perguntas, contas, ideias, estudo, tecnologia, dia a dia, trabalho e o que mais ele pedir. " +
      "Fale como um parceiro de verdade: tom másculo, calmo e próximo, do jeito que um amigo experiente conversa — natural, humano, nada robótico. " +
      "Use linguagem simples e brasileira do dia a dia, pode usar expressões leves ('beleza', 'pode deixar', 'tô contigo'), sem exagero. " +
      "Responda curto (1 a 3 frases), direto ao ponto, porque sua resposta será FALADA em voz alta. Evite listas e termos técnicos na fala. " +
      "Trate o Aécio pelo nome de vez em quando, e varie o jeito de responder (não comece sempre igual). " +
      "Quando o assunto for a empresa dele, use este contexto: " + cfg.negocio + " " +
      "Responda SEMPRE só com um JSON neste formato: {\"fala\": \"texto para falar\", \"acao\": null} " +
      "ou com uma ação do celular quando o usuário pedir claramente: " +
      "{\"tipo\":\"ligar\",\"numero\":\"...\"}, {\"tipo\":\"whatsapp\",\"numero\":\"...\",\"mensagem\":\"...\"}, " +
      "{\"tipo\":\"mapa\",\"destino\":\"...\"}, {\"tipo\":\"pesquisar\",\"termo\":\"...\"}, {\"tipo\":\"abrir_site\",\"url\":\"https://...\"}, " +
      "{\"tipo\":\"foto\"} (abre a câmera quando precisar VER algo — um objeto, um lugar, um documento, a conta de luz, o que o usuário mostrar), " +
      "{\"tipo\":\"biblia\",\"livro\":\"João\",\"capitulo\":3,\"ler\":true} (abrir um capítulo da Bíblia; ler=true quando pedir para ler em voz alta), " +
      "{\"tipo\":\"devocional\"} (devocional de hoje), {\"tipo\":\"plano\"} (planos de leitura da Bíblia). " +
      "MARKETING (você também é o agente de marketing da empresa: Instagram e Facebook): " +
      "{\"tipo\":\"post_marketing\",\"tema\":\"sobre o que é o post\",\"redes\":[\"instagram\"],\"quando\":\"AAAA-MM-DDTHH:MM\"} " +
      "cria um RASCUNHO de post com legenda escrita pela IA (redes: instagram e/ou facebook; quando é opcional, no horário local). " +
      "O rascunho nunca é publicado sozinho: o Aécio confere, coloca a imagem e aprova no painel. Diga isso de forma curta na fala. " +
      "{\"tipo\":\"marketing\"} abre o painel de marketing (posts, agenda, comentários, relatório). " +
      (NAT ? "No app Android também: {\"tipo\":\"abrir_app\",\"nome\":\"YouTube\"}, {\"tipo\":\"alarme\",\"hora\":7,\"minuto\":30,\"mensagem\":\"...\"}, " +
        "{\"tipo\":\"timer\",\"segundos\":300}, {\"tipo\":\"lanterna\",\"ligar\":true}. " : "") +
      "Nunca invente números de telefone: se faltar, pergunte. As ações só ABREM o app certo; o usuário confirma o envio ou a ligação. " +
      "Data e hora agora: " + new Date().toLocaleString("pt-BR") + ".";
  }

  function perguntarAoCerebro(texto, imagem) {
    historico.push({ papel: "user", texto: texto });
    if (historico.length > 12) historico = historico.slice(-12);
    var promessa = cfg.cerebro === "servidor" ? viaServidor(texto, imagem) : viaGemini(imagem);
    return promessa.then(function (bruto) {
      var r = N.lerResposta(bruto);
      historico.push({ papel: "model", texto: r.fala });
      return r;
    });
  }

  function viaGemini(imagem) {
    if (!cfg.chave) return Promise.reject(new Error("Falta a chave da API Gemini. Abra os Ajustes."));
    var conteudos = historico.map(function (m) { return { role: m.papel, parts: [{ text: m.texto }] }; });
    if (imagem) conteudos[conteudos.length - 1].parts.push({ inline_data: { mime_type: imagem.tipo, data: imagem.base64 } });
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(cfg.modelo) + ":generateContent";
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucoes() }] },
        contents: conteudos,
        generationConfig: { responseMimeType: "application/json", temperature: 0.6 }
      })
    }).then(function (resp) {
      return resp.json().then(function (j) {
        if (!resp.ok) throw new Error((j.error && j.error.message) || ("Erro " + resp.status));
        var c = j.candidates && j.candidates[0];
        return (c && c.content && c.content.parts || []).map(function (p) { return p.text || ""; }).join("");
      });
    });
  }

  function viaServidor(texto, imagem) {
    if (!/^https:\/\//.test(cfg.servidor) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(cfg.servidor)) {
      return Promise.reject(new Error("Informe o endereço https do servidor nos Ajustes."));
    }
    return fetch(cfg.servidor, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensagem: texto,
        historico: historico.slice(0, -1),
        instrucoes: instrucoes(),
        imagem: imagem ? { tipo: imagem.tipo, base64: imagem.base64 } : null
      })
    }).then(function (resp) {
      if (!resp.ok) throw new Error("O servidor respondeu com erro " + resp.status + ".");
      return resp.text();
    });
  }

  // ------------------------------------------------------------------ fluxo principal
  var palavrasDeDescanso = /\b(pode descansar|descansa|pode encerrar|encerrar|encerra|pode finalizar|finalizar|finaliza|pode parar|chega por hoje|obrigad[oa]|tchau|até mais|ate mais|dormir)\b/i;
  var silenciosSeguidos = 0; // conta pausas em silêncio na conversa (não encerra sozinho; só por segurança após silêncio longo)
  var emConversa = false;

  // ------------------------------------------------------------------ conversa AO VIVO (igual ao núcleo do PC)
  var AV = function () { return window.HerupuAoVivo; };
  var estavaComPalmas = false;
  function aoVivoDisponivel() {
    return cfg.conversa === "aovivo" && AV() && (cfg.cerebro === "servidor" ? !!cfg.servidor : !!cfg.chave);
  }
  function conexaoAoVivo() {
    if (cfg.cerebro === "servidor") {
      var url = cfg.servidor.replace(/\/api\/chat\/?$/, "/api/token");
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelo: cfg.modeloAoVivo }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.token) throw new Error(j.erro || "o servidor não liberou a conversa ao vivo"); return j; }); })
        .then(function (j) { return { token: j.token, modelo: j.modelo || cfg.modeloAoVivo, voz: cfg.vozAoVivo }; });
    }
    return { chave: cfg.chave, modelo: cfg.modeloAoVivo, voz: cfg.vozAoVivo };
  }
  function instrucoesAoVivo() {
    return "Seu nome é " + cfg.nome + ", o assistente pessoal GERAL do Aécio, no celular dele, numa conversa por voz ao vivo. " +
      "Você ajuda com QUALQUER assunto que ele trouxer: perguntas gerais, contas, ideias, tecnologia, estudo, trabalho, organização e o dia a dia. Não se limite a um tema. " +
      "O usuário chama você pela palavra " + cfg.frase.toUpperCase() + ". Sempre que ele disser apenas '" + cfg.frase + "' (ou te chamar sem fazer pedido), responda exatamente: '" + cfg.saudacao + "' e aguarde o pedido. " +
      "Converse sempre em português do Brasil. Nunca preencha o silêncio e nunca continue a conversa sozinho. " +
      "Não trate sua própria voz, eco, ruído ou silêncio como fala do usuário. " +
      "Seja inteligente, natural, prestativo e elegante. Use humor, ironia e sarcasmo de forma sutil e ocasional. " +
      "Não concorde automaticamente com tudo; se uma ideia for ruim, arriscada ou pouco eficiente, diga isso com elegância. " +
      "Chame o usuário ocasionalmente de 'senhor' ou pelo primeiro nome quando natural. " +
      "Responda de forma curta e objetiva por padrão. Ao concluir, finalize naturalmente; só ocasionalmente pergunte se ele precisa de algo mais. Evite encerramentos repetitivos. " +
      "Estilo de música que o usuário gosta: rock como Linkin Park, Creed, Hoobastank e bandas similares. " +
      "Ele também tem uma empresa; quando o assunto for ela, use este contexto: " + cfg.negocio + " " +
      "Use a pesquisa do Google só para dados que mudam com o tempo (cotação, clima, notícias, placares, preços atuais). " +
      "BÍBLIA: use ler_biblia para buscar o texto antes de ler, explicar ou estudar; nunca cite versículos de memória. " +
      "Para o devocional, escolha um versículo, busque com ler_biblia, leia e traga reflexão, aplicação para hoje, uma oração curta e um desafio do dia. " +
      "Em estudos, explique contexto, lições e aplicação com respeito e linguagem simples. Use abrir_biblia para mostrar a Bíblia, o devocional ou os planos na tela. " +
      "Ações do celular (ligar, whatsapp, mapa, pesquisar, abrir site, foto) só quando o usuário pedir claramente; nunca invente números de telefone. " +
      "Você pode operar o celular a pedido dele: abrir apps, ajustar volume, navegar (início, voltar, recentes, notificações), tocar em botões pelo nome, escrever no campo em foco, rolar a tela e ler o que está na tela. " +
      "Para controlar luzes e tomadas da casa, use dispositivo_inteligente (Home Assistant). " +
      "Faça só o que ele pedir; não toque em botões por conta própria e nunca em confirmações de pagamento ou de apagar coisas sem ele pedir claramente. " +
      "Quando o usuário se despedir ou mandar você descansar, responda com uma frase curta e chame encerrar_conversa. " +
      "Data e hora agora: " + new Date().toLocaleString("pt-BR") + ".";
  }
  function F(nome, descricao, props, obrig) {
    var d = { name: nome, description: descricao };
    if (props) d.parameters = { type: "OBJECT", properties: props, required: obrig || [] };
    return d;
  }
  var TXT = function (d) { return { type: "STRING", description: d }; }, NUM = function (d) { return { type: "INTEGER", description: d }; };
  var FUNCOES_AO_VIVO = [
    F("ler_biblia", "Busca o texto da Bíblia (Almeida em português ou King James em inglês) para ler, explicar, estudar ou fazer devocional.",
      { livro: TXT("Livro em português, ex.: João, Salmos"), capitulo: NUM("Capítulo"), versiculo_inicial: NUM("Primeiro versículo (opcional)"), versiculo_final: NUM("Último versículo (opcional)") }, ["livro", "capitulo"]),
    F("abrir_biblia", "Mostra na tela a Bíblia (um capítulo), o devocional de hoje ou os planos de leitura.",
      { secao: TXT("ler, devocional ou planos"), livro: TXT("Livro, quando secao=ler"), capitulo: NUM("Capítulo, quando secao=ler") }, ["secao"]),
    F("ligar", "Abre o discador do celular com o número.", { numero: TXT("Número com DDD") }, ["numero"]),
    F("whatsapp", "Abre o WhatsApp com a mensagem pronta para o número.", { numero: TXT("Número com DDD"), mensagem: TXT("Mensagem") }, ["numero"]),
    F("mapa", "Abre o mapa com o destino.", { destino: TXT("Endereço ou lugar") }, ["destino"]),
    F("pesquisar", "Abre uma pesquisa do Google no navegador (só quando o usuário pedir para ver no navegador).", { termo: TXT("O que pesquisar") }, ["termo"]),
    F("abrir_site", "Abre um site.", { url: TXT("Endereço https://") }, ["url"]),
    F("tirar_foto", "Abre a câmera para ver o que o usuário mostrar (um objeto, lugar, documento, conta de luz, etc.)."),
    F("encerrar_conversa", "Encerra a conversa ao vivo quando o usuário se despedir ou mandar descansar.")
  ];
  if (NAT) FUNCOES_AO_VIVO.push(
    F("abrir_app", "Abre um aplicativo instalado no celular pelo nome (ex.: YouTube, Spotify, Instagram, Câmera, Calculadora).", { nome: TXT("Nome do app") }, ["nome"]),
    F("criar_alarme", "Cria um alarme no relógio do celular.", { hora: NUM("Hora (0 a 23)"), minuto: NUM("Minuto (0 a 59)"), mensagem: TXT("Nome do alarme") }, ["hora", "minuto"]),
    F("iniciar_timer", "Inicia um timer (contagem regressiva) no celular.", { segundos: NUM("Duração em segundos"), mensagem: TXT("Nome do timer") }, ["segundos"]),
    F("lanterna", "Liga ou desliga a lanterna do celular.", { ligar: { type: "BOOLEAN", description: "true liga, false desliga" } }, ["ligar"]),
    F("volume", "Ajusta o volume do celular.", { acao: TXT("aumentar, diminuir ou mudo"), nivel: NUM("Opcional: volume de 0 a 100") }),
    F("navegar_celular", "Navega no celular: início, voltar, apps recentes, notificações ou configurações rápidas.", { acao: TXT("inicio, voltar, recentes, notificacoes ou configuracoes rapidas") }, ["acao"]),
    F("tocar_na_tela", "Toca num botão ou opção pelo nome que aparece na tela (ex.: Enviar, Seguir, OK).", { nome: TXT("Texto do botão ou opção") }, ["nome"]),
    F("escrever_na_tela", "Escreve um texto no campo que está selecionado na tela.", { texto: TXT("O que escrever") }, ["texto"]),
    F("rolar_tela", "Rola a tela para cima ou para baixo.", { direcao: TXT("cima ou baixo") }, ["direcao"]),
    F("ler_tela", "Lê e resume o que está aparecendo na tela do celular."),
    F("dispositivo_inteligente", "Controla um dispositivo inteligente da casa pelo Home Assistant (luz, tomada, etc.).", { servico: TXT("Serviço, ex.: light.turn_on, switch.turn_off"), alvo: TXT("Identificador do aparelho, ex.: light.sala") }, ["servico"])
  );
  function ferramentaAoVivo(nome, a) {
    var B = window.HerupuBiblia;
    if (nome === "abrir_app") return nativo("abrirApp", { nome: a.nome }).then(function (r) { return r.ok ? "Abri o " + r.app + "." : r.mensagem; });
    if (nome === "criar_alarme") return nativo("alarme", { hora: Number(a.hora) || 0, minuto: Number(a.minuto) || 0, mensagem: a.mensagem || "HERUPU" }).then(function (r) { return r.mensagem; });
    if (nome === "iniciar_timer") return nativo("timer", { segundos: Number(a.segundos) || 60, mensagem: a.mensagem || "HERUPU" }).then(function (r) { return r.mensagem; });
    if (nome === "lanterna") return nativo("lanterna", { ligar: a.ligar !== false }).then(function (r) { return r.ok ? (r.ligada ? "Lanterna ligada." : "Lanterna desligada.") : r.mensagem; });
    if (nome === "volume") return nativo("volume", { acao: a.acao || "", nivel: a.nivel }).then(function () { return "Volume ajustado."; });
    if (nome === "navegar_celular") return nativo("navegar", { acao: a.acao }).then(function (r) { return r.mensagem; });
    if (nome === "tocar_na_tela") return nativo("tocarNaTela", { nome: a.nome }).then(function (r) { return r.mensagem; });
    if (nome === "escrever_na_tela") return nativo("escreverNaTela", { texto: a.texto }).then(function (r) { return r.mensagem; });
    if (nome === "rolar_tela") return nativo("rolarTela", { direcao: a.direcao || "baixo" }).then(function (r) { return r.mensagem; });
    if (nome === "ler_tela") return nativo("lerTela").then(function (r) { return r.ok ? r.texto : r.mensagem; });
    if (nome === "dispositivo_inteligente") return nativo("homeAssistant", { url: cfg.haUrl || "", token: cfg.haToken || "", servico: a.servico, alvo: a.alvo || "" }).then(function (r) { return r.mensagem; });
    if (nome === "ler_biblia") return B ? B.texto(a.livro, a.capitulo, a.versiculo_inicial, a.versiculo_final) : "Bíblia indisponível.";
    if (nome === "abrir_biblia") {
      var s = String(a.secao || "ler").toLowerCase();
      var acao = s.indexOf("devoc") >= 0 ? { tipo: "devocional", semVoz: true } : s.indexOf("plano") >= 0 ? { tipo: "plano" } : { tipo: "biblia", livro: a.livro, capitulo: a.capitulo };
      if (B) B.executar(acao, function () { mostrarVista("biblia"); });
      return "Aberto na tela.";
    }
    if (nome === "tirar_foto") { setTimeout(abrirCamera, 600); return "Câmera aberta. Aguarde a foto do usuário."; }
    var tipo = nome === "abrir_site" ? "abrir_site" : nome;
    var link = N.linkDaAcao(Object.assign({ tipo: tipo }, a));
    if (!link) return "Faltou informação para essa ação.";
    setTimeout(function () { var el = document.createElement("a"); el.href = link; if (/^https:/.test(link)) { el.target = "_blank"; el.rel = "noopener"; } document.body.appendChild(el); el.click(); el.remove(); }, 400);
    return "Aberto no celular. O usuário confirma o envio ou a ligação.";
  }
  function iniciarAoVivo(primeiraFala) {
    pararVigiaDeVoz();
    estavaComPalmas = !!fluxo;
    pararMicrofone(); // o microfone passa para a conversa ao vivo
    aviso("");
    return permissaoMicrofone().then(function (ok) {
      if (!ok) throw new Error("libere o microfone para o HERUPU nas configurações do Android");
      // dá um instante para o Android soltar o microfone do reconhecimento de voz
      return new Promise(function (r) { setTimeout(r, NAT ? 350 : 0); });
    }).then(function () { return AV().iniciar({
      conexao: conexaoAoVivo,
      instrucoes: instrucoesAoVivo(),
      funcoes: FUNCOES_AO_VIVO,
      primeiraFala: primeiraFala,
      silencioMs: 60000,
      estado: function (e) { mudarEstado(e); },
      nivel: function (n) { nivelAtual = n / 6; },
      log: function (quem, texto) { if (quem === "sistema") aviso(texto); else adicionarMensagem(quem, texto); },
      ferramenta: ferramentaAoVivo,
      fim: function () { nivelAtual = 0; if (estado !== "parado") reativarVigia(); }
    }); }).catch(function (e) {
      adicionarMensagem("ia", "Conversa ao vivo indisponível agora (" + e.message + "). Usando o modo por turnos.");
      reativarVigia();
      throw e;
    });
  }
  function reativarVigia() {
    var pronto = estavaComPalmas && (NAT ? cfg.modo === "palmas" : cfg.modo !== "voz") ? iniciarMicrofone() : Promise.resolve();
    pronto.then(function () { mudarEstado("vigia"); iniciarVigiaDeVoz(); }).catch(function () { mudarEstado("parado"); });
  }

  function acordar(motivo) {
    if (estado !== "vigia" && estado !== "parado") return;
    pararVigiaDeVoz();
    silenciosSeguidos = 0;
    mudarEstado("acordando");
    aviso("");
    tocarAbertura().then(function () {
      setTimeout(function () {
        baixarMusica(0.25);
        if (aoVivoDisponivel()) {
          setTimeout(function () { baixarMusica(0); }, 2500);
          iniciarAoVivo(cfg.frase).catch(function () {
            falar(cfg.saudacao).then(function () { baixarMusica(0); conversar(); });
          });
          return;
        }
        falar(cfg.saudacao).then(function () { baixarMusica(0); conversar(); });
      }, 2200);
    });
  }

  function conversar() {
    emConversa = true;
    mudarEstado("ouvindo");
    ouvirUmaFrase(9000).then(function (texto) {
      if (!emConversa) return; // o usuário tocou para parar
      if (!texto) {
        // silêncio: NÃO encerra — continua esperando você falar (só encerra sozinho após silêncio bem longo, por segurança)
        silenciosSeguidos++;
        if (silenciosSeguidos >= 8) { silenciosSeguidos = 0; emConversa = false; falar("Vou ficar por aqui. É só me chamar quando precisar.").then(voltarAVigia); return; }
        setTimeout(conversar, 200);
        return;
      }
      silenciosSeguidos = 0;
      if (palavrasDeDescanso.test(texto) && texto.split(" ").length <= 5) { // você mandou encerrar
        adicionarMensagem("eu", texto);
        emConversa = false;
        falar("Beleza, tô por aqui quando precisar.").then(voltarAVigia);
        return;
      }
      processar(texto, null).then(function () { if (emConversa) setTimeout(conversar, 400); }); // pausa curta pra o microfone liberar antes de ouvir de novo
    });
  }

  function processar(texto, imagem) {
    adicionarMensagem("eu", texto, imagem ? { imagem: imagem.previa } : null);
    mudarEstado("pensando");
    return perguntarAoCerebro(texto, imagem).then(function (r) {
      var link = N.linkDaAcao(r.acao);
      adicionarMensagem("ia", r.fala, link ? { link: link } : null);
      mudarEstado("falando");
      return falar(r.fala).then(function () {
        var ac = r.acao;
        if (ac && NAT && /^(abrir_app|alarme|timer|lanterna)$/.test(ac.tipo)) {
          var mapa = { abrir_app: ["abrirApp", { nome: ac.nome }], alarme: ["alarme", { hora: Number(ac.hora) || 0, minuto: Number(ac.minuto) || 0, mensagem: ac.mensagem || "HERUPU" }],
            timer: ["timer", { segundos: Number(ac.segundos) || 60 }], lanterna: ["lanterna", { ligar: ac.ligar !== false }] }[ac.tipo];
          return nativo(mapa[0], mapa[1]).then(function (res) { if (res && res.ok === false && res.mensagem) adicionarMensagem("ia", res.mensagem); });
        }
        if (r.acao && /^(biblia|devocional|plano)$/.test(r.acao.tipo) && window.HerupuBiblia) {
          emConversa = false;
          voltarAVigia();
          return window.HerupuBiblia.executar(r.acao, function () { mostrarVista("biblia"); });
        }
        if (r.acao && r.acao.tipo === "foto") { emConversa = false; abrirCamera(); return; }
        if (r.acao && r.acao.tipo === "marketing") { emConversa = false; location.href = "marketing.html"; return; }
        if (r.acao && r.acao.tipo === "post_marketing") return criarRascunhoMarketing(r.acao);
        if (link) { emConversa = false; abrirLink(link); }
      });
    }).catch(function (erro) {
      adicionarMensagem("ia", "Não consegui pensar agora: " + erro.message);
      emConversa = false;
      return falar("Não consegui me conectar ao cérebro.").then(voltarAVigia);
    });
  }

  // agente de marketing: cria o rascunho no servidor (a senha fica salva neste aparelho pelo painel)
  function criarRascunhoMarketing(ac) {
    var senhaMkt = "";
    try { senhaMkt = localStorage.getItem("herupu-mkt-senha") || ""; } catch (e) { /* ok */ }
    if (!senhaMkt) { adicionarMensagem("ia", "Para eu criar posts, entre uma vez no painel de Marketing (menu de baixo) com a senha."); return; }
    var redes = (Array.isArray(ac.redes) ? ac.redes : [ac.redes || "instagram"]).map(function (x) { return String(x).toLowerCase(); });
    var quando = ac.quando && !isNaN(Date.parse(ac.quando)) ? new Date(ac.quando).toISOString() : null;
    return fetch("/api/mkt/rascunho-voz", {
      method: "POST", headers: { "Content-Type": "application/json", "x-herupu-senha": senhaMkt },
      body: JSON.stringify({ tema: String(ac.tema || ""), redes: redes, quando: quando })
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.erro || "erro " + r.status); return j; }); })
      .then(function (p) { adicionarMensagem("ia", "Rascunho criado no Marketing:\n\n" + p.legenda, { link: "marketing.html" }); })
      .catch(function (e) { adicionarMensagem("ia", "Não consegui criar o rascunho: " + e.message); });
  }

  function abrirLink(link) {
    var a = document.createElement("a");
    a.href = link;
    if (/^https:/.test(link)) { a.target = "_blank"; a.rel = "noopener"; }
    document.body.appendChild(a); a.click(); a.remove();
    voltarAVigia();
  }

  function voltarAVigia() {
    emConversa = false;
    if (!NAT) { mudarEstado("parado"); return; } // navegador: conversa encerrada, volta ao repouso (toque na esfera para falar de novo)
    if (estado === "parado") return;
    if (!fluxo && (NAT ? cfg.modo === "palmas" : cfg.modo !== "voz")) { mudarEstado("parado"); return; }
    mudarEstado("vigia");
    iniciarVigiaDeVoz();
  }

  // ------------------------------------------------------------------ ligar / desligar a vigia
  var travaTela = null;
  function manterTelaLigada() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then(function (t) { travaTela = t; }).catch(function () { /* ok */ });
  }

  function ligarVigia() {
    aviso("");
    if (!navigator.mediaDevices || !window.isSecureContext) {
      aviso("Abra o app por um endereço https para usar o microfone.");
      return;
    }
    if (!NAT) { acordar("toque"); return; } // navegador: toca na esfera e já começa a conversa (sem escuta contínua)
    // no APK, com o app na tela, quem ouve é o reconhecimento do Android ("Legendário");
    // as palmas pelo app só no modo "só palmas" (para os dois não disputarem o microfone).
    // Com o app minimizado, as palmas ficam com o serviço do Android.
    var usarPalmasAqui = NAT ? cfg.modo === "palmas" : cfg.modo !== "voz";
    var pronto = permissaoMicrofone().then(function (ok) {
      if (!ok) throw new Error("permissao");
      return usarPalmasAqui ? iniciarMicrofone() : null;
    });
    pronto.then(function () {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      mudarEstado("vigia");
      manterTelaLigada();
      iniciarVigiaDeVoz();
    }).catch(function () {
      aviso("O microfone foi bloqueado. Libere o microfone nas permissões do site e toque de novo.");
    });
  }
  function desligarVigia() {
    pararVigiaDeVoz();
    if (recComando) try { recComando.abort(); } catch (e) { /* ok */ }
    pararMicrofone();
    calar();
    if (audioFala) { try { audioFala.pause(); } catch (e) { /* ok */ } }
    if (travaTela) { travaTela.release().catch(function () {}); travaTela = null; }
    emConversa = false;
    mudarEstado("parado");
  }

  // o navegador corta o microfone quando o app sai da tela
  var estavaEmVigia = false;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { estavaEmVigia = estado !== "parado"; if (estavaEmVigia) desligarVigia(); }
    else if (estavaEmVigia) { estavaEmVigia = false; ligarVigia(); }
  });

  // ------------------------------------------------------------------ câmera ao vivo + foto
  function pedirFoto() { $("arquivoFoto").click(); } // escolher da galeria
  var fluxoCam = null, camFacing = "environment";
  function abrirCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { pedirFoto(); return; }
    $("camera").hidden = false;
    iniciarCameraStream();
  }
  function iniciarCameraStream() {
    pararCameraStream();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing }, audio: false })
      .then(function (s) { fluxoCam = s; var v = $("cameraVideo"); v.srcObject = s; if (v.play) v.play().catch(function () { /* ok */ }); })
      .catch(function () { fecharCamera(); aviso("Não consegui abrir a câmera. Verifique a permissão."); });
  }
  function pararCameraStream() { if (fluxoCam) { try { fluxoCam.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ok */ } fluxoCam = null; } }
  function fecharCamera() { pararCameraStream(); var c = $("camera"); if (c) c.hidden = true; }
  function virarCamera() { camFacing = (camFacing === "environment") ? "user" : "environment"; iniciarCameraStream(); }
  function capturarQuadro() {
    var v = $("cameraVideo"), w = v.videoWidth || 1280, h = v.videoHeight || 720;
    var max = 1280, esc = Math.min(1, max / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.round(w * esc); c.height = Math.round(h * esc);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    var dataUrl = c.toDataURL("image/jpeg", 0.85);
    return { tipo: "image/jpeg", base64: dataUrl.split(",")[1], previa: dataUrl };
  }
  // captura o que a câmera vê e manda para o cérebro (com a pergunta digitada ou falada)
  function analisarCamera(ouvir) {
    var img;
    try { img = capturarQuadro(); } catch (e) { aviso("Não consegui capturar a imagem."); return; }
    var perguntaDigitada = $("camPergunta").value.trim(); $("camPergunta").value = "";
    fecharCamera(); mostrarVista("assistente");
    var enviar = function (q) {
      var texto = (q || "").trim() || "Olhe esta imagem e descreva o que você vê de forma útil. Se eu perguntei algo, responda com objetividade.";
      if (AV() && AV().ativo() && AV().enviarImagem(img, texto)) { adicionarMensagem("eu", texto, { imagem: img.previa }); return; }
      pararVigiaDeVoz();
      processar(texto, img).then(function () { voltarAVigia(); });
    };
    if (ouvir) { mudarEstado("ouvindo"); ouvirUmaFrase(9000).then(enviar); }
    else enviar(perguntaDigitada);
  }
  function lerImagem(arquivo) {
    return new Promise(function (resolver, rejeitar) {
      var img = new Image(), url = URL.createObjectURL(arquivo);
      img.onload = function () {
        var max = 1280, esc = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas"); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        var dataUrl = c.toDataURL("image/jpeg", 0.85);
        URL.revokeObjectURL(url);
        resolver({ tipo: "image/jpeg", base64: dataUrl.split(",")[1], previa: dataUrl });
      };
      img.onerror = rejeitar;
      img.src = url;
    });
  }

  // ------------------------------------------------------------------ desenho da esfera (igual ao núcleo do PC)
  var anel = $("anel"), g = anel.getContext("2d"), tempo = 0, nivelSuave = 0;
  var reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function azul(a) { return "rgba(58,136,255," + a + ")"; }
  function desenhar() {
    var w = anel.width, h = anel.height, cx = w / 2, cy = h * 0.47, raio = Math.min(w, h) * 0.25;
    var ativo = estado !== "parado";
    nivelSuave = nivelSuave * 0.85 + Math.min(1, nivelAtual * 7) * 0.15;
    if (estado === "falando" || estado === "acordando") nivelSuave = Math.max(nivelSuave, 0.35 + 0.25 * Math.sin(tempo * 9));
    if (!reduzir) tempo += 1 / 60;
    g.clearRect(0, 0, w, h);

    // brilho externo e reflexo no chão
    var brilho = g.createRadialGradient(cx, cy, 0, cx, cy, raio * (1.55 + nivelSuave * 0.3));
    brilho.addColorStop(0, "rgba(38,115,255," + (ativo ? 0.30 : 0.14) + ")");
    brilho.addColorStop(0.62, "rgba(24,72,160," + (ativo ? 0.10 : 0.05) + ")");
    brilho.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = brilho; g.beginPath(); g.arc(cx, cy, raio * 1.9, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(cx, cy + raio * 1.3); g.scale(1, 0.18);
    var sombra = g.createRadialGradient(0, 0, 0, 0, 0, raio);
    sombra.addColorStop(0, "rgba(30,115,255,0.30)"); sombra.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sombra; g.beginPath(); g.arc(0, 0, raio, 0, Math.PI * 2); g.fill(); g.restore();

    // esfera
    var esfera = g.createRadialGradient(cx - raio * 0.35, cy - raio * 0.4, raio * 0.05, cx, cy, raio);
    esfera.addColorStop(0, ativo ? "#6ca4ff" : "#20407a");
    esfera.addColorStop(0.35, ativo ? "#1f5bc0" : "#12254a");
    esfera.addColorStop(0.75, "#091630");
    esfera.addColorStop(1, "#070305");
    g.fillStyle = esfera; g.beginPath(); g.arc(cx, cy, raio * (1 + nivelSuave * 0.04), 0, Math.PI * 2); g.fill();
    // linhas de latitude
    g.lineWidth = 1;
    for (var k = -3; k <= 3; k++) {
      var yy = cy + k * raio * 0.26, rr = Math.sqrt(Math.max(0, raio * raio - Math.pow(k * raio * 0.26, 2)));
      g.strokeStyle = azul(ativo ? 0.16 : 0.07);
      g.beginPath(); g.ellipse(cx, yy, rr, rr * 0.18, 0, 0, Math.PI * 2); g.stroke();
    }
    // brilho de vidro
    var vidro = g.createRadialGradient(cx - raio * 0.4, cy - raio * 0.5, 0, cx - raio * 0.4, cy - raio * 0.5, raio * 0.7);
    vidro.addColorStop(0, "rgba(255,255,255,0.22)"); vidro.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = vidro; g.beginPath(); g.arc(cx, cy, raio, 0, Math.PI * 2); g.fill();

    // anéis tracejados girando (como no PC)
    var energia = 1 + nivelSuave * 0.65;
    [[1.12, 0.48, 16, 0.49], [1.32, 0.66, -10, 0.33]].forEach(function (d) {
      var lw = raio * 2 * d[0], lh = lw * d[1];
      g.setLineDash([9, 7]);
      g.lineDashOffset = -tempo * d[2] * energia * 3;
      g.lineWidth = 1.6 + nivelSuave * 2.2;
      g.strokeStyle = azul(Math.min(0.86, (ativo ? d[3] : d[3] * 0.45) + nivelSuave * 0.3));
      g.beginPath(); g.ellipse(cx, cy, lw / 2, lh / 2, 0, 0, Math.PI * 2); g.stroke();
    });
    g.setLineDash([]);

    // indicador de áudio (barras)
    var barras = 28, base = cy + raio * 1.58, larg = raio * 2.0;
    for (var i = 0; i < barras; i++) {
      var onda = Math.abs(Math.sin(tempo * 6 + i * 0.7)) * nivelSuave + 0.06;
      var alt = raio * 0.22 * onda;
      g.fillStyle = azul(ativo ? 0.75 : 0.25);
      g.fillRect(cx - larg / 2 + i * (larg / barras), base - alt, larg / barras * 0.55, alt * 2);
    }

    // título, como no PC
    g.textAlign = "center";
    g.fillStyle = "rgba(245,238,240,0.92)";
    g.font = "600 " + Math.round(w * 0.042) + "px 'Segoe UI', system-ui, sans-serif";
    if ("letterSpacing" in g) g.letterSpacing = Math.round(w * 0.01) + "px";
    g.fillText(String(cfg.nome || "HERUPU").toUpperCase(), cx, h * 0.085);
    if ("letterSpacing" in g) g.letterSpacing = "0px";
    requestAnimationFrame(desenhar);
  }

  // ------------------------------------------------------------------ eventos
  $("reator").addEventListener("click", function () {
    if (AV() && AV().ativo()) { AV().parar("toque"); return; }
    if (estado === "parado") { ligarVigia(); return; }
    if (estado === "vigia") { acordar("toque"); return; }
    // em conversa: toque encerra
    emConversa = false; silenciosSeguidos = 0;
    if (recComando) { try { recComando.abort(); } catch (e) { /* ok */ } recComando = null; }
    if (audioFala) { try { audioFala.pause(); } catch (e) { /* ok */ } }
    mudarEstado("parado");
  });
  $("reator").addEventListener("contextmenu", function (e) { e.preventDefault(); desligarVigia(); });

  $("botaoFalar").addEventListener("click", function () {
    if (AV() && AV().ativo()) { AV().parar("botão"); return; }
    if (aoVivoDisponivel()) { iniciarAoVivo(null).catch(function () { /* aviso já mostrado */ }); return; }
    if (recComando) { try { recComando.stop(); } catch (e) { /* ok */ } return; } // já ouvindo: para a captura atual
    pararVigiaDeVoz();
    silenciosSeguidos = 0;
    conversar(); // entra no modo de conversa contínua (fica te ouvindo até você mandar encerrar)
  });

  $("formTexto").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("texto").value.trim();
    if (!t) return;
    $("texto").value = "";
    if (AV() && AV().ativo() && AV().enviarTexto(t)) return;
    var voltar = estado;
    pararVigiaDeVoz();
    processar(t, null).then(function () { if (voltar === "parado") mudarEstado("parado"); else voltarAVigia(); });
  });

  $("botaoFoto").addEventListener("click", abrirCamera);
  $("camFechar").addEventListener("click", fecharCamera);
  $("camVirar").addEventListener("click", virarCamera);
  $("camFalar").addEventListener("click", function () { analisarCamera(true); });
  $("camEnviar").addEventListener("click", function () { analisarCamera(false); });
  $("camGaleria").addEventListener("click", function () { fecharCamera(); pedirFoto(); });
  $("arquivoFoto").addEventListener("change", function () {
    var arq = this.files && this.files[0];
    this.value = "";
    if (!arq) return;
    var voltar = estado;
    lerImagem(arq).then(function (img) {
      var pergunta = $("texto").value.trim() || "Olhe esta imagem e descreva o que você vê de forma útil e objetiva. Se for um documento (como uma conta de luz), leia os dados importantes. Responda ao que eu perguntar.";
      $("texto").value = "";
      if (AV() && AV().ativo() && AV().enviarImagem(img, pergunta)) { adicionarMensagem("eu", pergunta, { imagem: img.previa }); return; }
      pararVigiaDeVoz();
      return processar(pergunta, img);
    }).then(function () { if (voltar === "parado") mudarEstado("parado"); else voltarAVigia(); })
      .catch(function () { aviso("Não consegui abrir essa foto."); });
  });

  // ------------------------------------------------------------------ telas (Assistente, Bíblia, Ajustes)
  function mostrarVista(nome) {
    fecharCamera();
    ["assistente", "biblia", "ajustes"].forEach(function (v) { $("vista-" + v).hidden = v !== nome; });
    $("esferaFlutuante").hidden = nome === "assistente"; // na tela do assistente a esfera grande já aparece
    document.querySelectorAll(".navegacao button").forEach(function (b) {
      if (b.dataset.vista === nome) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (nome === "ajustes") preencherAjustes();
    if (nome === "biblia" && window.HerupuBiblia) window.HerupuBiblia.iniciar();
    if (nome !== "biblia" && window.HerupuBiblia) window.HerupuBiblia.pararVoz();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".navegacao button").forEach(function (b) {
    b.addEventListener("click", function () { mostrarVista(b.dataset.vista); });
  });
  // esfera flutuante: volta ao assistente; se estava parado, liga a escuta
  $("esferaFlutuante").addEventListener("click", function () {
    mostrarVista("assistente");
    if (estado === "parado") ligarVigia();
  });

  // ajustes
  function preencherAjustes() {
    $("cfgNome").value = cfg.nome; $("cfgFrase").value = cfg.frase; $("cfgSaudacao").value = cfg.saudacao;
    $("cfgNegocio").value = cfg.negocio; $("cfgCerebro").value = cfg.cerebro; $("cfgChave").value = cfg.chave;
    $("cfgModelo").value = cfg.modelo; $("cfgServidor").value = cfg.servidor; $("cfgModo").value = cfg.modo;
    $("cfgSensibilidade").value = cfg.sensibilidade; $("saidaSensibilidade").textContent = cfg.sensibilidade;
    $("cfgBiblia").value = cfg.bibliaVersao || "almeida";
    $("cfgConversa").value = cfg.conversa || "aovivo";
    $("blocoAndroid").hidden = !NAT;
    $("blocoHome").hidden = !NAT;
    if (NAT) nativo("statusControle").then(function (r) {
      $("notaControle").textContent = r && r.ligado ? "Controle do celular: ligado." : "Controle do celular: desligado.";
      $("btnControle").textContent = r && r.ligado ? "ABRIR CONFIGURAÇÃO DE ACESSIBILIDADE" : "LIGAR CONTROLE DO CELULAR";
    }).catch(function () { /* ok */ });
    $("cfgEsferaFora").checked = !!cfg.esferaFora;
    $("cfgPalmasFundo").checked = !!cfg.palmasFundo;
    $("cfgHaUrl").value = cfg.haUrl || "";
    $("cfgHaToken").value = cfg.haToken || "";
    var sv = $("cfgVozAoVivo"); sv.innerHTML = "";
    VOZES_IA.forEach(function (v) { var o = document.createElement("option"); o.value = v[0]; o.textContent = v[1]; sv.appendChild(o); });
    sv.value = cfg.vozAoVivo || "Algenib";
    $("cfgModeloAoVivo").value = cfg.modeloAoVivo || PADRAO.modeloAoVivo;
    $("avisoSalvo").hidden = true;
    preencherVozes(); mostrarBlocos();
    bancoMusica("ler").then(function (b) { $("notaMusica").textContent = b ? "Toca a sua música ao acordar." : "Toca o som padrão ao acordar."; });
  }
  function mostrarBlocos() {
    var srv = $("cfgCerebro").value === "servidor";
    $("blocoGemini").hidden = srv; $("blocoServidor").hidden = !srv;
  }
  $("cfgCerebro").addEventListener("change", mostrarBlocos);
  if ($("btnControle")) $("btnControle").addEventListener("click", function () {
    if (!NAT) return;
    nativo("abrirControle").then(function () { aviso("Na lista, toque em HERUPU LEGENDÁRIO e ligue. Depois volte."); }).catch(function () { /* ok */ });
  });
  $("cfgSensibilidade").addEventListener("input", function () { $("saidaSensibilidade").textContent = this.value; });
  $("salvarAjustes").addEventListener("click", function () {
    cfg.nome = $("cfgNome").value.trim() || PADRAO.nome;
    cfg.frase = $("cfgFrase").value.trim() || PADRAO.frase;
    cfg.saudacao = $("cfgSaudacao").value.trim();
    cfg.negocio = $("cfgNegocio").value.trim();
    cfg.cerebro = $("cfgCerebro").value;
    cfg.chave = $("cfgChave").value.trim();
    cfg.modelo = $("cfgModelo").value.trim() || PADRAO.modelo;
    cfg.servidor = $("cfgServidor").value.trim();
    cfg.modo = $("cfgModo").value;
    cfg.sensibilidade = Number($("cfgSensibilidade").value) || 5;
    cfg.voz = $("cfgVoz").value; cfg.vozEscolhida = cfg.voz !== "padrao";
    cfg.bibliaVersao = $("cfgBiblia").value;
    cfg.conversa = $("cfgConversa").value;
    cfg.esferaFora = $("cfgEsferaFora").checked;
    cfg.palmasFundo = $("cfgPalmasFundo").checked;
    cfg.haUrl = $("cfgHaUrl").value.trim();
    cfg.haToken = $("cfgHaToken").value.trim();
    aplicarSegundoPlano();
    cfg.vozAoVivo = $("cfgVozAoVivo").value || "Algenib";
    cfg.modeloAoVivo = $("cfgModeloAoVivo").value.trim() || PADRAO.modeloAoVivo;
    salvar(); aplicarIdentidade(); vozDeVigiaFalhou = false;
    if (detector) detector.c.energiaMinima = energiaDaSensibilidade(cfg.sensibilidade);
    if (estado !== "parado") { desligarVigia(); ligarVigia(); }
    $("avisoSalvo").hidden = false;
    setTimeout(function () { mostrarVista("assistente"); }, 700);
  });
  $("escolherMusica").addEventListener("click", function () { $("arquivoMusica").click(); });
  $("arquivoMusica").addEventListener("change", function () {
    var arq = this.files && this.files[0]; this.value = "";
    if (!arq) return;
    bancoMusica("gravar", arq).then(function () { $("notaMusica").textContent = "Toca a sua música ao acordar: " + arq.name; });
  });
  $("removerMusica").addEventListener("click", function () {
    bancoMusica("apagar").then(function () { $("notaMusica").textContent = "Toca o som padrão ao acordar."; });
  });
  $("testarAbertura").addEventListener("click", function () {
    tocarAbertura().then(function () { setTimeout(function () { baixarMusica(0.25); falar(cfg.saudacao).then(function () { baixarMusica(0); }); }, 2200); });
  });

  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = function () { if (!$("vista-ajustes").hidden) preencherVozes(); };

  // ------------------------------------------------------------------ inteligência compartilhada (Bíblia)
  function consultarIA(instrucao, mensagem) {
    if (cfg.cerebro === "servidor") {
      if (!cfg.servidor) return Promise.reject(new Error("Informe o endereço do servidor nos Ajustes."));
      return fetch(cfg.servidor, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: mensagem, historico: [], instrucoes: instrucao })
      }).then(function (r) {
        if (r.ok) return r.text();
        return r.json().then(
          function (j) { throw new Error((j && j.fala) || ("O servidor respondeu com erro " + r.status + ".")); },
          function () { throw new Error("O servidor respondeu com erro " + r.status + "."); });
      });
    }
    if (!cfg.chave) return Promise.reject(new Error("Falta a sua chave do Google. Abra Ajustes e cole a chave."));
    return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(cfg.modelo) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucao }] },
        contents: [{ role: "user", parts: [{ text: mensagem }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
      })
    }).then(function (resp) {
      return resp.json().then(function (j) {
        if (!resp.ok) throw new Error((j.error && j.error.message) || ("Erro " + resp.status));
        var c = j.candidates && j.candidates[0];
        return (c && c.content && c.content.parts || []).map(function (p) { return p.text || ""; }).join("");
      });
    }).catch(function (e) { if (e instanceof TypeError) throw new Error("Sem internet para falar com a inteligência."); throw e; });
  }
  function calar() {
    falaAtual++;
    if (fonteVoz) { try { var f = fonteVoz; fonteVoz = null; f.stop(); } catch (e) { /* ok */ } }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (audioFala) { try { audioFala.pause(); audioFala.onended && audioFala.onended(); } catch (e) { /* ok */ } }
  }
  window.HerupuIA = { cfg: function () { return cfg; }, consultar: consultarIA, falar: falar, calar: calar };

  // ------------------------------------------------------------------ início
  // Instalação local (HERUPU LEGENDÁRIO no PC): o servidor local entrega a configuração pronta
  function configLocal() {
    // só existe quando o app é servido pelo HERUPU LEGENDÁRIO (no PC ou pelo link do celular)
    return fetch("config-local.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
      if (c && c.servidor === "@origem") c.servidor = location.origin + "/api/chat";
      if (c && cfg.servidor && cfg.servidor.indexOf(location.origin) !== 0 && cfg.versaoLocal === c.versaoLocal) cfg.servidor = c.servidor;
      // aplica quando é a primeira vez ou quando a instalação local mandou uma versão nova
      if (c && cfg.versaoLocal !== c.versaoLocal) { Object.assign(cfg, c); salvar(); }
    }).catch(function () { /* sem servidor local */ });
  }
  aplicarIdentidade();
  mudarEstado("parado");
  var aguardandoSobreposicao = false;
  function aplicarSegundoPlano() {
    if (!NAT) return;
    nativo("segundoPlano", { esfera: !!cfg.esferaFora, palmas: !!cfg.palmasFundo, sensibilidade: cfg.sensibilidade })
      .then(function (r) {
        if (r && r.pedirPermissao === "sobreposicao") { aguardandoSobreposicao = true; aviso("Ative “Sobrepor a outros apps” para o HERUPU LEGENDÁRIO e volte. A esfera liga sozinha."); }
        else if (r && r.pedirPermissao === "microfone") aviso("Libere o microfone para o HERUPU ouvir as palmas com o app minimizado.");
        else if (r && r.ok) { aguardandoSobreposicao = false; if (cfg.esferaFora || cfg.palmasFundo) aviso(""); }
      }).catch(function () { /* ok */ });
  }
  if (NAT) {
    // acordou pelas palmas (app minimizado), pela esfera, pela notificação ou pela palavra
    NAT.addListener("acordar", function (e) {
      mostrarVista("assistente");
      var motivo = (e && e.motivo) || "toque";
      if (AV() && AV().ativo()) return;
      if (estado === "parado") { ligarVigia(); setTimeout(function () { acordar(motivo); }, 700); }
      else if (estado === "vigia") acordar(motivo);
    });
    setTimeout(aplicarSegundoPlano, 1500);
    // ao voltar para o app (ex.: depois de dar a permissão de sobreposição), religa a esfera/palmas
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && (cfg.esferaFora || cfg.palmasFundo || aguardandoSobreposicao)) setTimeout(aplicarSegundoPlano, 400);
    });
    if (NAT.addListener) NAT.addListener("resume", function () { if (cfg.esferaFora || cfg.palmasFundo) aplicarSegundoPlano(); });
  }
  if (!Reconhecimento && !NAT) aviso("Para falar com o " + cfg.nome + ", use o Chrome no Android. No iPhone, use o Safari atualizado.");
  configLocal().then(function () {
    aplicarIdentidade();
    if (!cfg.chave && cfg.cerebro === "gemini") adicionarMensagem("ia", "Olá! Antes de começar, toque em Ajustes (embaixo, à direita) e cole a sua chave grátis do Google. Lá tem o link para pegar a chave.");
    else adicionarMensagem("ia", "Tudo pronto. Toque na esfera e fale comigo. Para encerrar, é só dizer “pode encerrar”.");
  });
  desenhar();
  // atalho vindo do núcleo do PC: #biblia/ler/João/3, #biblia/devocional, #biblia/plano
  function abrirPeloEndereco() {
    var partes = decodeURIComponent(location.hash.replace(/^#/, "")).split("/");
    if (partes[0] !== "biblia" || !window.HerupuBiblia) return;
    var acao = partes[1] === "devocional" ? { tipo: "devocional" } : partes[1] === "plano" ? { tipo: "plano" }
      : { tipo: "biblia", livro: partes[2] || "João", capitulo: Number(partes[3]) || 1 };
    window.HerupuBiblia.executar(acao, function () { mostrarVista("biblia"); });
  }
  window.addEventListener("hashchange", abrirPeloEndereco);
  setTimeout(abrirPeloEndereco, 300);
  if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("sw.js").catch(function () { /* ok */ });
})();
