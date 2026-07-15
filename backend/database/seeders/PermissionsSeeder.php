<?php
namespace Database\Seeders;use App\Models\{Permission,RolePermission};use Illuminate\Database\Seeder;use Illuminate\Support\Facades\DB;use Illuminate\Support\Str;
class PermissionsSeeder extends Seeder{public function run():void{DB::transaction(function(){
$groups=[
'Dashboard'=>['dashboard.view','dashboard.statistics.view','dashboard.activity.view'],
'Clients'=>['clients.view','clients.create','clients.edit','clients.delete','clients.contact_details.view'],
'Machines'=>['machines.view','machines.create','machines.edit','machines.delete','machines.reassign','machines.photos.upload','machines.service_history.view'],
'Machine Knowledge Base'=>['knowledge_base.view','knowledge_base.create','knowledge_base.edit','knowledge_base.delete','knowledge_base.files.upload','knowledge_base.passwords.view','knowledge_base.passwords.manage'],
'Service Records'=>['services.view','services.create','services.edit','services.delete','services.complete','services.next_date.schedule'],
'Upcoming Services'=>['upcoming_services.view','upcoming_services.update','upcoming_services.complete','upcoming_services.reminders.send'],
'Calendar'=>['calendar.view','calendar.google.view','calendar.google.connect','calendar.google.disconnect','calendar.google.calendars.select'],
'Job Cards and Book-Ins'=>['job_cards.view','job_cards.create','job_cards.edit','job_cards.delete','job_cards.technician.assign','job_cards.status.update','job_cards.lines.manage','job_cards.findings.manage','job_cards.work_performed.manage','job_cards.photos.upload','job_cards.complete','job_cards.return_to_client'],
'Quotations and Invoices'=>['quotations.view','quotations.create','quotations.edit','quotations.approve','invoices.queue.view','invoices.create','invoices.edit','invoices.process','sage.sync'],
'Reports'=>['reports.view','reports.export','reports.financial.view','reports.technician_performance.view'],
'User Administration'=>['users.view','users.create','users.edit','users.disable','users.delete','users.password.reset','users.roles.manage','users.permissions.manage','users.login_activity.view'],
'System Administration'=>['settings.manage','notifications.manage','sage.settings.manage','system_logs.view','archived_records.manage']];
foreach($groups as $group=>$keys)foreach($keys as $key)Permission::updateOrCreate(['key'=>$key],['name'=>Str::of($key)->after('.')->replace(['.','_'],' ')->title(),'group'=>$group,'description'=>'Controls '.str_replace(['.','_'],' ',$key).'.']);
$all=Permission::pluck('id','key');$technician=['dashboard.view','dashboard.statistics.view','clients.view','machines.view','machines.create','machines.edit','machines.photos.upload','machines.service_history.view','knowledge_base.view','knowledge_base.passwords.view','services.view','services.create','services.edit','services.complete','services.next_date.schedule','upcoming_services.view','upcoming_services.update','job_cards.view','job_cards.create','job_cards.edit','job_cards.status.update','job_cards.lines.manage','job_cards.findings.manage','job_cards.work_performed.manage','job_cards.photos.upload','job_cards.complete','job_cards.return_to_client'];$accountant=['dashboard.view','dashboard.statistics.view','clients.view','machines.view','machines.service_history.view','job_cards.view','quotations.view','quotations.create','quotations.edit','invoices.queue.view','invoices.create','invoices.edit','invoices.process','sage.sync','reports.view','reports.export','reports.financial.view'];
$calendarView=['calendar.view','calendar.google.view'];$technician=array_merge($technician,$calendarView);$accountant=array_merge($accountant,$calendarView);
RolePermission::whereIn('role',['admin','technician','accountant','custom'])->delete();foreach(['admin'=>$all->keys()->all(),'technician'=>$technician,'accountant'=>$accountant,'custom'=>[]] as $role=>$keys)foreach($keys as $key)RolePermission::create(['role'=>$role,'permission_id'=>$all[$key]]);
});}}
