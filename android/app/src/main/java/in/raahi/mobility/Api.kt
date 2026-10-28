package `in`.raahi.mobility
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
object Api {
 var apiBase = BuildConfig.API_BASE
 var authUrl = BuildConfig.AUTH_URL
 var anonKey = BuildConfig.ANON_KEY
 var accessToken = ""
 var refreshToken = ""
 var expiresAt = 0L
 private fun request(url: String, method: String, payload: JSONObject?, auth: Boolean): String {
  require(url.startsWith("https://")) { "Configure HTTPS API_BASE and AUTH_URL before connecting." }
  val connection = URL(url).openConnection() as HttpURLConnection
  try {
   connection.connectTimeout = 10000; connection.readTimeout = 15000
   connection.requestMethod = method; connection.setRequestProperty("Content-Type", "application/json")
   if (auth) connection.setRequestProperty("Authorization", "Bearer $accessToken")
   else connection.setRequestProperty("apikey", anonKey)
   payload?.let { connection.doOutput = true; connection.outputStream.use { out -> out.write(it.toString().toByteArray()) } }
   val status = connection.responseCode
   val content = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
   if (status !in 200..299) { val error = runCatching { JSONObject(content) }.getOrDefault(JSONObject()); throw IllegalStateException(error.optString("message", error.optString("error_description", error.optString("error", "Request failed ($status)")))) }
   return content
  } finally { connection.disconnect() }
 }
 private fun remember(raw: String): JSONObject {
  val json = JSONObject(raw)
  if (json.has("access_token")) { accessToken = json.getString("access_token"); refreshToken = json.optString("refresh_token"); expiresAt = System.currentTimeMillis() / 1000 + json.optLong("expires_in", 3600) }
  return json
 }
 fun auth(email: String, password: String, name: String, signup: Boolean): JSONObject {
  val path = if (signup) "signup" else "token?grant_type=password"
  val payload = JSONObject().put("email", email).put("password", password)
  if (signup) payload.put("data", JSONObject().put("name", name).put("role", BuildConfig.PORTAL))
  return remember(request(authUrl.trimEnd('/') + "/auth/v1/" + path, "POST", payload, false))
 }
 fun call(path: String, payload: JSONObject? = null): String {
  if (System.currentTimeMillis()/1000 > expiresAt-60 && refreshToken.isNotEmpty()) remember(request(authUrl.trimEnd('/')+"/auth/v1/token?grant_type=refresh_token", "POST", JSONObject().put("refresh_token",refreshToken),false))
  return request(apiBase.trimEnd('/') + "/v1/" + path, if (payload == null) "GET" else "POST", payload, true)
 }
 fun logout() { accessToken="";refreshToken="";expiresAt=0 }
}
