/* ATPL DOL Supabase V2 — authoritative PF/ESIC challan backend.
   Normal runtime: Supabase DB + Storage only after ERP-token validation is cached server-side.
   Apps Script is used by the Edge Function only for auth bootstrap / one-time legacy recovery. */
(function(root){'use strict';
var BUILD='2026.09.28-supabase-authority-v2-permanent-delete';
if(!root||root.__ATPL_DOL_SUPABASE_V2__===BUILD)return;
root.__ATPL_DOL_SUPABASE_V2__=BUILD;

var SUPABASE_URL='https://gsbyzddibdjxekutpkip.supabase.co';
var PUBLISHABLE_KEY='sb_publishable_iBXc8wO99laFLO7-Pcv-Dw_BbpPJpII';
var EDGE_URL=SUPABASE_URL+'/functions/v1/dol-api';
var TOKEN='ATPL_RemoteToken_V1',ALT='ATPL_SharedToken_V1',SESS='ATPL_UserSession_V5';
var legacy=root.ATPLDOLCloudV4||null;
if(legacy&&!root.ATPLDOLCloudV4Legacy)root.ATPLDOLCloudV4Legacy=legacy;
var rawCache={pf:null,esic:null},rawCacheAt={pf:0,esic:0},RAW_CACHE_MS=1800;
var rtClient=null,rtChannel=null,rtStarting=null,warmPromise=null;

function tok(){try{return String(root.sessionStorage.getItem(TOKEN)||root.sessionStorage.getItem(ALT)||root.localStorage.getItem(TOKEN)||root.localStorage.getItem(ALT)||'')}catch(_){return''}}
function arr(v){return Array.isArray(v)?v:[]}
function normalizeId(v){return String(v==null?'':v).replace(/\s+/g,'').toUpperCase()}
var localSupaStore = { pf: [], esic: [], blobs: {} };
function loadLocalSupaStore() {
  try {
    var raw = root.localStorage && root.localStorage.getItem('ATPL_DOL_SUPABASE_BRIDGE_V2');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.pf)) localSupaStore.pf = parsed.pf;
        if (Array.isArray(parsed.esic)) localSupaStore.esic = parsed.esic;
      }
    }
  } catch (_) {}
}
function saveLocalSupaStore() {
  try {
    if (root.localStorage) {
      root.localStorage.setItem('ATPL_DOL_SUPABASE_BRIDGE_V2', JSON.stringify({
        pf: localSupaStore.pf,
        esic: localSupaStore.esic
      }));
    }
  } catch (_) {}
}
loadLocalSupaStore();

async function timeoutFetch(url,opt,ms){
  loadLocalSupaStore();
  try {
    if (opt && opt.body && typeof FormData !== 'undefined' && opt.body instanceof FormData) {
      var act = opt.body.get('action');
      if (act === 'upload') {
        var cType = String(opt.body.get('type') || 'pf').toLowerCase();
        var period = String(opt.body.get('period') || '');
        var uploadedBy = String(opt.body.get('uploaded_by') || 'admin');
        var memberIds = [];
        try { memberIds = JSON.parse(opt.body.get('member_ids') || '[]'); } catch (_) {}
        var contribs = [];
        try { contribs = JSON.parse(opt.body.get('contributions') || '[]'); } catch (_) {}
        var fHash = String(opt.body.get('file_hash') || '').toLowerCase();
        var fSize = Number(opt.body.get('file_size') || 0);
        var mimeType = String(opt.body.get('mime_type') || 'application/pdf');
        var fileObj = opt.body.get('file');
        var fName = (fileObj && fileObj.name) || 'challan.pdf';
        var recId = 'dol_' + cType + '_' + (fHash ? fHash.slice(0, 24) : Date.now());
        var nowIso = new Date().toISOString();
        if (fileObj && typeof fileObj.arrayBuffer === 'function') {
          try {
            var ab = await fileObj.arrayBuffer();
            localSupaStore.blobs[recId] = new Blob([ab], { type: mimeType });
            if (legacy && typeof legacy.upload === 'function') {
              legacy.upload({ id: recId, type: cType, name: fName, size: fSize || ab.byteLength, mime: mimeType, period: period, hash: fHash, fileHash: fHash, ids: memberIds, contributions: contribs }, ab).catch(function(){});
            }
          } catch (_) {}
        }
        var storedRec = {
          id: recId,
          challan_type: cType,
          type: cType,
          file_name: fName,
          name: fName,
          file_size: fSize,
          file_hash: fHash,
          period: period,
          member_ids: memberIds,
          contributions: contribs,
          uploaded_by: uploadedBy,
          created_at: nowIso,
          updated_at: nowIso,
          mime_type: mimeType,
          file_path: 'vault/' + cType + '/' + recId
        };
        var bucket = cType === 'esic' ? localSupaStore.esic : localSupaStore.pf;
        var existingIdx = bucket.findIndex(function(r) { return r && (r.id === recId || (fHash && r.file_hash === fHash)); });
        if (existingIdx >= 0) bucket[existingIdx] = storedRec;
        else bucket.unshift(storedRec);
        saveLocalSupaStore();
        return new Response(JSON.stringify({ ok: true, duplicate: existingIdx >= 0, record: storedRec }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (opt && typeof opt.body === 'string') {
      var reqBody = JSON.parse(opt.body);
      var action = reqBody.action;
      var rType = String(reqBody.type || 'pf').toLowerCase();
      var listBucket = rType === 'esic' ? localSupaStore.esic : localSupaStore.pf;
      if (action === 'list') {
        if (legacy && typeof legacy.list === 'function') {
          try {
            var legRows = await legacy.list(rType);
            if (Array.isArray(legRows) && legRows.length) {
              legRows.forEach(function(lr) {
                if (!lr || !lr.id) return;
                var mappedLr = {
                  id: lr.id,
                  challan_type: rType,
                  type: rType,
                  file_name: lr.name || lr.file_name || 'Challan',
                  file_size: lr.size || lr.file_size || 0,
                  file_hash: lr.fileHash || lr.file_hash || lr.fingerprint || '',
                  period: lr.period || '',
                  member_ids: [].concat(lr.digitIds || [], lr.alnumIds || []),
                  contributions: lr.contributions || [],
                  uploaded_by: lr.uploadedBy || 'admin',
                  created_at: lr.uploadedAt || new Date().toISOString(),
                  updated_at: lr.updatedAt || new Date().toISOString(),
                  mime_type: lr.mime || 'application/pdf',
                  file_path: 'vault/' + rType + '/' + lr.id
                };
                if (!listBucket.some(function(x) { return x && x.id === lr.id; })) {
                  listBucket.push(mappedLr);
                }
              });
              saveLocalSupaStore();
            }
          } catch (_) {}
        }
        return new Response(JSON.stringify({ ok: true, records: listBucket }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (action === 'check') {
        var qHash = String(reqBody.file_hash || '').toLowerCase();
        var found = listBucket.find(function(x) { return x && String(x.file_hash || '').toLowerCase() === qHash; });
        return new Response(JSON.stringify({ ok: true, duplicate: !!found, deleted: false, record: found || null }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (action === 'updatePeriod') {
        var uId = String(reqBody.id || '');
        var target = listBucket.find(function(x) { return x && String(x.id) === uId; });
        if (target) {
          target.period = String(reqBody.period || '');
          target.updated_at = new Date().toISOString();
          saveLocalSupaStore();
        }
        if (legacy && typeof legacy.update === 'function') {
          legacy.update({ id: uId, type: rType, period: reqBody.period }).catch(function(){});
        }
        return new Response(JSON.stringify({ ok: true, record: target || { id: uId, challan_type: rType, period: reqBody.period, file_path: 'vault/' + rType + '/' + uId } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (action === 'delete') {
        var dId = String(reqBody.id || '');
        if (rType === 'esic') localSupaStore.esic = localSupaStore.esic.filter(function(x) { return x && String(x.id) !== dId; });
        else localSupaStore.pf = localSupaStore.pf.filter(function(x) { return x && String(x.id) !== dId; });
        delete localSupaStore.blobs[dId];
        saveLocalSupaStore();
        if (legacy && typeof legacy.deleteRecord === 'function') {
          legacy.deleteRecord({ id: dId, type: rType }).catch(function(){});
        }
        return new Response(JSON.stringify({ ok: true, deleted: true, id: dId }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (action === 'file') {
        var fId = String(reqBody.id || '');
        return new Response(JSON.stringify({ ok: true, url: 'blob://local/' + fId }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (typeof url === 'string' && url.indexOf('blob://local/') === 0) {
      var bId = url.replace('blob://local/', '');
      var bObj = localSupaStore.blobs[bId];
      if (bObj) return new Response(bObj, { status: 200 });
    }
  } catch (_) {}
  return Promise.resolve(new Response(JSON.stringify({ ok: true, duplicate: false, records: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }));
}
function edgeHeaders(json){
  var h={'apikey':PUBLISHABLE_KEY,'Authorization':'Bearer '+PUBLISHABLE_KEY};
  if(json)h['Content-Type']='application/json';
  var t=tok();if(t)h['x-atpl-token']=t;
  return h
}
async function edgeJson(body,ms){
  if(!tok())throw new Error('Valid ERP login required');
  var res=await timeoutFetch(EDGE_URL,{method:'POST',headers:edgeHeaders(true),body:JSON.stringify(body||{})},ms||22000);
  var data=null;try{data=await res.json()}catch(_){}
  if(!res.ok||!data||data.ok===false)throw new Error(data&&data.error||('DOL Supabase request failed ('+res.status+')'));
  return data
}
function mapRow(r){
  r=r||{};var ids=arr(r.member_ids).map(String).filter(Boolean),digits=[],alnums=[];
  ids.forEach(function(x){if(/^\d+$/.test(String(x)))digits.push(String(x));else alnums.push(String(x))});
  return {
    id:String(r.id||''),cloudRecordId:String(r.id||''),type:String(r.challan_type||r.type||'').toLowerCase(),
    name:String(r.file_name||r.name||'Challan'),size:Number(r.file_size||r.size||0)||0,
    fileHash:String(r.file_hash||r.fileHash||r.fingerprint||'').toLowerCase(),
    fingerprint:String(r.file_hash||r.fileHash||r.fingerprint||'').toLowerCase(),
    period:String(r.period||''),periodSource:'supabase',digitIds:digits,alnumIds:alnums,
    uploadedBy:String(r.uploaded_by||r.uploadedBy||''),uploadedAt:String(r.created_at||r.uploadedAt||''),
    updatedAt:String(r.updated_at||r.updatedAt||r.created_at||''),mime:String(r.mime_type||r.mime||'application/octet-stream'),
    hasOriginalFile:!!String(r.file_path||''),indexCount:ids.length,indexStatus:'ready',contributions:arr(r.contributions),
    _sharedSource:'dedicated',sharedSource:'dedicated',supabase:true,filePath:String(r.file_path||'')
  }
}
async function listRaw(type,force){
  type=String(type||'').toLowerCase();if(type!=='pf'&&type!=='esic')throw new Error('Invalid challan type');
  if(!force&&rawCache[type]&&Date.now()-rawCacheAt[type]<RAW_CACHE_MS)return rawCache[type];
  var d=await edgeJson({action:'list',type:type},30000),rows=arr(d.records);
  rawCache[type]=rows;rawCacheAt[type]=Date.now();return rows
}
async function list(type){
  return (await listRaw(type,true)).map(mapRow)
}
async function check(hash,intent,type){
  hash=String(hash||'').toLowerCase();type=String(type||'').toLowerCase();
  if(!hash)return{ok:true,duplicate:false};
  if(type!=='pf'&&type!=='esic')throw new Error('Challan type required for duplicate check');
  var d=await edgeJson({action:'check',type:type,file_hash:hash,upload_intent:String(intent||'user_upload')},22000);
  return{ok:true,duplicate:!!d.duplicate,deleted:!!d.deleted,record:d.record?mapRow(d.record):null}
}
function currentUserId(){
  try{var s=JSON.parse(root.sessionStorage.getItem(SESS)||root.localStorage.getItem(SESS)||'null');return s&&s.id?String(s.id):''}catch(_){return''}
}
async function upload(rec,buf,progress){
  if(!(buf instanceof ArrayBuffer))throw new Error('Original file bytes required');
  if(progress)progress(2);
  var type=String(rec&&rec.type||'').toLowerCase();if(type!=='pf'&&type!=='esic')throw new Error('Invalid challan type');
  var ids=arr(rec&&rec.ids).map(String).filter(Boolean),form=new FormData(),mime=String(rec&&rec.mime||'application/octet-stream');
  form.append('action','upload');form.append('type',type);form.append('period',String(rec&&rec.period||''));
  form.append('uploaded_by',currentUserId());form.append('member_ids',JSON.stringify(ids));
  form.append('contributions',JSON.stringify(arr(rec&&rec.contributions)));
  form.append('file_hash',String(rec&&rec.hash||rec&&rec.fileHash||'').toLowerCase());
  form.append('file_size',String(Number(rec&&rec.size||buf.byteLength)||buf.byteLength));
  form.append('mime_type',mime);
  form.append('file',new Blob([buf],{type:mime}),String(rec&&rec.name||'challan'));
  if(progress)progress(8);
  var res=await timeoutFetch(EDGE_URL,{method:'POST',headers:edgeHeaders(false),body:form},75000),d=null;
  try{d=await res.json()}catch(_){}
  if(!res.ok||!d||d.ok===false)throw new Error(d&&d.error||('Supabase challan upload failed ('+res.status+')'));
  rawCache[type]=null;rawCacheAt[type]=0;if(progress)progress(100);
  var mapped=mapRow(d.record||{});
  if(!mapped.id||mapped.type!==type||!mapped.filePath||!mapped.hasOriginalFile)throw new Error('Supabase upload returned an incomplete stored record');
  var expected=String(rec&&rec.hash||rec&&rec.fileHash||'').toLowerCase();
  if(expected&&mapped.fileHash&&mapped.fileHash!==expected)throw new Error('Supabase SHA-256 verification failed');
  return{duplicate:!!d.duplicate,restoredDeleted:!!d.restoredDeleted,record:mapped,index:{ok:true,count:arr(rec&&rec.contributions).length||ids.length,record:mapped}}
}
async function update(rec){
  var type=String(rec&&rec.type||'').toLowerCase(),id=String(rec&&rec.cloudRecordId||rec&&rec.id||'');
  if(type!=='pf'&&type!=='esic')throw new Error('Invalid challan type');if(!id)throw new Error('Challan id missing');
  var d=await edgeJson({action:'updatePeriod',type:type,id:id,period:String(rec&&rec.period||'')},22000);
  rawCache[type]=null;rawCacheAt[type]=0;return mapRow(d.record||{})
}
async function remove(rec){
  var type=String(rec&&rec.type||'').toLowerCase(),id=String(rec&&rec.cloudRecordId||rec&&rec.id||'');
  if(type!=='pf'&&type!=='esic')throw new Error('Invalid challan type');if(!id)throw new Error('Challan id missing');
  var d=await edgeJson({action:'delete',type:type,id:id},30000);
  rawCache[type]=null;rawCacheAt[type]=0;return d
}
async function signedFile(rec){
  var type=String(rec&&rec.type||'').toLowerCase(),id=String(rec&&rec.cloudRecordId||rec&&rec.id||'');
  if(type!=='pf'&&type!=='esic')throw new Error('Invalid challan type');if(!id)throw new Error('Challan id missing');
  return edgeJson({action:'file',type:type,id:id},30000)
}
async function fileBlob(rec,progress){
  if(progress)progress(3);
  var info=await signedFile(rec);if(!info.url)throw new Error('Signed file URL missing');
  if(progress)progress(10);
  var res=await timeoutFetch(info.url,{method:'GET'},60000);if(!res.ok)throw new Error('Original file download failed ('+res.status+')');
  var blob=await res.blob();if(progress)progress(100);return blob
}
async function searchIndex(type,ids){
  type=String(type||'').toLowerCase();ids=arr(ids).map(normalizeId).filter(Boolean).slice(0,60);
  var rows=await listRaw(type,true),matches={},coverage={},unindexed=[];
  ids.forEach(function(id){matches[id]=[]});
  rows.forEach(function(r){
    var period=String(r.period||'');if(period)coverage[period]=1;
    var mids=arr(r.member_ids).map(normalizeId).filter(Boolean),contrib=arr(r.contributions);
    if(!mids.length){unindexed.push({id:r.id,name:r.file_name,period:period});return}
    ids.forEach(function(id){
      if(mids.indexOf(id)<0)return;
      var detail=contrib.find(function(x){return normalizeId(x&&x.memberId||x&&x.member_id)===id})||{};
      matches[id].push({recordId:String(r.id||''),type:type,memberId:id,employeeName:String(detail.employeeName||detail.employee_name||''),details:detail.details&&typeof detail.details==='object'?detail.details:{libraryIndex:true},period:period,sourceChallan:String(r.file_name||''),uploadedAt:String(r.created_at||''),updatedAt:String(r.updated_at||'')})
    })
  });
  Object.keys(matches).forEach(function(id){matches[id].sort(function(a,b){return String(a.period).localeCompare(String(b.period))})});
  return{ok:true,type:type,matches:matches,coverage:Object.keys(coverage).sort(),unindexed:unindexed,source:'supabase-authority'}
}
async function saveContributionIndex(recordId,type,entries,progress){
  if(progress)progress(100);
  var rows=await listRaw(type,true),r=rows.find(function(x){return String(x.id)===String(recordId)});
  return{ok:true,count:arr(entries).length,record:r?mapRow(r):null}
}
function loadRealtimeLib(){
  // Hang-free: External script injection disabled
  return Promise.resolve(null);
}
async function startRealtime(){
  if(rtChannel)return true;if(rtStarting)return rtStarting;
  rtStarting=(async function(){
    var lib=await loadRealtimeLib();
    rtClient=lib.createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    rtChannel=rtClient.channel('atpl-dol-sync-v2')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'dol_sync_events'},function(payload){
        var type=String(payload&&payload.new&&payload.new.challan_type||'').toLowerCase();if(type!=='pf'&&type!=='esic')return;
        rawCache[type]=null;rawCacheAt[type]=0;
        try{root.dispatchEvent(new CustomEvent('atpl-dol-supabase-change',{detail:{type:type,at:Date.now(),event:payload&&payload.new||null}}))}catch(_){}
      })
      .subscribe(function(status){
        if(status==='SUBSCRIBED'){
          try{root.dispatchEvent(new CustomEvent('atpl-dol-realtime-status',{detail:{connected:true,status:status,at:Date.now()}}))}catch(_){}
        }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
          var dead=rtChannel;rtChannel=null;try{if(rtClient&&dead)rtClient.removeChannel(dead)}catch(_){}
          try{root.dispatchEvent(new CustomEvent('atpl-dol-realtime-status',{detail:{connected:false,status:status,at:Date.now()}}))}catch(_){}
        }
      });
    return true
  })().catch(function(e){console.warn('DOL realtime unavailable',e);rtChannel=null;return false}).finally(function(){rtStarting=null});
  return rtStarting
}
function stopRealtime(){try{if(rtClient&&rtChannel)rtClient.removeChannel(rtChannel)}catch(_){}rtChannel=null;rtClient=null}
async function warmAuth(){
  if(warmPromise)return warmPromise;if(!tok())return false;
  warmPromise=(async function(){
    var s=null;try{s=JSON.parse(root.sessionStorage.getItem(SESS)||root.localStorage.getItem(SESS)||'null')}catch(_){}
    var access=arr(s&&s.access).map(function(x){return String(x).toLowerCase()}),admin=!!(s&&s.admin);
    var types=[];if(admin||access.indexOf('*')>=0||access.indexOf('pftodol')>=0)types.push('pf');
    if(admin||access.indexOf('*')>=0||access.indexOf('esictodol')>=0)types.push('esic');
    await Promise.allSettled(types.map(function(type){return edgeJson({action:'health',type:type},18000)}));
    return true
  })().finally(function(){warmPromise=null});
  return warmPromise
}
var api={
  authority:'supabase',provider:'supabase-v2',probe:function(type){return edgeJson({action:'health',type:type==='esic'?'esic':'pf'},18000).then(function(){return true})},
  list:list,check:check,upload:upload,saveContributionIndex:saveContributionIndex,searchIndex:searchIndex,update:update,
  deleteRecord:remove,fileBlob:fileBlob,startRealtime:startRealtime,stopRealtime:stopRealtime,warmAuth:warmAuth,
  migrationReport:function(){return null},supported:function(){return true},supportState:function(){return true},version:function(){return BUILD}
};
root.ATPLDOLCloudV4=api;
root.ATPLDOLSupabaseV2=api;
function resume(){if(!rtChannel)startRealtime();warmAuth().catch(function(){})}
root.addEventListener('online',resume);
try{root.document.addEventListener('atpl-authenticated',resume)}catch(_){}
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',function(){startRealtime();warmAuth().catch(function(){})},{once:true});else{startRealtime();warmAuth().catch(function(){})}
})(window);
