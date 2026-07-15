<?php
namespace App\Support; use App\Models\AuditLog; use Illuminate\Http\Request;
class Audit { public static function record(Request $r,string $action,object $entity,array $metadata=[]):void { AuditLog::create(['user_id'=>$r->user()?->id,'action'=>$action,'entity_type'=>$entity::class,'entity_id'=>$entity->id??null,'metadata'=>$metadata,'ip_address'=>$r->ip(),'created_at'=>now()]); } }
