
(function(){
  let riderSort=localStorage.getItem('dd_rider_sort')||'';
  window.setSort=function(v){if(getRole()!=='admin')return;riderSort=v||'';localStorage.setItem('dd_rider_sort',riderSort);if(typeof render==='function')render()};
  window.sortRows=function(list){const a=list.slice();if(!riderSort)return a;const [field,dir]=riderSort.split('-');const val=r=>{if(field==='name')return String(r.name||'').toLowerCase();if(field==='last'){const d=lastRideDate(r);return d?d.getTime():Number.MAX_SAFE_INTEGER}if(field==='next')return r.next?new Date(r.next+'T00:00:00').getTime():Number.MAX_SAFE_INTEGER;return String(r[field]??'').toLowerCase()};a.sort((x,y)=>{const A=val(x),B=val(y),c=A<B?-1:A>B?1:0;return dir==='desc'?-c:c});return a};
  const oldRender=window.render; if(oldRender)window.render=function(){const saved=rows;rows=window.sortRows(rows);try{return oldRender()}finally{rows=saved}};
  function getRole(){try{return (typeof currentRole!=='undefined'?currentRole:window.currentRole)||''}catch(e){return window.currentRole||''}}
  window.getRole=getRole;
  window.renameCurrentSheet=async function(){
    if(getRole()!=='admin')return;
    const s=(typeof sheets!=='undefined'?sheets:window.sheets||[]).find(x=>x.id===(typeof currentSheetId!=='undefined'?currentSheetId:window.currentSheetId));
    if(!s)return;
    const value=await openUI3D({icon:'✏',title:'Rename Sheet',message:'Sheet ka naya naam enter karein. Ye naam permanently save hoga.',value:s.name||'',placeholder:'Enter sheet name',maxLength:80,confirmText:'Save Name'});
    if(value===false)return;
    const name=String(value||'').trim(); if(!name||name===s.name)return;
    try{await api('/api/sheets/'+encodeURIComponent(s.id),{method:'PUT',body:JSON.stringify({name})});await loadSheets();toast('Sheet renamed successfully')}catch(e){toast('Rename error: '+e.message)}
  };
  window.renameSheetById=async function(id){
    if(getRole()!=='admin')return;
    const s=(typeof sheets!=='undefined'?sheets:window.sheets||[]).find(x=>x.id===id); if(!s)return;
    const value=await openUI3D({icon:'✏',title:'Rename Sheet',message:'Sheet ka naya naam enter karein. Ye naam permanently save hoga.',value:s.name||'',placeholder:'Enter sheet name',maxLength:80,confirmText:'Save Name'});
    if(value===false)return; const name=String(value||'').trim(); if(!name||name===s.name)return;
    try{await api('/api/sheets/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({name})});await loadSheets();toast('Sheet renamed successfully')}catch(e){toast('Rename error: '+e.message)}
  };
})();
