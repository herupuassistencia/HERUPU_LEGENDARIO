/* Agente de Marketing — painel do HERUPU LEGENDÁRIO */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var CHAVE_SENHA = "herupu-mkt-senha";
  var senha = "";
  try { senha = localStorage.getItem(CHAVE_SENHA) || ""; } catch (e) { /* sem armazenamento */ }

  var estado = { posts: [], filtro: "todos", editando: null, midias: [] };

  // ------------------------------------------------------------ utilidades
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texto") n.textContent = attrs[k];
      else if (k === "classe") n.className = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) n.appendChild(typeof f === "string" ? document.createTextNode(f) : f); });
    return n;
  }
  function aviso(texto, alvo) {
    var a = $(alvo || "avisoGeral");
    a.textContent = texto || "";
    a.hidden = !texto;
    if (texto && !alvo) window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function api(caminho, corpo) {
    return fetch("/api/mkt/" + caminho, {
      method: corpo ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "x-herupu-senha": senha },
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { sair(); throw new Error(j.erro || "Senha incorreta."); }
        if (!r.ok) throw new Error(j.erro || ("Erro " + r.status));
        return j;
      });
    });
  }
  function ocupado(botao, texto) {
    var antes = botao.textContent;
    botao.disabled = true; botao.textContent = texto;
    return function () { botao.disabled = false; botao.textContent = antes; };
  }
  function dataBonita(iso) {
    if (!iso) return "sem data";
    return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function paraCampoData(iso) {
    if (!iso) return "";
    var d = new Date(iso), z = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "T" + z(d.getHours()) + ":" + z(d.getMinutes());
  }

  // ------------------------------------------------------------ login
  function sair() {
    senha = "";
    try { localStorage.removeItem(CHAVE_SENHA); } catch (e) { /* ok */ }
    $("telaPainel").hidden = true; $("telaLogin").hidden = false;
  }
  $("formLogin").addEventListener("submit", function (e) {
    e.preventDefault();
    senha = $("senha").value.trim();
    if (!senha) return;
    carregar().then(function () {
      try { localStorage.setItem(CHAVE_SENHA, senha); } catch (e2) { /* ok */ }
      $("senha").value = "";
    }).catch(function (err) { aviso(err.message, "avisoLogin"); });
  });
  $("btnSair").addEventListener("click", sair);

  // ------------------------------------------------------------ carregar estado
  function carregar() {
    return api("estado").then(function (j) {
      $("telaLogin").hidden = true; $("telaPainel").hidden = false; aviso("", "avisoLogin");
      estado.posts = j.posts || [];
      var c = $("conexao"); c.textContent = "";
      c.appendChild(el("span", { classe: j.instagram && j.meta ? "ok" : "falta", texto: (j.instagram && j.meta ? "● Instagram conectado" : "○ Instagram não configurado") }));
      c.appendChild(document.createTextNode("   "));
      c.appendChild(el("span", { classe: j.facebook && j.meta ? "ok" : "falta", texto: (j.facebook && j.meta ? "● Facebook conectado" : "○ Facebook não configurado") }));
      $("statusMeta").textContent = j.conexao
        ? "Conectado à Página " + j.conexao.pagina + (j.conexao.instagram ? " e ao Instagram @" + j.conexao.instagram : "") + " desde " + dataBonita(j.conexao.em) + "."
        : (j.meta ? "Conectado pelas chaves do servidor (.env)." : "Ainda não conectado.");
      $("btnConectarMeta").hidden = !j.podeConectar;
      if (!j.conexao) $("blocoSegredo").open = !j.podeConectar;
      if (!j.podeConectar && !j.meta) $("statusMeta").textContent += " Para usar o botão, o servidor precisa de META_APP_ID e META_APP_SECRET no .env.";
      c.appendChild(document.createTextNode("   "));
      c.appendChild(el("span", { classe: j.tiktok && j.tiktok.conectado ? "ok" : "falta", texto: j.tiktok && j.tiktok.conectado ? "● TikTok conectado" : "○ TikTok não conectado" }));
      if (!j.meta || !(j.tiktok && j.tiktok.conectado)) c.appendChild(el("span", { texto: "  · conecte em Ajustes" }));
      desenharTiktok(j.tiktok || {});
      estado.piloto = j.piloto; estado.modelos = j.modelos || [];
      desenharPiloto(); desenharModelos();
      $("cfgContexto").value = j.config.contexto || "";
      $("cfgKit").value = j.config.kit || "";
      $("cfgAuto").checked = !!j.config.autoResponder;
      $("cfgPexels").placeholder = j.config.pexels ? "Chave configurada ✔ (cole outra para trocar)" : "Cole a chave do Pexels";
      desenharPosts();
    });
  }

  // ------------------------------------------------------------ abas
  function abrirAba(nome) {
    document.querySelectorAll(".mkt-abas button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.aba === nome ? "true" : "false"); });
    ["posts", "piloto", "estrategia", "novo", "comentarios", "relatorio", "ajustes"].forEach(function (a) { $("aba-" + a).hidden = a !== nome; });
    aviso("");
  }
  document.querySelectorAll(".mkt-abas button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.aba === "novo" && !estado.editando) limparEditor();
      abrirAba(b.dataset.aba);
    });
  });
  document.querySelectorAll("#filtros button").forEach(function (b) {
    b.addEventListener("click", function () {
      estado.filtro = b.dataset.filtro;
      document.querySelectorAll("#filtros button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      desenharPosts();
    });
  });

  // ------------------------------------------------------------ lista de posts
  var NOMES_STATUS = { rascunho: "Rascunho", aprovado: "Agendado", publicando: "Publicando…", publicado: "Publicado", erro: "Com erro" };
  function desenharPosts() {
    var lista = $("listaPosts"); lista.textContent = "";
    var posts = estado.posts.filter(function (p) { return estado.filtro === "todos" || p.status === estado.filtro; });
    if (estado.filtro === "aprovado") posts.sort(function (a, b) { return Date.parse(a.quando) - Date.parse(b.quando); });
    if (!posts.length) { lista.appendChild(el("p", { classe: "mkt-vazio", texto: "Nenhum post aqui. Crie um na aba Novo, ou peça por voz: “Legendário, cria um post sobre…”." })); return; }
    posts.forEach(function (p) {
      var card = el("article", { classe: "mkt-card" }, [
        el("div", { classe: "topo-card" }, [
          el("span", {}, [el("span", { classe: "selo selo-" + p.status, texto: NOMES_STATUS[p.status] || p.status }),
            p.formato ? el("span", { classe: "selo selo-formato", texto: p.formato + (p.objetivo ? " · " + p.objetivo : "") }) : null]),
          el("span", { classe: "quando", texto: p.redes.join(" + ") + " · " + dataBonita(p.quando) })
        ])
      ]);
      if (p.midias.length) card.appendChild(el("div", { classe: "miniaturas" }, p.midias.map(function (m) { return el("img", { src: m.url, alt: "", loading: "lazy" }); })));
      if (p.gancho) card.appendChild(el("p", { classe: "gancho", texto: "Gancho: " + p.gancho }));
      if (p.cenas && p.cenas.length) card.appendChild(el("details", {}, [el("summary", { texto: "Cenas do Reel (" + p.cenas.length + ")" }),
        el("ol", {}, p.cenas.map(function (c, n) {
          var itens = [el("strong", { texto: c.tela }), el("div", { texto: "🎙 " + c.fala }), el("div", { classe: "nota", texto: "🎬 " + c.visual })];
          if (c.flow) itens.push(el("button", { classe: "botao", type: "button", texto: "Copiar prompt do Flow", onclick: function (ev) {
            (navigator.clipboard ? navigator.clipboard.writeText(c.flow) : Promise.reject()).then(function () { ev.target.textContent = "Copiado ✔ (cole no Flow)"; }, function () { aviso(c.flow); });
          } }));
          if (c.tipo === "video" && p.status !== "publicado") {
            var arq = el("input", { type: "file", accept: "video/*", hidden: "" });
            var rot = el("label", { classe: "botao" }, [c.clipe ? "Clipe enviado ✔ (trocar)" : "Enviar clipe desta cena", arq]);
            arq.addEventListener("change", function () {
              var f = arq.files[0]; if (!f) return;
              rot.firstChild.textContent = "Enviando… 0%";
              var x = new XMLHttpRequest();
              x.open("POST", "/api/mkt/clipe?id=" + encodeURIComponent(p.id) + "&cena=" + n);
              x.setRequestHeader("x-herupu-senha", senha);
              x.upload.onprogress = function (ev) { if (ev.lengthComputable) rot.firstChild.textContent = "Enviando… " + Math.round(ev.loaded / ev.total * 100) + "%"; };
              x.onload = function () { if (x.status === 200) { aviso("✔ Clipe da cena " + (n + 1) + " enviado. Depois de enviar os clipes, toque em ✦ Gerar Reel."); carregar(); } else { var j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* ok */ } aviso(j.erro || (x.status === 413 ? "Vídeo grande demais para o servidor (ajuste do nginx pendente)." : "Erro " + x.status)); rot.firstChild.textContent = "Enviar clipe desta cena"; } };
              x.onerror = function () { aviso("Falha no envio. Tente de novo."); };
              x.send(f);
            });
            itens.push(rot);
          }
          return el("li", {}, itens);
        }))]));
      else if (p.roteiro && p.roteiro.length) card.appendChild(el("details", {}, [el("summary", { texto: p.formato === "reels" ? "Roteiro do Reel" : "Texto dos slides / da arte" }),
        el("ol", {}, p.roteiro.map(function (t) { return el("li", { texto: t }); })),
        p.ideiaImagem ? el("p", { classe: "nota", texto: "Arte/gravação: " + p.ideiaImagem }) : null]));
      card.appendChild(el("div", { classe: "texto", texto: p.legenda || "(sem legenda)" }));
      Object.keys(p.resultados || {}).forEach(function (rede) {
        var r = p.resultados[rede];
        var linha = el("p", { classe: "resultado " + (r.ok ? "ok" : "falha") }, [rede + ": " + (r.ok ? "publicado " + (r.aviso ? "(" + r.aviso + ") " : "") : "falhou: " + r.erro + " ")]);
        if (r.ok && r.link) linha.appendChild(el("a", { href: r.link, target: "_blank", rel: "noopener", texto: "ver post" }));
        card.appendChild(linha);
      });
      if (p.problemas && p.problemas.length && p.status !== "publicado") card.appendChild(el("p", { classe: "problemas", texto: "Falta: " + p.problemas.join(", ") }));
      var acoes = el("div", { classe: "acoes" });
      if (p.aviso && p.status !== "publicado") card.appendChild(el("p", { classe: "problemas", texto: p.aviso }));
      if (p.origem === "piloto") card.querySelector(".topo-card span").appendChild(el("span", { classe: "selo selo-formato", texto: "🤖 piloto" }));
      if (p.videoTiktok && !p.video) card.appendChild(el("details", {}, [el("summary", { texto: "Vídeo para o TikTok" }), el("video", { src: p.videoTiktok.url, controls: "", playsinline: "", preload: "none", style: "width:100%;max-height:420px;border-radius:10px;background:#000" })]));
      if (p.video) card.appendChild(el("video", { src: p.video.url, controls: "", playsinline: "", preload: "metadata", style: "width:100%;max-height:420px;border-radius:10px;margin:8px 0;background:#000" }));
      if (p.status !== "publicado" && p.status !== "publicando") {
        acoes.appendChild(el("button", { classe: "botao principal", type: "button", texto: "✦ Gerar arte", onclick: function (e) { gerarMidia(p, "arte", e.target); } }));
        acoes.appendChild(el("button", { classe: "botao principal", type: "button", texto: "✦ Gerar Reel", onclick: function (e) { gerarMidia(p, "reel", e.target); } }));
        if (!(p.problemas && p.problemas.length)) acoes.appendChild(el("button", { classe: "botao principal", type: "button", texto: "▶ Publicar agora", onclick: function (e) {
          if (confirmarNoBotao(e.target, "Toque de novo para publicar")) publicarAgora(p, e.target);
        } }));
        acoes.appendChild(el("button", { classe: "botao", type: "button", texto: "Editar", onclick: function () { editar(p); } }));
      }
      if (p.status === "aprovado") acoes.appendChild(el("button", { classe: "botao", type: "button", texto: "Tirar da agenda", onclick: function (e) { acao(p, "desaprovar", e.target); } }));
      if (p.status === "erro") acoes.appendChild(el("button", { classe: "botao principal", type: "button", texto: "Tentar de novo", onclick: function (e) { publicarAgora(p, e.target); } }));
      acoes.appendChild(el("button", { classe: "botao", type: "button", texto: "Duplicar", onclick: function (e) { acao(p, "duplicar", e.target); } }));
      if (p.status !== "publicando") acoes.appendChild(el("button", { classe: "botao", type: "button", texto: "Excluir", onclick: function (e) {
        if (confirmarNoBotao(e.target, "Toque de novo para excluir")) acao(p, "excluir", e.target);
      } }));
      card.appendChild(acoes);
      lista.appendChild(card);
    });
  }
  // confirmação no próprio botão: o 1º toque muda o texto, o 2º (em até 8 s) confirma. Sem rolar a tela.
  function confirmarNoBotao(botao, texto) {
    if (botao.dataset.confirmar && Date.now() - Number(botao.dataset.confirmar) < 8000) { botao.textContent = botao.dataset.original; delete botao.dataset.confirmar; return true; }
    botao.dataset.original = botao.textContent;
    botao.dataset.confirmar = String(Date.now()); botao.textContent = texto;
    setTimeout(function () { if (botao.dataset.confirmar) { delete botao.dataset.confirmar; botao.textContent = botao.dataset.original; } }, 8000);
    return false;
  }
  // confirmação sem diálogo do navegador: segundo toque em até 4 s confirma
  var pendente = null;
  function confirmar(texto) {
    if (pendente && pendente.texto === texto && Date.now() - pendente.em < 4000) { pendente = null; return true; }
    pendente = { texto: texto, em: Date.now() };
    aviso(texto + " Toque de novo para confirmar.");
    return false;
  }
  function gerarMidia(p, tipo, botao) {
    var volta = ocupado(botao, tipo === "reel" ? "Montando o Reel (até 2 min)…" : "Criando a arte…");
    api(tipo, { id: p.id }).then(function () { aviso(tipo === "reel" ? "✔ Reel pronto. Assista no card e aprove." : "✔ Arte criada e anexada ao post."); return carregar(); })
      .catch(function (e) { aviso(e.message); }).then(volta);
  }
  function acao(p, nome, botao) {
    var volta = ocupado(botao, "…");
    return api("acao", { id: p.id, acao: nome }).then(function () { aviso(""); return carregar(); })
      .catch(function (e) { aviso(e.message); }).then(volta);
  }
  function publicarAgora(p, botao) {
    var volta = ocupado(botao, "Publicando…");
    return api("acao", { id: p.id, acao: "publicar" }).then(function (r) {
      aviso(r.status === "publicado" ? "Publicado com sucesso." : "Terminou com erro em alguma rede. Veja no card.");
      return carregar().then(function () { abrirAba("posts"); });
    }).catch(function (e) { aviso(e.message); }).then(volta);
  }

  // ------------------------------------------------------------ editor
  function limparEditor() {
    estado.editando = null; estado.midias = [];
    $("tituloEditor").textContent = "NOVO POST";
    $("tema").value = ""; $("legenda").value = ""; $("quando").value = "";
    $("redeInstagram").checked = true; $("redeFacebook").checked = false; $("redeTiktok").checked = false;
    $("ideiaImagem").hidden = true;
    $("formato").value = "imagem"; desenharRoteiro(null);
    contar(); desenharMidias();
  }
  function desenharRoteiro(p) {
    var box = $("roteiroEditor"); box.textContent = "";
    box.hidden = !(p && ((p.roteiro && p.roteiro.length) || p.gancho));
    if (box.hidden) return;
    if (p.gancho) box.appendChild(el("p", { classe: "gancho", texto: "Gancho: " + p.gancho }));
    if (p.roteiro && p.roteiro.length) box.appendChild(el("ol", {}, p.roteiro.map(function (t) { return el("li", { texto: t }); })));
  }
  function editar(p) {
    estado.editando = p.id; estado.midias = p.midias.slice();
    $("tituloEditor").textContent = "EDITAR POST";
    $("tema").value = p.tema || ""; $("legenda").value = p.legenda || "";
    $("quando").value = paraCampoData(p.quando);
    $("redeInstagram").checked = p.redes.indexOf("instagram") >= 0;
    $("redeFacebook").checked = p.redes.indexOf("facebook") >= 0;
    $("redeTiktok").checked = p.redes.indexOf("tiktok") >= 0;
    $("formato").value = p.formato || "imagem"; desenharRoteiro(p);
    $("ideiaImagem").hidden = !p.ideiaImagem;
    if (p.ideiaImagem) $("ideiaImagem").textContent = "Ideia de imagem: " + p.ideiaImagem;
    contar(); desenharMidias(); abrirAba("novo");
  }
  function contar() { $("contador").textContent = $("legenda").value.length; }
  $("legenda").addEventListener("input", contar);
  $("btnLimpar").addEventListener("click", limparEditor);

  function dadosDoEditor() {
    var redes = [];
    if ($("redeInstagram").checked) redes.push("instagram");
    if ($("redeFacebook").checked) redes.push("facebook");
    if ($("redeTiktok").checked) redes.push("tiktok");
    return {
      id: estado.editando || undefined, redes: redes, tema: $("tema").value.trim(), legenda: $("legenda").value,
      midias: estado.midias, formato: $("formato").value, quando: $("quando").value ? new Date($("quando").value).toISOString() : null
    };
  }
  function salvarEditor() {
    var d = dadosDoEditor();
    if (!d.redes.length) return Promise.reject(new Error("Marque pelo menos uma rede."));
    return api("salvar", d).then(function (p) { estado.editando = p.id; return p; });
  }
  $("btnSalvar").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Salvando…");
    salvarEditor().then(function () { aviso("Rascunho salvo."); return carregar(); }).catch(function (err) { aviso(err.message); }).then(volta);
  });
  $("btnAprovar").addEventListener("click", function (e) {
    if (!$("quando").value) { aviso("Escolha a data e a hora antes de agendar."); return; }
    if (new Date($("quando").value).getTime() < Date.now() - 60000) { aviso("Essa data já passou. Escolha um horário futuro ou use Publicar agora."); return; }
    var volta = ocupado(e.target, "Agendando…");
    salvarEditor().then(function (p) { return api("acao", { id: p.id, acao: "aprovar" }); })
      .then(function (p) { aviso("Aprovado. Publica sozinho em " + dataBonita(p.quando) + "."); limparEditor(); return carregar().then(function () { abrirAba("posts"); }); })
      .catch(function (err) { aviso(err.message); }).then(volta);
  });
  $("btnPublicarJa").addEventListener("click", function (e) {
    if (!confirmarNoBotao(e.target, "Toque de novo para publicar")) return;
    var botao = e.target;
    salvarEditor().then(function (p) { limparEditor(); return publicarAgora(p, botao); }).catch(function (err) { aviso(err.message); });
  });
  $("btnGerar").addEventListener("click", function (e) {
    var tema = $("tema").value.trim();
    if (!tema) { aviso("Escreva primeiro sobre o que é o post."); return; }
    var volta = ocupado(e.target, "Escrevendo…");
    api("legenda", { tema: tema, rede: $("redeInstagram").checked ? "instagram" : "facebook" }).then(function (j) {
      $("legenda").value = j.legenda; contar();
      $("ideiaImagem").hidden = !j.ideia_imagem;
      $("ideiaImagem").textContent = j.ideia_imagem ? "Ideia de imagem: " + j.ideia_imagem : "";
      aviso("");
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });

  // ------------------------------------------------------------ imagens (ajusta para o Instagram e envia)
  function desenharMidias(carregando) {
    var box = $("midias"); box.textContent = "";
    estado.midias.forEach(function (m, i) {
      box.appendChild(el("figure", {}, [
        el("img", { src: m.url, alt: "" }),
        el("button", { type: "button", "aria-label": "Remover imagem", texto: "×", onclick: function () { estado.midias.splice(i, 1); desenharMidias(); } })
      ]));
    });
    for (var k = 0; k < (carregando || 0); k++) box.appendChild(el("figure", { classe: "carregando", texto: "enviando…" }));
  }
  function prepararImagem(arquivo) {
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(arquivo), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight, razao = w / h;
        // Instagram aceita de 4:5 (0,8) até 1,91:1. Fora disso, completa as bordas com fundo escuro.
        var cw = w, ch = h;
        if (razao < 0.8) cw = Math.round(h * 0.8);
        if (razao > 1.91) ch = Math.round(w / 1.91);
        var escala = Math.min(1, 1440 / Math.max(cw, ch));
        var tela = document.createElement("canvas");
        tela.width = Math.round(cw * escala); tela.height = Math.round(ch * escala);
        var cx = tela.getContext("2d");
        cx.fillStyle = "#07070b"; cx.fillRect(0, 0, tela.width, tela.height);
        var dw = w * escala, dh = h * escala;
        cx.drawImage(img, (tela.width - dw) / 2, (tela.height - dh) / 2, dw, dh);
        var qualidade = 0.9;
        (function tentar() {
          var dados = tela.toDataURL("image/jpeg", qualidade).split(",")[1];
          if (dados.length > 900000 && qualidade > 0.5) { qualidade -= 0.1; return tentar(); }
          ok(dados);
        })();
      };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error("Não consegui abrir essa imagem.")); };
      img.src = url;
    });
  }
  $("arquivos").addEventListener("change", function (e) {
    var arquivos = Array.prototype.slice.call(e.target.files || [], 0, 10 - estado.midias.length);
    e.target.value = "";
    if (!arquivos.length) return;
    var faltam = arquivos.length;
    desenharMidias(faltam);
    arquivos.reduce(function (p, arq) {
      return p.then(function () {
        return prepararImagem(arq).then(function (b64) { return api("midia", { base64: b64, tipo: "image/jpeg" }); })
          .then(function (m) { estado.midias.push(m); faltam--; desenharMidias(faltam); })
          .catch(function (err) { faltam--; desenharMidias(faltam); aviso(err.message); });
      });
    }, Promise.resolve());
  });

  // ------------------------------------------------------------ comentários
  $("btnComentarios").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Buscando…");
    var lista = $("listaComentarios"); lista.textContent = "";
    api("comentarios").then(function (j) {
      if (!j.comentarios.length) { lista.appendChild(el("p", { classe: "mkt-vazio", texto: "Nenhum comentário esperando resposta." })); return; }
      j.comentarios.forEach(function (c) {
        var caixa = el("textarea", { rows: "3", placeholder: "Sua resposta" });
        var card = el("article", { classe: "mkt-card" }, [
          el("div", {}, [el("span", { classe: "autor", texto: "@" + c.usuario }), " · " + dataBonita(c.quando)]),
          el("div", { classe: "texto", texto: c.texto }),
          el("div", { classe: "contexto", texto: "No post: " + (c.post || "") }),
          caixa
        ]);
        var acoes = el("div", { classe: "acoes" }, [
          el("button", { classe: "botao", type: "button", texto: "✦ Sugerir resposta", onclick: function (ev) {
            var v = ocupado(ev.target, "Pensando…");
            api("sugerir", { texto: c.texto, post: c.post }).then(function (s) { caixa.value = s.resposta || ""; if (!s.resposta) aviso("A IA achou que é spam ou não precisa de resposta."); })
              .catch(function (err) { aviso(err.message); }).then(v);
          } }),
          el("button", { classe: "botao principal", type: "button", texto: "Responder", onclick: function (ev) {
            if (!caixa.value.trim()) { aviso("Escreva ou gere a resposta primeiro."); return; }
            var v = ocupado(ev.target, "Enviando…");
            api("responder", { id: c.id, texto: caixa.value }).then(function () { card.remove(); aviso("Resposta enviada para @" + c.usuario + "."); })
              .catch(function (err) { aviso(err.message); v(); });
          } }),
          el("button", { classe: "botao", type: "button", texto: "Ignorar", onclick: function () { api("ignorar", { id: c.id }).then(function () { card.remove(); }); } })
        ]);
        if (c.link) acoes.appendChild(el("a", { classe: "botao", href: c.link, target: "_blank", rel: "noopener", texto: "Abrir post" }));
        card.appendChild(acoes);
        lista.appendChild(card);
      });
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });

  // ------------------------------------------------------------ relatório
  $("btnRelatorio").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Calculando…");
    var lista = $("listaRelatorio"); lista.textContent = ""; $("resumoConta").textContent = "";
    api("relatorio").then(function (j) {
      var soma = { alcance: 0, curtidas: 0, comentarios: 0 };
      var semana = Date.now() - 7 * 864e5;
      j.midias.forEach(function (m) {
        if (Date.parse(m.timestamp) >= semana) { soma.alcance += m.alcance || 0; soma.curtidas += m.like_count || 0; soma.comentarios += m.comments_count || 0; }
      });
      $("resumoConta").appendChild(el("p", { classe: "nota", texto: "@" + j.conta.username + " · " + (j.conta.followers_count || 0) + " seguidores · " + (j.conta.media_count || 0) + " posts" }));
      $("resumoConta").appendChild(el("div", { classe: "mkt-metricas" }, [
        el("div", {}, [el("strong", { texto: j.avisoMetricas ? "–" : String(soma.alcance) }), "alcance 7 dias"]),
        el("div", {}, [el("strong", { texto: String(soma.curtidas) }), "curtidas"]),
        el("div", {}, [el("strong", { texto: String(soma.comentarios) }), "comentários"]),
        el("div", {}, [el("strong", { texto: String(j.midias.filter(function (m) { return Date.parse(m.timestamp) >= semana; }).length) }), "posts"])
      ]));
      if (j.avisoMetricas) $("resumoConta").appendChild(el("p", { classe: "problemas", texto: j.avisoMetricas }));
      j.midias.forEach(function (m) {
        var card = el("article", { classe: "mkt-card" }, [
          el("div", { classe: "topo-card" }, [el("span", { classe: "quando", texto: dataBonita(m.timestamp) + " · " + (m.media_type || "").toLowerCase() }),
            el("a", { href: m.permalink, target: "_blank", rel: "noopener", texto: "abrir" })]),
          el("div", { classe: "texto", texto: m.caption || "" }),
          el("div", { classe: "mkt-metricas" }, [
            el("div", {}, [el("strong", { texto: m.visualizacoes != null ? String(m.visualizacoes) : m.alcance == null ? "–" : String(m.alcance) }), m.visualizacoes != null ? "views" : "alcance"]),
            el("div", {}, [el("strong", { texto: String(m.like_count || 0) }), "curtidas"]),
            el("div", {}, [el("strong", { texto: String(m.comments_count || 0) }), "coment."]),
            el("div", {}, [el("strong", { texto: m.salvos == null ? "–" : String(m.salvos) }), "salvos"])
          ])
        ]);
        lista.appendChild(card);
      });
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });

  // ------------------------------------------------------------ ajustes
  $("btnSalvarCfg").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Salvando…");
    api("config", { contexto: $("cfgContexto").value, kit: $("cfgKit").value, autoResponder: $("cfgAuto").checked, pexels: $("cfgPexels").value })
      .then(function () { $("cfgPexels").value = ""; aviso("Ajustes salvos."); return carregar(); }).catch(function (err) { aviso(err.message); }).then(volta);
  });

  // ------------------------------------------------------------ estratégia
  function lista(titulo, itens) {
    if (!itens || !itens.length) return null;
    return el("div", {}, [el("h3", { texto: titulo }), el("ul", {}, itens.map(function (t) { return el("li", { texto: t }); }))]);
  }
  $("btnDiagnostico").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Analisando os números…");
    var out = $("saidaDiagnostico"); out.textContent = "";
    api("diagnostico", {}).then(function (d) {
      out.appendChild(el("div", { classe: "mkt-diag" }, [el("p", { texto: d.resumo }), lista("O QUE ESTÁ TRAVANDO", d.problemas), lista("FAZER NOS PRÓXIMOS 7 DIAS", d.acoes), lista("METAS PARA 30 DIAS", d.metas)]));
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });
  $("btnPlano").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Criando o plano (pode levar 1 minuto)…");
    api("plano", { foco: $("planoFoco").value, quantidade: Number($("planoQtd").value) }).then(function (j) {
      aviso("✔ " + j.posts.length + " rascunhos criados com roteiro. Revise em Posts → Rascunhos, coloque a arte/vídeo e aprove.");
      return carregar().then(function () {
        estado.filtro = "rascunho";
        document.querySelectorAll("#filtros button").forEach(function (x) { x.setAttribute("aria-pressed", x.dataset.filtro === "rascunho" ? "true" : "false"); });
        desenharPosts(); abrirAba("posts");
      });
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });
  function carregarLinks() {
    return api("links").then(function (j) {
      var box = $("listaLinks"); box.textContent = "";
      var cods = Object.keys(j.links || {});
      if (!cods.length) { box.appendChild(el("p", { classe: "nota", texto: "Nenhum link ainda. Crie um para a bio do Instagram (ex.: bio-tecnicos)." })); return; }
      cods.forEach(function (c) {
        var l = j.links[c], url = j.base + c;
        var hoje = Object.keys(l.dias || {}).sort().slice(-1)[0];
        box.appendChild(el("div", { classe: "mkt-link" }, [
          el("div", {}, [el("div", { texto: l.nome }), el("code", { texto: url })]),
          el("div", { style: "text-align:right" }, [el("strong", { texto: String(l.total || 0) }), el("div", { classe: "nota", texto: "cliques" + (hoje ? " · último dia " + hoje.split("-").reverse().slice(0, 2).join("/") + ": " + l.dias[hoje] : "") }),
            el("button", { classe: "botao", type: "button", texto: "Copiar", onclick: function (ev) {
              (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { ev.target.textContent = "Copiado"; }, function () { aviso(url); });
            } })])
        ]));
      });
    }).catch(function (err) { aviso(err.message); });
  }
  $("btnLink").addEventListener("click", function (e) {
    var nome = $("linkNome").value.trim();
    if (!nome) { aviso("Dê um nome ao link (ex.: bio-tecnicos)."); return; }
    var op = $("linkDestino").selectedOptions[0];
    var volta = ocupado(e.target, "Criando…");
    api("link", { nome: nome, destino: op.value, foco: op.dataset.foco }).then(function (j) { $("linkNome").value = ""; aviso("Link criado: /r/" + j.codigo); return carregarLinks(); })
      .catch(function (err) { aviso(err.message); }).then(volta);
  });
  document.querySelector('[data-aba="estrategia"]').addEventListener("click", carregarLinks);

  $("btnConectarMeta").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Abrindo a Meta…");
    api("meta/iniciar", {}).then(function (j) { location.href = j.url; }).catch(function (err) { aviso(err.message); volta(); });
  });
  $("btnSegredo").addEventListener("click", function (e) {
    var v = $("segredoMeta").value.trim();
    if (!v) { aviso("Cole a Chave Secreta primeiro."); return; }
    var volta = ocupado(e.target, "Conferindo com a Meta…");
    api("meta/segredo", { segredo: v }).then(function () {
      $("segredoMeta").value = ""; $("blocoSegredo").open = false;
      aviso("✔ Chave Secreta conferida e salva. Agora toque em CONECTAR INSTAGRAM / FACEBOOK."); return carregar();
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });
  $("btnTrocarSenha").addEventListener("click", function (e) {
    var nova = $("senhaNova").value;
    if (nova.length < 6) { aviso("A senha nova precisa ter pelo menos 6 caracteres."); return; }
    var volta = ocupado(e.target, "Trocando…");
    api("senha", { nova: nova }).then(function () {
      senha = nova; try { localStorage.setItem(CHAVE_SENHA, nova); } catch (e2) { /* ok */ }
      $("senhaNova").value = ""; aviso("Senha trocada. Use a nova senha nos outros aparelhos.");
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });


  // ------------------------------------------------------------ piloto automático
  var SEGMENTOS = { tecnicos: "Captar técnicos", clientes: "Captar clientes", solar: "Energia solar", seguranca: "Segurança eletrônica", programacao: "Programação de sistemas" };
  var NOMES_FOCO = Object.assign({ rodizio: "Rodízio dos segmentos" }, SEGMENTOS, { sistemas: "HERUPU SISTEMAS", misto: "Marca em geral" });
  var NOMES_FORMATO = { ambos: "Arte + Reel", reels: "Só Reel", imagem: "Só arte", carrossel: "Carrossel" };
  function selecao(opcoes, valor) {
    var s = el("select");
    Object.keys(opcoes).forEach(function (k) { var o = el("option", { value: k, texto: opcoes[k] }); if (k === valor) o.selected = true; s.appendChild(o); });
    return s;
  }
  function linhaHorario(h) {
    var hora = el("input", { type: "time", value: h.hora || "12:00" });
    var linha = el("div", { classe: "mkt-horario", style: "display:grid;grid-template-columns:90px 1fr 1fr 36px;gap:6px;margin:6px 0;align-items:center" }, [
      hora, selecao(NOMES_FORMATO, h.formato || "ambos"), selecao(NOMES_FOCO, h.foco || "rodizio"),
      el("button", { type: "button", classe: "botao", "aria-label": "Tirar horário", texto: "×", onclick: function () { linha.remove(); } })
    ]);
    return linha;
  }
  function desenharPiloto() {
    var pl = estado.piloto; if (!pl) return;
    var c = pl.config;
    $("pilotoLigado").checked = !!c.ligado;
    $("pilotoAprovacao").value = c.aprovacao;
    $("pilotoIG").checked = c.redes.indexOf("instagram") >= 0;
    $("pilotoFB").checked = c.redes.indexOf("facebook") >= 0;
    $("pilotoTT").checked = c.redes.indexOf("tiktok") >= 0;
    var box = $("pilotoHorarios");
    if (!box.dataset.mexido) { box.textContent = ""; c.horarios.forEach(function (h) { box.appendChild(linhaHorario(h)); }); }
    var rbox = $("pilotoRodizio");
    if (!rbox.dataset.mexido) {
      rbox.textContent = "";
      Object.keys(SEGMENTOS).forEach(function (k) {
        var cb = el("input", { type: "checkbox", value: k }); cb.checked = (c.rodizio || []).indexOf(k) >= 0;
        rbox.appendChild(el("label", { classe: "linha-check" }, [cb, " " + SEGMENTOS[k]]));
      });
    }
    var porDia = c.horarios.reduce(function (t, h) { return t + (h.formato === "ambos" ? 2 : 1); }, 0);
    var st = $("pilotoStatus"); st.textContent = "";
    st.appendChild(el("span", { classe: c.ligado ? "ok" : "falta", texto: c.ligado ? "● Ligado: " + porDia + " posts por dia em " + c.horarios.length + " horários" : "○ Desligado" }));
    if (pl.ocupado) st.appendChild(el("span", { texto: "  · montando um post agora…" }));
    else if (c.ligado && pl.vagas) st.appendChild(el("span", { texto: "  · " + pl.vagas + " na fila para montar (um a cada 10 min)" }));
    var fila = $("pilotoFila"); fila.textContent = "";
    if (!pl.fila.length) fila.appendChild(el("p", { classe: "nota", texto: c.ligado ? "Nada na fila ainda. O primeiro post fica pronto em poucos minutos." : "Ligue o piloto e salve." }));
    pl.fila.forEach(function (p) {
      fila.appendChild(el("div", { classe: "mkt-link" }, [
        el("div", {}, [el("div", { texto: dataBonita(p.quando) + " · " + ({ reels: "Reel", imagem: "Arte", carrossel: "Carrossel" }[p.formato] || p.formato) + " · " + (NOMES_FOCO[p.foco] || p.foco || "") }), el("div", { classe: "nota", texto: p.gancho || "" }),
          p.aviso ? el("div", { classe: "problemas", texto: p.aviso }) : null]),
        el("span", { classe: "selo selo-" + p.status, texto: NOMES_STATUS[p.status] || p.status })
      ]));
    });
    var log = $("pilotoLog"); log.textContent = "";
    pl.log.forEach(function (l) { log.appendChild(el("li", { texto: dataBonita(l.em) + ": " + l.texto })); });
  }
  $("pilotoRodizio").addEventListener("change", function () { $("pilotoRodizio").dataset.mexido = "1"; });
  $("pilotoHorarios").addEventListener("input", function () { $("pilotoHorarios").dataset.mexido = "1"; });
  $("pilotoHorarios").addEventListener("change", function () { $("pilotoHorarios").dataset.mexido = "1"; });
  $("btnMaisHorario").addEventListener("click", function () {
    $("pilotoHorarios").dataset.mexido = "1";
    $("pilotoHorarios").appendChild(linhaHorario({ hora: "16:00", formato: "ambos", foco: "rodizio" }));
  });
  $("btnSalvarPiloto").addEventListener("click", function (e) {
    var redes = [];
    if ($("pilotoIG").checked) redes.push("instagram");
    if ($("pilotoFB").checked) redes.push("facebook");
    if ($("pilotoTT").checked) redes.push("tiktok");
    var horarios = Array.prototype.map.call($("pilotoHorarios").children, function (l) {
      var c = l.querySelectorAll("input,select");
      return { hora: c[0].value, formato: c[1].value, foco: c[2].value };
    });
    var rodizio = Array.prototype.filter.call($("pilotoRodizio").querySelectorAll("input"), function (x) { return x.checked; }).map(function (x) { return x.value; });
    var volta = ocupado(e.target, "Salvando…");
    api("piloto", { ligado: $("pilotoLigado").checked, aprovacao: $("pilotoAprovacao").value, redes: redes, horarios: horarios, rodizio: rodizio }).then(function (pl) {
      delete $("pilotoHorarios").dataset.mexido; delete $("pilotoRodizio").dataset.mexido;
      estado.piloto = pl; desenharPiloto();
      aviso(pl.config.ligado ? "✔ Piloto ligado. Ele monta os posts de hoje e amanhã sozinho, um a cada 10 minutos." : "Piloto salvo (desligado).");
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });
  $("btnPilotoAgora").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Criando roteiro e mídia (até 3 min)…");
    api("piloto/agora", {}).then(function (j) {
      aviso(j.post ? "✔ Post criado para " + dataBonita(j.post.quando) + (j.post.status === "aprovado" ? " e já agendado." : ". Ele espera sua aprovação em Posts.") : j.msg);
      return carregar();
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });
  document.querySelector('[data-aba="piloto"]').addEventListener("click", function () { carregar().catch(function () { /* ok */ }); });

  // ------------------------------------------------------------ modelos
  function desenharModelos() {
    var box = $("listaModelos"); box.textContent = "";
    var img = 0, vid = 0;
    (estado.modelos || []).forEach(function (m) {
      if (m.tipo === "video") vid++; else img++;
      box.appendChild(el("figure", { title: m.nome + " · " + (SEGMENTOS[m.foco] || "qualquer segmento") + " · usado " + (m.usos || 0) + "x" }, [
        m.foco && m.foco !== "todos" ? el("span", { style: "position:absolute;left:3px;bottom:3px;font-size:10px;background:rgba(0,0,0,.75);color:#fff;padding:1px 5px;border-radius:6px", texto: (SEGMENTOS[m.foco] || "").split(" ")[0] }) : null,
        m.tipo === "video" ? el("video", { src: m.url, muted: "", playsinline: "", preload: "metadata" }) : el("img", { src: m.url, alt: "", loading: "lazy" }),
        el("button", { type: "button", "aria-label": "Tirar modelo", texto: "×", onclick: function (ev) {
          if (!confirmarNoBotao(ev.target, "?")) return;
          api("modelo-excluir", { arquivo: m.arquivo }).then(carregar).catch(function (err) { aviso(err.message); });
        } })
      ]));
    });
    $("notaModelos").textContent = img + " imagens e " + vid + " vídeos. " + (img + vid ? "" : "Sem modelos, o piloto usa as artes da HERUPU e os vídeos do Pexels.");
  }
  $("modeloImagens").addEventListener("change", function (e) {
    var arqs = Array.prototype.slice.call(e.target.files || [], 0, 30); e.target.value = "";
    var n = 0;
    arqs.reduce(function (p, a) {
      return p.then(function () {
        $("notaModelos").textContent = "Enviando imagem " + (++n) + " de " + arqs.length + "…";
        return prepararModelo(a).then(function (b64) { return api("modelo", { base64: b64, tipo: "image/jpeg", nome: a.name, foco: $("modeloFoco").value }); }).catch(function (err) { aviso(err.message); });
      });
    }, Promise.resolve()).then(carregar);
  });
  // modelo de imagem: só reduz e converte para JPG (o enquadramento é feito no servidor)
  function prepararModelo(arquivo) {
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(arquivo), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var esc = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
        var t = document.createElement("canvas"); t.width = Math.round(img.naturalWidth * esc); t.height = Math.round(img.naturalHeight * esc);
        t.getContext("2d").drawImage(img, 0, 0, t.width, t.height);
        ok(t.toDataURL("image/jpeg", 0.88).split(",")[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error("Não consegui abrir " + arquivo.name)); };
      img.src = url;
    });
  }
  $("modeloVideos").addEventListener("change", function (e) {
    var arqs = Array.prototype.slice.call(e.target.files || [], 0, 10); e.target.value = "";
    var n = 0;
    arqs.reduce(function (p, f) {
      return p.then(function () {
        n++;
        return new Promise(function (ok) {
          var x = new XMLHttpRequest();
          x.open("POST", "/api/mkt/modelo-video?nome=" + encodeURIComponent(f.name) + "&foco=" + encodeURIComponent($("modeloFoco").value));
          x.setRequestHeader("x-herupu-senha", senha);
          x.upload.onprogress = function (ev) { if (ev.lengthComputable) $("notaModelos").textContent = "Vídeo " + n + " de " + arqs.length + ": enviando " + Math.round(ev.loaded / ev.total * 100) + "%" + (ev.loaded === ev.total ? " · ajustando para 9:16…" : ""); };
          x.onload = function () {
            if (x.status !== 200) { var j = {}; try { j = JSON.parse(x.responseText); } catch (er) { /* ok */ } aviso(j.erro || (x.status === 413 ? "Vídeo grande demais para o servidor (falta o ajuste do nginx)." : "Erro " + x.status)); }
            ok();
          };
          x.onerror = function () { aviso("Falha no envio de " + f.name + "."); ok(); };
          x.send(f);
        });
      });
    }, Promise.resolve()).then(carregar);
  });

  // ------------------------------------------------------------ TikTok
  function desenharTiktok(t) {
    $("redirTiktok").textContent = t.redirect || "";
    $("statusTiktok").textContent = t.conectado
      ? "Conectado" + (t.usuario ? " como " + t.usuario : "") + " desde " + dataBonita(t.em) + "." + (t.privado ? " Os vídeos saem PRIVADOS até o app do TikTok passar na auditoria." : "")
      : (t.chaves ? "Chaves salvas (" + (t.origemChave === "painel" ? "coladas aqui" : "do servidor") + ", começa com " + t.chaveInicio + "…). Toque em Conectar TikTok." : "Primeiro cole as chaves do app do TikTok (abaixo).");
    $("btnConectarTiktok").hidden = !t.chaves || t.conectado;
    $("blocoTiktok").querySelector("summary").textContent = t.chaves ? "Trocar chaves do app do TikTok (ex.: chaves do Sandbox)" : "Chaves do app do TikTok";
    $("btnDesconectarTiktok").hidden = !t.conectado;
    if (!t.chaves) $("blocoTiktok").open = true;
  }
  $("btnChavesTiktok").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Salvando…");
    api("tiktok/chaves", { chave: $("ttChave").value, segredo: $("ttSegredo").value }).then(function () {
      $("ttChave").value = ""; $("ttSegredo").value = ""; $("blocoTiktok").open = false;
      aviso("✔ Chaves salvas. Agora toque em CONECTAR TIKTOK."); return carregar();
    }).catch(function (err) { aviso(err.message); }).then(volta);
  });
  $("btnConectarTiktok").addEventListener("click", function (e) {
    var volta = ocupado(e.target, "Abrindo o TikTok…");
    api("tiktok/iniciar", {}).then(function (j) { location.href = j.url; }).catch(function (err) { aviso(err.message); volta(); });
  });
  $("btnDesconectarTiktok").addEventListener("click", function (e) {
    if (!confirmarNoBotao(e.target, "Toque de novo para desconectar")) return;
    api("tiktok/desconectar", {}).then(carregar).catch(function (err) { aviso(err.message); });
  });

  // volta do login da Meta / TikTok
  (function () {
    var q = new URLSearchParams(location.search);
    if (!q.get("meta")) return;
    history.replaceState(null, "", "marketing.html");
    setTimeout(function () { aviso((q.get("meta") === "ok" ? "✔ " : "✖ ") + (q.get("msg") || "")); }, 300);
  })();

  // ------------------------------------------------------------ início
  if (senha) carregar().catch(function (err) { sair(); aviso(err.message, "avisoLogin"); });
  else { $("telaLogin").hidden = false; }
  setInterval(function () { if (senha && !$("aba-posts").hidden && !document.querySelector("[data-confirmar]") && !document.querySelector(".mkt-card button:disabled")) carregar().catch(function () { /* ok */ }); }, 60000);
})();
