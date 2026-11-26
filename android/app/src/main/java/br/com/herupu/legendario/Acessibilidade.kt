package br.com.herupu.legendario

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import java.text.Normalizer

/**
 * Controle do celular por voz: tocar, escrever, rolar, voltar e ler a tela.
 * Regra de segurança: nunca toca em pagamento, transferência ou apagar, e não age dentro de apps de banco.
 */
class Acessibilidade : AccessibilityService() {
  companion object { @Volatile var atual: Acessibilidade? = null }

  override fun onServiceConnected() { atual = this }
  override fun onAccessibilityEvent(e: AccessibilityEvent?) {}
  override fun onInterrupt() {}
  override fun onDestroy() { if (atual == this) atual = null; super.onDestroy() }

  private fun ok(m: String) = JSONObject().put("ok", true).put("mensagem", m)
  private fun falha(m: String) = JSONObject().put("ok", false).put("mensagem", m)
  private fun norm(t: CharSequence?) = Normalizer.normalize((t ?: "").toString().lowercase().trim(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
  private val PERIGOSO = Regex("pagar|pagamento|pix|transfer|comprar|finalizar compra|confirmar compra|excluir|apagar|deletar|desinstalar|remover conta|sacar|emprestimo")
  private val APP_PROTEGIDO = Regex("bank|banco|nubank|itau|bradesco|caixa|santander|inter|picpay|mercadopago|c6bank|sicoob|sicredi|wallet|paypal")

  private fun raiz(): AccessibilityNodeInfo? = rootInActiveWindow
  private fun protegido(): Boolean = APP_PROTEGIDO.containsMatchIn((raiz()?.packageName ?: "").toString().lowercase())

  private fun todos(n: AccessibilityNodeInfo?, saida: MutableList<AccessibilityNodeInfo> = mutableListOf()): MutableList<AccessibilityNodeInfo> {
    if (n == null) return saida
    saida.add(n)
    for (i in 0 until n.childCount) todos(n.getChild(i), saida)
    return saida
  }
  private fun rotulo(n: AccessibilityNodeInfo) = norm(n.text ?: n.contentDescription ?: n.hintText ?: "")
  private fun clicar(n: AccessibilityNodeInfo): Boolean {
    var x: AccessibilityNodeInfo? = n
    while (x != null && !x.isClickable) x = x.parent
    return x?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
  }

  fun navegar(acao: String): JSONObject {
    val a = norm(acao)
    val g = when {
      a.contains("volt") -> GLOBAL_ACTION_BACK
      a.contains("inicio") || a.contains("home") -> GLOBAL_ACTION_HOME
      a.contains("recent") -> GLOBAL_ACTION_RECENTS
      a.contains("notifica") -> GLOBAL_ACTION_NOTIFICATIONS
      a.contains("rapid") -> GLOBAL_ACTION_QUICK_SETTINGS
      a.contains("print") || a.contains("captura") -> GLOBAL_ACTION_TAKE_SCREENSHOT
      a.contains("bloque") -> GLOBAL_ACTION_LOCK_SCREEN
      else -> return falha("Não entendi para onde navegar.")
    }
    performGlobalAction(g); return ok("Feito.")
  }

  fun tocar(nome: String): JSONObject {
    if (protegido()) return falha("Em app de banco ou pagamento eu não toco. Faça você mesmo, com a sua biometria.")
    val alvo = norm(nome)
    if (PERIGOSO.containsMatchIn(alvo)) return falha("Por segurança, botões de pagamento, transferência ou apagar você toca pessoalmente.")
    val lista = todos(raiz()).filter { rotulo(it).isNotEmpty() && it.isVisibleToUser }
    val n = lista.firstOrNull { rotulo(it) == alvo } ?: lista.firstOrNull { rotulo(it).startsWith(alvo) } ?: lista.firstOrNull { rotulo(it).contains(alvo) }
      ?: return falha("Não encontrei \"$nome\" na tela.")
    if (PERIGOSO.containsMatchIn(rotulo(n))) return falha("Esse botão parece de pagamento ou de apagar. Toque você mesmo.")
    return if (clicar(n)) ok("Toquei em \"${n.text ?: n.contentDescription}\".") else falha("Achei \"$nome\", mas não deu para tocar.")
  }

  fun escrever(texto: String): JSONObject {
    if (protegido()) return falha("Em app de banco eu não escrevo.")
    val campo = todos(raiz()).firstOrNull { it.isFocused && it.isEditable } ?: todos(raiz()).firstOrNull { it.isEditable && it.isVisibleToUser }
      ?: return falha("Não achei um campo de texto na tela.")
    if (campo.isPassword) return falha("Senha você digita pessoalmente.")
    campo.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
    val ok = campo.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, texto) })
    return if (ok) ok("Escrevi.") else falha("O campo não aceitou o texto.")
  }

  fun rolar(direcao: String): JSONObject {
    val n = todos(raiz()).filter { it.isScrollable && it.isVisibleToUser }.maxByOrNull { val r = android.graphics.Rect(); it.getBoundsInScreen(r); r.width() * r.height() }
      ?: return falha("Nada para rolar nesta tela.")
    val acao = if (norm(direcao).contains("cima")) AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD else AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
    return if (n.performAction(acao)) ok("Rolei.") else falha("Não consegui rolar.")
  }

  fun lerTela(): JSONObject {
    if (protegido()) return falha("Não leio a tela de apps de banco.")
    val textos = todos(raiz()).filter { it.isVisibleToUser }.mapNotNull { (it.text ?: it.contentDescription)?.toString()?.trim() }
      .filter { it.isNotEmpty() }.distinct().take(60)
    return if (textos.isEmpty()) falha("Não consegui ler esta tela.") else ok("").put("texto", textos.joinToString(". "))
  }

  /** Depois de buscar a música, toca no primeiro resultado que bate com o nome. */
  fun tocarPrimeiroResultado(busca: String) {
    val alvo = norm(busca).split(" ").firstOrNull() ?: return
    val lista = todos(raiz()).filter { it.isVisibleToUser && rotulo(it).contains(alvo) && !it.isEditable }
    lista.drop(1).firstOrNull()?.let { clicar(it) } ?: lista.firstOrNull()?.let { clicar(it) }
  }
}
