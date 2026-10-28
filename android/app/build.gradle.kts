import java.util.Properties
plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
val connectionDefaults = Properties().apply { rootProject.file("connection.properties").inputStream().use { load(it) } }
android {
 namespace = "in.raahi.mobility"
 compileSdk = 35
 defaultConfig {
  applicationId = "in.raahi.mobility"; minSdk = 26; targetSdk = 35; versionCode = 2; versionName = "0.1.1"
  buildConfigField("String", "API_BASE", quoted(providers.gradleProperty("API_BASE").getOrElse(connectionDefaults.getProperty("API_BASE", ""))))
  buildConfigField("String", "AUTH_URL", quoted(providers.gradleProperty("AUTH_URL").getOrElse(connectionDefaults.getProperty("AUTH_URL", ""))))
  buildConfigField("String", "ANON_KEY", quoted(providers.gradleProperty("ANON_KEY").getOrElse(connectionDefaults.getProperty("ANON_KEY", ""))))
 }
 flavorDimensions += "portal"
 productFlavors {
  create("customer") { dimension = "portal"; applicationIdSuffix = ".customer"; resValue("string", "app_name", "Raahi"); buildConfigField("String", "PORTAL", "\"customer\"") }
  create("captain") { dimension = "portal"; applicationIdSuffix = ".captain"; resValue("string", "app_name", "Raahi Captain"); buildConfigField("String", "PORTAL", "\"captain\"") }
 }
 buildFeatures { buildConfig = true }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
 buildTypes { getByName("release") { isMinifyEnabled = false } }
}
