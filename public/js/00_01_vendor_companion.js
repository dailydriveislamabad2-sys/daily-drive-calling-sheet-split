
let rename3dId=null;
async function openRename3D(id){
 if(currentRole!=='admin')return;
 const s=sheets.find(x=>x.id===id); if(!s)return;
 const name=await openUI3D({icon:'✏',title:'Rename Sheet',message:'Sheet ka naya naam enter karein. Ye permanently save hoga.',value:s.name||'',placeholder:'Enter sheet name',maxLength:80,confirmText:'Save Name'});
 if(name===false||!String(name||'').trim())return;
 const n=String(name).trim();
 if(n===s.name)return;
 try{await api('/api/sheets/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({name:n})});await loadSheets();toast('Sheet renamed successfully')}catch(e){toast('Rename error: '+e.message)}
}
function closeRename3D(){}
async function saveRename3D(){return false}
function renameSheetById(id){openRename3D(id)}
function renameCurrentSheet(){openRename3D(currentSheetId)}
