<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class CreateAdministrator extends Command
{
    protected $signature = 'admin:create
        {email?}
        {--name= : Administrator display name}
        {--password-env= : Read the password from this environment variable}';

    protected $description = 'Create or update the initial administrator';

    public function handle(): int
    {
        $email = $this->argument('email') ?: $this->ask('Administrator email');
        $name = $this->option('name') ?: $this->ask('Administrator name', 'Administrator');
        $passwordVariable = $this->option('password-env');
        $password = $passwordVariable
            ? getenv($passwordVariable)
            : $this->secret('Password (8+ characters with uppercase, lowercase, number, and symbol)');

        if (! is_string($password) || ! preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/', $password)) {
            $this->error('Password must contain at least 8 characters, including uppercase, lowercase, a number, and a symbol.');

            return self::FAILURE;
        }

        User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => $password,
                'role' => 'admin',
                'is_active' => true,
                'must_change_password' => true,
            ],
        );

        $this->info('Administrator account is ready.');

        return self::SUCCESS;
    }
}
