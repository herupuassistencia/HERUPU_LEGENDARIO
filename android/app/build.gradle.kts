plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
  namespace = "br.com.herupu.legendario"
  compileSdk = 35
  defaultConfig {
    applicationId = "br.com.herupu.legendario"
    minSdk = 26; targetSdk = 35
    versionCode = 20; versionName = "2.0"
  }
  signingConfigs {
    create("herupu") {
      storeFile = file("../assinatura/herupu.jks"); storePassword = "herupu-legendario"
      keyAlias = "herupu"; keyPassword = "herupu-legendario"
    }
  }
  buildTypes { release { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("herupu") } }
  lint { checkReleaseBuilds = false; abortOnError = false }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
}
dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.webkit:webkit:1.12.1")
}
