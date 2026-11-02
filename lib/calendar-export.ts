import {fixtureObservationIsFresh} from './matches/publication';
const escape=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const stamp=(value:number|string)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
// RFC 5545 folds at 75 octets without splitting a Unicode code point.
const fold=(line:string)=>{let result='',bytes=0;for(const char of line){const size=Buffer.byteLength(char);if(bytes+size>75){result+='\r\n ';bytes=1;}result+=char;bytes+=size;}return result;};
export function matchCalendar(event:any,url:string,now=Date.now()){
 const tentative=/postpon|confirm/i.test(event.phase||'')||!fixtureObservationIsFresh(event.fixtureSource?.checkedAt||event.observedAt,now);
 const status=/cancel/i.test(event.phase||'')?'CANCELLED':tentative?'TENTATIVE':'CONFIRMED';
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//WHOPLAYSNOW//Sports Schedule//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+escape(event.id)+'@whoplaysnow.com','DTSTAMP:'+stamp(now),'DTSTART:'+stamp(event.startsAt),'STATUS:'+status,'SUMMARY:'+escape(event.title),'DESCRIPTION:'+escape((tentative?'Schedule subject to confirmation.\n':'')+'Viewing details: '+url),...(event.venue?.name?['LOCATION:'+escape([event.venue.name,event.venue.city,event.venue.country].filter(Boolean).join(', '))]:[]),'URL:'+url,'END:VEVENT','END:VCALENDAR'];
 return lines.map(fold).join('\r\n')+'\r\n';
}
