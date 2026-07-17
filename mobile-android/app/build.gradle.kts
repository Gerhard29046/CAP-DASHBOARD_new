plugins { alias(libs.plugins.android.application); alias(libs.plugins.kotlin.android); alias(libs.plugins.kotlin.compose); alias(libs.plugins.kotlin.serialization); alias(libs.plugins.ksp); alias(libs.plugins.hilt) }
android { namespace="za.co.connoisseurauto.capmobile"; compileSdk=36
 defaultConfig { applicationId="za.co.connoisseurauto.capmobile"; minSdk=26; targetSdk=36; versionCode=1; versionName="1.0.0"; testInstrumentationRunner="androidx.test.runner.AndroidJUnitRunner"; vectorDrawables.useSupportLibrary=true }
 buildTypes { debug { buildConfigField("String","API_BASE_URL","\"http://10.0.2.2:8000/api/\"") }; release { isMinifyEnabled=true; buildConfigField("String","API_BASE_URL","\"https://dashboard.connoisseurauto.co.za/api/\""); proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"),"proguard-rules.pro") } }
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
dependencies { implementation(platform(libs.compose.bom)); androidTestImplementation(platform(libs.compose.bom)); implementation(libs.compose.ui); implementation(libs.compose.preview); implementation(libs.material3); implementation(libs.material.icons); implementation(libs.activity.compose); implementation(libs.lifecycle.runtime); implementation(libs.lifecycle.viewmodel); implementation(libs.navigation); implementation(libs.hilt.android); ksp(libs.hilt.compiler); implementation(libs.hilt.navigation); implementation(libs.retrofit); implementation(libs.retrofit.serialization); implementation(libs.okhttp); implementation(libs.okhttp.logging); implementation(libs.serialization.json); implementation(libs.room.runtime); implementation(libs.room.ktx); ksp(libs.room.compiler); implementation(libs.work); implementation(libs.datastore); implementation(libs.security); implementation(libs.coil); testImplementation(libs.junit); androidTestImplementation(libs.compose.test); debugImplementation(libs.compose.tooling); debugImplementation(libs.compose.manifest) }
