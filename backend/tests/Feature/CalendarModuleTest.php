<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\GoogleCalendarConnection;
use App\Models\Machine;
use App\Models\ServiceRecord;
use App\Models\User;
use App\Services\GoogleCalendarService;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class CalendarModuleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionsSeeder::class);
    }

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function service(string $date): ServiceRecord
    {
        $c = Client::create(['company_name' => 'Autohaus Cape Town', 'is_active' => true]);
        $m = Machine::create(['client_id' => $c->id, 'brand' => 'Wigam', 'model' => 'Optima', 'serial_number' => 'OPT-'.str_replace('-', '', $date), 'refrigerant_type' => 'R134a', 'is_active' => true]);

        return ServiceRecord::create(['machine_id' => $m->id, 'service_date' => '2026-01-01', 'next_service_due' => $date, 'status' => 'Scheduled']);
    }

    public function test_user_without_calendar_view_is_forbidden(): void
    {
        Sanctum::actingAs($this->user('custom'));
        $this->getJson('/api/calendar/events?start=2026-08-01&end=2026-09-01')->assertForbidden();
    }

    public function test_services_are_filtered_and_normalised(): void
    {
        $inside = $this->service('2026-08-12');
        $this->service('2026-10-12');
        Sanctum::actingAs($this->user('technician'));
        $this->getJson('/api/calendar/events?start=2026-08-01&end=2026-09-01')->assertOk()->assertJsonCount(1, 'events')->assertJsonPath('events.0.id', 'service-'.$inside->id)->assertJsonPath('events.0.sourceType', 'upcoming_service')->assertJsonPath('events.0.extendedProps.clientName', 'Autohaus Cape Town');
    }

    public function test_google_management_endpoints_require_specific_permissions(): void
    {
        Sanctum::actingAs($this->user('technician'));
        $this->getJson('/api/google-calendar/connect')->assertForbidden();
        $this->deleteJson('/api/google-calendar/disconnect')->assertForbidden();
        $this->putJson('/api/google-calendar/calendars', ['calendar_ids' => []])->assertForbidden();
    }

    public function test_tokens_are_never_returned_and_disconnect_preserves_services(): void
    {
        $service = $this->service('2026-08-12');
        $admin = $this->user('admin');
        GoogleCalendarConnection::create(['connected_by_user_id' => $admin->id, 'google_account_email' => 'boss@example.com', 'access_token' => ['access_token' => 'secret'], 'refresh_token' => 'refresh-secret', 'is_active' => true]);
        Sanctum::actingAs($admin);
        $this->getJson('/api/google-calendar/status')->assertOk()->assertJsonMissing(['access_token'])->assertJsonMissing(['refresh_token']);
        $this->deleteJson('/api/google-calendar/disconnect')->assertOk();
        $this->getJson('/api/calendar/events?start=2026-08-01&end=2026-09-01')->assertJsonPath('events.0.id', 'service-'.$service->id);
    }

    public function test_google_failure_does_not_break_service_events(): void
    {
        $service = $this->service('2026-08-12');
        $admin = $this->user('admin');
        $connection = GoogleCalendarConnection::create(['connected_by_user_id' => $admin->id, 'google_account_email' => 'boss@example.com', 'access_token' => ['access_token' => 'secret'], 'refresh_token' => 'refresh-secret', 'selected_calendar_ids' => ['primary'], 'is_active' => true]);
        $mock = Mockery::mock(GoogleCalendarService::class);
        $mock->shouldReceive('events')->andThrow(new \RuntimeException('revoked'));
        $this->app->instance(GoogleCalendarService::class, $mock);
        Sanctum::actingAs($admin);
        $this->getJson('/api/calendar/events?start=2026-08-01&end=2026-09-01&include_google=1')->assertOk()->assertJsonPath('events.0.id', 'service-'.$service->id)->assertJsonCount(1, 'warnings');
        $this->assertNotNull($connection->fresh()->last_error);
    }
}
