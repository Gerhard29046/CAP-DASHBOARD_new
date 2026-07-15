<?php
namespace App\Models;use Illuminate\Database\Eloquent\Model;
class PermissionAuditLog extends Model{protected $fillable=['changed_by_user_id','affected_user_id','permission_key','old_value','new_value','action','metadata'];protected function casts():array{return['old_value'=>'boolean','new_value'=>'boolean','metadata'=>'array'];}}
