import React from "react";

export default function Jobs() {
    return (
        <div className="max-w-7xl mx-auto space-y-6">

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">
                        Jobs
                    </h1>

                    <p className="text-muted-foreground">
                        View and manage all active and completed workshop jobs.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4">

                <div className="rounded-xl border p-5">
                    <h3 className="text-sm text-muted-foreground">
                        Active Jobs
                    </h3>

                    <p className="text-3xl font-bold">
                        0
                    </p>
                </div>

                <div className="rounded-xl border p-5">
                    <h3 className="text-sm text-muted-foreground">
                        Completed
                    </h3>

                    <p className="text-3xl font-bold">
                        0
                    </p>
                </div>

                <div className="rounded-xl border p-5">
                    <h3 className="text-sm text-muted-foreground">
                        Collected
                    </h3>

                    <p className="text-3xl font-bold">
                        0
                    </p>
                </div>

                <div className="rounded-xl border p-5">
                    <h3 className="text-sm text-muted-foreground">
                        Waiting Parts
                    </h3>

                    <p className="text-3xl font-bold">
                        0
                    </p>
                </div>

            </div>

            <div className="rounded-xl border p-6">

                <h2 className="text-xl font-semibold mb-4">
                    Active Jobs
                </h2>

                <p className="text-muted-foreground">
                    Jobs will appear here.
                </p>

            </div>

        </div>
    );
}