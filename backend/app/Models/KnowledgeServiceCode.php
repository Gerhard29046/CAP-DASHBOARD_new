<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\BelongsTo;
class KnowledgeServiceCode extends Model { protected $fillable=['knowledge_machine_id','function_name','description','service_code','created_by','updated_by']; protected $hidden=['service_code']; protected function casts():array{return['service_code'=>'encrypted'];} public function knowledgeMachine():BelongsTo{return $this->belongsTo(KnowledgeMachine::class);} }
