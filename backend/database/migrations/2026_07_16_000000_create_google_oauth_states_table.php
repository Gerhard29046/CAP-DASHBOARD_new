<?php
use Illuminate\Database\Migrations\Migration;use Illuminate\Database\Schema\Blueprint;use Illuminate\Support\Facades\Schema;
return new class extends Migration{public function up():void{Schema::create('google_oauth_states',function(Blueprint $t){$t->id();$t->string('state_hash',64)->unique();$t->foreignId('user_id')->constrained('users')->cascadeOnDelete();$t->string('redirect_url')->nullable();$t->timestamp('expires_at');$t->timestamp('consumed_at')->nullable();$t->timestamps();});}public function down():void{Schema::dropIfExists('google_oauth_states');}};
