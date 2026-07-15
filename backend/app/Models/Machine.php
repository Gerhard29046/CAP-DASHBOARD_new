<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Machine extends Model
{
    protected $fillable = ['client_id', 'brand', 'model', 'serial_number', 'refrigerant_type', 'installation_date', 'warranty_expiry', 'is_active', 'traded_in_at', 'trade_in_invoice_number', 'notes'];
    protected function casts(): array { return ['installation_date' => 'date:Y-m-d', 'warranty_expiry' => 'date:Y-m-d', 'traded_in_at' => 'date:Y-m-d', 'is_active' => 'boolean']; }
    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
    public function serviceRecords(): HasMany { return $this->hasMany(ServiceRecord::class); }
    public function jobCards(): HasMany { return $this->hasMany(JobCard::class); }
}
