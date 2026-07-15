<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class JobCardLine extends Model
{
    protected $fillable = ['job_card_id', 'line_type', 'product_code', 'description', 'quantity', 'unit_price', 'line_total', 'notes'];
    protected function casts(): array { return ['quantity' => 'decimal:2', 'unit_price' => 'decimal:2', 'line_total' => 'decimal:2']; }
    public function jobCard(): BelongsTo { return $this->belongsTo(JobCard::class); }
}
