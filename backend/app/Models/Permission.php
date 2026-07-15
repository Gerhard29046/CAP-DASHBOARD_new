<?php
namespace App\Models;use Illuminate\Database\Eloquent\Model;use Illuminate\Database\Eloquent\Relations\HasMany;
class Permission extends Model{protected $fillable=['name','key','group','description'];public function rolePermissions():HasMany{return $this->hasMany(RolePermission::class);}public function userPermissions():HasMany{return $this->hasMany(UserPermission::class);}}
