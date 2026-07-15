<?php

namespace Database\Seeders;

use App\Models\Client;
use App\Models\JobCard;
use App\Models\JobCardLine;
use App\Models\Machine;
use App\Models\ServiceRecord;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            $clients = collect([
                ['account_number'=>'DEMO-CTAA-001','company_name'=>'Cape Town Auto Air','contact_person'=>'Michael Daniels','email'=>'service@capetownautoair.test','phone'=>'082 555 0101','mobile'=>'082 555 0101','address'=>'12 Montague Drive','suburb'=>'Montague Gardens','city'=>'Cape Town','province'=>'Western Cape','postal_code'=>'7441','country'=>'South Africa','is_active'=>true,'notes'=>'Demo automotive air-conditioning workshop.'],
                ['account_number'=>'DEMO-PMW-002','company_name'=>'Paarl Motor Works','contact_person'=>'Annelize Botha','email'=>'workshop@paarlmotorworks.test','phone'=>'082 555 0102','mobile'=>'082 555 0102','address'=>'48 Main Road','suburb'=>'Southern Paarl','city'=>'Paarl','province'=>'Western Cape','postal_code'=>'7646','country'=>'South Africa','is_active'=>true,'notes'=>'Demo independent vehicle workshop.'],
                ['account_number'=>'DEMO-SFS-003','company_name'=>'Stellenbosch Fleet Services','contact_person'=>'Thabo Mokoena','email'=>'service@stellenboschfleet.test','phone'=>'082 555 0103','mobile'=>'082 555 0103','address'=>'7 Plankenbrug Street','suburb'=>'Plankenbrug','city'=>'Stellenbosch','province'=>'Western Cape','postal_code'=>'7600','country'=>'South Africa','is_active'=>true,'notes'=>'Demo fleet-maintenance customer.'],
                ['account_number'=>'DEMO-BAC-004','company_name'=>'Bellville Auto Climate','contact_person'=>'Yusuf Khan','email'=>'accounts@bellvilleautoclimate.test','phone'=>'082 555 0104','mobile'=>'082 555 0104','address'=>'31 Strand Road','suburb'=>'Bellville','city'=>'Cape Town','province'=>'Western Cape','postal_code'=>'7530','country'=>'South Africa','is_active'=>true,'notes'=>'Demo automotive climate-control specialist.'],
            ])->mapWithKeys(function (array $data): array {
                $client = Client::updateOrCreate(['account_number' => $data['account_number']], $data);
                return [$data['account_number'] => $client];
            });

            $machines = collect([
                ['account'=>'DEMO-CTAA-001','serial_number'=>'DEMO-WG-PR-134-001','brand'=>'Wigam','model'=>'PRATIKA','refrigerant_type'=>'R134a','installation_date'=>'2024-02-15','warranty_expiry'=>'2026-02-15','is_active'=>true,'notes'=>'Primary R134a service station.'],
                ['account'=>'DEMO-CTAA-001','serial_number'=>'DEMO-WG-PR-1234-002','brand'=>'Wigam','model'=>'PRATIKA 1234','refrigerant_type'=>'R1234yf','installation_date'=>'2025-03-10','warranty_expiry'=>'2027-03-10','is_active'=>true,'notes'=>'R1234yf service station.'],
                ['account'=>'DEMO-PMW-002','serial_number'=>'DEMO-WG-KB-134-003','brand'=>'Wigam','model'=>'KUBO','refrigerant_type'=>'R134a','installation_date'=>'2023-08-21','warranty_expiry'=>'2025-08-21','is_active'=>true,'notes'=>'Workshop recovery and recharge machine.'],
                ['account'=>'DEMO-SFS-003','serial_number'=>'DEMO-WG-KB-1234-004','brand'=>'Wigam','model'=>'KUBO 1234','refrigerant_type'=>'R1234yf','installation_date'=>'2025-01-12','warranty_expiry'=>'2027-01-12','is_active'=>true,'notes'=>'Fleet R1234yf machine.'],
                ['account'=>'DEMO-SFS-003','serial_number'=>'DEMO-WG-PC-134-005','brand'=>'Wigam','model'=>'PICCOLA','refrigerant_type'=>'R134a','installation_date'=>'2022-06-05','warranty_expiry'=>'2024-06-05','is_active'=>false,'trade_in_invoice_number'=>'DEMO-INV-TRADE-001','notes'=>'Older machine retained for service-history testing.'],
                ['account'=>'DEMO-BAC-004','serial_number'=>'DEMO-WG-OP-1234-006','brand'=>'Wigam','model'=>'OPTIMA','refrigerant_type'=>'R1234yf','installation_date'=>'2024-11-18','warranty_expiry'=>'2026-11-18','is_active'=>true,'notes'=>'Main R1234yf workshop machine.'],
            ])->mapWithKeys(function (array $data) use ($clients): array {
                $account = $data['account']; unset($data['account']);
                $data['client_id'] = $clients[$account]->id;
                $machine = Machine::updateOrCreate(['serial_number' => $data['serial_number']], $data);
                return [$data['serial_number'] => $machine];
            });

            $today = Carbon::today();
            foreach ([
                ['serial'=>'DEMO-WG-PR-134-001','invoice_number'=>'DEMO-INV-1001','service_date'=>$today->copy()->subMonths(11),'next_service_due'=>$today->copy()->addDays(30),'service_type'=>'Annual Preventative Maintenance','status'=>'Completed','technician_name'=>'Gerhard van Wijk','work_performed'=>'Inspected hoses, replaced vacuum-pump oil, verified pressure sensors and completed leak test.','parts_used'=>'Vacuum-pump oil and inlet filter','labour_hours'=>2.5],
                ['serial'=>'DEMO-WG-PR-1234-002','invoice_number'=>'DEMO-INV-1002','service_date'=>$today->copy()->subMonths(12),'next_service_due'=>$today->copy()->addDays(10),'service_type'=>'Annual Preventative Maintenance','status'=>'Completed','technician_name'=>'Gerhard van Wijk','work_performed'=>'Full operational test, scale calibration and refrigerant identifier inspection.','labour_hours'=>2],
                ['serial'=>'DEMO-WG-KB-134-003','invoice_number'=>'DEMO-INV-1003','service_date'=>$today->copy()->subMonths(13),'next_service_due'=>$today->copy()->subDays(20),'service_type'=>'Annual Preventative Maintenance','status'=>'Overdue','technician_name'=>'Gerhard van Wijk','work_performed'=>'Previous annual service completed.','labour_hours'=>1.5],
                ['serial'=>'DEMO-WG-KB-1234-004','invoice_number'=>'DEMO-INV-1004','service_date'=>$today->copy()->subMonths(4),'next_service_due'=>$today->copy()->addMonths(8),'service_type'=>'Commissioning Inspection','status'=>'Completed','technician_name'=>'Gerhard van Wijk','work_performed'=>'Commissioning checks and operator training.','labour_hours'=>3],
            ] as $data) {
                $serial=$data['serial']; unset($data['serial']); $data['machine_id']=$machines[$serial]->id;
                ServiceRecord::updateOrCreate(['invoice_number'=>$data['invoice_number']],$data);
            }

            $jobs = collect([
                ['job_number'=>'DEMO-JC-2026-001','serial'=>'DEMO-WG-PR-134-001','status'=>'Booked In','date_received'=>$today,'received_by'=>'Gerhard van Wijk','technician_name'=>'Unassigned','fault_description'=>'Machine does not build sufficient recovery pressure.','accessories_received'=>'Two service hoses and power cable','arrival_condition'=>'Fair','arrival_condition_notes'=>'Light workshop wear. No visible cabinet damage.','quotation_required'=>true],
                ['job_number'=>'DEMO-JC-2026-002','serial'=>'DEMO-WG-PR-1234-002','status'=>'In Progress','date_received'=>$today->copy()->subDays(2),'received_by'=>'Gerhard van Wijk','technician_name'=>'Technician One','fault_description'=>'Printer feeds paper but does not print job report.','accessories_received'=>'Power cable and printer roll','arrival_condition'=>'Good','work_performed'=>'Printer assembly opened and initial electrical test completed.','technician_notes'=>'Printer head or controller board requires further testing.','quotation_required'=>true,'quotation_number'=>'DEMO-QUO-2002'],
                ['job_number'=>'DEMO-JC-2026-003','serial'=>'DEMO-WG-KB-134-003','status'=>'Completed','date_received'=>$today->copy()->subDays(7),'date_completed'=>$today->copy()->subDay(),'received_by'=>'Gerhard van Wijk','technician_name'=>'Technician Two','fault_description'=>'Vacuum pump noisy and unable to reach required vacuum.','accessories_received'=>'Power cable and three hoses','arrival_condition'=>'Fair','work_performed'=>'Replaced vacuum-pump oil, cleaned filter and completed vacuum performance test.','technician_notes'=>'Machine passed final operating test.','quotation_required'=>false,'invoice_number'=>'DEMO-INV-2003'],
                ['job_number'=>'DEMO-JC-2026-004','serial'=>'DEMO-WG-OP-1234-006','status'=>'Collected','date_received'=>$today->copy()->subDays(14),'date_completed'=>$today->copy()->subDays(5),'date_returned'=>$today->copy()->subDays(3),'received_by'=>'Gerhard van Wijk','technician_name'=>'Technician One','fault_description'=>'High-pressure service hose leaking at coupling.','accessories_received'=>'Complete hose set and power cable','arrival_condition'=>'Good','work_performed'=>'Replaced high-pressure hose assembly and performed pressure leak test.','technician_notes'=>'Customer collected machine after successful testing.','quotation_required'=>false,'invoice_number'=>'DEMO-INV-2004'],
            ])->mapWithKeys(function(array $data) use($machines): array {
                $serial=$data['serial']; unset($data['serial']); $data['machine_id']=$machines[$serial]->id; $data['client_id']=$machines[$serial]->client_id;
                $job=JobCard::updateOrCreate(['job_number'=>$data['job_number']],$data); return [$data['job_number']=>$job];
            });

            foreach ([
                ['job'=>'DEMO-JC-2026-001','line_type'=>'Labour','product_code'=>'DIAG-001','description'=>'Diagnostic inspection','quantity'=>1,'unit_price'=>650],
                ['job'=>'DEMO-JC-2026-001','line_type'=>'Product','product_code'=>'FIL-134','description'=>'Recovery inlet filter','quantity'=>1,'unit_price'=>280],
                ['job'=>'DEMO-JC-2026-002','line_type'=>'Labour','product_code'=>'LAB-PRINTER','description'=>'Printer diagnostic labour','quantity'=>1.5,'unit_price'=>500],
                ['job'=>'DEMO-JC-2026-003','line_type'=>'Labour','product_code'=>'LAB-SERVICE','description'=>'Vacuum-pump service labour','quantity'=>2.5,'unit_price'=>500],
                ['job'=>'DEMO-JC-2026-003','line_type'=>'Product','product_code'=>'OIL-VP','description'=>'Vacuum-pump oil','quantity'=>2,'unit_price'=>140],
                ['job'=>'DEMO-JC-2026-003','line_type'=>'Product','product_code'=>'FIL-VP','description'=>'Vacuum-pump filter','quantity'=>1,'unit_price'=>140],
                ['job'=>'DEMO-JC-2026-004','line_type'=>'Labour','product_code'=>'LAB-HOSE','description'=>'Hose replacement labour','quantity'=>1.3,'unit_price'=>500],
                ['job'=>'DEMO-JC-2026-004','line_type'=>'Product','product_code'=>'HOSE-HP-1234','description'=>'R1234yf high-pressure hose assembly','quantity'=>1,'unit_price'=>1850],
            ] as $data) {
                $job=$jobs[$data['job']]; unset($data['job']); $data['job_card_id']=$job->id; $data['line_total']=$data['quantity']*$data['unit_price'];
                JobCardLine::updateOrCreate(['job_card_id'=>$job->id,'product_code'=>$data['product_code']],$data);
            }

            foreach ($jobs as $job) {
                $lines=$job->jobCardLines()->get();
                $job->update(['labour_total'=>$lines->where('line_type','Labour')->sum('line_total'),'parts_total'=>$lines->where('line_type','!=','Labour')->sum('line_total')]);
            }
        });
    }
}
