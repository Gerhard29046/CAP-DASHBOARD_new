<?php
namespace Tests\Feature;
use Database\Seeders\PermissionsSeeder;
use App\Models\{KnowledgeMachine,KnowledgeMedia,KnowledgeServiceCode,User}; use Illuminate\Foundation\Testing\RefreshDatabase; use Illuminate\Http\UploadedFile; use Illuminate\Support\Facades\{Crypt,DB,Hash,Storage}; use Tests\TestCase;
class AuthenticationKnowledgeBaseTest extends TestCase { use RefreshDatabase;
protected function setUp():void{parent::setUp();$this->seed(PermissionsSeeder::class);}
private function user(string $role='admin',bool $active=true):User{return User::create(['name'=>$role,'email'=>$role.uniqid().'@test.local','password'=>'SecurePass123!','role'=>$role,'is_active'=>$active]);}
public function test_login_me_and_logout():void{$u=$this->user();$login=$this->postJson('/api/login',['email'=>$u->email,'password'=>'SecurePass123!'])->assertOk()->assertJsonPath('user.role','admin');$token=$login->json('token');$this->withToken($token)->getJson('/api/me')->assertOk()->assertJsonPath('user.id',$u->id);$this->withToken($token)->postJson('/api/logout')->assertNoContent();$this->app['auth']->forgetGuards();$this->withToken($token)->getJson('/api/me')->assertUnauthorized();}
public function test_invalid_and_inactive_login_are_rejected():void{$u=$this->user('technician',false);$this->postJson('/api/login',['email'=>$u->email,'password'=>'wrong'])->assertUnauthorized();$this->postJson('/api/login',['email'=>$u->email,'password'=>'SecurePass123!'])->assertUnauthorized();}
public function test_local_frontend_origins_are_allowed_by_cors():void
{
    foreach (['http://127.0.0.1:5173', 'http://localhost:5173'] as $origin) {
        $this->withHeaders(['Origin' => $origin])
            ->options('/api/login', [
                'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
                'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'content-type',
            ])
            ->assertSuccessful()
            ->assertHeader('Access-Control-Allow-Origin', $origin);
    }
}
public function test_admin_user_management_and_technician_denial():void{$admin=$this->user();$tech=$this->user('technician');$this->actingAs($admin)->postJson('/api/admin/users',['name'=>'New Tech','email'=>'new@test.local','password'=>'Temporary123!','password_confirmation'=>'Temporary123!','role'=>'technician','is_active'=>true,'must_change_password'=>true])->assertCreated();$this->actingAs($tech)->getJson('/api/admin/users')->assertForbidden();}
public function test_knowledge_roles_notes_and_service_code_security():void{$admin=$this->user();$tech=$this->user('technician');$accountant=$this->user('accountant');$machine=$this->actingAs($admin)->postJson('/api/knowledge-machines',['manufacturer'=>'WIGAM','model_name'=>'TEST','product_code'=>'TEST-1'])->assertCreated()->json();$this->actingAs($tech)->postJson("/api/knowledge-machines/{$machine['id']}/notes",['title'=>'Check','note_type'=>'troubleshooting','content'=>'Inspect filter'])->assertCreated();$code=$this->actingAs($admin)->postJson("/api/knowledge-machines/{$machine['id']}/service-codes",['function_name'=>'Protected function','service_code'=>'secret-value'])->assertCreated();$raw=DB::table('knowledge_service_codes')->where('id',$code->json('id'))->value('service_code');$this->assertNotSame('secret-value',$raw);$this->getJson("/api/knowledge-machines/{$machine['id']}/service-codes")->assertJsonMissing(['service_code'=>'secret-value']);$this->actingAs($accountant)->postJson('/api/knowledge-service-codes/'.$code->json('id').'/reveal')->assertForbidden();$this->actingAs($tech)->postJson('/api/knowledge-service-codes/'.$code->json('id').'/reveal')->assertOk()->assertJsonPath('service_code','secret-value');}
public function test_private_image_validation_and_access():void{Storage::fake('local');$admin=$this->user();$machine=KnowledgeMachine::create(['manufacturer'=>'WIGAM','model_name'=>'TEST']);$this->actingAs($admin)->postJson("/api/knowledge-machines/$machine->id/media",['files'=>[UploadedFile::fake()->create('bad.exe',10,'application/x-msdownload')]])->assertUnprocessable();$upload=$this->actingAs($admin)->post("/api/knowledge-machines/$machine->id/media",['files'=>[UploadedFile::fake()->image('machine.jpg')]],['Accept'=>'application/json'])->assertCreated();$media=$upload->json('0.id');$this->app['auth']->forgetGuards();$this->getJson("/api/knowledge-media/$media/file")->assertUnauthorized();$this->actingAs($admin)->get("/api/knowledge-media/$media/file")->assertOk();}
}
