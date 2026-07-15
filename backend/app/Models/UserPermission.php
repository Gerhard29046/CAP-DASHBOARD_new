<?php
namespace App\Models;use Illuminate\Database\Eloquent\Model;use Illuminate\Database\Eloquent\Relations\BelongsTo;
class UserPermission extends Model{protected $fillable=['user_id','permission_id','allowed'];protected function casts():array{return['allowed'=>'boolean'];}public function permission():BelongsTo{return $this->belongsTo(Permission::class);}public function user():BelongsTo{return $this->belongsTo(User::class);}}
