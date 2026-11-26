/*
 * HERUPU LEGENDÁRIO — conversa AO VIVO (o mesmo modo do núcleo do PC).
 *
 * Inteligência: Gemini Live (modelo gemini-3.8-live), voz Algenib.
 * Você fala e ele responde na hora com a própria voz; dá para interromper.
 *
 * Conexão:
 *   - com servidor (PC ou Netlify): o servidor entrega uma senha temporária (token)
 *     e a chave do Google nunca vai para o celular;
 *   - sem servidor: usa a chave do Google salva nos Ajustes.
 */
(function () {
  "use strict";
  var WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.";

  var ws = null, ganchos = null, ativo = false, pronto = false;
  var ctxMic = null, fluxoMic = null, procMic = null, fonteMic = null;
  var ctxSom = null, proximoInicio = 0, fontes = [];
  var textoEle = "", textoVoce = "", ultimoSom = 0, relogioSilencio = null, falando = false;

  function b64DePcm(f32) {
    var bytes = new Uint8Array(f32.length * 2);
    for (var i = 0; i < f32.length; i++) {
      var s = Math.max(-1, Math.min(1, f32[i])), v = s < 0 ? s * 0x8000 : s * 0x7fff;
      v = v | 0; bytes[2 * i] = v & 255; bytes[2 * i + 1] = (v >> 8) & 255;
    }
    var bin = "";
    for (var j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 0x8000));
    return btoa(bin);
  }
  function pcmDeB64(b64) {
    var bin = atob(b64), n = bin.length >> 1, out = new Float32Array(n);
    for (var i = 0; i < n; i++) { var v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; out[i] = v / 32768; }
    return out;
  }

  // ------------------------------------------------------------ som que sai (voz dele)
  function tocar(amostras, taxa) {
    ctxSom = ctxSom || new (window.AudioContext || window.webkitAudioContext)();
    if (ctxSom.state === "suspended") ctxSom.resume();
    var buf = ctxSom.createBuffer(1, amostras.length, taxa);
    buf.getChannelData(0).set(amostras);
    var src = ctxSom.createBufferSource();
    src.buffer = buf; src.connect(ctxSom.destination);
    var agora = ctxSom.currentTime;
    if (proximoInicio < agora + 0.03) proximoInicio = agora + 0.05;
    src.start(proximoInicio);
    proximoInicio += buf.duration;
    fontes.push(src);
    src.onended = function () { fontes = fontes.filter(function (f) { return f !== src; }); if (!fontes.length) marcarFalando(false); };
    var soma = 0; for (var i = 0; i < amostras.length; i += 8) soma += amostras[i] * amostras[i];
    if (ganchos) ganchos.nivel(Math.min(1, Math.sqrt(soma / (amostras.length / 8)) * 3));
    marcarFalando(true);
  }
  function calarSom() {
    fontes.forEach(function (f) { try { f.stop(); } catch (e) { /* ok */ } });
    fontes = []; proximoInicio = 0; marcarFalando(false);
  }
  function marcarFalando(s) {
    if (falando === s) return;
    falando = s;
    if (ganchos && ativo) ganchos.estado(s ? "falando" : "ouvindo");
    ultimoSom = Date.now();
  }

  // ------------------------------------------------------------ microfone (sua voz)
  var silencio = null, trechosEnviados = 0;
  function abrirMicrofone() {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    }).then(function (s) {
      fluxoMic = s;
      // usa o MESMO canal de áudio que já foi liberado no toque (ctxSom);
      // criar um canal novo aqui costuma nascer suspenso no celular e não captar nada.
      ctxMic = ctxSom || new (window.AudioContext || window.webkitAudioContext)();
      ctxSom = ctxMic;
      if (ctxMic.state === "suspended") ctxMic.resume();
      var taxa = ctxMic.sampleRate, passo = taxa / 16000;
      fonteMic = ctxMic.createMediaStreamSource(s);
      procMic = ctxMic.createScriptProcessor(2048, 1, 1);
      trechosEnviados = 0;
      procMic.onaudioprocess = function (e) {
        if (!pronto || !ws || ws.readyState !== 1) return;
        var dados = e.inputBuffer.getChannelData(0), saida = dados;
        if (passo !== 1) { // reduz para 16 kHz
          var n = Math.floor(dados.length / passo); saida = new Float32Array(n);
          for (var i = 0; i < n; i++) {
            var ini = Math.floor(i * passo), fim = Math.min(dados.length, Math.floor((i + 1) * passo)), soma = 0;
            for (var j = ini; j < fim; j++) soma += dados[j];
            saida[i] = fim > ini ? soma / (fim - ini) : dados[ini];
          }
        }
        var somaQ = 0; for (var k = 0; k < saida.length; k += 4) somaQ += saida[k] * saida[k];
        var nivel = Math.sqrt(somaQ / (saida.length / 4));
        if (!falando && ganchos) ganchos.nivel(Math.min(1, nivel * 6));
        if (nivel > 0.02) ultimoSom = Date.now();
        ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: b64DePcm(saida) } } }));
        trechosEnviados++;
      };
      // o ScriptProcessor só dispara se estiver ligado à saída; usamos ganho zero para não dar eco
      silencio = ctxMic.createGain();
      silencio.gain.value = 0;
      fonteMic.connect(procMic);
      procMic.connect(silencio);
      silencio.connect(ctxMic.destination);
    });
  }
  function fecharMicrofone() {
    if (procMic) { procMic.onaudioprocess = null; try { procMic.disconnect(); } catch (e) { /* ok */ } procMic = null; }
    if (silencio) { try { silencio.disconnect(); } catch (e) { /* ok */ } silencio = null; }
    if (fonteMic) { try { fonteMic.disconnect(); } catch (e) { /* ok */ } fonteMic = null; }
    if (fluxoMic) { fluxoMic.getTracks().forEach(function (t) { t.stop(); }); fluxoMic = null; }
    // não fecha ctxMic: é o mesmo canal da voz dele (ctxSom), ainda em uso
    ctxMic = null;
  }

  // ------------------------------------------------------------ mensagens do Gemini
  function aoReceber(ev) {
    var tratar = function (texto) {
      var m; try { m = JSON.parse(texto); } catch (e) { return; }
      if (m.setupComplete) {
        pronto = true;
        ganchos.estado("ouvindo");
        if (ganchos.primeiraFala) enviarTexto(ganchos.primeiraFala, true);
        return;
      }
      if (m.toolCall && m.toolCall.functionCalls) return responderFerramentas(m.toolCall.functionCalls);
      if (m.goAway) { ganchos.log("sistema", "A conversa ao vivo vai reiniciar."); }
      var sc = m.serverContent;
      if (!sc) return;
      if (sc.interrupted) { calarSom(); fecharTexto(); }
      if (sc.inputTranscription && sc.inputTranscription.text) { textoVoce += sc.inputTranscription.text; ultimoSom = Date.now(); }
      if (sc.outputTranscription && sc.outputTranscription.text) {
        if (textoVoce.trim()) { ganchos.log("eu", textoVoce.trim()); textoVoce = ""; }
        textoEle += sc.outputTranscription.text;
      }
      var partes = (sc.modelTurn && sc.modelTurn.parts) || [];
      partes.forEach(function (p) {
        var d = p.inlineData || p.inline_data;
        if (d && d.data) {
          var taxa = Number((/rate=(\d+)/.exec(d.mimeType || d.mime_type || "") || [])[1]) || 24000;
          tocar(pcmDeB64(d.data), taxa);
        }
      });
      if (sc.turnComplete) fecharTexto();
    };
    if (typeof ev.data === "string") tratar(ev.data);
    else if (ev.data && ev.data.text) ev.data.text().then(tratar);
    else if (ev.data instanceof ArrayBuffer) tratar(new TextDecoder().decode(ev.data));
  }
  function fecharTexto() {
    if (textoVoce.trim()) ganchos.log("eu", textoVoce.trim());
    if (textoEle.trim()) ganchos.log("ia", textoEle.trim());
    textoVoce = ""; textoEle = "";
  }

  function responderFerramentas(chamadas) {
    Promise.all(chamadas.map(function (c) {
      if (c.name === "encerrar_conversa") { setTimeout(function () { parar("despedida"); }, 2500); return Promise.resolve({ id: c.id, name: c.name, response: { ok: true } }); }
      return Promise.resolve(ganchos.ferramenta(c.name, c.args || {}))
        .then(function (r) { return { id: c.id, name: c.name, response: { resultado: r } }; })
        .catch(function (e) { return { id: c.id, name: c.name, response: { erro: e.message || String(e) } }; });
    })).then(function (respostas) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ toolResponse: { functionResponses: respostas } }));
    });
  }

  // ------------------------------------------------------------ início e fim
  function iniciar(opcoes) {
    if (ativo) return Promise.resolve();
    ganchos = opcoes;
    ativo = true; pronto = false; textoEle = ""; textoVoce = ""; ultimoSom = Date.now();
    ganchos.estado("pensando");
    ctxSom = ctxSom || new (window.AudioContext || window.webkitAudioContext)();
    if (ctxSom.state === "suspended") ctxSom.resume();
    return Promise.resolve(opcoes.conexao()).then(function (cx) {
      return new Promise(function (resolver, rejeitar) {
        var url = cx.token
          ? WS_BASE + "BidiGenerateContentConstrained?access_token=" + encodeURIComponent(cx.token)
          : WS_BASE + "BidiGenerateContent?key=" + encodeURIComponent(cx.chave);
        ws = new WebSocket(url);
        var abriu = false;
        ws.onopen = function () {
          abriu = true;
          ws.send(JSON.stringify({ setup: {
            model: "models/" + cx.modelo,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cx.voz } } }
            },
            systemInstruction: { parts: [{ text: opcoes.instrucoes }] },
            tools: [{ functionDeclarations: opcoes.funcoes }, { googleSearch: {} }],
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          } }));
          abrirMicrofone().then(resolver).catch(function (e) {
            parar("microfone");
            var nome = (e && (e.name || e.message)) || "desconhecido";
            rejeitar(new Error("microfone: " + nome));
          });
        };
        ws.onmessage = aoReceber;
        ws.onerror = function () { if (!abriu) rejeitar(new Error("Não consegui abrir a conversa ao vivo.")); };
        ws.onclose = function (e) {
          var motivo = e.reason || ("código " + e.code);
          if (!abriu) { ativo = false; rejeitar(new Error("Conversa ao vivo recusada: " + motivo)); return; }
          if (ativo) parar(e.code === 1000 ? "fim" : "queda: " + motivo);
        };
        // sem conversa por um tempo: volta a esperar o chamado
        relogioSilencio = setInterval(function () {
          if (ativo && !falando && Date.now() - ultimoSom > (opcoes.silencioMs || 60000)) parar("silêncio");
        }, 3000);
      });
    }).catch(function (e) { ativo = false; limpar(); throw e; });
  }
  function limpar() {
    clearInterval(relogioSilencio); relogioSilencio = null;
    fecharMicrofone(); calarSom();
    if (ws) { var w = ws; ws = null; w.onclose = null; try { w.close(1000); } catch (e) { /* ok */ } }
    pronto = false;
  }
  function parar(motivo) {
    if (!ativo) return;
    ativo = false;
    fecharTexto();
    limpar();
    var g = ganchos;
    if (g && g.fim) g.fim(motivo || "fim");
  }
  function enviarTexto(texto, silencioso) {
    if (!ws || ws.readyState !== 1 || !pronto) return false;
    if (!silencioso && ganchos) ganchos.log("eu", texto);
    ultimoSom = Date.now();
    ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: texto }] }], turnComplete: true } }));
    return true;
  }
  function enviarImagem(img, texto) {
    if (!ws || ws.readyState !== 1 || !pronto) return false;
    ultimoSom = Date.now();
    ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [
      { inlineData: { mimeType: img.tipo, data: img.base64 } }, { text: texto }] }], turnComplete: true } }));
    return true;
  }

  window.HerupuAoVivo = {
    iniciar: iniciar, parar: parar, enviarTexto: enviarTexto, enviarImagem: enviarImagem,
    ativo: function () { return ativo; }
  };
})();
