// Shared Moscow calendar arithmetic; no dependence on browser/server timezone.
export const DAY=86400000;
export const dateKey=t=>new Date(Number(t)+3*3600000).toISOString().slice(0,10);
export function validDay(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function rangeFor(date,view='day'){
 if(!validDay(date)||!['day','week','month'].includes(view))throw Error('Проверьте дату и период');
 const d=new Date(date+'T00:00:00Z');
 if(view==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 if(view==='month')d.setUTCDate(1);
 const first=d.toISOString().slice(0,10),end=new Date(d);
 if(view==='month')end.setUTCMonth(end.getUTCMonth()+1);else end.setUTCDate(end.getUTCDate()+(view==='week'?7:1));
 const startMs=Date.parse(first+'T00:00:00+03:00'),endMs=Date.parse(end.toISOString().slice(0,10)+'T00:00:00+03:00');
 return {date,view,first,start:new Date(startMs).toISOString(),end:new Date(endMs).toISOString(),days:Array.from({length:Math.round((endMs-startMs)/DAY)},(_,i)=>dateKey(startMs+i*DAY))};
}
export function bookingStats(rows,range){
 const buckets=range.view==='day'?Array.from({length:24},(_,i)=>({key:String(i).padStart(2,'0')+':00',start:Date.parse(range.start)+i*3600000,end:Date.parse(range.start)+(i+1)*3600000,app:0,admin:0})):range.days.map(d=>({key:d,start:Date.parse(d+'T00:00:00+03:00'),end:Date.parse(d+'T00:00:00+03:00')+DAY,app:0,admin:0}));
 for(const r of rows){if(r.status!=='confirmed'||r.cancelledAt)continue;for(const b of buckets){const hours=Math.max(0,Math.min(b.end,Date.parse(r.startsAt)+r.duration*60000)-Math.max(b.start,Date.parse(r.startsAt)))/3600000;b[r.source==='admin'?'admin':'app']+=hours;}}
 const app=buckets.reduce((n,b)=>n+b.app,0),admin=buckets.reduce((n,b)=>n+b.admin,0);return {app,admin,total:app+admin,buckets:buckets.map(({key,app,admin})=>({key,app,admin,total:app+admin}))};
}
