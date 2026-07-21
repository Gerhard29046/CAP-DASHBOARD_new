<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class RouteCacheTest extends TestCase
{
    public function test_routes_can_be_cached_for_production(): void
    {
        $this->assertSame(0, Artisan::call('route:cache'));

        Artisan::call('route:clear');
    }
}
