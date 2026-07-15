<?php

namespace App\Http\Controllers;

use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ClientController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Client::query()->orderBy('company_name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $client = Client::create($this->validated($request));

        return response()->json($client, 201);
    }

    public function show(Client $client): JsonResponse
    {
        return response()->json($client->load('machines'));
    }

    public function update(Request $request, Client $client): JsonResponse
    {
        $client->update($this->validated($request, true));

        return response()->json($client->fresh());
    }

    public function destroy(Client $client): Response
    {
        $client->delete();

        return response()->noContent();
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes|required' : 'required';

        return $request->validate([
            'company_name' => [$required, 'string', 'max:255'],
            'contact_person' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
