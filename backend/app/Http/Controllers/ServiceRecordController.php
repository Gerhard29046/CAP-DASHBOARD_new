<?php
namespace App\Http\Controllers;
use App\Models\ServiceRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
class ServiceRecordController extends Controller
{
    public function index(Request $request): JsonResponse { $q=ServiceRecord::with('machine.client'); foreach(['machine_id','status'] as $f) if($request->filled($f)) $q->where($f,$request->input($f)); return response()->json($q->orderByDesc('service_date')->get()); }
    public function store(Request $request): JsonResponse { return response()->json(ServiceRecord::create($this->validated($request)),201); }
    public function show(ServiceRecord $serviceRecord): JsonResponse { return response()->json($serviceRecord->load('machine.client')); }
    public function update(Request $request,ServiceRecord $serviceRecord): JsonResponse { $serviceRecord->update($this->validated($request,true)); return response()->json($serviceRecord->fresh()->load('machine.client')); }
    public function destroy(ServiceRecord $serviceRecord): Response { $serviceRecord->delete(); return response()->noContent(); }
    private function validated(Request $request,bool $partial=false): array { $r=$partial?'sometimes|required':'required'; return $request->validate(['machine_id'=>[$r,'integer','exists:machines,id'],'service_date'=>[$r,'date'],'next_service_due'=>['sometimes','nullable','date'],'service_type'=>['sometimes','nullable','string','max:255'],'status'=>['sometimes','string','max:255'],'technician_name'=>['sometimes','nullable','string','max:255'],'work_performed'=>['sometimes','nullable','string'],'parts_used'=>['sometimes','nullable','string'],'labour_hours'=>['sometimes','numeric','min:0'],'invoice_number'=>['sometimes','nullable','string','max:255'],'notes'=>['sometimes','nullable','string']]); }
}
