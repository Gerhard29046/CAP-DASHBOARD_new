<?php
use Illuminate\Database\Migrations\Migration; use Illuminate\Database\Schema\Blueprint; use Illuminate\Support\Facades\Schema;
return new class extends Migration { public function up():void{Schema::table('users',function(Blueprint $t){$t->boolean('must_change_password')->default(false)->after('is_active');$t->timestamp('last_login_at')->nullable()->after('must_change_password');});} public function down():void{Schema::table('users',fn(Blueprint $t)=>$t->dropColumn(['must_change_password','last_login_at']));}};
