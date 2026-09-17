
(function(){
  function getSheets(){try{return Array.isArray(sheets)?sheets:[]}catch(e){return[]}}
  function escLocal(v){try{return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]))}catch(e){return String(v??'')}}
  function drawSheets(){
    const el=document.getElementById('sheetTabs'); if(!el)return false;
    const list=getSheets(); if(!list.length)return false;
    const active=String(typeof currentSheetId!=='undefined'?currentSheetId:'');
    el.innerHTML=list.map((x,i)=>{
      const id=String(x.id??''); const name=String(x.name||('Sheet '+(i+1)));
      return '<button type="button" class="sheet-tab '+(id===active?'active':'')+'" data-dd-sheet="'+escLocal(id)+'"><span>'+escLocal(name)+'</span> <small>('+Number(x.rider_count||0)+')</small></button>';
    }).join('')+(typeof currentRole!=='undefined'&&currentRole==='admin'?'<button type="button" class="sheet-tab new-sheet-tab" onclick="addSheet()">＋ New Sheet</button>':'');
    el.querySelectorAll('[data-dd-sheet]').forEach(btn=>btn.addEventListener('click',function(){
      const id=this.getAttribute('data-dd-sheet');
      if(typeof window.ddSwitchSheet==='function')window.ddSwitchSheet(id);
      else if(typeof window.switchSheet==='function')window.switchSheet(id);
    }));
    return true;
  }
  function drawAssignTarget(){
    const el=document.getElementById('assignTarget'); if(!el)return;
    const list=getSheets(); if(!list.length)return;
    const old=el.value;
    el.innerHTML='<option value="">Select Destination Sheet</option>'+list.map(x=>'<option value="'+escLocal(x.id)+'">'+escLocal(x.name||'Sheet')+' ('+Number(x.rider_count||0)+')</option>').join('');
    if(list.some(x=>String(x.id)===old))el.value=old;
  }
  async function refreshSheets(){
    try{
      const r=await fetch('/api/sheets',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)return false;
      const data=await r.json();
      if(!Array.isArray(data)||!data.length)return false;
      sheets=data;
      if(typeof currentSheetId==='undefined'||!data.some(x=>String(x.id)===String(currentSheetId))){currentSheetId=String(data[0].id)}
      drawSheets();drawAssignTarget();
      return true;
    }catch(e){return false}
  }
  function styleUI(){
    drawSheets();drawAssignTarget();
    const b=document.querySelector('#vipQuickAssign button'); if(b)b.classList.add('dd-pro-assign');
  }
  document.addEventListener('DOMContentLoaded',function(){
    styleUI();
    refreshSheets().then(styleUI);
    [400,1000,2000,4000].forEach(ms=>setTimeout(()=>{styleUI();refreshSheets().then(styleUI)},ms));
  });
  let n=0; const t=setInterval(async()=>{n++; if(drawSheets())drawAssignTarget(); else await refreshSheets(); if(n>25)clearInterval(t)},1200);
})();
