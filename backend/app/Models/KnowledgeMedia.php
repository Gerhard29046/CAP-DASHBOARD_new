<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\BelongsTo;
class KnowledgeMedia extends Model { protected $fillable=['knowledge_machine_id','knowledge_note_id','original_filename','stored_filename','storage_disk','file_path','mime_type','file_size','caption','alt_text','uploaded_by']; public function knowledgeMachine():BelongsTo{return $this->belongsTo(KnowledgeMachine::class);} public function knowledgeNote():BelongsTo{return $this->belongsTo(KnowledgeNote::class);} }
