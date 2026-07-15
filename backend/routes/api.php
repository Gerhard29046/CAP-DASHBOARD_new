<?php

use App\Http\Controllers\ClientController;
use App\Http\Controllers\JobCardController;
use App\Http\Controllers\JobCardLineController;
use App\Http\Controllers\MachineController;
use App\Http\Controllers\ServiceRecordController;
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
Route::apiResources([
    'machines' => MachineController::class,
    'service-records' => ServiceRecordController::class,
    'job-cards' => JobCardController::class,
    'job-card-lines' => JobCardLineController::class,
]);
