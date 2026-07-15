<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobCard extends Model
{
    protected $fillable = ['client_id', 'machine_id', 'job_number', 'status', 'date_received', 'date_completed', 'date_returned', 'received_by', 'technician_name', 'fault_description', 'accessories_received', 'arrival_condition', 'arrival_condition_notes', 'work_performed', 'technician_notes', 'quotation_required', 'quotation_number', 'invoice_number', 'labour_total', 'parts_total'];
    protected function casts(): array { return ['date_received' => 'date:Y-m-d', 'date_completed' => 'date:Y-m-d', 'date_returned' => 'date:Y-m-d', 'quotation_required' => 'boolean', 'labour_total' => 'decimal:2', 'parts_total' => 'decimal:2']; }
    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
    public function machine(): BelongsTo { return $this->belongsTo(Machine::class); }
    public function jobCardLines(): HasMany { return $this->hasMany(JobCardLine::class); }
}
