<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DemoUsersSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            foreach ([
                [
                    'name' => 'Administrator',
                    'email' => 'admin@connoisseurauto.co.za',
                    'password' => 'admin123',
                    'role' => 'admin',
                ],
                [
                    'name' => 'Technician',
                    'email' => 'technician@connoisseurauto.co.za',
                    'password' => 'tech123',
                    'role' => 'technician',
                ],
                [
                    'name' => 'Accountant',
                    'email' => 'accounts@connoisseurauto.co.za',
                    'password' => 'acc123',
                    'role' => 'accountant',
                ],
            ] as $account) {
                User::updateOrCreate(
                    ['email' => $account['email']],
                    [
                        'name' => $account['name'],
                        'password' => Hash::make($account['password']),
                        'role' => $account['role'],
                        'is_active' => true,
                        'must_change_password' => false,
                    ],
                );
            }
        });
    }
}
