/*
 * HERUPU Mobile — núcleo sem dependência de tela (roda no navegador e no Node para testes).
 *
 *  DetectorPalmas : mesma lógica do ativador do PC (detector_palmas.py), em JavaScript.
 *  fraseBate      : compara o que foi ouvido com a frase de ativação, tolerando erros.
 *  lerResposta    : interpreta a resposta do cérebro ({fala, acao}).
 */
(function (raiz) {
  "use strict";

  // ------------------------------------------------------------ palmas
  function DetectorPalmas(opcoes) {
    var c = Object.assign({
      taxaAmostragem: 48000,
      fatorSobreRuido: 6.0,   // palma precisa ser X vezes mais alta que o ruído
      energiaMinima: 0.08,    // volume mínimo (0 a 1)
      duracaoMaxPalma: 0.10,  // palma some em até 100 ms
      subidaMinima: 5.0,      // sobe de uma vez: X vezes o bloco anterior
      intervaloMin: 0.15,     // tempo mínimo entre as 2 palmas
      intervaloMax: 0.90,     // tempo máximo entre as 2 palmas
      esperaAposAtivar: 3.0,
      adaptacaoRuido: 0.02
    }, opcoes || {});
    this.c = c;
    this.ruido = 0.01;
    this.tempo = 0;
    this.emPico = false;
    this.inicioPico = 0;
    this.picoSubito = false;
    this.ultimaPalma = null;
    this.bloqueadoAte = 0;
    this.rmsAnterior = 0.01;
    this.ultimoRms = 0;
  }

  DetectorPalmas.prototype.processarBloco = function (bloco) {
    var c = this.c, n = bloco.length, soma = 0, i;
    for (i = 0; i < n; i++) soma += bloco[i] * bloco[i];
    var rms = n ? Math.sqrt(soma / n) : 0;
    this.ultimoRms = rms;
    var agora = this.tempo;
    this.tempo += n / c.taxaAmostragem;
    var anterior = this.rmsAnterior;
    this.rmsAnterior = rms;
    if (agora < this.bloqueadoAte) return false;

    var limiar = Math.max(c.energiaMinima, this.ruido * c.fatorSobreRuido);
    var ativou = false;
    if (rms >= limiar) {
      if (!this.emPico) {
        this.emPico = true;
        this.inicioPico = agora;
        this.picoSubito = rms >= Math.max(anterior, 1e-4) * c.subidaMinima;
      }
    } else {
      if (this.emPico) {
        this.emPico = false;
        var duracao = agora - this.inicioPico;
        if (duracao <= c.duracaoMaxPalma && this.picoSubito) ativou = this._registrar(this.inicioPico);
        else this.ultimaPalma = null; // sílaba ou pancada longa: zera a sequência
      }
      this.ruido += (rms - this.ruido) * c.adaptacaoRuido;
      if (this.ruido < 1e-4) this.ruido = 1e-4;
    }
    if (this.emPico && agora - this.inicioPico > c.duracaoMaxPalma) this.ultimaPalma = null;
    return ativou;
  };

  DetectorPalmas.prototype._registrar = function (instante) {
    var c = this.c;
    if (this.ultimaPalma !== null) {
      var intervalo = instante - this.ultimaPalma;
      if (intervalo >= c.intervaloMin && intervalo <= c.intervaloMax) {
        this.ultimaPalma = null;
        this.bloqueadoAte = instante + c.esperaAposAtivar;
        return true;
      }
    }
    this.ultimaPalma = instante;
    return false;
  };

  // ------------------------------------------------------------ frase de ativação
  function normalizar(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  // semelhança 0..1 (mesma ideia do difflib do Python, via distância de edição)
  function semelhanca(a, b) {
    if (a === b) return 1;
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return 1 - d[m][n] / Math.max(m, n, 1);
  }

  function fraseBate(ouvido, frases, tolerancia) {
    var o = normalizar(ouvido);
    if (!o) return false;
    var tol = tolerancia == null ? 0.75 : tolerancia;
    return (frases || []).some(function (f) {
      var alvo = normalizar(f);
      if (!alvo) return false;
      if (o.indexOf(alvo) >= 0) return true;
      var p = o.split(" "), k = alvo.split(" ").length;
      for (var i = 0; i <= Math.max(0, p.length - k); i++) {
        if (semelhanca(p.slice(i, i + k).join(" "), alvo) >= tol) return true;
      }
      return false;
    });
  }

  // ------------------------------------------------------------ resposta do cérebro
  var ACOES = ["ligar", "whatsapp", "mapa", "abrir_site", "pesquisar", "foto", "biblia", "devocional", "plano", "abrir_app", "alarme", "timer", "lanterna", "volume", "navegar", "tocar", "escrever", "rolar", "ler_tela", "dispositivo"];

  function lerResposta(texto) {
    var bruto = String(texto || "").trim();
    var json = bruto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    var ini = json.indexOf("{"), fim = json.lastIndexOf("}");
    if (ini >= 0 && fim > ini) {
      try {
        var o = JSON.parse(json.slice(ini, fim + 1));
        var acao = o.acao && ACOES.indexOf(o.acao.tipo) >= 0 ? o.acao : null;
        return { fala: String(o.fala || "").trim() || "Pronto.", acao: acao };
      } catch (e) { /* não era JSON: usa o texto puro */ }
    }
    return { fala: bruto || "Não entendi, pode repetir?", acao: null };
  }

  // monta o link de cada ação do celular
  function linkDaAcao(acao) {
    if (!acao) return null;
    var digitos = function (s) { return String(s || "").replace(/\D/g, ""); };
    switch (acao.tipo) {
      case "ligar": return digitos(acao.numero) ? "tel:" + digitos(acao.numero) : null;
      case "whatsapp": {
        var num = digitos(acao.numero);
        if (num && num.length <= 11) num = "55" + num; // DDD + número brasileiro
        return "https://wa.me/" + num + "?text=" + encodeURIComponent(acao.mensagem || "");
      }
      case "mapa": return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(acao.destino || "");
      case "pesquisar": return "https://www.google.com/search?q=" + encodeURIComponent(acao.termo || "");
      case "abrir_site": return /^https:\/\//.test(acao.url || "") ? acao.url : null;
      default: return null;
    }
  }

  var api = { DetectorPalmas: DetectorPalmas, fraseBate: fraseBate, normalizar: normalizar,
    lerResposta: lerResposta, linkDaAcao: linkDaAcao };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.HerupuNucleo = api;
})(typeof self !== "undefined" ? self : this);
