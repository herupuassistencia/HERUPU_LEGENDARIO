package br.com.herupu.legendario

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.*
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * HERUPU LEGENDÁRIO para Android.
 * Abre o assistente do servidor e entrega ao site a ponte "HerupuNativo" (o mesmo nome que o site já usa),
 * para ele controlar o celular: apps, música, alarme, lanterna, volume e a tela (pela Acessibilidade).
 */
class MainActivity : Activity() {
  companion object {
    const val URL = "https://ia.herupusistemas.com.br/"
    var atual: MainActivity? = null
    /** Manda um evento para o site (ex.: "acordar" quando ouve a palavra ou tocam na esfera). */
    fun evento(nome: String, dados: JSONObject = JSONObject()) {
      val a = atual ?: return
      a.runOnUiThread { a.web.evaluateJavascript("window.__herupuEvento&&window.__herupuEvento(${JSONObject.quote(nome)},$dados)", null) }
    }
  }

  lateinit var web: WebView
  lateinit var ponte: Ponte
  private var pedidoPermissao: ((Boolean) -> Unit)? = null

  // ponte em JavaScript: imita o window.Capacitor que o site espera
  private val SHIM = """
    (function(){if(window.__herupuPonte)return;window.__herupuPonte=1;var n=0,p={},ouv={};
    window.__herupuRetorno=function(id,ok,d){var x=p[id];if(!x)return;delete p[id];ok?x.r(d):x.j(new Error((d&&d.mensagem)||'erro'));};
    window.__herupuEvento=function(nome,d){(ouv[nome]||[]).forEach(function(f){try{f(d)}catch(e){}})};
    var plug=new Proxy({},{get:function(_,m){
      if(m==='addListener')return function(ev,f){(ouv[ev]=ouv[ev]||[]).push(f);return Promise.resolve({remove:function(){}})};
      if(m==='then'||typeof m!=='string')return undefined;
      return function(a){return new Promise(function(r,j){var id=++n;p[id]={r:r,j:j};HerupuAndroid.chamar(id,m,JSON.stringify(a||{}))})}}});
    window.Capacitor={isNativePlatform:function(){return true},getPlatform:function(){return 'android'},registerPlugin:function(){return plug},Plugins:{HerupuNativo:plug}};})();
  """.trimIndent()

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(b: Bundle?) {
    super.onCreate(b)
    atual = this
    web = WebView(this)
    setContentView(web)
    ponte = Ponte(this)
    with(web.settings) {
      javaScriptEnabled = true; domStorageEnabled = true; databaseEnabled = true
      mediaPlaybackRequiresUserGesture = false
      userAgentString = "$userAgentString HerupuAndroid/2.0"
    }
    web.addJavascriptInterface(ponte, "HerupuAndroid")
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
      WebViewCompat.addDocumentStartJavaScript(web, SHIM, setOf("https://ia.herupusistemas.com.br"))
    web.webViewClient = object : WebViewClient() {
      override fun onPageStarted(v: WebView, url: String?, f: android.graphics.Bitmap?) { v.evaluateJavascript(SHIM, null) }
      override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
        val u = r.url
        if (u.host == "ia.herupusistemas.com.br") return false
        // links externos (WhatsApp, mapas, telefone, sites) abrem no app certo do celular
        return try { startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true } catch (e: Exception) { false }
      }
    }
    web.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(req: PermissionRequest) {
        // microfone/câmera para a conversa ao vivo e a câmera do site
        precisa(arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)) { runOnUiThread { req.grant(req.resources) } }
      }
    }
    if (Build.VERSION.SDK_INT >= 33) precisa(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) {}
    web.loadUrl(URL)
  }

  fun precisa(perms: Array<String>, depois: (Boolean) -> Unit) {
    val faltam = perms.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
    if (faltam.isEmpty()) { depois(true); return }
    pedidoPermissao = depois
    requestPermissions(faltam.toTypedArray(), 7)
  }
  override fun onRequestPermissionsResult(c: Int, p: Array<out String>, r: IntArray) {
    val f = pedidoPermissao; pedidoPermissao = null
    f?.invoke(r.isNotEmpty() && r.all { it == PackageManager.PERMISSION_GRANTED })
  }

  fun responder(id: Int, ok: Boolean, dados: JSONObject) = runOnUiThread {
    web.evaluateJavascript("window.__herupuRetorno&&window.__herupuRetorno($id,$ok,$dados)", null)
  }

  override fun onResume() { super.onResume(); atual = this; evento("resume") }
  // não pausa o WebView ao sair: a conversa continua com o app em segundo plano
  override fun onBackPressed() { if (web.canGoBack()) web.goBack() else moveTaskToBack(true) }
  override fun onNewIntent(i: Intent) { super.onNewIntent(i); if (i.getBooleanExtra("acordar", false)) evento("acordar", JSONObject().put("motivo", "esfera")) }
  override fun onDestroy() { if (atual == this) atual = null; super.onDestroy() }

  fun abrirConfig(acao: String, pacote: Boolean = true) {
    val i = Intent(acao); if (pacote) i.data = Uri.parse("package:$packageName")
    try { startActivity(i) } catch (e: Exception) { startActivity(Intent(acao)) }
  }
}
