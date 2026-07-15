<?php
namespace App\Http\Controllers;
use App\Models\JobCard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
class JobCardController extends Controller
{
    public function index(Request $request): JsonResponse { $q=JobCard::with(['client','machine']); foreach(['client_id','machine_id','status'] as $f) if($request->filled($f)) $q->where($f,$request->input($f)); return response()->json($q->orderByDesc('date_received')->get()); }
    public function store(Request $request): JsonResponse { return response()->json(JobCard::create($this->validated($request)),201); }
    public function show(JobCard $jobCard): JsonResponse { return response()->json($jobCard->load(['client','machine','jobCardLines'])); }
    public function update(Request $request,JobCard $jobCard): JsonResponse { $jobCard->update($this->validated($request,$jobCard)); return response()->json($jobCard->fresh()->load(['client','machine','jobCardLines'])); }
    public function destroy(JobCard $jobCard): Response { $jobCard->delete(); return response()->noContent(); }
    private function validated(Request $request,?JobCard $jobCard=null): array { $r=$jobCard?'sometimes|required':'required'; return $request->validate(['client_id'=>[$r,'integer','exists:clients,id'],'machine_id'=>[$r,'integer','exists:machines,id'],'job_number'=>[$r,'string','max:255',Rule::unique('job_cards')->ignore($jobCard)],'status'=>['sometimes','string','max:255'],'date_received'=>[$r,'date'],'date_completed'=>['sometimes','nullable','date'],'date_returned'=>['sometimes','nullable','date'],'received_by'=>['sometimes','nullable','string','max:255'],'technician_name'=>['sometimes','nullable','string','max:255'],'fault_description'=>[$r,'string'],'accessories_received'=>['sometimes','nullable','string'],'arrival_condition'=>['sometimes','nullable','string','max:255'],'arrival_condition_notes'=>['sometimes','nullable','string'],'work_performed'=>['sometimes','nullable','string'],'technician_notes'=>['sometimes','nullable','string'],'quotation_required'=>['sometimes','boolean'],'quotation_number'=>['sometimes','nullable','string','max:255'],'invoice_number'=>['sometimes','nullable','string','max:255'],'labour_total'=>['sometimes','numeric','min:0'],'parts_total'=>['sometimes','numeric','min:0']]); }
}
