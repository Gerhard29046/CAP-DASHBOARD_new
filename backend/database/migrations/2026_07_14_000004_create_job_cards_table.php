<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_cards', function (Blueprint $table) {
            $table->id();

            $table->foreignId('client_id')
                ->constrained('clients')
                ->restrictOnDelete();

            $table->foreignId('machine_id')
                ->constrained('machines')
                ->restrictOnDelete();

            $table->string('job_number')->unique();
            $table->string('status')->default('Booked In');

            $table->date('date_received');
            $table->date('date_completed')->nullable();
            $table->date('date_returned')->nullable();

            $table->string('received_by')->nullable();
            $table->string('technician_name')->nullable();

            $table->text('fault_description');
            $table->text('accessories_received')->nullable();

            $table->string('arrival_condition')->nullable();
            $table->text('arrival_condition_notes')->nullable();

            $table->text('work_performed')->nullable();
            $table->text('technician_notes')->nullable();

            $table->boolean('quotation_required')->default(false);
            $table->string('quotation_number')->nullable();
            $table->string('invoice_number')->nullable();

            $table->decimal('labour_total', 10, 2)->default(0);
            $table->decimal('parts_total', 10, 2)->default(0);

            $table->timestamps();

            $table->index(['client_id', 'status']);
            $table->index(['machine_id', 'status']);
            $table->index('date_received');
            $table->index('invoice_number');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_cards');
    }
};
