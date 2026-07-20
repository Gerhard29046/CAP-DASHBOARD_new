<?php

use App\Http\Controllers\ClientController;
use App\Http\Controllers\JobCardController;
use App\Http\Controllers\JobCardLineController;
use App\Http\Controllers\MachineController;
use App\Http\Controllers\ServiceRecordController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\KnowledgeFileController;
use App\Http\Controllers\KnowledgeMachineController;
use App\Http\Controllers\KnowledgeNoteController;
use App\Http\Controllers\KnowledgeServiceCodeController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\GoogleCalendarController;
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
    ]);
});

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function () {
Route::post('/logout', [AuthController::class, 'logout']);
Route::get('/me', [AuthController::class, 'me']);
Route::get('calendar/events',[CalendarController::class,'events'])->middleware('permission:calendar.view');
Route::get('google-calendar/status',[GoogleCalendarController::class,'status'])->middleware('permission:calendar.google.view');
Route::get('google-calendar/connect',[GoogleCalendarController::class,'connect'])->middleware('permission:calendar.google.connect');
Route::get('google-calendar/calendars',[GoogleCalendarController::class,'calendars'])->middleware('permission:calendar.google.view');
Route::put('google-calendar/calendars',[GoogleCalendarController::class,'select'])->middleware('permission:calendar.google.calendars.select');
Route::delete('google-calendar/disconnect',[GoogleCalendarController::class,'disconnect'])->middleware('permission:calendar.google.disconnect');
Route::apiResource('clients',ClientController::class)->middlewareFor(['index','show'],'permission:clients.view')->middlewareFor('store','permission:clients.create')->middlewareFor('update','permission:clients.edit')->middlewareFor('destroy','permission:clients.delete');
Route::apiResource('machines',MachineController::class)->middlewareFor(['index','show'],'permission:machines.view')->middlewareFor('store','permission:machines.create')->middlewareFor('update','permission:machines.edit')->middlewareFor('destroy','permission:machines.delete');
Route::apiResource('service-records',ServiceRecordController::class)->middlewareFor(['index','show'],'permission:services.view')->middlewareFor('store','permission:services.create')->middlewareFor('update','permission:services.edit')->middlewareFor('destroy','permission:services.delete');
Route::apiResource('job-cards',JobCardController::class)->middlewareFor(['index','show'],'permission:job_cards.view')->middlewareFor('store','permission:job_cards.create')->middlewareFor('update','permission:job_cards.edit')->middlewareFor('destroy','permission:job_cards.delete');
Route::apiResource('job-card-lines',JobCardLineController::class)->middleware('permission:job_cards.lines.manage');
Route::apiResource('admin/users',AdminUserController::class)->middleware('permission:users.view');
Route::apiResource('users',AdminUserController::class)->middleware('permission:users.view');
Route::get('permissions',[PermissionController::class,'index'])->middleware('permission:users.permissions.manage');
Route::get('roles/permissions',[PermissionController::class,'roles'])->middleware('permission:users.permissions.manage');
Route::get('users/{user}/permissions',[PermissionController::class,'user'])->middleware('permission:users.permissions.manage');
Route::put('users/{user}/permissions',[PermissionController::class,'updateUser'])->middleware('permission:users.permissions.manage');
Route::put('users/{user}/role',[PermissionController::class,'updateRole'])->middleware('permission:users.roles.manage');
Route::patch('users/{user}/status',[AdminUserController::class,'status'])->middleware('permission:users.disable');
Route::get('permission-audit-logs',[PermissionController::class,'audit'])->middleware('permission:system_logs.view');
Route::apiResource('knowledge-machines',KnowledgeMachineController::class)->except('create','edit');
Route::get('knowledge-machines/{knowledgeMachine}/notes',[KnowledgeNoteController::class,'index']);
Route::post('knowledge-machines/{knowledgeMachine}/notes',[KnowledgeNoteController::class,'store']);
Route::patch('knowledge-notes/{knowledgeNote}',[KnowledgeNoteController::class,'update']);
Route::delete('knowledge-notes/{knowledgeNote}',[KnowledgeNoteController::class,'destroy']);
Route::get('knowledge-machines/{knowledgeMachine}/media',[KnowledgeFileController::class,'mediaIndex']);
Route::post('knowledge-machines/{knowledgeMachine}/media',[KnowledgeFileController::class,'mediaStore']);
Route::get('knowledge-media/{knowledgeMedia}/file',[KnowledgeFileController::class,'mediaFile']);
Route::delete('knowledge-media/{knowledgeMedia}',[KnowledgeFileController::class,'mediaDestroy']);
Route::get('knowledge-machines/{knowledgeMachine}/documents',[KnowledgeFileController::class,'documentIndex']);
Route::post('knowledge-machines/{knowledgeMachine}/documents',[KnowledgeFileController::class,'documentStore']);
Route::get('knowledge-documents/{knowledgeDocument}/file',[KnowledgeFileController::class,'documentFile']);
Route::delete('knowledge-documents/{knowledgeDocument}',[KnowledgeFileController::class,'documentDestroy']);
Route::get('knowledge-machines/{knowledgeMachine}/service-codes',[KnowledgeServiceCodeController::class,'index']);
Route::post('knowledge-machines/{knowledgeMachine}/service-codes',[KnowledgeServiceCodeController::class,'store']);
Route::patch('knowledge-service-codes/{knowledgeServiceCode}',[KnowledgeServiceCodeController::class,'update']);
Route::delete('knowledge-service-codes/{knowledgeServiceCode}',[KnowledgeServiceCodeController::class,'destroy']);
Route::post('knowledge-service-codes/{knowledgeServiceCode}/reveal',[KnowledgeServiceCodeController::class,'reveal']);
});
