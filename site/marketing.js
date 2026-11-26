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
      $("cfgContexto").value = j.config.contexto || "";
      $("cfgKit").value = j.config.kit || "";
      $("cfgAuto").checked = !!j.config.autoResponder;
      desenharPosts();
    });
  }

  // ------------------------------------------------------------ abas
  function abrirAba(nome) {
    document.querySelectorAll(".mkt-abas button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.aba === nome ? "true" : "false"); });
    ["posts", "novo", "comentarios", "relatorio", "ajustes"].forEach(function (a) { $("aba-" + a).hidden = a !== nome; });
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
          el("span", { classe: "selo selo-" + p.status, texto: NOMES_STATUS[p.status] || p.status }),
          el("span", { classe: "quando", texto: p.redes.join(" + ") + " · " + dataBonita(p.quando) })
        ])
      ]);
      if (p.midias.length) card.appendChild(el("div", { classe: "miniaturas" }, p.midias.map(function (m) { return el("img", { src: m.url, alt: "", loading: "lazy" }); })));
      card.appendChild(el("div", { classe: "texto", texto: p.legenda || "(sem legenda)" }));
      Object.keys(p.resultados || {}).forEach(function (rede) {
        var r = p.resultados[rede];
        var linha = el("p", { classe: "resultado " + (r.ok ? "ok" : "falha") }, [rede + ": " + (r.ok ? "publicado " : "falhou: " + r.erro + " ")]);
        if (r.ok && r.link) linha.appendChild(el("a", { href: r.link, target: "_blank", rel: "noopener", texto: "ver post" }));
        card.appendChild(linha);
      });
      if (p.problemas && p.problemas.length && p.status !== "publicado") card.appendChild(el("p", { classe: "problemas", texto: "Falta: " + p.problemas.join(", ") }));
      var acoes = el("div", { classe: "acoes" });
      if (p.status !== "publicado" && p.status !== "publicando") acoes.appendChild(el("button", { classe: "botao", type: "button", texto: "Editar", onclick: function () { editar(p); } }));
      if (p.status === "aprovado") acoes.appendChild(el("button", { classe: "botao", type: "button", texto: "Tirar da agenda", onclick: function (e) { acao(p, "desaprovar", e.target); } }));
      if (p.status === "erro") acoes.appendChild(el("button", { classe: "botao principal", type: "button", texto: "Tentar de novo", onclick: function (e) { publicarAgora(p, e.target); } }));
      acoes.appendChild(el("button", { classe: "botao", type: "button", texto: "Duplicar", onclick: function (e) { acao(p, "duplicar", e.target); } }));
      if (p.status !== "publicando") acoes.appendChild(el("button", { classe: "botao", type: "button", texto: "Excluir", onclick: function (e) {
        if (confirmar("Excluir este post da lista? (Se já foi publicado, continua nas redes.)")) acao(p, "excluir", e.target);
      } }));
      card.appendChild(acoes);
      lista.appendChild(card);
    });
  }
  // confirmação sem diálogo do navegador: segundo toque em até 4 s confirma
  var pendente = null;
  function confirmar(texto) {
    if (pendente && pendente.texto === texto && Date.now() - pendente.em < 4000) { pendente = null; return true; }
    pendente = { texto: texto, em: Date.now() };
    aviso(texto + " Toque de novo para confirmar.");
    return false;
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
    $("redeInstagram").checked = true; $("redeFacebook").checked = false;
    $("ideiaImagem").hidden = true;
    contar(); desenharMidias();
  }
  function editar(p) {
    estado.editando = p.id; estado.midias = p.midias.slice();
    $("tituloEditor").textContent = "EDITAR POST";
    $("tema").value = p.tema || ""; $("legenda").value = p.legenda || "";
    $("quando").value = paraCampoData(p.quando);
    $("redeInstagram").checked = p.redes.indexOf("instagram") >= 0;
    $("redeFacebook").checked = p.redes.indexOf("facebook") >= 0;
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
    return {
      id: estado.editando || undefined, redes: redes, tema: $("tema").value.trim(), legenda: $("legenda").value,
      midias: estado.midias, quando: $("quando").value ? new Date($("quando").value).toISOString() : null
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
    if (!confirmar("Publicar agora nas redes marcadas?")) return;
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
        el("div", {}, [el("strong", { texto: String(soma.alcance) }), "alcance 7 dias"]),
        el("div", {}, [el("strong", { texto: String(soma.curtidas) }), "curtidas"]),
        el("div", {}, [el("strong", { texto: String(soma.comentarios) }), "comentários"]),
        el("div", {}, [el("strong", { texto: String(j.midias.filter(function (m) { return Date.parse(m.timestamp) >= semana; }).length) }), "posts"])
      ]));
      j.midias.forEach(function (m) {
        var card = el("article", { classe: "mkt-card" }, [
          el("div", { classe: "topo-card" }, [el("span", { classe: "quando", texto: dataBonita(m.timestamp) + " · " + (m.media_type || "").toLowerCase() }),
            el("a", { href: m.permalink, target: "_blank", rel: "noopener", texto: "abrir" })]),
          el("div", { classe: "texto", texto: m.caption || "" }),
          el("div", { classe: "mkt-metricas" }, [
            el("div", {}, [el("strong", { texto: m.alcance == null ? "–" : String(m.alcance) }), "alcance"]),
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
    api("config", { contexto: $("cfgContexto").value, kit: $("cfgKit").value, autoResponder: $("cfgAuto").checked })
      .then(function () { aviso("Ajustes salvos."); }).catch(function (err) { aviso(err.message); }).then(volta);
  });

  // ------------------------------------------------------------ início
  if (senha) carregar().catch(function (err) { sair(); aviso(err.message, "avisoLogin"); });
  else { $("telaLogin").hidden = false; }
  setInterval(function () { if (senha && !$("aba-posts").hidden) carregar().catch(function () { /* ok */ }); }, 60000);
})();
