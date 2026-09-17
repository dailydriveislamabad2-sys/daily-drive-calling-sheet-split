
// Final robust overrides: modern rename uses the same working 3D dialog as Create/Delete.
(function(){
  const role=()=>{try{return (typeof currentRole!=='undefined'?currentRole:window.currentRole)||''}catch(e){return window.currentRole||''}};
  window.renameCurrentSheet=async function(){
    if(role()!=='admin')return;
    const list=(typeof sheets!=='undefined'?sheets:window.sheets||[]);
    const id=(typeof currentSheetId!=='undefined'?currentSheetId:window.currentSheetId)||'default';
    const s=list.find(x=>x.id===id); if(!s)return;
    const v=await openUI3D({icon:'✏',title:'Rename Sheet',message:'Sheet ka naya naam enter karein. Ye permanently save hoga.',value:s.name||'',placeholder:'Enter sheet name',maxLength:80,confirmText:'Save Name'});
    if(v===false)return; const name=String(v||'').trim(); if(!name||name===s.name)return;
    try{await api('/api/sheets/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({name})});await loadSheets();toast('Sheet renamed successfully')}catch(e){toast('Rename error: '+e.message)}
  };
})();
