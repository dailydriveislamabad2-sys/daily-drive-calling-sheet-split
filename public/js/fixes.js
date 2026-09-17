/* ===== referenceExactJs ===== */

(function(){
  function addReferenceNewSheet(){
    var vc=document.querySelector('.viewbar-controls');
    if(!vc || document.getElementById('ddRefNewSheet')) return;
    var b=document.createElement('button');
    b.id='ddRefNewSheet';b.type='button';b.textContent='＋  New Sheet';b.title='Create a new sheet';
    b.onclick=function(){if(typeof addSheet==='function')addSheet()};
    vc.appendChild(b);
  }
  function syncReferenceUi(){
    addReferenceNewSheet();
    var sb=document.getElementById('sheetTabs');
    if(sb){sb.setAttribute('aria-hidden','true');}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncReferenceUi); else syncReferenceUi();
  setTimeout(syncReferenceUi,120);setTimeout(syncReferenceUi,700);setTimeout(syncReferenceUi,1800);
})();


/* ===== finalFixHtml ===== */

(function(){
  const $q=id=>document.getElementById(id);
  const escLocal=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function getSheetsSafe(){
    try{return Array.isArray(window.sheets)?window.sheets:(typeof sheets!=='undefined'&&Array.isArray(sheets)?sheets:[])}catch(e){return []}
  }
  function getCurrentSafe(){
    try{return String(window.currentSheetId??currentSheetId??'default')}catch(e){return 'default'}
  }

  /* FAST sheet switch: one request only (riders). Do not reload /api/sheets. */
  window.ddSwitchSheet=async function(id){
    id=String(id||'default');
    try{
      if(typeof currentSheetId!=='undefined')currentSheetId=id;
      window.currentSheetId=id;
      localStorage.setItem('dd_current_sheet',id);
      ['search','filter','dateFilter'].forEach(k=>{const e=$q(k);if(e)e.value=''});
      const body=$q('ridersBody');
      if(body)body.innerHTML='<tr><td colspan="10" class="empty"><span style="opacity:.7">Loading sheet…</span></td></tr>';

      const r=await fetch('/api/riders?sheet='+encodeURIComponent(id),{
        credentials:'same-origin',cache:'no-store'
      });
      if(r.status===401){location.reload();return}
      if(!r.ok)throw Error('Sheet load failed');
      const data=await r.json();
      rows=Array.isArray(data)?data:[];

      /* Paint active tab immediately — no second network request. */
      document.querySelectorAll('#sheetTabs .sheet-tab[data-sheet-id]').forEach(b=>{
        b.classList.toggle('active',String(b.dataset.sheetId)===id)
      });
      if(typeof render==='function')render();
    }catch(e){
      console.error(e);
      if($q('ridersBody'))$q('ridersBody').innerHTML='<tr><td colspan="10" class="empty">Sheet error: '+escLocal(e.message)+'</td></tr>';
      if(typeof toast==='function')toast('Sheet error: '+e.message);
    }
  };

  /* Rebuild tabs with delete option. No API call is made just to switch tabs. */
  window.ddRenderSheetsFast=function(){
    const el=$q('sheetTabs'); if(!el)return;
    const list=getSheetsSafe(), cur=getCurrentSafe();
    el.innerHTML=list.map(x=>{
      const id=String(x.id), name=escLocal(x.name||'Sheet');
      const del=(typeof currentRole!=='undefined'&&currentRole==='admin'&&id!=='default'&&id!=='unassigned')
        ? '<span class="sheet-delete" title="Delete sheet" onclick="event.stopPropagation();deleteSheet(\''+escLocal(id)+'\')">×</span>' : '';
      return '<button type="button" class="sheet-tab '+(id===cur?'active':'')+'" data-sheet-id="'+escLocal(id)+'" onclick="ddSwitchSheet(\''+escLocal(id)+'\')"><span>'+name+'</span><small>('+Number(x.rider_count||0)+')</small>'+del+'</button>';
    }).join('')+
      ((typeof currentRole!=='undefined'&&currentRole==='admin')
        ? '<button type="button" class="sheet-tab new-sheet-tab" onclick="addSheet()">＋ New Sheet</button>':'');
  };

  /* Fast + reliable sorting. Works for Admin and User. */
  let ddSortValue=localStorage.getItem('dd_rider_sort')||'';
  function sortCopy(list){
    if(!ddSortValue)return list.slice();
    const [field,dir]=ddSortValue.split('-');
    const value=r=>{
      if(field==='name')return String(r.name||'').trim().toLowerCase();
      if(field==='last'){
        const s=String(r.last||'').trim();
        const t=Date.parse(s);
        return Number.isFinite(t)?t:Number.MAX_SAFE_INTEGER;
      }
      if(field==='next'){
        const s=String(r.next||'').trim();
        const t=Date.parse(s+'T00:00:00');
        return Number.isFinite(t)?t:Number.MAX_SAFE_INTEGER;
      }
      return String(r[field]??'').toLowerCase();
    };
    return list.slice().sort((a,b)=>{
      const A=value(a),B=value(b), c=A<B?-1:A>B?1:0;
      return dir==='desc'?-c:c;
    });
  }
  window.setSort=function(v){
    ddSortValue=String(v||'');
    localStorage.setItem('dd_rider_sort',ddSortValue);
    const sel=$q('sortSelect'); if(sel&&sel.value!==ddSortValue)sel.value=ddSortValue;
    if(typeof render==='function')render();
  };
  window.sortRows=sortCopy;

  /* Wrap whichever final render function exists, avoiding the old timing/race issue. */
  const baseRender=window.render;
  if(typeof baseRender==='function'){
    window.render=function(){
      const original=rows;
      rows=sortCopy(original);
      try{return baseRender.apply(this,arguments)}
      finally{rows=original}
    };
  }

  /* Fix the VIP assignment button to use destination SHEET, not USER. */
  window.vipAssignCount=async function(){
    if(typeof currentRole!=='undefined'&&currentRole!=='admin')return;
    const count=Math.max(1,Math.min(10000,Number($q('vipAssignCount')?.value||0)));
    const target=$q('vipAssignSheet')?.value||'';
    if(!target){if(typeof toast==='function')toast('Select destination sheet');return}
    try{
      const r=await fetch('/api/riders/assign-sheet-count',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({count,targetSheet:target})
      });
      const d=await r.json();
      if(!r.ok)throw Error(d.error||'Assignment failed');
      if(typeof toast==='function')toast((d.count||0)+' rider(s) moved to '+(d.targetName||'sheet'));
      /* Refresh current data once; sheet list stays in memory. */
      if(typeof window.ddSwitchSheet==='function')await window.ddSwitchSheet(getCurrentSafe());
      /* Refresh counts in tabs in the background, without blocking the UI. */
      fetch('/api/sheets',{credentials:'same-origin',cache:'no-store'})
        .then(x=>x.ok?x.json():null).then(d=>{if(Array.isArray(d)){sheets=d;window.ddRenderSheetsFast()}})
        .catch(()=>{});
    }catch(e){if(typeof toast==='function')toast('Assignment error: '+e.message)}
  };

  /* Replace any existing tab renderer after all earlier overrides have loaded. */
  window.renderSheets=function(){window.ddRenderSheetsFast()};
  if(typeof window.ddRenderSheetsFast==='function')window.ddRenderSheetsFast();

  /* Keep custom tabs after create/delete and after async bootstrap completes. */
  const _baseAddSheet=window.addSheet;
  if(typeof _baseAddSheet==='function'){
    window.addSheet=async function(){const r=await _baseAddSheet.apply(this,arguments);window.ddRenderSheetsFast();return r};
  }
  const _baseDeleteSheet=window.deleteSheet;
  if(typeof _baseDeleteSheet==='function'){
    window.deleteSheet=async function(){const r=await _baseDeleteSheet.apply(this,arguments);window.ddRenderSheetsFast();return r};
  }
  let bootTicks=0;
  const bootSync=setInterval(()=>{
    if(getSheetsSafe().length){window.ddRenderSheetsFast();bootTicks++;}
    if(bootTicks>=6)clearInterval(bootSync);
  },250);

  /* Restore the saved sort selection visually. */
  const ss=$q('sortSelect');if(ss)ss.value=ddSortValue;

  /* ===== FINAL UI / PERMISSION REPAIR ===== */
  function finalFillSheetSelects(){
    const list=getSheetsSafe();
    const destinations=list.filter(x=>String(x.id)!=='unassigned');
    const vip=$q('vipAssignSheet');
    if(vip){
      const old=vip.value;
      vip.innerHTML='<option value="">Select Destination Sheet</option>'+destinations.map(x=>'<option value="'+escLocal(x.id)+'">'+escLocal(x.name||'Sheet')+' ('+Number(x.rider_count||0)+')</option>').join('');
      if(destinations.some(x=>String(x.id)===String(old)))vip.value=old;
      vip.disabled=destinations.length===0;
      vip.style.display='block';
      vip.style.visibility='visible';
    }
    const assign=$q('assignTarget');
    if(assign){
      const old2=assign.value;
      assign.innerHTML='<option value="">Select Destination Sheet</option>'+destinations.map(x=>'<option value="'+escLocal(x.id)+'">'+escLocal(x.name||'Sheet')+' ('+Number(x.rider_count||0)+')</option>').join('');
      if(destinations.some(x=>String(x.id)===String(old2)))assign.value=old2;
      assign.style.display='block';
      assign.style.visibility='visible';
    }
  }
  async function ensureFinalSheets(){
    let list=getSheetsSafe();
    if(!list.length){
      try{
        const r=await fetch('/api/sheets',{credentials:'same-origin',cache:'no-store'});
        if(r.ok){const d=await r.json();if(Array.isArray(d)){sheets=d;list=d;}}
      }catch(e){}
    }
    finalFillSheetSelects();
    if(list.length)window.ddRenderSheetsFast();
  }
  window.finalFillSheetSelects=finalFillSheetSelects;
  setTimeout(ensureFinalSheets,50);
  setTimeout(ensureFinalSheets,400);
  setTimeout(ensureFinalSheets,1000);
  setTimeout(ensureFinalSheets,2000);
  const finalSheetTimer=setInterval(finalFillSheetSelects,500);
  setTimeout(()=>clearInterval(finalSheetTimer),8000);

  /* Final layout: make the sort/select controls full-size and aligned. */
  const finalStyle=document.createElement('style');
  finalStyle.id='dd-final-repair-css';
  finalStyle.textContent=`
    .toolbar{grid-template-columns:minmax(0,1fr) 165px 165px 220px 92px!important;align-items:stretch!important}
    .toolbar .field{min-width:0!important;width:100%!important}
    #sortSelect{height:41px!important;width:100%!important;min-width:0!important;border:1px solid #d4e0eb!important;border-radius:10px!important;background:#f9fbfd!important;padding:0 10px!important;font-weight:850!important;color:#152a42!important;outline:none!important;box-shadow:none!important}
    #sortSelect:focus{border-color:#4e9cf5!important;box-shadow:0 0 0 3px rgba(38,126,235,.10)!important}
    #vipQuickAssign{display:flex!important;align-items:center!important}
    #vipQuickAssign select{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 280px!important;min-width:280px!important;height:44px!important;appearance:auto!important}
    #vipQuickAssign input{flex:0 0 92px!important}
    #vipQuickAssign button{flex:0 0 auto!important}
    @media(max-width:1200px){.toolbar{grid-template-columns:minmax(0,1fr) minmax(150px,180px)!important}.toolbar .field:first-child{grid-column:1/-1}.toolbar #sortSelect{grid-column:auto!important}.toolbar .clear{grid-column:auto!important}}
    @media(max-width:650px){.toolbar{grid-template-columns:1fr!important}.toolbar .field:first-child{grid-column:auto!important}.toolbar #sortSelect,.toolbar .clear{grid-column:auto!important}}
  `;
  document.head.appendChild(finalStyle);

  /* Tags are editable by both Admin and User. Row Delete is permanently hidden. */
  document.querySelectorAll('.tag-btn.admin-only').forEach(b=>b.classList.remove('admin-only'));
  document.querySelectorAll('.actions-cell .del,.actions-cell .delete-btn').forEach(b=>b.remove());
  const tagObserver=new MutationObserver(()=>{
    document.querySelectorAll('.tag-btn.admin-only').forEach(b=>b.classList.remove('admin-only'));
    document.querySelectorAll('.actions-cell .del,.actions-cell .delete-btn').forEach(b=>b.remove());
  });
  tagObserver.observe(document.body,{subtree:true,childList:true});
  setTimeout(()=>tagObserver.disconnect(),10000);

})();


/* ===== runtimeFixHtml ===== */

(function(){
  'use strict';
  function el(id){return document.getElementById(id)}
  function role(){try{return typeof currentRole!=='undefined'?currentRole:''}catch(e){return ''}}
  function sheetList(){try{return Array.isArray(sheets)?sheets:[]}catch(e){return []}}
  function currentId(){try{return String(currentSheetId||'default')}catch(e){return 'default'}}

  /* ---------- Calling: reliable Save & Next ---------- */
  window.startCalling=function(){
    var q=(typeof getQueue==='function'?getQueue():[]).slice();
    window._queue=q; window._queueIndex=0;
    var m=el('queueModal');
    if(!m)return;
    m.classList.add('show');
    var t=el('queueTitle'); if(t)t.textContent='📞 Smart Calling Queue';
    window._ddCallingOpen=true;
    if(typeof renderQueueItem==='function')renderQueueItem();
  };
  window.saveQueueAndNext=async function(){
    var q=window._queue||[], i=Number(window._queueIndex||0), r=q[i];
    if(!r){ if(el('queueModal'))el('queueModal').classList.remove('show'); return; }
    var c=el('queueComment'), st=el('queueStatus'), dt=el('queueDate');
    var comment=c?c.value.trim():String(r.comment||'');
    var status=st?st.value:String(r.status||'Pending');
    var next=dt?dt.value:String(r.next||'');
    try{
      var payload={comment:comment,status:status,next:next};
      var updated=await api('/api/riders/'+encodeURIComponent(r.id),{method:'PUT',body:JSON.stringify(payload)});
      Object.assign(r,updated||payload);
      var idx=window._queueIndex;
      if(typeof rows!=='undefined'){
        var live=rows.find(function(x){return String(x.id)===String(r.id)});
        if(live)Object.assign(live,updated||payload);
      }
      window._queueIndex=idx+1;
      if(window._queueIndex>=q.length){
        if(typeof render==='function')render();
        if(el('queueModal'))el('queueModal').classList.remove('show');
        window._ddCallingOpen=false;
        if(typeof toast==='function')toast('Saved — calling queue completed');
        return;
      }
      if(typeof renderQueueItem==='function')renderQueueItem();
      if(typeof toast==='function')toast('Saved — next rider');
    }catch(e){
      if(typeof toast==='function')toast('Save & Next error: '+e.message);
    }
  };

  /* ---------- Calling Table: actually focus the table ---------- */
  window.ddOpenCallingTable=function(){
    var table=document.querySelector('.table')||el('ridersBody');
    if(table){
      table.scrollIntoView({behavior:'smooth',block:'start'});
      table.classList.add('dd-call-active');
      setTimeout(function(){table.classList.remove('dd-call-active')},900);
    }
    var search=el('search');
    if(search)setTimeout(function(){search.focus()},450);
  };

  /* ---------- Manage Users: allow username changes ---------- */
  window.openUserEditor=async function(username){
    if(role()!=='admin')return;
    window.editingUserName=username||null;
    var u=null;
    try{u=username?await api('/api/users/'+encodeURIComponent(username)):null}catch(e){if(typeof toast==='function')toast(e.message);return}
    var title=el('userModalTitle'), un=el('userUsername'), pw=el('userPassword'), rr=el('userRole');
    if(title)title.textContent=username?'Edit Account':'Create Account';
    if(un){un.value=u&&u.username||'';un.disabled=false;un.removeAttribute('readonly');un.placeholder='Username';}
    if(pw){pw.value='';pw.placeholder=username?'Leave blank to keep current password':'Password';}
    if(rr)rr.value=u&&u.role||'user';
    var m=el('userModal');if(m)m.classList.add('show');
    setTimeout(function(){if(un)un.focus()},50);
  };
  window.saveUserAccount=async function(){
    if(role()!=='admin')return;
    var un=el('userUsername'), pw=el('userPassword'), rr=el('userRole');
    var username=un?un.value.trim():'';
    var password=pw?pw.value:'';
    var newRole=rr?rr.value:'user';
    var old=window.editingUserName||'';
    if(!username||(!old&&!password)){if(typeof toast==='function')toast('Username and password required');return}
    try{
      if(old){
        var body={username:username,role:newRole};
        if(password)body.password=password;
        await api('/api/users/'+encodeURIComponent(old),{method:'PUT',body:JSON.stringify(body)});
      }else{
        await api('/api/users',{method:'POST',body:JSON.stringify({username:username,password:password,role:newRole})});
      }
      var modal=el('userModal');if(modal)modal.classList.remove('show');
      window.editingUserName=null;
      if(typeof showUsers==='function')await showUsers();
      if(typeof toast==='function')toast(old?'Account updated successfully':'Account created successfully');
    }catch(e){if(typeof toast==='function')toast('Account error: '+e.message)}
  };

  /* ---------- Fast sheet switching with memory cache + background refresh ---------- */
  var cache=window.__DD_SHEET_CACHE__=window.__DD_SHEET_CACHE__||Object.create(null);
  var pending=Object.create(null);
  function put(id,data){cache[String(id)]={rows:Array.isArray(data)?data:[],at:Date.now()};}
  function paint(id,data){
    try{if(typeof currentSheetId!=='undefined')currentSheetId=String(id);window.currentSheetId=String(id)}catch(e){}
    try{rows=Array.isArray(data)?data:[]}catch(e){}
    document.querySelectorAll('#sheetTabs .sheet-tab[data-dd-sheet],#sheetTabs .sheet-tab[data-sheet-id]').forEach(function(b){
      var bid=b.getAttribute('data-dd-sheet')||b.getAttribute('data-sheet-id');
      b.classList.toggle('active',String(bid)===String(id));
    });
    if(typeof render==='function')render();
  }
  async function fetchSheet(id){
    id=String(id);
    if(pending[id])return pending[id];
    pending[id]=fetch('/api/riders?sheet='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'})
      .then(function(r){if(r.status===401){location.reload();throw Error('Please login again')}if(!r.ok)throw Error('Sheet load failed');return r.json()})
      .then(function(d){put(id,d);return d})
      .finally(function(){delete pending[id]});
    return pending[id];
  }
  window.ddSwitchSheet=async function(id){
    id=String(id||'default');
    try{
      if(typeof currentSheetId!=='undefined')currentSheetId=id;
      window.currentSheetId=id;
      localStorage.setItem('dd_current_sheet',id);
      ['search','filter','dateFilter'].forEach(function(k){var x=el(k);if(x)x.value=''});
      var cached=cache[id];
      if(cached){
        paint(id,cached.rows);
        /* Refresh silently so the next click is instant without stale data. */
        fetchSheet(id).catch(function(){});
        return;
      }
      var body=el('ridersBody');if(body)body.innerHTML='<tr><td colspan="10" class="empty"><span style="opacity:.7">Loading sheet…</span></td></tr>';
      var data=await fetchSheet(id);
      paint(id,data);
    }catch(e){if(typeof toast==='function')toast('Sheet error: '+e.message)}
  };
  function prefetch(){
    var list=sheetList();
    list.slice(0,8).forEach(function(x){if(x&&x.id&&String(x.id)!==currentId())fetchSheet(x.id).catch(function(){})});
  }
  function hookSheetState(){
    var list=sheetList();
    if(list.length){
      var cur=currentId();
      if(typeof rows!=='undefined'&&Array.isArray(rows))put(cur,rows);
      prefetch();
    }
  }
  setTimeout(hookSheetState,150);
  setTimeout(hookSheetState,900);
  setTimeout(hookSheetState,2200);

  /* Keep sheet tabs in the same visual design but use one reliable renderer. */
  window.ddRenderSheetsFast=function(){
    var host=el('sheetTabs'); if(!host)return;
    var list=sheetList(), cur=currentId();
    if(!list.length)return;
    host.innerHTML=list.map(function(x){
      var id=String(x.id), name=String(x.name||'Sheet').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      var safe=id.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var del=(role()==='admin'&&id!=='default'&&id!=='unassigned')?'<span class="sheet-delete" title="Delete sheet" data-del-sheet="'+safe+'">×</span>':'';
      return '<button type="button" class="sheet-tab '+(id===cur?'active':'')+'" data-dd-sheet="'+safe+'"><span>'+name+'</span><small>('+Number(x.rider_count||0)+')</small>'+del+'</button>';
    }).join('')+(role()==='admin'?'<button type="button" class="sheet-tab new-sheet-tab" onclick="addSheet()">＋ New Sheet</button>':'');
    host.querySelectorAll('[data-dd-sheet]').forEach(function(b){b.onclick=function(e){e.preventDefault();window.ddSwitchSheet(b.getAttribute('data-dd-sheet'))}});
    host.querySelectorAll('[data-del-sheet]').forEach(function(b){b.onclick=function(e){e.stopPropagation();if(typeof deleteSheet==='function')deleteSheet(b.getAttribute('data-del-sheet'))}});
  };
  window.renderSheets=function(){window.ddRenderSheetsFast()};

  /* Replace sidebar navigation handlers with real actions. */
  document.querySelectorAll('.dd-side-nav button').forEach(function(b){
    var text=(b.textContent||'').trim();
    if(text.indexOf('Calling Table')>=0)b.onclick=function(){window.ddOpenCallingTable()};
    if(text.indexOf('Start Calling')>=0)b.onclick=function(){window.startCalling()};
  });

  /* After async bootstrap, keep tabs + assignment targets synced without blocking clicks. */
  function sync(){
    if(typeof window.ddRenderSheetsFast==='function')window.ddRenderSheetsFast();
    if(typeof window.finalFillSheetSelects==='function')window.finalFillSheetSelects();
  }
  setTimeout(sync,300);setTimeout(sync,1200);setTimeout(sync,2500);
  setTimeout(prefetch,500);
})();


/* ===== finalDomPolishHtml ===== */

(function(){
  function placeAssign(){
    var p=document.querySelector('.priority-legend'), a=document.getElementById('vipQuickAssign');
    if(p&&a&&a.parentElement!==p){p.appendChild(a);}
    if(a){
      var sel=document.getElementById('vipAssignSheet');
      if(sel){
        var blank=sel.querySelector('option[value=""]');
        if(blank) blank.textContent='Select Destination Sheet';
      }
    }
  }
  function keepHeader(){ var h=document.querySelector('.header'); if(h) h.style.position='sticky'; }
  function fixShowing(){ var f=document.querySelector('.footer'), sh=document.getElementById('showing'); if(f&&sh){f.style.display='flex';f.style.justifyContent='space-between';sh.style.textAlign='left';sh.style.marginRight='auto';} }
  function all(){placeAssign();keepHeader();fixShowing();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',all); else all();
  [50,250,800,1500,3000].forEach(function(t){setTimeout(all,t)});
})();


/* ===== finalV12FixHtml ===== */

(function(){
  function localKey(ts){
    var d=new Date(Number(ts)||0); if(!Number.isFinite(d.getTime())) return '';
    var m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return d.getFullYear()+'-'+m+'-'+day;
  }
  function todayKey(){var d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return d.getFullYear()+'-'+m+'-'+day;}
  function moveAssignAndHeader(){
    var p=document.querySelector('.priority-legend'), a=document.getElementById('vipQuickAssign'), main=document.querySelector('.main'), head=document.querySelector('.head'), rp=document.querySelector('.header>.role-panel'), clock=document.querySelector('.head>.clock');
    if(p&&a&&a.parentElement!==p) p.appendChild(a);
    if(p&&a){
      Array.from(p.childNodes).forEach(function(n){if(n!==a)p.removeChild(n)});
      p.style.display='flex';
    }
    if(head&&rp&&rp.parentElement!==head){head.appendChild(rp)}
    if(head&&clock&&rp&&clock.nextSibling!==rp) head.appendChild(rp);
    var sel=document.getElementById('vipAssignSheet'); if(sel){var blank=sel.querySelector('option[value=""]');if(blank)blank.textContent='Select Destination Sheet';}
  }
  var originalToday=window.todayFollowups;
  window.todayFollowups=function(){
    window.__ddTodayUpdatedOnly=true;
    var df=document.getElementById('dateFilter'); if(df)df.value='';
    var sf=document.getElementById('search'); if(sf)sf.value='';
    var ff=document.getElementById('filter'); if(ff)ff.value='';
    if(typeof window.render==='function')window.render();
    if(typeof window.toast==='function')window.toast("Today's updated riders loaded");
  };
  var originalRenderProfessional=window.renderProfessional;
  if(typeof originalRenderProfessional==='function'){
    window.renderProfessional=function(){
      if(!window.__ddTodayUpdatedOnly)return originalRenderProfessional.apply(this,arguments);
      var source=rows;
      if(!Array.isArray(source))return originalRenderProfessional.apply(this,arguments);
      var k=todayKey();
      rows=source.filter(function(r){return localKey(r.updated_at||r.status_updated_at||r.comment_updated_at||r.next_updated_at)===k;});
      try{return originalRenderProfessional.apply(this,arguments)}finally{rows=source;}
    };
  }
  function install(){
    moveAssignAndHeader();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
  [80,250,700,1500,3000].forEach(function(t){setTimeout(install,t)});
})();


/* ===== finalAncientUiFixHtml ===== */

(function(){
'use strict';
function q(id){return document.getElementById(id)}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function currentRoleSafe(){try{return String(typeof currentRole!=='undefined'?currentRole:(window.currentRole||''))}catch(e){return String(window.currentRole||'')}}
function currentSheetSafe(){try{return String(typeof currentSheetId!=='undefined'?currentSheetId:(window.currentSheetId||localStorage.getItem('dd_current_sheet')||'default'))}catch(e){return 'default'}}
function setSheetSafe(id){try{currentSheetId=String(id)}catch(e){}window.currentSheetId=String(id);try{localStorage.setItem('dd_current_sheet',String(id))}catch(e){}}
function renderSheetTabs(list){
  var host=q('sheetTabs');if(!host)return;
  if(!Array.isArray(list)||!list.length){host.innerHTML=(currentRoleSafe()==='admin'?'<button type="button" class="sheet-tab new-sheet-tab" id="ddAncientNewSheet">＋ New Sheet</button>':'');bindNew();return}
  var cur=currentSheetSafe();
  host.innerHTML=list.map(function(x){var id=String(x.id||''),name=esc(x.name||'Sheet');return '<button type="button" class="sheet-tab '+(id===cur?'active':'')+'" data-dd-ancient-sheet="'+esc(id)+'"><span>'+name+'</span><small>('+Number(x.rider_count||0)+')</small></button>'}).join('')+(currentRoleSafe()==='admin'?'<button type="button" class="sheet-tab new-sheet-tab" id="ddAncientNewSheet">＋ New Sheet</button>':'');
  host.querySelectorAll('[data-dd-ancient-sheet]').forEach(function(b){b.onclick=function(){openSheet(String(b.getAttribute('data-dd-ancient-sheet')||'default'))}});
  bindNew();
}
function fillAssign(list){var s=q('vipAssignSheet');if(!s)return;var old=s.value;var dst=(Array.isArray(list)?list:[]).filter(function(x){return String(x.id)!=='unassigned'});s.innerHTML='<option value="">Select Destination Sheet</option>'+dst.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name||'Sheet')+' ('+Number(x.rider_count||0)+')</option>'}).join('');if(dst.some(function(x){return String(x.id)===String(old)}))s.value=old;s.style.display='block';s.style.visibility='visible';}
async function fetchSheets(){
  try{var r=await fetch('/api/sheets',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return [];var d=await r.json();if(!Array.isArray(d))return [];window.__ddSheetCache=d;try{sheets=d}catch(e){}renderSheetTabs(d);fillAssign(d);return d}catch(e){return []}
}
async function openSheet(id){
  setSheetSafe(id);
  var host=q('sheetTabs');if(host)host.querySelectorAll('.sheet-tab').forEach(function(b){b.classList.toggle('active',String(b.getAttribute('data-dd-ancient-sheet')||'')===String(id))});
  try{
    var r=await fetch('/api/riders?sheet='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Sheet load failed');
    var d=await r.json();try{rows=Array.isArray(d)?d:[]}catch(e){};
    if(typeof window.render==='function')window.render();
    fetchSheets();
  }catch(e){if(typeof toast==='function')toast('Sheet error: '+e.message)}
}
async function createSheet(){
  if(currentRoleSafe()!=='admin')return;
  var name=await window.ddCreateSheetNameDialog();if(name===false||!String(name||'').trim())return;
  try{
    var r=await fetch('/api/sheets',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:String(name).trim()})});
    var d=await r.json();if(!r.ok)throw Error(d&&d.error||'Sheet creation failed');
    setSheetSafe(d.id);await fetchSheets();await openSheet(String(d.id));if(typeof toast==='function')toast('Sheet created successfully');
  }catch(e){if(typeof toast==='function')toast('Sheet error: '+e.message)}
}
function bindNew(){var b=q('ddAncientNewSheet');if(b)b.onclick=createSheet}
window.ddAncientRefreshSheets=fetchSheets;window.ddAncientOpenSheet=openSheet;window.ddAncientNewSheet=createSheet;
function installSheets(){fetchSheets();bindNew()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSheets);else installSheets();
[250,800,1600,3000,5000].forEach(function(t){setTimeout(fetchSheets,t)});

/* Replace the logout dialog with a themed animated confirmation. */
window.doLogout=async function(){
  if(q('ddAncientLogout'))return;
  var wrap=document.createElement('div');wrap.id='ddAncientLogout';
  wrap.innerHTML='<div class="dd-logout-card"><div class="dd-sparks"><i></i><i></i><i></i><i></i></div><div class="dd-logout-ring">⎋</div><h3>Leave Daily Drive?</h3><p>Your session will be signed out securely. You can return anytime with your account.</p><div class="dd-logout-actions"><button type="button" class="dd-logout-cancel" id="ddLogoutCancel">Stay Logged In</button><button type="button" class="dd-logout-confirm" id="ddLogoutConfirm">Logout</button></div></div>';
  document.body.appendChild(wrap);
  function close(){wrap.style.animation='ddFadeIn .16s ease reverse both';setTimeout(function(){wrap.remove()},140)}
  q('ddLogoutCancel').onclick=close;
  wrap.addEventListener('click',function(e){if(e.target===wrap)close()});
  q('ddLogoutConfirm').onclick=async function(){
    q('ddLogoutConfirm').disabled=true;q('ddLogoutConfirm').textContent='Signing Out…';
    try{await fetch('/api/logout',{method:'POST',credentials:'same-origin'})}catch(e){}
    try{localStorage.removeItem('dd_current_sheet')}catch(e){}
    close();setTimeout(function(){if(typeof showLogin==='function')showLogin()},150);
  };
};
})();


/* ===== finalSheetSyncFixHtml ===== */

(function(){
  'use strict';
  function qs(id){return document.getElementById(id)}
  function safeRole(){try{return String(typeof currentRole!=='undefined'?currentRole:(window.currentRole||''))}catch(e){return String(window.currentRole||'')}}
  function setCurrent(id){try{currentSheetId=String(id)}catch(e){};window.currentSheetId=String(id);try{localStorage.setItem('dd_current_sheet',String(id))}catch(e){}}
  function escX(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  async function syncSheets(){
    try{
      const r=await fetch('/api/sheets',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)return [];
      const data=await r.json(); if(!Array.isArray(data))return [];
      window.__ddSheetCache=data;
      try{sheets=data}catch(e){}
      const host=qs('sheetTabs');
      if(host){
        const cur=(typeof currentSheetId!=='undefined'?String(currentSheetId):(window.currentSheetId||'default'));
        host.innerHTML=data.map(function(x){const id=String(x.id||''),name=escX(x.name||'Sheet');return '<button type="button" class="sheet-tab '+(id===cur?'active':'')+'" data-dd-sheet-id="'+escX(id)+'"><span>'+name+'</span><small>('+Number(x.rider_count||0)+')</small></button>'}).join('')+((/\b(admin|administrator|superadmin|superuser)\b/i.test(safeRole()))?'<button type="button" class="sheet-tab new-sheet-tab" id="ddFinalNewSheet">＋ New Sheet</button>':'');
        host.querySelectorAll('[data-dd-sheet-id]').forEach(function(btn){btn.onclick=function(){const id=btn.getAttribute('data-dd-sheet-id');setCurrent(id);if(typeof window.ddAncientOpenSheet==='function')window.ddAncientOpenSheet(id);else if(typeof window.ddSwitchSheet==='function')window.ddSwitchSheet(id)}});
        const nb=qs('ddFinalNewSheet'); if(nb)nb.onclick=window.addSheet;
      }
      const sel=qs('vipAssignSheet');
      if(sel){const old=sel.value;sel.innerHTML='<option value="">Select Destination Sheet</option>'+data.filter(function(x){return String(x.id)!=='unassigned'}).map(function(x){return '<option value="'+escX(x.id)+'">'+escX(x.name||'Sheet')+' ('+Number(x.rider_count||0)+')</option>'}).join('');if(Array.from(sel.options).some(function(o){return o.value===old}))sel.value=old}
      return data;
    }catch(e){return []}
  }
  window.ddCreateSheetNameDialog=async function(){
    try{
      if(typeof openUI3D==='function'){
        return await openUI3D({icon:'＋',title:'Create New Sheet',message:'New sheet ka naam enter karein. Ye permanently save hoga.',value:'',placeholder:'e.g. Rawalpindi Riders',maxLength:80,confirmText:'Create Sheet'});
      }
    }catch(e){}
    return new Promise(function(resolve){
      var old=document.getElementById('ddSheetNameModal'); if(old)old.remove();
      var w=document.createElement('div'); w.id='ddSheetNameModal';
      w.innerHTML='<div class="dd-sheet-modal-card"><div class="dd-sheet-modal-icon">＋</div><div class="dd-sheet-modal-title">Create New Sheet</div><div class="dd-sheet-modal-text">New sheet ka naam enter karein.</div><input id="ddSheetNameInput" maxlength=80 placeholder="e.g. Rawalpindi Riders"><div class="dd-sheet-modal-actions"><button type="button" id="ddSheetCancel">Cancel</button><button type="button" id="ddSheetCreate">Create Sheet</button></div></div>';
      document.body.appendChild(w);
      var close=function(v){w.remove();resolve(v)};
      w.querySelector('#ddSheetCancel').onclick=function(){close(false)};
      w.querySelector('#ddSheetCreate').onclick=function(){close(String(w.querySelector('#ddSheetNameInput').value||''))};
      w.addEventListener('click',function(e){if(e.target===w)close(false)});
      var inp=w.querySelector('#ddSheetNameInput'); inp.focus();
      inp.addEventListener('keydown',function(e){if(e.key==='Enter')w.querySelector('#ddSheetCreate').click();if(e.key==='Escape')close(false)});
    });
  };
  async function createSheetFinal(){
    if(!/^(admin|administrator|superadmin|superuser)$/i.test(safeRole().trim()))return;
    const name=await window.ddCreateSheetNameDialog();
    if(!name||!String(name).trim())return;
    try{
      const r=await fetch('/api/sheets',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:String(name).trim()})});
      const d=await r.json(); if(!r.ok)throw Error(d&&d.error||'Sheet creation failed');
      const id=String(d.id||''); setCurrent(id);
      await syncSheets();
      if(typeof window.ddAncientOpenSheet==='function') await window.ddAncientOpenSheet(id);
      else if(typeof window.ddSwitchSheet==='function') await window.ddSwitchSheet(id);
      await syncSheets();
      if(typeof toast==='function')toast('Sheet created successfully');
    }catch(e){if(typeof toast==='function')toast('Sheet error: '+e.message)}
  }
  window.addSheet=createSheetFinal;
  window.createSheet=createSheetFinal;
  function boot(){syncSheets()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  [300,1000,2000,4000].forEach(function(t){setTimeout(syncSheets,t)});
})();


/* ===== finalUserPolishHtml ===== */

(function(){
  'use strict';
  function isAdmin(){try{return String(typeof currentRole!=='undefined'?currentRole:(window.currentRole||''))==='admin'}catch(e){return false}}
  function hideAssignForUser(){
    var e=document.getElementById('vipQuickAssign'); if(e&&!isAdmin())e.classList.add('user-hidden');
  }
  function ensureHeaderSticky(){
    document.querySelectorAll('.header,.topbar,.site-header').forEach(function(e){e.style.position='sticky';e.style.top='0px';e.style.zIndex='9000'});
  }
  /* Use the already-available destination-sheet endpoint; refresh current rows once and refresh tab counts in background. */
  window.vipAssignCount=function(){
    if(!isAdmin())return;
    var count=Math.max(1,Math.min(10000,Number(document.getElementById('vipAssignCount')?.value||0)));
    var target=document.getElementById('vipAssignSheet')?.value||'';
    if(!target){if(typeof toast==='function')toast('Select destination sheet');return;}
    var btn=document.querySelector('#vipQuickAssign button'); if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='Assigning…'}
    fetch('/api/riders/assign-sheet-count',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({count:count,targetSheet:target})
    }).then(async function(r){var d=await r.json();if(!r.ok)throw Error(d.error||'Assignment failed');
      if(typeof toast==='function')toast((d.count||0)+' rider(s) moved to '+(d.targetName||'sheet'));
      /* Do not run bootstrap: keep this action extremely light. */
      if(typeof window.ddSwitchSheet==='function')return window.ddSwitchSheet((typeof currentSheetId!=='undefined'?String(currentSheetId):'default')).then(function(){return d});
      if(typeof load==='function')return load().then(function(){return d});
      return d;
    }).then(function(){
      /* Background tab-count refresh only. */
      return fetch('/api/sheets',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
        if(Array.isArray(d)){sheets=d;if(typeof window.ddRenderSheetsFast==='function')window.ddRenderSheetsFast();if(typeof window.finalFillSheetSelects==='function')window.finalFillSheetSelects();}
      }).catch(function(){});
    }).catch(function(e){if(typeof toast==='function')toast('Assignment error: '+e.message)}).finally(function(){if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'Assign Riders'}});
  };
  hideAssignForUser();ensureHeaderSticky();
  document.addEventListener('DOMContentLoaded',function(){hideAssignForUser();ensureHeaderSticky()});
  [100,500,1200,2500].forEach(function(t){setTimeout(function(){hideAssignForUser();ensureHeaderSticky()},t)});
})();


/* ===== finalStickySingleScrollFix ===== */

(function(){
  'use strict';
  function role(){
    try{if(typeof currentRole!=='undefined' && currentRole)return String(currentRole).toLowerCase()}catch(e){}
    try{if(window.currentRole)return String(window.currentRole).toLowerCase()}catch(e){}
    var rp=document.getElementById('roleName');
    if(rp && /admin/i.test(rp.textContent||''))return 'admin';
    return '';
  }
  function sync(){
    var a=document.getElementById('vipQuickAssign'); if(!a)return;
    if(/^(admin|administrator|superadmin|superuser)$/i.test(role())){a.classList.remove('dd-user-hidden','user-hidden');a.style.setProperty('display','flex','important');}
    else {a.classList.add('dd-user-hidden');}
    document.querySelectorAll('.header,.topbar,.site-header').forEach(function(h){h.style.setProperty('position','sticky','important');h.style.top='0px';h.style.zIndex='9500';});
  }
  sync();
  document.addEventListener('DOMContentLoaded',sync);
  [50,200,500,1000,2000].forEach(function(t){setTimeout(sync,t)});
})();


/* ===== finalAssignSheetFixV25 ===== */

(function(){
  'use strict';
  function admin(){
    try{if(typeof currentRole!=='undefined' && /^(admin|administrator|superadmin|superuser)$/i.test(String(currentRole).trim()))return true}catch(e){}
    try{if(window.currentRole && /^(admin|administrator|superadmin|superuser)$/i.test(String(window.currentRole).trim()))return true}catch(e){}
    var rn=document.getElementById('roleName');
    return !!(rn && /^(admin|administrator|superadmin|superuser)$/i.test((rn.textContent||'').trim()));
  }
  function fill(list){
    var a=document.getElementById('vipAssignSheet');
    var b=document.getElementById('assignTarget');
    if(!Array.isArray(list))return;
    var dst=list.filter(function(x){return x && String(x.id)!=='unassigned'});
    var html='<option value="">Select Destination Sheet</option>'+dst.map(function(x){return '<option value="'+String(x.id).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')+'">'+String(x.name||'Sheet').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')+' ('+Number(x.rider_count||0)+')</option>'}).join('');
    if(a){var av=a.value;a.innerHTML=html;if(dst.some(function(x){return String(x.id)===String(av)}))a.value=av;}
    if(b){var bv=b.value;b.innerHTML=html;if(dst.some(function(x){return String(x.id)===String(bv)}))b.value=bv;}
  }
  function load(){
    if(!admin())return;
    fetch('/api/sheets',{credentials:'same-origin',cache:'no-store'})
      .then(function(r){if(!r.ok)throw Error('sheet list');return r.json()})
      .then(fill).catch(function(){});
  }
  function run(){
    if(!admin())return;
    var a=document.getElementById('vipQuickAssign'); if(a){a.classList.remove('dd-user-hidden','user-hidden');a.style.display='flex';a.style.visibility='visible';a.style.opacity='1';}
    load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  [150,500,1200,2500,5000].forEach(function(t){setTimeout(run,t)});
  try{new MutationObserver(function(){
    var a=document.getElementById('vipAssignSheet');
    if(a && a.options.length<=1)run();
  }).observe(document.body,{subtree:true,childList:true});}catch(e){}
  window.ddForceAssignSheetRefresh=run;
})();


/* ===== finalAssignPanelV26 ===== */

(function(){
'use strict';
function A(id){return document.getElementById(id)}
function isAdmin(){
  try{if(typeof currentRole!=='undefined' && /^(admin|administrator|superadmin|superuser)$/i.test(String(currentRole).trim()))return true}catch(e){}
  var r=A('roleName'); return !!(r && /^(admin|administrator|superadmin|superuser)$/i.test((r.textContent||'').trim()));
}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
async function loadSheets(){
  if(!isAdmin())return;
  var panel=A('ddAssignPanelV26'); if(!panel)return;
  try{
    var r=await fetch('/api/sheets',{credentials:'same-origin',cache:'no-store'}); if(!r.ok)throw Error('Failed to load sheets');
    var list=await r.json(); if(!Array.isArray(list))list=[];
    var dst=list.filter(function(x){return x && String(x.id)!=='unassigned'});
    var sel=A('ddAssignSelectV26'); if(sel)sel.innerHTML='<option value="">Select Destination Sheet</option>'+dst.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name||'Sheet')+' ('+Number(x.rider_count||0)+')</option>'}).join('');
    panel.classList.add('show');
  }catch(e){panel.classList.add('show')}
}
async function assign(){
  if(!isAdmin())return;
  var sel=A('ddAssignSelectV26'), cnt=A('ddAssignCountV26'), btn=A('ddAssignBtnV26');
  var target=sel&&sel.value, count=Math.max(1,Math.min(10000,Number(cnt&&cnt.value||0)));
  if(!target){if(typeof toast==='function')toast('Select destination sheet');return}
  if(!Number.isFinite(count)||count<1){if(typeof toast==='function')toast('Enter a valid rider count');return}
  if(btn){btn.disabled=true;btn.textContent='Assigning…'}
  try{
    var r=await fetch('/api/riders/assign-sheet-count',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({count:count,targetSheet:target})});
    var d=await r.json(); if(!r.ok)throw Error(d&&d.error||'Assignment failed');
    if(typeof toast==='function')toast((d.count||0)+' rider(s) moved to '+(d.targetName||'sheet'));
    await loadSheets();
    if(typeof load==='function')await load();
    else if(typeof window.ddSwitchSheet==='function')await window.ddSwitchSheet(String(currentSheetId||'default'));
  }catch(e){if(typeof toast==='function')toast('Assignment error: '+e.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='Assign Riders → Sheet'}}
}
function install(){
  if(!isAdmin())return;
  var tabs=A('sheetTabs'); if(!tabs)return;
  var panel=A('ddAssignPanelV26');
  if(!panel){
    panel=document.createElement('div');panel.id='ddAssignPanelV26';
    panel.innerHTML='<span class="dd-ap-label">👥 Assign Riders:</span><input id="ddAssignCountV26" class="dd-ap-count" type="number" min="1" max="10000" value="10"><select id="ddAssignSelectV26" class="dd-ap-select"><option value="">Select Destination Sheet</option></select><button type="button" id="ddAssignBtnV26" class="dd-ap-btn">Assign Riders → Sheet</button>';
    tabs.insertAdjacentElement('afterend',panel);
    A('ddAssignBtnV26').onclick=assign;
  }
  /* Hide all legacy duplicate assignment rows; this panel is authoritative for admin. */
  /* Keep the legacy Quick Assign menu available for Admin; Users are hidden by the role guard. */
  loadSheets();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
[250,800,1600,3000].forEach(function(t){setTimeout(install,t)});
window.ddAssignPanelRefreshV26=loadSheets;
})();


/* ===== finalQuickAssignRoleFixV30 ===== */

(function(){
'use strict';
function role(){
  var vals=[];
  try{if(typeof currentRole!=='undefined'&&currentRole)vals.push(currentRole)}catch(e){}
  try{if(window.currentRole)vals.push(window.currentRole)}catch(e){}
  var rn=document.getElementById('roleName');
  if(rn&&rn.textContent)vals.push(rn.textContent);
  return vals.join(' ').toLowerCase().trim();
}
function admin(){return /\b(admin|administrator|superadmin|superuser)\b/i.test(role())}
function sync(){
  var a=document.getElementById('vipQuickAssign');
  if(a){
    if(admin()){
      a.classList.remove('dd-user-hidden','user-hidden');
      a.classList.add('dd-admin-visible');
      a.style.setProperty('display','flex','important');
      a.style.setProperty('visibility','visible','important');
      a.style.setProperty('opacity','1','important');
      a.removeAttribute('aria-hidden');
    }else{
      a.classList.remove('dd-admin-visible');
      a.classList.add('dd-user-hidden');
      a.style.setProperty('display','none','important');
      a.setAttribute('aria-hidden','true');
    }
  }
  var panel=document.getElementById('ddAssignPanelV26');
  if(panel){if(admin())panel.classList.add('show');else panel.classList.remove('show');}
}
function run(){sync();}
run();
document.addEventListener('DOMContentLoaded',run);
[50,150,300,600,1200,2500,5000].forEach(function(t){setTimeout(run,t)});
/* Attribute observer removed to prevent an endless sync loop while inline style/class are being changed. */
window.ddQuickAssignRoleRefreshV30=run;
})();


/* ===== quickAssignLayoutV31 ===== */

(function(){
  'use strict';
  function getRole(){
    var vals=[];
    try{if(typeof currentRole!=='undefined'&&currentRole)vals.push(currentRole)}catch(e){}
    try{if(window.currentRole)vals.push(window.currentRole)}catch(e){}
    var r=document.getElementById('roleName');
    if(r&&r.textContent)vals.push(r.textContent);
    return vals.join(' ').toLowerCase();
  }
  function sync(){
    var admin=/\b(admin|administrator|superadmin|superuser)\b/i.test(getRole());
    if(admin) document.body.classList.add('role-admin');
    else document.body.classList.remove('role-admin');
    var a=document.getElementById('vipQuickAssign');
    if(!a)return;
    if(admin){
      a.classList.remove('dd-user-hidden','user-hidden');
      a.classList.add('dd-admin-visible');
      a.style.removeProperty('display');
      a.style.setProperty('display','flex','important');
      a.style.setProperty('visibility','visible','important');
      a.style.setProperty('opacity','1','important');
      a.removeAttribute('aria-hidden');
    }else{
      a.classList.remove('dd-admin-visible');
      a.classList.add('dd-user-hidden');
      a.style.setProperty('display','none','important');
      a.setAttribute('aria-hidden','true');
    }
  }
  function run(){try{sync()}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  [50,150,300,600,1000,2000,4000].forEach(function(t){setTimeout(run,t)});
  window.ddQuickAssignLayoutRefreshV31=run;
})();


/* ===== V35 compact dashboard action row ===== */
(function(){
  'use strict';
  function moveDashboardActions(){
    var vc=document.querySelector('.viewbar-controls');
    if(!vc)return;
    var map=[
      ['.action.import','dd-portable-import','⇧','Import'],
      ['.action.save','dd-portable-export','⇩','Export'],
      ['.action.print','dd-portable-print','▣','Print']
    ];
    map.forEach(function(item){
      var source=document.querySelector(item[0]);
      if(!source||source.classList.contains('dd-moved'))return;
      source.classList.add('dd-moved');
      var b=document.createElement('button');
      b.type='button';
      b.className='dd-portable-action '+item[1];
      b.innerHTML='<span class="dd-portable-icon">'+item[2]+'</span><span>'+item[3]+'</span>';
      b.title=source.querySelector('b')?.textContent||item[3];
      if(item[3]==='Import'){
        b.onclick=function(){
          var f=document.getElementById('file');
          if(f)f.click();
        };
      }else if(item[3]==='Export'){
        b.onclick=function(){if(typeof exportX==='function')exportX();};
      }else{
        b.onclick=function(){window.print();};
      }
      var newSheet=document.getElementById('ddRefNewSheet');
      if(newSheet)vc.insertBefore(b,newSheet);else vc.appendChild(b);
    });
  }
  function run(){try{moveDashboardActions()}catch(e){console.error('Dashboard action row:',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  [100,400,900,1800,3500].forEach(function(t){setTimeout(run,t)});
  window.ddCompactActionRowRefresh=run;
})();
