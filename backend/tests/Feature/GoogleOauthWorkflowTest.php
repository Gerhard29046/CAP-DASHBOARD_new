<?php
namespace Tests\Feature;
use App\Models\{GoogleOauthState,User};use App\Services\GoogleCalendarService;use Database\Seeders\PermissionsSeeder;use Illuminate\Foundation\Testing\RefreshDatabase;use Mockery;use Tests\TestCase;
class GoogleOauthWorkflowTest extends TestCase
{
use RefreshDatabase;protected function setUp():void{parent::setUp();$this->seed(PermissionsSeeder::class);}
public function test_connect_requires_permission_and_reports_missing_configuration():void{$custom=User::factory()->create(['role'=>'custom','is_active'=>true]);$this->actingAs($custom)->getJson('/api/google-calendar/connect')->assertForbidden();$admin=User::factory()->create(['role'=>'admin','is_active'=>true]);$this->actingAs($admin)->getJson('/api/google-calendar/connect')->assertUnprocessable()->assertJsonPath('message','Google Calendar integration has not been configured on the server.');}
public function test_connect_returns_external_url_and_stores_hashed_one_time_state():void{$admin=User::factory()->create(['role'=>'admin','is_active'=>true]);$service=Mockery::mock(GoogleCalendarService::class);$service->shouldReceive('isConfigured')->once()->andReturnTrue();$service->shouldReceive('authUrl')->once()->withArgs(function($state){return strlen($state)===64;})->andReturn('https://accounts.google.com/o/oauth2/v2/auth?client_id=test');$this->app->instance(GoogleCalendarService::class,$service);$this->actingAs($admin)->getJson('/api/google-calendar/connect')->assertOk()->assertJsonPath('authorization_url','https://accounts.google.com/o/oauth2/v2/auth?client_id=test');$this->assertDatabaseCount('google_oauth_states',1);$this->assertSame(64,strlen(GoogleOauthState::first()->state_hash));}
public function test_invalid_callback_state_is_rejected():void{$this->get('/google-calendar/callback?state=invalid&code=test')->assertRedirect(config('google-calendar.frontend_error_url'));}
}
