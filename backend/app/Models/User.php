<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;
    protected $fillable=['name','email','password','role','is_active','must_change_password','last_login_at'];
    protected $hidden=['password','remember_token'];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean', 'must_change_password'=>'boolean', 'last_login_at'=>'datetime',
        ];
    }

    public function permissionOverrides(): HasMany { return $this->hasMany(UserPermission::class); }
    public function hasPermission(string $key): bool
    {
        $permission = Permission::where('key', $key)->first();
        if (!$permission) return false;
        $override = $this->permissionOverrides()->where('permission_id', $permission->id)->first();
        if ($override) return $override->allowed;
        return RolePermission::where('role', strtolower($this->role))->where('permission_id', $permission->id)->exists();
    }
    public function getEffectivePermissions(): array { return Permission::orderBy('key')->get()->filter(fn($p)=>$this->hasPermission($p->key))->pluck('key')->values()->all(); }
    public function getPermissionOverrides(): array { return $this->permissionOverrides()->with('permission')->get()->mapWithKeys(fn($x)=>[$x->permission->key=>$x->allowed])->all(); }
    public function canManageUsers(): bool { return $this->hasPermission('users.permissions.manage'); }
}
