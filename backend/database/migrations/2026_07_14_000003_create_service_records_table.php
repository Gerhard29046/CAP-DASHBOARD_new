<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_records', function (Blueprint $table) {
            $table->id();

            $table->foreignId('machine_id')
                ->constrained('machines')
                ->restrictOnDelete();

            $table->date('service_date');
            $table->date('next_service_due')->nullable();

            $table->string('service_type')->nullable();
            $table->string('status')->default('Completed');
            $table->string('technician_name')->nullable();

            $table->text('work_performed')->nullable();
            $table->text('parts_used')->nullable();
            $table->decimal('labour_hours', 5, 2)->default(0);

            $table->string('invoice_number')->nullable();
            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index(['machine_id', 'service_date']);
            $table->index('next_service_due');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_records');
    }
};
