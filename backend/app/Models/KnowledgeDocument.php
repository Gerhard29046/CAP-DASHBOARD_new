<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\BelongsTo;
class KnowledgeDocument extends Model { protected $fillable=['knowledge_machine_id','title','original_filename','storage_disk','file_path','mime_type','file_size','uploaded_by']; public function knowledgeMachine():BelongsTo{return $this->belongsTo(KnowledgeMachine::class);} }
