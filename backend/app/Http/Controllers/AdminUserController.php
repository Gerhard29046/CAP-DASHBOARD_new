<?php
namespace App\Http\Controllers;
use App\Models\{Permission,PermissionAuditLog,RolePermission,User,UserPermission};
use Illuminate\Http\{JsonResponse,Request,Response};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\{Rule,ValidationException};
class AdminUserController extends Controller
{
    public function index():JsonResponse{return response()->json(User::orderBy('name')->get()->map(fn($u)=>$this->safe($u)));}
    public function store(Request $r):JsonResponse
    {
        $this->need($r,'users.create');$data=$this->validated($r);$permissions=$data['permissions']??$this->roleDefaults($data['role']);unset($data['permissions']);
        $user=DB::transaction(function()use($r,$data,$permissions){$user=User::create($data);$this->syncPermissions($user,$permissions,$r->user()->id);PermissionAuditLog::create(['changed_by_user_id'=>$r->user()->id,'affected_user_id'=>$user->id,'action'=>'user.created','metadata'=>['role'=>$user->role,'is_active'=>$user->is_active,'permission_count'=>count($user->getEffectivePermissions())]]);return$user;});
        return response()->json($this->safe($user->fresh()),201);
    }
    public function show(User $user):JsonResponse{return response()->json($this->safe($user));}
    public function update(Request $r,User $user):JsonResponse
    {
        $this->need($r,'users.edit');$data=$this->validated($r,$user);$permissions=$data['permissions']??null;unset($data['permissions']);if(isset($data['password']))$data['must_change_password']=false;$roleChanged=isset($data['role'])&&$data['role']!==$user->role;$statusChanged=isset($data['is_active'])&&(bool)$data['is_active']!==$user->is_active;if($roleChanged)$this->need($r,'users.roles.manage');if($statusChanged)$this->need($r,'users.disable');$this->guard($user,$data);
        DB::transaction(function()use($r,$user,$data,$permissions,$roleChanged,$statusChanged){$user->update($data);if($permissions!==null)$this->syncPermissions($user,$permissions,$r->user()->id);if($statusChanged&&!$user->is_active)$user->tokens()->delete();PermissionAuditLog::create(['changed_by_user_id'=>$r->user()->id,'affected_user_id'=>$user->id,'action'=>'user.updated','metadata'=>['role_changed'=>$roleChanged,'status_changed'=>$statusChanged]]);});return response()->json($this->safe($user->fresh()));
    }
    public function status(Request $r,User $user):JsonResponse{$this->need($r,'users.disable');$data=$r->validate(['is_active'=>['required','boolean']]);$this->guard($user,$data);$user->update($data);if(!$user->is_active)$user->tokens()->delete();PermissionAuditLog::create(['changed_by_user_id'=>$r->user()->id,'affected_user_id'=>$user->id,'action'=>$user->is_active?'user.enabled':'user.disabled']);return response()->json($this->safe($user->fresh()));}
    public function destroy(Request $r,User $user):Response{$this->need($r,'users.delete');$this->guard($user,['is_active'=>false]);$user->update(['is_active'=>false]);$user->tokens()->delete();return response()->noContent();}
    private function validated(Request $r,?User $user=null):array
    {
        $data=$r->validate(['name'=>[$user?'sometimes':'required','string','max:255'],'email'=>[$user?'sometimes':'required','email',Rule::unique('users')->ignore($user)],'password'=>[$user?'sometimes':'required','string','min:12','confirmed'],'role'=>[$user?'sometimes':'required',Rule::in(['admin','technician','accountant','custom'])],'is_active'=>['sometimes','boolean'],'permissions'=>['sometimes','array'],'permissions.*'=>['boolean']],['email.unique'=>'This email address is already in use.','password.min'=>'Passwords must contain at least 12 characters.','password.confirmed'=>'Password confirmation does not match.','role.in'=>'The selected primary role is invalid.','permissions.*.boolean'=>'One or more selected permissions are invalid.']);
        if(isset($data['permissions'])){$known=Permission::whereIn('key',array_keys($data['permissions']))->pluck('key')->all();if(count($known)!==count($data['permissions']))throw ValidationException::withMessages(['permissions'=>['One or more selected permissions are invalid.']]);}
        return$data;
    }
    private function syncPermissions(User $user,array $selected,int $actor):void
    {
        $defaults=RolePermission::where('role',$user->role)->with('permission')->get()->pluck('permission.key')->flip();$permissions=Permission::get()->keyBy('key');
        foreach($permissions as $key=>$permission){$allowed=(bool)($selected[$key]??false);$default=$defaults->has($key);if($allowed===$default)UserPermission::where(['user_id'=>$user->id,'permission_id'=>$permission->id])->delete();else UserPermission::updateOrCreate(['user_id'=>$user->id,'permission_id'=>$permission->id],['allowed'=>$allowed]);}
    }
    private function roleDefaults(string $role):array{$keys=RolePermission::where('role',$role)->with('permission')->get()->pluck('permission.key')->flip();return Permission::pluck('key')->mapWithKeys(fn($key)=>[$key=>$keys->has($key)])->all();}
    private function need(Request $r,string $key):void{abort_unless($r->user()->hasPermission($key),403);}
    private function guard(User $u,array $d):void{if($u->role==='admin'&&$u->is_active&&(($d['role']??'admin')!=='admin'||isset($d['is_active'])&&!$d['is_active'])){$others=User::where('role','admin')->where('is_active',true)->whereKeyNot($u->id)->get()->filter(fn($x)=>$x->hasPermission('users.permissions.manage')&&$x->hasPermission('users.roles.manage'))->count();abort_if($others<1,422,'The final qualifying administrator cannot be disabled or demoted.');}}
    private function safe(User $u):array{$permissions=$u->getEffectivePermissions();return['id'=>$u->id,'name'=>$u->name,'email'=>$u->email,'role'=>$u->role,'is_active'=>$u->is_active,'must_change_password'=>$u->must_change_password,'effective_permissions'=>$permissions,'permission_overrides'=>$u->getPermissionOverrides(),'effective_permission_count'=>count($permissions),'updated_at'=>$u->updated_at];}
}
