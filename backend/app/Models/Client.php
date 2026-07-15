<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Client extends Model
{
    protected $fillable = [
        'company_name',
        'trading_name',
        'contact_person',
        'account_number',
        'vat_number',
        'email',
        'phone',
        'mobile',
        'address',
        'address_line_2',
        'suburb',
        'city',
        'province',
        'postal_code',
        'country',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function machines(): HasMany
    {
        return $this->hasMany(Machine::class);
    }

    public function jobCards(): HasMany
    {
        return $this->hasMany(JobCard::class);
    }
}
