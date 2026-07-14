<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('machines', function (Blueprint $table) {
            $table->id();

            $table->foreignId('client_id')
                ->constrained('clients')
                ->restrictOnDelete();

            $table->string('brand');
            $table->string('model');
            $table->string('serial_number')->unique();
            $table->string('refrigerant_type');

            $table->date('installation_date')->nullable();
            $table->date('warranty_expiry')->nullable();

            $table->boolean('is_active')->default(true);
            $table->date('traded_in_at')->nullable();
            $table->string('trade_in_invoice_number')->nullable();

            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index(['client_id', 'is_active']);
            $table->index('refrigerant_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('machines');
    }
};
