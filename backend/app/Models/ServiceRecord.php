<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class ServiceRecord extends Model
{
    protected $fillable = ['machine_id', 'service_date', 'next_service_due', 'service_type', 'status', 'technician_name', 'work_performed', 'parts_used', 'labour_hours', 'invoice_number', 'notes'];
    protected function casts(): array { return ['service_date' => 'date:Y-m-d', 'next_service_due' => 'date:Y-m-d', 'labour_hours' => 'decimal:2']; }
    public function machine(): BelongsTo { return $this->belongsTo(Machine::class); }
}
