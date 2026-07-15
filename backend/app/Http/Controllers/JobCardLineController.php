<?php
namespace App\Http\Controllers;
use App\Models\JobCardLine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
class JobCardLineController extends Controller
{
    public function index(Request $request): JsonResponse { $q=JobCardLine::query(); if($request->filled('job_card_id')) $q->where('job_card_id',$request->input('job_card_id')); return response()->json($q->orderBy('id')->get()); }
    public function store(Request $request): JsonResponse { $d=$this->validated($request); $d['line_total']=($d['quantity']??1)*($d['unit_price']??0); return response()->json(JobCardLine::create($d),201); }
    public function show(JobCardLine $jobCardLine): JsonResponse { return response()->json($jobCardLine); }
    public function update(Request $request,JobCardLine $jobCardLine): JsonResponse { $d=$this->validated($request,true); $d['line_total']=($d['quantity']??$jobCardLine->quantity)*($d['unit_price']??$jobCardLine->unit_price); $jobCardLine->update($d); return response()->json($jobCardLine->fresh()); }
    public function destroy(JobCardLine $jobCardLine): Response { $jobCardLine->delete(); return response()->noContent(); }
    private function validated(Request $request,bool $partial=false): array { $r=$partial?'sometimes|required':'required'; return $request->validate(['job_card_id'=>[$r,'integer','exists:job_cards,id'],'line_type'=>['sometimes','string','max:255'],'product_code'=>['sometimes','nullable','string','max:255'],'description'=>[$r,'string','max:255'],'quantity'=>['sometimes','numeric','min:0'],'unit_price'=>['sometimes','numeric','min:0'],'notes'=>['sometimes','nullable','string']]); }
}
