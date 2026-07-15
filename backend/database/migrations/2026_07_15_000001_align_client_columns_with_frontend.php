<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->renameColumn('contact_name', 'contact_person');
            $table->renameColumn('address_line_1', 'address');
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->renameColumn('contact_person', 'contact_name');
            $table->renameColumn('address', 'address_line_1');
        });
    }
};
