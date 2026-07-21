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
            : $this->secret('Password (minimum 12 characters)');

        if (! is_string($password) || strlen($password) < 12) {
            $this->error('Password must contain at least 12 characters.');

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
