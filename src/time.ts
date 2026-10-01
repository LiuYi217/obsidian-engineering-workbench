/** Meeting instants are stored as ISO timestamps; only the host's local zone is used for UI. */
function validInstant(value:string):Date {const result=new Date(value);if(!Number.isFinite(result.getTime()))throw new Error('会议时间无效');return result;}
export function formatLocalDateTime(value:string,timeZone?:string):string {
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return `${value}（时间未记录）`;
  const parts=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'longOffset',...(timeZone?{timeZone}:{})}).formatToParts(validInstant(value));
  const get=(name:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===name)?.value||'';
  const zone=get('timeZoneName').replace(/^GMT/,'UTC');
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ${zone==='UTC'?'UTC+00:00':zone}`;
}
export function toLocalDateTimeInput(value:string):string {
  const date=validInstant(value),pad=(n:number)=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function localDateTimeToISO(value:string):string {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('请选择有效的本地日期和时间');
  const date=validInstant(value),iso=date.toISOString();
  if(toLocalDateTimeInput(iso)!==value)throw new Error('无效的本地时间，请检查日期或夏令时变化');
  return iso;
}
export function compareInstantsNewestFirst(a:string,b:string):number {return validInstant(b).getTime()-validInstant(a).getTime();}
