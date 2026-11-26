package br.com.herupu.legendario

import android.annotation.SuppressLint
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioManager
import android.os.*
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.*
import android.widget.ImageView
import org.json.JSONObject
import java.text.Normalizer

/**
 * Mantém o LEGENDÁRIO vivo com o app minimizado: ouve a palavra de chamada ("Legendário")
 * e mostra a esfera flutuante por cima dos outros apps. A conversa continua em segundo plano.
 */
class ServicoFundo : Service() {
  companion object {
    @Volatile var vigiar = false
    @Volatile var esfera = false
    @Volatile var frases: List<String> = listOf("legendário")
    private var inst: ServicoFundo? = null
    private var pausado = false
    fun iniciar(c: Context) {
      val i = Intent(c, ServicoFundo::class.java)
      if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
    }
    fun atualizar(c: Context) { val s = inst; if (s != null) s.aplicar() else if (vigiar || esfera) iniciar(c) }
    /** Enquanto o app está ouvindo um pedido, a vigia da palavra para (um microfone por vez). */
    fun pausarVigia(p: Boolean) { pausado = p; inst?.let { s -> s.main.post { if (p) s.pararEscuta() else s.aplicar() } } }
  }

  val main = Handler(Looper.getMainLooper())
  private var rec: SpeechRecognizer? = null
  private var bolha: View? = null
  private var lock: PowerManager.WakeLock? = null

  override fun onBind(i: Intent?): IBinder? = null

  override fun onStartCommand(i: Intent?, f: Int, id: Int): Int {
    inst = this
    val canal = "herupu"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(canal, "HERUPU em segundo plano", NotificationManager.IMPORTANCE_LOW))
    val abrir = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).putExtra("acordar", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val n = Notification.Builder(this, canal).setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("HERUPU LEGENDÁRIO").setContentText("Pronto para te ouvir. Diga \"${frases.first()}\".")
      .setContentIntent(abrir).setOngoing(true).build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) else startForeground(1, n)
    if (lock == null) lock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "herupu:fundo").apply { acquire() }
    aplicar()
    return START_STICKY
  }

  fun aplicar() = main.post {
    if (esfera && Settings.canDrawOverlays(this)) mostrarBolha() else tirarBolha()
    if (vigiar && !pausado) escutar() else pararEscuta()
    if (!vigiar && !esfera) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
  }

  // ------------------------------------------------------------ palavra de chamada
  private fun norm(t: String) = Normalizer.normalize(t.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")
  private fun silenciarBipe(sim: Boolean) {
    val am = getSystemService(AUDIO_SERVICE) as AudioManager
    val d = if (sim) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE
    for (s in listOf(AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_SYSTEM)) try { am.adjustStreamVolume(s, d, 0) } catch (e: Exception) {}
  }
  private fun escutar() {
    if (rec != null) return
    silenciarBipe(true)
    val r = SpeechRecognizer.createSpeechRecognizer(this); rec = r
    r.setRecognitionListener(object : RecognitionListener {
      fun verificar(b: Bundle?) : Boolean {
        val t = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.joinToString(" ")?.let { norm(it) } ?: return false
        if (frases.any { t.contains(norm(it).trim()) } || t.contains("lendario")) {
          pararEscuta()
          MainActivity.evento("acordar", JSONObject().put("motivo", "voz"))
          return true
        }
        return false
      }
      override fun onPartialResults(b: Bundle?) { verificar(b) }
      override fun onResults(b: Bundle?) { if (!verificar(b)) reiniciar() }
      override fun onError(e: Int) { reiniciar() }
      override fun onReadyForSpeech(p: Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(v: Float) {}
      override fun onBufferReceived(b: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onEvent(t: Int, b: Bundle?) {}
    })
    r.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
      .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM))
  }
  private fun reiniciar() { rec?.destroy(); rec = null; if (vigiar && !pausado) main.postDelayed({ escutar() }, 400) }
  fun pararEscuta() { rec?.destroy(); rec = null; silenciarBipe(false) }

  // ------------------------------------------------------------ esfera flutuante
  @SuppressLint("ClickableViewAccessibility")
  private fun mostrarBolha() {
    if (bolha != null) return
    val wm = getSystemService(WINDOW_SERVICE) as WindowManager
    val tam = (64 * resources.displayMetrics.density).toInt()
    val p = WindowManager.LayoutParams(tam, tam, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.START; x = 20; y = 400 }
    val v = ImageView(this).apply { setImageResource(R.drawable.esfera); elevation = 12f }
    var ix = 0; var iy = 0; var tx = 0f; var ty = 0f; var moveu = false; var inicio = 0L
    v.setOnTouchListener { _, e ->
      when (e.action) {
        MotionEvent.ACTION_DOWN -> { ix = p.x; iy = p.y; tx = e.rawX; ty = e.rawY; moveu = false; inicio = SystemClock.uptimeMillis() }
        MotionEvent.ACTION_MOVE -> { val dx = e.rawX - tx; val dy = e.rawY - ty; if (Math.abs(dx) + Math.abs(dy) > 12) moveu = true; p.x = ix + dx.toInt(); p.y = iy + dy.toInt(); wm.updateViewLayout(v, p) }
        MotionEvent.ACTION_UP -> if (!moveu) {
          if (SystemClock.uptimeMillis() - inicio > 600) // toque longo: abre o app
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          else MainActivity.evento("acordar", JSONObject().put("motivo", "esfera")) // toque: conversa sem sair do app atual
        }
      }
      true
    }
    wm.addView(v, p); bolha = v
  }
  private fun tirarBolha() { bolha?.let { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(it) }; bolha = null }

  override fun onDestroy() { pararEscuta(); tirarBolha(); lock?.release(); lock = null; inst = null; super.onDestroy() }
}
