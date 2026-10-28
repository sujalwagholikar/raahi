package `in`.raahi.mobility
import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.location.LocationManager
import android.net.Uri
import android.view.View
import android.widget.*
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID
import java.util.concurrent.Executors
class MainActivity : Activity() {
 private lateinit var layout: LinearLayout
 private val worker = Executors.newSingleThreadExecutor()
 private val handler = Handler(Looper.getMainLooper())
 private var busy=false
 private var profile=JSONObject()
 private var rides=JSONArray()
 private var userId=""
 private var alive=false
 private var atHome=false
 private var requestKey=UUID.randomUUID().toString()
 private val captain get() = BuildConfig.PORTAL=="captain"
 private val green=Color.rgb(29,102,80)
 private val refresh=object:Runnable { override fun run() { if(alive && atHome && Api.accessToken.isNotEmpty() && !busy) load();handler.postDelayed(this,7000) } }
 override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState);val settings=getSharedPreferences("connection",MODE_PRIVATE);Api.apiBase=settings.getString("api",BuildConfig.API_BASE)?:"";Api.authUrl=settings.getString("auth",BuildConfig.AUTH_URL)?:"";Api.anonKey=settings.getString("key",BuildConfig.ANON_KEY)?:"";window.statusBarColor=green;window.navigationBarColor=Color.rgb(245,247,243);login() }
 override fun onResume(){super.onResume();alive=true;handler.postDelayed(refresh,7000)}
 override fun onPause(){super.onPause();alive=false;handler.removeCallbacks(refresh)}
 override fun onDestroy(){super.onDestroy();worker.shutdownNow()}
 private fun screen(title:String) {
  atHome=false
  val scroll=ScrollView(this);scroll.setBackgroundColor(Color.rgb(245,247,243));layout=LinearLayout(this);layout.orientation=LinearLayout.VERTICAL;layout.setPadding(28,48,28,30);scroll.addView(layout);setContentView(scroll)
  text("↗ raahi"+(if(captain) " captain" else ""),32,true);text(title,23,true)
 }
 private fun text(value:String,size:Int=14,bold:Boolean=false){val view=TextView(this);view.text=value;view.textSize=size.toFloat();view.setTextColor(Color.rgb(21,36,31));view.setPadding(0,14,0,14);if(bold)view.setTypeface(null,Typeface.BOLD);layout.addView(view)}
 private fun input(hint:String,password:Boolean=false):EditText { val v=EditText(this);v.hint=hint;v.setSingleLine();if(password)v.inputType=129;layout.addView(v);return v }
 private fun button(label:String, action:()->Unit){val b=Button(this);b.text=label;b.isAllCaps=false;b.setTextColor(Color.WHITE);b.backgroundTintList=android.content.res.ColorStateList.valueOf(green);layout.addView(b);b.setOnClickListener{if(!busy)action()}}
 private fun notify(message:String){Toast.makeText(this,message,Toast.LENGTH_LONG).show()}
 private fun task(work:()->Unit){if(busy)return;busy=true;worker.execute{try{work()}catch(e:Exception){runOnUiThread{notify(e.message?:"Connection failed")}}finally{runOnUiThread{busy=false}}}}
 private fun login(){screen("Your city, a little closer.");text(if(captain)"Accept rides and manage your day." else "Simple rides. Fair fares.");text("Supabase configured · add your Go API URL in Configure connection",12)
  val email=input("Email");email.inputType=33;val password=input("Password (at least 8 characters)",true);val name=input("Full name (new account)")
  fun submit(signup:Boolean){if(password.text.length<8){notify("Use at least 8 characters");return};task{val response=Api.auth(email.text.toString().trim(),password.text.toString(),name.text.toString(),signup);if(Api.accessToken.isEmpty())runOnUiThread{notify("Confirm your email, then sign in.")}else{userId=response.getJSONObject("user").getString("id");fetch();runOnUiThread{home()}}}}
  button("Configure connection"){configure()};button("Sign in"){submit(false)};button("Create "+(if(captain)"captain" else "customer")+" account"){submit(true)}
 }
 private fun configure(){screen("Connect your ecosystem");text("Enter your deployed HTTPS Go API and public Supabase connection settings. Never use a service-role key.",12)
 val api=input("HTTPS Go API origin");api.setText(Api.apiBase)
 val auth=input("Supabase HTTPS project URL");auth.setText(Api.authUrl)
 val key=input("Public Supabase anon key");key.setText(Api.anonKey)
 button("Save connection"){val a=api.text.toString().trim().trimEnd('/');val b=auth.text.toString().trim().trimEnd('/');val k=key.text.toString().trim();if(!a.startsWith("https://")||!b.startsWith("https://")||k.isEmpty()){notify("Use HTTPS URLs and a public anon key")}else{Api.logout();Api.apiBase=a;Api.authUrl=b;Api.anonKey=k;getSharedPreferences("connection",MODE_PRIVATE).edit().putString("api",a).putString("auth",b).putString("key",k).apply();login()}}
 button("Back"){login()}
 }
 private fun fetch(){val profiles=JSONArray(Api.call("profile"));profile=(0 until profiles.length()).map{profiles.getJSONObject(it)}.find{it.optString("id")==userId}?:throw Exception("Profile not found")
  if(profile.optString("role")!=BuildConfig.PORTAL)throw Exception("Use your matching account portal")
  rides=JSONArray(Api.call("rides"))
 }
 private fun load(){task{fetch();runOnUiThread{home()}}}
 private fun mutate(path:String,payload:JSONObject){task{Api.call(path,payload);fetch();runOnUiThread{home()}}}
 private fun home(){if(isFinishing)return;screen("Hello, "+profile.optString("name","traveller"));text("Connected workspace · cash rides",12)
  button("Open Pune map"){startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://www.openstreetmap.org/#map=13/18.5300/73.8500")))}
  if(captain){text(if(profile.optBoolean("approved"))"Account approved" else "Awaiting operations approval",14,true);button(if(profile.optBoolean("online"))"Go offline" else "Go online"){mutate("availability",JSONObject().put("p_online",!profile.optBoolean("online")))};button("Share current location once"){shareLocation()}}
  else button("Book a ride"){booking()}
  button("Refresh rides"){load()}
  text(if(captain)"Your ride requests" else "Your journeys",20,true)
  if(rides.length()==0)text("No journeys yet.")
  for(i in 0 until rides.length()) { val r=rides.getJSONObject(i);if(!captain&&r.optString("customer_id")!=userId)continue
   text(r.optString("pickup")+" → "+r.optString("destination"),16,true);text("₹"+r.optInt("fare")+" · "+r.optString("mode")+" · "+r.optString("status"))
   val id=r.getString("id");val status=r.getString("status");val assigned=r.optString("captain_id")==userId
   if(captain && status=="requested"){button("Accept ride"){transition(id,"accept")};button("Reject request"){transition(id,"reject")}}
   if(captain&&assigned){when(status){"accepted"->button("I have arrived"){transition(id,"arrive")};"arrived"->button("Verify code & start"){val code=EditText(this);code.inputType=2;AlertDialog.Builder(this).setTitle("Customer start code").setView(code).setPositiveButton("Start"){_,_->transition(id,"start",code.text.toString())}.setNegativeButton("Cancel",null).show()};"in_progress"->button("Complete ride"){transition(id,"complete")}}}
   if(!captain&&!listOf("completed","cancelled").contains(status))button("Show trip start code"){task{val code=Api.call("code",JSONObject().put("p_ride_id",id)).trim('"');runOnUiThread{AlertDialog.Builder(this).setTitle("Start code").setMessage(code+"\nShare only after your captain arrives.").setPositiveButton("OK",null).show()}}}
   if(listOf("requested","accepted","arrived").contains(status)&&(assigned||!captain))button("Cancel ride"){AlertDialog.Builder(this).setTitle("Cancel this ride?").setPositiveButton("Cancel ride"){_,_->transition(id,"cancel")}.setNegativeButton("Keep ride",null).show()}
   if(listOf("accepted","arrived","in_progress").contains(status)&&(assigned||!captain))button("Record SOS alert"){AlertDialog.Builder(this).setTitle("Record safety alert").setMessage("Records an operations alert only. No emergency call or SMS is sent. Use your phone for immediate emergency help.").setPositiveButton("Record"){_,_->mutate("sos",JSONObject().put("p_ride_id",id))}.setNegativeButton("Close",null).show()}
  }
  button("Sign out"){Api.logout();login()};atHome=true
 }
 private fun transition(id:String,action:String,code:String=""){mutate("transition",JSONObject().put("p_ride_id",id).put("p_action",action).put("p_code",code))}
 private fun booking(){screen("Where are we headed?")
  val origins=arrayOf("FC Road, Deccan","Baner Road","Pune Railway Station")
  val destinations=arrayOf("Koregaon Park","Viman Nagar","MG Road, Camp")
  val coordsA=arrayOf(doubleArrayOf(18.5196,73.8413),doubleArrayOf(18.559,73.7868),doubleArrayOf(18.5285,73.8742))
  val coordsB=arrayOf(doubleArrayOf(18.5362,73.894),doubleArrayOf(18.5679,73.9143),doubleArrayOf(18.513,73.879))
  fun spinner(items:Array<String>):Spinner{val v=Spinner(this);v.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,items);layout.addView(v);return v}
  text("Pickup");val from=spinner(origins);text("Destination");val to=spinner(destinations);text("Service");val mode=spinner(arrayOf("bike","auto","cab"))
  text("Cash payment. Fare is an estimate using 1.3 × straight-line distance; no live road routing.",12)
  button("Request ride"){val a=from.selectedItemPosition;val b=to.selectedItemPosition;val payload=JSONObject().put("p_pickup",origins[a]).put("p_destination",destinations[b]).put("p_pickup_lat",coordsA[a][0]).put("p_pickup_lng",coordsA[a][1]).put("p_drop_lat",coordsB[b][0]).put("p_drop_lng",coordsB[b][1]).put("p_mode",mode.selectedItem.toString()).put("p_request_key",requestKey)
   task{Api.call("book",payload);requestKey=UUID.randomUUID().toString();fetch();runOnUiThread{home()}}}
  button("Back"){home()}
 }
 private fun shareLocation(){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),42);return}
  val manager=getSystemService(LOCATION_SERVICE) as LocationManager
  val location=manager.getProviders(true).mapNotNull{runCatching{manager.getLastKnownLocation(it)}.getOrNull()}.maxByOrNull{it.time}
  if(location==null||System.currentTimeMillis()-location.time>120000){notify("No recent position. Enable device location and try again.");return}
  mutate("location",JSONObject().put("p_lat",location.latitude).put("p_lng",location.longitude))
 }
 override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==42&&grantResults.firstOrNull()==PackageManager.PERMISSION_GRANTED)shareLocation()}
}
