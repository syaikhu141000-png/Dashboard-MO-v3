// Jana data.json untuk Report Marketing V2 (public).
// Guna: node build.mjs --xlsx CC5.xlsx --meta meta.json [--metaupd minggu_baru.json] --locks DIR --notes DIR --year 2026 --out data.json [--rawxlsx CC5_WEEKLY.xlsx]
// - metaupd: {"11-3":{spend,lm,acc,until}} minggu Meta yang baru ditarik (ganti minggu sama dalam meta)
// - xlsx  : CC5 IMPORTEDDATA (export xlsx dari Google Drive)
// - rawxlsx: CC5 "SALE & MARKETING REPORT WEEKLY" (Sheet1..Sheet12 = salinan terus CC2, lajur A:K/A:H,
//            IMPORTRANGE tanpa ubah). Kalau diberi: Leads Sales/Intro/Booking/Enroll Facebook dikira
//            semula ikut TARIKH SEBENAR dan disimpan BERASINGAN dalam "rawCC2.Facebook" (TIDAK menimpa
//            "raw.Facebook" — tu kekal CC5 macam asal). Page pilih sumber mana nak papar (toggle
//            CC5/CC2, default CC5) utk Facebook sahaja; Google/TikTok tiada rawCC2, kekal CC5 je.
//            lm & spend Facebook tak disentuh langsung oleh rawCC2 (lm dari CC5 ringkasan / spend dari Meta).
// - meta  : {at, weeks:{"m-w":{spend,lm,...}}}  (spend SEBELUM 8% cukai; page tambah 8%)
// - locks : folder fail JSON doc "locks" (satu fail satu doc) dari page V2
// - notes : folder fail JSON doc "notes" dari page V2
// Sel kosong = null. Tiada nombor direka.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const X = require("xlsx");
const A = {}; process.argv.slice(2).forEach((v,i,a)=>{ if(v.startsWith("--")) A[v.slice(2)]=a[i+1]; });
const YEAR = +(A.year||new Date().getFullYear());
var SECT={FACEBOOK:'Facebook',GOOGLE:'Google',TIKTOK:'TikTok'};
var MTAB=[['JAN'],['FEB'],['MAC','MAR'],['APRIL','APR'],['MEI','MAY'],['JUN'],['JULAI','JUL'],['OGOS','AUG'],['SEPT','SEP'],['OKT','OCT'],['NOV'],['DIS','DEC']];
var F=['lm','ls','intro','book','enrol','spend'];
/* ---------- baca CSV ---------- */
function parseCSV(t){
  var rows=[],row=[],f='',q=false;
  for(var i=0;i<t.length;i++){ var ch=t[i];
    if(q){ if(ch==='"'){ if(t[i+1]==='"'){f+='"';i++;} else q=false; } else f+=ch; }
    else if(ch==='"') q=true;
    else if(ch===','){ row.push(f); f=''; }
    else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&t[i+1]==='\n') i++; row.push(f); f=''; rows.push(row); row=[]; }
    else f+=ch;
  }
  if(f!==''||row.length){ row.push(f); rows.push(row); }
  return rows;
}
function cell(v){ /* sel kosong atau ralat = null */
  if(v==null) return null; var t=String(v).trim(); if(t===''||t.charAt(0)==='#') return null;
  t=t.replace(/RM/gi,'').replace(/[,\s]/g,''); if(/%$/.test(t)) return null;
  var n=parseFloat(t); return isNaN(n)?null:n;
}
function isHeader(r){
  var a=String(r[0]||'').trim(); if(!a||a.indexOf(':')>=0||/^RM/i.test(a)||!isNaN(parseFloat(a))) return false;
  for(var c=1;c<=12;c++) if(String(r[c]||'').trim()!=='') return false;
  return true;
}
/* Ambil nilai mingguan blok platform. Lajur minggu: C, E, G, I (indeks 2,4,6,8). */
function parseMonth(text){
  var rows=parseCSV(text), out={}, cur=null, blk=null;
  rows.forEach(function(r){
    if(isHeader(r)){
      var h=String(r[0]).trim().toUpperCase(), key=null;
      for(var k in SECT) if(h.indexOf(k)===0) key=SECT[k];
      cur=(key&&!out[key])?key:null;
      if(cur){ blk=[{},{},{},{}]; out[cur]=blk; }
      return;
    }
    if(!cur) return;
    var a=String(r[0]||'').trim().toLowerCase(), b=String(r[1]||'').trim().toLowerCase(), f=null;
    if(a.indexOf('total marketer')===0) f='lm';
    else if(a.indexOf('total team sales')===0) f='ls';
    else if(b==='total ads spend') f='spend';
    else if(a.indexOf('booking by week')===0) f='book';
    else if(a.indexOf('intro class')===0) f='intro';
    else if(a.indexOf('total enrollment')===0) f='enrol';
    if(!f) return;
    for(var w=0;w<4;w++) blk[w][f]=cell(r[2+w*2]);
  });
  return out;
}


/* ---------- Facebook terus dari CC2 (Sheet1..Sheet12 dalam CC5 WEEKLY), ikut tarikh sebenar ---------- */
const FB_PLATFORMS=['facebook ads','fb ads whatsform'];
function fbWeekFromRawSheet(ws){
  // Lajur (sama utk semua bulan, A:K): 0 Column1, 1 Tarikh, 2 Umur, 3 Platform, 4 Keyword, 5 No.Telefon, 6 Category, 7 Status.
  const rows=X.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
  const out=[{ls:0,intro:0,book:0,enrol:0},{ls:0,intro:0,book:0,enrol:0},{ls:0,intro:0,book:0,enrol:0},{ls:0,intro:0,book:0,enrol:0}];
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    const p=String(r[3]||'').trim().toLowerCase();
    if(!FB_PLATFORMS.includes(p)) continue;
    const d=r[1]; let dd=null;
    if(typeof d==='number'){ const dt=new Date(Math.round((d-25569)*86400000)); dd=dt.getUTCDate(); }
    else if(d!=null){ const t=String(d).trim().match(/^(\d{1,2})[.\/\-]/); if(t) dd=+t[1]; }
    if(dd==null) continue; // tiada tarikh -> tak dikira (lebih selamat drpd teka minggu)
    const w=dd<=7?0:dd<=14?1:dd<=21?2:3;
    const st=String(r[7]||'').trim().toUpperCase();
    out[w].ls++;
    if(st==='INTRO') out[w].intro++;
    if(st==='BOOKING'||st==='ENROL') out[w].book++;
    if(st==='ENROL') out[w].enrol++;
  }
  return out;
}
function loadFbRaw(file){
  if(!file) return null;
  const wbr=X.readFile(file); const fb={};
  for(let m=1;m<=12;m++){ const ws=wbr.Sheets['Sheet'+m]; if(!ws) continue; fb[m]=fbWeekFromRawSheet(ws); }
  return fb;
}
const FB_RAW=loadFbRaw(A.rawxlsx);

const wb = X.readFile(A.xlsx); const names={}; wb.SheetNames.forEach(n=>names[n.trim().toUpperCase().replace(/\s+/g,' ')]=n);
const yy=String(YEAR).slice(2), now=new Date(Date.now()+8*3600000);
const lastM = now.getUTCFullYear()>YEAR?12:(now.getUTCFullYear()<YEAR?0:now.getUTCMonth()+1);
const raw={}, pl=[], tabs={}, miss=[];
for(let m=1;m<=lastM;m++){
  const tab=MTAB[m-1].map(b=>names[b+' '+yy]).find(Boolean); if(!tab){ miss.push(m); continue; }
  const d=parseMonth(X.utils.sheet_to_csv(wb.Sheets[tab],{blankrows:true}));
  for(const p in d){ if(!pl.includes(p)) pl.push(p); raw[p]=raw[p]||{}; raw[p][m]=d[p].map(w=>{ const o={}; F.forEach(k=>o[k]=w[k]==null?null:w[k]); return o; }); }
  tabs[m]=tab;
}

/* rawCC2.Facebook[m] = [{ls,intro,book,enrol}x4] — BERASINGAN drpd raw.Facebook (CC5), tak menimpa apa-apa.
   Minggu yg belum bermula (tarikh akan datang) = null (tiada data direka). Page yg pilih nak papar CC2 ke CC5. */
const rawCC2={};
if(FB_RAW){
  rawCC2.Facebook={};
  for(const m in FB_RAW){
    rawCC2.Facebook[m]=[0,1,2,3].map(w=>{
      const weekStartDay=w*7+1; // W1=1, W2=8, W3=15, W4=22
      const weekStarted=new Date(Date.UTC(YEAR,m-1,weekStartDay))<=now;
      if(!weekStarted) return null;
      const fw=FB_RAW[m][w];
      return {ls:fw.ls,intro:fw.intro,book:fw.book,enrol:fw.enrol};
    });
  }
}
pl.sort((a,b)=>['Facebook','Google','TikTok'].indexOf(a)-['Facebook','Google','TikTok'].indexOf(b));
if(!pl.length){ console.error("error: tiada tab "+YEAR); process.exit(1); }
function readDir(d){ const o={}; if(!d||!fs.existsSync(d)) return o; for(const f of fs.readdirSync(d)) if(f.endsWith('.json')){ let j=JSON.parse(fs.readFileSync(path.join(d,f),'utf8')); if(j&&j.data&&typeof j.data==='object'&&!j.p&&!j.key) j=j.data; o[f.replace(/\.json$/,'')]=j; } return o; }
let meta={at:null,weeks:{}}; if(A.meta){ const j=JSON.parse(fs.readFileSync(A.meta,'utf8')); const x=(j.weeks?j:(j.data||j)); meta={at:x.at||null,ver:x.ver||null,weeks:x.weeks||{}}; }
if(A.metaupd){ const u=JSON.parse(fs.readFileSync(A.metaupd,'utf8')); for(const k in u){ if(!/^\d{1,2}-[1-4]$/.test(k)) continue; const o=u[k]; if(typeof o.spend!=='number'||typeof o.lm!=='number') continue; meta.weeks[k]=Object.assign({},o,{spend:Math.round(o.spend*100)/100}); } meta.at=new Date().toISOString(); }
const locks=readDir(A.locks), notes=readDir(A.notes);
for(const k in locks) for(const f of ['version','id','createdAt','updatedAt']) delete locks[k][f];
const out={y:YEAR,at:new Date().toISOString(),pl,raw,rawCC2,tabs,meta,locks,notes,
  src:"CC5 IMPORTEDDATA + Meta Ads (MO2+MO4+MO05)"+(FB_RAW?" + CC2 terus tersedia sbg pilihan (Facebook, toggle CC5/CC2 di page)":"")};
fs.writeFileSync(A.out||'data.json',JSON.stringify(out));
console.log(JSON.stringify({ok:true,year:YEAR,tabs,miss,pl,metaWeeks:Object.keys(meta.weeks).length,metaAt:meta.at,locks:Object.keys(locks).length,notes:Object.keys(notes).length,fbRawMonths:FB_RAW?Object.keys(FB_RAW).length:0}));
