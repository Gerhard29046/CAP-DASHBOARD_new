<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CreateAdministratorCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_administrator_can_be_created_from_a_password_environment_variable(): void
    {
        putenv('TEST_ADMIN_PASSWORD=temporary-password-123');

        try {
            $this->artisan('admin:create', [
                'email' => 'admin@example.com',
                '--name' => 'Production Administrator',
                '--password-env' => 'TEST_ADMIN_PASSWORD',
            ])->assertSuccessful();

            $administrator = User::where('email', 'admin@example.com')->firstOrFail();

            $this->assertSame('admin', $administrator->role);
            $this->assertTrue($administrator->is_active);
            $this->assertTrue($administrator->must_change_password);
            $this->assertTrue(Hash::check('temporary-password-123', $administrator->password));
        } finally {
            putenv('TEST_ADMIN_PASSWORD');
        }
    }
}
