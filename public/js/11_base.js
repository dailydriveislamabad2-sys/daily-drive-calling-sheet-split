
(function(){
  function bootData(){return window.__DD_BOOT__||null}

  function fillAssignUsers(){
    const sel=document.getElementById('vipAssignUser');
    const b=bootData();
    if(!sel || !b || !Array.isArray(b.users) || sel.dataset.bootFilled==='1')return;
    sel.innerHTML='<option value="">Select User</option>';
    b.users.forEach(u=>{
      const o=document.createElement('option');
      o.value=u.username;
      o.textContent=u.username+' ('+u.role+')';
      sel.appendChild(o);
    });
    sel.dataset.bootFilled='1';
  }

  function renderBootSheets(){
    const b=bootData();
    if(!b || !Array.isArray(b.sheets) || !b.sheets.length)return false;
    sheets=b.sheets;
    const saved=localStorage.getItem('dd_current_sheet');
    currentSheetId=(saved && sheets.some(x=>String(x.id)===String(saved)))
      ? String(saved) : String(b.currentSheetId||sheets[0].id||'default');
    localStorage.setItem('dd_current_sheet',currentSheetId);

    const tabs=document.getElementById('sheetTabs');
    if(tabs && typeof renderSheets==='function')renderSheets();
    else if(tabs){
      tabs.innerHTML=sheets.map(x=>`<button type="button" class="sheet-tab ${String(x.id)===String(currentSheetId)?'active':''}" onclick="switchSheet('${String(x.id).replace(/'/g,"&#39;")}')"><span>${String(x.name||'Sheet')}</span><small>(${Number(x.rider_count||0)})</small></button>`).join('')+
        (typeof currentRole!=='undefined'&&currentRole==='admin'?'<button type="button" class="sheet-tab new-sheet-tab" onclick="addSheet()">＋ New Sheet</button>':'');
    }

    if(Array.isArray(b.riders) && String(b.currentSheetId||'')===String(currentSheetId)){
      rows=b.riders;
      if(typeof render==='function')render();
    }
    return true;
  }

  window.vipAssignCount=async function(){
    if(typeof currentRole==='undefined'||currentRole!=='admin')return;
    const count=Math.max(1,Math.min(10000,Number(document.getElementById('vipAssignCount')?.value||0)));
    const username=document.getElementById('vipAssignUser')?.value||'';
    if(!username){toast('Select a user first');return}
    try{
      const d=await api('/api/riders/assign-user-count',{method:'POST',body:JSON.stringify({count,username,sheetId:currentSheetId})});
      toast(d.count?`${d.count} riders assigned to ${username}`:`No unassigned riders available`);
      if(typeof load==='function')await load();
      if(typeof loadSheets==='function')await loadSheets();
    }catch(e){toast('Bulk user assignment error: '+e.message)}
  };

  window.switchSheet=async function(id){
    currentSheetId=String(id||'default');
    localStorage.setItem('dd_current_sheet',currentSheetId);
    ['search','filter','dateFilter'].forEach(k=>{const e=document.getElementById(k);if(e)e.value=''});
    try{
      if(typeof load==='function')await load();
      if(typeof renderSheets==='function')renderSheets();
    }catch(e){toast('Sheet error: '+e.message)}
  };

  // Server boot is the source of truth. No repeated /api/sheets race.
  let tries=0;
  const timer=setInterval(()=>{
    const ok=renderBootSheets();
    fillAssignUsers();
    tries++;
    if(ok && (currentRole!=='admin' || document.getElementById('vipAssignUser')?.dataset.bootFilled==='1') && tries>4)clearInterval(timer);
    if(tries>40)clearInterval(timer);
  },200);

  document.addEventListener('DOMContentLoaded',()=>{
    renderBootSheets();
    fillAssignUsers();
    [300,1000,2500].forEach(ms=>setTimeout(()=>{renderBootSheets();fillAssignUsers()},ms));
  });
})();
