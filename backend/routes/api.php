<?php

use App\Http\Controllers\ClientController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API health check
|--------------------------------------------------------------------------
|
| Confirms that Laravel can connect to the configured MySQL database.
|
*/

Route::get('/health', function () {
    DB::connection()->getPdo();

    return response()->json([
        'status' => 'ok',
        'message' => 'Laravel API and database connection are working.',
        'database' => DB::connection()->getDatabaseName(),
    ]);
});

Route::apiResource('clients', ClientController::class);

Route::get('/machines', function () {
    return DB::table('machines')
        ->orderBy('brand')
        ->orderBy('model')
        ->get();
});
