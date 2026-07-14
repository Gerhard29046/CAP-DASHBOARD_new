<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_card_lines', function (Blueprint $table) {
            $table->id();

            $table->foreignId('job_card_id')
                ->constrained('job_cards')
                ->cascadeOnDelete();

            $table->string('line_type')->default('Product');
            $table->string('product_code')->nullable();
            $table->string('description');

            $table->decimal('quantity', 10, 2)->default(1);
            $table->decimal('unit_price', 10, 2)->default(0);
            $table->decimal('line_total', 10, 2)->default(0);

            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index(['job_card_id', 'line_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_card_lines');
    }
};
