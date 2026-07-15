<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\{BelongsTo,HasMany};
class KnowledgeNote extends Model { protected $fillable=['knowledge_machine_id','title','note_type','content','is_pinned','created_by','updated_by']; protected function casts():array{return['is_pinned'=>'boolean'];} public function knowledgeMachine():BelongsTo{return $this->belongsTo(KnowledgeMachine::class);} public function media():HasMany{return $this->hasMany(KnowledgeMedia::class);} }
