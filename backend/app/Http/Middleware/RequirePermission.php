<?php
namespace App\Http\Middleware;use Closure;use Illuminate\Http\Request;use Symfony\Component\HttpFoundation\Response;
class RequirePermission{public function handle(Request $r,Closure $next,string $permission):Response{if(!$r->user()?->hasPermission($permission))return response()->json(['message'=>'Forbidden','required_permission'=>$permission],403);return $next($r);}}
