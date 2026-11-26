package br.com.herupu.legendario

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.AlarmClock
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer

/** Os comandos que o site chama com nativo("nome", {...}). Cada um responde um JSON. */
class Ponte(private val act: MainActivity) {
  private val main = Handler(Looper.getMainLooper())

  @JavascriptInterface
  fun chamar(id: Int, metodo: String, args: String) {
    val a = try { JSONObject(args) } catch (e: Exception) { JSONObject() }
    main.post {
      try {
        executar(metodo, a) { r -> act.responder(id, true, r) }
      } catch (e: Exception) {
        act.responder(id, false, JSONObject().put("mensagem", e.message ?: "erro"))
      }
    }
  }

  private fun ok(msg: String = "") = JSONObject().put("ok", true).put("mensagem", msg)
  private fun falha(msg: String) = JSONObject().put("ok", false).put("mensagem", msg)

  private fun executar(m: String, a: JSONObject, fim: (JSONObject) -> Unit) {
    when (m) {
      "estado" -> fim(ok())
      "requestPermissions" -> act.precisa(arrayOf(Manifest.permission.RECORD_AUDIO)) { g -> fim(JSONObject().put("microfone", if (g) "granted" else "denied")) }
      "ouvir" -> act.precisa(arrayOf(Manifest.permission.RECORD_AUDIO)) { g -> if (!g) fim(JSONObject().put("texto", "")) else ouvir(fim) }
      "vigiaPalavra" -> {
        ServicoFundo.frases = (0 until (a.optJSONArray("frases")?.length() ?: 0)).map { a.getJSONArray("frases").getString(it) }.ifEmpty { listOf("legendário") }
        ServicoFundo.vigiar = a.optBoolean("ligar")
        if (ServicoFundo.vigiar) act.precisa(arrayOf(Manifest.permission.RECORD_AUDIO)) { g -> if (g) ServicoFundo.iniciar(act); fim(ok()) }
        else { ServicoFundo.atualizar(act); fim(ok()) }
      }
      "segundoPlano" -> {
        val esfera = a.optBoolean("esfera")
        if (esfera && !Settings.canDrawOverlays(act)) {
          act.abrirConfig(Settings.ACTION_MANAGE_OVERLAY_PERMISSION); fim(JSONObject().put("pedirPermissao", "sobreposicao")); return
        }
        ServicoFundo.esfera = esfera
        act.precisa(arrayOf(Manifest.permission.RECORD_AUDIO)) { g ->
          if (!g) { fim(JSONObject().put("pedirPermissao", "microfone")); return@precisa }
          ServicoFundo.iniciar(act); pedirSemEconomiaBateria(); fim(ok())
        }
      }
      "abrirApp" -> fim(abrirApp(a.optString("nome")))
      "tocarMusica" -> fim(tocarMusica(a.optString("busca"), a.optString("app")))
      "alarme" -> {
        act.startActivity(Intent(AlarmClock.ACTION_SET_ALARM).putExtra(AlarmClock.EXTRA_HOUR, a.optInt("hora")).putExtra(AlarmClock.EXTRA_MINUTES, a.optInt("minuto"))
          .putExtra(AlarmClock.EXTRA_MESSAGE, a.optString("mensagem", "HERUPU")).putExtra(AlarmClock.EXTRA_SKIP_UI, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        fim(ok("Alarme marcado para %02d:%02d.".format(a.optInt("hora"), a.optInt("minuto"))))
      }
      "timer" -> {
        act.startActivity(Intent(AlarmClock.ACTION_SET_TIMER).putExtra(AlarmClock.EXTRA_LENGTH, a.optInt("segundos", 60))
          .putExtra(AlarmClock.EXTRA_MESSAGE, a.optString("mensagem", "HERUPU")).putExtra(AlarmClock.EXTRA_SKIP_UI, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        fim(ok("Timer iniciado."))
      }
      "lanterna" -> {
        val cm = act.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val id = cm.cameraIdList.firstOrNull() ?: return fim(falha("Sem lanterna."))
        val ligar = a.optBoolean("ligar", true); cm.setTorchMode(id, ligar)
        fim(ok().put("ligada", ligar))
      }
      "volume" -> {
        val am = act.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val s = AudioManager.STREAM_MUSIC
        when (norm(a.optString("acao"))) {
          "aumentar", "subir", "mais" -> repeat(3) { am.adjustStreamVolume(s, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI) }
          "diminuir", "baixar", "menos" -> repeat(3) { am.adjustStreamVolume(s, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI) }
          "mudo", "silenciar" -> am.adjustStreamVolume(s, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI)
          "maximo" -> am.setStreamVolume(s, am.getStreamMaxVolume(s), AudioManager.FLAG_SHOW_UI)
          else -> if (a.has("nivel")) am.setStreamVolume(s, (am.getStreamMaxVolume(s) * a.optDouble("nivel", 50.0) / 100).toInt(), AudioManager.FLAG_SHOW_UI)
        }
        fim(ok("Volume ajustado."))
      }
      "navegar", "tocarNaTela", "escreverNaTela", "rolarTela", "lerTela" -> {
        val ac = Acessibilidade.atual ?: return fim(falha("Ligue o controle do celular: Ajustes do HERUPU → Ligar controle do celular."))
        fim(when (m) {
          "navegar" -> ac.navegar(a.optString("acao"))
          "tocarNaTela" -> ac.tocar(a.optString("nome"))
          "escreverNaTela" -> ac.escrever(a.optString("texto"))
          "rolarTela" -> ac.rolar(a.optString("direcao", "baixo"))
          else -> ac.lerTela()
        })
      }
      "statusControle" -> fim(JSONObject().put("ligado", Acessibilidade.atual != null))
      "abrirControle" -> { act.abrirConfig(Settings.ACTION_ACCESSIBILITY_SETTINGS, false); fim(ok()) }
      "homeAssistant" -> Thread { fim(homeAssistant(a)) }.start()
      else -> fim(falha("Recurso \"$m\" ainda não existe no app."))
    }
  }

  // ---------------------------------------------------------------- voz: ouve uma frase
  private var rec: SpeechRecognizer? = null
  private fun ouvir(fim: (JSONObject) -> Unit) {
    ServicoFundo.pausarVigia(true)
    rec?.destroy()
    val r = SpeechRecognizer.createSpeechRecognizer(act); rec = r
    var respondeu = false
    fun acabar(t: String) { if (respondeu) return; respondeu = true; r.destroy(); rec = null; ServicoFundo.pausarVigia(false); fim(JSONObject().put("texto", t)) }
    r.setRecognitionListener(object : RecognitionListener {
      override fun onResults(b: android.os.Bundle) = acabar(b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: "")
      override fun onError(e: Int) = acabar("")
      override fun onReadyForSpeech(p: android.os.Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(v: Float) {}
      override fun onBufferReceived(b: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onPartialResults(b: android.os.Bundle?) {}
      override fun onEvent(t: Int, b: android.os.Bundle?) {}
    })
    r.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR").putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
      .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L))
  }

  // ---------------------------------------------------------------- apps
  private fun norm(t: String) = Normalizer.normalize(t.lowercase().trim(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
  private val ATALHOS = mapOf(
    "navegador" to "com.android.chrome", "internet" to "com.android.chrome", "chrome" to "com.android.chrome",
    "tiktok" to "com.zhiliaoapp.musically", "instagram" to "com.instagram.android", "insta" to "com.instagram.android",
    "whatsapp" to "com.whatsapp", "zap" to "com.whatsapp", "whatsapp business" to "com.whatsapp.w4b",
    "youtube" to "com.google.android.youtube", "youtube music" to "com.google.android.apps.youtube.music",
    "spotify" to "com.spotify.music", "facebook" to "com.facebook.katana", "gmail" to "com.google.android.gm",
    "maps" to "com.google.android.apps.maps", "mapa" to "com.google.android.apps.maps", "termius" to "com.server.auditor.ssh.client")
  private val PROIBIDOS = Regex("banco|bank|nubank|itau|bradesco|caixa|santander|inter|picpay|mercado pago|c6|sicoob|sicredi|carteira|wallet")

  fun abrirApp(nomePedido: String): JSONObject {
    val n = norm(nomePedido).removePrefix("o ").removePrefix("a ")
    val pm = act.packageManager
    val lista = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
    val pacote = ATALHOS[n]?.takeIf { p -> lista.any { it.activityInfo.packageName == p } }
      ?: lista.firstOrNull { norm(it.loadLabel(pm).toString()) == n }?.activityInfo?.packageName
      ?: lista.firstOrNull { norm(it.loadLabel(pm).toString()).contains(n) || n.contains(norm(it.loadLabel(pm).toString())) }?.activityInfo?.packageName
    if (pacote == null) {
      if (n.contains("navegador") || n.contains("internet")) { act.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return ok("Abri o navegador.").put("app", "navegador") }
      return falha("Não achei o app \"$nomePedido\" no celular.")
    }
    val rotulo = pm.getApplicationLabel(pm.getApplicationInfo(pacote, 0)).toString()
    if (PROIBIDOS.containsMatchIn(norm(rotulo))) return falha("Apps de banco e pagamento você abre pessoalmente, com a sua biometria.")
    act.startActivity(pm.getLaunchIntentForPackage(pacote)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return ok("Abri o $rotulo.").put("app", rotulo)
  }

  private fun instalado(p: String) = try { act.packageManager.getPackageInfo(p, 0); true } catch (e: PackageManager.NameNotFoundException) { false }
  fun tocarMusica(busca: String, app: String): JSONObject {
    val q = Uri.encode(busca)
    val querYoutube = norm(app).contains("youtube") || !instalado("com.spotify.music")
    val i = if (!querYoutube) Intent(Intent.ACTION_VIEW, Uri.parse("spotify:search:$q")).setPackage("com.spotify.music")
      else Intent(Intent.ACTION_VIEW, Uri.parse("https://music.youtube.com/search?q=$q")).apply { if (instalado("com.google.android.apps.youtube.music")) setPackage("com.google.android.apps.youtube.music") }
    act.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    // com a Acessibilidade ligada, toca o primeiro resultado sozinho
    Acessibilidade.atual?.let { ac -> main.postDelayed({ ac.tocarPrimeiroResultado(busca) }, 3500) }
    return ok("Abrindo \"$busca\" no ${if (querYoutube) "YouTube Music" else "Spotify"}.")
  }

  private fun pedirSemEconomiaBateria() {
    val pm = act.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
    if (!pm.isIgnoringBatteryOptimizations(act.packageName))
      try { act.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${act.packageName}"))) } catch (e: Exception) {}
  }

  private fun homeAssistant(a: JSONObject): JSONObject = try {
    val (dom, srv) = a.optString("servico").split(".", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
    val c = URL(a.optString("url").trimEnd('/') + "/api/services/$dom/$srv").openConnection() as HttpURLConnection
    c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000
    c.setRequestProperty("Authorization", "Bearer " + a.optString("token")); c.setRequestProperty("Content-Type", "application/json")
    c.outputStream.write(JSONObject().apply { if (a.optString("alvo").isNotEmpty()) put("entity_id", a.optString("alvo")) }.toString().toByteArray())
    if (c.responseCode in 200..299) ok("Feito.") else falha("A casa respondeu ${c.responseCode}.")
  } catch (e: Exception) { falha("Não consegui falar com o Home Assistant.") }
}
