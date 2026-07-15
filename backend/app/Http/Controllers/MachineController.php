<?php
namespace App\Http\Controllers;
use App\Models\Machine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
class MachineController extends Controller
{
    public function index(Request $request): JsonResponse { $q=Machine::query(); foreach(['client_id','is_active','refrigerant_type'] as $f) if($request->filled($f)) $q->where($f,$request->input($f)); return response()->json($q->orderBy('brand')->orderBy('model')->get()); }
    public function store(Request $request): JsonResponse { return response()->json(Machine::create($this->validated($request)),201); }
    public function show(Machine $machine): JsonResponse { return response()->json($machine->load('client')); }
    public function update(Request $request,Machine $machine): JsonResponse { $machine->update($this->validated($request,$machine)); return response()->json($machine->fresh()); }
    public function destroy(Machine $machine): Response { $machine->delete(); return response()->noContent(); }
    private function validated(Request $request,?Machine $machine=null): array { $r=$machine?'sometimes|required':'required'; return $request->validate(['client_id'=>[$r,'integer','exists:clients,id'],'brand'=>[$r,'string','max:255'],'model'=>[$r,'string','max:255'],'serial_number'=>[$r,'string','max:255',Rule::unique('machines')->ignore($machine)],'refrigerant_type'=>[$r,'string','max:255'],'installation_date'=>['sometimes','nullable','date'],'warranty_expiry'=>['sometimes','nullable','date'],'notes'=>['sometimes','nullable','string'],'is_active'=>['sometimes','boolean']]); }
}
