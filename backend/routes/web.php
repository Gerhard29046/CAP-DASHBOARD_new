<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\GoogleCalendarController;

Route::get('/', function () {
    return view('welcome');
});
Route::get('/google-calendar/callback',[GoogleCalendarController::class,'callback'])->name('google-calendar.callback');
