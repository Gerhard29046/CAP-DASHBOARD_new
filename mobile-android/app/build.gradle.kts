import java.util.Properties

plugins { alias(libs.plugins.android.application); alias(libs.plugins.kotlin.android); alias(libs.plugins.kotlin.compose); alias(libs.plugins.ksp); alias(libs.plugins.hilt) }
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}
val productionWebAppUrl = "https://capdashboard.gerhardvanwijk.workers.dev/"
val defaultLoginEmail = localProperties.getProperty("CAP_LOGIN_EMAIL", "admin@connoisseurauto.co.za")
// Phase C (Android->Supabase auth migration, see docs/android/ANDROID_SUPABASE_MIGRATION.md).
// Same project/values already committed in frontend/.env.production -- the publishable/anon
// key, not a secret: safe to commit, designed to be public, every access RLS-constrained.
// Never put the service-role key here or anywhere in mobile-android/.
val supabaseUrl = "https://cjvrquipmnoihksijful.supabase.co"
val supabaseAnonKey = "sb_publishable_Eu9Qx2QyjMZVLhKcv8232A_KvxjTbbi"
android { namespace="com.CAPDATABASE.capdatabase"; compileSdk=36
 defaultConfig { applicationId="com.CAPDATABASE.capdatabase"; minSdk=26; targetSdk=36; versionCode=1; versionName="1.0.0"; testInstrumentationRunner="androidx.test.runner.AndroidJUnitRunner"; vectorDrawables.useSupportLibrary=true; buildConfigField("String", "DEFAULT_LOGIN_EMAIL", "\"$defaultLoginEmail\"") }
 buildTypes {
    debug {
        buildConfigField("String", "WEB_APP_URL", "\"$productionWebAppUrl\"")
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
    }
    release {
        isMinifyEnabled=true
        buildConfigField("String", "WEB_APP_URL", "\"$productionWebAppUrl\"")
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"),"proguard-rules.pro")
    }
 }
 buildFeatures { compose=true; buildConfig=true }; packaging.resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" 

 compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
 }

 kotlinOptions {
    jvmTarget = "17"
 }
}

kotlin {
    jvmToolchain(17)
}
dependencies { implementation(platform(libs.compose.bom)); androidTestImplementation(platform(libs.compose.bom)); implementation(libs.compose.ui); implementation(libs.compose.preview); implementation(libs.material3); implementation(libs.material.icons); implementation(libs.activity.compose); implementation(libs.lifecycle.runtime); implementation(libs.lifecycle.viewmodel); implementation(libs.navigation); implementation(libs.hilt.android); ksp(libs.hilt.compiler); implementation(libs.hilt.navigation); implementation(libs.room.runtime); implementation(libs.room.ktx); ksp(libs.room.compiler); implementation(libs.work); implementation(libs.datastore); implementation(libs.security); implementation(libs.coil); implementation(libs.coil.network.okhttp); testImplementation(libs.junit); androidTestImplementation(libs.compose.test); debugImplementation(libs.compose.tooling); debugImplementation(libs.compose.manifest) }
